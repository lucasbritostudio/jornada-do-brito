import {NextResponse} from 'next/server';
import {requireAuthenticated} from '@/lib/auth';
import {readProduction,changeProduction} from '@/lib/production-store';
import {isBlobConflict} from '@/lib/blob-conflict';
import {audit,getState,saveState} from '@/lib/store';
import {safeMoney,safeText,ensureValidDate,transitionAllowed,productionUrgency,
  deadlineFor,paymentSummary,overlappingEditions,overlappingBookings,isProductionFinished,
  type Stage,type Work,type ProductionData} from '@/lib/production';

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
    ACCOUNT_REQUIRED:'Escolha a conta onde o dinheiro entrou.',
    ACCOUNT_INVALID:'A conta escolhida não é uma conta ativa de dinheiro.',
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
    let financeSyncPending=false;
    try{await syncPendingFinancePayments(data);}catch{financeSyncPending=true;}
    const now=new Date();
    return NextResponse.json({
      works:data.works.map(w=>({...w,clock:deadlineFor(w.capturedAt),
        urgency:productionUrgency(w,now),payment:paymentSummary(data,w)})),
      conflicts:overlappingEditions(data.works),
      bookingConflicts:overlappingBookings(data.works),
      payments:data.payments,
      financeSyncPending,
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
      const accountId=safeText(body.accountId,100);
      if(!accountId)throw new Error('ACCOUNT_REQUIRED');
      const finance=await getState();
      const account=finance.financialAccounts.find(a=>a.id===accountId&&a.active);
      if(!account||!['cash','bank','wallet'].includes(account.type))throw new Error('ACCOUNT_INVALID');
      await changeProduction(s=>{
        if(s.payments.some(p=>p.id===operationId))return; // retry idempotente
        const work=s.works.find(w=>w.id===workId);
        if(!work)throw new Error('WORK_NOT_FOUND');
        if(work.agreedFeeCents===undefined||work.agreedFeeCents<=0)throw new Error('FEE_NOT_AGREED');
        const summary=paymentSummary(s,work);
        if(summary.remainingCents===null||amount>summary.remainingCents)throw new Error('OVERPAYMENT');
        s.payments.unshift({id:operationId,workId,amountCents:amount,accountId,receivedAt,createdAt:new Date().toISOString()});
      });
      // A produção e o financeiro usam arquivos separados. O lançamento
      // financeiro usa uma chave determinística para reparar falhas sem duplicar.
      try{await syncPaymentToFinance(operationId);}catch{
        return NextResponse.json({error:'Recebimento salvo na Produção, mas falta atualizar o Financeiro. Atualize a tela para tentar conciliar; não registre o valor manualmente de novo.',financeSyncPending:true},{status:503});
      }
      return NextResponse.json({ok:true});
    }
    return NextResponse.json({error:'Ação inválida.'},{status:400});
  }catch(e){return err(e);}
}

async function syncPaymentToFinance(paymentId:string){
  for(let attempt=0;attempt<3;attempt++){
    const production=await readProduction();
    const payment=production.payments.find(p=>p.id===paymentId);
    if(!payment)return;
    const work=production.works.find(w=>w.id===payment.workId);
    const state=await getState();
    const importKey=`production-payment:${payment.id}`;
    if(state.transactions.some(t=>t.importKey===importKey))return;
    const account=payment.accountId&&state.financialAccounts.find(a=>a.id===payment.accountId&&['cash','bank','wallet'].includes(a.type));
    if(!account)throw new Error('ACCOUNT_INVALID');
    const now=new Date().toISOString();
    const day=payment.receivedAt.slice(0,10);
    const balance=account.currentBalanceCents??account.openingBalanceCents;
    account.currentBalanceCents=balance+payment.amountCents;
    account.balanceAsOf=day;
    state.transactions.unshift({
      id:crypto.randomUUID(),accountId:account.id,type:'income',amountCents:payment.amountCents,
      occurredOn:day,category:'Serviços',description:`Recebimento de serviço${work?`: ${work.title} — ${work.clientName}`:''}`,
      ...(work?.contactId?{contactId:work.contactId}:{}),...(work?.projectId?{projectId:work.projectId}:{}),
      status:'cleared',certainty:'confirmed',importKey,provenance:{kind:'system',label:'Pagamento da produção',ref:payment.id,updatedAt:now},createdAt:now,updatedAt:now
    });
    audit(state,{action:'finance.production_payment',collection:'transactions',recordId:payment.id,summary:`Recebimento de serviço: ${payment.amountCents} centavos`});
    try{await saveState(state);return;}catch(error){if(!isBlobConflict(error)||attempt===2)throw error;}
  }
}

async function syncPendingFinancePayments(production:ProductionData){
  const candidates=production.payments.filter(p=>p.accountId);
  if(!candidates.length)return;
  const state=await getState();
  const completed=new Set(state.transactions.map(t=>t.importKey).filter(Boolean));
  for(const payment of candidates){
    if(!completed.has(`production-payment:${payment.id}`))await syncPaymentToFinance(payment.id);
  }
}
