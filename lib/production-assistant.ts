import {randomUUID} from 'node:crypto';
import type {Work,Stage,ProductionData} from './production';
import {transitionAllowed,safeText,paymentSummary} from './production';
import {changeProduction} from './production-store';
import {safeSystemPolicy,sanitizeForLlm} from './ai-policy';
import {generateWithJornadaTools,LlmProviderError} from './llm';

const STAGE_TOOL={
 type:'function',function:{
  name:'production_change_stage',
  description:'Quando o filmmaker disser explicitamente que TERMINOU a gravação, começou a editar, enviou o vídeo para avaliação, recebeu pedido de ajustes, teve aprovação ou concluiu entrega. Não usar com planos, previsões, perguntas. Não inventar horários: capturas passadas sem hora devem pedir horário.',
  parameters:{type:'object',additionalProperties:false,properties:{
   client_name:{type:'string',description:'Nome real e existente do cliente, conforme contexto.'},
   video_title:{type:'string',description:'Título se houver vários vídeos do mesmo cliente.'},
   stage:{type:'string',enum:['captured','editing','review','changes_requested','approved','delivered']}
  },required:['client_name','stage']}
 }};
const PAYMENT_TOOL={
 type:'function',function:{
  name:'production_confirm_payment',
  description:'Somente quando o filmmaker afirmar que RECEBEU efetivamente dinheiro deste vídeo. Não usar para pagamento previsto, pedido de cobrança ou proposta.',
  parameters:{type:'object',additionalProperties:false,properties:{
   client_name:{type:'string'},
   video_title:{type:'string'},
   amount_cents:{type:'integer',description:'Valor efetivamente recebido em centavos. Nunca inventar.'}
  },required:['client_name','amount_cents']}
 }};
const CREATE_TOOL={
 type:'function',function:{
  name:'production_create_video',
  description:'Cadastrar novo trabalho em produção SOMENTE se filmmaker afirmar claramente que contratou ou fechou trabalho. Não abrir produção para leads, portfólio ou propostas aguardando resposta.',
  parameters:{type:'object',additionalProperties:false,properties:{
   client_name:{type:'string'},
   video_title:{type:'string'},
   agreed_fee_cents:{type:'integer',description:'Só se preço por este vídeo foi confirmado.'}
  },required:['client_name','video_title']}
 }};
export const PRODUCTION_TOOLS=[STAGE_TOOL,PAYMENT_TOOL,CREATE_TOOL] as const;
const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

export function locateWork(data:ProductionData,clientName:string,videoTitle?:string):Work{
 const client=fold(clientName);
 if(client.length<3)throw new Error('Informe o nome do cliente.');
 let matches=data.works.filter(w=>{
  const name=fold(w.clientName);
  return name===client||name.includes(client)||client.includes(name);
 });
 if(videoTitle){
  const title=fold(videoTitle);
  matches=matches.filter(w=>fold(w.title).includes(title)||title.includes(fold(w.title)));
 }
 if(matches.length===0)throw new Error('Não encontrei esse vídeo cadastrado. Diga o nome do cliente e qual vídeo foi contratado.');
 if(matches.length!==1)throw new Error('Encontrei mais de um vídeo desse cliente. Diga qual vídeo você quer atualizar.');
 return matches[0];
}
const askPastCaptureTime=(message:string,stage:Stage)=>stage==='captured'&&
 /\b(ontem|anteontem|semana passada|dias atras|dia \d{1,2}|de manha|de tarde|a noite)\b/i.test(fold(message));
