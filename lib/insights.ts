import type { WorkspaceState } from './types';

const brl = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

export function buildInsights(state: WorkspaceState) {
  const today = new Date();
  const horizon = new Date(today.getTime() + 7 * 86400000);
  const overdueDebts = state.debts.filter(
    (d) => d.status === 'active' && d.dueDate && new Date(d.dueDate) < today,
  );
  const upcomingTasks = state.tasks.filter(
    (t) => !['done', 'cancelled'].includes(t.status) && t.dueAt && new Date(t.dueAt) <= horizon,
  );
  const waiting = state.conversations.filter((c) => c.status === 'waiting_me' || c.unreadCount > 0);
  const activeGoals = state.goals.filter((g) => g.status === 'active');
  const openOpps = state.opportunities.filter((o) => !['won', 'lost'].includes(o.stage));
  const month = new Date().toISOString().slice(0, 7);
  const monthTx = state.transactions.filter(
    (t) => t.status !== 'cancelled' && t.occurredOn.startsWith(month),
  );
  const income = monthTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amountCents, 0);
  const expense = monthTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amountCents, 0);

  const recommendations: {
    title: string;
    detail: string;
    kind: 'attention' | 'good' | 'info';
  }[] = [];

  if (waiting.length) {
    recommendations.push({
      title: `${waiting.length} conversa(s) esperando você`,
      detail: 'Responder clientes primeiro evita oportunidades esquecidas.',
      kind: 'attention',
    });
  }

  if (overdueDebts.length) {
    recommendations.push({
      title: `${overdueDebts.length} dívida(s) vencida(s)`,
      detail: `Saldo registrado: ${brl(overdueDebts.reduce((s, d) => s + d.currentBalanceCents, 0))}.`,
      kind: 'attention',
    });
  }

  if (upcomingTasks.length) {
    recommendations.push({
      title: `${upcomingTasks.length} tarefa(s) nos próximos 7 dias`,
      detail: 'Priorize as de prazo curto e alto impacto.',
      kind: 'info',
    });
  }

  if (openOpps.length) {
    recommendations.push({
      title: `${openOpps.length} oportunidade(s) em aberto`,
      detail: 'Revise as que estão sem próxima ação definida.',
      kind: 'info',
    });
  }

  if (
    activeGoals.length &&
    !state.tasks.some((t) => t.goalId && !['done', 'cancelled'].includes(t.status))
  ) {
    recommendations.push({
      title: 'Objetivos sem missão ativa',
      detail: 'Transforme ao menos um objetivo em uma ação concreta para esta semana.',
      kind: 'info',
    });
  }

  if (income || expense) {
    recommendations.push({
      title: `Mês: ${brl(income - expense)} líquido`,
      detail: `Entradas ${brl(income)} · Saídas ${brl(expense)}.`,
      kind: income >= expense ? 'good' : 'attention',
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      title: 'Base limpa e pronta',
      detail: 'Comece registrando um cliente, uma movimentação financeira ou um objetivo.',
      kind: 'good',
    });
  }

  return recommendations.slice(0, 6);
}
