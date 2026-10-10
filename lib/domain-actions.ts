import type {
  UndoChange,
  WorkspaceState,
} from './types';

export type DomainActionName =
  | 'receive_receivable'
  | 'record_debt_payment'
  | 'mark_obligation_paid'
  | 'update_project_status'
  | 'complete_task'
  | 'reconcile_account_balance';

export type DomainAction = {
  name: DomainActionName;
  args: Record<string, unknown>;
};

function text(value: unknown, max = 220) {
  return typeof value === 'string'
    ? value.trim().slice(0, max)
    : '';
}

function positiveInt(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return undefined;
  return Math.round(number);
}

function isoDate(value: unknown) {
  const valueText = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(valueText)
    ? valueText
    : undefined;
}

function todayLocal() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone:
      process.env.JORNADA_TIMEZONE || 'America/Fortaleza',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${map.year}-${map.month}-${map.day}`;
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function brl(cents: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

function snapshot(value: object) {
  return structuredClone(value) as unknown as Record<
    string,
    unknown
  >;
}

function findAccount(
  state: WorkspaceState,
  label: string,
) {
  return findUnique(
    state.financialAccounts.filter((item) => item.active),
    label,
    (item) => item.name,
    'conta',
  );
}

function accountSnapshotAndDelta(
  state: WorkspaceState,
  accountName: unknown,
  deltaCents: number,
  at: string,
) {
  const label = text(accountName, 160);
  if (!label) return undefined;

  const account = findAccount(state, label);
  const before = snapshot(account);
  const base =
    account.currentBalanceCents ??
    account.openingBalanceCents;

  account.currentBalanceCents = base + deltaCents;
  account.balanceAsOf = at;
  account.updatedAt = at;

  return { account, before };
}

function findUnique<T>(
  items: T[],
  query: string,
  label: (item: T) => string,
  entityName: string,
) {
  const target = normalize(query);
  if (!target) {
    throw new Error(`Falta identificar ${entityName}.`);
  }

  const exact = items.filter(
    (item) => normalize(label(item)) === target,
  );
  if (exact.length === 1) return exact[0];

  const partial = items.filter((item) => {
    const value = normalize(label(item));
    return value.includes(target) || target.includes(value);
  });

  if (partial.length === 1) return partial[0];
  if (!partial.length) {
    throw new Error(
      `Não encontrei ${entityName} “${query}” na Jornada.`,
    );
  }
  throw new Error(
    `Encontrei mais de um ${entityName} parecido com “${query}”. Diga qual deles.`,
  );
}

export const JORNADA_DOMAIN_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'receive_receivable',
      description:
        'Use quando Brito disser claramente que recebeu um valor que já estava a receber. Atualiza o recebível e cria a entrada financeira no mesmo registro lógico.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          reference: {
            type: 'string',
            description:
              'Nome do cliente ou título do valor a receber, por exemplo Juliany.',
          },
          amount_cents: {
            type: 'integer',
            description:
              'Valor efetivamente recebido em centavos. Pode ser omitido se o recebível já tiver valor confirmado.',
          },
          occurred_on: {
            type: 'string',
            description: 'YYYY-MM-DD. Omita para hoje.',
          },
          description: { type: 'string' },
          account_name: {
            type: 'string',
            description: 'Conta em que o dinheiro entrou, somente se Brito informar.',
          },
        },
        required: ['reference'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'record_debt_payment',
      description:
        'Use quando Brito disser claramente que PAGOU uma parte de uma dívida já cadastrada. Apenas registra o pagamento ocorrido; não movimenta dinheiro real.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          creditor_name: { type: 'string' },
          amount_cents: { type: 'integer' },
          occurred_on: {
            type: 'string',
            description: 'YYYY-MM-DD. Omita para hoje.',
          },
          description: { type: 'string' },
          account_name: {
            type: 'string',
            description: 'Conta usada no pagamento, somente se Brito informar.',
          },
        },
        required: ['creditor_name', 'amount_cents'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mark_obligation_paid',
      description:
        'Use quando Brito disser claramente que pagou uma conta/obrigação já cadastrada. Marca a obrigação como paga e cria a saída correspondente.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          reference: { type: 'string' },
          occurred_on: {
            type: 'string',
            description: 'YYYY-MM-DD. Omita para hoje.',
          },
          account_name: {
            type: 'string',
            description: 'Conta usada no pagamento, somente se Brito informar.',
          },
        },
        required: ['reference'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reconcile_account_balance',
      description:
        'Use quando Brito informar o saldo atual de uma conta. Atualiza a posição registrada sem inventar receita ou gasto.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          account_name: { type: 'string' },
          balance_cents: {
            type: 'integer',
            description: 'Saldo atual em centavos.',
          },
          balance_as_of: {
            type: 'string',
            description: 'YYYY-MM-DD. Omita para hoje.',
          },
        },
        required: ['account_name', 'balance_cents'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_project_status',
      description:
        'Use quando Brito informar claramente uma mudança real de estado de um projeto já cadastrado.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          project_name: { type: 'string' },
          status: {
            type: 'string',
            enum: [
              'planned',
              'active',
              'waiting_client',
              'review',
              'completed',
              'cancelled',
            ],
          },
          next_action: { type: 'string' },
          due_date: { type: 'string' },
        },
        required: ['project_name', 'status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_task',
      description:
        'Use quando Brito disser claramente que concluiu uma tarefa já cadastrada.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
        },
        required: ['title'],
      },
    },
  },
] as const;

export function normalizeDomainAction(
  name: string,
  raw: Record<string, unknown>,
): DomainAction | null {
  if (name === 'receive_receivable') {
    const reference = text(raw.reference, 180);
    if (!reference) {
      throw new Error(
        'Diga qual valor a receber foi pago.',
      );
    }
    return {
      name,
      args: {
        reference,
        amount_cents: positiveInt(raw.amount_cents),
        occurred_on: isoDate(raw.occurred_on) || todayLocal(),
        description: text(raw.description, 300) || undefined,
        account_name: text(raw.account_name, 160) || undefined,
      },
    };
  }

  if (name === 'record_debt_payment') {
    const creditor = text(raw.creditor_name, 180);
    const amount = positiveInt(raw.amount_cents);
    if (!creditor || !amount) {
      throw new Error(
        'Para registrar o pagamento da dívida, preciso do credor e do valor pago.',
      );
    }
    return {
      name,
      args: {
        creditor_name: creditor,
        amount_cents: amount,
        occurred_on: isoDate(raw.occurred_on) || todayLocal(),
        description: text(raw.description, 300) || undefined,
        account_name: text(raw.account_name, 160) || undefined,
      },
    };
  }

  if (name === 'mark_obligation_paid') {
    const reference = text(raw.reference, 180);
    if (!reference) {
      throw new Error('Diga qual conta foi paga.');
    }
    return {
      name,
      args: {
        reference,
        occurred_on: isoDate(raw.occurred_on) || todayLocal(),
        account_name: text(raw.account_name, 160) || undefined,
      },
    };
  }

  if (name === 'reconcile_account_balance') {
    const accountName = text(raw.account_name, 160);
    const balance = Number(raw.balance_cents);
    if (!accountName || !Number.isFinite(balance) || balance < 0) {
      throw new Error(
        'Para atualizar o saldo, preciso da conta e do valor atual.',
      );
    }
    return {
      name,
      args: {
        account_name: accountName,
        balance_cents: Math.round(balance),
        balance_as_of:
          isoDate(raw.balance_as_of) || todayLocal(),
      },
    };
  }

  if (name === 'update_project_status') {
    const projectName = text(raw.project_name, 180);
    const statuses = [
      'planned',
      'active',
      'waiting_client',
      'review',
      'completed',
      'cancelled',
    ];
    const status = String(raw.status || '');
    if (!projectName || !statuses.includes(status)) {
      throw new Error(
        'Falta identificar o projeto ou o novo estado.',
      );
    }
    return {
      name,
      args: {
        project_name: projectName,
        status,
        next_action:
          text(raw.next_action, 300) || undefined,
        due_date: isoDate(raw.due_date),
      },
    };
  }

  if (name === 'complete_task') {
    const title = text(raw.title, 220);
    if (!title) {
      throw new Error('Diga qual tarefa foi concluída.');
    }
    return {
      name,
      args: { title },
    };
  }

  return null;
}

export function domainActionLabel(
  action: DomainAction,
) {
  const args = action.args as any;

  if (action.name === 'receive_receivable') {
    return {
      title: 'Dar recebimento',
      summary: args.reference,
      details: [
        args.amount_cents
          ? brl(args.amount_cents)
          : 'usar valor cadastrado',
        args.occurred_on,
      ],
    };
  }

  if (action.name === 'record_debt_payment') {
    return {
      title: 'Registrar pagamento de dívida',
      summary: `${args.creditor_name} · ${brl(args.amount_cents)}`,
      details: [args.occurred_on],
    };
  }

  if (action.name === 'mark_obligation_paid') {
    return {
      title: 'Marcar conta como paga',
      summary: args.reference,
      details: [args.occurred_on],
    };
  }

  if (action.name === 'reconcile_account_balance') {
    return {
      title: 'Atualizar saldo da conta',
      summary: `${args.account_name} · ${brl(args.balance_cents)}`,
      details: [args.balance_as_of],
    };
  }

  if (action.name === 'update_project_status') {
    return {
      title: 'Atualizar projeto',
      summary: `${args.project_name} · ${args.status}`,
      details: [args.next_action, args.due_date].filter(Boolean),
    };
  }

  return {
    title: 'Concluir tarefa',
    summary: args.title,
    details: [],
  };
}

export function executeDomainAction(
  state: WorkspaceState,
  action: DomainAction,
) {
  const args = action.args as any;
  const at = new Date().toISOString();
  const provenance = {
    kind: 'ai' as const,
    label: 'Jornada IA',
    updatedAt: at,
  };

  if (action.name === 'receive_receivable') {
    const receivable = findUnique(
      state.receivables.filter(
        (item) => item.status === 'pending',
      ),
      args.reference,
      (item) => item.title,
      'valor a receber',
    );

    const amount =
      args.amount_cents || receivable.amountCents;
    if (!amount) {
      throw new Error(
        'Esse valor a receber não tem quantia fechada. Diga quanto entrou.',
      );
    }

    const before = snapshot(receivable);
    const transactionId = crypto.randomUUID();

    receivable.status = 'received';
    receivable.amountCents = amount;
    receivable.receivedTransactionId = transactionId;
    receivable.updatedAt = at;

    const accountUpdate = accountSnapshotAndDelta(
      state,
      args.account_name,
      amount,
      at,
    );

    state.transactions.unshift({
      id: transactionId,
      accountId: accountUpdate?.account.id,
      contactId: receivable.contactId,
      projectId: receivable.projectId,
      type: 'income',
      amountCents: amount,
      occurredOn: args.occurred_on,
      category: 'Recebimento',
      description:
        args.description ||
        `Recebimento: ${receivable.title}`,
      status: 'cleared',
      certainty: 'confirmed',
      provenance,
      createdAt: at,
      updatedAt: at,
    });

    const undoChanges: UndoChange[] = [
      {
        kind: 'restore',
        collection: 'receivables',
        entityId: receivable.id,
        before,
      },
      ...(accountUpdate
        ? [
            {
              kind: 'restore' as const,
              collection: 'financialAccounts',
              entityId: accountUpdate.account.id,
              before: accountUpdate.before,
            },
          ]
        : []),
      {
        kind: 'delete',
        collection: 'transactions',
        entityId: transactionId,
      },
    ];

    return {
      collection: 'receivables',
      entityId: receivable.id,
      message: `${brl(amount)} recebido em “${receivable.title}”. O recebível foi baixado e a entrada foi registrada.`,
      undoChanges,
    };
  }

  if (action.name === 'record_debt_payment') {
    const debt = findUnique(
      state.debts.filter((item) => item.status === 'active'),
      args.creditor_name,
      (item) => item.creditorName,
      'dívida',
    );

    const amount = args.amount_cents as number;
    if (amount > debt.currentBalanceCents) {
      throw new Error(
        `O pagamento de ${brl(amount)} é maior que o saldo cadastrado de ${brl(debt.currentBalanceCents)}. Confira o valor.`,
      );
    }

    const before = snapshot(debt);
    const transactionId = crypto.randomUUID();
    const priorPaid =
      debt.paidAmountCents ??
      Math.max(
        0,
        debt.originalAmountCents - debt.currentBalanceCents,
      );

    debt.paidAmountCents = priorPaid + amount;
    debt.currentBalanceCents -= amount;
    debt.status =
      debt.currentBalanceCents === 0 ? 'settled' : 'active';
    debt.updatedAt = at;

    const accountUpdate = accountSnapshotAndDelta(
      state,
      args.account_name,
      -amount,
      at,
    );

    state.transactions.unshift({
      id: transactionId,
      accountId: accountUpdate?.account.id,
      type: 'expense',
      amountCents: amount,
      occurredOn: args.occurred_on,
      category: 'Dívida',
      description:
        args.description ||
        `Pagamento de dívida: ${debt.creditorName}`,
      status: 'cleared',
      certainty: 'confirmed',
      provenance,
      createdAt: at,
      updatedAt: at,
    });

    return {
      collection: 'debts',
      entityId: debt.id,
      message: `Pagamento de ${brl(amount)} para ${debt.creditorName} registrado. Saldo atual: ${brl(debt.currentBalanceCents)}.`,
      undoChanges: [
        {
          kind: 'restore',
          collection: 'debts',
          entityId: debt.id,
          before,
        },
        ...(accountUpdate
          ? [
              {
                kind: 'restore' as const,
                collection: 'financialAccounts',
                entityId: accountUpdate.account.id,
                before: accountUpdate.before,
              },
            ]
          : []),
        ...(accountUpdate
          ? [
              {
                kind: 'restore' as const,
                collection: 'financialAccounts',
                entityId: accountUpdate.account.id,
                before: accountUpdate.before,
              },
            ]
          : []),
        {
          kind: 'delete',
          collection: 'transactions',
          entityId: transactionId,
        },
      ] satisfies UndoChange[],
    };
  }

  if (action.name === 'mark_obligation_paid') {
    const obligation = findUnique(
      state.obligations.filter(
        (item) =>
          item.status === 'planned' ||
          item.status === 'review',
      ),
      args.reference,
      (item) => item.title,
      'obrigação',
    );

    const before = snapshot(obligation);
    const transactionId = crypto.randomUUID();

    obligation.status = 'paid';
    obligation.updatedAt = at;

    const accountUpdate = accountSnapshotAndDelta(
      state,
      args.account_name,
      -obligation.amountCents,
      at,
    );

    state.transactions.unshift({
      id: transactionId,
      accountId: accountUpdate?.account.id,
      type: 'expense',
      amountCents: obligation.amountCents,
      occurredOn: args.occurred_on,
      category: obligation.kind,
      description: obligation.title,
      status: 'cleared',
      certainty: 'confirmed',
      provenance,
      createdAt: at,
      updatedAt: at,
    });

    return {
      collection: 'obligations',
      entityId: obligation.id,
      message: `“${obligation.title}” marcada como paga e saída de ${brl(obligation.amountCents)} registrada.`,
      undoChanges: [
        {
          kind: 'restore',
          collection: 'obligations',
          entityId: obligation.id,
          before,
        },
        {
          kind: 'delete',
          collection: 'transactions',
          entityId: transactionId,
        },
      ] satisfies UndoChange[],
    };
  }

  if (action.name === 'reconcile_account_balance') {
    const account = findAccount(state, args.account_name);
    const before = snapshot(account);
    account.currentBalanceCents = args.balance_cents;
    account.balanceAsOf = args.balance_as_of;
    account.updatedAt = at;

    return {
      collection: 'financialAccounts',
      entityId: account.id,
      message: `Saldo registrado de ${account.name} atualizado para ${brl(args.balance_cents)}.`,
      undoChanges: [
        {
          kind: 'restore',
          collection: 'financialAccounts',
          entityId: account.id,
          before,
        },
      ] satisfies UndoChange[],
    };
  }

  if (action.name === 'update_project_status') {
    const project = findUnique(
      state.projects,
      args.project_name,
      (item) => item.name,
      'projeto',
    );
    const before = snapshot(project);

    project.status = args.status;
    if (args.next_action !== undefined) {
      project.nextAction = args.next_action;
    }
    if (args.due_date !== undefined) {
      project.dueDate = args.due_date;
    }
    project.updatedAt = at;

    return {
      collection: 'projects',
      entityId: project.id,
      message: `Projeto “${project.name}” atualizado para ${project.status}.`,
      undoChanges: [
        {
          kind: 'restore',
          collection: 'projects',
          entityId: project.id,
          before,
        },
      ] satisfies UndoChange[],
    };
  }

  const task = findUnique(
    state.tasks.filter(
      (item) =>
        item.status !== 'done' &&
        item.status !== 'cancelled',
    ),
    args.title,
    (item) => item.title,
    'tarefa',
  );
  const before = snapshot(task);
  task.status = 'done';
  task.updatedAt = at;

  return {
    collection: 'tasks',
    entityId: task.id,
    message: `Tarefa “${task.title}” concluída.`,
    undoChanges: [
      {
        kind: 'restore',
        collection: 'tasks',
        entityId: task.id,
        before,
      },
    ] satisfies UndoChange[],
  };
}
