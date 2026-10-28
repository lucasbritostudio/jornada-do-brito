import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  listUpcomingObligations,
  summarizeAvailableCash,
  summarizeCurrentMonth,
} from '../lib/finance-period';
import type {
  FinancialAccount,
  FinancialObligation,
  Transaction,
} from '../lib/types';

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
  assert.deepEqual(summary.incomeByCategory, [
    { category: 'Sem categoria', amountCents: 50000 },
  ]);
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

function account(overrides: Partial<FinancialAccount>): FinancialAccount {
  return {
    id: 'account-1',
    name: 'Conta de teste',
    type: 'bank',
    openingBalanceCents: 0,
    active: true,
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
    ...overrides,
  };
}

function obligation(overrides: Partial<FinancialObligation>): FinancialObligation {
  return {
    id: 'obligation-1',
    title: 'Conta de teste',
    amountCents: 0,
    kind: 'personal',
    status: 'planned',
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
    ...overrides,
  };
}

test('saldo disponível subtrai só contas planejadas de dinheiro líquido', () => {
  const summary = summarizeAvailableCash(
    [
      account({ id: 'bank', currentBalanceCents: 100000 }),
      account({ id: 'wallet', type: 'wallet', currentBalanceCents: 5000 }),
      account({ id: 'investment', type: 'own_collateral', currentBalanceCents: 30000 }),
      account({ id: 'inactive', active: false, currentBalanceCents: 90000 }),
    ],
    [
      obligation({ id: 'planned', amountCents: 25000 }),
      obligation({ id: 'review', amountCents: 10000, status: 'review' }),
      obligation({ id: 'paid', amountCents: 5000, status: 'paid' }),
      obligation({ id: 'future', amountCents: 40000, dueDate: '2027-01-10' }),
    ],
    new Date('2026-10-28T12:00:00.000Z'),
  );

  assert.equal(summary.bankCashCents, 105000);
  assert.equal(summary.plannedObligationsCents, 25000);
  assert.equal(summary.availableCents, 80000);
  assert.equal(summary.hasCashAccount, true);
});

test('mostra vencidas e próximas, exclui contas pagas/canceladas e conta datas ausentes', () => {
  const result = listUpcomingObligations(
    [
      obligation({ id: 'overdue', dueDate: '2026-10-01' }),
      obligation({ id: 'soon', dueDate: '2026-11-01' }),
      obligation({ id: 'far', dueDate: '2026-12-10' }),
      obligation({ id: 'paid', dueDate: '2026-10-29', status: 'paid' }),
      obligation({ id: 'cancelled', dueDate: '2026-10-29', status: 'cancelled' }),
      obligation({ id: 'undated' }),
    ],
    new Date('2026-10-28T12:00:00.000Z'),
  );

  assert.deepEqual(result.items.map((item) => item.id), ['overdue', 'soon']);
  assert.equal(result.items[0].overdue, true);
  assert.equal(result.items[1].overdue, false);
  assert.equal(result.withoutDueDateCount, 1);
});
