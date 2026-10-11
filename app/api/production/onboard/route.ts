import {NextResponse} from 'next/server';
import {requireAuthenticated} from '@/lib/auth';
import {onboardKnownWork} from '@/lib/production-onboarding';
import {isBlobConflict} from '@/lib/blob-conflict';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(){
 try{
  await requireAuthenticated();
  const result=await onboardKnownWork();
  return NextResponse.json({ok:true,...result},{
   headers:{'Cache-Control':'no-store'}
  });
 }catch(error){
  if(error instanceof Error&&error.message==='UNAUTHORIZED')
   return NextResponse.json({error:'Não autorizado.'},{status:401});
  if(isBlobConflict(error))
   return NextResponse.json({error:'Outra alteração ocorreu; a próxima consulta pode continuar sem duplicar.'},{status:409});
  return NextResponse.json({error:'Não foi possível preparar os dados. O cadastro não será considerado concluído.'},{status:500});
 }
}
