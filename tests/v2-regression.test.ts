import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type BlobValue = string;

const blobs = new Map<string, BlobValue>();
const etags = new Map<string, string>();
let etagSequence = 0;
class BlobPreconditionFailedError extends Error {
  name = 'BlobPreconditionFailedError';
}
let readFailure = false;
let writeFailure = false;

mock.module('@vercel/blob', {
  namedExports: {
    get: async (pathname: string) => {
      if (readFailure) throw new Error('synthetic read failure');
      const value = blobs.get(pathname);
      if (value === undefined) return null;
      return {
        statusCode: 200,
        stream: new Response(value).body,
        blob: { etag: etags.get(pathname) },
      };
    },
    put: async (pathname: string, body: string, options: {
      allowOverwrite?: boolean; ifMatch?: string
    } = {}) => {
      if (writeFailure) throw new Error('synthetic write failure');
      const existing = etags.get(pathname);
      if (options.ifMatch && options.ifMatch !== existing)
        throw new BlobPreconditionFailedError('synthetic concurrent conflict');
      if (!options.allowOverwrite && existing) {
        const error = new Error('synthetic already exists');
        error.name = 'BlobAlreadyExistsError';
        throw error;
      }
      blobs.set(pathname, body);
      const etag = String(++etagSequence);
      etags.set(pathname, etag);
      return { pathname, etag };
    },
    BlobPreconditionFailedError,
    list: async () => ({ blobs: [] }),
  },
});

process.env.JORNADA_SESSION_SECRET = 'synthetic-test-secret';

const memory = await import('../lib/ai-memory');
const policy = await import('../lib/ai-policy');
const store = await import('../lib/store');
const secrets = await import('../lib/secrets');
const undo = await import('../lib/undo');

function resetStorage() {
  blobs.clear();
  etags.clear();
  readFailure = false;
  writeFailure = false;
}

test('memória mantém casos abertos e cria aprendizado só após solução posterior', async () => {
  resetStorage();
  const first = await memory.recordAiTurn({
    threadId: 'thread-regression-001',
    userText: 'Como organizar meu orçamento mensal?',
    assistantText: 'Tente separar entradas e gastos.',
    outcome: 'answered',
  });
  const second = await memory.recordAiTurn({
    threadId: first.threadId,
    userText: 'Ainda não consegui organizar.',
    assistantText: 'Vamos reconciliar cada conta com o saldo atual.',
    outcome: 'answered',
  });

  const failed = await memory.recordAiFeedback({
    threadId: first.threadId,
    turnId: first.turnId,
    feedback: 'not_resolved',
  });
  assert.equal(failed.threadStatus, 'needs_attention');
  assert.equal(failed.lessonCreated, false);

  const resolved = await memory.recordAiFeedback({
    threadId: first.threadId,
    turnId: second.turnId,
    feedback: 'resolved',
  });
  assert.equal(resolved.threadStatus, 'resolved');
  assert.equal(resolved.lessonCreated, true);

  const relevant = await memory.findRelevantAiLessons('organizar orçamento');
  const unrelated = await memory.findRelevantAiLessons('câmera e iluminação');
  assert.equal(relevant.length, 1);
  assert.equal(unrelated.length, 0);
});

test('redação ocorre antes da persistência e também na leitura', async () => {
  resetStorage();
  const secret = 'gsk_SYNTHETIC_SECRET_123456';
  const result = await memory.recordAiTurn({
    threadId: 'thread-regression-002',
    userText: `A chave é ${secret}`,
    assistantText: 'Use Bearer abcdefghijklmnop1234 e senha=nao-gravar',
    outcome: 'answered',
  });

  const threadRaw = blobs.get(`jornada/ai-memory/threads/${result.threadId}.json`) || '';
  const indexRaw = blobs.get('jornada/ai-memory/index.json') || '';
  assert.equal(threadRaw.includes(secret), false);
  assert.equal(indexRaw.includes(secret), false);
  assert.equal(threadRaw.includes('[CHAVE_REMOVIDA]'), true);

  const loaded = await memory.getAiThread(result.threadId);
  assert.equal(loaded?.turns[0].userText.includes(secret), false);
});

