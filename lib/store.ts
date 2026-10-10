import { get, put, list } from '@vercel/blob';
import type { WorkspaceState, AuditEntry } from './types';
import { refreshProfessionalPatterns } from './patterns';

const STATE_PATH = 'jornada/state.json';
const AUTH_PATH = 'jornada/auth.json';
const CURRENT_VERSION = 2;

export type AuthRecord = {
  activated: boolean;
  email: string;
  passwordSalt: string;
  passwordHash: string;
  activatedAt: string;
};

function now() {
  return new Date().toISOString();
}

export function defaultState(): WorkspaceState {
  const at = now();
  return {
    version: CURRENT_VERSION,
    profile: {
      displayName: 'Brito',
      locale: process.env.JORNADA_LOCALE || 'pt-BR',
      timezone: process.env.JORNADA_TIMEZONE || 'America/Fortaleza',
      workspaceName: 'Jornada do Brito',
    },
    settings: {
      whatsappAutomation: {
        enabled: false,
        defaultMode: 'ai',
        humanTakeoverStopsAi: true,
        allowAutoGreeting: true,
        allowBriefingQuestions: true,
        allowKnownStatusReplies: true,
        requireHumanForPricing: true,
        requireHumanForComplaints: true,
        requireHumanForContracts: true,
      },
      ai: {
        autoSaveLowRiskExplicitCommands: true,
        undoWindowMinutes: 10,
      },
    },
    contacts: [],
    opportunities: [],
    projects: [],
    videoBriefs: [],
    financialAccounts: [],
    transactions: [],
    debts: [],
    receivables: [],
    obligations: [],
    goals: [],
    tasks: [],
    conversations: [],
    messages: [],
    inbox: [],
    clientExperiences: [],
    studyAreas: [],
    studyEvents: [],
    professionalPatterns: [],
    files: [],
    audit: [],
    aiUndoEvents: [],
    importBatches: [],
    createdAt: at,
    updatedAt: at,
  };
}

function arr(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export function upgradeState(raw: unknown): WorkspaceState {
  const base = defaultState();
  const state = (raw && typeof raw === 'object' ? raw : {}) as Partial<WorkspaceState>;

  return {
    ...base,
    ...state,
    version: CURRENT_VERSION,
    profile: {
      ...base.profile,
      ...(state.profile || {}),
    },
    settings: {
      whatsappAutomation: {
        ...base.settings.whatsappAutomation,
        ...(state.settings?.whatsappAutomation || {}),
      },
      ai: {
        ...base.settings.ai,
        ...(state.settings?.ai || {}),
      },
    },
    contacts: arr(state.contacts) as WorkspaceState['contacts'],
    opportunities: arr(state.opportunities) as WorkspaceState['opportunities'],
    projects: arr(state.projects) as WorkspaceState['projects'],
    videoBriefs: arr(state.videoBriefs) as WorkspaceState['videoBriefs'],
    financialAccounts: arr(state.financialAccounts) as WorkspaceState['financialAccounts'],
    transactions: arr(state.transactions) as WorkspaceState['transactions'],
    debts: arr(state.debts) as WorkspaceState['debts'],
    receivables: arr(state.receivables) as WorkspaceState['receivables'],
    obligations: arr(state.obligations) as WorkspaceState['obligations'],
    goals: arr(state.goals) as WorkspaceState['goals'],
    tasks: arr(state.tasks) as WorkspaceState['tasks'],
    conversations: (arr(state.conversations) as any[]).map((conversation) => ({
      ...conversation,
      automationMode:
        conversation.automationMode ||
        base.settings.whatsappAutomation.defaultMode,
    })) as WorkspaceState['conversations'],
    messages: arr(state.messages) as WorkspaceState['messages'],
    inbox: arr(state.inbox) as WorkspaceState['inbox'],
    clientExperiences: arr(state.clientExperiences) as WorkspaceState['clientExperiences'],
    studyAreas: arr(state.studyAreas) as WorkspaceState['studyAreas'],
    studyEvents: arr(state.studyEvents) as WorkspaceState['studyEvents'],
    professionalPatterns: arr(state.professionalPatterns) as WorkspaceState['professionalPatterns'],
    files: arr(state.files) as WorkspaceState['files'],
    audit: arr(state.audit) as WorkspaceState['audit'],
    aiUndoEvents: arr(state.aiUndoEvents) as WorkspaceState['aiUndoEvents'],
    importBatches: arr(state.importBatches) as string[],
    createdAt: state.createdAt || base.createdAt,
    updatedAt: state.updatedAt || base.updatedAt,
  };
}

async function readJson<T>(pathname: string): Promise<T | null> {
  try {
    const result = await get(pathname, { access: 'private' });
    if (!result || result.statusCode !== 200) return null;
    return (await new Response(result.stream).json()) as T;
  } catch {
    return null;
  }
}

async function writeJson(pathname: string, value: unknown) {
  await put(pathname, JSON.stringify(value, null, 2), {
    access: 'private',
    allowOverwrite: true,
    contentType: 'application/json',
    addRandomSuffix: false,
  });
}

export async function getAuthRecord() {
  return readJson<AuthRecord>(AUTH_PATH);
}

export async function saveAuthRecord(record: AuthRecord) {
  await writeJson(AUTH_PATH, record);
}

export async function getState(): Promise<WorkspaceState> {
  const saved = await readJson<WorkspaceState>(STATE_PATH);
  if (saved) {
    const upgraded = upgradeState(saved);
    if (saved.version !== CURRENT_VERSION) {
      await writeJson(STATE_PATH, upgraded);
    }
    return upgraded;
  }

  const initial = defaultState();
  await writeJson(STATE_PATH, initial);
  return initial;
}

export async function saveState(input: WorkspaceState) {
  const state = upgradeState(input);
  refreshProfessionalPatterns(state);
  const currentTime = Date.now();
  state.aiUndoEvents = state.aiUndoEvents
    .filter((item) => new Date(item.expiresAt).getTime() > currentTime)
    .slice(0, 60);
  state.updatedAt = now();
  await writeJson(STATE_PATH, state);
  return state;
}

export function audit(
  state: WorkspaceState,
  entry: Omit<AuditEntry, 'id' | 'at'>,
) {
  state.audit.unshift({
    id: crypto.randomUUID(),
    at: now(),
    ...entry,
  });
  state.audit = state.audit.slice(0, 1000);
}

export async function blobHealth() {
  const result = await list({ prefix: 'jornada/', limit: 1 });
  return { ok: true, count: result.blobs.length };
}
