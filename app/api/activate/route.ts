import { NextResponse } from 'next/server';
import { getAuthRecord, saveAuthRecord, getState } from '@/lib/store';
import { hashPassword, signSession } from '@/lib/crypto';
import { SESSION_COOKIE } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const existing = await getAuthRecord();
  if (existing?.activated) return NextResponse.json({ error: 'A Jornada já foi ativada.' }, { status: 409 });
  const { bootstrapToken, email, password } = await req.json();
  if (!process.env.JORNADA_BOOTSTRAP_TOKEN || bootstrapToken !== process.env.JORNADA_BOOTSTRAP_TOKEN) return NextResponse.json({ error: 'Código de ativação inválido.' }, { status: 401 });
  if (!email || !password || String(password).length < 8) return NextResponse.json({ error: 'Informe e-mail e uma senha com pelo menos 8 caracteres.' }, { status: 400 });
  const { salt, hash } = hashPassword(password);
  await saveAuthRecord({ activated: true, email: String(email).trim().toLowerCase(), passwordSalt: salt, passwordHash: hash, activatedAt: new Date().toISOString() });
  await getState();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, signSession(), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60*60*24*30 });
  return res;
}
