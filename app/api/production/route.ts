import {NextResponse} from 'next/server';
import {requireAuthenticated} from '@/lib/auth';
import {readProduction,changeProduction} from '@/lib/production-store';
import {isBlobConflict} from '@/lib/blob-conflict';
import {audit,getState,saveState} from '@/lib/store';
import {safeMoney,safeText,ensureValidDate,transitionAllowed,productionUrgency,
  deadlineForWork,paymentSummary,overlappingEditions,overlappingBookings,isProductionFinished,
  type Stage,type Work,type ProductionData} from '@/lib/production';
import { bookingDepositCents, requestPaymentsCents, reservePaidClientBooking } from '@/lib/client-booking';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const MAX_WORKS=1000;
function err(e:unknown){
  if(e instanceof Error&&e.message==='UNAUTHORIZED')
    return NextResponse.json({error:'Não autorizado.'},{status:401});
  if(isBlobConflict(e)||e instanceof Error&&e.name==='ProductionConflict')return NextResponse.json({error:'Outro registro foi salvo ao mesmo tempo. Atualize e tente novamente.'},{status:409});
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
    ,MATERIALS_REQUIRED:'Confirme que recebeu os materiais antes de enviar o vídeo para avaliação.'
    ,CONTRACT_PRICE_LOCKED:'Este valor veio de um pacote aprovado e não pode ser alterado por vídeo.'
    ,REVIEW_ASSET_REQUIRED:'Envie a prévia do vídeo antes de liberar a avaliação ao cliente.'
    ,FINAL_ASSET_REQUIRED:'Envie o vídeo final antes de marcar a entrega como concluída.'
    ,CLIENT_APPROVAL_REQUIRED:'O cliente precisa aprovar pelo link de acompanhamento.'
    ,REQUEST_SCHEDULE_GROUP:'Altere a gravação do pacote pela área Serviços e pedidos.'
    ,CANCELLATION_PENDING:'Este pedido está em cancelamento. Conclua o reembolso antes de continuar.'
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
      works:data.works.map(({reviewAsset,finalAsset,...w})=>({...w,
        reviewAsset:reviewAsset?{id:reviewAsset.id,name:reviewAsset.name,size:reviewAsset.size,createdAt:reviewAsset.createdAt}:undefined,
        finalAsset:finalAsset?{id:finalAsset.id,name:finalAsset.name,size:finalAsset.size,createdAt:finalAsset.createdAt}:undefined,
        clock:deadlineForWork(w),urgency:productionUrgency(w,now),payment:paymentSummary(data,w)})),
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
    const currentWork=(await readProduction()).works.find(work=>work.id===workId);
    if(currentWork?.clientRequestId){
      const state=await getState();
      if(state.clientRequests.some(request=>request.id===currentWork.clientRequestId&&request.cancellation))throw new Error('CANCELLATION_PENDING');
    }
    if(action==='materials-ready'){
      const stamp=body.materialsReadyAt?ensureValidDate(body.materialsReadyAt):new Date().toISOString();
      if(Date.parse(stamp)>Date.now()+60_000)throw new Error('INVALID_DATE');
      await changeProduction(data=>{
        const work=data.works.find(item=>item.id===workId);
        if(!work)throw new Error('WORK_NOT_FOUND');
        if(work.deliveryClockMode!=='after_capture_and_materials'||isProductionFinished(work))throw new Error('CANNOT_TRANSITION');
        if(work.materialsReadyAt)return;
        work.materialsReadyAt=stamp;work.updatedAt=new Date().toISOString();
      });
      return NextResponse.json({ok:true});
    }
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
          if(work.deliveryClockMode==='after_capture_and_materials'&&body.materialsReady===true&&!work.materialsReadyAt)work.materialsReadyAt=at;
        }
        if(['editing','review','changes_requested','approved','delivered'].includes(next)&&!work.capturedAt)
          throw new Error('CAPTURE_REQUIRED');
        if(next==='review'){
          if(work.deliveryClockMode==='after_capture_and_materials'&&!work.materialsReadyAt)throw new Error('MATERIALS_REQUIRED');
          if(work.clientRequestId&&!work.reviewAsset)throw new Error('REVIEW_ASSET_REQUIRED');
          if(!work.firstReviewSentAt)work.firstReviewSentAt=at;
          work.reviewSentAt=at;
        }
        if(next==='approved'){
          if(work.clientRequestId)throw new Error('CLIENT_APPROVAL_REQUIRED');
          work.approvedAt=at;
        }
        if(next==='delivered'){
          if(work.clientRequestId&&!work.finalAsset)throw new Error('FINAL_ASSET_REQUIRED');
          work.deliveredAt=at;
        }
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
          if(work.clientRequestId)throw new Error('REQUEST_SCHEDULE_GROUP');
          if(!['planned','scheduled'].includes(work.stage))throw new Error('CANNOT_TRANSITION');
          work.scheduledAt=body.scheduledAt?ensureValidDate(body.scheduledAt):undefined;
        }
        if(body.agreedFeeCents!==undefined){
          if(work.clientRequestId&&body.agreedFeeCents!==work.agreedFeeCents)throw new Error('CONTRACT_PRICE_LOCKED');
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
        const previous=s.payments.find(p=>p.id===operationId);
        if(previous){
          if(previous.workId!==workId||previous.amountCents!==amount||previous.accountId!==accountId)throw new Error('PAYMENT_DUPLICATE');
          return;
        }
        const work=s.works.find(w=>w.id===workId);
        if(!work)throw new Error('WORK_NOT_FOUND');
        if(work.agreedFeeCents===undefined||work.agreedFeeCents<=0)throw new Error('FEE_NOT_AGREED');
        const summary=paymentSummary(s,work);
        if(summary.remainingCents===null||amount>summary.remainingCents)throw new Error('OVERPAYMENT');
        s.payments.unshift({id:operationId,workId,amountCents:amount,accountId,receivedAt,createdAt:new Date().toISOString()});
      });
      let bookingResult: 'reserved' | 'awaiting_deposit' | 'conflict' | 'unchanged' = 'unchanged';
      let depositRemainingCents = 0;
      try {
        const savedProduction = await readProduction();
        const savedWork = savedProduction.works.find(item => item.id === workId);
        const requestState = await getState();
        const clientRequest = savedWork?.clientRequestId && requestState.clientRequests.find(item => item.id === savedWork.clientRequestId);
        if (clientRequest) {
          bookingResult = await reservePaidClientBooking(clientRequest.id, savedProduction);
          depositRemainingCents = Math.max(0, bookingDepositCents(clientRequest.agreedPriceCents) - requestPaymentsCents(clientRequest, savedProduction));
        }
      } catch {
        // The payment is already saved. A later refresh can repair the booking.
      }
      // A produção e o financeiro usam arquivos separados. O lançamento
      // financeiro usa uma chave determinística para reparar falhas sem duplicar.
      try{await syncPaymentToFinance(operationId);}catch{
        return NextResponse.json({error:'Recebimento salvo na Produção, mas falta atualizar o Financeiro. Atualize a tela para tentar conciliar; não registre o valor manualmente de novo.',financeSyncPending:true},{status:503});
      }
      const message = bookingResult === 'reserved' ? 'Recebimento registrado. A data ficou reservada após confirmar os 50%.'
        : bookingResult === 'conflict' ? 'Recebimento registrado, mas esse horário ficou indisponível. Proponha outra data ao cliente.'
        : bookingResult === 'awaiting_deposit' && depositRemainingCents > 0 ? `Recebimento registrado. Faltam ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(depositRemainingCents / 100)} para completar os 50% e reservar a data.`
        : 'Recebimento registrado na Produção e lançado no Financeiro.';
      return NextResponse.json({ok:true,bookingStatus:bookingResult,message});
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
    const previous=state.transactions.find(t=>t.importKey===importKey);
    const account=payment.accountId&&state.financialAccounts.find(a=>a.id===payment.accountId&&['cash','bank','wallet'].includes(a.type));
    if(!account)throw new Error('ACCOUNT_INVALID');
    const now=new Date().toISOString();
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(payment.receivedAt));
    const balance=account.currentBalanceCents??account.openingBalanceCents;
    if(!previous){
      account.currentBalanceCents=balance+payment.amountCents;
      account.balanceAsOf=day;
      state.transactions.unshift({
      id:crypto.randomUUID(),accountId:account.id,type:'income',amountCents:payment.amountCents,
      occurredOn:day,category:'Serviços',description:`Recebimento de serviço${work?`: ${work.title} — ${work.clientName}`:''}`,
      ...(work?.contactId?{contactId:work.contactId}:{}),...(work?.projectId?{projectId:work.projectId}:{}),
      status:'cleared',certainty:'confirmed',importKey,provenance:{kind:'system',label:'Pagamento da produção',ref:payment.id,updatedAt:now},createdAt:now,updatedAt:now
      });
      audit(state,{action:'finance.production_payment',collection:'transactions',recordId:payment.id,summary:`Recebimento de serviço: ${payment.amountCents} centavos`});
    }
    const request=state.clientRequests?.find(item=>item.id===work?.clientRequestId||item.workId===work?.id||item.workIds?.includes(work?.id||''));
    const receivable=request&&state.receivables?.find(item=>item.importKey===`client-request:${request.id}`);
    let receivableChanged=false;
    if(request&&receivable&&receivable.status!=='cancelled'){
      const workIds=new Set(request.workIds?.length?request.workIds:[request.workId]);
      const keys=new Set(state.transactions.map(item=>item.importKey));
      const received=production.payments.filter(item=>workIds.has(item.workId)&&keys.has(`production-payment:${item.id}`)).reduce((sum,item)=>sum+item.amountCents,0);
      const remaining=Math.max(0,request.agreedPriceCents-received);
      const status=remaining===0?'received':'pending';
      receivableChanged=receivable.receivedCents!==received||receivable.amountCents!==remaining||receivable.status!==status;
      if(receivableChanged){
        receivable.agreedAmountCents=request.agreedPriceCents;receivable.receivedCents=received;receivable.amountCents=remaining;receivable.status=status;receivable.updatedAt=now;
        if(status==='received')receivable.receivedTransactionId=state.transactions.find(item=>item.importKey===importKey)?.id;
      }
    }
    if(previous&&!receivableChanged)return;
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
