import { createHmac, timingSafeEqual } from 'node:crypto';
import { getState, saveState, audit } from '@/lib/store';
import type { Conversation, WorkspaceState } from '@/lib/types';
import { runWhatsAppAutomation } from '@/lib/whatsapp-automation';
import { isBlobConflict } from '@/lib/blob-conflict';
import { mutateStateSafely } from '@/lib/state-mutation';

export const runtime = 'nodejs';

function normalizePhone(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function eventTime(value: unknown) {
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return new Date(seconds * 1000).toISOString();
  }
  return new Date().toISOString();
}

function extractText(message: any) {
  if (!message) return '[mensagem]';
  if (message.text?.body) return String(message.text.body);
  if (message.button?.text) return String(message.button.text);
  if (message.interactive?.button_reply?.title) {
    return String(message.interactive.button_reply.title);
  }
  if (message.interactive?.list_reply?.title) {
    return String(message.interactive.list_reply.title);
  }
  if (message.image?.caption) return String(message.image.caption);
  if (message.video?.caption) return String(message.video.caption);
  if (message.document?.caption) return String(message.document.caption);
  return `[${message.type || 'mensagem'}]`;
}

function ensureContact(
  state: WorkspaceState,
  phoneRaw: unknown,
  at: string,
  name?: string,
) {
  const phone = normalizePhone(phoneRaw);
  let contact = state.contacts.find(
    (item) => normalizePhone(item.phone) === phone,
  );

  if (!contact) {
    contact = {
      id: crypto.randomUUID(),
      name: name?.trim() || phone || 'Contato WhatsApp',
      phone,
      lifecycle: 'prospect',
      source: 'WhatsApp',
      provenance: {
        kind: 'whatsapp',
        label: 'WhatsApp Business',
        updatedAt: at,
      },
      createdAt: at,
      updatedAt: at,
    };
    state.contacts.unshift(contact);
  } else if (name?.trim() && contact.name !== name.trim()) {
    contact.name = name.trim();
    contact.updatedAt = at;
  }

  return contact;
}

function ensureConversation(
  state: WorkspaceState,
  contactId: string,
  at: string,
) {
  let conversation = state.conversations.find(
    (item) =>
      item.contactId === contactId &&
      item.provider === 'meta' &&
      item.status !== 'archived',
  );

  if (!conversation) {
    conversation = {
      id: crypto.randomUUID(),
      contactId,
      provider: 'meta',
      status: 'open',
      automationMode: state.settings.whatsappAutomation.defaultMode,
      unreadCount: 0,
      createdAt: at,
      updatedAt: at,
    };
    state.conversations.unshift(conversation);
  }

  return conversation;
}

function mapHistoryStatus(value: unknown) {
  const status = String(value || '');
  if (['sent', 'delivered', 'read', 'failed'].includes(status)) {
    return status as 'sent' | 'delivered' | 'read' | 'failed';
  }
  return 'received' as const;
}

function addMessageIfNew(
  state: WorkspaceState,
  params: {
    providerMessageId?: string;
    conversation: Conversation;
    contactId: string;
    direction: 'inbound' | 'outbound';
    text: string;
    status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';
    origin: 'customer' | 'ai' | 'human_app' | 'human_jornada' | 'system';
    at: string;
    aiGenerated?: boolean;
  },
) {
  if (
    params.providerMessageId &&
    state.messages.some(
      (message) => message.providerMessageId === params.providerMessageId,
    )
  ) {
    return false;
  }

  state.messages.unshift({
    id: crypto.randomUUID(),
    conversationId: params.conversation.id,
    contactId: params.contactId,
    direction: params.direction,
    text: params.text,
    providerMessageId: params.providerMessageId,
    status: params.status,
    origin: params.origin,
    aiGenerated: params.aiGenerated,
    createdAt: params.at,
  });
  return true;
}

function handleContactSync(state: WorkspaceState, value: any) {
  for (const item of value.state_sync || []) {
    if (item?.type !== 'contact') continue;
    const phone = normalizePhone(item.contact?.phone_number);
    if (!phone) continue;

    const at = eventTime(item.metadata?.timestamp);
    const existing = state.contacts.find(
      (contact) => normalizePhone(contact.phone) === phone,
    );

    const action = String(item.action || '').toLowerCase();
    if (
      existing &&
      (action.includes('delete') || action.includes('remove'))
    ) {
      existing.lifecycle = 'inactive';
      existing.updatedAt = at;
      audit(state, {
        action: 'whatsapp.contact.inactive',
        collection: 'contacts',
        recordId: existing.id,
        summary: existing.name,
      });
      continue;
    }

    const name =
      item.contact?.full_name ||
      item.contact?.first_name ||
      existing?.name ||
      phone;
    const contact = ensureContact(state, phone, at, String(name));
    audit(state, {
      action: 'whatsapp.contact.synced',
      collection: 'contacts',
      recordId: contact.id,
      summary: contact.name,
    });
  }
}

