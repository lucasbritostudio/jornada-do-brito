import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { getState, saveState, audit } from '@/lib/store';
import { buildInsights } from '@/lib/insights';
import {
  generateWithJornadaTools,
  llmStatus,
  LlmProviderError,
  type LlmMessage,
} from '@/lib/llm';
import { safeSystemPolicy, sanitizeForLlm } from '@/lib/ai-policy';
import { CINEMA_DECISION_RULE, VIDEO_PROFESSIONAL_METHOD } from '@/lib/professional-method';
import {
  JORNADA_TOOLS,
  createActionProposal,
  createUndoToken,
  executeAction,
  normalizeAction,
} from '@/lib/ai-actions';

export const runtime = 'nodejs';

function shouldIncludeVideoMethod(prompt: string) {
  return /(video|vídeo|grava|film|capta|enquadra|composi|luz|audio|áudio|gimbal|take|roteiro|loca[cç][aã]o)/i.test(
    prompt,
  );
}

function clientContext(
  state: Awaited<ReturnType<typeof getState>>,
  prompt: string,
) {
  const lower = prompt.toLocaleLowerCase('pt-BR');
  const named = state.contacts.filter((contact) =>
    lower.includes(contact.name.toLocaleLowerCase('pt-BR')),
  );
  const wantsClients = /cliente|trabalho|projeto|negocia|garreto|berg|juliany|max|naiara|tarcisio|tarcísio/i.test(
    prompt,
  );
  if (!named.length && !wantsClients) return [];

  const contacts = named.length ? named : state.contacts.slice(0, 12);
  return contacts.slice(0, 12).map((contact) => {
    const experiences = state.clientExperiences
      .filter(
        (item) =>
          item.contactId === contact.id ||
          item.clientLabel
            .toLocaleLowerCase('pt-BR')
            .includes(contact.name.toLocaleLowerCase('pt-BR')),
      )
      .slice(0, 4);

    const projects = state.projects
      .filter((item) => item.contactId === contact.id)
      .slice(0, 4);

    const patterns = state.professionalPatterns
      .filter(
        (item) =>
          item.status === 'active' &&
          item.contactId === contact.id,
      )
      .slice(0, 4);

    return {
      name: sanitizeForLlm(contact.name),
      company: contact.company
        ? sanitizeForLlm(contact.company)
        : undefined,
      role: contact.role
        ? sanitizeForLlm(contact.role)
        : undefined,
      lifecycle: contact.lifecycle,
      nextAction: contact.nextAction
        ? sanitizeForLlm(contact.nextAction)
        : undefined,
      risks: contact.risks?.map(sanitizeForLlm).slice(0, 5),
      opportunities: contact.opportunities
        ?.map(sanitizeForLlm)
        .slice(0, 5),
      projects: projects.map((project) => ({
        name: sanitizeForLlm(project.name),
        status: project.status,
        dueDate: project.dueDate,
        nextAction: project.nextAction
          ? sanitizeForLlm(project.nextAction)
          : undefined,
      })),
      learned: experiences.map((experience) => ({
        occurredOn: experience.occurredOn,
        whatHappened: sanitizeForLlm(
          experience.whatHappened,
        ),
        learnedRule: experience.learnedRule
          ? sanitizeForLlm(experience.learnedRule)
          : undefined,
        mistakeToAvoid: experience.mistakeToAvoid
          ? sanitizeForLlm(experience.mistakeToAvoid)
          : undefined,
        patternToKeep: experience.patternToKeep
          ? sanitizeForLlm(experience.patternToKeep)
          : undefined,
      })),
      patterns: patterns.map((pattern) => ({
        title: sanitizeForLlm(pattern.title),
        evidenceCount: pattern.evidenceCount,
        summary: sanitizeForLlm(pattern.summary),
        recommendation: pattern.recommendation
          ? sanitizeForLlm(pattern.recommendation)
          : undefined,
      })),
    };
  });
}

function videoMethodContext(prompt: string) {
  if (!shouldIncludeVideoMethod(prompt)) return undefined;
  return {
    decisionRule: CINEMA_DECISION_RULE,
    sections: VIDEO_PROFESSIONAL_METHOD.map((section) => ({
      title: section.title,
      questions: section.questions,
    })),
  };
}

