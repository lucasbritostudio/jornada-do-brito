import {createHash} from 'node:crypto';
import {observationProject} from './devops-project-registry';

export type EvidenceOutcome='COMPROVADO'|'FALHOU'|'INCONCLUSIVO'|'NÃO EXECUTADO';
export type SignalQuality='valid'|'missing'|'invalid'|'unavailable';
export type EvidenceSignal={value:string|number|boolean|null;quality:SignalQuality};
export const SIGNALS=[
 'pending','inFlight','ambiguous','unresolved','queued','accepted','failed','recovered',
 'redis','evolution','qstash','workerAt','scheduleVerified','canaryState',
 'canaryAt','canaryOutbox','acceptedCounter',
] as const;
export type SignalName=typeof SIGNALS[number];
export type Observation={
 version:1;id:string;operationId:string;projectId:'chefebot';
 repository:'luk8nhassil-maker/-chefebot';environment:'production'|'preview'|'isolated';
 reportedCodeSha:string|null;verifiedCodeSha:null;
 observedAt:number|null;receivedAt:number;
 source:{kind:'owner_import';reference:'/api/dev/whatsapp/monitoramento'};
 correlation:{job:'unavailable';worker:'aggregate_only'};
 signals:Record<SignalName,EvidenceSignal>;
 contextDigest:string;
 verification:{outcome:'INCONCLUSIVO';reason:'source_not_authenticated';verifier:'deterministic-v3.1'};
};
type ObjectValue=Record<string,unknown>;
function object(value:unknown):ObjectValue{
 return value&&typeof value==='object'&&!Array.isArray(value)?value as ObjectValue:{};
}
function count(value:unknown):EvidenceSignal{
 if(value===null||value===undefined)return {value:null,quality:'missing'};
 return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0
  ?{value,quality:'valid'}:{value:null,quality:'invalid'};
}
function choice(value:unknown,allowed:readonly string[]):EvidenceSignal{
 if(value===null||value===undefined)return {value:null,quality:'missing'};
 return typeof value==='string'&&allowed.includes(value)
  ?{value,quality:'valid'}:{value:null,quality:'invalid'};
}
export function evidenceDigest(value:unknown){
 return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** Importação é dado declarado pelo proprietário, nunca atestado do servidor remoto.
 * Projeta apenas números/estados conhecidos. Texto, telefone, jobId, tokens,
 * URLs, comandos e campos de aprovação recebidos são descartados, não redigidos.
 */
export function observeChefeBot(input:unknown,metadata:{
 projectId:unknown;environment:unknown;reportedCodeSha?:unknown;
},now=Date.now()):Observation{
 const project=observationProject(metadata.projectId);
 if(project.id!=='chefebot')throw new Error('DEVOPS_ADAPTER_DENIED');
 if(!['production','preview','isolated'].includes(String(metadata.environment)))
  throw new Error('DEVOPS_ENVIRONMENT_INVALID');
 const sha=metadata.reportedCodeSha;
 if(sha!==undefined&&sha!==null&&sha!==''&&(typeof sha!=='string'||!/^[a-f0-9]{40}$/.test(sha)))
  throw new Error('DEVOPS_SHA_INVALID');
 const body=object(input);
 if(!Object.hasOwn(body,'checkedAt')||!Object.hasOwn(body,'metrics')||!Object.hasOwn(body,'health'))
  throw new Error('DEVOPS_SNAPSHOT_INVALID');
 const metrics=object(body.metrics),health=object(body.health);
 const diagnostics=object(body.diagnostics),canary=object(body.canary);
 const signals={} as Record<SignalName,EvidenceSignal>;
 for(const key of ['pending','inFlight','ambiguous','unresolved','queued','accepted','failed','recovered'] as const){
  signals[key]=body.metrics===null?{value:null,quality:'unavailable'}:count(metrics[key]);
 }
 signals.redis=choice(health.redis,['ok','down']);
 signals.evolution=choice(health.evolution,['connected','disconnected','unverified']);
 signals.qstash=choice(health.qstash,['configured_not_verified','missing_configuration']);
 signals.workerAt=count(health.lastSignedWorkerSuccessAt);
 signals.scheduleVerified=typeof health.qstashScheduleVerified==='boolean'
  ?{value:health.qstashScheduleVerified,quality:'valid'}
  :{value:null,quality:health.qstashScheduleVerified===undefined?'missing':'invalid'};
 signals.canaryState=choice(canary.state,[
  'created','outbound_sent','outbound_failed','inbound_received',
  'acknowledgement_sent','acknowledgement_failed','roundtrip_ok','expired',
 ]);
 signals.canaryAt=count(canary.testedAt);
 signals.canaryOutbox=choice(diagnostics.canaryOutbox,[
  'not_linked','job_missing','read_failed','invalid_state','pending','leased',
  'delivered','failed','ambiguous','suppressed','expired',
 ]);
 signals.acceptedCounter=choice(diagnostics.acceptedCounter,['not_recorded','read_failed','available']);
 const observedAt=count(body.checkedAt).value as number|null;
 const context={projectId:'chefebot',environment:metadata.environment,reportedCodeSha:sha||null,signals};
 const contextDigest=evidenceDigest(context);
 const id=evidenceDigest({contextDigest,observedAt});
 return {
  version:1,id,operationId:'observation_'+id.slice(0,24),projectId:'chefebot',
  repository:'luk8nhassil-maker/-chefebot',environment:metadata.environment as Observation['environment'],
  reportedCodeSha:typeof sha==='string'&&sha?sha:null,verifiedCodeSha:null,
  observedAt,receivedAt:now,source:{kind:'owner_import',reference:'/api/dev/whatsapp/monitoramento'},
  correlation:{job:'unavailable',worker:'aggregate_only'},signals,contextDigest,
  verification:{outcome:'INCONCLUSIVO',reason:'source_not_authenticated',verifier:'deterministic-v3.1'},
 };
}

/** Reconstrói também os registros lidos do Blob. Não devolver objetos brutos. */
export function validateStoredObservation(input:unknown):Observation{
 const value=object(input),s=object(value.signals);
 const at=(key:string)=>object(s[key]).value;
 const snapshot={checkedAt:value.observedAt,metrics:Object.fromEntries(
  ['pending','inFlight','ambiguous','unresolved','queued','accepted','failed','recovered'].map(k=>[k,at(k)])),
  health:{redis:at('redis'),evolution:at('evolution'),qstash:at('qstash'),
   lastSignedWorkerSuccessAt:at('workerAt'),qstashScheduleVerified:at('scheduleVerified')},
  canary:{state:at('canaryState'),testedAt:at('canaryAt')},
  diagnostics:{canaryOutbox:at('canaryOutbox'),acceptedCounter:at('acceptedCounter')},
 };
 // As qualidades missing/invalid/unavailable não podem ser recuperadas apenas
 // a partir de null. Valide cada sinal contra seu domínio, depois preserve-as.
 const restored=observeChefeBot(snapshot,{
  projectId:value.projectId,environment:value.environment,reportedCodeSha:value.reportedCodeSha,
 },typeof value.receivedAt==='number'?value.receivedAt:0);
 for(const key of SIGNALS){
  const signal=object(s[key]);
  if(!['valid','missing','invalid','unavailable'].includes(String(signal.quality))||
   (signal.quality==='valid'&&restored.signals[key].quality!=='valid')||
   (signal.quality!=='valid'&&signal.value!==null))throw new Error('DEVOPS_STORE_INVALID');
  restored.signals[key]={value:restored.signals[key].value,quality:signal.quality as SignalQuality};
 }
 restored.contextDigest=evidenceDigest({projectId:'chefebot',environment:restored.environment,
  reportedCodeSha:restored.reportedCodeSha,signals:restored.signals});
 restored.id=evidenceDigest({contextDigest:restored.contextDigest,observedAt:restored.observedAt});
 restored.operationId='observation_'+restored.id.slice(0,24);
 if(value.version!==1||value.id!==restored.id||value.contextDigest!==restored.contextDigest||
  value.verifiedCodeSha!==null||object(value.source).kind!=='owner_import'||
  value.repository!==restored.repository||!Number.isSafeInteger(value.receivedAt)||
  Number(value.receivedAt)<0)throw new Error('DEVOPS_STORE_INVALID');
 return restored;
}
