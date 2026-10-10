/** Read-only local backup launcher: no deploy, no Blob writes, no env export. */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyJornadaLink, EXPECTED_PROJECT_ID, EXPECTED_TEAM_ID } from './verify-jornada-link.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  verifyJornadaLink(root);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'PROJECT_MISMATCH');
  process.exit(4);
}
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = [
  '--yes', 'vercel', '--scope', 'pizzaria-sao-francisco-contingencia',
  'env', 'run', '--environment', 'production',
  '--', 'node', 'scripts/backup-blob.mjs',
];
const result = spawnSync(command, args, {
  cwd: root, stdio: 'inherit', shell: process.platform === 'win32',
  env: {
    ...process.env,
    VERCEL_PROJECT_ID: EXPECTED_PROJECT_ID,
    VERCEL_ORG_ID: EXPECTED_TEAM_ID,
    VERCEL_TELEMETRY_DISABLED: '1',
  },
  timeout: 180_000,
});
if (result.error) {
  console.error('VERCEL_CLI_BACKUP_FAILED');
  process.exit(5);
}
process.exit(result.status ?? 5);
