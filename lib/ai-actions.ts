import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { WorkspaceState } from './types';

export type JornadaActionName =
  | 'create_contact'
  | 'create_task'
  | 'create_goal'
  | 'create_transaction'
  | 'create_debt'
  | 'create_opportunity';

export type JornadaAction = {
  name: JornadaActionName;
  args: Record<string, unknown>;
};

type ActionPayload = JornadaAction & {
  v: 1;
  jti: string;
  exp: number;
};

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

function positiveInt(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n);
}

function optionalNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
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

export const JORNADA_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_contact',
      description:
        'Proponha criar um contato somente quando Brito pedir explicitamente para cadastrar, salvar ou registrar uma pessoa/cliente. Se o nome estiver faltando, não use a ferramenta.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', description: 'Nome da pessoa ou empresa.' },
          phone: { type: 'string', description: 'Telefone ou WhatsApp, se informado.' },
          email: { type: 'string', description: 'E-mail, se informado.' },
          company: { type: 'string', description: 'Empresa, se informada.' },
          notes: { type: 'string', description: 'Observação curta, se útil.' },
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
        'Proponha criar uma tarefa somente quando Brito pedir explicitamente para anotar, criar ou registrar algo que precisa ser feito.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          due_date: { type: 'string', description: 'Data YYYY-MM-DD, se informada.' },
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
        'Proponha criar um objetivo somente quando Brito pedir explicitamente para registrar uma meta ou objetivo.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          ambition: { type: 'string' },
          why: { type: 'string' },
          target_value: { type: 'number' },
          target_date: { type: 'string', description: 'Data YYYY-MM-DD, se informada.' },
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
        'Proponha registrar uma entrada ou gasto somente quando Brito disser explicitamente que quer registrar uma movimentação real. Precisa de tipo, valor e descrição.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: ['income', 'expense'] },
          amount_cents: { type: 'integer', description: 'Valor em centavos. Ex.: R$ 50 = 5000.' },
          description: { type: 'string' },
          category: { type: 'string' },
          occurred_on: { type: 'string', description: 'Data YYYY-MM-DD. Se não informada, omita.' },
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
        'Proponha registrar uma dívida real somente quando Brito pedir explicitamente. Precisa de credor e valor original.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          creditor_name: { type: 'string' },
          original_amount_cents: { type: 'integer' },
          current_balance_cents: { type: 'integer' },
          due_date: { type: 'string', description: 'Data YYYY-MM-DD, se informada.' },
          installments: { type: 'integer' },
          interest_rate: { type: 'number' },
          description: { type: 'string' },
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
        'Proponha criar uma oportunidade comercial somente quando Brito pedir explicitamente para registrar uma oportunidade, possível trabalho ou negociação.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          estimated_value_cents: { type: 'integer' },
          next_action: { type: 'string' },
          next_action_date: { type: 'string', description: 'Data YYYY-MM-DD, se informada.' },
        },
        required: ['title'],
      },
    },
  },
] as const;

export function normalizeAction(name: string, raw: Record<string, unknown>): JornadaAction {
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
          notes: optionalText(raw.notes, 500),
        },
      };
    }
    case 'create_task': {
      const title = text(raw.title, 180);
      if (!title) throw new Error('Falta o título da tarefa.');
      const priority = ['low', 'medium', 'high'].includes(String(raw.priority))
        ? String(raw.priority)
        : 'medium';
      return {
        name: 'create_task',
        args: { title, priority, due_date: isoDate(raw.due_date) },
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
          why: optionalText(raw.why, 500),
          target_value: optionalNumber(raw.target_value),
          target_date: isoDate(raw.target_date),
        },
      };
    }
    case 'create_transaction': {
      const typeValue = raw.type === 'income' ? 'income' : raw.type === 'expense' ? 'expense' : '';
      const amount = positiveInt(raw.amount_cents);
      const description = text(raw.description, 180);
      if (!typeValue || !amount || !description) {
        throw new Error('Para registrar dinheiro, preciso saber tipo, valor e descrição.');
      }
      return {
        name: 'create_transaction',
        args: {
          type: typeValue,
          amount_cents: amount,
          description,
          category: optionalText(raw.category, 80),
          occurred_on: isoDate(raw.occurred_on) || todayLocal(),
        },
      };
    }
    case 'create_debt': {
      const creditor = text(raw.creditor_name, 140);
      const original = positiveInt(raw.original_amount_cents);
      if (!creditor || !original) throw new Error('Falta o credor ou o valor da dívida.');
      return {
        name: 'create_debt',
        args: {
          creditor_name: creditor,
          original_amount_cents: original,
          current_balance_cents: positiveInt(raw.current_balance_cents) || original,
          due_date: isoDate(raw.due_date),
          installments: positiveInt(raw.installments),
          interest_rate: optionalNumber(raw.interest_rate),
          description: optionalText(raw.description, 500),
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
          next_action: optionalText(raw.next_action, 180),
          next_action_date: isoDate(raw.next_action_date),
        },
      };
    }
    default:
      throw new Error('Ação não permitida.');
  }
}

