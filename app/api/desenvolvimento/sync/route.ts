import {NextResponse} from 'next/server';
import {requireAuthenticated} from '@/lib/auth';
import {syncChefeBotMonitor} from '@/lib/devops-monitor-sync';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function POST(req:Request){
 try{
  await requireAuthenticated();
  if(new URL(req.url).origin!==req.headers.get('origin'))return NextResponse.json({error:'Origem não permitida.'},{status:403,headers});
  if(process.env.VERCEL_ENV==='preview')return NextResponse.json({error:'Coleta externa desativada em Preview.'},{status:503,headers});
  return NextResponse.json(await syncChefeBotMonitor(),{headers});
 }catch(e){
  if(e instanceof Error&&e.message==='UNAUTHORIZED')return NextResponse.json({error:'Não autorizado.'},{status:401,headers});
  return NextResponse.json({error:'Coleta indisponível; nenhum sucesso foi confirmado.'},{status:503,headers});
 }
}
