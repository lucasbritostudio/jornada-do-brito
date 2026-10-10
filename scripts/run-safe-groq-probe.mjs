/**
 * A single synthetic Groq diagnostic on the owner's already authenticated PC.
 * Use the local Jornada .env.local created by Vercel. Do not attempt to
 * transfer protected Vercel secrets. Do not deploy or write to Blob.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyJornadaLink, EXPECTED_PROJECT_ID, EXPECTED_TEAM_ID } from './verify-jornada-link.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  verifyJornadaLink(root);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'JORNADA_LINK_CHECK_FAILED');
  process.exit(4);
}
if (!existsSync(join(root, '.env.local'))) {
  console.error('JORNADA_LOCAL_ENV_MISSING: autentique a pasta Jornada primeiro.');
  process.exit(4);
}

// The Vercel CLI's env-run wrapper can finish without forwarding the child
// status when protected env values cannot be pulled. Node 24 loads only the
// already-existing, project-scoped local env file; no re-download of secrets.
console.log('GROQ_DIAGNOSTIC_START: verificando configuração autorizada.');
const result = spawnSync(process.execPath, [
  '--env-file-if-exists=.env.local', 'scripts/probe-groq.mjs',
], {
  cwd: root,
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    VERCEL_PROJECT_ID: EXPECTED_PROJECT_ID,
    VERCEL_ORG_ID: EXPECTED_TEAM_ID,
  },
  timeout: 35_000,
});
if (result.error || result.signal) {
  console.error('GROQ_DIAGNOSTIC_INTERRUPTED');
  process.exit(5);
}
console.log('GROQ_DIAGNOSTIC_EXIT=' + String(result.status ?? 5));
process.exit(result.status ?? 5);
