import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { verifyJornadaLink, EXPECTED_PROJECT_ID, EXPECTED_TEAM_ID } from './verify-jornada-link.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
try {
  verifyJornadaLink(root);
} catch {
  console.error('JORNADA_WRONG_PROJECT_BLOCKED');
  process.exit(4);
}
let file = process.argv[2];
if (!file) {
  const folder = join(homedir(), 'Downloads');
  let matching = [];
  try {
    matching = readdirSync(folder).filter(name => {
      const norm = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const isApprovedName =
        norm === 'jornada-clientes-v2.json' ||
        norm === 'jornada-clientes-v2.txt' ||
        norm.includes('clientes e evolucao v2');
      return isApprovedName && /\.(json|txt)$/i.test(name) &&
        statSync(join(folder, name)).isFile();
    }).map(name => join(folder, name));
  } catch { /* Missing folder: fail closed. */ }
  if (matching.length !== 1) {
    console.error('JORNADA_DOWNLOAD_ONE_PRIVATE_CLIENT_FILE_REQUIRED');
    process.exit(4);
  }
  file = matching[0];
}
const cli = process.platform === 'win32' ? 'npx.cmd' : 'npx';
console.log('JORNADA_IMPORT_START: somente clientes e evolução, sem deploy.');
const args = [
  '--yes', 'vercel', '--scope', 'pizzaria-sao-francisco-contingencia',
  'env', 'run', '--environment', 'production', '--',
  'node', 'scripts/import-drive-clients.mjs', file, '--apply',
];
const result = spawnSync(cli, args, {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    VERCEL_PROJECT_ID: EXPECTED_PROJECT_ID,
    VERCEL_ORG_ID: EXPECTED_TEAM_ID,
    VERCEL_TELEMETRY_DISABLED: '1',
  },
  timeout: 120_000,
});
if (result.error || result.signal) {
  console.error('JORNADA_IMPORT_CLI_FAILED');
  process.exit(5);
}
console.log('JORNADA_IMPORT_EXIT=' + String(result.status ?? 5));
process.exit(result.status ?? 5);
