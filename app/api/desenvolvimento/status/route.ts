import {NextResponse} from 'next/server';
import {requireAuthenticated} from '@/lib/auth';
import {getDevopsSnapshot} from '@/lib/devops-read';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function GET(){
 try{
  await requireAuthenticated();
  return NextResponse.json(await getDevopsSnapshot(),{headers});
 }catch(e){
  if(e instanceof Error&&e.message==='UNAUTHORIZED')
   return NextResponse.json({error:'Não autorizado.'},{status:401,headers});
  return NextResponse.json({error:'Diagnóstico indisponível.'},{status:503,headers});
 }
}