function compactContext(state: Awaited<ReturnType<typeof getState>>, prompt: string) {
  const month = new Date().toISOString().slice(0, 7);
  const tx = state.transactions.filter(
    (t) => t.status !== 'cancelled' && t.occurredOn.startsWith(month),
  );
  const income = tx
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amountCents, 0);
  const expense = tx
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amountCents, 0);

  return {
    contactsCount: state.contacts.length,
    opportunitiesOpen: state.opportunities.filter(
      (o) => !['won', 'lost'].includes(o.stage),
    ).length,
    projectsActive: state.projects.filter((p) =>
      ['planned', 'active', 'waiting_client', 'review'].includes(p.status),
    ).length,
    month: {
      incomeCents: income,
      expenseCents: expense,
      netCents: income - expense,
    },
    activeDebt: {
      structuralTotalCents: state.debts
        .filter((d) => d.status === 'active' && d.structural !== false)
        .reduce((sum, d) => sum + d.currentBalanceCents, 0),
      count: state.debts.filter((d) => d.status === 'active').length,
    },
    receivables: state.receivables
      .filter((item) => item.status === 'pending')
      .slice(0, 10)
      .map((item) => ({
        title: sanitizeForLlm(item.title),
        amountCents: item.amountCents,
        certainty: item.certainty,
        expectedOn: item.expectedOn,
        expectedWindow: item.expectedWindow,
      })),
    obligations: state.obligations
      .filter((item) => item.status === 'planned' || item.status === 'review')
      .slice(0, 10)
      .map((item) => ({
        title: sanitizeForLlm(item.title),
        amountCents: item.amountCents,
        dueDate: item.dueDate,
        status: item.status,
      })),
    goals: state.goals
      .filter((g) => g.status === 'active')
      .map((g) => ({
        title: sanitizeForLlm(g.title),
        targetDate: g.targetDate,
        currentValue: g.currentValue,
        targetValue: g.targetValue,
      }))
      .slice(0, 8),
    tasks: state.tasks
      .filter((t) => !['done', 'cancelled'].includes(t.status))
      .map((t) => ({
        title: sanitizeForLlm(t.title),
        priority: t.priority,
        dueAt: t.dueAt,
      }))
      .slice(0, 12),
    study: {
      areas: state.studyAreas.slice(0, 10).map((area) => ({
        label: sanitizeForLlm(area.label),
        currentScore: area.currentScore,
        targetScore: area.targetScore,
        status: area.status,
      })),
      lastEvents: state.studyEvents.slice(0, 5).map((event) => ({
        skill: sanitizeForLlm(event.skill),
        score: event.score,
        scoreAfter: event.scoreAfter,
        take: event.take,
        occurredOn: event.occurredOn,
      })),
    },
    recentClientLearning: state.clientExperiences.slice(0, 5).map((item) => ({
      client: sanitizeForLlm(item.clientLabel),
      learnedRule: item.learnedRule
        ? sanitizeForLlm(item.learnedRule)
        : undefined,
      nextAction: item.nextAction
        ? sanitizeForLlm(item.nextAction)
        : undefined,
    })),
    inboxPending: state.inbox.filter(
      (item) => item.status === 'new' || item.status === 'needs_review',
    ).length,
    professionalPatterns: state.professionalPatterns
      .filter((item) => item.status === 'active')
      .slice(0, 8)
      .map((item) => ({
        area: item.area,
        title: sanitizeForLlm(item.title),
        evidenceCount: item.evidenceCount,
        summary: sanitizeForLlm(item.summary),
        recommendation: item.recommendation
          ? sanitizeForLlm(item.recommendation)
          : undefined,
      })),
    relevantClients: clientContext(state, prompt),
    videoMethod: videoMethodContext(prompt),
    conversationsWaiting: state.conversations.filter(
      (c) => c.status === 'waiting_me' || c.unreadCount > 0,
    ).length,
  };
}

