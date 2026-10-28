'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import type {Stage} from '@/lib/production';

type Clock={startedAt:string;targetAt:string;dueAt:string}|null;
type WorkView={
  id:string;clientName:string;contactId?:string;title:string;stage:Stage;
  scheduledAt?:string;capturedAt?:string;firstReviewSentAt?:string;
  reviewSentAt?:string;approvedAt?:string;deliveredAt?:string;
  notes?:string;agreedFeeCents?:number;createdAt:string;
  clock:Clock;urgency:'not_started'|'on_track'|'at_risk'|'overdue'|'sent_on_time'|'sent_late'|'finished'|'waiting_client'|'revisions';
  payment:{receivedCents:number;remainingCents:number|null;status:string};
};
type State={works:WorkView[];conflicts:{startOfWork:string;workIds:string[]}[];bookingConflicts:{date:string;workIds:string[]}[];payments:{id:string;workId:string;amountCents:number;receivedAt:string}[];snapshotAt:string;financeSyncPending?:boolean};
type MoneyAccount={id:string;name:string;type:'cash'|'bank'|'wallet'|'credit_card'|'own_collateral'|'reserve';active:boolean};
const LABEL:Record<Stage,string>={
  planned:'Planejamento',scheduled:'Gravação agendada',captured:'Gravado',
  editing:'Em edição',review:'Enviado para avaliação',changes_requested:'Cliente pediu ajustes',
  approved:'Aprovado',delivered:'Entregue',cancelled:'Cancelado'
};
const NEXT:Record<Stage,Stage[]>={
  planned:['scheduled','captured','cancelled'],scheduled:['planned','captured','cancelled'],
  captured:['editing','review'],editing:['review'],review:['approved','changes_requested'],
  changes_requested:['editing','review'],approved:['delivered','changes_requested'],
  delivered:[],cancelled:[]
};
const money=(v:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v/100);
const fmt=(v?:string)=>v?new Intl.DateTimeFormat('pt-BR',{
  timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'short'
}).format(new Date(v)):'A definir';
const round=(v:string)=>Math.round(Number(v.replace(/\./g,'').replace(',','.'))*100);
const inputToIso=(value:string)=>new Date(value+'-03:00').toISOString();
const isoToInput=(value?:string)=>value
  ?new Intl.DateTimeFormat('sv-SE',{
    timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
   }).format(new Date(value)).replace(' ','T')
  :'';

