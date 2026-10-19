import { NextResponse } from 'next/server';
import { requireAuthenticated, SESSION_COOKIE } from '@/lib/auth';
import { hashPassword, signSession } from '@/lib/crypto';
import { rotateAuthPassword } from '@/lib/store';
import {readLimitedJson} from '@/lib/devops-json';

export const runtime = 'nodejs';

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function clearSession(response: NextResponse) {
  response.headers.append('set-cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  return response;
}

function setSession(response: NextResponse, token: string) {
  response.headers.append('set-cookie', `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${60 * 60 * 24 * 30}; HttpOnly; Secure; SameSite=Lax`);
  return response;
}

export async function POST(request: Request) {
  try {
    const sessionVersion = await requireAuthenticated();
    if (!sameOrigin(request)) {
      return NextResponse.json({ error: 'Origem não autorizada.' }, { status: 403 });
    }
    if(process.env.VERCEL_ENV==='preview'){
      return NextResponse.json({error:'Alteração de senha indisponível em Preview.'},{status:503});
    }
    if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json'){
      return NextResponse.json({error:'Formato inválido.'},{status:415});
    }
    const body = await readLimitedJson(request.body,4096) as {password?:unknown}|null;
    const password = body?.password;
    if (typeof password !== 'string' || password.length < 8 || password.length > 1024) {
      return NextResponse.json({ error: 'Informe uma senha entre 8 e 1024 caracteres.' }, { status: 400 });
    }
    const { salt, hash } = hashPassword(password);
    const auth = await rotateAuthPassword({
      expectedSessionVersion: sessionVersion,
      passwordSalt: salt,
      passwordHash: hash,
    });
    return setSession(NextResponse.json({ ok: true }), signSession(auth.sessionVersion));
  } catch (error) {
    if (error instanceof Error && (error.message === 'UNAUTHORIZED' || error.message === 'AUTH_SESSION_REVOKED')) {
      return clearSession(NextResponse.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 }));
    }
    if (error instanceof Error && error.message==='DEVOPS_PAYLOAD_TOO_LARGE') {
      return NextResponse.json({error:'Requisição grande demais.'},{status:413});
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Solicitação inválida.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Não foi possível atualizar a senha.' }, { status: 500 });
  }
}
