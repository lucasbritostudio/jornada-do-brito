import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const libUrl = (name: string) => pathToFileURL(resolve(process.cwd(), `lib/${name}.ts`)).href;
const empty = {
  contacts: [], opportunities: [], projects: [], transactions: [], debts: [],
  receivables: [], obligations: [], goals: [], tasks: [], studyAreas: [],
  studyEvents: [], clientExperiences: [], professionalPatterns: [],
  conversations: [], inbox: [], audit: [],
  settings: { ai: { autoSaveLowRiskExplicitCommands: false } },
};
let stateWrites = 0;
let memoryWrites = 0;
let groqError = false;
let observedTools: readonly unknown[] = [];

class LlmProviderError extends Error {
  status: number;
  provider: 'groq' | 'openrouter';
  retryAfter: string | null = null;
  constructor(message: string, status: number, provider: 'groq' | 'openrouter') {
    super(message);
    this.status = status;
    this.provider = provider;
  }
}

mock.module(libUrl('auth'), {
  namedExports: { requireAuthenticated: async () => undefined },
});
mock.module(libUrl('store'), {
  namedExports: {
    getState: async () => structuredClone(empty),
    saveState: async (state: unknown) => { stateWrites += 1; return state; },
    audit: () => undefined,
  },
});
mock.module(libUrl('insights'), {
  namedExports: { buildInsights: () => [] },
});
mock.module(libUrl('llm'), {
  namedExports: {
    LlmProviderError,
    llmStatus: async () => ({ configured: true }),
    generateWithJornadaTools: async (_messages: unknown, tools: readonly unknown[]) => {
      observedTools = tools;
      if (groqError) throw new LlmProviderError('Limite gratuito temporariamente atingido.', 429, 'groq');
      return { text: 'OK', provider: 'groq', model: 'synthetic-test', usage: { totalTokens: 12 } };
    },
  },
});
mock.module(libUrl('ai-memory'), {
  namedExports: {
    findRelevantAiLessons: async () => [],
    recordAiTurn: async () => {
      memoryWrites += 1;
      return {
        threadId: 'thread-synthetic-123',
        turnId: `turn-synthetic-${memoryWrites}`,
        learningCount: 0,
        indexPending: false,
      };
    },
  },
});
mock.module(libUrl('ai-actions'), {
  namedExports: {
    JORNADA_TOOLS: [{ type: 'function', function: { name: 'synthetic-action' } }],
    createActionProposal: () => undefined,
    executeAction: () => { throw new Error('ACTION_UNEXPECTED'); },
    normalizeAction: () => { throw new Error('ACTION_UNEXPECTED'); },
  },
});
const { POST } = await import('../app/api/ai/chat/route');

function message(text: string) {
  return new Request('http://localhost/api/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: text, threadId: 'thread-synthetic-123' }),
  });
}

test('ordinary Groq reply persists only private memory, not shared workspace', async () => {
  stateWrites = 0;
  memoryWrites = 0;
  groqError = false;
  const result = await POST(message('Olá, pode me explicar?'));
  const data = await result.json();
  assert.equal(result.status, 200);
  assert.equal(data.text, 'OK');
  assert.equal(data.memorySaved, true);
  assert.equal(data.memoryIndexPending, false);
  assert.equal(stateWrites, 0);
  assert.equal(memoryWrites, 1);
  assert.equal(observedTools.length, 0);
});

test('Groq rate limit never writes shared workspace nor loses fallback memory', async () => {
  stateWrites = 0;
  memoryWrites = 0;
  groqError = true;
  const result = await POST(message('Dê uma orientação curta.'));
  const data = await result.json();
  assert.equal(result.status, 200);
  assert.equal(data.fallback, true);
  assert.equal(data.memorySaved, true);
  assert.equal(stateWrites, 0);
  assert.equal(memoryWrites, 1);
});
