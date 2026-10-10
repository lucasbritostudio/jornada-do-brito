import type {
  Contact,
  Conversation,
  WorkspaceState,
} from './types';
import { audit } from './store';
import {
  sendWhatsAppText,
  WhatsAppProviderError,
} from './whatsapp-provider';

export type WhatsAppAutomationDecision =
  | {
      kind: 'send';
      text: string;
      reason: string;
    }
  | {
      kind: 'suggest';
      reason: string;
      suggestedText?: string;
    }
  | {
      kind: 'ignore';
      reason: string;
    };

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function firstName(name: string) {
  const value = name.trim().split(/\s+/)[0];
  return value || 'tudo bem';
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

const PRICE_RISK = [
  /\bpre[cç]o\b/i,
  /\bvalor\b/i,
  /\bor[cç]amento\b/i,
  /\bquanto (custa|fica|e|é)\b/i,
  /\bdesconto\b/i,
  /\bpromo[cç][aã]o\b/i,
  /\bparcel/i,
  /\bforma de pagamento\b/i,
];

const COMPLAINT_RISK = [
  /\breclama/i,
  /\binsatisfeit/i,
  /\bproblema\b/i,
  /\batrasad/i,
  /\batraso\b/i,
  /\berrado\b/i,
  /\bn[aã]o gostei\b/i,
  /\bdecepc/i,
  /\bpreju[ií]zo\b/i,
  /\bdevolver dinheiro\b/i,
];

const CONTRACT_RISK = [
  /\bcontrato\b/i,
  /\bdireito de uso\b/i,
  /\bexclusividade\b/i,
  /\bcess[aã]o\b/i,
  /\blicen[cç]a\b/i,
  /\bnota fiscal\b/i,
];

const POLITICAL_RISK = [
  /\beleic[aã]o\b/i,
  /\bcampanha\b/i,
  /\bvereador\b/i,
  /\bprefeit/i,
  /\bdeputad/i,
  /\bcandidato\b/i,
  /\bpartido\b/i,
];

const DEADLINE_RISK = [
  /\bprazo\b/i,
  /\bquando (fica|vai ficar|entrega|entregar)\b/i,
  /\bque dia (fica|entrega|vai)\b/i,
  /\burgente\b/i,
  /\bhoje ainda\b/i,
];

const GREETING = [
  /^(oi|ola|olá|bom dia|boa tarde|boa noite|opa|e ai|e aí)[!. ,]*$/i,
  /^(oi|ola|olá|bom dia|boa tarde|boa noite)[,!. ]+(tudo bem|td bem|beleza)[?!. ]*$/i,
];

const VIDEO_INTEREST = [
  /\bquero (um |fazer )?video\b/i,
  /\bpreciso (de )?(um )?video\b/i,
  /\bgravar (um )?video\b/i,
  /\bfilmagem\b/i,
  /\bfilm(ar|agem)\b/i,
  /\bvideomaker\b/i,
  /\baudiovisual\b/i,
  /\bcobertura\b/i,
  /\bfotos?\b/i,
];

const STATUS_QUESTION = [
  /\bcomo esta\b/i,
  /\bcomo est[aá] o (video|trabalho|material)\b/i,
  /\bstatus\b/i,
  /\bficou pronto\b/i,
  /\bja ficou\b/i,
  /\bj[aá] terminou\b/i,
];

function projectStatusLabel(status: string) {
  const labels: Record<string, string> = {
    planned: 'planejado',
    active: 'em produção',
    waiting_client: 'aguardando uma informação/aprovação',
    review: 'em revisão',
    completed: 'concluído',
    cancelled: 'cancelado',
  };
  return labels[status] || status;
}

function activeProjectForContact(
  state: WorkspaceState,
  contactId: string,
) {
  return state.projects.find(
    (project) =>
      project.contactId === contactId &&
      ['planned', 'active', 'waiting_client', 'review'].includes(
        project.status,
      ),
  );
}

export function decideWhatsAppAutomation(
  state: WorkspaceState,
  conversation: Conversation,
  contact: Contact,
  inboundText: string,
): WhatsAppAutomationDecision {
  if (!state.settings.whatsappAutomation.enabled) {
    return {
      kind: 'ignore',
      reason: 'Automação geral desligada.',
    };
  }

  if (conversation.automationMode !== 'ai') {
    return {
      kind: 'ignore',
      reason: `Conversa em modo ${conversation.automationMode}.`,
    };
  }

  const text = inboundText.trim();
  if (!text) {
    return {
      kind: 'ignore',
      reason: 'Mensagem vazia ou sem texto.',
    };
  }

  if (
    state.settings.whatsappAutomation.requireHumanForPricing &&
    hasAny(text, PRICE_RISK)
  ) {
    return {
      kind: 'suggest',
      reason: 'Preço, orçamento, desconto ou pagamento precisa do Brito.',
      suggestedText:
        'Recebi sua mensagem. Vou conferir direitinho essa parte e já te respondo.',
    };
  }

  if (
    state.settings.whatsappAutomation.requireHumanForComplaints &&
    hasAny(text, COMPLAINT_RISK)
  ) {
    return {
      kind: 'suggest',
      reason: 'Reclamação ou conflito precisa de atendimento humano.',
      suggestedText:
        'Entendi. Vou olhar isso com atenção antes de te responder para não te passar uma informação errada.',
    };
  }

  if (
    state.settings.whatsappAutomation.requireHumanForContracts &&
    hasAny(text, CONTRACT_RISK)
  ) {
    return {
      kind: 'suggest',
      reason: 'Contrato ou condição comercial precisa do Brito.',
      suggestedText:
        'Recebi. Vou conferir essa parte do combinado antes de te responder.',
    };
  }

  if (hasAny(text, POLITICAL_RISK)) {
    return {
      kind: 'suggest',
      reason: 'Negociação ou assunto político sensível.',
    };
  }

  if (hasAny(text, DEADLINE_RISK)) {
    const project = activeProjectForContact(state, contact.id);
    if (!project?.dueDate) {
      return {
        kind: 'suggest',
        reason: 'Pergunta de prazo sem data confirmada no sistema.',
        suggestedText:
          'Recebi sua mensagem. Vou confirmar o prazo certinho antes de te responder.',
      };
    }
  }

  if (
    state.settings.whatsappAutomation.allowAutoGreeting &&
    GREETING.some((pattern) => pattern.test(text))
  ) {
    return {
      kind: 'send',
      reason: 'Saudação simples.',
      text: `Oi, ${firstName(contact.name)}! Tudo bem? Recebi sua mensagem. Me conta o que você precisa que eu organizo as informações por aqui.`,
    };
  }

  if (
    state.settings.whatsappAutomation.allowBriefingQuestions &&
    hasAny(text, VIDEO_INTEREST)
  ) {
    return {
      kind: 'send',
      reason: 'Pedido inicial de audiovisual; coleta de briefing básico.',
      text:
        'Perfeito. Pra eu organizar seu pedido certinho, me diga só três coisas: o que você quer gravar, para quando precisa e onde seria a gravação.',
    };
  }

  if (
    state.settings.whatsappAutomation.allowKnownStatusReplies &&
    hasAny(text, STATUS_QUESTION)
  ) {
    const project = activeProjectForContact(state, contact.id);

    if (!project) {
      return {
        kind: 'suggest',
        reason: 'Cliente perguntou status, mas não há projeto ativo ligado.',
      };
    }

    const parts = [
      `Seu trabalho “${project.name}” está ${projectStatusLabel(project.status)}.`,
    ];

    if (project.dueDate) {
      parts.push(
        `A data registrada no sistema é ${new Intl.DateTimeFormat('pt-BR').format(
          new Date(project.dueDate + 'T12:00:00'),
        )}.`,
      );
    }

    if (project.nextAction) {
      parts.push(`Próximo passo registrado: ${project.nextAction}.`);
    }

    return {
      kind: 'send',
      reason: 'Status confirmado no sistema.',
      text: parts.join(' '),
    };
  }

  return {
    kind: 'suggest',
    reason:
      'Mensagem fora das respostas automáticas seguras. A IA deve sugerir e esperar o Brito.',
  };
}

function createReviewInbox(
  state: WorkspaceState,
  conversation: Conversation,
  contact: Contact,
  inboundText: string,
  decision: Extract<WhatsAppAutomationDecision, { kind: 'suggest' }>,
) {
  const at = new Date().toISOString();

  state.inbox.unshift({
    id: crypto.randomUUID(),
    text: `WhatsApp · ${contact.name}: ${inboundText}`,
    kind: 'client',
    certainty: 'confirmed',
    status: 'needs_review',
    recordedAt: at,
    contactId: contact.id,
    nextAction: decision.suggestedText
      ? `Revisar sugestão: ${decision.suggestedText}`
      : 'Brito revisar e responder esta conversa.',
    linkedCollection: 'conversations',
    linkedRecordId: conversation.id,
    sourceText: inboundText,
    provenance: {
      kind: 'whatsapp',
      label: 'WhatsApp Business',
      updatedAt: at,
    },
    createdAt: at,
    updatedAt: at,
  });

  conversation.automationMode = 'suggest';
  conversation.updatedAt = at;

  audit(state, {
    action: 'whatsapp.ai.escalated',
    collection: 'conversations',
    recordId: conversation.id,
    summary: decision.reason,
  });
}

export async function runWhatsAppAutomation(
  state: WorkspaceState,
  params: {
    conversation: Conversation;
    contact: Contact;
    inboundText: string;
    inboundProviderMessageId?: string;
  },
) {
  const decision = decideWhatsAppAutomation(
    state,
    params.conversation,
    params.contact,
    params.inboundText,
  );

  if (decision.kind === 'ignore') {
    return decision;
  }

  if (decision.kind === 'suggest') {
    createReviewInbox(
      state,
      params.conversation,
      params.contact,
      params.inboundText,
      decision,
    );
    return decision;
  }

  try {
    const sent = await sendWhatsAppText(
      params.contact.phone || '',
      decision.text,
    );
    const at = new Date().toISOString();

    state.messages.unshift({
      id: crypto.randomUUID(),
      conversationId: params.conversation.id,
      contactId: params.contact.id,
      direction: 'outbound',
      text: decision.text,
      providerMessageId: sent.providerMessageId,
      status: 'sent',
      aiGenerated: true,
      origin: 'ai',
      createdAt: at,
    });

    params.conversation.status = 'waiting_client';
    params.conversation.unreadCount = 0;
    params.conversation.lastMessageAt = at;
    params.conversation.updatedAt = at;

    audit(state, {
      action: 'whatsapp.ai.auto_reply.sent',
      collection: 'messages',
      recordId:
        params.inboundProviderMessageId ||
        sent.providerMessageId,
      summary: `${params.contact.name} · ${decision.reason}`,
    });

    return decision;
  } catch (error) {
    const at = new Date().toISOString();
    params.conversation.automationMode = 'suggest';
    params.conversation.updatedAt = at;

    audit(state, {
      action: 'whatsapp.ai.auto_reply.failed',
      collection: 'conversations',
      recordId: params.conversation.id,
      summary:
        error instanceof WhatsAppProviderError
          ? error.message
          : 'Falha ao enviar resposta automática.',
    });

    createReviewInbox(
      state,
      params.conversation,
      params.contact,
      params.inboundText,
      {
        kind: 'suggest',
        reason: 'A resposta automática falhou e precisa do Brito.',
        suggestedText: decision.text,
      },
    );

    return {
      kind: 'suggest' as const,
      reason: 'Falha no envio automático.',
      suggestedText: decision.text,
    };
  }
}
