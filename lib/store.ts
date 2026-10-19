import { get, put, list } from '@vercel/blob';
import type { WorkspaceState, AuditEntry } from './types';
import { refreshProfessionalPatterns } from './patterns';
import { isBlobConflict } from './blob-conflict';

const STATE_PATH = 'jornada/state.json';
const AUTH_PATH = 'jornada/auth.json';
const CURRENT_VERSION = 2;

export type AuthRecord = {
  activated: boolean;
  email: string;
  passwordSalt: string;
  passwordHash: string;
  activatedAt: string;
  /** Missing only on records created before session revocation was added. */
  sessionVersion?: number;
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

const stateVersions = new WeakMap<WorkspaceState, string | null>();

async function readVersionedJson<T>(pathname: string): Promise<{ value: T; etag: string } | null> {
  // Bypass private Blob CDN cache before conditional writes.
  const result = await get(pathname, { access: 'private', useCache: false });
  if (!result) return null;
  const value = (await new Response(result.stream).json()) as T;
  if (!result.blob?.etag) throw new Error('BLOB_ETAG_MISSING');
  return { value, etag: result.blob.etag };
}

async function readJson<T>(pathname: string): Promise<T | null> {
  try {
    const result = await readVersionedJson<T>(pathname);
    return result?.value ?? null;
  } catch (error) {
    // Apenas um Blob ausente significa estado ainda não criado. Falhas de
    // rede, autenticação ou JSON corrompido devem interromper a operação;
    // tratá-las como estado vazio poderia sobrescrever dados existentes.
    throw error;
  }
}

export async function getAuthRecord() {
  return readJson<AuthRecord>(AUTH_PATH);
}

export async function saveAuthRecord(record: AuthRecord) {
  // Activation must not overwrite an existing activated identity.
  const current = await readVersionedJson<AuthRecord>(AUTH_PATH);
  if (current?.value.activated) throw new Error('AUTH_ALREADY_ACTIVATED');
  await put(AUTH_PATH, JSON.stringify(record, null, 2), {
    access: 'private',
    allowOverwrite: Boolean(current),
    ...(current ? { ifMatch: current.etag } : {}),
    addRandomSuffix: false,
    contentType: 'application/json',
  });
}

export function authSessionVersion(record: AuthRecord) {
  const value = record.sessionVersion;
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

/**
 * Replaces the owner's password with an ETag-guarded write and advances the
 * session version. The version check prevents two already-authenticated
 * requests from silently replacing one another's password.
 */
export async function rotateAuthPassword(input: {
  expectedSessionVersion: number;
  passwordSalt: string;
  passwordHash: string;
}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await readVersionedJson<AuthRecord>(AUTH_PATH);
    if (!current?.value.activated) throw new Error('AUTH_NOT_ACTIVATED');
    const currentVersion = authSessionVersion(current.value);
    if (currentVersion !== input.expectedSessionVersion) {
      throw new Error('AUTH_SESSION_REVOKED');
    }
    const updated: AuthRecord = {
      ...current.value,
      passwordSalt: input.passwordSalt,
      passwordHash: input.passwordHash,
      sessionVersion: currentVersion + 1,
    };
    try {
      await put(AUTH_PATH, JSON.stringify(updated, null, 2), {
        access: 'private',
        allowOverwrite: true,
        ifMatch: current.etag,
        addRandomSuffix: false,
        contentType: 'application/json',
      });
      return updated;
    } catch (error) {
      if (!isBlobConflict(error) || attempt === 2) throw error;
    }
  }
  throw new Error('AUTH_PASSWORD_ROTATION_FAILED');
}

export async function getState(): Promise<WorkspaceState> {
  const saved = await readVersionedJson<WorkspaceState>(STATE_PATH);
  if (saved) {
    const upgraded = upgradeState(saved.value);
    // Defer migration until a version-checked write; GET is read-only.
    stateVersions.set(upgraded, saved.etag);
    return upgraded;
  }
  const initial = defaultState();
  // Preserve the original lazy initialization behavior. Create-once avoids
  // silently replacing a concurrent initializer.
  try {
    const created = await put(STATE_PATH, JSON.stringify(initial, null, 2), {
      access: 'private',
      allowOverwrite: false,
      contentType: 'application/json',
      addRandomSuffix: false,
    });
    stateVersions.set(initial, created.etag);
    return initial;
  } catch (error) {
    // Another request might have created the state while we were reading.
    // Only recover by observing an actual existing state; never swallow a
    // network, permission or malformed-JSON failure.
    const existing = await readVersionedJson<WorkspaceState>(STATE_PATH);
    if (!existing) throw error;
    const upgraded = upgradeState(existing.value);
    stateVersions.set(upgraded, existing.etag);
    return upgraded;
  }
}

export async function saveState(input: WorkspaceState) {
  // Reject stale snapshots across all serverless instances.
  if (!stateVersions.has(input)) throw new Error('STATE_VERSION_REQUIRED');
  const etag = stateVersions.get(input);
  const state = upgradeState(input);
  refreshProfessionalPatterns(state);
  const currentTime = Date.now();
  state.aiUndoEvents = state.aiUndoEvents
    .filter((item) => new Date(item.expiresAt).getTime() > currentTime)
    .slice(0, 60);
  state.updatedAt = now();
  await put(STATE_PATH, JSON.stringify(state, null, 2), {
    access: 'private',
    allowOverwrite: Boolean(etag),
    ...(etag ? { ifMatch: etag } : {}),
    contentType: 'application/json',
    addRandomSuffix: false,
  });
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
