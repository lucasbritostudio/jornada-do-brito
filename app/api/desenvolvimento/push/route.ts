import {NextResponse} from 'next/server';
import {requireAuthenticated} from '@/lib/auth';
import {publicVapidKey,subscribeOwnerPush,unsubscribeOwnerPush} from '@/lib/devops-push';
import {readLimitedJson} from '@/lib/devops-json';

export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function GET(){
 try{
  await requireAuthenticated();
  return NextResponse.json({publicKey:publicVapidKey()},{headers});
 }catch{return NextResponse.json({error:'Não autorizado.'},{status:401,headers});}
}
export async function POST(req:Request){
 try{
  await requireAuthenticated();
  if(req.headers.get('origin')!==new URL(req.url).origin)return NextResponse.json({error:'Origem inválida.'},{status:403,headers});
  if(process.env.VERCEL_ENV==='preview')return NextResponse.json({error:'Indisponível em Preview.'},{status:503,headers});
  if(req.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
   return NextResponse.json({error:'Formato inválido.'},{status:415,headers});
  const data=await readLimitedJson(req.body,4096) as Record<string,unknown>;
  if(data?.action==='subscribe')return NextResponse.json(await subscribeOwnerPush(data.subscription),{headers});
  if(data?.action==='unsubscribe')return NextResponse.json(await unsubscribeOwnerPush(data.subscription),{headers});
  return NextResponse.json({error:'Ação inválida.'},{status:400,headers});
 }catch(e){
  if(e instanceof Error&&e.message==='UNAUTHORIZED')
   return NextResponse.json({error:'Não autorizado.'},{status:401,headers});
  const name=e instanceof Error?e.message:'';
  return NextResponse.json({error:'Falha ao configurar notificações.'},
   {status:name==='PUSH_INVALID'?400:name==='PUSH_LIMIT_REACHED'?429:503,headers});
 }
}
