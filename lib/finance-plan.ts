import type { Debt, FinancialAccount, FinancialObligation, Transaction } from './types';

const monthKey = (date: Date) => date.toISOString().slice(0, 7);
const cents = (value: number) => Math.round(value);

export function buildFinancePlan(input: {
  transactions: Transaction[];
  obligations: FinancialObligation[];
  debts: Debt[];
  accounts: FinancialAccount[];
  now?: Date;
}) {
  const now = input.now || new Date();
  const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const completedMonths = [1, 2, 3].map((offset) => {
    const d = new Date(currentMonth);
    d.setUTCMonth(d.getUTCMonth() - offset);
    return monthKey(d);
  });
  const actuals = input.transactions.filter((item) => item.status === 'cleared' && completedMonths.includes(item.occurredOn.slice(0, 7)));
  const incomeByMonth = completedMonths.map((month) => actuals.filter((item) => item.occurredOn.startsWith(month) && item.type === 'income').reduce((sum, item) => sum + item.amountCents, 0));
  const expenseByMonth = completedMonths.map((month) => actuals.filter((item) => item.occurredOn.startsWith(month) && item.type === 'expense').reduce((sum, item) => sum + item.amountCents, 0));
  const monthsWithIncome = incomeByMonth.filter((value) => value > 0).length;
  const averageIncomeCents = monthsWithIncome ? cents(incomeByMonth.reduce((a, b) => a + b, 0) / 3) : null;
  const averageExpenseCents = actuals.some((item) => item.type === 'expense') ? cents(expenseByMonth.reduce((a, b) => a + b, 0) / 3) : null;
  const monthlySurplusCents = averageIncomeCents !== null && averageExpenseCents !== null ? averageIncomeCents - averageExpenseCents : null;

  const categoryMonths = new Map<string, Map<string, number>>();
  for (const item of actuals.filter((entry) => entry.type === 'expense')) {
    const category = item.category?.trim() || 'Sem categoria';
    const monthly = categoryMonths.get(category) || new Map<string, number>();
    monthly.set(item.occurredOn.slice(0, 7), (monthly.get(item.occurredOn.slice(0, 7)) || 0) + item.amountCents);
    categoryMonths.set(category, monthly);
  }
  const suggestedLimits = Array.from(categoryMonths, ([category, monthly]) => ({
    category,
    averageCents: cents(completedMonths.reduce((sum, month) => sum + (monthly.get(month) || 0), 0) / 3),
    limitCents: cents(completedMonths.reduce((sum, month) => sum + (monthly.get(month) || 0), 0) / 3 * 0.9),
    observedMonths: Array.from(monthly.keys()).length,
  })).filter((item) => item.observedMonths >= 2).sort((a, b) => b.averageCents - a.averageCents);

  const start = new Date(currentMonth);
  const forecast = Array.from({ length: 3 }, (_, offset) => {
    const monthDate = new Date(start);
    monthDate.setUTCMonth(monthDate.getUTCMonth() + offset);
    const key = monthKey(monthDate);
    const items = input.obligations.filter((item) => item.status === 'planned' && item.dueDate && item.dueDate.slice(0, 7) === key);
    const recurring = input.obligations.filter((item) => item.status === 'planned' && item.recurring && item.dueDate && item.dueDate.slice(0, 7) < key);
    const recurringItems = recurring.map((item) => ({ ...item, dueDate: `${key}-${String(Math.min(Number(item.dueDate!.slice(8, 10)), new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0)).getUTCDate())).padStart(2, '0')}` }));
    const unique = new Map([...items, ...recurringItems].map((item) => [item.id, item]));
    return { month: key, obligations: Array.from(unique.values()), totalCents: Array.from(unique.values()).reduce((sum, item) => sum + item.amountCents, 0) };
  });

  const normalize = (value: string) => value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const currentRecurring = forecast[0].obligations.filter((item) => item.recurring);
  const untrackedRecurringCents = currentRecurring
    .filter((obligation) => !actuals.some((transaction) => transaction.type === 'expense' && normalize(transaction.description).includes(normalize(obligation.title))))
    .reduce((sum, item) => sum + item.amountCents, 0);
  const plannedMonthlySurplusCents = monthlySurplusCents === null ? null : monthlySurplusCents - untrackedRecurringCents;

  const reserveAccounts = input.accounts.filter((item) => item.active && item.type === 'reserve');
  const reserveBalanceCents = reserveAccounts.reduce((sum, item) => sum + (item.currentBalanceCents ?? item.openingBalanceCents), 0);
  const savedReserveTargetCents = reserveAccounts.reduce((sum, item) => sum + (item.targetBalanceCents || 0), 0);
  const reserveTargetCents = savedReserveTargetCents || (averageExpenseCents === null ? 0 : averageExpenseCents * 3);
  const reserveTargetIsEstimated = savedReserveTargetCents === 0 && reserveTargetCents > 0;
  const suggestedReserveCents = plannedMonthlySurplusCents && plannedMonthlySurplusCents > 0 ? cents(plannedMonthlySurplusCents * 0.1) : 0;
  const reserveMonthlyCents = reserveTargetCents > 0
    ? Math.min(suggestedReserveCents, Math.max(0, reserveTargetCents - reserveBalanceCents))
    : suggestedReserveCents;

  const priorityRank = { critical: 4, high: 3, medium: 2, low: 1 } as const;
  const activeDebts = input.debts.filter((item) => item.status === 'active' && item.currentBalanceCents > 0)
    .sort((a, b) => (priorityRank[b.priority || 'medium'] - priorityRank[a.priority || 'medium']) || (b.interestRate ?? -1) - (a.interestRate ?? -1) || a.currentBalanceCents - b.currentBalanceCents);
  const minimumDebtPaymentCents = activeDebts.reduce((sum, item) => sum + (item.monthlyCommitmentCents || 0), 0);
  let paymentCapacity = plannedMonthlySurplusCents === null ? 0 : Math.max(0, plannedMonthlySurplusCents - reserveMonthlyCents);
  const paymentByDebt = new Map<string, number>();
  for (const debt of activeDebts) {
    const payment = Math.min(debt.currentBalanceCents, debt.monthlyCommitmentCents || 0, paymentCapacity);
    paymentByDebt.set(debt.id, payment);
    paymentCapacity -= payment;
  }
  if (activeDebts.length && paymentCapacity > 0) {
    const first = activeDebts[0];
    paymentByDebt.set(first.id, Math.min(first.currentBalanceCents, (paymentByDebt.get(first.id) || 0) + paymentCapacity));
  }
  const debtPlan = activeDebts.map((debt) => {
    const monthlyPlanCents = paymentByDebt.get(debt.id) || 0;
    return { debtId: debt.id, creditor: debt.creditorName, balanceCents: debt.currentBalanceCents, monthlyPlanCents, estimatedMonths: monthlyPlanCents ? Math.ceil(debt.currentBalanceCents / monthlyPlanCents) : null, priority: debt.priority || 'medium', interestKnown: debt.interestRate !== undefined };
  });

  return { completedMonths, monthsWithIncome, averageIncomeCents, averageExpenseCents, monthlySurplusCents, plannedMonthlySurplusCents, untrackedRecurringCents, suggestedLimits, forecast, reserveBalanceCents, reserveTargetCents, reserveTargetIsEstimated, reserveMonthlyCents, minimumDebtPaymentCents, debtPlan };
}
