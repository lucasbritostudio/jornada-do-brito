'use client';
import {useEffect,useState} from 'react';
import type {EvidenceReadiness} from '@/lib/devops-readiness';
import type {Observation} from '@/lib/devops-observer';
import type {Investigation} from '@/lib/devops-investigator';

type RecordView={evidence:Observation;investigation:Investigation|null;analysisOutcome:string;decision:string};
type Result={storageConfigured:boolean;connection:{reason:string};observations:RecordView[];readiness:EvidenceReadiness;authenticatedReadiness:EvidenceReadiness};
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
 // Consultar uma vez ao entrar, sem polling, cron, chamadas LLM ou custo de Preview.
 useEffect(()=>{void refresh();},[]);
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
  <p><strong>Conexão técnica:</strong> {result?.readiness.realConnectorConnected?'já há pelo menos uma observação autenticada':'ainda não há observação autenticada guardada'}. {result?.connection.reason||'Aguardando identidade de serviço exclusiva para o ChefeBot.'}</p>
  <button type="button" className="dc-refresh" disabled={busy} onClick={async()=>{
   setBusy(true);setError('');
   try{
    const r=await fetch('/api/desenvolvimento/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    const data=await r.json();if(!r.ok)throw new Error(data.error||'Falha na coleta autenticada.');
    await load();
   }catch(e){setError(e instanceof Error?e.message:'Falha na coleta.');}
   finally{setBusy(false);}
  }}>Sincronizar ChefeBot em leitura</button>
  {result&&!result.storageConfigured&&<p role="status">Histórico não conectado: falta o armazenamento privado da Jornada. Nenhum registro foi salvo.</p>}
  {result?.storageConfigured&&<div role={result.authenticatedReadiness.alert?'alert':'status'} aria-live="polite" className="dc-entry" style={{display:'block',marginBottom:14}}>
   <strong>{result.authenticatedReadiness.alert?'Dados autenticados suficientes para revisão':'Coleta autenticada em andamento'}</strong>
   <p>{Math.min(result.authenticatedReadiness.observedSamples,result.authenticatedReadiness.requiredSamples)} de {result.authenticatedReadiness.requiredSamples} leituras autenticadas e independentes (intervalo mínimo de 5 minutos). Janela registrada: {Math.floor(result.authenticatedReadiness.observedSpanMs/60000)} minutos; mínimo: {Math.floor(result.authenticatedReadiness.requiredSpanMs/60000)}.</p>
   <p>As importações manuais ({result.readiness.observedSamples} leituras elegíveis no histórico) são mantidas para comparação, mas não contam neste limite autenticado.</p>
   {result.authenticatedReadiness.alert&&<p><strong>Aviso técnico:</strong> {result.authenticatedReadiness.isFresh?'a última amostra está recente.':'a última amostra está antiga.'} A análise operacional ainda é INCONCLUSIVA até provar a correlação do canário com a fila e o webhook.</p>}
  </div>}
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
   <small>Operação {record.evidence.operationId} · fonte: {record.evidence.source.kind==='service_authenticated'?'monitor técnico autenticado':'importação manual não autenticada'}</small>
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
