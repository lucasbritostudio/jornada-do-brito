import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type {
  DataCertainty,
  WorkspaceState,
} from './types';
import {
  JORNADA_DOMAIN_TOOLS,
  domainActionLabel,
  executeDomainAction,
  normalizeDomainAction,
  type DomainActionName,
} from './domain-actions';

export type JornadaActionName =
  | 'create_contact'
  | 'create_task'
  | 'create_goal'
  | 'create_transaction'
  | 'create_debt'
  | 'create_opportunity'
  | 'create_project'
  | 'create_receivable'
  | 'create_obligation'
  | 'create_client_experience'
  | 'create_study_event'
  | 'capture_inbox'
  | DomainActionName;

export type JornadaAction = {
  name: JornadaActionName;
  args: Record<string, unknown>;
};

type ActionPayload = JornadaAction & {
  v: 1;
  jti: string;
  exp: number;
};

type UndoPayload = {
  v: 1;
  kind: 'undo_create';
  jti: string;
  exp: number;
  collection: UndoableCollection;
  entityId: string;
};

type UndoableCollection =
  | 'contacts'
  | 'tasks'
  | 'goals'
  | 'transactions'
  | 'debts'
  | 'opportunities'
  | 'projects'
  | 'receivables'
  | 'obligations'
  | 'clientExperiences'
  | 'studyEvents'
  | 'inbox';

function secret() {
  const value = process.env.JORNADA_SESSION_SECRET;
  if (!value) throw new Error('JORNADA_SESSION_SECRET não configurado');
  return value;
}

function text(value: unknown, max = 180) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function optionalText(value: unknown, max = 180) {
  const normalized = text(value, max);
  return normalized || undefined;
}

function bool(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

function positiveInt(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n);
}

function optionalNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function score(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 10) return undefined;
  return Math.round(n * 10) / 10;
}

