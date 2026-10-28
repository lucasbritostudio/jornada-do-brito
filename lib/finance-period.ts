import type { Transaction } from './types';

export type MonthFinanceSummary = {
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  plannedIncomeCents: number;
  plannedExpenseCents: number;
  hasClearedTransactions: boolean;
};

/** Separates completed cash movements from estimates for the current month. */
export function summarizeCurrentMonth(
  transactions: Transaction[],
  now = new Date(),
): MonthFinanceSummary {
  const month = now.toISOString().slice(0, 7);
  const monthTransactions = transactions.filter(
    (item) => item.occurredOn.startsWith(month),
  );
  const cleared = monthTransactions.filter((item) => item.status === 'cleared');
  const planned = monthTransactions.filter((item) => item.status === 'planned');
  const sum = (items: Transaction[], type: Transaction['type']) =>
    items
      .filter((item) => item.type === type)
      .reduce((total, item) => total + item.amountCents, 0);

  const incomeCents = sum(cleared, 'income');
  const expenseCents = sum(cleared, 'expense');

  return {
    incomeCents,
    expenseCents,
    netCents: incomeCents - expenseCents,
    plannedIncomeCents: sum(planned, 'income'),
    plannedExpenseCents: sum(planned, 'expense'),
    hasClearedTransactions: cleared.length > 0,
  };
}
