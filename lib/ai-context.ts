/** Match a person's actual written name, never a substring in other words. */
export function containsNameMention(prompt: string, name: string) {
  const normalize = (text: string) => text.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const target = normalize(name.trim());
  if (target.length < 3) return false;
  const text = normalize(prompt);
  let start = 0;
  while (start < text.length) {
    const at = text.indexOf(target, start);
    if (at < 0) return false;
    const left = at === 0 || !/[a-z0-9]/.test(text[at - 1]);
    const end = at + target.length;
    const right = end === text.length || !/[a-z0-9]/.test(text[end]);
    if (left && right) return true;
    start = at + 1;
  }
  return false;
}

/**
 * Minimize private workspace context BEFORE it leaves Jornada for an external
 * LLM. Only explicit, relevant domains are included. Counts are not PII.
 * Actions continue to run locally on full authenticated state.
 */
export function minimizeAiContext(
  context: Record<string, unknown>,
  prompt: string,
): Record<string, unknown> {
  const finance = /finan[cç]|dinheiro|saldo|d[ií]vid|cobr|receb|paga|gasto|despesa|lucro|receita|banc[aá]ri|banco|pix|extrato|or[cç]amento|fatura|cart[aã]o|parcel/i.test(prompt);
  const clients = /cliente|contrat|negocia|or[cç]amento|briefing|propost|cobran[cç]a|projeto|trabalho|atendimento/i.test(prompt)
    || (Array.isArray(context.relevantClients) &&
      context.relevantClients.some((candidate) => {
        const name = typeof candidate === 'object' && candidate !== null
          ? String((candidate as { name?: unknown }).name || '').toLocaleLowerCase('pt-BR')
          : '';
        return containsNameMention(prompt, name);
      }));
  const study = /estud|aprend|trein|aula|nota|habilidade|cinema|film|v[ií]deo|roteiro|gimbal|composi[cç]|enquadra|c[aâ]mera|grav/i.test(prompt);
  const planning = /tarefa|meta|plano|agenda|prioridade|prazo|planeja|organiza|pend[eê]ncia|hoje|amanh[aã]|semana/i.test(prompt);
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
    // Client-specific experiences/patterns are already nested in matching
    // relevantClients; the global recent-client list may identify third parties.
    minimal.relevantClients = context.relevantClients;
  }
  if (study) {
    minimal.study = context.study;
    minimal.videoMethod = context.videoMethod;
    if (!clients) minimal.professionalPatterns = context.professionalPatterns;
  }
  if (planning) {
    minimal.tasks = context.tasks;
    minimal.goals = context.goals;
  }
  return minimal;
}
