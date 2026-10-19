import { cookies } from 'next/headers';
import { verifySession } from './crypto';
import { authSessionVersion, getAuthRecord } from './store';

export const SESSION_COOKIE = 'jornada_session';

export async function authenticatedSessionVersion() {
  const store = await cookies();
  const auth = await getAuthRecord();
  if (!auth?.activated) return null;
  const sessionVersion = authSessionVersion(auth);
  return verifySession(store.get(SESSION_COOKIE)?.value, sessionVersion)
    ? sessionVersion
    : null;
}

export async function isAuthenticated() {
  return (await authenticatedSessionVersion()) !== null;
}

export async function requireAuthenticated() {
  const sessionVersion = await authenticatedSessionVersion();
  if (sessionVersion === null) throw new Error('UNAUTHORIZED');
  return sessionVersion;
}
