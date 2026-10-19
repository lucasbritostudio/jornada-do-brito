import {get,put} from '@vercel/blob';
import {isBlobConflict} from './blob-conflict';
import {observationProject} from './devops-project-registry';
import {validateStoredObservation,type Observation} from './devops-observer';
import {investigateObservation,type Investigation} from './devops-investigator';
import {decideInvestigationAttempt,type InvestigationAttempt,type AttemptDecision} from './devops-attempts';
import {readLimitedJson} from './devops-json';

type Entry={evidence:Observation;analyzedAt:number|null;decision:AttemptDecision['reason']};
type Journal={version:1;projectId:'chefebot';entries:Entry[]};
type ReadJournal={journal:Journal;etag:string|null};
const MAX_ENTRIES=128,MAX_BYTES=1024*1024;
const HYPOTHESIS='inspect_whatsapp_snapshot';
const PATH='jornada/devops-v3/chefebot/observations.json';

export function incidentStorageConfigured(){return Boolean(process.env.BLOB_READ_WRITE_TOKEN);}
function requireStore(){
 if(!incidentStorageConfigured())throw new Error('DEVOPS_STORAGE_NOT_CONFIGURED');
}
function checkProject(projectId:unknown){
 if(observationProject(projectId).id!=='chefebot')throw new Error('DEVOPS_ADAPTER_DENIED');
}
/** Orçamento pertence à ocorrência do canário, nunca à coleção inteira.
 * checkedAt, SHA e contadores podem mudar sem criar uma ocorrência diferente.
 * Registros V1 já persistidos são agrupados pelo mesmo cálculo; não migrar dados.
 */
function occurrenceKey(evidence:Observation):string{
 const time=evidence.signals.canaryAt;
 const occurrence=time.quality==='valid'&&typeof time.value==='number'
  ?'canary_'+time.value:'canary_unavailable';
 return evidence.projectId+':'+evidence.environment+':'+occurrence;
}
function priorAttempts(journal:Journal,evidence:Observation):InvestigationAttempt[]{
 const key=occurrenceKey(evidence);
 return journal.entries.filter(e=>e.analyzedAt!==null&&occurrenceKey(e.evidence)===key)
  .map(e=>({hypothesisId:HYPOTHESIS,contextDigest:e.evidence.contextDigest,
   at:e.analyzedAt!,outcome:'INCONCLUSIVO'}));
}
async function readJournal():Promise<ReadJournal>{
 requireStore();
 const result=await get(PATH,{access:'private',useCache:false});
 if(!result)return {journal:{version:1,projectId:'chefebot',entries:[]},etag:null};
 if(!result.blob?.etag)throw new Error('DEVOPS_STORE_ETAG_MISSING');
 const raw=await readLimitedJson(result.stream,MAX_BYTES) as Partial<Journal>;
 if(!raw||raw.version!==1||raw.projectId!=='chefebot'||!Array.isArray(raw.entries)||raw.entries.length>MAX_ENTRIES)
  throw new Error('DEVOPS_STORE_INVALID');
 const seen=new Set<string>();
 const entries=raw.entries.map(input=>{
  if(!input||typeof input!=='object')throw new Error('DEVOPS_STORE_INVALID');
  const evidence=validateStoredObservation(input.evidence);
  if(seen.has(evidence.id)||
   (input.analyzedAt!==null&&(!Number.isSafeInteger(input.analyzedAt)||input.analyzedAt<evidence.receivedAt))||
   !['new_evidence','reuse_verified_result','no_new_evidence','cooldown','incident_budget','hypothesis_budget'].includes(input.decision))
   throw new Error('DEVOPS_STORE_INVALID');
  seen.add(evidence.id);
  return {evidence,analyzedAt:input.analyzedAt,decision:input.decision};
 });
 return {journal:{version:1,projectId:'chefebot',entries},etag:result.blob.etag};
}
function present(entry:Entry){
 const investigation:Investigation|null=entry.analyzedAt===null?null:investigateObservation(entry.evidence,entry.analyzedAt);
 return {evidence:entry.evidence,investigation,analysisOutcome:investigation?'INCONCLUSIVO' as const:'NÃO EXECUTADO' as const,
  decision:entry.decision};
}
export async function listIncidentObservations(projectId:unknown){
 checkProject(projectId);
 const {journal}=await readJournal();
 return journal.entries.map(present).reverse();
}

/** CAS sobre namespace DevOps privado separado; nunca escreve em state.json,
 * produção, memória conversacional ou no projeto observado. Sem fila/timers.
 * Repetição do mesmo registro não faz nova gravação nem nova tentativa.
 */
export async function recordIncidentObservation(input:Observation){
 const evidence=validateStoredObservation(input);
 checkProject(evidence.projectId);
 for(let retry=0;retry<3;retry++){
  const {journal,etag}=await readJournal();
  const duplicate=journal.entries.find(e=>e.evidence.id===evidence.id);
  if(duplicate)return {...present(duplicate),reused:true};
  if(journal.entries.length>=MAX_ENTRIES)throw new Error('DEVOPS_JOURNAL_FULL');
  // Requisições concorrentes podem chegar ao CAS fora da ordem de recebimento.
  // O relógio de análise usa o maior instante conhecido, sem alterar a evidência.
  const previous=priorAttempts(journal,evidence);
  const analyzedAt=Math.max(evidence.receivedAt,...previous.map(a=>a.at));
  const decision=decideInvestigationAttempt(previous,HYPOTHESIS,evidence.contextDigest,analyzedAt);
  const entry:Entry={evidence,analyzedAt:decision.allowed?analyzedAt:null,decision:decision.reason};
  const updated:Journal={...journal,entries:[...journal.entries,entry]};
  const serialized=JSON.stringify(updated);
  if(Buffer.byteLength(serialized)>MAX_BYTES)throw new Error('DEVOPS_JOURNAL_FULL');
  try{
   await put(PATH,serialized,{
    access:'private',addRandomSuffix:false,contentType:'application/json',
    allowOverwrite:etag!==null,...(etag?{ifMatch:etag}:{}),
   });
   return {...present(entry),reused:false};
  }catch(error){
   if(isBlobConflict(error))continue;
   // No primeiro put o SDK pode devolver erro genérico DEPOIS de outra
   // instância criar o Blob. Apenas nessa situação, releia o journal para
   // distinguir a disputa de um erro real. Nunca trate erro como sucesso.
   if(etag===null){
    const after=await readJournal().catch(()=>null);
    if(after?.etag!==null&&after?.etag!==undefined)continue;
   }
   throw error;
  }
 }
 throw new Error('DEVOPS_STORE_CONFLICT');
}
