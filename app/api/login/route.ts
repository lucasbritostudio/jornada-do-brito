import { NextResponse } from 'next/server';
import { getAuthRecord } from '@/lib/store';
import { verifyPassword, signSession } from '@/lib/crypto';
import { SESSION_COOKIE } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { email, password } = await req.json();
  const auth = await getAuthRecord();
  if (!auth?.activated) return NextResponse.json({ error: 'A Jornada ainda não foi ativada.', needsActivation: true }, { status: 409 });
  const okEmail = auth.email === String(email || '').trim().toLowerCase();
  const okPassword = password && verifyPassword(String(password), auth.passwordSalt, auth.passwordHash);
  if (!okEmail || !okPassword) return NextResponse.json({ error: 'E-mail ou senha inválidos.' }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, signSession(), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60*60*24*30 });
  return res;
}
