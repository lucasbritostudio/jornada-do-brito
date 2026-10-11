import {NextResponse} from 'next/server';
import {requireAuthenticated} from '@/lib/auth';
import {readProduction} from '@/lib/production-store';
import {onboardKnownWork} from '@/lib/production-onboarding';
import {interpretProductionMessage,applyProductionAssistantAction} from '@/lib/production-assistant';
import {isBlobConflict} from '@/lib/blob-conflict';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 try{
  await requireAuthenticated();
  let body:Record<string,unknown>;
  try{const json=await req.json();body=json&&typeof json==='object'&&!Array.isArray(json)?json:{};}
  catch{return NextResponse.json({error:'Mensagem inválida.'},{status:400});}
  const message=typeof body.message==='string'?body.message.trim().slice(0,750):'';
  const operationId=typeof body.operationId==='string'?body.operationId:'';
  if(!message)return NextResponse.json({error:'Diga o que aconteceu com o vídeo.'},{status:400});
  if(!/^[a-zA-Z0-9_-]{12,100}$/.test(operationId))
   return NextResponse.json({error:'Atualize a tela e tente de novo.'},{status:400});
  await onboardKnownWork(); // Sem cliques manuais; operação repetida não cria registros.
  const data=await readProduction();
  const interpretation=await interpretProductionMessage(message,data);
  if(!interpretation.action){
   return NextResponse.json({ok:true,changed:false,
     message:interpretation.text||'Não consegui identificar o trabalho com segurança. Diga o cliente e o que ocorreu.'});
  }
  const result=await applyProductionAssistantAction(
   {name:interpretation.action.name,args:interpretation.action.args},
   message,operationId);
  return NextResponse.json({ok:true,...result,provider:interpretation.provider},
   {headers:{'Cache-Control':'no-store'}});
 }catch(e){
  if(e instanceof Error&&e.message==='UNAUTHORIZED')
   return NextResponse.json({error:'Não autorizado.'},{status:401});
  if(isBlobConflict(e))
   return NextResponse.json({error:'Outra atualização foi salva. Atualize e tente novamente.'},{status:409});
  const message=e instanceof Error?e.message:'Não foi possível atualizar este vídeo.';
  // Never echo internal stack, keys or provider failures to the browser.
  const safe=/^(Informe|Não encontrei|Encontrei|Não posso|Qual foi|Você terminou|Esse |Sem confirmação|Só registro|Ainda falta|Etapa|Valor|Identificador|Comando)/.test(message)
    ?message:'Não consegui concluir esse registro. Nada será presumido como entregue ou pago.';
  return NextResponse.json({error:safe},{status:400});
 }
}
