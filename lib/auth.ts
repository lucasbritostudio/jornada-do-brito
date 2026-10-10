import { cookies } from 'next/headers';
import { verifySession } from './crypto';

export const SESSION_COOKIE = 'jornada_session';

export async function isAuthenticated() {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export async function requireAuthenticated() {
  if (!(await isAuthenticated())) throw new Error('UNAUTHORIZED');
}