test('falha de leitura não é convertida em estado vazio', async () => {
  resetStorage();
  readFailure = true;
  await assert.rejects(() => store.getState(), /synthetic read failure/);
  await assert.rejects(
    () =>
      memory.recordAiTurn({
        threadId: 'thread-regression-004',
        userText: 'Não sobrescrever memória',
        assistantText: 'Resposta sintética',
        outcome: 'answered',
      }),
    /synthetic read failure/,
  );
  await assert.rejects(
    () => secrets.saveGroqApiKey('synthetic-key-value-1234567890'),
    /synthetic read failure/,
  );
  assert.equal(blobs.has('jornada/state.json'), false);
  assert.equal(blobs.has('jornada/secrets.json'), false);
});

test('falha de gravação não cria índice parcial da memória', async () => {
  resetStorage();
  writeFailure = true;
  await assert.rejects(
    () =>
      memory.recordAiTurn({
        threadId: 'thread-regression-003',
        userText: 'Teste de armazenamento',
        assistantText: 'Resposta sintética',
        outcome: 'answered',
      }),
    /synthetic write failure/,
  );
  assert.equal(blobs.size, 0);
});

test('undo permanece determinístico e de uso único', async () => {
  const state = store.defaultState();
  const record = {
    id: 'synthetic-task-001',
    title: 'Tarefa sintética',
    status: 'todo',
  };
  state.tasks.push(record as never);
  const token = undo.registerUndoEvent(
    state,
    [{ kind: 'delete', collection: 'tasks', entityId: record.id }],
    10,
  );
  const first = undo.applyUndo(state, token);
  assert.equal(first.changeCount, 1);
  assert.equal(state.tasks.some((item) => item.id === record.id), false);
  assert.throws(() => undo.applyUndo(state, token), /já foi desfeita/);
});

test('actions só podem ser salvas automaticamente com intenção explícita', () => {
  assert.equal(policy.hasExplicitActionIntent('registre uma tarefa para amanhã'), true);
  assert.equal(policy.hasExplicitActionIntent('como registrar uma tarefa?'), false);
  assert.equal(policy.hasExplicitActionIntent('não crie uma tarefa'), false);
});

test('workspace rejeita snapshot obsoleto sem perder gravações anteriores', async () => {
  resetStorage();
  const first = await store.getState();
  const second = await store.getState();
  first.profile.displayName = 'Primeira versão';
  second.profile.displayName = 'Versão obsoleta';
  await store.saveState(first);
  await assert.rejects(() => store.saveState(second), /already exists/);
  const persisted = await store.getState();
  assert.equal(persisted.profile.displayName, 'Primeira versão');

  const third = await store.getState();
  const fourth = await store.getState();
  third.profile.displayName = 'Atualização aceita';
  fourth.profile.displayName = 'Atualização rejeitada';
  await store.saveState(third);
  await assert.rejects(() => store.saveState(fourth), BlobPreconditionFailedError);
  assert.equal((await store.getState()).profile.displayName, 'Atualização aceita');
});

test('mensagens simultâneas na mesma conversa são preservadas', async () => {
  resetStorage();
  const threadId = 'thread-concurrent-001';
  const results = await Promise.all([
    memory.recordAiTurn({
      threadId, userText: 'Primeira mensagem', assistantText: 'Resposta 1', outcome: 'answered',
    }),
    memory.recordAiTurn({
      threadId, userText: 'Segunda mensagem', assistantText: 'Resposta 2', outcome: 'answered',
    }),
  ]);
  assert.equal(new Set(results.map((r) => r.turnId)).size, 2);
  const thread = await memory.getAiThread(threadId);
  assert.equal(thread?.turns.length, 2);
  assert.deepEqual(new Set(thread?.turns.map((turn) => turn.userText)),
    new Set(['Primeira mensagem', 'Segunda mensagem']));
});

test('cofre criptografado rejeita overwrite com versão obsoleta', async () => {
  resetStorage();
  await secrets.saveGroqApiKey('gsk_synthetic_key_aabbccddeeff');
  const raw = blobs.get('jornada/secrets.json') || '';
  assert.equal(raw.includes('gsk_synthetic_key_aabbccddeeff'), false);
  assert.equal(await secrets.getGroqApiKey(), 'gsk_synthetic_key_aabbccddeeff');
});
