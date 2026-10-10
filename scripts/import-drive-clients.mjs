/**
 * One-time, owner-authorized import into the already-running Jornada Blob.
 * Does not deploy or change any other service. Never prints client details.
 */
import { get, put, BlobPreconditionFailedError } from '@vercel/blob';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { verifyJornadaLink } from './verify-jornada-link.mjs';
import { prepareClientImport } from './import-client-merge.mjs';

const MAX_FILE_BYTES = 160_000;
const STATE_PATH = 'jornada/state.json';

function requireBackup() {
  const folder = join(homedir(), 'Jornada-Backups');
  let hasBackup = false;
  try {
    hasBackup = readdirSync(folder).some(name => {
      if (!name.endsWith('.jbackup')) return false;
      const st = statSync(join(folder, name));
      return st.isFile() && st.size > 80;
    });
  } catch { /* Fail closed. */ }
  if (!hasBackup) throw new Error('JORNADA_VERIFIED_BACKUP_FILE_REQUIRED');
}

async function main() {
  verifyJornadaLink();
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('JORNADA_BLOB_TOKEN_UNAVAILABLE');
  requireBackup();

  const filename = process.argv[2];
  if (!filename || !/\.((json)|(txt))$/i.test(filename)) {
    throw new Error('JORNADA_IMPORT_FILE_REQUIRED');
  }
  const file = resolve(filename);
  if (statSync(file).size > MAX_FILE_BYTES) throw new Error('JORNADA_IMPORT_FILE_TOO_LARGE');

  const pkg = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  const res = await get(STATE_PATH, { access: 'private', useCache: false });
  if (res?.statusCode !== 200 || !res.stream || !res.blob?.etag) {
    throw new Error('JORNADA_STATE_OR_ETAG_NOT_AVAILABLE');
  }
  const state = JSON.parse(await new Response(res.stream).text());
  const plan = prepareClientImport(state, pkg);
  if (plan.alreadyApplied) {
    console.log(JSON.stringify({ status: 'JORNADA_CLIENTS_ALREADY_IMPORTED',
      batchId: pkg.batchId, noChanges: true }));
    return;
  }
  const counts = Object.fromEntries(Object.entries(plan.summary).map(([key, v]) =>
    [key, { added: v.added, updated: v.updated }]));
  console.log(JSON.stringify({ status: 'JORNADA_CLIENTS_IMPORT_PLAN',
    batchId: pkg.batchId, collections: counts, noFinancialCollections: true }));

  if (process.argv[3] !== '--apply') {
    console.log('DRY_RUN_ONLY: nenhuma informação foi alterada.');
    return;
  }
  // The single state write is conditional on the exact version read above.
  // A concurrent customer edit is never silently lost.
  try {
    await put(STATE_PATH, JSON.stringify(plan.state), {
      access: 'private',
      allowOverwrite: true,
      ifMatch: res.blob.etag,
      addRandomSuffix: false,
      contentType: 'application/json',
    });
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) {
      throw new Error('JORNADA_IMPORT_CONCURRENT_CHANGE_ABORTED');
    }
    throw error;
  }
  console.log(JSON.stringify({ status: 'JORNADA_CLIENTS_IMPORTED',
    batchId: pkg.batchId, collections: counts, otherProjectsTouched: false,
    deployed: false }));
}

main().catch(error => {
  // Never print unexpected provider messages containing private values.
  const msg = error instanceof Error ? error.message : '';
  console.error(/^JORNADA_/.test(msg) ? msg : 'JORNADA_CLIENTS_IMPORT_FAILED');
  process.exitCode = 1;
});