function isoDate(value: unknown) {
  const s = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

function todayLocal() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: process.env.JORNADA_TIMEZONE || 'America/Fortaleza',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function brl(cents: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

function certainty(value: unknown, fallback: DataCertainty = 'confirmed'): DataCertainty {
  const allowed: DataCertainty[] = [
    'confirmed',
    'estimate',
    'forecast',
    'pending',
    'interpretation',
  ];
  return allowed.includes(value as DataCertainty)
    ? (value as DataCertainty)
    : fallback;
}

const BASE_JORNADA_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_contact',
      description:
        'Use somente quando Brito pedir explicitamente para cadastrar, salvar ou registrar um cliente/contato real. Se o nome estiver faltando, pergunte antes.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string' },
          company: { type: 'string' },
          role: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description:
        'Use quando Brito pedir explicitamente para anotar, criar ou registrar uma tarefa real.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          due_date: { type: 'string', description: 'YYYY-MM-DD, se informado.' },
          notes: { type: 'string' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_goal',
      description:
        'Use quando Brito pedir explicitamente para registrar uma meta ou objetivo.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          ambition: { type: 'string' },
          why: { type: 'string' },
          target_value: { type: 'number' },
          target_date: { type: 'string', description: 'YYYY-MM-DD, se informado.' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_transaction',
      description:
        'Use para registrar uma entrada ou gasto que Brito afirma que realmente aconteceu. Precisa de tipo, valor e descrição. Não use para promessa de pagamento.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: ['income', 'expense'] },
          amount_cents: { type: 'integer', description: 'R$50 = 5000 centavos.' },
          description: { type: 'string' },
          category: { type: 'string' },
          account_name: {
            type: 'string',
            description: 'Conta onde o dinheiro entrou/saiu, somente se Brito informar. Nunca adivinhe.',
          },
          occurred_on: { type: 'string', description: 'YYYY-MM-DD. Omita para hoje.' },
        },
        required: ['type', 'amount_cents', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_debt',
      description:
        'Use quando Brito pedir para registrar uma dívida real. Isso apenas registra dados; nunca paga nem transfere dinheiro.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          creditor_name: { type: 'string' },
          original_amount_cents: { type: 'integer' },
          current_balance_cents: { type: 'integer' },
          paid_amount_cents: { type: 'integer' },
          due_date: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          structural: { type: 'boolean' },
          description: { type: 'string' },
          next_action: { type: 'string' },
        },
        required: ['creditor_name', 'original_amount_cents'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_opportunity',
      description:
        'Use quando Brito pedir para registrar uma oportunidade, possível trabalho ou negociação. Valor provável deve ficar como estimativa/previsão, não renda recebida.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          estimated_value_cents: { type: 'integer' },
          certainty: {
            type: 'string',
            enum: ['confirmed', 'estimate', 'forecast', 'pending', 'interpretation'],
          },
          next_action: { type: 'string' },
          next_action_date: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_project',
      description:
        'Use quando Brito pedir para registrar um trabalho/projeto real em andamento ou planejado.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          client_name: { type: 'string' },
          project_type: {
            type: 'string',
            enum: ['video', 'photo', 'event', 'political', 'commercial', 'other'],
          },
          due_date: { type: 'string' },
          budget_cents: { type: 'integer' },
          description: { type: 'string' },
          next_action: { type: 'string' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_receivable',
      description:
        'Use quando Brito pedir para registrar dinheiro que ainda deve receber. Diferencie valor confirmado, estimado e previsão. Não registre como entrada recebida.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          client_name: { type: 'string' },
          amount_cents: { type: 'integer' },
          certainty: {
            type: 'string',
            enum: ['confirmed', 'estimate', 'forecast'],
          },
          expected_on: { type: 'string' },
          expected_window: { type: 'string' },
          notes: { type: 'string' },
          next_action: { type: 'string' },
        },
        required: ['title', 'certainty'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_obligation',
      description:
        'Use quando Brito pedir para registrar uma conta, assinatura ou obrigação futura. Não use isso para dívida estrutural antiga.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          amount_cents: { type: 'integer' },
          kind: {
            type: 'string',
            enum: ['subscription', 'card_bill', 'infrastructure', 'debt_payment', 'personal', 'other'],
          },
          due_date: { type: 'string' },
          essentiality: { type: 'string', enum: ['essential', 'review', 'optional'] },
          recurring: { type: 'boolean' },
          notes: { type: 'string' },
        },
        required: ['title', 'amount_cents', 'kind'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_client_experience',
      description:
        'Use quando Brito relatar a experiência real de trabalhar com um cliente e pedir para guardar/anotar/aprender com isso. Separe fatos de interpretações.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          client_name: { type: 'string' },
          work_label: { type: 'string' },
          occurred_on: { type: 'string' },
          agreement: { type: 'string' },
          what_happened: { type: 'string' },
          what_worked: { type: 'string' },
          what_failed: { type: 'string' },
          client_met_deadline: { type: 'boolean' },
          brito_met_deadline: { type: 'boolean' },
          scope_changed: { type: 'boolean' },
          communication: { type: 'string' },
          payment_experience: { type: 'string' },
          mistake_to_avoid: { type: 'string' },
          pattern_to_keep: { type: 'string' },
          next_action: { type: 'string' },
          learned_rule: { type: 'string' },
          facts: { type: 'array', items: { type: 'string' } },
          interpretations: { type: 'array', items: { type: 'string' } },
        },
        required: ['client_name', 'what_happened'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_study_event',
      description:
        'Use quando Brito disser que estudou, treinou ou recebeu uma nota/correção de audiovisual e pedir para registrar. Nunca invente nota.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          occurred_on: { type: 'string' },
          skill: { type: 'string' },
          exercise: { type: 'string' },
          take: { type: 'string' },
          score: { type: 'number' },
          main_error: { type: 'string' },
          correction: { type: 'string' },
          redone: { type: 'boolean' },
          score_after: { type: 'number' },
          observation: { type: 'string' },
          level: { type: 'string' },
        },
        required: ['skill', 'exercise', 'score'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'capture_inbox',
      description:
        'Use como caixa de entrada quando Brito pedir para guardar uma informação real que ainda não cabe com segurança em outro registro. Classifique o tipo e o grau de certeza.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string' },
          kind: {
            type: 'string',
            enum: ['client', 'finance', 'study', 'project', 'task', 'goal', 'personal', 'other'],
          },
          certainty: {
            type: 'string',
            enum: ['confirmed', 'estimate', 'forecast', 'pending', 'interpretation'],
          },
          occurred_on: { type: 'string' },
          client_name: { type: 'string' },
          amount_cents: { type: 'integer' },
          next_action: { type: 'string' },
        },
        required: ['text', 'kind', 'certainty'],
      },
    },
  },
] as const;

