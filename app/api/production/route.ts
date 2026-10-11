import {NextResponse} from 'next/server';
import {requireAuthenticated} from '@/lib/auth';
import {readProduction,changeProduction} from '@/lib/production-store';
import {isBlobConflict} from '@/lib/blob-conflict';
import {safeMoney,safeText,ensureValidDate,transitionAllowed,productionUrgency,
  deadlineFor,paymentSummary,overlappingEditions,overlappingBookings,isProductionFinished,
  type Stage,type Work} from '@/lib/production';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const MAX_WORKS=1000;
function err(e:unknown){
  if(e instanceof Error&&e.message==='UNAUTHORIZED')
    return NextResponse.json({error:'Não autorizado.'},{status:401});
  if(isBlobConflict(e))return NextResponse.json({error:'Outro registro foi salvo ao mesmo tempo. Atualize e tente novamente.'},{status:409});
  const messages:Record<string,string>={
    INVALID_DATE:'Informe uma data e horário válidos.',
    INVALID_AMOUNT:'Valor inválido.',
    WORK_NOT_FOUND:'Serviço não encontrado.',
    CANNOT_TRANSITION:'Essa mudança de etapa não é permitida.',
    CAPTURE_REQUIRED:'Primeiro registre o término da gravação.',
    FEE_NOT_AGREED:'Confirme o valor contratado antes de registrar pagamento.',
    OVERPAYMENT:'O pagamento excede o saldo contratado.',
    INVALID_INPUT:'Preencha os campos obrigatórios.',
    TOO_MANY:'Limite de registros atingido.',
    PAYMENT_DUPLICATE:'Pagamento já registrado.',
    SCHEDULE_REQUIRED:'Informe a data de gravação antes de marcar como agendada.'
  };
  const msg=e instanceof Error?messages[e.message]:null;
  return msg?NextResponse.json({error:msg},{status:400}):
    NextResponse.json({error:'Não foi possível salvar. Nenhum recebimento deve ser presumido.'},{status:500});
}
export async function GET(){
  try{
    await requireAuthenticated();
    const data=await readProduction();
    const now=new Date();
    return NextResponse.json({
      works:data.works.map(w=>({...w,clock:deadlineFor(w.capturedAt),
        urgency:productionUrgency(w,now),payment:paymentSummary(data,w)})),
      conflicts:overlappingEditions(data.works),
      bookingConflicts:overlappingBookings(data.works),
      payments:data.payments,
      snapshotAt:now.toISOString()
    },{headers:{'Cache-Control':'no-store'}});
  }catch(e){return err(e);}
}
function parsePayload(body:unknown):Record<string,unknown> {
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('INVALID_INPUT');
  return body as Record<string,unknown>;
}
function stageOf(value:unknown):Stage{
  if(typeof value!=='string'||![
    'planned','scheduled','captured','editing','review','changes_requested',
    'approved','delivered','cancelled'].includes(value))throw new Error('INVALID_INPUT');
  return value as Stage;
}
export async function POST(req:Request){
  try{
    await requireAuthenticated();
    const body=parsePayload(await req.json());
    const action=body.action;
    if(typeof action!=='string')throw new Error('INVALID_INPUT');
    const workId=safeText(body.workId,100);
    if(action==='create'){
      const title=safeText(body.title,160), clientName=safeText(body.clientName,120);
      if(title.length<3||clientName.length<2)throw new Error('INVALID_INPUT');
      const operationId=safeText(body.operationId,80);
      if(!/^[a-zA-Z0-9_-]{12,80}$/.test(operationId))throw new Error('INVALID_INPUT');
      const id=operationId;
      const result=await changeProduction(s=>{
        if(s.works.some(w=>w.id===id))return id;
        if(s.works.length>=MAX_WORKS)throw new Error('TOO_MANY');
        const at=new Date().toISOString();
        const work:Work={id,title,clientName,stage:'planned',
          ...(body.contactId?{contactId:safeText(body.contactId,100)}:{}),
          ...(body.projectId?{projectId:safeText(body.projectId,100)}:{}),
          ...(body.scheduledAt?{scheduledAt:ensureValidDate(body.scheduledAt)}:{}),
          ...(typeof body.agreedFeeCents==='number'?{agreedFeeCents:safeMoney(body.agreedFeeCents)}:{}),
          notes:safeText(body.notes,1500),
          createdAt:at,updatedAt:at,history:[{stage:'planned',at}]};
        s.works.unshift(work);return id;
      });
      return NextResponse.json({ok:true,id:result});
    }
    if(!workId)throw new Error('INVALID_INPUT');
    if(action==='stage'){
      const next=stageOf(body.stage);
      const saved=await changeProduction(s=>{
        const work=s.works.find(w=>w.id===workId);
        if(!work)throw new Error('WORK_NOT_FOUND');
        if(!transitionAllowed(work.stage,next))throw new Error('CANNOT_TRANSITION');
        const at=new Date().toISOString();
        if(next==='scheduled'&&!work.scheduledAt)throw new Error('SCHEDULE_REQUIRED');
        if(next==='captured'){
          // Real end of filming; no timer before confirmed capture.
          const stamp=body.capturedAt?ensureValidDate(body.capturedAt):at;
          if(new Date(stamp).getTime()>Date.now()+60_000)throw new Error('INVALID_DATE');
          work.capturedAt=stamp;
        }
        if(['editing','review','changes_requested','approved','delivered'].includes(next)&&!work.capturedAt)
          throw new Error('CAPTURE_REQUIRED');
        if(next==='review'){
          if(!work.firstReviewSentAt)work.firstReviewSentAt=at;
          work.reviewSentAt=at;
        }
        if(next==='approved')work.approvedAt=at;
        if(next==='delivered')work.deliveredAt=at;
        work.stage=next;work.updatedAt=at;work.history.push({stage:next,at});
        return work.id;
      });
      return NextResponse.json({ok:true,id:saved});
    }
    if(action==='update'){
      await changeProduction(s=>{
        const work=s.works.find(w=>w.id===workId);
        if(!work)throw new Error('WORK_NOT_FOUND');
        if(isProductionFinished(work))throw new Error('CANNOT_TRANSITION');
        if(body.title!==undefined){
          const v=safeText(body.title,160);if(v.length<3)throw new Error('INVALID_INPUT');
          work.title=v;
        }
        if(body.notes!==undefined)work.notes=safeText(body.notes,1500);
        if(body.scheduledAt!==undefined){
          if(!['planned','scheduled'].includes(work.stage))throw new Error('CANNOT_TRANSITION');
          work.scheduledAt=body.scheduledAt?ensureValidDate(body.scheduledAt):undefined;
        }
        if(body.agreedFeeCents!==undefined){
          const value=body.agreedFeeCents===null?undefined:safeMoney(body.agreedFeeCents);
          const paid=paymentSummary(s,work).receivedCents;
          if(value===undefined&&paid>0)throw new Error('INVALID_INPUT');
          if(value!==undefined&&value<paid)throw new Error('OVERPAYMENT');
          work.agreedFeeCents=value;
        }
        work.updatedAt=new Date().toISOString();
      });
      return NextResponse.json({ok:true});
    }
    if(action==='payment'){
      const amount=safeMoney(body.amountCents);
      if(amount===0||body.confirmed!==true)throw new Error('INVALID_INPUT');
      const operationId=safeText(body.operationId,80);
      if(!/^[a-zA-Z0-9_-]{12,80}$/.test(operationId))throw new Error('INVALID_INPUT');
      const receivedAt=body.receivedAt?ensureValidDate(body.receivedAt):new Date().toISOString();
      if(new Date(receivedAt).getTime()>Date.now()+60_000)throw new Error('INVALID_DATE');
      await changeProduction(s=>{
        if(s.payments.some(p=>p.id===operationId))return; // retry idempotente
        const work=s.works.find(w=>w.id===workId);
        if(!work)throw new Error('WORK_NOT_FOUND');
        if(work.agreedFeeCents===undefined||work.agreedFeeCents<=0)throw new Error('FEE_NOT_AGREED');
        const summary=paymentSummary(s,work);
        if(summary.remainingCents===null||amount>summary.remainingCents)throw new Error('OVERPAYMENT');
        s.payments.unshift({id:operationId,workId,amountCents:amount,receivedAt,createdAt:new Date().toISOString()});
      });
      return NextResponse.json({ok:true});
    }
    return NextResponse.json({error:'Ação inválida.'},{status:400});
  }catch(e){return err(e);}
}
