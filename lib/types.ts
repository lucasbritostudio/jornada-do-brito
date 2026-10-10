export type Id = string;

export type Contact = {
  id: Id;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  lifecycle: 'prospect' | 'client' | 'partner' | 'inactive';
  source?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type Opportunity = {
  id: Id;
  contactId?: Id;
  title: string;
  stage: 'new' | 'qualifying' | 'proposal' | 'negotiation' | 'won' | 'lost';
  estimatedValueCents?: number;
  nextAction?: string;
  nextActionAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: Id;
  contactId?: Id;
  opportunityId?: Id;
  name: string;
  status: 'planned' | 'active' | 'waiting_client' | 'review' | 'completed' | 'cancelled';
  dueDate?: string;
  budgetCents?: number;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type FinancialAccount = {
  id: Id;
  name: string;
  type: 'cash' | 'bank' | 'wallet' | 'credit_card';
  openingBalanceCents: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Transaction = {
  id: Id;
  accountId?: Id;
  type: 'income' | 'expense';
  amountCents: number;
  occurredOn: string;
  category?: string;
  description: string;
  contactId?: Id;
  projectId?: Id;
  status: 'planned' | 'cleared' | 'cancelled';
  createdAt: string;
  updatedAt: string;
};

export type Debt = {
  id: Id;
  creditorName: string;
  description?: string;
  originalAmountCents: number;
  currentBalanceCents: number;
  dueDate?: string;
  installments?: number;
  interestRate?: number;
  status: 'active' | 'settled' | 'renegotiated' | 'cancelled';
  createdAt: string;
  updatedAt: string;
};

export type Goal = {
  id: Id;
  ambition?: string;
  title: string;
  why?: string;
  targetValue?: number;
  currentValue?: number;
  targetDate?: string;
  status: 'active' | 'achieved' | 'paused' | 'archived';
  createdAt: string;
  updatedAt: string;
};

export type Task = {
  id: Id;
  title: string;
  status: 'todo' | 'doing' | 'blocked' | 'done' | 'cancelled';
  priority: 'low' | 'medium' | 'high';
  dueAt?: string;
  contactId?: Id;
  projectId?: Id;
  goalId?: Id;
  createdAt: string;
  updatedAt: string;
};

export type Conversation = {
  id: Id;
  contactId?: Id;
  provider: 'manual' | 'meta';
  status: 'open' | 'waiting_me' | 'waiting_client' | 'resolved' | 'archived';
  lastMessageAt?: string;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
};

export type Message = {
  id: Id;
  conversationId: Id;
  contactId?: Id;
  direction: 'inbound' | 'outbound';
  text?: string;
  providerMessageId?: string;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';
  aiGenerated?: boolean;
  createdAt: string;
};

export type FileRecord = {
  id: Id;
  name: string;
  pathname: string;
  contentType?: string;
  size: number;
  ownerType?: string;
  ownerId?: string;
  createdAt: string;
};

export type AuditEntry = {
  id: Id;
  at: string;
  action: string;
  collection?: string;
  recordId?: string;
  summary?: string;
};

export type WorkspaceState = {
  version: number;
  profile: {
    displayName: string;
    locale: string;
    timezone: string;
    workspaceName: string;
  };
  contacts: Contact[];
  opportunities: Opportunity[];
  projects: Project[];
  financialAccounts: FinancialAccount[];
  transactions: Transaction[];
  debts: Debt[];
  goals: Goal[];
  tasks: Task[];
  conversations: Conversation[];
  messages: Message[];
  files: FileRecord[];
  audit: AuditEntry[];
  createdAt: string;
  updatedAt: string;
};
