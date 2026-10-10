import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { audit, getState, saveState } from '@/lib/store';
import type { ConversationAutomationMode } from '@/lib/types';

export const runtime = 'nodejs';

const allowed: ConversationAutomationMode[] = [
  'ai',
  'human',
  'suggest',
  'off',
];

export async function POST(req: Request) {
  try {
    await requireAuthenticated();
    const body = await req.json();
    const conversationId = String(body?.conversationId || '');
    const mode = String(body?.mode || '') as ConversationAutomationMode;

    if (!conversationId || !allowed.includes(mode)) {
      return NextResponse.json(
        { error: 'Dados inválidos.' },
        { status: 400 },
      );
    }

    const state = await getState();
    const conversation = state.conversations.find(
      (item) => item.id === conversationId,
    );
    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversa não encontrada.' },
        { status: 404 },
      );
    }

    const at = new Date().toISOString();
    conversation.automationMode = mode;
    conversation.updatedAt = at;

    if (mode === 'human') {
      conversation.humanTakeoverAt = at;
      conversation.aiResumeAt = undefined;
    } else if (mode === 'ai') {
      conversation.humanTakeoverAt = undefined;
      conversation.aiResumeAt = at;
    }

    audit(state, {
      action: 'whatsapp.automation.mode.changed',
      collection: 'conversations',
      recordId: conversation.id,
      summary: `Modo: ${mode}`,
    });

    await saveState(state);
    return NextResponse.json({
      ok: true,
      automationMode: conversation.automationMode,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { error: 'Não autorizado.' },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { error: 'Não foi possível alterar o modo.' },
      { status: 500 },
    );
  }
}
