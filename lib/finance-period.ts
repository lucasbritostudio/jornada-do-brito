import type {
  FinancialAccount,
  FinancialObligation,
  Transaction,
} from './types';

export type MonthFinanceSummary = {
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  plannedIncomeCents: number;
  plannedExpenseCents: number;
  hasClearedTransactions: boolean;
  incomeByCategory: Array<{ category: string; amountCents: number }>;
  expenseByCategory: Array<{ category: string; amountCents: number }>;
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
  const byCategory = (type: Transaction['type']) => {
    const totals = new Map<string, number>();
    for (const item of cleared.filter((entry) => entry.type === type)) {
      const category = item.category?.trim() || 'Sem categoria';
      totals.set(category, (totals.get(category) || 0) + item.amountCents);
    }
    return Array.from(totals, ([category, amountCents]) => ({
      category,
      amountCents,
    })).sort((a, b) => b.amountCents - a.amountCents);
  };

  return {
    incomeCents,
    expenseCents,
    netCents: incomeCents - expenseCents,
    plannedIncomeCents: sum(planned, 'income'),
    plannedExpenseCents: sum(planned, 'expense'),
    hasClearedTransactions: cleared.length > 0,
    incomeByCategory: byCategory('income'),
    expenseByCategory: byCategory('expense'),
  };
}

export function summarizeAvailableCash(
  accounts: FinancialAccount[],
  obligations: FinancialObligation[],
  now = new Date(),
  days = 30,
) {
  const cashAccounts = accounts.filter(
    (account) =>
      account.active && ['cash', 'bank', 'wallet'].includes(account.type),
  );
  const bankCashCents = cashAccounts.reduce(
    (total, account) =>
      total + (account.currentBalanceCents ?? account.openingBalanceCents),
    0,
  );
  const through = new Date(now);
  through.setHours(23, 59, 59, 999);
  through.setDate(through.getDate() + days);
  const plannedObligationsCents = obligations
    .filter((item) => {
      if (item.status !== 'planned') return false;
      if (!item.dueDate) return true;
      const due = new Date(`${item.dueDate.slice(0, 10)}T12:00:00`);
      return !Number.isNaN(due.getTime()) && due <= through;
    })
    .reduce((total, item) => total + item.amountCents, 0);

  return {
    bankCashCents,
    plannedObligationsCents,
    availableCents: bankCashCents - plannedObligationsCents,
    hasCashAccount: cashAccounts.length > 0,
  };
}

export function listUpcomingObligations(
  obligations: FinancialObligation[],
  now = new Date(),
  days = 30,
) {
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  const through = new Date(today);
  through.setDate(through.getDate() + days);

  const items = obligations
    .filter((item) => {
      if (item.status !== 'planned' || !item.dueDate) return false;
      const due = new Date(`${item.dueDate.slice(0, 10)}T12:00:00`);
      return !Number.isNaN(due.getTime()) && due <= through;
    })
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
    .map((item) => ({
      ...item,
      overdue: new Date(`${item.dueDate!.slice(0, 10)}T12:00:00`) < today,
    }));

  return {
    items,
    withoutDueDateCount: obligations.filter(
      (item) => item.status === 'planned' && !item.dueDate,
    ).length,
  };
}
