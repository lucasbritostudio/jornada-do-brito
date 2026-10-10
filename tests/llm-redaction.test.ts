import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

mock.module(pathToFileURL(resolve('lib/secrets.ts')).href, {
  namedExports: {
    getGroqApiKey: async () => 'synthetic-provider-credential',
    getGroqSecretStatus: async () => ({ configured: true, source: 'test' }),
  },
});

const { generateWithFreeLlm, generateWithJornadaTools } = await import('../lib/llm');

test('free LLM removes credentials from the latest user message before transport', async () => {
  let sent: any = null;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    sent = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  try {
    await generateWithFreeLlm([
      { role: 'system', content: 'Aja com cuidado' },
      { role: 'user', content: 'Minha senha=supersecret12345678 e gsk_ABCDEFGHIJKLMNOPQRSTUV' },
    ]);
    assert.ok(sent);
    assert.equal(sent.messages[0].content, 'Aja com cuidado');
    assert.doesNotMatch(sent.messages[1].content, /supersecret12345678|gsk_ABCDEFGHIJKLMNOPQRSTUV/);
    assert.match(sent.messages[1].content, /SEGREDO_REMOVIDO/);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('tool-aware Groq transport also sanitizes the user message', async () => {
  let sent: any = null;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    sent = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const result = await generateWithJornadaTools([
      { role: 'user', content: 'access_token=aaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    ], []);
    assert.equal(result.provider, 'groq');
    assert.equal(result.text, 'ok');
    assert.doesNotMatch(sent.messages[0].content, /aaaaaaaaaaaaaaaaaaaaaaaaaaa/);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('ordinary Groq answers avoid expensive unused tool schemas', async () => {
  let body: any = null;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'resposta sintética' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    await generateWithJornadaTools([
      { role: 'user', content: 'Explique cinematografia' },
    ], []);
    assert.equal('tools' in body, false);
    assert.equal('tool_choice' in body, false);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('Groq error details with sensitive data are never echoed to the caller', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { message: 'senha=synthetic-should-never-leak-123456' },
  }), { status: 429, headers: { 'content-type': 'application/json' } });
  try {
    await assert.rejects(
      () => generateWithJornadaTools([{ role: 'user', content: 'Olá' }], []),
      (error: any) => error?.status === 429 &&
        !String(error.message).includes('synthetic-should-never-leak'),
    );
  } finally {
    globalThis.fetch = oldFetch;
  }
});
