/**
 * Minimize private workspace context BEFORE it leaves Jornada for an external
 * LLM. Only explicit, relevant domains are included. Counts are not PII.
 * Actions continue to run locally on full authenticated state.
 */
export function minimizeAiContext(
  context: Record<string, unknown>,
  prompt: string,
): Record<string, unknown> {
  const finance = /finan[cç]|dinheiro|saldo|d[ií]vid|cobr|receb|paga|gasto|despesa|lucro|receita|conta|or[cç]amento|fatura|cart[aã]o|parcel/i.test(prompt);
  const clients = /cliente|contrat|negocia|or[cç]amento|briefing|propost|cobran[cç]a|projeto|trabalho|atendimento/i.test(prompt);
  const study = /estud|aprend|trein|aula|nota|habilidade|cinema|film|v[ií]deo|roteiro|gimbal|composi[cç]|enquadra|c[aâ]mera|grav/i.test(prompt);
  const planning = /tarefa|meta|plano|agenda|prioridade|prazo|planeja|organiza|pend[eê]ncia/i.test(prompt);
  const minimal: Record<string, unknown> = {
    contactsCount: context.contactsCount,
    opportunitiesOpen: context.opportunitiesOpen,
    projectsActive: context.projectsActive,
    inboxPending: context.inboxPending,
    conversationsWaiting: context.conversationsWaiting,
  };

  if (finance) {
    // Aggregates and pending totals are relevant to finance questions. Never
    // send creditor names, account identifiers or raw transaction histories.
    const money = context.month as Record<string, unknown> | undefined;
    if (money) minimal.month = {
      incomeCents: money.incomeCents,
      expenseCents: money.expenseCents,
      netCents: money.netCents,
    };
    const debt = context.activeDebt as Record<string, unknown> | undefined;
    if (debt) minimal.activeDebt = {
      structuralTotalCents: debt.structuralTotalCents,
      count: debt.count,
    };
    // The user's local UI always retains individual receivables/obligations;
    // external LLM needs only totals until a scoped disclosure UI exists.
    const receivables = Array.isArray(context.receivables) ? context.receivables : [];
    const obligations = Array.isArray(context.obligations) ? context.obligations : [];
    minimal.pendingReceivables = receivables.length;
    minimal.pendingObligations = obligations.length;
  }

  if (clients) {
    // Relevant client names are necessary for some user-requested work, but
    // no client data leaves the workspace for unrelated prompts.
    minimal.relevantClients = context.relevantClients;
    minimal.recentClientLearning = context.recentClientLearning;
    minimal.professionalPatterns = context.professionalPatterns;
  }
  if (study) {
    minimal.study = context.study;
    minimal.videoMethod = context.videoMethod;
    if (!clients) minimal.professionalPatterns = context.professionalPatterns;
  }
  if (planning || clients) {
    minimal.tasks = context.tasks;
    minimal.goals = context.goals;
  }
  return minimal;
}
