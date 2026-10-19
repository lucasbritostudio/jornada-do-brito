import {evidenceDigest,type Observation,type EvidenceOutcome,type SignalName} from './devops-observer';

export type PipelineCheck={
 component:'canary'|'outbox'|'redis'|'qstash'|'evolution'|'webhook'|'metrics'|'release';
 outcome:EvidenceOutcome;reason:string;
};
export type Investigation={
 id:string;projectId:'chefebot';environment:Observation['environment'];
 operationalOutcome:'INCONCLUSIVO';payloadChecks:PipelineCheck[];
 hypotheses:Array<{id:string;statement:string;outcome:'NÃO EXECUTADO'}>;
 nextVerification:{id:string;description:string;outcome:'NÃO EXECUTADO';requiresNewEvidence:true};
 productionApproval:false;llmCalls:0;llmCost:0;
};

/** Verificação independente da LLM. Os resultados são sobre o snapshot
 * importado; autenticação, SHA e correlação operacional não são presumidos.
 */
export function investigateObservation(e:Observation,now=Date.now()):Investigation{
 const checks:PipelineCheck[]=[];
 const add=(component:PipelineCheck['component'],outcome:EvidenceOutcome,reason:string)=>checks.push({component,outcome,reason});
 const val=(key:SignalName)=>e.signals[key].quality==='valid'?e.signals[key].value:null;
 const known=(component:PipelineCheck['component'],key:SignalName,good:unknown,bad?:unknown)=>{
  const value=val(key);
  add(component,value===good?'COMPROVADO':value!==null&&value===bad?'FALHOU':'INCONCLUSIVO',
   value===good?'Estado informado no snapshot; não autentica a origem.':
    value===bad&&bad!==undefined?'Estado negativo informado no snapshot.':'Evidência ausente, inválida ou leitura não comprovada.');
 };
 known('redis','redis','ok','down');
 known('evolution','evolution','connected','disconnected');
 const canaryState=val('canaryState');
 add('canary',canaryState==='roundtrip_ok'?'COMPROVADO':
  ['outbound_failed','acknowledgement_failed'].includes(String(canaryState))?'FALHOU':'INCONCLUSIVO',
  'Estado do teste informado no snapshot; teste histórico não comprova execução após a correção.');
 const job=val('canaryOutbox');
 add('outbox',job==='delivered'?'COMPROVADO':['failed','ambiguous','invalid_state'].includes(String(job))?'FALHOU':'INCONCLUSIVO',
  job==='delivered'?'Snapshot informa job do canário aceito pela Evolution; não prova entrega no aparelho.':
   job==='not_linked'?'Canário sem vínculo com outbox; roundtrip isolado pode ter usado outro caminho.':
   job==='read_failed'?'Leitura do job falhou; não é prova de falha no envio.':
   'Falta confirmação confiável do job do canário; não reenviar resultados incertos.');
 const accepted=val('accepted'),counter=val('acceptedCounter');
 add('metrics',typeof accepted==='number'&&accepted>0&&counter==='available'?'COMPROVADO':'INCONCLUSIVO',
  counter==='read_failed'?'Leitura do contador indisponível; preservar outras evidências.':
   accepted===null?'Contador ausente/ilegível não equivale a zero nem a falha de envio.':
   accepted===0?'Contador informado igual a zero; não comprova aceitação do canário.':
   'Contador agregado não correlaciona sozinho um envio específico.');
 const quarantined=val('ambiguous'),unresolved=val('unresolved');
 add('outbox',typeof quarantined==='number'&&typeof unresolved==='number'
  ?quarantined+unresolved>0?'FALHOU':'COMPROVADO':'INCONCLUSIVO',
  'Quarentena e inconsistências são estados explícitos; fila vazia não comprova entrega.');
 const workerAt=val('workerAt');
 add('qstash',typeof workerAt==='number'&&workerAt<=now&&now-workerAt<=15*60_000?'COMPROVADO':'INCONCLUSIVO',
  'Callback recente informado não comprova que a agenda persistente está ativa.');
 known('qstash','scheduleVerified',true);
 add('webhook','INCONCLUSIVO','Monitor agregado não fornece a correlação individual canário → webhook → confirmação.');
 add('release','INCONCLUSIVO','Importação não autentica o deployment nem o SHA declarado. READY não comprova o fluxo.');
 const current=e.observedAt!==null&&e.observedAt<=now+60_000&&now-e.observedAt<=10*60_000;
 if(!current)add('release','INCONCLUSIVO','Snapshot sem horário válido, futuro ou antigo; obter leitura atual autorizada.');
 const badSignal=Object.values(e.signals).some(s=>s.quality==='invalid');
 const next=badSignal?{id:'validate_monitor_contract',description:'Conferir o contrato do monitor: há campos inválidos. Não reinterpretar booleanos ou texto como contadores.'}:
  !current?{id:'collect_current_snapshot',description:'Obter snapshot atual autenticado somente leitura, sem iniciar um novo canário.'}:
  job==='not_linked'?{id:'correlate_existing_canary',description:'Consultar em leitura o canário e seu vínculo existente à outbox. Reutilizar #504; não reabrir o bug de DDI sem evidência nova.'}:
  {id:'authorize_read_connector',description:'Autorizar identidade de serviço restrita à leitura do monitor e comprovar SHA/correlação antes de validar produção.'};
 return {
  id:evidenceDigest({project:e.projectId,environment:e.environment,category:'whatsapp-pipeline-v3'}),
  projectId:e.projectId,environment:e.environment,operationalOutcome:'INCONCLUSIVO',payloadChecks:checks,
  hypotheses:job==='not_linked'?[{
   id:'historical_unlinked_canary',statement:'O snapshot pode referir-se ao canário histórico anterior à correção #503/#504. Confirmar datas e vínculo; isto não prova regressão atual.',outcome:'NÃO EXECUTADO',
  }]:[],
  nextVerification:{...next,outcome:'NÃO EXECUTADO',requiresNewEvidence:true},
  productionApproval:false,llmCalls:0,llmCost:0,
 };
}
