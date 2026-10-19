import {NextResponse} from 'next/server';
import {requireAuthenticated} from '@/lib/auth';
import {observationProject,pilotConnection} from '@/lib/devops-project-registry';
import {observeChefeBot} from '@/lib/devops-observer';
import {incidentStorageConfigured,listIncidentObservations,recordIncidentObservation} from '@/lib/devops-incidents';
import {readLimitedJson} from '@/lib/devops-json';
import {evaluateEvidenceReadiness,evaluateAuthenticatedReadiness} from '@/lib/devops-readiness';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
function failure(error:unknown){
 const code=error instanceof Error?error.message:'';
 if(code==='UNAUTHORIZED')return NextResponse.json({error:'Não autorizado.'},{status:401,headers});
 if(code==='DEVOPS_PAYLOAD_TOO_LARGE')return NextResponse.json({error:'Snapshot excede 32 KiB.'},{status:413,headers});
 if(['DEVOPS_PROJECT_DENIED','DEVOPS_ADAPTER_DENIED'].includes(code))
  return NextResponse.json({error:'Projeto não autorizado para este adaptador.'},{status:403,headers});
 if(['DEVOPS_ENVIRONMENT_INVALID','DEVOPS_SHA_INVALID','DEVOPS_SNAPSHOT_INVALID','DEVOPS_JSON_INVALID'].includes(code)||error instanceof SyntaxError)
  return NextResponse.json({error:'Snapshot ou metadados inválidos.'},{status:400,headers});
 if(code==='DEVOPS_JOURNAL_FULL')return NextResponse.json({error:'Limite do histórico atingido. Preservado integralmente; requer arquivamento revisado.'},{status:409,headers});
 return NextResponse.json({error:'Registro de evidências indisponível. Nenhum resultado foi confirmado.'},{status:503,headers});
}
export async function GET(req:Request){
 try{
  await requireAuthenticated();
  const project=observationProject(new URL(req.url).searchParams.get('project')||'chefebot');
  if(project.id!=='chefebot')throw new Error('DEVOPS_ADAPTER_DENIED');
  const storage=incidentStorageConfigured();
  const observations=storage?await listIncidentObservations(project.id):[];
  return NextResponse.json({project,connection:pilotConnection(),storageConfigured:storage,
   observations,
   readiness:evaluateEvidenceReadiness(observations),
   authenticatedReadiness:evaluateAuthenticatedReadiness(observations),
   lastAuthenticatedAt:observations.find(x=>x.evidence.source.kind==='service_authenticated')?.evidence.observedAt??null,
   historyOutcome:storage?'COMPROVADO':'NÃO EXECUTADO',executed:false,
  },{headers});
 }catch(error){return failure(error);}
}
export async function POST(req:Request){
 try{
  await requireAuthenticated();
  if(req.headers.get('origin')!==new URL(req.url).origin)
   return NextResponse.json({error:'Origem não autorizada.'},{status:403,headers});
  if(req.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
   return NextResponse.json({error:'Formato inválido.'},{status:415,headers});
  const input=await readLimitedJson(req.body,32*1024);
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('DEVOPS_JSON_INVALID');
  const body=input as Record<string,unknown>;
  if(body.action!=='import_snapshot')throw new Error('DEVOPS_JSON_INVALID');
  // Nenhum campo do cliente define origem autenticada, verificador, aprovação
  // ou comando. A importação nunca se torna prova operacional de produção.
  const evidence=observeChefeBot(body.snapshot,{
   projectId:body.projectId,environment:body.environment,reportedCodeSha:body.reportedCodeSha,
  });
  const result=await recordIncidentObservation(evidence);
  return NextResponse.json({...result,executed:false,productionWrites:false},{headers});
 }catch(error){return failure(error);}
}