function displayUrgency(work:WorkView,now:number){
  if(work.stage==='delivered')return {label:'Concluído',tone:'quiet'};
  if(work.stage==='cancelled')return {label:'Cancelado',tone:'quiet'};
  if(work.firstReviewSentAt){
    if(work.stage==='review')return {label:'Aguardando cliente',tone:'quiet'};
    if(work.stage==='changes_requested'||work.stage==='editing')return {label:'Ajustes em andamento',tone:'attention'};
    if(work.stage==='approved')return {label:'Aprovado · concluir entrega',tone:'good'};
    return {label:'Enviado para avaliação',tone:'good'};
  }
  if(!work.clock)return {label:'Aguardando gravação',tone:'quiet'};
  if(now>=Date.parse(work.clock.dueAt))return {label:'Prazo excedido',tone:'danger'};
  if(now>=Date.parse(work.clock.targetAt))return {label:'Meta 48h atingida',tone:'attention'};
  return {label:'Dentro do prazo',tone:'good'};
}
function createOperationId(){
  return crypto.randomUUID();
}
export default function ProductionDashboard(){
 const [data,setData]=useState<State|null>(null);
 const [now,setNow]=useState(Date.now());
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false);
 const [clientName,setClientName]=useState('');
 const [title,setTitle]=useState('');
 const [fee,setFee]=useState('');
 const [date,setDate]=useState('');
 const [filter,setFilter]=useState<'active'|'all'|'done'>('active');
 const [editingId,setEditingId]=useState('');
 const [payId,setPayId]=useState('');
 const [payAmount,setPayAmount]=useState('');
 const [payAccountId,setPayAccountId]=useState('');
 const [payOp,setPayOp]=useState('');
 const [createOp,setCreateOp]=useState('');
 const [captureId,setCaptureId]=useState('');
 const [captureAt,setCaptureAt]=useState('');
 const [customers,setCustomers]=useState<{id:string;name:string}[]>([]);
 const [moneyAccounts,setMoneyAccounts]=useState<MoneyAccount[]>([]);
 const [assistantMessage,setAssistantMessage]=useState('');
 const [assistantBusy,setAssistantBusy]=useState(false);
 const [assistantAnswer,setAssistantAnswer]=useState('');
 const [assistantOperation,setAssistantOperation]=useState('');

 const refresh=useCallback(async()=>{
   const r=await fetch('/api/production',{cache:'no-store'});
   if(r.status===401){window.location.href='/login';return;}
   if(!r.ok)throw new Error('Não foi possível carregar a produção.');
   const json=await r.json() as State;
   setData(json);setNow(Date.now());
 },[]);
 useEffect(()=>{
   (async()=>{
      const response=await fetch('/api/production/onboard',{method:'POST',cache:'no-store'});
      if(!response.ok)throw new Error('Não consegui sincronizar os clientes conhecidos. Vou manter os dados existentes e tentar carregar a fila.');
      await refresh();
    })().catch(async e=>{setError(e instanceof Error?e.message:String(e));await refresh().catch(()=>{});});
   fetch('/api/state',{cache:'no-store'}).then(r=>r.ok?r.json():null)
     .then(j=>{if(j?.contacts)setCustomers(j.contacts.map((c:{id:string;name:string})=>({id:c.id,name:c.name})));if(j?.financialAccounts)setMoneyAccounts(j.financialAccounts.filter((a:MoneyAccount)=>a.active&&['cash','bank','wallet'].includes(a.type)));}).catch(()=>{});
   const timer=setInterval(()=>setNow(Date.now()),60_000);
   return()=>clearInterval(timer);
 },[refresh]);

 const summary=useMemo(()=>{
   const works=data?.works||[];
   const active=works.filter(w=>!['delivered','cancelled'].includes(w.stage));
   const urgent=active.filter(w=>!w.firstReviewSentAt && w.clock && now>=Date.parse(w.clock.targetAt));
   const pending=works.filter(w=>w.payment.remainingCents!==null &&
     w.payment.remainingCents>0 && w.stage!=='cancelled');
   return {active:active.length,urgent:urgent.length,
     pendingCents:pending.reduce((sum,w)=>sum+(w.payment.remainingCents||0),0),
     pendingCount:pending.length};
 },[data,now]);
 const visible=useMemo(()=>data?.works.filter(w=>
   filter==='all'||(filter==='done'?['delivered','cancelled'].includes(w.stage):
     !['delivered','cancelled'].includes(w.stage)))||[],[data,filter]);
 async function api(payload:Record<string,unknown>,success='Atualizado.') {
   setBusy(true);setError('');setNotice('');
   try{
     const response=await fetch('/api/production',{
       method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)
     });
     const json=await response.json();
     if(!response.ok)throw new Error(json.error||'Não foi possível salvar.');
     await refresh();setNotice(success);return true;
   }catch(e){setError(e instanceof Error?e.message:'Ocorreu um erro.');return false;}
   finally{setBusy(false);}
 }
 async function sendAssistant(){
    const message=assistantMessage.trim();if(!message||assistantBusy)return;
    const operationId=assistantOperation||createOperationId();
    setAssistantOperation(operationId);setAssistantBusy(true);setError('');setAssistantAnswer('');
    try{
      const response=await fetch('/api/production/assistant',{method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({message,operationId})});
      const json=await response.json();
      if(!response.ok)throw new Error(json.error||'Não consegui interpretar seu relato.');
      setAssistantAnswer(json.message||'Não consegui identificar uma atualização segura.');
      if(json.changed){setAssistantMessage('');setAssistantOperation('');await refresh();}
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível atualizar o trabalho.');}
    finally{setAssistantBusy(false);}
 }
 async function create(){
   const cents=fee.trim()?round(fee):undefined;
   if(fee.trim()&&(!Number.isSafeInteger(cents)||cents===undefined||cents<0)){setError('Valor inválido.');return;}
   const customer=customers.find(c=>c.name.trim().toLowerCase()===clientName.trim().toLowerCase());
   const op=createOp||createOperationId();setCreateOp(op);
   const ok=await api({action:'create',operationId:op,clientName,title,
      ...(customer?{contactId:customer.id}:{}),
      ...(cents!==undefined?{agreedFeeCents:cents}:{}),
      ...(date?{scheduledAt:inputToIso(date)}:{})
   },'Novo serviço criado como planejamento, sem inventar contrato nem pagamento.');
   if(ok){setClientName('');setTitle('');setFee('');setDate('');setCreateOp('');}
 }
 async function move(w:WorkView,to:Stage){
   if(to==='captured'){setCaptureId(w.id);setCaptureAt('');return;}
   if(to==='cancelled'&&!window.confirm('Cancelar este trabalho? Os recebimentos já registrados não serão apagados.'))return;
   await api({action:'stage',workId:w.id,stage:to},'Etapa atualizada.');
 }
 async function capture(w:WorkView){
   let iso:string|undefined;
   if(captureAt){
     const dt=new Date(captureAt+'-03:00');if(!Number.isFinite(dt.getTime())){setError('Data inválida.');return;}
     iso=inputToIso(captureAt);
   }
   const ok=await api({action:'stage',workId:w.id,stage:'captured',...(iso?{capturedAt:iso}:{})},'Gravação concluída. Prazo de 72 horas iniciado no dia seguinte.');
   if(ok){setCaptureId('');setCaptureAt('');}
 }
 async function receive(w:WorkView){
   const cents=round(payAmount);
   if(!Number.isSafeInteger(cents)||cents<=0){setError('Informe o valor realmente recebido.');return;}
   const op=payOp||createOperationId();
   setPayOp(op);
   if(!payAccountId){setError('Escolha a conta onde o dinheiro entrou.');return;}
   const ok=await api({action:'payment',workId:w.id,amountCents:cents,accountId:payAccountId,operationId:op,confirmed:true},
     'Recebimento registrado na produção e lançado no Financeiro.');
   if(ok){setPayId('');setPayAmount('');setPayAccountId('');setPayOp('');}
 }
 return <main className="pr-shell">
  <header className="pr-head">
   <a href="/" className="pr-back">← Voltar à Jornada</a>
   <span className="pr-eyebrow">JORNADA / CONTROLE DE PRODUÇÃO</span>
   <h1>Produção <em>no prazo.</em></h1>
   <p>Da gravação à aprovação e ao recebimento. Seu relógio só começa no dia seguinte à captação.</p>
  </header>
  <section className="pr-assistant-card">
   <div><span className="pr-mini">JORNADA IA · SUA PRODUÇÃO</span><h2>Me conte. Eu organizo.</h2>
    <p>Não precisa preencher fichas. Seus clientes conhecidos são carregados automaticamente. Diga o que aconteceu com um vídeo e eu atualizo as etapas.</p></div>
   <div className="pr-assistant-form"><textarea aria-label="Atualizar a produção conversando com a IA" rows={2}
     value={assistantMessage} placeholder="Ex.: Acabei de gravar o vídeo do Garreto agora"
     onChange={e=>{setAssistantMessage(e.target.value);setAssistantOperation('');}}/>
    <button disabled={assistantBusy||!assistantMessage.trim()} onClick={sendAssistant}>
     {assistantBusy?'Organizando…':'Atualizar por conversa'}</button>
   </div>
   {assistantAnswer&&<p className="pr-assistant-answer" role="status">{assistantAnswer}</p>}
   <small>O prazo só começa com a gravação confirmada. Propostas e dinheiro ainda não recebido não viram contratos ou pagamentos.</small>
  </section>
  <section className="pr-rule"><div><span>Prazo combinado</span><b>72 horas</b><small>Contadas a partir de 00h do dia seguinte, no horário de Fortaleza</small></div>
   <div><span>Meta interna</span><b>48 horas</b><small>Primeira versão enviada ao cliente para avaliação</small></div>
   <div><span>Entrega x avaliação</span><b>Separadas</b><small>Retorno do cliente e ajustes não apagam seu envio no prazo</small></div></section>
  {error&&<div className="pr-error" role="alert">{error}</div>}
  {data?.financeSyncPending&&<div className="pr-error" role="alert">Há um recebimento salvo na Produção que ainda não foi conciliado no Financeiro. Confira se a conta continua cadastrada e atualize esta tela. Não lance o mesmo valor manualmente.</div>}
  {notice&&<div className="pr-notice" role="status">{notice}</div>}
  {!data?<p className="pr-loading">Carregando trabalhos com segurança…</p>:<>
  <section className="pr-metrics">
   <article><small>Produções em aberto</small><strong>{summary.active}</strong><span>Planejamento até entrega</span></article>
   <article className={summary.urgent?'pr-metric-alert':''}><small>Precisam de atenção</small><strong>{summary.urgent}</strong><span>Sem envio até a meta de 48h</span></article>
   <article><small>Saldo de serviços cadastrados</small><strong>{money(summary.pendingCents)}</strong><span>{summary.pendingCount} trabalho(s) com saldo informado, não é caixa</span></article>
  </section>
  {data.bookingConflicts?.length>0&&<section className="pr-warning">
    <strong>Atenção à agenda antes de confirmar mais trabalho</strong>
    <p>{data.bookingConflicts.length} data(s) têm duas ou mais gravações previstas. Confira deslocamento, duração e tempo restante para editar; isso é um aviso, não um bloqueio automático.</p>
  </section>}
  {data.conflicts.length>0&&<section className="pr-warning">
    <strong>Possível sobrecarga na edição</strong>
    <p>{data.conflicts.length} data(s) com duas ou mais captações concluídas no mesmo dia. Verifique se consegue editar tudo antes das metas.</p>
  </section>}
  <div className="pr-main-grid">
   <section className="pr-card">
    <header className="pr-card-header"><div><span className="pr-mini">PAINEL DE SERVIÇOS</span><h2>Fila de produção</h2></div>
      <select aria-label="Filtrar trabalhos" value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}>
       <option value="active">Em andamento</option><option value="all">Todos</option><option value="done">Encerrados</option>
      </select>
    </header>
    {!visible.length?<div className="pr-empty">Nenhum trabalho nesta seleção. Cadastre somente serviços reais; propostas sem aceite podem ficar no planejamento.</div>:
     <div className="pr-work-list">{visible.map(w=>{
      const urgency=displayUrgency(w,now);
      return <article className="pr-work" key={w.id}>
       <div className="pr-work-title"><div><small>{w.clientName}</small><h3>{w.title}</h3></div><span className={'pr-status '+urgency.tone}>{urgency.label}</span></div>
       <div className="pr-tags"><span>{LABEL[w.stage]}</span><span>{w.agreedFeeCents===undefined?'Sem valor aprovado':money(w.agreedFeeCents)+' combinado'}</span></div>
       <dl className="pr-dates">
        <div><dt>Gravação</dt><dd>{fmt(w.capturedAt||w.scheduledAt)}</dd></div>
        <div><dt>Meta 48h</dt><dd>{fmt(w.clock?.targetAt)}</dd></div>
        <div><dt>Prazo 72h</dt><dd>{fmt(w.clock?.dueAt)}</dd></div>
       </dl>
       {w.firstReviewSentAt&&<p className="pr-meta">Primeiro envio para avaliação: {fmt(w.firstReviewSentAt)} · {w.clock && Date.parse(w.firstReviewSentAt)<=Date.parse(w.clock.dueAt)?'dentro das 72h':'após as 72h'}</p>}
       <div className="pr-payment"><div><small>Recebido (confirmado no módulo)</small><b>{money(w.payment.receivedCents)}</b></div>
         <div><small>Falta receber</small><b>{w.payment.remainingCents===null?'Não definido':money(w.payment.remainingCents)}</b></div></div>
       <div className="pr-actions">
        {NEXT[w.stage].map(to=><button disabled={busy} key={to}
         className={to==='cancelled'?'pr-btn-light':''} onClick={()=>move(w,to)}>
          {to==='captured'?'Concluí a gravação':to==='review'?'Enviei para avaliação':to==='approved'?'Cliente aprovou':to==='delivered'?'Entreguei o vídeo':LABEL[to]}
         </button>)}
        {!['cancelled','delivered'].includes(w.stage)&&<button className="pr-btn-light" disabled={busy} onClick={()=>setEditingId(editingId===w.id?'':w.id)}>Editar dados</button>}
        {w.payment.remainingCents!==null&&w.payment.remainingCents>0&&<button className="pr-btn-money" disabled={busy} onClick={()=>{setPayId(payId===w.id?'':w.id);setPayOp('');setPayAmount('');setPayAccountId('');}}>Registrar recebimento</button>}
       </div>
       {captureId===w.id&&<div className="pr-inline"><strong>Quando terminou a gravação?</strong><p>Deixe em branco para registrar agora. Para gravação passada, informe a hora real do seu aparelho.</p>
        <input aria-label="Data de conclusão da gravação" type="datetime-local" value={captureAt} onChange={e=>setCaptureAt(e.target.value)}/><button disabled={busy} onClick={()=>capture(w)}>Confirmar captação</button><button className="pr-btn-light" onClick={()=>setCaptureId('')}>Voltar</button></div>}
       {payId===w.id&&<div className="pr-inline"><strong>Pagamento recebido de verdade</strong><input aria-label="Valor recebido em reais" value={payAmount} inputMode="decimal" placeholder="Ex.: 200,00" onChange={e=>{setPayAmount(e.target.value);setPayOp('');}}/>
        <label>Conta onde o dinheiro entrou<select aria-label="Conta onde o dinheiro entrou" value={payAccountId} onChange={e=>setPayAccountId(e.target.value)}><option value="">Escolha uma conta</option>{moneyAccounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <button disabled={busy} onClick={()=>receive(w)}>Confirmar valor recebido</button><button className="pr-btn-light" onClick={()=>setPayId('')}>Voltar</button>
        <p>O mesmo recebimento será registrado no Financeiro e atualizado no saldo desta conta.</p></div>}
       {editingId===w.id&&<EditWork key={w.id} w={w} busy={busy} save={api} close={()=>setEditingId('')}/>}
      </article>;
     })}</div>}
   </section>
   <aside className="pr-side">
    <section className="pr-card">
     <header className="pr-card-header"><div><span className="pr-mini">NOVO TRABALHO</span><h2>Adicionar vídeo</h2></div></header>
     <p className="pr-description">Um cadastro para cada vídeo, mesmo dentro de pacotes com quatro entregas. Cadastrar aqui não significa contrato fechado.</p>
     <div className="pr-form">
      <label>Cliente<input list="pr-customer" value={clientName} maxLength={120} onChange={e=>{setClientName(e.target.value);setCreateOp('');}} placeholder="Nome do cliente"/></label>
      <datalist id="pr-customer">{customers.map(c=><option key={c.id} value={c.name}/>)}</datalist>
      <label>Serviço / vídeo<input value={title} maxLength={160} onChange={e=>{setTitle(e.target.value);setCreateOp('');}} placeholder="Ex.: Garreto — vídeo 01"/></label>
      <label>Valor acordado (R$) <small>Deixe vazio se não foi aprovado</small><input inputMode="decimal" value={fee} onChange={e=>{setFee(e.target.value);setCreateOp('');}} placeholder="Sem valor aprovado"/></label>
      <label>Gravação prevista <small>Opcional, não inicia o relógio</small><input type="datetime-local" value={date} onChange={e=>{setDate(e.target.value);setCreateOp('');}}/></label>
      <button disabled={busy||clientName.trim().length<2||title.trim().length<3} onClick={create}>Cadastrar vídeo</button>
     </div>
    </section>
    <section className="pr-card">
     <header className="pr-card-header"><div><span className="pr-mini">COMO FUNCIONA</span><h2>Seu fluxo de 3 dias</h2></div></header>
     <ol className="pr-steps">
      <li><b>Gravação</b><p>Finalize os takes e confirme o término. Pode descansar; o prazo começa no dia seguinte.</p></li>
      <li><b>Dia seguinte</b><p>Edição e primeira versão. Meta interna: enviar para avaliação antes de 48 horas.</p></li>
      <li><b>Margem de segurança</b><p>Até 72 horas para enviar o vídeo à avaliação. A aprovação depende do cliente.</p></li>
     </ol>
     <p className="pr-description">Alertas aparecem neste painel ao abrir a Jornada; notificações externas não foram ativadas.</p>
    </section>
   </aside>
  </div>
  </>}
 </main>;
}
function EditWork({w,busy,save,close}:{w:WorkView;busy:boolean;save:(p:Record<string,unknown>,m?:string)=>Promise<boolean>;close:()=>void}){
 const [name,setName]=useState(w.title);
 const [notes,setNotes]=useState(w.notes||'');
 const [fee,setFee]=useState(w.agreedFeeCents===undefined?'':String(w.agreedFeeCents/100).replace('.',','));
 const [scheduled,setScheduled]=useState(w.scheduledAt?isoToInput(w.scheduledAt):'');
 return <div className="pr-inline pr-edit">
  <strong>Editar dados do serviço</strong>
  <label>Nome<input value={name} onChange={e=>setName(e.target.value)}/></label>
  <label>Valor combinado (R$)<input value={fee} inputMode="decimal" onChange={e=>setFee(e.target.value)}/></label>
  {['planned','scheduled'].includes(w.stage)&&<label>Gravação prevista<input type="datetime-local" value={scheduled} onChange={e=>setScheduled(e.target.value)}/></label>}
  <label>Observações<textarea value={notes} onChange={e=>setNotes(e.target.value)} maxLength={1500}/></label>
  <button disabled={busy} onClick={async()=>{
    const cents=fee.trim()?round(fee):null;
    if(cents!==null&&(!Number.isSafeInteger(cents)||cents<0))return;
    const ok=await save({action:'update',workId:w.id,title:name,notes,
      agreedFeeCents:cents,
      ...(['planned','scheduled'].includes(w.stage)?{scheduledAt:scheduled?inputToIso(scheduled):''}:{})
    },'Dados atualizados.');
    if(ok)close();
  }}>Salvar edição</button><button className="pr-btn-light" onClick={close}>Fechar</button>
 </div>;
}
