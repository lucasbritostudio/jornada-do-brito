export type Id = string;

export type DataCertainty =
  | 'confirmed'
  | 'estimate'
  | 'forecast'
  | 'pending'
  | 'interpretation';

export type RecordSource = {
  kind: 'manual' | 'ai' | 'whatsapp' | 'drive_import' | 'system';
  label?: string;
  ref?: string;
  updatedAt?: string;
};

export type Contact = {
  id: Id;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  role?: string;
  lifecycle: 'prospect' | 'client' | 'partner' | 'inactive';
  source?: string;
  notes?: string;
  preferences?: string[];
  communicationStyle?: string;
  approver?: string;
  risks?: string[];
  opportunities?: string[];
  nextAction?: string;
  importKey?: string;
  provenance?: RecordSource;
  createdAt: string;
  updatedAt: string;
};

export type Opportunity = {
  id: Id;
  contactId?: Id;
  title: string;
  stage: 'new' | 'qualifying' | 'proposal' | 'negotiation' | 'won' | 'lost';
  estimatedValueCents?: number;
  certainty?: DataCertainty;
  nextAction?: string;
  nextActionAt?: string;
  notes?: string;
  importKey?: string;
  provenance?: RecordSource;
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
  projectType?: 'video' | 'photo' | 'event' | 'political' | 'commercial' | 'other';
  nextAction?: string;
  importKey?: string;
  provenance?: RecordSource;
  createdAt: string;
  updatedAt: string;
};