function handleHistory(state: WorkspaceState, value: any) {
  const businessPhone = normalizePhone(value.metadata?.display_phone_number);

  for (const chunk of value.history || []) {
    if (Array.isArray(chunk?.errors) && chunk.errors.length) {
      audit(state, {
        action: 'whatsapp.history.sync.unavailable',
        collection: 'messages',
        summary: String(
          chunk.errors[0]?.message ||
            chunk.errors[0]?.title ||
            'Histórico não compartilhado.',
        ).slice(0, 400),
      });
      continue;
    }

    for (const thread of chunk?.threads || []) {
      const userPhone = normalizePhone(thread?.id);
      if (!userPhone) continue;

      const firstTimestamp =
        thread?.messages?.[0]?.timestamp || Date.now() / 1000;
      const firstAt = eventTime(firstTimestamp);
      const contact = ensureContact(state, userPhone, firstAt);
      const conversation = ensureConversation(state, contact.id, firstAt);

      for (const message of thread?.messages || []) {
        const at = eventTime(message.timestamp);
        const from = normalizePhone(message.from);
        const outgoing = !!businessPhone && from === businessPhone;
        const added = addMessageIfNew(state, {
          providerMessageId: message.id,
          conversation,
          contactId: contact.id,
          direction: outgoing ? 'outbound' : 'inbound',
          text: extractText(message),
          status: mapHistoryStatus(message.history_context?.status),
          origin: outgoing ? 'human_app' : 'customer',
          at,
        });

        if (added) {
          conversation.lastMessageAt = at;
          conversation.updatedAt = at;
        }
      }

      conversation.unreadCount = 0;
      conversation.status = 'open';
    }

    audit(state, {
      action: 'whatsapp.history.sync.chunk',
      collection: 'messages',
      summary: `fase ${chunk?.metadata?.phase ?? '?'} · progresso ${chunk?.metadata?.progress ?? '?'}%`,
    });
  }
}

function handleMessageEchoes(state: WorkspaceState, value: any) {
  for (const message of value.message_echoes || []) {
    const phone = normalizePhone(message.to);
    if (!phone || ['edit', 'revoke'].includes(String(message.type))) continue;

    const at = eventTime(message.timestamp);
    const contact = ensureContact(state, phone, at);
    const conversation = ensureConversation(state, contact.id, at);

    const added = addMessageIfNew(state, {
      providerMessageId: message.id,
      conversation,
      contactId: contact.id,
      direction: 'outbound',
      text: extractText(message),
      status: 'sent',
      origin: 'human_app',
      at,
    });

    if (!added) continue;

    conversation.status = 'waiting_client';
    conversation.unreadCount = 0;
    conversation.lastMessageAt = at;
    conversation.updatedAt = at;

    if (state.settings.whatsappAutomation.humanTakeoverStopsAi) {
      conversation.automationMode = 'human';
      conversation.humanTakeoverAt = at;
      conversation.aiResumeAt = undefined;
    }

    audit(state, {
      action: 'whatsapp.human.takeover',
      collection: 'conversations',
      recordId: conversation.id,
      summary: `Brito respondeu pelo WhatsApp Business · ${contact.name}`,
    });
  }
}

