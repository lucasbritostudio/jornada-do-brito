import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { getState, saveState, audit } from '@/lib/store';
import { buildInsights } from '@/lib/insights';
import {
  generateWithFreeLlm,
  generateWithJornadaTools,
  llmStatus,
  LlmProviderError,
  type LlmMessage,
} from '@/lib/llm';
import { safeSystemPolicy, sanitizeForLlm } from '@/lib/ai-policy';
import { JORNADA_TOOLS, createActionProposal } from '@/lib/ai-actions';

export const runtime = 'nodejs';

function compactContext(state: Awaited<ReturnType<typeof getState>>) {
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
      totalCents: state.debts
        .filter((d) => d.status === 'active')
        .reduce((sum, d) => sum + d.currentBalanceCents, 0),
      count: state.debts.filter((d) => d.status === 'active').length,
    },
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
    const context = compactContext(state);
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
      let action;
      if (result.action) {
        action = createActionProposal(result.action.name, result.action.args);
        audit(state, {
          action: 'ai.action.proposed',
          collection: result.action.name,
          summary: action.summary,
        });
      }
      await saveState(state);
      return NextResponse.json({
        ...result,
        action,
        text: action ? 'Preparei um registro. Confira abaixo antes de salvar.' : result.text,
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
      { error: 'A Jornada IA não respondeu agora.' },
      { status: 502 },
    );
  }
}
