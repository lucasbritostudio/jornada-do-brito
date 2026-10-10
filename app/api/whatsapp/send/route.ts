import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { getState, audit } from '@/lib/store';
import { mutateStateSafely } from '@/lib/state-mutation';
import {
  sendWhatsAppText,
  WhatsAppProviderError,
} from '@/lib/whatsapp-provider';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    await requireAuthenticated();

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

    const sent = await sendWhatsAppText(
      contact.phone,
      messageText,
    );

    // Meta already accepted the message: ONLY persist the result from now on.
    // If another request changed the workspace, retry persistence, not delivery.
    const at = new Date().toISOString();
    const outboundId = crypto.randomUUID();
    try {
      const automationMode = await mutateStateSafely((latest) => {
        const savedConversation = latest.conversations.find(
          (item) => item.id === conversationId,
        );
        // A deduplicated provider ID is the source of truth for this send.
        if (!latest.messages.some((item) =>
          sent.providerMessageId && item.providerMessageId === sent.providerMessageId
        )) {
          latest.messages.unshift({
            id: outboundId,
            conversationId,
            contactId: contact.id,
            direction: 'outbound',
            text: messageText,
            providerMessageId: sent.providerMessageId,
            status: 'sent',
            aiGenerated: origin === 'ai',
            origin,
            createdAt: at,
          });
        }

        if (savedConversation) {
          savedConversation.status = 'waiting_client';
          savedConversation.unreadCount = 0;
          savedConversation.lastMessageAt = at;
          savedConversation.updatedAt = at;
          if (
            origin === 'human_jornada' &&
            latest.settings.whatsappAutomation.humanTakeoverStopsAi
          ) {
            savedConversation.automationMode = 'human';
            savedConversation.humanTakeoverAt = at;
            savedConversation.aiResumeAt = undefined;
          }
        }

        if (!latest.audit.some((item) =>
          item.action === 'whatsapp.human.message.sent' ||
          item.action === 'whatsapp.ai.message.sent'
            ? item.recordId === sent.providerMessageId && Boolean(sent.providerMessageId)
            : false
        )) {
          audit(latest, {
            action: origin === 'ai'
              ? 'whatsapp.ai.message.sent'
              : 'whatsapp.human.message.sent',
            collection: 'messages',
            recordId: sent.providerMessageId,
            summary: contact.name,
          });
        }

        return savedConversation?.automationMode || conversation.automationMode;
      });

      return NextResponse.json({
        ok: true,
        providerMessageId: sent.providerMessageId,
        automationMode,
      });
    } catch {
      // Never imply that a second POST is safe: sending succeeded in Meta.
      return NextResponse.json({
        ok: false,
        deliveryAccepted: true,
        providerMessageId: sent.providerMessageId,
        error: 'A Meta aceitou a mensagem, mas o histórico não foi confirmado. Não reenvie; revise a conversa.',
      }, { status: 202 });
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { error: 'Não autorizado.' },
        { status: 401 },
      );
    }

    if (error instanceof WhatsAppProviderError) {
      return NextResponse.json(
        {
          error: error.message,
          details: error.details,
        },
        { status: error.status || 502 },
      );
    }

    return NextResponse.json(
      { error: 'Erro ao enviar.' },
      { status: 500 },
    );
  }
}