export const JORNADA_TOOLS = [
  ...BASE_JORNADA_TOOLS,
  ...JORNADA_DOMAIN_TOOLS,
] as const;

export function normalizeAction(
  name: string,
  raw: Record<string, unknown>,
): JornadaAction {
  switch (name as JornadaActionName) {
    case 'create_contact': {
      const nameValue = text(raw.name, 120);
      if (!nameValue) throw new Error('Falta o nome do contato.');
      return {
        name: 'create_contact',
        args: {
          name: nameValue,
          phone: optionalText(raw.phone, 40),
          email: optionalText(raw.email, 160),
          company: optionalText(raw.company, 120),
          role: optionalText(raw.role, 120),
          notes: optionalText(raw.notes, 800),
        },
      };
    }
    case 'create_task': {
      const title = text(raw.title, 180);
      if (!title) throw new Error('Falta o título da tarefa.');
      return {
        name: 'create_task',
        args: {
          title,
          priority: ['low', 'medium', 'high'].includes(String(raw.priority))
            ? String(raw.priority)
            : 'medium',
          due_date: isoDate(raw.due_date),
          notes: optionalText(raw.notes, 800),
        },
      };
    }
    case 'create_goal': {
      const title = text(raw.title, 180);
      if (!title) throw new Error('Falta o título do objetivo.');
      return {
        name: 'create_goal',
        args: {
          title,
          ambition: optionalText(raw.ambition, 180),
          why: optionalText(raw.why, 800),
          target_value: optionalNumber(raw.target_value),
          target_date: isoDate(raw.target_date),
        },
      };
    }
    case 'create_transaction': {
      const typeValue =
        raw.type === 'income'
          ? 'income'
          : raw.type === 'expense'
            ? 'expense'
            : '';
      const amount = positiveInt(raw.amount_cents);
      const description = text(raw.description, 180);
      if (!typeValue || !amount || !description) {
        throw new Error(
          'Para registrar dinheiro, preciso saber tipo, valor e descrição.',
        );
      }
      return {
        name: 'create_transaction',
        args: {
          type: typeValue,
          amount_cents: amount,
          description,
          category: optionalText(raw.category, 80),
          account_name: optionalText(raw.account_name, 120),
          occurred_on: isoDate(raw.occurred_on) || todayLocal(),
        },
      };
    }
    case 'create_debt': {
      const creditor = text(raw.creditor_name, 140);
      const original = positiveInt(raw.original_amount_cents);
      if (!creditor || !original) {
        throw new Error('Falta o credor ou o valor da dívida.');
      }
      return {
        name: 'create_debt',
        args: {
          creditor_name: creditor,
          original_amount_cents: original,
          current_balance_cents:
            positiveInt(raw.current_balance_cents) || original,
          paid_amount_cents: positiveInt(raw.paid_amount_cents),
          due_date: isoDate(raw.due_date),
          priority: ['low', 'medium', 'high', 'critical'].includes(
            String(raw.priority),
          )
            ? String(raw.priority)
            : undefined,
          structural: bool(raw.structural),
          description: optionalText(raw.description, 800),
          next_action: optionalText(raw.next_action, 300),
        },
      };
    }
    case 'create_opportunity': {
      const title = text(raw.title, 180);
      if (!title) throw new Error('Falta o título da oportunidade.');
      return {
        name: 'create_opportunity',
        args: {
          title,
          estimated_value_cents: positiveInt(raw.estimated_value_cents),
          certainty: certainty(raw.certainty, 'estimate'),
          next_action: optionalText(raw.next_action, 240),
          next_action_date: isoDate(raw.next_action_date),
          notes: optionalText(raw.notes, 800),
        },
      };
    }
    case 'create_project': {
      const nameValue = text(raw.name, 180);
      if (!nameValue) throw new Error('Falta o nome do projeto.');
      const projectType = [
        'video',
        'photo',
        'event',
        'political',
        'commercial',
        'other',
      ].includes(String(raw.project_type))
        ? String(raw.project_type)
        : 'other';
      return {
        name: 'create_project',
        args: {
          name: nameValue,
          client_name: optionalText(raw.client_name, 120),
          project_type: projectType,
          due_date: isoDate(raw.due_date),
          budget_cents: positiveInt(raw.budget_cents),
          description: optionalText(raw.description, 1000),
          next_action: optionalText(raw.next_action, 300),
        },
      };
    }
    case 'create_receivable': {
      const title = text(raw.title, 180);
      const certaintyValue = ['confirmed', 'estimate', 'forecast'].includes(
        String(raw.certainty),
      )
        ? String(raw.certainty)
        : '';
      if (!title || !certaintyValue) {
        throw new Error('Falta o título ou o grau de certeza do valor a receber.');
      }
      return {
        name: 'create_receivable',
        args: {
          title,
          client_name: optionalText(raw.client_name, 120),
          amount_cents: positiveInt(raw.amount_cents),
          certainty: certaintyValue,
          expected_on: isoDate(raw.expected_on),
          expected_window: optionalText(raw.expected_window, 120),
          notes: optionalText(raw.notes, 800),
          next_action: optionalText(raw.next_action, 300),
        },
      };
    }
    case 'create_obligation': {
      const title = text(raw.title, 180);
      const amount = positiveInt(raw.amount_cents);
      const kind = [
        'subscription',
        'card_bill',
        'infrastructure',
        'debt_payment',
        'personal',
        'other',
      ].includes(String(raw.kind))
        ? String(raw.kind)
        : '';
      if (!title || !amount || !kind) {
        throw new Error('Falta nome, valor ou tipo da obrigação.');
      }
      return {
        name: 'create_obligation',
        args: {
          title,
          amount_cents: amount,
          kind,
          due_date: isoDate(raw.due_date),
          essentiality: ['essential', 'review', 'optional'].includes(
            String(raw.essentiality),
          )
            ? String(raw.essentiality)
            : 'review',
          recurring: bool(raw.recurring) ?? false,
          notes: optionalText(raw.notes, 800),
        },
      };
    }
    case 'create_client_experience': {
      const clientName = text(raw.client_name, 140);
      const whatHappened = text(raw.what_happened, 1400);
      if (!clientName || !whatHappened) {
        throw new Error('Falta o cliente ou o relato do que aconteceu.');
      }
      const stringList = (value: unknown) =>
        Array.isArray(value)
          ? value
              .filter((item) => typeof item === 'string')
              .map((item) => item.trim().slice(0, 400))
              .filter(Boolean)
              .slice(0, 12)
          : undefined;
      return {
        name: 'create_client_experience',
        args: {
          client_name: clientName,
          work_label: optionalText(raw.work_label, 180),
          occurred_on: isoDate(raw.occurred_on) || todayLocal(),
          agreement: optionalText(raw.agreement, 800),
          what_happened: whatHappened,
          what_worked: optionalText(raw.what_worked, 800),
          what_failed: optionalText(raw.what_failed, 800),
          client_met_deadline: bool(raw.client_met_deadline),
          brito_met_deadline: bool(raw.brito_met_deadline),
          scope_changed: bool(raw.scope_changed),
          communication: optionalText(raw.communication, 800),
          payment_experience: optionalText(raw.payment_experience, 800),
          mistake_to_avoid: optionalText(raw.mistake_to_avoid, 600),
          pattern_to_keep: optionalText(raw.pattern_to_keep, 600),
          next_action: optionalText(raw.next_action, 300),
          learned_rule: optionalText(raw.learned_rule, 600),
          facts: stringList(raw.facts),
          interpretations: stringList(raw.interpretations),
        },
      };
    }
    case 'create_study_event': {
      const skill = text(raw.skill, 160);
      const exercise = text(raw.exercise, 240);
      const scoreValue = score(raw.score);
      if (!skill || !exercise || scoreValue === undefined) {
        throw new Error('Falta habilidade, exercício ou nota válida de 0 a 10.');
      }
      return {
        name: 'create_study_event',
        args: {
          occurred_on: isoDate(raw.occurred_on) || todayLocal(),
          skill,
          exercise,
          take: optionalText(raw.take, 100),
          score: scoreValue,
          main_error: optionalText(raw.main_error, 700),
          correction: optionalText(raw.correction, 700),
          redone: bool(raw.redone) ?? false,
          score_after: score(raw.score_after),
          observation: optionalText(raw.observation, 1000),
          level: optionalText(raw.level, 100),
        },
      };
    }
    case 'capture_inbox': {
      const value = text(raw.text, 1600);
      const kind = [
        'client',
        'finance',
        'study',
        'project',
        'task',
        'goal',
        'personal',
        'other',
      ].includes(String(raw.kind))
        ? String(raw.kind)
        : 'other';
      if (!value) throw new Error('Falta a informação para guardar.');
      return {
        name: 'capture_inbox',
        args: {
          text: value,
          kind,
          certainty: certainty(raw.certainty, 'pending'),
          occurred_on: isoDate(raw.occurred_on),
          client_name: optionalText(raw.client_name, 140),
          amount_cents: positiveInt(raw.amount_cents),
          next_action: optionalText(raw.next_action, 300),
        },
      };
    }
    default: {
      const domain = normalizeDomainAction(name, raw);
      if (domain) return domain;
      throw new Error('Ação não permitida.');
    }
  }
}