function localFallback(state: Awaited<ReturnType<typeof getState>>, reason: string) {
  const items = buildInsights(state)
    .slice(0, 4)
    .map((item) => `• ${item.title}: ${item.detail}`)
    .join('\n');

  return [
    'A IA externa não está disponível agora, então usei a análise local da Jornada.',
    reason,
    '',
    items || 'Ainda não há dados suficientes para gerar uma recomendação.',
  ].join('\n');
}

export async function GET() {
  try {
    await requireAuthenticated();
    return NextResponse.json(await llmStatus());
  } catch {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAuthenticated();
    const body = await req.json();
    const prompt = sanitizeForLlm(String(body?.message || '').trim());

    if (!prompt) {
      return NextResponse.json({ error: 'Mensagem vazia.' }, { status: 400 });
    }

    const state = await getState();
    const context = compactContext(state, prompt);
    const history: LlmMessage[] = Array.isArray(body?.history)
      ? body.history
          .slice(-8)
          .filter(
            (message: any) =>
              ['user', 'assistant'].includes(message?.role) &&
              typeof message?.content === 'string',
          )
          .map((message: any) => ({
            role: message.role,
            content: sanitizeForLlm(message.content).slice(0, 2000),
          }))
      : [];

    const messages: LlmMessage[] = [
      {
        role: 'system',
        content:
          safeSystemPolicy() +
          '\n\nCONTEXTO MÍNIMO ESTRUTURADO DA JORNADA:\n' +
          JSON.stringify(context),
      },
      ...history,
      { role: 'user', content: prompt },
    ];

    try {
      const result = await generateWithJornadaTools(messages, JORNADA_TOOLS);
      audit(state, {
        action: 'ai.chat.completed',
        collection: 'ai',
        summary: `${result.provider}/${result.model} · ${result.usage?.totalTokens ?? 0} tokens`,
      });

      if (result.action) {
        const normalized = normalizeAction(
          result.action.name,
          result.action.args,
        );

        if (state.settings.ai.autoSaveLowRiskExplicitCommands) {
          const executed = executeAction(state, normalized);
          const undoToken = createUndoToken(
            executed.collection,
            executed.entityId,
            state.settings.ai.undoWindowMinutes,
          );

          audit(state, {
            action: 'ai.action.executed',
            collection: executed.collection,
            recordId: executed.entityId,
            summary: executed.message,
          });
          await saveState(state);

          return NextResponse.json({
            ...result,
            action: undefined,
            executed: {
              name: normalized.name,
              message: executed.message,
              undoToken,
              undoMinutes: state.settings.ai.undoWindowMinutes,
            },
            text: executed.message,
            fallback: false,
          });
        }

        const action = createActionProposal(
          normalized.name,
          normalized.args,
        );
        audit(state, {
          action: 'ai.action.proposed',
          collection: normalized.name,
          summary: action.summary,
        });
        await saveState(state);
        return NextResponse.json({
          ...result,
          action,
          text: 'Preparei um registro. Confira abaixo antes de salvar.',
          fallback: false,
        });
      }

      await saveState(state);
      return NextResponse.json({
        ...result,
        fallback: false,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'FREE_LLM_NOT_CONFIGURED') {
        return NextResponse.json({
          text: localFallback(
            state,
            'A estrutura da Groq está pronta; falta apenas a chave da conta gratuita.',
          ),
          provider: 'local',
          model: 'local-rules',
          fallback: true,
          code: 'FREE_LLM_NOT_CONFIGURED',
        });
      }

      if (error instanceof LlmProviderError) {
        audit(state, {
          action: 'ai.chat.fallback',
          collection: 'ai',
          summary: `${error.provider} HTTP ${error.status ?? 'erro'}`,
        });
        await saveState(state);
        return NextResponse.json({
          text: localFallback(
            state,
            error.status === 429
              ? 'O limite gratuito da Groq foi atingido temporariamente.'
              : 'A Groq não respondeu, sem afetar seus dados.',
          ),
          provider: 'local',
          model: 'local-rules',
          fallback: true,
          retryAfter: error.retryAfter,
        });
      }

      throw error;
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'A Jornada IA não respondeu agora.',
      },
      { status: 502 },
    );
  }
}
