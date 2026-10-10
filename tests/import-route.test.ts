import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';

const state = {
  contacts: [], opportunities: [], projects: [], videoBriefs: [],
  financialAccounts: [], transactions: [], debts: [], receivables: [],
  obligations: [], goals: [], tasks: [], inbox: [], clientExperiences: [],
  studyAreas: [], studyEvents: [], importBatches: [],
  audit: [] as Record<string, unknown>[],
};

const authModule = pathToFileURL(resolvePath(process.cwd(), 'lib/auth.ts')).href;
const storeModule = pathToFileURL(resolvePath(process.cwd(), 'lib/store.ts')).href;

mock.module(authModule, {
  namedExports: { requireAuthenticated: async () => undefined },
});
mock.module(storeModule, {
  namedExports: {
    getState: async () => state,
    saveState: async (value: typeof state) => value,
    audit: (value: typeof state, entry: Record<string, unknown>) => {
      value.audit.unshift(entry);
    },
  },
});
const { POST } = await import('../app/api/import/route');

function request(batchId: string) {
  return new Request('http://localhost/api/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      batchId,
      payload: {
        tasks: [{ importKey: 'synthetic-task', title: 'Tarefa sintética' }],
      },
    }),
  });
}

test('importação com o mesmo batchId é idempotente', async () => {
  state.importBatches.length = 0;
  state.tasks.length = 0;
  state.audit.length = 0;

  const first = await POST(request('synthetic-batch-001'));
  const firstJson = await first.json();
  const second = await POST(request('synthetic-batch-001'));
  const secondJson = await second.json();

  assert.equal(firstJson.alreadyApplied, false);
  assert.equal(secondJson.alreadyApplied, true);
  assert.equal(state.tasks.length, 1);
  assert.equal(state.importBatches.length, 1);
});
