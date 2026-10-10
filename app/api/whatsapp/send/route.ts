import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { getState, saveState, audit } from '@/lib/store';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    await requireAuthenticated();

    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId) {
      return NextResponse.json(
        { error: 'WhatsApp oficial ainda não conectado.' },
        { status: 409 },
      );
    }

    const body = await req.json();
    const conversationId = String(body?.conversationId || '');
    const messageText = String(body?.text || '').trim();
    const origin = body?.origin === 'ai' ? 'ai' : 'human_jornada';

    const state = await getState();
    const conversation = state.conversations.find(
      (item) => item.id === conversationId,
    );
    const contact = state.contacts.find(
      (item) => item.id === conversation?.contactId,
    );

    if (!conversation || !contact?.phone || !messageText) {
      return NextResponse.json(
        { error: 'Dados incompletos.' },
        { status: 400 },
      );
    }

    if (
      origin === 'ai' &&
      (!state.settings.whatsappAutomation.enabled ||
        conversation.automationMode !== 'ai')
    ) {
      return NextResponse.json(
        { error: 'A IA não está autorizada a responder esta conversa.' },
        { status: 409 },
      );
    }

    const graphVersion =
      process.env.WHATSAPP_GRAPH_VERSION || 'v25.0';
    const response = await fetch(
      `https://graph.facebook.com/${graphVersion}/${phoneId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: contact.phone,
          type: 'text',
          text: { body: messageText },
        }),
      },
    );

    const json = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        {
          error: 'Falha ao enviar pela Meta.',
          details: json,
        },
        { status: 502 },
      );
    }

    const at = new Date().toISOString();
    const providerMessageId = json.messages?.[0]?.id;

    state.messages.unshift({
      id: crypto.randomUUID(),
      conversationId: conversation.id,
      contactId: contact.id,
      direction: 'outbound',
      text: messageText,
      providerMessageId,
      status: 'sent',
      aiGenerated: origin === 'ai',
      origin,
      createdAt: at,
    });

    conversation.status = 'waiting_client';
    conversation.unreadCount = 0;
    conversation.lastMessageAt = at;
    conversation.updatedAt = at;

    if (
      origin === 'human_jornada' &&
      state.settings.whatsappAutomation.humanTakeoverStopsAi
    ) {
      conversation.automationMode = 'human';
      conversation.humanTakeoverAt = at;
      conversation.aiResumeAt = undefined;
    }

    audit(state, {
      action:
        origin === 'ai'
          ? 'whatsapp.ai.message.sent'
          : 'whatsapp.human.message.sent',
      collection: 'messages',
      recordId: providerMessageId,
      summary: contact.name,
    });

    await saveState(state);
    return NextResponse.json({
      ok: true,
      providerMessageId,
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
      { error: 'Erro ao enviar.' },
      { status: 500 },
    );
  }
}
