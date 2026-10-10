import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { createHmac } from 'node:crypto';
import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';

const localModule = (path: string) =>
  pathToFileURL(resolvePath(process.cwd(), path)).href;

const state = {
  contacts: [] as any[],
  conversations: [] as any[],
  messages: [] as any[],
  inbox: [] as any[],
  audit: [] as any[],
  settings: {
    whatsappAutomation: {
      enabled: true, defaultMode: 'ai',
      humanTakeoverStopsAi: true,
    },
  },
};

let callsToMeta = 0;
let failLocalSave = false;
let successfulStateCommits = 0;
let autoReplyInvocations = 0;
let inboxPersistedBeforeAutoReply = false;

mock.module(localModule('lib/auth.ts'), {
  namedExports: { requireAuthenticated: async () => undefined },
});

mock.module(localModule('lib/store.ts'), {
  namedExports: {
    getState: async () => structuredClone(state),
    saveState: async (incoming: typeof state) => {
      Object.assign(state, structuredClone(incoming));
      successfulStateCommits += 1;
      return incoming;
    },
    audit: (draft: typeof state, entry: object) => {
      draft.audit.unshift({ id: crypto.randomUUID(), ...entry });
    },
  },
});

class WhatsAppProviderError extends Error {
  status = 502;
  details = null;
}
mock.module(localModule('lib/whatsapp-provider.ts'), {
  namedExports: {
    WhatsAppProviderError,
    sendWhatsAppText: async () => {
      callsToMeta += 1;
      return { providerMessageId: 'wamid.synthetic.123' };
    },
  },
});
mock.module(localModule('lib/state-mutation.ts'), {
  namedExports: {
    mutateStateSafely: async () => {
      if (failLocalSave) throw new Error('synthetic persistence failure');
      return 'human';
    },
  },
});
mock.module(localModule('lib/whatsapp-automation.ts'), {
  namedExports: {
    runWhatsAppAutomation: async (_incoming: typeof state) => {
      autoReplyInvocations += 1;
      inboxPersistedBeforeAutoReply =
        successfulStateCommits > 0 &&
        state.messages.some((m: any) => m.providerMessageId === 'wamid.inbound.1');
      return { kind: 'ignore', reason: 'mock' };
    },
  },
});
const sendRoute = await import('../app/api/whatsapp/send/route');
const webhookRoute = await import('../app/api/webhooks/whatsapp/route');

function reset() {
  state.contacts = [{
    id: 'test-contact', name: 'Pessoa teste', phone: '5599000000000',
  }];
  state.conversations = [{
    id: 'test-conversation', contactId: 'test-contact', provider: 'meta',
    status: 'waiting_me', automationMode: 'human', unreadCount: 1,
    createdAt: '2026-10-10T10:00:00Z', updatedAt: '2026-10-10T10:00:00Z',
  }];
  state.messages = [];
  state.inbox = [];
  state.audit = [];
  callsToMeta = 0;
  failLocalSave = false;
  successfulStateCommits = 0;
  autoReplyInvocations = 0;
  inboxPersistedBeforeAutoReply = false;
}

test('falha após Meta aceitar mensagem NÃO causa segundo envio automático', async () => {
  reset();
  failLocalSave = true;
  const request = new Request('https://localhost/api/whatsapp/send', {
    method: 'POST',
    body: JSON.stringify({ conversationId: 'test-conversation', text: 'Oi, teste!' }),
  });
  const response = await sendRoute.POST(request);
  const result = await response.json();
  assert.equal(response.status, 202);
  assert.equal(result.deliveryAccepted, true);
  assert.equal(callsToMeta, 1);
  assert.match(result.error, /Não reenvie/i);
});

test('webhook só considera resposta automática APÓS gravar inbound; não duplica', async () => {
  reset();
  process.env.WHATSAPP_APP_SECRET = 'synthetic-hmac-key-for-testing';
  const raw = JSON.stringify({
    entry: [{ changes: [{ field: 'messages', value: {
      contacts: [{ wa_id: '559988776655', profile: { name: 'Teste' } }],
      messages: [{ id: 'wamid.inbound.1', from: '559988776655', timestamp: '1791630000',
        type: 'text', text: { body: 'Oi' } }],
    } }] }],
  });
  const signature = 'sha256=' + createHmac('sha256', process.env.WHATSAPP_APP_SECRET)
    .update(raw).digest('hex');
  const request = () => new Request('https://localhost/api/webhooks/whatsapp', {
    method: 'POST', headers: { 'x-hub-signature-256': signature }, body: raw,
  });
  const first = await webhookRoute.POST(request());
  assert.equal(first.status, 200);
  assert.equal(autoReplyInvocations, 1);
  assert.equal(inboxPersistedBeforeAutoReply, true);
  const second = await webhookRoute.POST(request());
  assert.equal(second.status, 200);
  assert.equal(autoReplyInvocations, 1);
  assert.equal(state.messages.filter((m) => m.providerMessageId === 'wamid.inbound.1').length, 1);
});