const groundedNowCapture=(message:string)=>/\b(acabei de|agora|terminei agora|neste instante|nesse instante)\b/i.test(fold(message));
const STAGE_EVIDENCE:Partial<Record<Stage,RegExp>>={
 captured:/\b(gravei|gravar|gravacao|captei|captacao|filmei|filmagem)\b/,
 editing:/\b(editando|editar|edicao|montando)\b/,
 review:/\b(enviei|mandei|entreguei)\b[\s\S]{0,70}\b(avaliacao|aprovacao|cliente)\b/,
 changes_requested:/\b(ajustes|corrigir|correcao|mudancas)\b/,
 approved:/\b(aprovou|aprovado|aprovada)\b/,
 delivered:/\b(entreguei|entregue|entrega final)\b/
};
export function stageAllowedFromStatement(stage:Stage,message:string){
 if(!STAGE_EVIDENCE[stage]?.test(fold(message)))
  throw new Error('Não ficou claro qual etapa realmente aconteceu. Diga a ação em palavras simples.');
 if(stage==='captured' && askPastCaptureTime(message,stage) && !groundedNowCapture(message))
  throw new Error('Qual foi o dia e horário exatos em que terminou a gravação? Assim o prazo de 72h fica correto.');
 // Don't back-date an action based solely on the language model.
 if(stage==='captured'&&!groundedNowCapture(message))
  throw new Error('Você terminou de gravar agora? Informe isso ou diga a data e hora exatas para eu calcular o prazo.');
 if((stage==='review'||stage==='delivered')&& /\b(ontem|anteontem|semana passada)\b/i.test(fold(message)))
  throw new Error('Informe a data e hora desse envio para preservar o prazo original.');
}
export function applyProductionStage(data:ProductionData,clientName:string,stage:Stage,message:string,videoTitle?:string,now=new Date()){
 const work=locateWork(data,clientName,videoTitle);
 if(work.stage===stage)return {changed:false,message:'Esse vídeo já estava marcado como '+stage+'.',workId:work.id};
 if(!transitionAllowed(work.stage,stage))
  throw new Error('Não posso pular etapas ou inventar aprovação. A etapa atual é '+work.stage+'. Diga o que já aconteceu.');
 stageAllowedFromStatement(stage,message);
 const time=now.toISOString();
 if(stage==='captured')work.capturedAt=time;
 if(['editing','review','approved','delivered','changes_requested'].includes(stage)&&!work.capturedAt)
  throw new Error('Ainda falta registrar quando você concluiu a gravação.');
 if(stage==='review'){work.reviewSentAt=time;work.firstReviewSentAt ||=time;}
 if(stage==='approved')work.approvedAt=time;
 if(stage==='delivered')work.deliveredAt=time;
 work.stage=stage;work.updatedAt=time;work.history.push({stage,at:time});
 const description:Record<Stage,string>={
  captured:'Captação finalizada e prazo iniciado à meia-noite do dia seguinte.',
  editing:'Edição iniciada.',
  review:'Vídeo enviado para avaliação. A primeira entrega fica registrada.',
  changes_requested:'Ajustes solicitados pelo cliente.',
  approved:'Cliente aprovou o vídeo.',
  delivered:'Entrega final registrada.',
  planned:'Em planejamento.',scheduled:'Agendado.',cancelled:'Cancelado.'
 };
 return {changed:true,workId:work.id,message:work.clientName+': '+description[stage]};
}
export function recordProductionPayment(data:ProductionData,clientName:string,amountCents:number,operationId:string,message:string,videoTitle?:string,now=new Date()){
 if(!/\b(recebi|caiu na conta|foi pago|me pagou|pagamento recebido)\b/i.test(fold(message)))
  throw new Error('Só registro dinheiro quando você confirma que recebeu de verdade.');
 if(!Number.isSafeInteger(amountCents)||amountCents<=0||amountCents>100_000_000)
  throw new Error('Informe o valor realmente recebido.');
 const match=/r\$\s*([0-9]+(?:[.,][0-9]{1,2})?)|\b([0-9]+(?:[.,][0-9]{1,2})?)\s*reais\b/i.exec(message);
 if(!match)throw new Error('Informe o valor exato recebido, como “Recebi R$ 200 do Garreto”.');
 const numeric=Number((match[1]||match[2]).replace(',','.'));
 if(!Number.isFinite(numeric)||Math.round(numeric*100)!==amountCents)
  throw new Error('O valor reconhecido não confere com o que você escreveu. Tente novamente.');
 const work=locateWork(data,clientName,videoTitle);
 if(data.payments.some(p=>p.id===operationId))return {changed:false,message:'Esse recebimento já foi registrado.',workId:work.id};
 const summary=paymentSummary(data,work);
 if(summary.remainingCents===null||amountCents>summary.remainingCents)
  throw new Error('Esse valor não corresponde ao saldo contratado do vídeo. Confira antes de registrar.');
 data.payments.unshift({id:operationId,workId:work.id,amountCents,receivedAt:now.toISOString(),createdAt:now.toISOString()});
 return {changed:true,workId:work.id,message:'Recebimento de '+work.clientName+' registrado no controle de produção. O lançamento no Financeiro permanece separado para evitar duplicidade.'};
}
export function addProductionVideo(data:ProductionData,name:string,title:string,fee:number|undefined,operationId:string){
 const clientName=safeText(name,120),videoTitle=safeText(title,160);
 if(clientName.length<3||videoTitle.length<3)throw new Error('Informe o cliente e qual vídeo foi contratado.');
 if(fee!==undefined&&(!Number.isSafeInteger(fee)||fee<0||fee>100_000_000))
  throw new Error('Valor contratado inválido.');
 if(data.works.some(w=>w.id===operationId||fold(w.clientName)===fold(clientName)&&fold(w.title)===fold(videoTitle)))
  return {changed:false,message:'Esse vídeo já consta da sua fila.',workId:operationId};
 const at=new Date().toISOString();
 const item:Work={id:operationId,clientName,title:videoTitle,stage:'planned',
  ...(fee!==undefined?{agreedFeeCents:fee}:{}),history:[{stage:'planned',at}],
  notes:'Cadastrado por comando explícito à Jornada IA.',createdAt:at,updatedAt:at};
 data.works.push(item);
 return {changed:true,message:'Vídeo de '+clientName+' cadastrado como planejamento. Nenhum pagamento foi presumido.',workId:item.id};
}
export function simpleProductionIntent(message:string,data:ProductionData){
 const clean=fold(message);
 const known=data.works.filter(w=>clean.includes(fold(w.clientName))&&fold(w.clientName)!=='cliente nao identificado');
 if(known.length!==1)return null;
 const name=known[0].clientName;
 if(/\b(acabei de gravar|terminei de gravar|finalizei a gravacao|conclui a gravacao|terminei agora a gravacao)\b/.test(clean))
  return {name:'production_change_stage',args:{client_name:name,stage:'captured'}};
 if(/\b(comecei a editar|iniciando a edicao|estou editando)\b/.test(clean))
  return {name:'production_change_stage',args:{client_name:name,stage:'editing'}};
 if(/\b(enviei para avaliacao|enviei para aprovacao|mandei para avaliacao|mande(i|ou) o video para aprovacao)\b/.test(clean))
  return {name:'production_change_stage',args:{client_name:name,stage:'review'}};
 if(/\b(cliente aprovou|aprovou o video|video aprovado)\b/.test(clean))
  return {name:'production_change_stage',args:{client_name:name,stage:'approved'}};
 return null;
}
export async function interpretProductionMessage(message:string,data:ProductionData){
 const local=simpleProductionIntent(message,data);
 if(local)return {action:local,provider:'local'};
 const only=data.works.map(w=>({client:w.clientName,title:w.title,stage:w.stage,
  remainingCents:paymentSummary(data,w).remainingCents})).slice(0,35);
 try{
  const result=await generateWithJornadaTools([
   {role:'system',content:safeSystemPolicy()+
    '\nControle de produção: cliente, vídeo e etapa são fatos. Para atualizações explícitas, use apenas as ferramentas fornecidas. Se houver ambiguidade, faça UMA pergunta. Gravação: nunca invente horário ou data, o sistema só marca como agora se a pessoa disser explicitamente agora. Proposta sem aceite NÃO vira trabalho contratado. Para dinheiro, somente recebimento confirmado pelo próprio filmmaker. Ações são registradas após validação pelo servidor. Contexto confiável de títulos/etapas: '+JSON.stringify(only)},
   {role:'user',content:sanitizeForLlm(message)}
  ],PRODUCTION_TOOLS);
  return {action:result.action??null,text:result.text||'',provider:result.provider};
 }catch(e){
  if(e instanceof LlmProviderError||e instanceof Error&&e.message==='FREE_LLM_NOT_CONFIGURED')
   return {action:null,text:'Entendi, mas não consegui interpretar com segurança. Exemplo: “Acabei de gravar o vídeo do Garreto agora” ou “Comecei a editar o vídeo do Garreto”.',provider:'local'};
  throw e;
 }
}
export async function applyProductionAssistantAction(action:{name:string;args:Record<string,unknown>},message:string,operationId:string){
 if(!/^[a-zA-Z0-9_-]{12,100}$/.test(operationId))throw new Error('Identificador inválido; tente reenviar.');
 const name=action.name,a=action.args||{};
 const client=typeof a.client_name==='string'?a.client_name:'';
 const title=typeof a.video_title==='string'?a.video_title:undefined;
 return changeProduction(data=>{
  if(name==='production_change_stage'){
   const stage=a.stage;
   if(!['captured','editing','review','changes_requested','approved','delivered'].includes(String(stage)))
    throw new Error('Etapa não reconhecida.');
   return applyProductionStage(data,client,stage as Stage,message,title);
  }
  if(name==='production_confirm_payment')
   return recordProductionPayment(data,client,a.amount_cents as number,operationId,message,title);
  if(name==='production_create_video'){
   if(!/\b(fechamos|fechei|contratou|contrato fechado|contrato confirmado|aceitou a proposta)\b/i.test(fold(message)))
    throw new Error('Sem confirmação de contratação, mantenho como possível cliente e não crio um serviço.');
   return addProductionVideo(data,client,title||'',a.agreed_fee_cents as number|undefined,operationId);
  }
  throw new Error('Comando não reconhecido.');
 });
}
