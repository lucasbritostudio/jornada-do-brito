import type {
  ClientExperience,
  ProfessionalPattern,
  WorkspaceState,
} from './types';

function now() {
  return new Date().toISOString();
}

function normalized(value?: string) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function negativePayment(value?: string) {
  const text = normalized(value);
  return /(atras|penden|cobr|nao pag|não pag|metade|falta|demor)/.test(
    text,
  );
}

function stablePattern(
  existing: Map<string, ProfessionalPattern>,
  input: Omit<
    ProfessionalPattern,
    'createdAt' | 'updatedAt' | 'status'
  >,
): ProfessionalPattern {
  const previous = existing.get(input.id);
  const at = now();

  return {
    ...input,
    status: previous?.status || 'active',
    createdAt: previous?.createdAt || at,
    updatedAt: at,
  };
}

function contactLabel(
  state: WorkspaceState,
  contactId?: string,
  fallback?: string,
) {
  if (contactId) {
    const contact = state.contacts.find(
      (item) => item.id === contactId,
    );
    if (contact) return contact.name;
  }
  return fallback || 'Cliente';
}

function clientGroups(state: WorkspaceState) {
  const groups = new Map<string, ClientExperience[]>();

  for (const experience of state.clientExperiences) {
    const key =
      experience.contactId ||
      normalized(experience.clientLabel) ||
      experience.id;
    const list = groups.get(key) || [];
    list.push(experience);
    groups.set(key, list);
  }

  return groups;
}

export function deriveProfessionalPatterns(
  state: WorkspaceState,
): ProfessionalPattern[] {
  const existing = new Map(
    state.professionalPatterns.map((item) => [item.id, item]),
  );
  const next: ProfessionalPattern[] = [];

  for (const [groupKey, experiences] of clientGroups(state)) {
    const sample = experiences[0];
    const client = contactLabel(
      state,
      sample?.contactId,
      sample?.clientLabel,
    );
    const contactId = sample?.contactId;

    const scopeChanges = experiences.filter(
      (item) => item.scopeChanged === true,
    );
    if (scopeChanges.length >= 2) {
      next.push(
        stablePattern(existing, {
          id: `pattern-client-${groupKey}-scope`,
          area: 'client',
          title: `${client}: mudanças de escopo recorrentes`,
          evidenceCount: scopeChanges.length,
          summary:
            'Há pelo menos dois relatos confirmados de mudança de escopo neste relacionamento.',
          recommendation:
            'Definir entregas, limite de revisões e extras por escrito antes de começar.',
          contactId,
          lastObservedAt: scopeChanges
            .map((item) => item.occurredOn)
            .sort()
            .at(-1),
        }),
      );
    }

    const clientDeadlineMisses = experiences.filter(
      (item) => item.clientMetDeadline === false,
    );
    if (clientDeadlineMisses.length >= 2) {
      next.push(
        stablePattern(existing, {
          id: `pattern-client-${groupKey}-client-deadline`,
          area: 'client',
          title: `${client}: retorno do cliente costuma atrasar`,
          evidenceCount: clientDeadlineMisses.length,
          summary:
            'Há pelo menos dois registros em que o cliente não cumpriu o prazo combinado.',
          recommendation:
            'Colocar prazo de aprovação e um próximo passo claro no início do trabalho.',
          contactId,
          lastObservedAt: clientDeadlineMisses
            .map((item) => item.occurredOn)
            .sort()
            .at(-1),
        }),
      );
    }

    const britoDeadlineMisses = experiences.filter(
      (item) => item.britoMetDeadline === false,
    );
    if (britoDeadlineMisses.length >= 2) {
      next.push(
        stablePattern(existing, {
          id: `pattern-client-${groupKey}-brito-deadline`,
          area: 'client',
          title: `${client}: prazo de entrega precisa de proteção`,
          evidenceCount: britoDeadlineMisses.length,
          summary:
            'Há pelo menos dois registros em que o prazo de Brito não foi cumprido.',
          recommendation:
            'Reduzir promessas, reservar margem de edição e confirmar prazo somente depois de medir a carga real.',
          contactId,
          lastObservedAt: britoDeadlineMisses
            .map((item) => item.occurredOn)
            .sort()
            .at(-1),
        }),
      );
    }

    const paymentFriction = experiences.filter((item) =>
      negativePayment(item.paymentExperience),
    );
    if (paymentFriction.length >= 2) {
      next.push(
        stablePattern(existing, {
          id: `pattern-client-${groupKey}-payment`,
          area: 'finance',
          title: `${client}: pagamento exige proteção`,
          evidenceCount: paymentFriction.length,
          summary:
            'O histórico contém repetição de atraso, pendência ou cobrança de pagamento.',
          recommendation:
            'Usar sinal, data definida e regra de liberação do arquivo final.',
          contactId,
          lastObservedAt: paymentFriction
            .map((item) => item.occurredOn)
            .sort()
            .at(-1),
        }),
      );
    }
  }

  for (const area of state.studyAreas) {
    if (
      ['training', 'current'].includes(area.status) &&
      area.currentScore + 0.8 < area.targetScore
    ) {
      next.push(
        stablePattern(existing, {
          id: `pattern-study-gap-${area.key}`,
          area: 'study',
          title: `Treino prioritário: ${area.label}`,
          evidenceCount: 1,
          summary: `Nota atual ${area.currentScore.toFixed(1)}; meta ${area.targetScore.toFixed(1)}.`,
          recommendation:
            'Manter esta habilidade no treino até reduzir a diferença para a meta.',
          lastObservedAt: area.updatedAt,
        }),
      );
    }
  }

  const eventsBySkill = new Map<string, typeof state.studyEvents>();
  for (const event of [...state.studyEvents].sort((a, b) =>
    a.occurredOn.localeCompare(b.occurredOn),
  )) {
    const key = normalized(event.skill);
    const list = eventsBySkill.get(key) || [];
    list.push(event);
    eventsBySkill.set(key, list);
  }

  for (const [skillKey, events] of eventsBySkill) {
    if (events.length < 3) continue;
    const first = events[0];
    const last = events.at(-1)!;
    const firstScore = first.scoreAfter ?? first.score;
    const lastScore = last.scoreAfter ?? last.score;
    const gain = Math.round((lastScore - firstScore) * 10) / 10;

    if (gain >= 1) {
      next.push(
        stablePattern(existing, {
          id: `pattern-study-growth-${skillKey.replace(/[^a-z0-9]+/g, '-')}`,
          area: 'study',
          title: `Evolução consistente: ${last.skill}`,
          evidenceCount: events.length,
          summary: `A nota evoluiu de ${firstScore.toFixed(1)} para ${lastScore.toFixed(1)} no histórico disponível.`,
          recommendation:
            'Levar a habilidade para uma cena real e depois revisar se ela se mantém sob pressão.',
          lastObservedAt: last.occurredOn,
        }),
      );
    }
  }

  const dismissed = state.professionalPatterns.filter(
    (item) =>
      item.status === 'dismissed' &&
      !next.some((candidate) => candidate.id === item.id),
  );

  return [...next, ...dismissed].sort((a, b) =>
    (b.lastObservedAt || b.updatedAt).localeCompare(
      a.lastObservedAt || a.updatedAt,
    ),
  );
}

export function refreshProfessionalPatterns(
  state: WorkspaceState,
) {
  state.professionalPatterns = deriveProfessionalPatterns(state);
  return state;
}