function findFinancialAccount(
  state: WorkspaceState,
  label?: unknown,
) {
  const target = text(label, 120)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');

  if (!target) return undefined;

  const active = state.financialAccounts.filter(
    (account) => account.active,
  );
  const exact = active.filter(
    (account) =>
      account.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR') === target,
  );
  if (exact.length === 1) return exact[0];

  const partial = active.filter((account) => {
    const name = account.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR');
    return name.includes(target) || target.includes(name);
  });

  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new Error(
      'Encontrei mais de uma conta parecida. Diga qual conta exatamente.',
    );
  }
  throw new Error(
    `Não encontrei a conta “${String(label)}” na Jornada.`,
  );
}

function findContactId(state: WorkspaceState, label?: unknown) {
  const name = text(label, 140).toLocaleLowerCase('pt-BR');
  if (!name) return undefined;
  return state.contacts.find(
    (contact) =>
      contact.name.toLocaleLowerCase('pt-BR') === name ||
      contact.company?.toLocaleLowerCase('pt-BR') === name,
  )?.id;
}

function label(action: JornadaAction) {
  const domain = normalizeDomainAction(
    action.name,
    action.args,
  );
  if (domain) {
    return domainActionLabel(domain);
  }

  const a = action.args as any;
  switch (action.name) {
    case 'create_contact':
      return {
        title: 'Criar contato',
        summary: a.name,
        details: [a.phone, a.email, a.company].filter(Boolean),
      };
    case 'create_task':
      return {
        title: 'Criar tarefa',
        summary: a.title,
        details: [
          a.due_date ? `Prazo: ${a.due_date}` : null,
          `Prioridade: ${a.priority}`,
        ].filter(Boolean),
      };
    case 'create_goal':
      return {
        title: 'Criar objetivo',
        summary: a.title,
        details: [a.ambition, a.target_date ? `Prazo: ${a.target_date}` : null].filter(
          Boolean,
        ),
      };
    case 'create_transaction':
      return {
        title: a.type === 'income' ? 'Registrar entrada' : 'Registrar gasto',
        summary: `${brl(a.amount_cents)} · ${a.description}`,
        details: [a.category, a.occurred_on].filter(Boolean),
      };
    case 'create_debt':
      return {
        title: 'Registrar dívida',
        summary: `${a.creditor_name} · ${brl(a.current_balance_cents)}`,
        details: [a.due_date ? `Vence: ${a.due_date}` : null].filter(Boolean),
      };
    case 'create_opportunity':
      return {
        title: 'Criar oportunidade',
        summary: a.title,
        details: [
          a.estimated_value_cents ? brl(a.estimated_value_cents) : null,
          a.certainty,
          a.next_action,
        ].filter(Boolean),
      };
    case 'create_project':
      return {
        title: 'Criar projeto',
        summary: a.name,
        details: [a.client_name, a.due_date, a.next_action].filter(Boolean),
      };
    case 'create_receivable':
      return {
        title: 'Registrar valor a receber',
        summary: a.amount_cents ? `${a.title} · ${brl(a.amount_cents)}` : a.title,
        details: [a.certainty, a.expected_on || a.expected_window].filter(Boolean),
      };
    case 'create_obligation':
      return {
        title: 'Registrar obrigação',
        summary: `${a.title} · ${brl(a.amount_cents)}`,
        details: [a.kind, a.due_date].filter(Boolean),
      };
    case 'create_client_experience':
      return {
        title: 'Guardar experiência com cliente',
        summary: a.client_name,
        details: [a.work_label, a.learned_rule].filter(Boolean),
      };
    case 'create_study_event':
      return {
        title: 'Registrar estudo',
        summary: `${a.skill} · nota ${a.score}`,
        details: [a.take, a.exercise].filter(Boolean),
      };
    case 'capture_inbox':
      return {
        title: 'Guardar na Caixa de Entrada',
        summary: a.text,
        details: [a.kind, a.certainty].filter(Boolean),
      };
  }
}

