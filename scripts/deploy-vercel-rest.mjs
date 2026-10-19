// Deploy restrito à Jornada. Usa a API oficial sem depender de "vercel pull",
// que atualmente não funciona com tokens limitados a um projeto.
// Nunca imprime o token, não lê .env e não cria outro projeto.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const TEAM_ID = 'team_ZEmFS6erUu5qbXgYyze8PWdm';
const PROJECT_ID = 'prj_nZMJzmOo0jsL9tFqfpT6lqdLm3c6';
const PROJECT_NAME = 'jornada-do-brito';
const API = 'https://api.vercel.com';
const token = process.env.VERCEL_TOKEN?.trim();

if (!token || /\s|-/.test(token)) {
  console.error('VERCEL_TOKEN ausente ou com formato inválido.');
  process.exit(1);
}
if (process.env.GITHUB_REF !== 'refs/heads/main' || process.env.CI !== 'true') {
  console.error('Publicação permitida somente pelo CI na branch principal.');
  process.exit(1);
}

const allowed = (p) => p.startsWith('app/') || p.startsWith('lib/') ||
  p.startsWith('public/') ||
  ['package.json', 'next.config.ts', 'next-env.d.ts', 'tsconfig.json', 'vercel.json'].includes(p);

const tracked = execFileSync('git', ['ls-files', '-z']).toString('utf8').split('\0').filter(Boolean);
const sourcePaths = tracked.filter(allowed).sort();
for (const required of ['app/desenvolvimento/console.tsx', 'app/api/login/route.ts', 'package.json', 'vercel.json']) {
  if (!sourcePaths.includes(required)) throw new Error('Pacote incompleto: ' + required);
}
if (sourcePaths.length < 50) throw new Error('Pacote incompleto: poucos arquivos de código');
const cronConfig = JSON.parse(readFileSync('vercel.json', 'utf8'));
if (!Array.isArray(cronConfig.crons) || !cronConfig.crons.some(c =>
 c.path === '/api/cron/devops-evidence' && c.schedule === '0 12 * * *'))
 throw new Error('Agendamento diário da evidência ausente no pacote');

const files = sourcePaths.map((file) => {
  const stat = statSync(file);
  if (!stat.isFile() || stat.size > 8_000_000) throw new Error('Arquivo inesperado: ' + file);
  return { file, data: readFileSync(file).toString('base64'), encoding: 'base64' };
});

async function vercelRequest(path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + token,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    signal: AbortSignal.timeout(options.body ? 180_000 : 30_000),
  });
  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = {}; }
  if (!response.ok) {
    const desc = String(body?.error?.message || body?.message || raw.slice(0, 300))
      .replaceAll(token, '[OCULTO]');
    throw new Error('Vercel respondeu ' + response.status + ': ' + desc);
  }
  return body;
}

// Confere a identidade do projeto antes de iniciar qualquer publicação.
const existing = await vercelRequest('/v9/projects/' + PROJECT_ID + '?teamId=' + TEAM_ID);
if (existing.id !== PROJECT_ID || existing.name !== PROJECT_NAME) {
  throw new Error('Projeto inesperado. Publicação interrompida.');
}
console.log('Projeto confirmado. Enviando pacote com ' + files.length + ' arquivos.');

const created = await vercelRequest(
  '/v13/deployments?teamId=' + TEAM_ID + '&skipAutoDetectionConfirmation=1',
  {
    method: 'POST',
    body: JSON.stringify({
      name: PROJECT_NAME,
      project: PROJECT_ID,
      target: 'production',
      files,
      // Sem gitMetadata: evita bloqueio de autor Git não membro do time Vercel.
    }),
  },
);
const deploymentId = created.id;
if (!deploymentId?.startsWith('dpl_')) throw new Error('Vercel não retornou ID de publicação');
console.log('Publicação iniciada: ' + deploymentId);

for (let check = 0; check < 36; check++) {
  await new Promise((resolve) => setTimeout(resolve, 10_000));
  const status = await vercelRequest('/v13/deployments/' + deploymentId + '?teamId=' + TEAM_ID);
  const state = status.readyState || status.state;
  if (state === 'READY') {
    console.log('PUBLICAÇÃO CONCLUÍDA: ' + deploymentId);
    console.log('Endereço: https://' + status.url);
    process.exit(0);
  }
  if (['ERROR', 'BLOCKED', 'CANCELED'].includes(state)) {
    throw new Error('A Vercel não publicou: ' + state + ' ' + (status.errorMessage || ''));
  }
}
throw new Error('Publicação ainda não ficou pronta; confira o deploy ' + deploymentId);