function label(action: JornadaAction) {
  const a = action.args as any;
  switch (action.name) {
    case 'create_contact':
      return { title: 'Criar contato', summary: a.name, details: [a.phone, a.email, a.company].filter(Boolean) };
    case 'create_task':
      return { title: 'Criar tarefa', summary: a.title, details: [a.due_date ? `Prazo: ${a.due_date}` : null, `Prioridade: ${a.priority}`].filter(Boolean) };
    case 'create_goal':
      return { title: 'Criar objetivo', summary: a.title, details: [a.ambition, a.target_date ? `Prazo: ${a.target_date}` : null].filter(Boolean) };
    case 'create_transaction':
      return { title: a.type === 'income' ? 'Registrar entrada' : 'Registrar gasto', summary: `${brl(a.amount_cents)} · ${a.description}`, details: [a.category, a.occurred_on].filter(Boolean) };
    case 'create_debt':
      return { title: 'Registrar dívida', summary: `${a.creditor_name} · ${brl(a.current_balance_cents)}`, details: [a.due_date ? `Vence: ${a.due_date}` : null].filter(Boolean) };
    case 'create_opportunity':
      return { title: 'Criar oportunidade', summary: a.title, details: [a.estimated_value_cents ? brl(a.estimated_value_cents) : null, a.next_action].filter(Boolean) };
  }
}

function signPayload(payload: ActionPayload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret())
    .update(`jornada-action-v1.${encoded}`)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

export function createActionProposal(name: string, rawArgs: Record<string, unknown>) {
  const action = normalizeAction(name, rawArgs);
  const payload: ActionPayload = {
    v: 1,
    jti: randomUUID(),
    exp: Date.now() + 10 * 60 * 1000,
    ...action,
  };
  return { ...label(action), name: action.name, token: signPayload(payload) };
}

export function verifyActionToken(token: string): ActionPayload {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) throw new Error('Ação inválida.');
  const expected = createHmac('sha256', secret())
    .update(`jornada-action-v1.${encoded}`)
    .digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('Ação inválida.');
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as ActionPayload;
  if (payload.v !== 1 || payload.exp < Date.now() || !payload.jti) throw new Error('Ação expirada.');
  const normalized = normalizeAction(payload.name, payload.args || {});
  return { ...payload, ...normalized };
}

export function executeAction(state: WorkspaceState, payload: ActionPayload) {
  const at = new Date().toISOString();
  const id = randomUUID();
  const a = payload.args as any;

  if (payload.name === 'create_contact') {
    const duplicate = state.contacts.find((c) =>
      (a.phone && c.phone === a.phone) || (a.email && c.email?.toLowerCase() === String(a.email).toLowerCase()),
    );
    if (duplicate) throw new Error('Já existe um contato com esse telefone ou e-mail.');
    state.contacts.unshift({
      id, name: a.name, phone: a.phone, email: a.email, company: a.company,
      lifecycle: 'prospect', source: 'Jornada IA', notes: a.notes, createdAt: at, updatedAt: at,
    });
    return { entityId: id, message: `Contato ${a.name} criado.` };
  }

  if (payload.name === 'create_task') {
    state.tasks.unshift({
      id, title: a.title, status: 'todo', priority: a.priority,
      dueAt: a.due_date ? `${a.due_date}T12:00:00.000Z` : undefined,
      createdAt: at, updatedAt: at,
    });
    return { entityId: id, message: `Tarefa “${a.title}” criada.` };
  }

  if (payload.name === 'create_goal') {
    state.goals.unshift({
      id, title: a.title, ambition: a.ambition, why: a.why,
      targetValue: a.target_value, currentValue: 0, targetDate: a.target_date,
      status: 'active', createdAt: at, updatedAt: at,
    });
    return { entityId: id, message: `Objetivo “${a.title}” criado.` };
  }

  if (payload.name === 'create_transaction') {
    state.transactions.unshift({
      id, type: a.type, amountCents: a.amount_cents, occurredOn: a.occurred_on,
      category: a.category, description: a.description, status: 'cleared',
      createdAt: at, updatedAt: at,
    });
    return { entityId: id, message: `${a.type === 'income' ? 'Entrada' : 'Gasto'} de ${brl(a.amount_cents)} registrado.` };
  }

  if (payload.name === 'create_debt') {
    state.debts.unshift({
      id, creditorName: a.creditor_name, description: a.description,
      originalAmountCents: a.original_amount_cents, currentBalanceCents: a.current_balance_cents,
      dueDate: a.due_date, installments: a.installments, interestRate: a.interest_rate,
      status: 'active', createdAt: at, updatedAt: at,
    });
    return { entityId: id, message: `Dívida com ${a.creditor_name} registrada.` };
  }

  state.opportunities.unshift({
    id, title: a.title, stage: 'new',
    estimatedValueCents: a.estimated_value_cents,
    nextAction: a.next_action,
    nextActionAt: a.next_action_date ? `${a.next_action_date}T12:00:00.000Z` : undefined,
    createdAt: at, updatedAt: at,
  });
  return { entityId: id, message: `Oportunidade “${a.title}” criada.` };
}
