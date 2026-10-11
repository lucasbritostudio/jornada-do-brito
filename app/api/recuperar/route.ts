import {createHash,timingSafeEqual} from 'node:crypto';
import {get,put} from '@vercel/blob';
import {NextResponse} from 'next/server';
import {hashPassword,signSession} from '@/lib/crypto';
import {SESSION_COOKIE} from '@/lib/auth';
import type {AuthRecord} from '@/lib/store';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const AUTH_PATH='jornada/auth.json';
type RecoveryAuthRecord=AuthRecord&{recoveryUsedDigest?:string;passwordChangedAt?:string};
function noStore(json:object,status:number){
  return NextResponse.json(json,{status,headers:{'Cache-Control':'no-store'}});
}
/** One-time owner recovery:
 * - Only a high-entropy code delivered to the already connected owner mailbox
 * - Only SHA256 of that code is stored in an encrypted Vercel environment setting
 * - Atomic CAS update touches auth.json only; all client, video and financial data stay intact
 * - Marks this code consumed to reject replays even if env var isn't cleared immediately.
 */
export async function POST(req:Request){
  const expected=process.env.JORNADA_RECOVERY_CODE_SHA256?.trim().toLowerCase();
  const ownerEmail=process.env.JORNADA_RECOVERY_EMAIL?.trim().toLowerCase();
  const expires=Date.parse(process.env.JORNADA_RECOVERY_EXPIRES_AT||'');
  if(!expected||!/^[0-9a-f]{64}$/.test(expected)||!ownerEmail||
     !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)||
     !Number.isFinite(expires)||Date.now()>=expires){
    return noStore({error:'A recuperação não está disponível. Solicite um novo código.'},503);
  }
  let data:unknown;
  try{data=await req.json();}catch{return noStore({error:'Preencha o código e a nova senha.'},400);}
  const input=data&&typeof data==='object'&&!Array.isArray(data)
    ?data as Record<string,unknown>:{};
  const code=typeof input.code==='string'?input.code.trim().toUpperCase():'';
  const password=typeof input.password==='string'?input.password:'';
  // 20 random hex digits (80 bits), 4-4-4-4-4; no ability to guess online.
  if(!/^[A-F0-9]{4}(?:-[A-F0-9]{4}){4}$/.test(code))
    return noStore({error:'Código de recuperação inválido.'},401);
  if(password.length<12||password.length>128)
    return noStore({error:'Crie uma nova senha com pelo menos 12 caracteres.'},400);
  const actual=createHash('sha256').update(code).digest();
  if(!timingSafeEqual(actual,Buffer.from(expected,'hex')))
    return noStore({error:'Código de recuperação inválido.'},401);
  try{
    const current=await get(AUTH_PATH,{access:'private',useCache:false});
    if(!current||!current.blob?.etag)
      return noStore({error:'Não foi possível recuperar este cadastro.'},409);
    const record=await new Response(current.stream).json() as RecoveryAuthRecord;
    if(!record.activated||!record.passwordHash||!record.passwordSalt)
      return noStore({error:'Cadastro ainda não ativado. Use Primeiro acesso.'},409);
    if(record.recoveryUsedDigest===expected)
      return noStore({error:'Esse código já foi utilizado. Solicite outro.'},409);
    const {salt,hash}=hashPassword(password);
    const next:RecoveryAuthRecord={...record,email:ownerEmail,
      passwordSalt:salt,passwordHash:hash,passwordChangedAt:new Date().toISOString(),
      recoveryUsedDigest:expected};
    // No state.json or other Blob touched. Reject stale concurrent writes.
    await put(AUTH_PATH,JSON.stringify(next),{
      access:'private',allowOverwrite:true,ifMatch:current.blob.etag,
      addRandomSuffix:false,contentType:'application/json'
    });
    const response=noStore({ok:true,email:ownerEmail},200);
    response.cookies.set(SESSION_COOKIE,signSession(),{
      httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:60*60*24*30
    });
    return response;
  }catch{
    return noStore({error:'Não foi possível concluir a recuperação. Tente novamente.'},500);
  }
}
