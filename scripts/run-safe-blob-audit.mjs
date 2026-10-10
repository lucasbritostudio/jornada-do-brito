/**
 * Executes only a read-only local audit. No deployment, previews, CI jobs,
 * credential export, .env files or Blob mutations. Requires an existing
 * authenticated Vercel CLI session and an exactly linked Jornada project.
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyJornadaLink, EXPECTED_PROJECT_ID, EXPECTED_TEAM_ID } from './verify-jornada-link.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  verifyJornadaLink(root);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'LINK_CHECK_FAILED');
  process.exit(4);
}

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = [
  '--yes', 'vercel', '--scope', 'pizzaria-sao-francisco-contingencia', 'env', 'run',
  '--environment', 'production',
  '--', 'node', 'scripts/audit-private-blob.mjs',
];
const result = spawnSync(command, args, {
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

if (result.error) {
  console.error('VERCEL_CLI_UNAVAILABLE: verifique a sessão local da Vercel.');
  process.exit(5);
}
process.exit(result.status ?? 5);
