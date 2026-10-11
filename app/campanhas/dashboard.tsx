'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Funnel = {
  contacts:number;quotes:number;buyers:number;salesCount:number;
  revenueCents:number;adSpendCents:number;netAfterMediaCents:number;
  quoteRate:number|null;salesRate:number|null;
  instagram: {measuredAt:string;views?:number;reach?:number;likes?:number;comments?:number;saved?:number;shares?:number}|null;
};
type Campaign = { id:string;title:string;business:string;code:string;status:'draft'|'active'|'finished';startDate?:string;endDate?:string;instagramMediaId?:string;adSpendCents:number;metrics:Funnel };
type Event = { id:string;campaignId:string;kind:'contact'|'quote'|'sale';source:'manual'|'meta_whatsapp';amountCents:number;occurredAt:string;confirmed:boolean };
type Payload={campaigns:Campaign[];events:Event[];connections:{whatsapp:boolean;instagram:boolean;caveat:string}};

const brl=(cents:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
const number=(n:number)=>new Intl.NumberFormat('pt-BR').format(n);
const percent=(n:number|null)=>n === null ? 'Sem base' : new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1}).format(n);
const shortDate=(v?:string)=>v ? new Date(v).toLocaleString('pt-BR',{timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'short'}):'—';

export default function CampaignDashboard() {
 const [payload,setPayload]=useState<Payload|null>(null);
 const [selected,setSelected]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [business,setBusiness]=useState('Arte Print');
 const [title,setTitle]=useState('Semana da Criança • Personalizados');
 const [code,setCode]=useState('CRIANCA20');
 const [eventKind,setEventKind]=useState<'contact'|'quote'|'sale'>('contact');
 const [amount,setAmount]=useState('');
 const [reference,setReference]=useState('');
 const [mediaId,setMediaId]=useState('');
 const [spend,setSpend]=useState('');

 const reload=useCallback(async()=>{
   const res=await fetch('/api/campaigns',{cache:'no-store'});
   if(!res.ok) throw new Error('Não foi possível acessar as campanhas.');
   const data=await res.json() as Payload;
   setPayload(data);
   setSelected(previous=>data.campaigns.some(c=>c.id===previous)?previous:data.campaigns[0]?.id||'');
 },[]);
 useEffect(()=>{reload().catch(e=>setError(e.message));},[reload]);
 const campaign=payload?.campaigns.find(c=>c.id===selected);
 const m=campaign?.metrics;
 const events=useMemo(()=>payload?.events.filter(e=>e.campaignId===selected).slice().reverse().slice(0,12)||[],[payload,selected]);
 useEffect(()=>{setMediaId(campaign?.instagramMediaId||'');setSpend(String((campaign?.adSpendCents||0)/100).replace('.',','));},[campaign?.id,campaign?.instagramMediaId,campaign?.adSpendCents]);
 async function action(body:Record<string,unknown>,message='Atualizado.') {
   setBusy(true);setError('');setNotice('');
   try{
     const res=await fetch('/api/campaigns',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
     const json=await res.json();
     if(!res.ok)throw new Error(json.error||'Não foi possível salvar.');
     await reload();setNotice(message);
     return true;
   }catch(e){setError(e instanceof Error?e.message:'Falha inesperada.');return false;}
   finally{setBusy(false);}
 }
 async function sync(){
   if(!campaign)return;
   setBusy(true);setError('');setNotice('');
   try{
     const res=await fetch('/api/campaigns/sync/instagram',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({campaignId:campaign.id})});
     const body=await res.json();
     if(!res.ok)throw new Error(body.error||'A Meta não retornou os dados.');
     await reload();setNotice('Métricas reais consultadas na Meta.');
   }catch(e){setError(e instanceof Error?e.message:'Falha de sincronização.');}
   finally{setBusy(false);}
 }
 function stage(kind:Event['kind']){
   return kind==='contact'?'Novo contato':kind==='quote'?'Orçamento solicitado':'Venda confirmada';
 }
 return <div className="cr-app">
  <header className="cr-top">
    <div><a className="cr-back" href="/">← Voltar à Jornada</a><p className="cr-overline">JORNADA DO BRITO · INTELIGÊNCIA COMERCIAL</p>
      <h1>Resultados das <em>Campanhas.</em></h1>
      <p>O que o vídeo movimentou, o que virou orçamento e o que realmente vendeu — sem misturar alcance com faturamento.</p>
    </div>
    <div className="cr-top-side"><span className="cr-live">Ambiente de preparação</span><small>Meta não conectada automaticamente</small></div>
  </header>
  {error&&<div className="cr-alert" role="alert">{error}</div>}
  {notice&&<div className="cr-success" role="status">{notice}</div>}
  {!payload?<p className="cr-loading">Carregando dados protegidos…</p>:<>
   <div className="cr-selector"><div><label htmlFor="cr-campaign">Campanha em análise</label><select id="cr-campaign" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Escolha uma campanha</option>{payload.campaigns.map(c=><option value={c.id} key={c.id}>{c.business} · {c.title}</option>)}</select></div>
   <span className="cr-note">{campaign?campaign.status==='draft'?'Rascunho · sem monitoramento':'Ativa/encerrada · verifique as fontes':'Crie uma campanha para começar'}</span></div>
   {campaign&&m&&<><section className="cr-stats" aria-label="Resumo da campanha">
      <article><span>Contatos identificados</span><strong>{number(m.contacts)}</strong><small>Mensagens com código + registros manuais</small></article>
      <article><span>Orçamentos</span><strong>{number(m.quotes)}</strong><small>Confirmados pela equipe</small></article>
      <article><span>Vendas confirmadas</span><strong>{number(m.salesCount)}</strong><small>{number(m.buyers)} clientes identificados</small></article>
      <article className="cr-highlight"><span>Receita atribuída</span><strong>{brl(m.revenueCents)}</strong><small>Não é lucro, nem faturamento total da gráfica</small></article>
    </section>
    <div className="cr-visuals">
     <section className="cr-panel"><div className="cr-panel-head"><h2>Funil real</h2><span>Eventos verificados</span></div>
      <p className="cr-sub">Comparação de volumes. Uma mensagem não prova orçamento, e orçamento não prova venda.</p>
      {[['Contatos identificados',m.contacts,'contact'],['Orçamentos registrados',m.quotes,'quote'],['Vendas registradas',m.salesCount,'sale']].map(([name,value,key])=><div className="cr-funnel-row" key={String(key)}><div><span>{String(name)}</span><strong>{number(Number(value))}</strong></div><div className="cr-track"><div className={'cr-fill '+String(key)} style={{width:(m.contacts>0?Math.min(100,Number(value)/Math.max(1,m.contacts)*100):0)+'%'}}/></div></div>)}
      <div className="cr-rates"><p><b>{percent(m.quoteRate)}</b><span>contatos → orçamento</span></p><p><b>{percent(m.salesRate)}</b><span>orçamentos → compradores</span></p></div>
      <p className="cr-footnote">Taxas orientativas: bases só coincidem se a equipe registrar cada etapa para os mesmos clientes. Identificação manual sem referência pode contar uma pessoa mais de uma vez.</p>
     </section>
     <section className="cr-panel"><div className="cr-panel-head"><h2>Instagram · Reels</h2><span>{m.instagram?'Leitura da Meta':'Sem leitura'}</span></div>
      {m.instagram?<><div className="cr-instagrid">{([['Visualizações',m.instagram.views],['Alcance',m.instagram.reach],['Curtidas',m.instagram.likes],['Comentários',m.instagram.comments],['Salvos',m.instagram.saved],['Compartilhamentos',m.instagram.shares]] as const).map(([name,val])=><div key={name}><small>{name}</small><b>{val===undefined?'Indisponível':number(val)}</b></div>)}</div><p className="cr-footnote">Consulta em {shortDate(m.instagram.measuredAt)}. Métrica ausente significa API/permissão indisponível, não zero.</p></>:<div className="cr-empty">Os números aparecerão somente após vincular um Reels real e autorizar o acesso de leitura à Meta. Não usamos estimativas inventadas.</div>}
     </section>
    </div>
    <section className="cr-panel cr-action-panel"><div className="cr-panel-head"><h2>Registrar o que aconteceu</h2><span>Manual · confirmado</span></div>
     <p className="cr-sub">Alan pode passar os totais à equipe. Registre cada evento confirmado; não atribua uma compra ao vídeo sem evidência.</p>
     <div className="cr-form cr-event"><label>Etapa<select value={eventKind} onChange={e=>setEventKind(e.target.value as typeof eventKind)}><option value="contact">Cliente entrou em contato</option><option value="quote">Pediu orçamento</option><option value="sale">Comprou (venda confirmada)</option></select></label>
       {eventKind==='sale'&&<label>Valor da venda (R$)<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Ex.: 65,00"/></label>}
       <label>Identificador opcional da pessoa<input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Mesmo apelido nas etapas"/></label>
       <button disabled={busy} onClick={async()=>{
          const cents=Math.round(Number(amount.replace(/\./g,'').replace(',','.'))*100);
          const ok=await action({action:'event',campaignId:campaign.id,kind:eventKind,confirmed:true,amountCents:eventKind==='sale'?cents:0,customerReference:reference},stage(eventKind)+' registrado.');
          if(ok){setAmount('');setReference('');}
       }}>Registrar {stage(eventKind).toLowerCase()}</button>
     </div><p className="cr-footnote">O identificador enviado é transformado em código irreversível quando a chave de proteção está configurada. Evite incluir nomes completos. Nunca copie conversas privadas do cliente.</p>
    </section>
    <div className="cr-bottom">
    <section className="cr-panel"><div className="cr-panel-head"><h2>Configuração da campanha</h2><span>{campaign.code}</span></div>
      <p className="cr-sub">Ative só quando a Arte Print autorizar o acompanhamento e o material estiver publicado.</p>
      <div className="cr-form">
      <label>Situação<select value={campaign.status} onChange={e=>action({action:'update',campaignId:campaign.id,status:e.target.value,instagramMediaId:mediaId,adSpendCents:campaign.adSpendCents})} disabled={busy}><option value="draft">Rascunho</option><option value="active">Ativa</option><option value="finished">Encerrada</option></select></label>
      <label>ID do Reels publicado<input value={mediaId} onChange={e=>setMediaId(e.target.value)} placeholder="ID numérico da mídia"/></label>
      <label>Gasto de divulgação (R$)<input inputMode="decimal" value={spend} onChange={e=>setSpend(e.target.value)} placeholder="0,00"/></label>
      <button className="cr-btn-muted" disabled={busy} onClick={()=>action({action:'update',campaignId:campaign.id,status:campaign.status,instagramMediaId:mediaId,adSpendCents:Math.max(0,Math.round(Number(spend.replace(/\./g,'').replace(',','.'))*100))},'Configurações salvas.')}>Salvar identificação e gastos</button>
      <button disabled={busy||!payload.connections.instagram||!mediaId} onClick={sync}>Consultar métricas no Instagram</button>
      </div><p className="cr-footnote">Gastos só de divulgação informados. Receita − mídia não representa lucro: custos dos produtos e operação ficam fora deste cálculo.</p>
    </section>
    <section className="cr-panel"><div className="cr-panel-head"><h2>Conexões oficiais</h2><span>Somente leitura</span></div>
     <div className="cr-connection"><div><b>WhatsApp Business · Arte Print</b><small>Contatos com o código {campaign.code}</small></div><span className={payload.connections.whatsapp?'cr-ready':'cr-pending'}>{payload.connections.whatsapp?'Credenciais presentes':'Não configurado'}</span></div>
     <div className="cr-connection"><div><b>Instagram profissional · Arte Print</b><small>Reels e métricas autorizadas</small></div><span className={payload.connections.instagram?'cr-ready':'cr-pending'}>{payload.connections.instagram?'Credenciais presentes':'Não configurado'}</span></div>
     <p className="cr-sub">As contas pertencem à gráfica. Os proprietários devem conceder acesso pelo fluxo oficial da Meta. Tokens ficam somente no servidor, jamais na tela, e a existência das credenciais não garante entrega do webhook.</p>
     <div className="cr-memo"><b>Como identificar o resultado?</b><p>Divulgue o código <strong>{campaign.code}</strong> e um link oficial de WhatsApp com mensagem pronta, após autorização. A integração registra contatos identificados, mas não lê faturamento nem confirma vendas automaticamente.</p></div>
    </section>
    </div>
    <section className="cr-panel"><div className="cr-panel-head"><h2>Últimos registros</h2><span>Rastreabilidade</span></div>
      {events.length?<div className="cr-records">{events.map(e=><div key={e.id}><span>{stage(e.kind)}<small>{e.source==='meta_whatsapp'?'WhatsApp identificado':'Informado manualmente'} · {shortDate(e.occurredAt)}</small></span><b>{e.kind==='sale'?brl(e.amountCents):'Confirmado'}</b></div>)}</div>:<p className="cr-empty">Ainda não existem dados de campanha. Não confunda ausência de registros com baixo desempenho.</p>}
    </section>
    </>}
   <section className="cr-panel cr-setup"><div className="cr-panel-head"><h2>Nova campanha</h2><span>Comece pelo cliente</span></div>
      <div className="cr-form"><label>Empresa<input value={business} onChange={e=>setBusiness(e.target.value)} maxLength={140}/></label><label>Nome<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={140}/></label><label>Código da campanha<input value={code} onChange={e=>setCode(e.target.value)} maxLength={24}/></label><button disabled={busy} onClick={()=>action({action:'create',business,title,code},'Campanha criada como rascunho.')}>Criar campanha em rascunho</button></div>
      <p className="cr-footnote">A campanha criada aqui é um cadastro de trabalho, não uma publicação real ou conexão automática.</p>
   </section>
  </>}
 </div>;
}
