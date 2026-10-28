import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const state = {
  financialAccounts: [
    { id: 'bank', name: 'Banco', type: 'bank', openingBalanceCents: 10000, currentBalanceCents: 10000, active: true },
    { id: 'reserve', name: 'Reserva', type: 'reserve', openingBalanceCents: 0, currentBalanceCents: 0, targetBalanceCents: 50000, active: true },
  ],
  transactions: [],
  debts: [{ id: 'debt', creditorName: 'Credor', originalAmountCents: 8000, currentBalanceCents: 8000, paidAmountCents: 0, status: 'active' }],
} as any;
const authUrl = pathToFileURL(resolve(process.cwd(), 'lib/auth.ts')).href;
const storeUrl = pathToFileURL(resolve(process.cwd(), 'lib/store.ts')).href;
mock.module(authUrl, { namedExports: { requireAuthenticated: async () => undefined } });
mock.module(storeUrl, {
  namedExports: {
    getState: async () => state,
    saveState: async (value: any) => value,
    audit: () => undefined,
  },
});
const { POST } = await import('../app/api/finance/action/route');

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/finance/action', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

test('pagamento de dívida reduz dívida e conta uma única vez', async () => {
  state.transactions.length = 0;
  state.financialAccounts[0].currentBalanceCents = 10000;
  state.debts[0].currentBalanceCents = 8000;
  state.debts[0].paidAmountCents = 0;
  state.debts[0].status = 'active';
  const body = { action: 'debt_payment', actionId: 'payment-0001', debtId: 'debt', fromAccountId: 'bank', amountCents: 2500 };
  const first = await POST(request(body));
  assert.equal(first.status, 200);
  await POST(request(body));
  assert.equal(state.financialAccounts[0].currentBalanceCents, 7500);
  assert.equal(state.debts[0].currentBalanceCents, 5500);
  assert.equal(state.transactions.length, 1);
});

test('transferência atualiza conta de uso diário e reserva sem virar renda/gasto', async () => {
  state.transactions.length = 0;
  state.financialAccounts[0].currentBalanceCents = 10000;
  state.financialAccounts[1].currentBalanceCents = 1000;
  const response = await POST(request({ action: 'reserve_transfer', actionId: 'reserve-0001', fromAccountId: 'bank', toAccountId: 'reserve', amountCents: 3000 }));
  assert.equal(response.status, 200);
  assert.equal(state.financialAccounts[0].currentBalanceCents, 7000);
  assert.equal(state.financialAccounts[1].currentBalanceCents, 4000);
  assert.equal(state.transactions[0].type, 'transfer');
});

test('bloqueia pagamento acima do saldo da conta', async () => {
  state.transactions.length = 0;
  state.financialAccounts[0].currentBalanceCents = 10000;
  state.debts[0].currentBalanceCents = 8000;
  state.debts[0].status = 'active';
  const response = await POST(request({ action: 'debt_payment', actionId: 'payment-0002', debtId: 'debt', fromAccountId: 'bank', amountCents: 9000 }));
  assert.equal(response.status, 400);
});

test('quita dívida e bloqueia pagamento acima do saldo devedor', async () => {
  state.transactions.length = 0;
  state.financialAccounts[0].currentBalanceCents = 10000;
  state.debts[0].currentBalanceCents = 8000;
  state.debts[0].paidAmountCents = 0;
  state.debts[0].status = 'active';
  const over = await POST(request({ action: 'debt_payment', actionId: 'payment-0003', debtId: 'debt', fromAccountId: 'bank', amountCents: 9000 }));
  assert.equal(over.status, 400);
  const paid = await POST(request({ action: 'debt_payment', actionId: 'payment-0004', debtId: 'debt', fromAccountId: 'bank', amountCents: 8000 }));
  assert.equal(paid.status, 200);
  assert.equal(state.debts[0].currentBalanceCents, 0);
  assert.equal(state.debts[0].status, 'settled');
  assert.equal(state.financialAccounts[0].currentBalanceCents, 2000);
});

test('retirada da reserva é idempotente e atualiza os dois saldos', async () => {
  state.transactions.length = 0;
  state.financialAccounts[0].currentBalanceCents = 1000;
  state.financialAccounts[1].currentBalanceCents = 5000;
  const body = { action: 'reserve_transfer', actionId: 'reserve-0002', fromAccountId: 'reserve', toAccountId: 'bank', amountCents: 2000 };
  assert.equal((await POST(request(body))).status, 200);
  await POST(request(body));
  assert.equal(state.financialAccounts[0].currentBalanceCents, 3000);
  assert.equal(state.financialAccounts[1].currentBalanceCents, 3000);
  assert.equal(state.transactions.length, 1);
});