export type ServiceOffering = {
  id: Id;
  name: string;
  description: string;
  priceCents: number;
  deliveryMode: 'video' | 'general';
  videoQuantity?: number;
  deliveryLabel?: string;
  portfolioImageUrl?: string;
  portfolioLinks?: string[];
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PortfolioItem = {
  id: Id;
  title: string;
  description: string;
  /** Private Vercel Blob path; never returned by public portfolio routes. */
  blobPathname: string;
  /** Private JPEG cover generated from a video frame. */
  coverPathname?: string;
  coverFrameSeconds?: number;
  contentType: string;
  originalFilename: string;
  sizeBytes: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ClientRequest = {
  id: Id;
  contactId: Id;
  opportunityId: Id;
  serviceId: Id;
  serviceName: string;
  deliveryMode: 'video' | 'general';
  agreedPriceCents: number;
  videoQuantity?: number;
  deliveryLabel?: string;
  deliveryClockMode?: 'after_capture_and_materials';
  objective?: string;
  desiredDate?: string;
  bookingStatus?: 'not_scheduled' | 'proposed' | 'confirmed' | 'change_requested' | 'reschedule_proposed' | 'awaiting_deposit' | 'deposit_paid_reschedule_needed';
  scheduleProposalAt?: string;
  scheduledAt?: string;
  scheduleMessage?: string;
  bookingReservedAt?: string;
  cancellationTermsAcceptedAt?: string;
  cancellation?: {
    requestedAt: string;
    status: 'refund_pending' | 'review_required' | 'refunded';
    reason?: string;
    rule: 'cooling_off_full_refund' | 'no_reservation_full_refund' | 'reservation_fee_10_percent' | 'manual_review';
    paidCents: number;
    feeCents?: number;
    refundCents?: number;
    refundDeadlineAt?: string;
    refundedAt?: string;
    refundTransactionId?: string;
  };
  location?: string;
  materials?: ClientRequestMaterial[];
  requestFingerprint?: string;
  note?: string;
  status: 'pending' | 'accepted' | 'declined';
  projectId?: Id;
  workId?: Id;
  workIds?: Id[];
  taskId?: Id;
  portalTokenHash?: string;
  createdAt: string;
  updatedAt: string;
};

export type ClientRequestMaterial = {
  id: Id;
  /** Private Vercel Blob path. Never exposed by customer-facing endpoints. */
  pathname: string;
  name: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
  size: number;
  createdAt: string;
};

export type VideoBrief = {
  id: Id;
  projectId?: Id;
  contactId?: Id;
  title: string;
  objective: string;
  audience?: string;
  platform?: string;
  desiredAction?: string;
  approver?: string;
  mainMessage?: string;
  emotion?: string;
  hook?: string;
  proof?: string;
  closing?: string;
  cta?: string;
  location?: string;
  deliveryFormat?: string;
  notes?: string;
  checklistStage?:
    | 'briefing'
    | 'pre_production'
    | 'capture'
    | 'editing'
    | 'review'
    | 'delivery';
  importKey?: string;
  provenance?: RecordSource;
  createdAt: string;
  updatedAt: string;
};

export type FinancialAccount = {
  id: Id;
  name: string;
  type: 'cash' | 'bank' | 'wallet' | 'credit_card' | 'own_collateral' | 'reserve';
  openingBalanceCents: number;
  currentBalanceCents?: number;
  rescuableBalanceCents?: number;
  targetBalanceCents?: number;
  balanceAsOf?: string;
  active: boolean;
  notes?: string;
  importKey?: string;
  provenance?: RecordSource;
  createdAt: string;
  updatedAt: string;
};

export type Transaction = {
  id: Id;
  accountId?: Id;
  targetAccountId?: Id;
  actionId?: string;
  relatedDebtId?: Id;
  type: 'income' | 'expense' | 'transfer';
  amountCents: number;
  occurredOn: string;
  category?: string;
  description: string;
  contactId?: Id;
  projectId?: Id;
  status: 'planned' | 'cleared' | 'cancelled';
  certainty?: DataCertainty;
  importKey?: string;
  provenance?: RecordSource;
  createdAt: string;
  updatedAt: string;
};

export type Debt = {
  id: Id;
  creditorName: string;
  description?: string;
  originalAmountCents: number;
  currentBalanceCents: number;
  paidAmountCents?: number;
  monthlyCommitmentCents?: number;
  dueDate?: string;
  installments?: number;
  interestRate?: number;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'settled' | 'renegotiated' | 'cancelled';
  structural?: boolean;
  nextAction?: string;
  importKey?: string;
  provenance?: RecordSource;
  createdAt: string;
  updatedAt: string;
};

export type Receivable = {
  id: Id;
  contactId?: Id;
  projectId?: Id;
  title: string;
  amountCents?: number;
  agreedAmountCents?: number;
  receivedCents?: number;
  certainty: 'confirmed' | 'estimate' | 'forecast';
  status: 'pending' | 'received' | 'cancelled';
  expectedOn?: string;
  expectedWindow?: string;
  receivedTransactionId?: Id;
  notes?: string;
  nextAction?: string;
  importKey?: string;
  provenance?: RecordSource;
  createdAt: string;
  updatedAt: string;
};

export type FinancialObligation = {
  id: Id;
  title: string;
  amountCents: number;
  kind: 'subscription' | 'card_bill' | 'infrastructure' | 'debt_payment' | 'personal' | 'other';
  status: 'planned' | 'paid' | 'cancelled' | 'review';
  dueDate?: string;
  essentiality?: 'essential' | 'review' | 'optional';
  recurring?: boolean;
  notes?: string;
  importKey?: string;
  provenance?: RecordSource;
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
  importKey?: string;
  provenance?: RecordSource;
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
  notes?: string;
  importKey?: string;
  provenance?: RecordSource;
  createdAt: string;
  updatedAt: string;
};

export type ConversationAutomationMode = 'ai' | 'human' | 'suggest' | 'off';

export type Conversation = {
  id: Id;
  contactId?: Id;
  provider: 'manual' | 'meta';
  status: 'open' | 'waiting_me' | 'waiting_client' | 'resolved' | 'archived';
  automationMode: ConversationAutomationMode;
  humanTakeoverAt?: string;
  aiResumeAt?: string;
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
  origin?: 'customer' | 'ai' | 'human_app' | 'human_jornada' | 'system';
  createdAt: string;
};

export type InboxEntry = {
  id: Id;
  text: string;
  kind:
    | 'client'
    | 'finance'
    | 'study'
    | 'project'
    | 'task'
    | 'goal'
    | 'personal'
    | 'other';
  certainty: DataCertainty;
  status: 'new' | 'processed' | 'needs_review' | 'archived';
  occurredOn?: string;
  recordedAt: string;
  contactId?: Id;
  amountCents?: number;
  nextAction?: string;
  linkedCollection?: string;
  linkedRecordId?: Id;
  sourceText?: string;
  importKey?: string;
  provenance?: RecordSource;
  createdAt: string;
  updatedAt: string;
};

export type ClientExperience = {
  id: Id;
  contactId?: Id;
  projectId?: Id;
  clientLabel: string;
  workLabel?: string;
  occurredOn: string;
  agreement?: string;
  whatHappened: string;
  whatWorked?: string;
  whatFailed?: string;
  clientMetDeadline?: boolean;
  britoMetDeadline?: boolean;
  scopeChanged?: boolean;
  communication?: string;
  paymentExperience?: string;
  boundaries?: string;
  mistakeToAvoid?: string;
  patternToKeep?: string;
  nextAction?: string;
  learnedRule?: string;
  facts?: string[];
  interpretations?: string[];
  importKey?: string;
  provenance?: RecordSource;
  createdAt: string;
  updatedAt: string;
};

export type StudyArea = {
  id: Id;
  key: string;
  label: string;
  currentScore: number;
  targetScore: number;
  status: 'consolidated' | 'training' | 'current' | 'blocked' | 'future';
  order: number;
  notes?: string;
  importKey?: string;
  provenance?: RecordSource;
  createdAt: string;
  updatedAt: string;
};

export type StudyEvent = {
  id: Id;
  occurredOn: string;
  skill: string;
  exercise: string;
  take?: string;
  score: number;
  mainError?: string;
  correction?: string;
  redone?: boolean;
  scoreAfter?: number;
  observation?: string;
  level?: string;
  importKey?: string;
  provenance?: RecordSource;
  createdAt: string;
  updatedAt: string;
};

export type ProfessionalPattern = {
  id: Id;
  area: 'client' | 'capture' | 'editing' | 'commercial' | 'finance' | 'study';
  title: string;
  evidenceCount: number;
  summary: string;
  recommendation?: string;
  contactId?: Id;
  lastObservedAt?: string;
  status: 'active' | 'dismissed';
  createdAt: string;
  updatedAt: string;
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

export type UndoChange = {
  kind: 'delete' | 'restore';
  collection: string;
  entityId: Id;
  before?: Record<string, unknown>;
};

export type AiUndoEvent = {
  id: Id;
  expiresAt: string;
  changes: UndoChange[];
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

export type WorkspaceSettings = {
  whatsappAutomation: {
    enabled: boolean;
    defaultMode: ConversationAutomationMode;
    humanTakeoverStopsAi: boolean;
    allowAutoGreeting: boolean;
    allowBriefingQuestions: boolean;
    allowKnownStatusReplies: boolean;
    requireHumanForPricing: boolean;
    requireHumanForComplaints: boolean;
    requireHumanForContracts: boolean;
  };
  ai: {
    autoSaveLowRiskExplicitCommands: boolean;
    undoWindowMinutes: number;
  };
};

export type WorkspaceState = {
  version: number;
  profile: {
    displayName: string;
    locale: string;
    timezone: string;
    workspaceName: string;
    instagramUrl?: string;
  };
  settings: WorkspaceSettings;
  contacts: Contact[];
  opportunities: Opportunity[];
  projects: Project[];
  serviceCatalog: ServiceOffering[];
  portfolioItems: PortfolioItem[];
  clientRequests: ClientRequest[];
  videoBriefs: VideoBrief[];
  financialAccounts: FinancialAccount[];
  transactions: Transaction[];
  debts: Debt[];
  receivables: Receivable[];
  obligations: FinancialObligation[];
  goals: Goal[];
  tasks: Task[];
  conversations: Conversation[];
  messages: Message[];
  inbox: InboxEntry[];
  clientExperiences: ClientExperience[];
  studyAreas: StudyArea[];
  studyEvents: StudyEvent[];
  professionalPatterns: ProfessionalPattern[];
  files: FileRecord[];
  audit: AuditEntry[];
  aiUndoEvents: AiUndoEvent[];
  importBatches: string[];
  createdAt: string;
  updatedAt: string;
};