function handleInboundMessages(state: WorkspaceState, value: any) {
  const received: Array<{ conversation: Conversation; contact: WorkspaceState['contacts'][number]; inboundText: string; inboundProviderMessageId?: string }> = [];
  for (const message of value.messages || []) {
    if (
      state.messages.some(
        (item) => item.providerMessageId === message.id,
      )
    ) {
      continue;
    }

    const phone = normalizePhone(message.from);
    if (!phone) continue;

    const at = eventTime(message.timestamp);
    const profileName = value.contacts?.find(
      (item: any) => normalizePhone(item.wa_id) === phone,
    )?.profile?.name;

    const contact = ensureContact(state, phone, at, profileName);
    const conversation = ensureConversation(state, contact.id, at);

    const inboundText = extractText(message);
    addMessageIfNew(state, {
      providerMessageId: message.id,
      conversation,
      contactId: contact.id,
      direction: 'inbound',
      text: inboundText,
      status: 'received',
      origin: 'customer',
      at,
    });

    conversation.unreadCount += 1;
    conversation.status = 'waiting_me';
    conversation.lastMessageAt = at;
    conversation.updatedAt = at;

    audit(state, {
      action: 'whatsapp.message.received',
      collection: 'messages',
      recordId: message.id,
      summary: contact.name,
    });

    received.push({
      conversation,
      contact,
      inboundText,
      inboundProviderMessageId: message.id,
    });
  }

  return received;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (
    url.searchParams.get('hub.mode') === 'subscribe' &&
    url.searchParams.get('hub.verify_token') ===
      process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return new Response(
      url.searchParams.get('hub.challenge') || '',
      { status: 200 },
    );
  }
  return new Response('forbidden', { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.WHATSAPP_APP_SECRET;

  if (!secret) {
    // Sem o segredo não há como autenticar a origem do evento. Falhar fechado
    // evita que qualquer POST externo altere o estado ou dispare automação.
    return new Response('webhook não configurado', { status: 503 });
  }

  const header = req.headers.get('x-hub-signature-256') || '';
  const expected =
    'sha256=' +
    createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (
    a.length !== b.length ||
    !timingSafeEqual(a, b)
  ) {
    return new Response('bad signature', { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response('ok', { status: 200 });
  }

  // Persist incoming event IDs BEFORE any irreversible Meta send.
  // A failed CAS can safely reprocess the webhook because provider IDs are
  // deduplicated. Never retry an external send on persistence conflicts.
  type AutomationItem = {
    conversationId: string;
    contactId: string;
    inboundText: string;
    inboundProviderMessageId?: string;
  };
  let items: AutomationItem[] = [];
  let saved = false;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const state = await getState();
    const inboundForAutomation: AutomationItem[] = [];

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const field = String(change.field || '');

        if (field === 'smb_app_state_sync') {
          handleContactSync(state, value);
          continue;
        }
        if (field === 'history') {
          handleHistory(state, value);
          continue;
        }
        if (field === 'smb_message_echoes') {
          handleMessageEchoes(state, value);
          continue;
        }
        if (field === 'messages') {
          const parsed = handleInboundMessages(state, value);
          for (const item of parsed) {
            inboundForAutomation.push({
              conversationId: item.conversation.id,
              contactId: item.contact.id,
              inboundText: item.inboundText,
              inboundProviderMessageId: item.inboundProviderMessageId,
            });
          }
        }
      }
    }

    try {
      await saveState(state);
      items = inboundForAutomation;
      saved = true;
      break;
    } catch (error) {
      if (!isBlobConflict(error) || attempt === 5) throw error;
    }
  }

  if (!saved) return new Response('retry later', { status: 503 });

  // A duplicated webhook will see an already-committed incoming message and
  // will not schedule another automated reply.
  for (const item of items) {
    const state = await getState();
    const conversation = state.conversations.find(
      (entry) => entry.id === item.conversationId,
    );
    const contact = state.contacts.find(
      (entry) => entry.id === item.contactId,
    );
    if (!conversation || !contact) continue;

    const beforeMessages = new Set(state.messages.map((entry) => entry.id));
    const beforeInbox = new Set(state.inbox.map((entry) => entry.id));
    const beforeAudit = new Set(state.audit.map((entry) => entry.id));

    const decision = await runWhatsAppAutomation(state, {
      conversation,
      contact,
      inboundText: item.inboundText,
      inboundProviderMessageId: item.inboundProviderMessageId,
    });

    if (decision.kind === 'ignore') continue;

    // The reply may already have been sent through Meta. Merge only the
    // changed local records into a fresh snapshot; never call Meta again.
    const addedMessages = state.messages.filter((entry) =>
      !beforeMessages.has(entry.id),
    );
    const addedInbox = state.inbox.filter((entry) =>
      !beforeInbox.has(entry.id),
    );
    const addedAudit = state.audit.filter((entry) =>
      !beforeAudit.has(entry.id),
    );
    await mutateStateSafely((latest) => {
      for (const message of addedMessages) {
        const exists = latest.messages.some((entry) =>
          entry.id === message.id ||
          Boolean(message.providerMessageId && entry.providerMessageId === message.providerMessageId),
        );
        if (!exists) latest.messages.unshift(message);
      }
      for (const entry of addedInbox) {
        if (!latest.inbox.some((current) => current.id === entry.id)) {
          latest.inbox.unshift(entry);
        }
      }
      for (const entry of addedAudit) {
        if (!latest.audit.some((current) => current.id === entry.id)) {
          latest.audit.unshift(entry);
        }
      }
      const currentConversation = latest.conversations.find(
        (entry) => entry.id === item.conversationId,
      );
      if (currentConversation && currentConversation.updatedAt <= conversation.updatedAt) {
        currentConversation.status = conversation.status;
        currentConversation.unreadCount = conversation.unreadCount;
        currentConversation.lastMessageAt = conversation.lastMessageAt;
        currentConversation.updatedAt = conversation.updatedAt;
        currentConversation.automationMode = conversation.automationMode;
        currentConversation.humanTakeoverAt = conversation.humanTakeoverAt;
        currentConversation.aiResumeAt = conversation.aiResumeAt;
      }
    });
  }

  return new Response('ok', { status: 200 });
}
