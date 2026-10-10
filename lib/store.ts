import { get, put, list } from '@vercel/blob';
import type { WorkspaceState, AuditEntry } from './types';

const STATE_PATH = 'jornada/state.json';
const AUTH_PATH = 'jornada/auth.json';

export type AuthRecord = {
  activated: boolean;
  email: string;
  passwordSalt: string;
  passwordHash: string;
  activatedAt: string;
};

function now() { return new Date().toISOString(); }

export function defaultState(): WorkspaceState {
  const at = now();
  return {
    version: 1,
    profile: {
      displayName: 'Brito',
      locale: process.env.JORNADA_LOCALE || 'pt-BR',
      timezone: process.env.JORNADA_TIMEZONE || 'America/Fortaleza',
      workspaceName: 'Jornada do Brito'
    },
    contacts: [], opportunities: [], projects: [], financialAccounts: [], transactions: [], debts: [], goals: [], tasks: [], conversations: [], messages: [], files: [], audit: [],
    createdAt: at,
    updatedAt: at
  };
}

async function readJson<T>(pathname: string): Promise<T | null> {
  try {
    const result = await get(pathname, { access: 'private' });
    if (!result || result.statusCode !== 200) return null;
    return await new Response(result.stream).json() as T;
  } catch {
    return null;
  }
}

async function writeJson(pathname: string, value: unknown) {
  await put(pathname, JSON.stringify(value, null, 2), {
    access: 'private',
    allowOverwrite: true,
    contentType: 'application/json',
    addRandomSuffix: false
  });
}

export async function getAuthRecord() { return readJson<AuthRecord>(AUTH_PATH); }
export async function saveAuthRecord(record: AuthRecord) { await writeJson(AUTH_PATH, record); }

export async function getState(): Promise<WorkspaceState> {
  const state = await readJson<WorkspaceState>(STATE_PATH);
  if (state) return state;
  const initial = defaultState();
  await writeJson(STATE_PATH, initial);
  return initial;
}

export async function saveState(state: WorkspaceState) {
  state.updatedAt = now();
  await writeJson(STATE_PATH, state);
  return state;
}

export function audit(state: WorkspaceState, entry: Omit<AuditEntry, 'id' | 'at'>) {
  state.audit.unshift({ id: crypto.randomUUID(), at: now(), ...entry });
  state.audit = state.audit.slice(0, 500);
}

export async function blobHealth() {
  const r = await list({ prefix: 'jornada/', limit: 1 });
  return { ok: true, count: r.blobs.length };
}