function sign(prefix: string, payload: unknown) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret())
    .update(`${prefix}.${encoded}`)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

function verify<T>(prefix: string, token: string): T {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) throw new Error('Token inválido.');
  const expected = createHmac('sha256', secret())
    .update(`${prefix}.${encoded}`)
    .digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('Token inválido.');
  }
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T;
}

export function createActionProposal(
  name: string,
  rawArgs: Record<string, unknown>,
) {
  const action = normalizeAction(name, rawArgs);
  const payload: ActionPayload = {
    v: 1,
    jti: randomUUID(),
    exp: Date.now() + 10 * 60 * 1000,
    ...action,
  };
  return {
    ...label(action),
    name: action.name,
    token: sign('jornada-action-v1', payload),
  };
}

export function verifyActionToken(token: string): ActionPayload {
  const payload = verify<ActionPayload>('jornada-action-v1', token);
  if (payload.v !== 1 || payload.exp < Date.now() || !payload.jti) {
    throw new Error('Ação expirada.');
  }
  const normalized = normalizeAction(payload.name, payload.args || {});
  return { ...payload, ...normalized };
}

export function createUndoToken(
  collection: UndoableCollection,
  entityId: string,
  minutes = 10,
) {
  const payload: UndoPayload = {
    v: 1,
    kind: 'undo_create',
    jti: randomUUID(),
    exp: Date.now() + Math.max(1, Math.min(minutes, 60)) * 60 * 1000,
    collection,
    entityId,
  };
  return sign('jornada-undo-v1', payload);
}

