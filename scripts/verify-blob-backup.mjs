/** Offline verification only. No credentials, Blob access or deploy. */
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { decryptBackup } from './backup-crypto.mjs';

async function hiddenPassword(label) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new Error('VERIFY_NEEDS_TERMINAL');
  process.stdout.write(label);
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const wasRaw = Boolean(input.isRaw);
    input.setRawMode(true);
    input.setEncoding('utf8');
    input.resume();
    let text = '';
    const done = () => {
      input.off('data', onData);
      input.setRawMode(wasRaw);
      input.pause();
      process.stdout.write('\n');
    };
    const onData = (data) => {
      for (const c of data) {
        if (c === '\r' || c === '\n') { done(); resolve(text); return; }
        if (c === '\u0003') { done(); reject(new Error('VERIFY_CANCELLED')); return; }
        if (c === '\b' || c === '\u007f') {
          if (text.length) { text = [...text].slice(0, -1).join(''); process.stdout.write('\b \b'); }
        } else if (c >= ' ' && text.length < 256) { text += c; process.stdout.write('*'); }
      }
    };
    input.on('data', onData);
  });
}

async function run() {
  const path = process.argv[2];
  if (!path || !path.endsWith('.jbackup')) throw new Error('VERIFY_USE_BACKUP_FILE_PATH');
  const file = resolve(path);
  if (statSync(file).size > 100 * 1024 * 1024) throw new Error('VERIFY_FILE_TOO_LARGE');
  const envelope = JSON.parse(readFileSync(file, 'utf8'));
  const password = await hiddenPassword('Senha do backup: ');
  const result = decryptBackup(envelope, password);
  console.log(JSON.stringify({ status: 'BACKUP_RESTORE_SIMULATION_PASSED',
    objects: result.objects, bytes: result.totalBytes, restoredToBlob: false }));
}
run().catch((error) => {
  const msg = error instanceof Error ? error.message : 'VERIFY_FAILED';
  console.error(msg.startsWith('VERIFY_') ? msg : 'VERIFY_WRONG_PASSWORD_OR_CORRUPTED_BACKUP');
  process.exitCode = 1;
});
