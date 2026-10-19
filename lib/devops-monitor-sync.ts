import {observeChefeBot,markAuthenticatedObservation} from './devops-observer';
import {recordIncidentObservation,listIncidentObservations} from './devops-incidents';
import {evaluateEvidenceReadiness} from './devops-readiness';
import {notifyOwnerReview} from './devops-push';

// Domínio fixo impede SSRF via configurações, query ou instruções de LLM.
// A credencial pertence SOMENTE ao monitor técnico de leitura do ChefeBot.
const ENDPOINT='https://chefedapizza.com.br/api/dev/observability/jornada';
export function monitorSyncConfigured(){
 return Boolean(process.env.JORNADA_CHEFEBOT_MONITOR_TOKEN &&
  process.env.JORNADA_CHEFEBOT_MONITOR_TOKEN.length>=32);
}
export async function syncChefeBotMonitor(){
 const secret=process.env.JORNADA_CHEFEBOT_MONITOR_TOKEN;
 if(!secret||secret.length<32)throw new Error('SYNC_NOT_CONFIGURED');
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),8000);
 let raw:unknown;
 try{
  const response=await fetch(ENDPOINT,{
   method:'GET',headers:{Authorization:'Bearer '+secret,Accept:'application/json'},
   cache:'no-store',signal:controller.signal,redirect:'error',
  });
  if(!response.ok)throw new Error('SYNC_REMOTE_HTTP_'+response.status);
  const bytes=await response.text();
  if(Buffer.byteLength(bytes)>32*1024)throw new Error('SYNC_TOO_LARGE');
  raw=JSON.parse(bytes);
 }finally{clearTimeout(timer);}
 const now=Date.now();
 const evidence=markAuthenticatedObservation(observeChefeBot(raw,{
  projectId:'chefebot',environment:'production'
 },now));
 const previous=await listIncidentObservations('chefebot');
 const oldReadiness=evaluateEvidenceReadiness(previous,now);
 const result=await recordIncidentObservation(evidence);
 const updated=await listIncidentObservations('chefebot');
 const readiness=evaluateEvidenceReadiness(updated,now);
 // Push opcional: alerta somente na transição para amostra suficiente.
 // Falha da Apple/Blob não altera o resultado da coleta ou os dados do ChefeBot.
 if(!oldReadiness.alert&&readiness.alert)await notifyOwnerReview().catch(()=>({sent:0}));
 return {
  status:'collected' as const,source:'service_authenticated' as const,
  recordedAt:evidence.receivedAt,reused:result.reused,
  readiness,justReachedThreshold:!oldReadiness.alert&&readiness.alert,
  incidentOutcome:'INCONCLUSIVO' as const,
 };
}
