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
let indexWriteFailure = false;

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
      if (indexWriteFailure && pathname === 'jornada/ai-memory/index.json')
        throw new Error('synthetic index write failure');
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
    list: async (opts?: { prefix?: string }) => ({
      blobs: [...blobs.keys()].filter((path) => !opts?.prefix || path.startsWith(opts.prefix))
        .map((pathname) => ({ pathname })),
      hasMore: false,
    }),
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
  indexWriteFailure = false;
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
  await assert.rejects(() => store.saveState(second), BlobPreconditionFailedError);
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

test('mutação pura relê o estado após conflito, sem perder alterações', async () => {
  resetStorage();
  const updates = await import('../lib/state-mutation');
  await store.getState();
  let count = 0;
  await updates.mutateStateSafely((state) => {
    count += 1;
    state.profile.displayName = 'Última alteração';
    if (count === 1) {
      const external = store.defaultState();
      external.profile.displayName = 'Alteração concorrente';
      blobs.set('jornada/state.json', JSON.stringify(external));
      etags.set('jornada/state.json', String(++etagSequence));
    }
  });
  assert.equal(count, 2);
  assert.equal((await store.getState()).profile.displayName, 'Última alteração');
});

test('memory keeps durable turn when secondary index write fails, then repairs on demand', async () => {
  resetStorage();
  indexWriteFailure = true;
  const saved = await memory.recordAiTurn({
    threadId: 'thread-pending-index-01',
    userText: 'Conversa importante que precisa ser mantida',
    assistantText: 'Resposta sintética',
    outcome: 'answered',
  });
  assert.equal(saved.indexPending, true);
  assert.equal((await memory.getAiThread(saved.threadId))?.turns.length, 1);
  assert.equal(blobs.has('jornada/ai-memory/index.json'), false);
  indexWriteFailure = false;
  const result = await memory.reconcileAiMemoryIndex();
  assert.deepEqual(result, { scanned: 1, repaired: 1, lessonsRestored: 0, completed: true });
  assert.equal((await memory.getAiMemoryStats()).threads, 1);
  assert.equal((await memory.getAiHistory(saved.threadId)).messages.length, 2);
});

test('reconciliation restores learned lesson when feedback committed but index write failed', async () => {
  resetStorage();
  const first = await memory.recordAiTurn({
    threadId: 'thread-lesson-repair-01',
    userText: 'Meu planejamento de treino falhou',
    assistantText: 'Tente uma nova rotina',
    outcome: 'answered',
  });
  const second = await memory.recordAiTurn({
    threadId: first.threadId,
    userText: 'Agora consegui melhorar o treino',
    assistantText: 'Ajuste a carga progressivamente',
    outcome: 'answered',
  });
  await memory.recordAiFeedback({
    threadId: first.threadId, turnId: first.turnId, feedback: 'not_resolved',
  });
  indexWriteFailure = true;
  await assert.rejects(() => memory.recordAiFeedback({
    threadId: first.threadId, turnId: second.turnId, feedback: 'resolved',
  }), /synthetic index write failure/);
  indexWriteFailure = false;
  assert.equal((await memory.getAiMemoryStats()).learningCount, 0);
  const repair = await memory.reconcileAiMemoryIndex();
  assert.equal(repair.lessonsRestored, 1);
  assert.equal((await memory.getAiMemoryStats()).learningCount, 1);
  const repeat = await memory.reconcileAiMemoryIndex();
  assert.equal(repeat.lessonsRestored, 0);
  assert.equal((await memory.getAiMemoryStats()).learningCount, 1);
});

test('aprendizado manual exige confirmação, remove contatos e não duplica lições', async () => {
  resetStorage();
  const situation =
    'Cliente pediu ajuda pelo 11988887777 e contato@exemplo.com para montar um vídeo curto.';
  const solution =
    'Expliquei o roteiro de trinta segundos e o cliente aprovou a proposta.';
  await assert.rejects(
    () => memory.recordConfirmedClientLesson({ situation, solution, confirmed: false }),
    /CLIENT_LESSON_NOT_CONFIRMED/,
  );
  assert.equal(blobs.has('jornada/ai-memory/index.json'), false);
  const first = await memory.recordConfirmedClientLesson({
    situation, solution, confirmed: true,
  });
  assert.equal(first.duplicate, false);
  assert.equal(first.learningCount, 1);
  const copy = await memory.recordConfirmedClientLesson({
    situation, solution, confirmed: true,
  });
  assert.equal(copy.duplicate, true);
  assert.equal(copy.lessonId, first.lessonId);
  assert.equal(copy.learningCount, 1);
  const raw = blobs.get('jornada/ai-memory/index.json') || '';
  assert.equal(raw.includes('11988887777'), false);
  assert.equal(raw.includes('contato@exemplo.com'), false);
  assert.equal(raw.includes('[TELEFONE_REMOVIDO]'), true);
  const relevant = await memory.findRelevantAiLessons('montar vídeo curto');
  assert.equal(relevant.length, 1);
  assert.match(relevant[0].successfulResolution, /roteiro de trinta segundos/);
});

test('aprendizado manual não guarda conversas incompletas nem credenciais', async () => {
  resetStorage();
  await assert.rejects(
    () => memory.recordConfirmedClientLesson({
      situation: 'Oi',
      solution: 'Tudo bem',
      confirmed: true,
    }),
    /CLIENT_LESSON_TOO_SHORT/,
  );
  assert.equal(blobs.size, 0);
  const saved = await memory.recordConfirmedClientLesson({
    situation: 'Cliente trouxe link https://exemplo.com/perfil e perguntou sobre gravação.',
    solution: 'Orientei sem compartilhar senha=segredo12345678 e combinei uma reunião.',
    confirmed: true,
  });
  assert.equal(saved.learningCount, 1);
  const raw = blobs.get('jornada/ai-memory/index.json') || '';
  assert.doesNotMatch(raw, /https:\/\/exemplo\.com|segredo12345678/);
  assert.match(raw, /LINK_REMOVIDO/);
});
