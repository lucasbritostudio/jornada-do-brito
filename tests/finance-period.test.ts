import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeCurrentMonth } from '../lib/finance-period';
import type { Transaction } from '../lib/types';

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'tx-1',
    type: 'income',
    amountCents: 0,
    occurredOn: '2026-10-10',
    description: 'Registro de teste',
    status: 'cleared',
    createdAt: '2026-10-10T12:00:00.000Z',
    updatedAt: '2026-10-10T12:00:00.000Z',
    ...overrides,
  };
}

test('separa movimentações realizadas das previstas no mês atual', () => {
  const summary = summarizeCurrentMonth([
    tx({ id: 'income', amountCents: 50000 }),
    tx({ id: 'expense', type: 'expense', amountCents: 12000 }),
    tx({ id: 'planned-income', amountCents: 30000, status: 'planned' }),
    tx({ id: 'planned-expense', type: 'expense', amountCents: 8000, status: 'planned' }),
    tx({ id: 'cancelled', amountCents: 99999, status: 'cancelled' }),
    tx({ id: 'other-month', occurredOn: '2026-09-30', amountCents: 70000 }),
  ], new Date('2026-10-20T12:00:00.000Z'));

  assert.equal(summary.incomeCents, 50000);
  assert.equal(summary.expenseCents, 12000);
  assert.equal(summary.netCents, 38000);
  assert.equal(summary.plannedIncomeCents, 30000);
  assert.equal(summary.plannedExpenseCents, 8000);
  assert.equal(summary.hasClearedTransactions, true);
});

test('indica quando ainda não há movimentação confirmada', () => {
  const summary = summarizeCurrentMonth([
    tx({ id: 'planned', status: 'planned', amountCents: 10000 }),
  ], new Date('2026-10-20T12:00:00.000Z'));

  assert.equal(summary.incomeCents, 0);
  assert.equal(summary.netCents, 0);
  assert.equal(summary.plannedIncomeCents, 10000);
  assert.equal(summary.hasClearedTransactions, false);
});
