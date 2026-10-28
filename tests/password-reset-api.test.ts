import * as realBlobSdk from '@vercel/blob';
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';

const localModule = (path: string) => pathToFileURL(resolvePath(process.cwd(), path)).href;
const blobs = new Map<string, string>();
const etags = new Map<string, string>();
let writes = 0;
let authenticatedVersion: number | null = 0;

class BlobPreconditionFailedError extends Error {
  name = 'BlobPreconditionFailedError';
}

mock.module('@vercel/blob', { namedExports: {
    ...realBlobSdk,
    head: async (pathname: string) => {
      if (!blobs.has(pathname)) throw new realBlobSdk.BlobNotFoundError();
      return { etag: etags.get(pathname) };
    },
  get: async (path: string) => {
    const content = blobs.get(path);
    if (content === undefined) return null;
    return { stream: new Response(content).body, blob: { etag: etags.get(path) } };
  },
  put: async (path: string, content: string, options: { allowOverwrite?: boolean; ifMatch?: string } = {}) => {
    const current = etags.get(path);
    if (options.ifMatch && options.ifMatch !== current) throw new BlobPreconditionFailedError('synthetic conflict');
    if (!options.allowOverwrite && current) throw new BlobPreconditionFailedError('synthetic duplicate');
    writes++;
    const etag = String(writes);
    blobs.set(path, content);
    etags.set(path, etag);
    return { etag };
  },
  list: async () => ({ blobs: [] }),
} });

mock.module(localModule('lib/auth.ts'), { namedExports: {
  SESSION_COOKIE: 'jornada_session',
  requireAuthenticated: async () => {
    if (authenticatedVersion === null) throw new Error('UNAUTHORIZED');
    return authenticatedVersion;
  },
} });

process.env.JORNADA_SESSION_SECRET = 'test-only-session-secret';
const store = await import('../lib/store');
const crypto = await import('../lib/crypto');
const api = await import('../app/api/account/password/route');

async function seedAuth(sessionVersion = 0) {
  blobs.clear();
  etags.clear();
  writes = 0;
  authenticatedVersion = sessionVersion;
  const { salt, hash } = crypto.hashPassword('initial synthetic password');
  await store.saveAuthRecord({
    activated: true,
    email: 'owner@example.test',
    passwordSalt: salt,
    passwordHash: hash,
    activatedAt: '2026-10-19T00:00:00.000Z',
    sessionVersion,
  });
}

function request(password: unknown, origin = 'https://jornada.test') {
  return new Request('https://jornada.test/api/account/password', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ password }),
  });
}

test('troca de senha exige uma sessão do proprietário e mesma origem', async () => {
  await seedAuth();
  authenticatedVersion = null;
  const unauthenticated = await api.POST(request('new synthetic password'));
  assert.equal(unauthenticated.status, 401);
  assert.equal(writes, 1);

  authenticatedVersion = 0;
  const crossSite = await api.POST(request('new synthetic password', 'https://attacker.test'));
  assert.equal(crossSite.status, 403);
  assert.equal(writes, 1);
});

test('o servidor valida a nova senha sem receber a senha antiga', async () => {
  await seedAuth();
  const invalid = await api.POST(request('short'));
  assert.equal(invalid.status, 400);
  assert.equal(writes, 1);
  assert.equal((await store.getAuthRecord())?.sessionVersion, 0);
});

test('a troca preserva a identidade, emite uma sessão nova e invalida todas as anteriores', async () => {
  await seedAuth();
  const oldSession = crypto.signSession(0);
  const response = await api.POST(request('new synthetic password'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });

  const auth = await store.getAuthRecord();
  assert.equal(auth?.activated, true);
  assert.equal(auth?.email, 'owner@example.test');
  assert.equal(auth?.activatedAt, '2026-10-19T00:00:00.000Z');
  assert.equal(auth?.sessionVersion, 1);
  assert.equal(crypto.verifyPassword('new synthetic password', auth!.passwordSalt, auth!.passwordHash), true);
  assert.equal(crypto.verifyPassword('initial synthetic password', auth!.passwordSalt, auth!.passwordHash), false);
  assert.equal(crypto.verifySession(oldSession, 1), false);

  const issued = response.headers.get('set-cookie');
  assert.match(issued || '', /HttpOnly/i);
  assert.match(issued || '', /Secure/i);
  assert.match(issued || '', /SameSite=Lax/i);
  const cookie = /jornada_session=([^;]+)/.exec(issued || '')?.[1];
  assert.ok(cookie);
  assert.equal(crypto.verifySession(cookie, 1), true);
});

test('uma sessão que já foi revogada não consegue sobrescrever a senha nova', async () => {
  await seedAuth();
  const { salt, hash } = crypto.hashPassword('first synthetic replacement');
  await store.rotateAuthPassword({ expectedSessionVersion: 0, passwordSalt: salt, passwordHash: hash });
  const writesAfterFirstRotation = writes;

  const stale = await api.POST(request('second synthetic replacement'));
  assert.equal(stale.status, 401);
  assert.match(stale.headers.get('set-cookie') || '', /Max-Age=0/i);
  assert.equal(writes, writesAfterFirstRotation);
  const auth = await store.getAuthRecord();
  assert.equal(auth?.sessionVersion, 1);
  assert.equal(crypto.verifyPassword('first synthetic replacement', auth!.passwordSalt, auth!.passwordHash), true);
});

test('a rotação trata conflito condicional sem aceitar uma sessão obsoleta', async () => {
  await seedAuth();
  const first = crypto.hashPassword('first synthetic replacement');
  await store.rotateAuthPassword({ expectedSessionVersion: 0, passwordSalt: first.salt, passwordHash: first.hash });
  const second = crypto.hashPassword('second synthetic replacement');
  await assert.rejects(
    () => store.rotateAuthPassword({ expectedSessionVersion: 0, passwordSalt: second.salt, passwordHash: second.hash }),
    /AUTH_SESSION_REVOKED/,
  );
  const auth = await store.getAuthRecord();
  assert.equal(auth?.sessionVersion, 1);
  assert.equal(crypto.verifyPassword('first synthetic replacement', auth!.passwordSalt, auth!.passwordHash), true);
});

test('Preview nunca altera credenciais e corpo excessivo é recusado', async () => {
  await seedAuth();
  const before = await store.getAuthRecord();
  const current = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV='preview';
  try {
    const res=await api.POST(request('synthetic preview password'));
    assert.equal(res.status,503);
  } finally {
    if(current===undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV=current;
  }
  const oversized=await api.POST(request('p'.repeat(5000)));
  assert.equal(oversized.status,413);
  assert.equal(writes,1);
  assert.deepEqual(await store.getAuthRecord(),before);
});
