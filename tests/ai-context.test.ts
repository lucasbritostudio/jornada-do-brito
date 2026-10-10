import assert from 'node:assert/strict';
import { test } from 'node:test';
import { minimizeAiContext } from '../lib/ai-context';

const context: Record<string, unknown> = {
  contactsCount: 4, opportunitiesOpen: 2, projectsActive: 1,
  inboxPending: 0, conversationsWaiting: 0,
  month: { incomeCents: 50000, expenseCents: 30000, netCents: 20000 },
  activeDebt: { count: 2, structuralTotalCents: 80000,
    items: [{ creditor: 'Credor Teste', currentBalanceCents: 80000 }] },
  receivables: [{ title: 'Cliente Particular', amountCents: 95000 }],
  obligations: [{ title: 'Despesa Pessoal', amountCents: 9000 }],
  relevantClients: [{ name: 'Contato Fictício', company: 'Empresa Fictícia' }],
  recentClientLearning: [{ client: 'Contato Fictício', learnedRule: 'regra' }],
  professionalPatterns: [{ title: 'Cinema' }],
  study: { areas: [{ label: 'Filmagem', currentScore: 8 }] },
  videoMethod: { rule: 'storytelling' },
  tasks: [{ title: 'Confirmar reunião' }],
  goals: [{ title: 'Criar 1 vídeo' }],
};

test('general prompts never include finance, names, debt or study data', () => {
  const data = minimizeAiContext(context, 'Olá, qual é a sua função?');
  const serialized = JSON.stringify(data);
  assert.equal(data.contactsCount, 4);
  assert.doesNotMatch(serialized, /50000|Credor Teste|Contato Fictício|Filmagem|Despesa Pessoal/);
});

test('a request to tell a story does not accidentally disclose bank information', () => {
  const data = minimizeAiContext({ ...context, relevantClients: [] }, 'Me conta uma história divertida');
  assert.equal('month' in data, false);
  assert.equal('activeDebt' in data, false);
});

test('finance request includes only aggregates without named creditors', () => {
  const data = minimizeAiContext({ ...context, relevantClients: [] }, 'Qual é meu saldo e dívida?');
  assert.deepEqual(data.month, context.month);
  assert.equal(JSON.stringify(data).includes('Credor Teste'), false);
  assert.equal(JSON.stringify(data).includes('Cliente Particular'), false);
  assert.equal(data.pendingReceivables, 1);
});

test('named client and filmmaking requests retain relevant data only', () => {
  const client = minimizeAiContext(context, 'Como conversar com Contato Fictício?');
  assert.equal(JSON.stringify(client).includes('Contato Fictício'), true);
  assert.equal('month' in client, false);
  const film = minimizeAiContext({ ...context, relevantClients: [] }, 'Como treinar gimbal?');
  assert.equal('study' in film, true);
  assert.equal('videoMethod' in film, true);
  assert.equal('month' in film, false);
});
