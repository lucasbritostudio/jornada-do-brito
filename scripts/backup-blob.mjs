/**
 * One-time, read-only encrypted export from the already linked Jornada Blob.
 * Never writes to Blob, never outputs raw records, and does not deploy.
 * Usage: node scripts/backup-blob.mjs
 * The official CLI wrapper passes project-scoped credentials in process env.
 */
import { get, list } from '@vercel/blob';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { verifyJornadaLink } from './verify-jornada-link.mjs';
import { createManifest, decryptBackup, encryptManifest } from './backup-crypto.mjs';

const MAX_OBJECTS = 1000;
const MAX_SINGLE_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;

function hiddenPassword(label) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error('BACKUP_NEEDS_INTERACTIVE_TERMINAL');
  }
  process.stdout.write(label);
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const originalRaw = Boolean(input.isRaw);
    let value = '';
    input.setRawMode(true);
    input.setEncoding('utf8');
    input.resume();
    function cleanup() {
      input.off('data', onData);
      input.setRawMode(originalRaw);
      input.pause();
      process.stdout.write('\n');
    }
    function onData(chunk) {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          cleanup();
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          cleanup();
          reject(new Error('BACKUP_CANCELLED'));
          return;
        }
        if (char === '\u007f' || char === '\b') {
          if (value.length) {
            value = [...value].slice(0, -1).join('');
            process.stdout.write('\b \b');
          }
          continue;
        }
        if (char < ' ' || char === '\u007f') continue;
        if (value.length > 256) continue;
        value += char;
        process.stdout.write('*');
      }
    }
    input.on('data', onData);
  });
}

async function readPassphrase() {
  const one = await hiddenPassword('Crie uma senha FORTE para o backup (16+ caracteres): ');
  const two = await hiddenPassword('Digite a mesma senha novamente: ');
  if (one.length < 16) throw new Error('BACKUP_PASSWORD_TOO_SHORT');
  if (one !== two) throw new Error('BACKUP_PASSWORD_MISMATCH');
  return one;
}

async function inventory() {
  let cursor;
  const result = [];
  for (let page = 0; page < 20; page += 1) {
    const data = await list({ prefix: 'jornada/', limit: 1000, ...(cursor ? { cursor } : {}) });
    result.push(...data.blobs.map(({ pathname, size, uploadedAt }) => ({
      pathname, size, uploadedAt: new Date(uploadedAt).toISOString(),
    })));
    if (result.length > MAX_OBJECTS) throw new Error('BACKUP_TOO_MANY_OBJECTS');
    if (!data.hasMore) return result.sort((a, b) => a.pathname.localeCompare(b.pathname));
    if (!data.cursor) throw new Error('BACKUP_PAGINATION_INCOMPLETE');
    cursor = data.cursor;
  }
  throw new Error('BACKUP_PAGINATION_INCOMPLETE');
}

async function run() {
  verifyJornadaLink();
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('BACKUP_CREDENTIAL_MISSING');
  const passphrase = await readPassphrase();
  const before = await inventory();
  if (!before.length) throw new Error('BACKUP_EMPTY_STORE');
  let total = 0;
  const objects = [];
  for (const entry of before) {
    if (!entry.pathname.startsWith('jornada/') || entry.size > MAX_SINGLE_BYTES ||
        !Number.isSafeInteger(entry.size) || entry.size < 0) {
      throw new Error('BACKUP_OBJECT_UNSAFE');
    }
    const file = await get(entry.pathname, { access: 'private', useCache: false });
    if (!file?.stream) throw new Error('BACKUP_READ_FAILED');
    const content = Buffer.from(await new Response(file.stream).arrayBuffer());
    if (content.length !== entry.size) throw new Error('BACKUP_SNAPSHOT_CHANGED');
    total += content.length;
    if (total > MAX_TOTAL_BYTES) throw new Error('BACKUP_TOO_LARGE');
    if (entry.pathname.endsWith('.json')) JSON.parse(content.toString('utf8'));
    objects.push({ pathname: entry.pathname, content });
  }
  const after = await inventory();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('BACKUP_SNAPSHOT_CHANGED');
  const envelope = encryptManifest(createManifest(objects), passphrase);
  const dir = join(homedir(), 'Jornada-Backups');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const date = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const output = join(dir, 'jornada-' + date + '-' + randomBytes(3).toString('hex') + '.jbackup');
  writeFileSync(output, JSON.stringify(envelope), { flag: 'wx', mode: 0o600 });
  const validated = decryptBackup(JSON.parse(readFileSync(output, 'utf8')), passphrase);
  if (validated.objects !== objects.length || validated.totalBytes !== total) {
    throw new Error('BACKUP_VERIFICATION_FAILED');
  }
  console.log(JSON.stringify({
    status: 'ENCRYPTED_BACKUP_VERIFIED',
    project: 'jornada-do-brito', objects: validated.objects,
    bytes: validated.totalBytes, output,
    originalBlobModified: false, restorePerformed: false,
  }, null, 2));
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : 'BACKUP_ERROR';
  // Disallow printing provider response bodies or sensitive file contents.
  console.error(/^(BACKUP_|JORNADA_)/.test(message) ? message : 'BACKUP_OPERATION_FAILED');
  process.exitCode = 1;
});