export function verifyUndoToken(token: string) {
  const payload = verify<UndoPayload>('jornada-undo-v1', token);
  if (
    payload.v !== 1 ||
    payload.kind !== 'undo_create' ||
    payload.exp < Date.now() ||
    !payload.entityId
  ) {
    throw new Error('O prazo para desfazer terminou.');
  }
  return payload;
}

export function undoCreatedRecord(state: WorkspaceState, payload: UndoPayload) {
  const collection = state[payload.collection] as unknown as Array<{
    id: string;
  }>;
  const index = collection.findIndex((item) => item.id === payload.entityId);
  if (index < 0) throw new Error('Esse registro já não existe.');
  collection.splice(index, 1);
  return {
    collection: payload.collection,
    entityId: payload.entityId,
  };
}

export function executeAction(state: WorkspaceState, action: JornadaAction) {
  const normalized = normalizeAction(action.name, action.args);
  const at = new Date().toISOString();
  const id = randomUUID();
  const a = normalized.args as any;
  const provenance = {
    kind: 'ai' as const,
    label: 'Jornada IA',
    updatedAt: at,
  };

  const domain = normalizeDomainAction(
    normalized.name,
    normalized.args,
  );
  if (domain) {
    return executeDomainAction(state, domain);
  }

  if (normalized.name === 'create_contact') {
    const duplicate = state.contacts.find(
      (contact) =>
        (a.phone && contact.phone === a.phone) ||
        (a.email &&
          contact.email?.toLowerCase() === String(a.email).toLowerCase()),
    );
    if (duplicate) {
      throw new Error('Já existe um contato com esse telefone ou e-mail.');
    }
    state.contacts.unshift({
      id,
      name: a.name,
      phone: a.phone,
      email: a.email,
      company: a.company,
      role: a.role,
      lifecycle: 'prospect',
      source: 'Jornada IA',
      notes: a.notes,
      provenance,
      createdAt: at,
      updatedAt: at,
    });
    return {
      collection: 'contacts' as const,
      entityId: id,
      message: `Contato ${a.name} salvo.`,
    };
  }

  if (normalized.name === 'create_task') {
    state.tasks.unshift({
      id,
      title: a.title,
      status: 'todo',
      priority: a.priority,
      dueAt: a.due_date ? `${a.due_date}T12:00:00.000Z` : undefined,
      notes: a.notes,
      provenance,
      createdAt: at,
      updatedAt: at,
    });
    return {
      collection: 'tasks' as const,
      entityId: id,
      message: `Tarefa “${a.title}” salva.`,
    };
  }

  if (normalized.name === 'create_goal') {
    state.goals.unshift({
      id,
      title: a.title,
      ambition: a.ambition,
      why: a.why,
      targetValue: a.target_value,
      currentValue: 0,
      targetDate: a.target_date,
      status: 'active',
      provenance,
      createdAt: at,
      updatedAt: at,
    });
    return {
      collection: 'goals' as const,
      entityId: id,
      message: `Objetivo “${a.title}” salvo.`,
    };
  }

  if (normalized.name === 'create_transaction') {
    const account = a.account_name
      ? findFinancialAccount(state, a.account_name)
      : undefined;
    const accountBefore = account
      ? (structuredClone(account) as unknown as Record<string, unknown>)
      : undefined;

    state.transactions.unshift({
      id,
      accountId: account?.id,
      type: a.type,
      amountCents: a.amount_cents,
      occurredOn: a.occurred_on,
      category: a.category,
      description: a.description,
      status: 'cleared',
      certainty: 'confirmed',
      provenance,
      createdAt: at,
      updatedAt: at,
    });

    if (account) {
      const base =
        account.currentBalanceCents ??
        account.openingBalanceCents;
      account.currentBalanceCents =
        a.type === 'income'
          ? base + a.amount_cents
          : base - a.amount_cents;
      account.balanceAsOf = at;
      account.updatedAt = at;
    }

    return {
      collection: 'transactions' as const,
      entityId: id,
      message: `${a.type === 'income' ? 'Entrada' : 'Gasto'} de ${brl(a.amount_cents)} salvo${account ? ` em ${account.name}` : ''}.`,
      ...(account && accountBefore
        ? {
            undoChanges: [
              {
                kind: 'restore' as const,
                collection: 'financialAccounts',
                entityId: account.id,
                before: accountBefore,
              },
              {
                kind: 'delete' as const,
                collection: 'transactions',
                entityId: id,
              },
            ],
          }
        : {}),
    };
  }

  if (normalized.name === 'create_debt') {
    state.debts.unshift({
      id,
      creditorName: a.creditor_name,
      description: a.description,
      originalAmountCents: a.original_amount_cents,
      currentBalanceCents: a.current_balance_cents,
      paidAmountCents: a.paid_amount_cents,
      dueDate: a.due_date,
      priority: a.priority,
      structural: a.structural,
      nextAction: a.next_action,
      status: 'active',
      provenance,
      createdAt: at,
      updatedAt: at,
    });
    return {
      collection: 'debts' as const,
      entityId: id,
      message: `Dívida com ${a.creditor_name} salva.`,
    };
  }

  if (normalized.name === 'create_opportunity') {
    state.opportunities.unshift({
      id,
      title: a.title,
      stage: 'new',
      estimatedValueCents: a.estimated_value_cents,
      certainty: a.certainty,
      nextAction: a.next_action,
      nextActionAt: a.next_action_date
        ? `${a.next_action_date}T12:00:00.000Z`
        : undefined,
      notes: a.notes,
      provenance,
      createdAt: at,
      updatedAt: at,
    });
    return {
      collection: 'opportunities' as const,
      entityId: id,
      message: `Oportunidade “${a.title}” salva.`,
    };
  }

  if (normalized.name === 'create_project') {
    const contactId = findContactId(state, a.client_name);
    state.projects.unshift({
      id,
      contactId,
      name: a.name,
      status: 'planned',
      dueDate: a.due_date,
      budgetCents: a.budget_cents,
      description: a.description,
      projectType: a.project_type,
      nextAction: a.next_action,
      provenance,
      createdAt: at,
      updatedAt: at,
    });
    return {
      collection: 'projects' as const,
      entityId: id,
      message: `Projeto “${a.name}” salvo.`,
    };
  }

  if (normalized.name === 'create_receivable') {
    const contactId = findContactId(state, a.client_name);
    state.receivables.unshift({
      id,
      contactId,
      title: a.title,
      amountCents: a.amount_cents,
      certainty: a.certainty,
      status: 'pending',
      expectedOn: a.expected_on,
      expectedWindow: a.expected_window,
      notes: a.notes,
      nextAction: a.next_action,
      provenance,
      createdAt: at,
      updatedAt: at,
    });
    return {
      collection: 'receivables' as const,
      entityId: id,
      message: `Valor a receber “${a.title}” salvo como ${a.certainty}.`,
    };
  }

  if (normalized.name === 'create_obligation') {
    state.obligations.unshift({
      id,
      title: a.title,
      amountCents: a.amount_cents,
      kind: a.kind,
      status: 'planned',
      dueDate: a.due_date,
      essentiality: a.essentiality,
      recurring: a.recurring,
      notes: a.notes,
      provenance,
      createdAt: at,
      updatedAt: at,
    });
    return {
      collection: 'obligations' as const,
      entityId: id,
      message: `Obrigação “${a.title}” de ${brl(a.amount_cents)} salva.`,
    };
  }

  if (normalized.name === 'create_client_experience') {
    const contactId = findContactId(state, a.client_name);
    state.clientExperiences.unshift({
      id,
      contactId,
      clientLabel: a.client_name,
      workLabel: a.work_label,
      occurredOn: a.occurred_on,
      agreement: a.agreement,
      whatHappened: a.what_happened,
      whatWorked: a.what_worked,
      whatFailed: a.what_failed,
      clientMetDeadline: a.client_met_deadline,
      britoMetDeadline: a.brito_met_deadline,
      scopeChanged: a.scope_changed,
      communication: a.communication,
      paymentExperience: a.payment_experience,
      mistakeToAvoid: a.mistake_to_avoid,
      patternToKeep: a.pattern_to_keep,
      nextAction: a.next_action,
      learnedRule: a.learned_rule,
      facts: a.facts,
      interpretations: a.interpretations,
      provenance,
      createdAt: at,
      updatedAt: at,
    });
    return {
      collection: 'clientExperiences' as const,
      entityId: id,
      message: `Experiência com ${a.client_name} salva na memória profissional.`,
    };
  }

  if (normalized.name === 'create_study_event') {
    state.studyEvents.unshift({
      id,
      occurredOn: a.occurred_on,
      skill: a.skill,
      exercise: a.exercise,
      take: a.take,
      score: a.score,
      mainError: a.main_error,
      correction: a.correction,
      redone: a.redone,
      scoreAfter: a.score_after,
      observation: a.observation,
      level: a.level,
      provenance,
      createdAt: at,
      updatedAt: at,
    });
    return {
      collection: 'studyEvents' as const,
      entityId: id,
      message: `Estudo de ${a.skill} salvo com nota ${a.score}.`,
    };
  }

  const contactId = findContactId(state, a.client_name);
  state.inbox.unshift({
    id,
    text: a.text,
    kind: a.kind,
    certainty: a.certainty,
    status: 'new',
    occurredOn: a.occurred_on,
    recordedAt: at,
    contactId,
    amountCents: a.amount_cents,
    nextAction: a.next_action,
    sourceText: a.text,
    provenance,
    createdAt: at,
    updatedAt: at,
  });
  return {
    collection: 'inbox' as const,
    entityId: id,
    message: 'Informação salva na Caixa de Entrada.',
  };
}
