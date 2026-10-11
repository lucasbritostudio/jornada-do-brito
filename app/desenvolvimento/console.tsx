'use client';
import {useCallback,useEffect,useState} from 'react';

type WorkflowRun={name:string;state:string;result:string|null;sha:string;url:string};
type Deployment={id:string;state:string;environment:string;url:string|null;createdAt:string|null};
type Connector={
  connected:boolean;status:'ok'|'not_connected'|'error';message?:string;
};
type Snapshot={
  mode:'read_only';repository:string;projectId:string;checkedAt:string;
  github:Connector&{branch:string;runs:WorkflowRun[]};
  vercel:Connector&{deployments:Deployment[]};
  capabilities:{diagnostics:boolean;edit:boolean;deploy:boolean;rollback:boolean};
  nextStep:string;
  githubInstallation?:{installed:boolean;privateKeyConfigured:boolean;effectiveAccess:string};
};
const date=(iso?:string|null)=>iso?new Intl.DateTimeFormat('pt-BR',{
  timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'short'
}).format(new Date(iso)):'—';
function outcome(value:string|null){
  return value==='success'?'Aprovado':value==='failure'?'Falhou':
    value==='cancelled'?'Cancelado':value==='timed_out'?'Esgotou tempo':
    value==='skipped'?'Não executado':value==='neutral'?'Neutro':'Em andamento';
}
export default function DevelopmentConsole(){
 const [data,setData]=useState<Snapshot|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [question,setQuestion]=useState('');
 const [answer,setAnswer]=useState('');
 const [asking,setAsking]=useState(false);
 const [planningGoal,setPlanningGoal]=useState('');
 const [planningFile,setPlanningFile]=useState('app/desenvolvimento/console.tsx');
 const [planningBusy,setPlanningBusy]=useState(false);
 const [planningResult,setPlanningResult]=useState('');
 const [planningSha,setPlanningSha]=useState('');
 const refresh=useCallback(async()=>{
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/desenvolvimento/status',{cache:'no-store'});
   if(response.status===401){window.location.href='/login';return;}
   if(!response.ok)throw new Error('Não consegui consultar a Central. Tente novamente.');
   setData(await response.json() as Snapshot);
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível consultar os serviços.');}
  finally{setBusy(false);}
 },[]);
 useEffect(()=>{refresh();},[refresh]);
 async function ask(e:React.FormEvent){
  e.preventDefault();if(asking||question.trim().length<3)return;
  setAsking(true);setAnswer('');setError('');
  try{
   const r=await fetch('/api/desenvolvimento/chat',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({message:question}),cache:'no-store'
   });
   const v=await r.json();
   if(!r.ok)throw new Error(v.error||'IA indisponível.');
   setAnswer(v.text);
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível analisar.');}
  finally{setAsking(false);}
 }
 async function planChange(e:React.FormEvent){
  e.preventDefault();if(planningBusy||planningGoal.trim().length<10)return;
  setPlanningBusy(true);setPlanningResult('');setPlanningSha('');setError('');
  try{
   const res=await fetch('/api/desenvolvimento/plan',{
    method:'POST',headers:{'Content-Type':'application/json'},
    cache:'no-store',body:JSON.stringify({file:planningFile,objective:planningGoal})
   });
   const json=await res.json();
   if(!res.ok)throw new Error(json.error||'Não consegui preparar o plano.');
   setPlanningResult(json.proposal+'\n\nPlano somente para revisão. Nenhum arquivo foi alterado ou publicado.');
   setPlanningSha(json.baseSha);
  }catch(e){setError(e instanceof Error?e.message:'Falha ao preparar o plano.');}
  finally{setPlanningBusy(false);}
 }
 const failures=data?.github.runs.filter(r=>r.result==='failure'||r.result==='timed_out')||[];
 const latest=data?.vercel.deployments[0];
 return <main className="dc-page">
  <header className="dc-head">
   <a href="/" className="dc-back">← Voltar à Jornada</a>
   <div className="dc-eyebrow">JORNADA DO BRITO / ENGENHARIA</div>
   <h1>Sua central de <span>desenvolvimento.</span></h1>
   <p>Encontre falhas, acompanhe código e publicações. A IA desenvolvedora será ativada por etapas, sem perder o controle da sua produção.</p>
  </header>
  <section className="dc-status-bar">
   <div><span className="dc-label">MODO ATUAL</span><strong>Somente leitura</strong><small>Nenhuma edição ou deploy pode ser disparado nesta versão</small></div>
   <button onClick={refresh} disabled={busy} className="dc-refresh">{busy?'Consultando…':'Atualizar diagnóstico'}</button>
  </section>
  <section className="dc-chat">
   <div><span className="dc-label">ASSISTENTE DE ENGENHARIA</span>
    <h2>Me conte o problema.</h2>
    <p>Eu analiso os resultados disponíveis e explico o que precisa ser investigado. Edição e deploy ainda não estão liberados.</p>
   </div>
   <form onSubmit={ask} className="dc-chat-form">
    <textarea rows={2} aria-label="Pergunta para IA Desenvolvedora"
     value={question} maxLength={700}
     placeholder="Ex.: Por que o último deploy não funcionou?"
     onChange={e=>{setQuestion(e.target.value);setAnswer('');}}/>
    <button type="submit" disabled={asking||question.trim().length<3}>
     {asking?'Analisando…':'Perguntar à IA'}
    </button>
   </form>
   {answer&&<p className="dc-answer" role="status">{answer}</p>}
   <small>A IA não publica nem altera código nesta etapa. Logs e informações sensíveis não são exibidos na conversa.</small>
  </section>
  <section className="dc-plan">
   <span className="dc-label">FASE 2 / LABORATÓRIO DE CÓDIGO</span>
   <h2>Planejar uma melhoria.</h2>
   <p>Peça uma mudança e eu consulto o arquivo real no GitHub para montar um plano. A edição e a publicação ainda exigem o executor e permissões adicionais.</p>
   <form onSubmit={planChange} className="dc-plan-form">
    <label htmlFor="dc-plan-file">Qual tela vamos melhorar?</label>
    <select id="dc-plan-file" value={planningFile} onChange={e=>{setPlanningFile(e.target.value);setPlanningResult('');}}>
     <option value="app/desenvolvimento/console.tsx">Central de Desenvolvimento</option>
     <option value="app/desenvolvimento/development.css">Visual da Central</option>
     <option value="app/producao/dashboard.tsx">Minha Produção</option>
     <option value="app/producao/production.css">Visual de Produção</option>
     <option value="app/globals.css">Visual geral do aplicativo</option>
    </select>
    <label htmlFor="dc-plan-goal">O que você quer mudar?</label>
    <textarea id="dc-plan-goal" rows={2} minLength={10} maxLength={650}
     placeholder="Ex.: Deixe os cartões da central mais simples no iPhone e mostre a falha mais importante primeiro."
     value={planningGoal} onChange={e=>{setPlanningGoal(e.target.value);setPlanningResult('');}}/>
    <button disabled={planningBusy||planningGoal.trim().length<10} type="submit">
      {planningBusy?'Lendo código e planejando…':'Analisar código e planejar'}
    </button>
   </form>
   {planningResult&&<div className="dc-proposal" role="status">
    <strong>Plano de alteração · aguardando executor</strong>
    <small>Versão do código: {planningSha.slice(0,12)}</small>
    <p>{planningResult}</p>
   </div>}
   <small>Acesso de leitura. Nenhum arquivo é modificado por este formulário.</small>
  </section>
  {error&&<p className="dc-error" role="alert">{error}</p>}
  {!data?<div className="dc-loading">Conferindo conexões…</div>:<>
   <div className="dc-overview">
    <article className="dc-metric">
     <span className="dc-label">GITHUB</span>
     <h2>{data.github.connected?'Conectado':data.githubInstallation?.installed?'App instalada':'Ainda sem conexão'}</h2>
     <p>{data.github.connected?'Conexão de leitura testada.':data.githubInstallation?.installed
      ?(data.githubInstallation.privateKeyConfigured?'Chave informada; falta testar a autenticação do aplicativo.':'Instalação confirmada. Falta configurar a chave privada no servidor e conectar o autenticador.')
      :(data.github.message||'Ainda não foi registrada a instalação da GitHub App.')}</p>
     <small>Repositório: {data.repository}</small>
    </article>
    <article className="dc-metric">
     <span className="dc-label">VERCEL</span>
     <h2>{data.vercel.connected?'Conectada':'Ainda sem conexão'}</h2>
     <p>{data.vercel.message||'Acesso de leitura autorizado ao projeto da Jornada.'}</p>
     <small>Projeto: jornada-do-brito</small>
    </article>
    <article className="dc-metric">
     <span className="dc-label">FALHAS NO HISTÓRICO DO CI</span>
     <h2>{data.github.connected?failures.length:'Não consultadas'}</h2>
     <p>{data.github.connected?'Inclui versões anteriores. Uma falha histórica não significa erro na versão publicada.':'Disponível após conectar leitura do GitHub.'}</p>
    </article>
   </div>
   <div className="dc-layout">
    <section className="dc-panel">
     <div className="dc-section-head"><div><span className="dc-label">QUALIDADE DO CÓDIGO</span><h2>Testes e correções</h2></div>
       <a href={'https://github.com/'+data.repository+'/actions'} target="_blank" rel="noopener noreferrer">Abrir GitHub ↗</a></div>
     {data.github.runs.length?
      <div className="dc-entries">{data.github.runs.map((r,i)=><div key={i} className="dc-entry">
       <div><strong>{r.name}</strong><small>Commit {r.sha||'não identificado'}</small></div>
       <div className="dc-entry-end">
        <span className={'dc-result '+(r.result==='failure'?'is-failed':r.result==='success'?'is-success':'')}>{outcome(r.result)}</span>
        {r.url&&<a href={r.url} target="_blank" rel="noopener noreferrer">Detalhes ↗</a>}
       </div>
      </div>)}</div>
      :<p className="dc-empty">Nenhum teste listado. {data.github.connected?'Ainda não houve resultados para mostrar.':'Conecte a leitura do GitHub para identificar falhas reais.'}</p>}
    </section>
    <section className="dc-panel">
     <div className="dc-section-head"><div><span className="dc-label">PUBLICAÇÃO</span><h2>Versões na Vercel</h2></div>
      <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer">Abrir Vercel ↗</a></div>
     {latest?<p className="dc-current">Última versão: <strong>{latest.state}</strong>. Ambiente: {latest.environment}.</p>:null}
     {data.vercel.deployments.length?<div className="dc-entries">
      {data.vercel.deployments.map(v=><div className="dc-entry" key={v.id}>
       <div><strong>{v.environment==='production'?'Produção':'Deploy'} · {v.state}</strong><small>{date(v.createdAt)} · {v.id.slice(0,18)}</small></div>
       <div className="dc-entry-end">{v.url&&<a href={v.url} target="_blank" rel="noopener noreferrer">Abrir ↗</a>}</div>
      </div>)}</div>:
      <p className="dc-empty">{data.vercel.connected?'Nenhuma versão retornada.':'Conecte a Vercel para acompanhar builds, erros e o estado das publicações.'}</p>}
    </section>
   </div>
   <section className="dc-next">
    <span className="dc-label">EVOLUÇÃO DA SUA IA</span>
    <h2>O que já está estruturado</h2>
    <div className="dc-timeline">
     <article><b>01</b><div><strong>Diagnóstico de código e deploy</strong><p>Central publicada e GitHub/Vercel conectados em leitura.</p></div></article>
     <article><b>02</b><div><strong>IA entende erros e propõe correções</strong><p>Leitura restrita de logs, hipóteses justificadas e revisão do código em diff.</p></div></article>
     <article><b>03</b><div><strong>IA prepara alterações sem quebrar o sistema</strong><p>Branch separada, pull request, testes automatizados e sua autorização.</p></div></article>
     <article><b>04</b><div><strong>Publicação protegida e reversão</strong><p>Segundo fator, SHA validado, confirmação antes de publicar, verificação pós-deploy e rollback.</p></div></article>
    </div>
   </section>
   <footer className="dc-footer">Última consulta: {date(data.checkedAt)} · Nenhum dado financeiro ou de cliente é enviado neste diagnóstico.</footer>
  </>}
 </main>;
}
