'use client';
import {useState} from 'react';
import type {Observation} from '@/lib/devops-observer';
import type {Investigation} from '@/lib/devops-investigator';

type RecordView={evidence:Observation;investigation:Investigation|null;analysisOutcome:string;decision:string};
type Result={storageConfigured:boolean;connection:{reason:string};observations:RecordView[]};
export default function IncidentEvidencePanel(){
 const [result,setResult]=useState<Result|null>(null);
 const [snapshot,setSnapshot]=useState('');
 const [sha,setSha]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 async function load(){
  const response=await fetch('/api/desenvolvimento/incidents?project=chefebot',{cache:'no-store'});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Não foi possível ler as evidências.');
  setResult(data as Result);
 }
 async function refresh(){
  setBusy(true);setError('');
  try{await load();}catch(e){setError(e instanceof Error?e.message:'Leitura indisponível.');}
  finally{setBusy(false);}
 }
 async function record(event:React.FormEvent){
  event.preventDefault();setBusy(true);setError('');
  try{
   const parsed=JSON.parse(snapshot);
   const response=await fetch('/api/desenvolvimento/incidents',{
    method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',
    body:JSON.stringify({action:'import_snapshot',projectId:'chefebot',environment:'production',
     reportedCodeSha:sha||null,snapshot:parsed}),
   });
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||'Não foi possível registrar.');
   setSnapshot('');await load();
  }catch(e){setError(e instanceof SyntaxError?'Cole um JSON válido do monitor.':e instanceof Error?e.message:'Registro indisponível.');}
  finally{setBusy(false);}
 }
 return <section className="dc-panel" style={{marginTop:24}}>
  <div className="dc-section-head"><div><span className="dc-label">IA DESENVOLVEDORA 3.0 · PILOTO CHEFEBOT</span>
   <h2>Incidentes e evidências</h2></div>
   <button type="button" className="dc-refresh" onClick={refresh} disabled={busy}>{busy?'Consultando…':'Consultar histórico'}</button>
  </div>
  <p>Analise um snapshot agregado do monitor e preserve as evidências entre sessões. A importação é declarada pelo proprietário; a origem e o funcionamento em produção continuam inconclusivos.</p>
  <p><strong>Conexão ao vivo: NÃO EXECUTADO.</strong> {result?.connection.reason||'Falta uma identidade exclusiva de leitura autorizada no ChefeBot.'}</p>
  {result&&!result.storageConfigured&&<p role="status">Histórico não conectado: falta o armazenamento privado da Jornada. Nenhum registro foi salvo.</p>}
  <form onSubmit={record} className="dc-plan-form">
   <label htmlFor="incident-sha">SHA declarado da versão observada (opcional)</label>
   <input id="incident-sha" value={sha} maxLength={40} pattern="[a-f0-9]{40}" onChange={e=>setSha(e.target.value)} placeholder="40 caracteres; será marcado como não verificado"/>
   <label htmlFor="incident-snapshot">JSON agregado do Centro de Monitoramento</label>
   <textarea id="incident-snapshot" rows={5} value={snapshot} maxLength={32000} onChange={e=>setSnapshot(e.target.value)}
    placeholder="Cole somente a resposta do monitor, sem cookies, tokens ou dados de clientes."/>
   <button type="submit" disabled={busy||!snapshot.trim()||result?.storageConfigured===false}>Registrar e analisar snapshot</button>
  </form>
  {error&&<p role="alert" className="dc-error">{error}</p>}
  {result&&result.observations.length>10&&<p>Exibindo as 10 observações mais recentes de {result.observations.length}. O histórico completo permanece preservado.</p>}
  {result?.observations.slice(0,10).map(record=><article key={record.evidence.id} className="dc-entry" style={{display:'block'}}>
   <strong>{record.analysisOutcome} · produção não aprovada</strong>
   <p>Observação: {record.evidence.observedAt?new Date(record.evidence.observedAt).toLocaleString('pt-BR'): 'Horário não informado'} · SHA {record.evidence.reportedCodeSha?.slice(0,12)||'ausente'} (não verificado).</p>
   <small>Operação {record.evidence.operationId} · fonte: importação do proprietário</small>
   {record.investigation?<>
    <p>Verificação do conteúdo importado:</p>
    <ul>{record.investigation.payloadChecks.map((check,i)=><li key={i}><strong>{check.component}: {check.outcome}</strong> — {check.reason}</li>)}</ul>
    {record.investigation.hypotheses.map(h=><p key={h.id}>Hipótese não comprovada: {h.statement}</p>)}
    <p>Próxima verificação ({record.investigation.nextVerification.outcome}): {record.investigation.nextVerification.description}</p>
   </>:<p>Análise não repetida: sem mudança relevante, em cooldown ou no limite de tentativas. A nova evidência permanece registrada.</p>}
   <small>Sem chamada de LLM, teste remoto, reenvio ou ação no ChefeBot.</small>
  </article>)}
  {result&&result.storageConfigured&&result.observations.length===0&&<p>Nenhuma evidência registrada. Isso não comprova ausência de incidentes.</p>}
 </section>;
}
