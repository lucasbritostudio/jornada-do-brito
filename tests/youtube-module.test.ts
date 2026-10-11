import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const blobs = new Map<string, string>();
let authenticated = true;

mock.module('@vercel/blob', { namedExports: {
  get: async (path: string) => {
    const content = blobs.get(path);
    if (content === undefined) return null;
    return { stream: new Response(content).body };
  },
  put: async (path: string, content: string) => {
    blobs.set(path, content);
    return { url: `https://example.test/${path}` };
  },
} });

mock.module(new URL('../lib/auth.ts', import.meta.url).pathname, { namedExports: {
  requireAuthenticated: async () => {
    if (!authenticated) throw new Error('UNAUTHORIZED');
  },
} });

const api = await import('../app/api/youtube/route');

async function post(body: Record<string, unknown>) {
  const response = await api.POST(new Request('https://example.test/api/youtube', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
  return { status: response.status, body: await response.json() };
}

test('módulo YouTube começa separado e pausado', async () => {
  blobs.clear();
  authenticated = true;
  const response = await api.GET();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.enabled, false);
  assert.equal(body.mode, 'paused');
  assert.equal(body.publishMode, 'private');
  assert.deepEqual([...blobs.keys()], []);
});

test('não permite preparar execução antes de ativar', async () => {
  blobs.clear();
  await post({ action: 'save_settings', state: { channelName: 'Canal teste', audience: 'Público teste' } });
  const response = await post({ action: 'queue_run' });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /Ative/);
});

test('não inicia automação quando faltam conexões externas', async () => {
  blobs.clear();
  await post({ action: 'save_settings', state: { channelName: 'Canal teste', provider: 'openai' } });
  assert.equal((await post({ action: 'set_mode', state: { mode: 'autonomous' } })).status, 200);
  const response = await post({ action: 'queue_run' });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /pronto/);
  assert.equal(response.body.readiness.ready, false);
});

test('ativação cria uma execução isolada sem publicar', async () => {
  blobs.clear();
  process.env.OPENAI_API_KEY = 'synthetic-key';
  process.env.YOUTUBE_REFRESH_TOKEN = 'synthetic-refresh-token';
  await post({ action: 'save_settings', state: { channelName: 'Canal teste', audience: 'Público teste', contentPillars: ['educação'], provider: 'openai' } });
  assert.equal((await post({ action: 'set_mode', state: { mode: 'autonomous' } })).status, 200);
  const response = await post({ action: 'queue_run' });
  assert.equal(response.status, 200);
  assert.equal(response.body.run.status, 'queued');
  assert.equal(response.body.run.stage, 'research');
  assert.equal(response.body.state.publishMode, 'private');
  assert.equal(response.body.state.runs.length, 1);
  assert.deepEqual([...blobs.keys()], ['jornada/youtube/state.json']);
  delete process.env.OPENAI_API_KEY;
  delete process.env.YOUTUBE_REFRESH_TOKEN;
});

test('rota continua protegida por login', async () => {
  authenticated = false;
  assert.equal((await api.GET()).status, 401);
  assert.equal((await post({ action: 'queue_run' })).status, 401);
  authenticated = true;
});
