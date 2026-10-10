import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { getState } from '@/lib/store';
import { generateWithFreeLlm, llmStatus, type LlmMessage } from '@/lib/llm';

export const runtime = 'nodejs';

function compactContext(state: Awaited<ReturnType<typeof getState>>) {
  const month = new Date().toISOString().slice(0, 7);
  const tx = state.transactions.filter((t) => t.status !== 'cancelled' && t.occurredOn.startsWith(month));
  const income = tx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amountCents, 0);
  const expense = tx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amountCents, 0);
  return {
    summary: {
      contacts: state.contacts.length,
      opportunitiesOpen: state.opportunities.filter((o) => !['won', 'lost'].includes(o.stage)).length,
      projectsActive: state.projects.filter((p) => ['planned', 'active', 'waiting_client', 'review'].includes(p.status)).length,
      incomeMonthCents: income,
      expenseMonthCents: expense,
      activeDebtCents: state.debts.filter((d) => d.status === 'active').reduce((s, d) => s + d.currentBalanceCents, 0),
      activeGoals: state.goals.filter((g) => g.status === 'active').map((g) => ({
        title: g.title,
        targetDate: g.targetDate,
        currentValue: g.currentValue,
        targetValue: g.targetValue,
      })).slice(0, 8),
      pendingTasks: state.tasks.filter((t) => !['done', 'cancelled'].includes(t.status)).map((t) => ({
        title: t.title,
        priority: t.priority,
        dueAt: t.dueAt,
      })).slice(0, 12),
      conversationsWaiting: state.conversations.filter((c) => c.status === 'waiting_me' || c.unreadCount > 0).length,
    },
  };
}

export async function GET() {
  try {
    await requireAuthenticated();
    return NextResponse.json(llmStatus());
  } catch {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAuthenticated();
    const body = await req.json();
    const prompt = String(body?.message || '').trim();
    if (!prompt) return NextResponse.json({ error: 'Mensagem vazia.' }, { status: 400 });
    if (prompt.length > 5000) return NextResponse.json({ error: 'Mensagem muito longa.' }, { status: 413 });

    const state = await getState();
    const context = compactContext(state);
    const history = Array.isArray(body?.history)
      ? body.history.slice(-8).filter((m: any) => ['user','assistant'].includes(m?.role) && typeof m?.content === 'string')
      : [];

    const messages: LlmMessage[] = [
      {
        role: 'system',
        content:
          'Você é a IA da Jornada do Brito. Seja prática, simples e orientada a ação. ' +
          'Use somente os dados resumidos fornecidos como fatos. Não invente valores, clientes, dívidas ou prazos. ' +
          'Não autorize pagamentos, transferências nem envio automático de mensagens. ' +
          'Quando faltar dado, diga claramente o que falta. Responda em português do Brasil.\n\n' +
          'CONTEXTO ESTRUTURADO ATUAL:\n' + JSON.stringify(context),
      },
      ...history,
      { role: 'user', content: prompt },
    ];

    const result = await generateWithFreeLlm(messages);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FREE_LLM_NOT_CONFIGURED') {
      return NextResponse.json({
        error: 'LLM gratuito ainda sem chave configurada.',
        code: 'FREE_LLM_NOT_CONFIGURED',
      }, { status: 409 });
    }
    return NextResponse.json({ error: 'A IA gratuita não respondeu agora. Tente novamente.' }, { status: 502 });
  }
}
