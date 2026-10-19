import assert from 'node:assert/strict';
import {test,mock,beforeEach,after} from 'node:test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {monitorFixture,NOW,SHA} from './devops-v3-fixtures';

const blobs=new Map<string,{content:string;etag:string}>();
let writes=0,reads=0,authenticated=true,readFailure=false,writeFailure=false,alwaysConflict=false;
let genericFailureAfterFirstWrite=false;
class BlobPreconditionFailedError extends Error{name='BlobPreconditionFailedError';}
class BlobAlreadyExistsError extends Error{name='BlobAlreadyExistsError';}
const originalToken=process.env.BLOB_READ_WRITE_TOKEN;
const originalFetch=globalThis.fetch;
mock.module('@vercel/blob',{namedExports:{
 get:async(path:string)=>{
  reads++;
  assert.ok(path.startsWith('jornada/devops-v3/chefebot/'));
  if(readFailure)throw new Error('synthetic-private-network-error');
  const current=blobs.get(path);
  return current?{statusCode:200,blob:{etag:current.etag},stream:new Response(current.content).body}:null;
 },
 put:async(path:string,content:string,options:{allowOverwrite:boolean;ifMatch?:string;access:string;addRandomSuffix:boolean})=>{
  assert.equal(options.access,'private');assert.equal(options.addRandomSuffix,false);
  assert.ok(path.startsWith('jornada/devops-v3/chefebot/'));
  if(writeFailure)throw new Error('synthetic-private-quota-error');
  if(alwaysConflict)throw new BlobPreconditionFailedError();
  const current=blobs.get(path);
  if(genericFailureAfterFirstWrite&&!current){
   genericFailureAfterFirstWrite=false;
   writes++;
   blobs.set(path,{content,etag:String(writes)});
   throw new Error('synthetic-provider-response-lost-after-create');
  }
  if(current&&!options.allowOverwrite)throw new BlobAlreadyExistsError();
  if(options.ifMatch&&options.ifMatch!==current?.etag)throw new BlobPreconditionFailedError();
  writes++;
  const etag=String(writes);blobs.set(path,{content,etag});return {etag};
 },
}});
mock.module(pathToFileURL(resolve(process.cwd(),'lib/auth.ts')).href,{namedExports:{
 requireAuthenticated:async()=>{if(!authenticated)throw new Error('UNAUTHORIZED');},
}});
const api=await import('../app/api/desenvolvimento/incidents/route');
const store=await import('../lib/devops-incidents');
const {observeChefeBot}=await import('../lib/devops-observer');
beforeEach(()=>{
 blobs.clear();writes=0;reads=0;authenticated=true;readFailure=false;writeFailure=false;alwaysConflict=false;
 genericFailureAfterFirstWrite=false;
 process.env.BLOB_READ_WRITE_TOKEN='synthetic-test-not-a-production-token';
 globalThis.fetch=async()=>{throw new Error('unexpected_external_request');};
});
after(()=>{
 globalThis.fetch=originalFetch;
 if(originalToken===undefined)delete process.env.BLOB_READ_WRITE_TOKEN;
 else process.env.BLOB_READ_WRITE_TOKEN=originalToken;
});
const url='https://localhost/api/desenvolvimento/incidents';
const request=(snapshot:unknown=monitorFixture(),extra:Record<string,unknown>={})=>new Request(url,{
 method:'POST',headers:{origin:'https://localhost','content-type':'application/json'},
 body:JSON.stringify({action:'import_snapshot',projectId:'chefebot',environment:'production',reportedCodeSha:SHA,snapshot,...extra}),
});
const evidence=(checkedAt=NOW,pending=0)=>observeChefeBot({...monitorFixture(),checkedAt,
 metrics:{...monitorFixture().metrics,pending}},
 {projectId:'chefebot',environment:'production',reportedCodeSha:SHA},checkedAt);

test('autenticação precede leitura/gravação e GET não cria arquivos',async()=>{
 authenticated=false;
 assert.equal((await api.GET(new Request(url))).status,401);
 assert.equal((await api.POST(request())).status,401);
 assert.equal(reads,0);assert.equal(writes,0);
 authenticated=true;
 const response=await api.GET(new Request(url));
 assert.equal(response.status,200);
 assert.match(response.headers.get('cache-control')||'',/private.*no-store/);
 assert.equal((await response.json()).observations.length,0);
 assert.equal(writes,0);
});
test('sem armazenamento: estado explícito e POST falha, sem fingir persistência',async()=>{
 delete process.env.BLOB_READ_WRITE_TOKEN;
 const data=await (await api.GET(new Request(url))).json();
 assert.equal(data.storageConfigured,false);assert.equal(data.historyOutcome,'NÃO EXECUTADO');
 assert.equal((await api.POST(request())).status,503);
 assert.equal(writes,0);assert.equal(reads,0);
});
test('CSRF, formato e projeto inválidos bloqueiam antes do Blob',async()=>{
 assert.equal((await api.POST(new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:'{}'}))).status,403);
 assert.equal((await api.POST(new Request(url,{method:'POST',headers:{origin:'https://evil.invalid','content-type':'application/json'},body:'{}'}))).status,403);
 assert.equal((await api.POST(new Request(url,{method:'POST',headers:{origin:'https://localhost','content-type':'text/plain'},body:'{}'}))).status,415);
 assert.equal((await api.POST(request(undefined,{projectId:'outro'}))).status,403);
 assert.equal((await api.GET(new Request(url+'?project=jornada'))).status,403);
 assert.equal((await api.POST(request(undefined,{action:'deploy'}))).status,400);
 assert.equal(writes,0);assert.equal(reads,0);
});
test('importação sanitizada é analisada, persistida e recuperada em leitura',async()=>{
 const fixture={...monitorFixture(),token:'fake-secret-not-for-storage',message:'dados privados',
  stages:[{passed:true}],productionApproval:true};
 const response=await api.POST(request(fixture,{source:{kind:'authenticated_connector'}}));
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.executed,false);assert.equal(data.productionWrites,false);
 assert.equal(data.investigation.operationalOutcome,'INCONCLUSIVO');
 assert.equal(data.evidence.source.kind,'owner_import');
 const history=await (await api.GET(new Request(url))).json();
 assert.equal(history.observations.length,1);
 assert.equal(history.connection.connected,false);
 assert.equal(history.observations[0].evidence.id,data.evidence.id);
 assert.equal(writes,1);
 for(const stored of blobs.values()){
  assert.ok(!stored.content.includes('fake-secret-not-for-storage'));
  assert.ok(!stored.content.includes('dados privados'));
  assert.ok(!stored.content.includes('passed'));
 }
});
test('100 imports idênticos concorrentes resultam em uma gravação e um registro',async()=>{
 const e=evidence();
 const results=await Promise.all(Array.from({length:100},()=>store.recordIncidentObservation(e)));
 assert.equal(results.filter(r=>!r.reused).length,1);
 assert.equal(writes,1);
 assert.equal((await store.listIncidentObservations('chefebot')).length,1);
});
test('orçamento isolado por ocorrência: três análises do canário A não bloqueiam B',async()=>{
 const make=(i:number,canaryAt:number,sha=SHA)=>{
  const base=monitorFixture();
  return observeChefeBot({...base,checkedAt:NOW+i*15*60000,
   canary:{...base.canary,testedAt:canaryAt},
   metrics:{...base.metrics,queued:base.metrics.queued+i}},
   {projectId:'chefebot',environment:'production',reportedCodeSha:sha},NOW+i*15*60000);
 };
 const a=NOW-86400000,b=NOW-72000000;
 for(let i=0;i<3;i++){
  const item=await store.recordIncidentObservation(make(i,a));
  assert.equal(item.decision,'new_evidence');
 }
 // SHA, contador e horário diferentes NÃO reiniciam o orçamento do mesmo canário.
 const blocked=await store.recordIncidentObservation(make(3,a,'a'.repeat(40)));
 assert.equal(blocked.decision,'hypothesis_budget');
 assert.equal(blocked.analysisOutcome,'NÃO EXECUTADO');
 const independent=await store.recordIncidentObservation(make(4,b));
 assert.equal(independent.decision,'new_evidence');
 assert.equal(independent.analysisOutcome,'INCONCLUSIVO');
 assert.equal((await store.listIncidentObservations('chefebot')).length,5);
});
test('registros legados sem occurrenceKey explícito continuam isolados pela evidência',async()=>{
 const first=evidence(NOW,0);
 await store.recordIncidentObservation(first);
 const [path,blob]=[...blobs.entries()][0];
 const saved=JSON.parse(blob.content);
 assert.equal(saved.version,1);
 assert.equal('occurrenceKey' in saved.entries[0],false);
 const newCanary=observeChefeBot({...monitorFixture(),checkedAt:NOW+1000,
  canary:{...monitorFixture().canary,testedAt:NOW-1000},
  metrics:{...monitorFixture().metrics,queued:9}},
  {projectId:'chefebot',environment:'production',reportedCodeSha:SHA},NOW+1000);
 const result=await store.recordIncidentObservation(newCanary);
 assert.equal(result.decision,'new_evidence');
 assert.equal((await store.listIncidentObservations('chefebot')).length,2);
 assert.ok(blobs.get(path));
});
test('perda de confirmação no primeiro put reconcilia registro sem duplicar',async()=>{
 genericFailureAfterFirstWrite=true;
 const result=await store.recordIncidentObservation(evidence());
 assert.equal(result.reused,true);
 assert.equal(result.evidence.verification.outcome,'INCONCLUSIVO');
 assert.equal(writes,1);
 assert.equal((await store.listIncidentObservations('chefebot')).length,1);
});
test('CAS preserva duas observações concorrentes diferentes, sem perder estado',async()=>{
 const results=await Promise.all([
  store.recordIncidentObservation(evidence(NOW,0)),
  store.recordIncidentObservation(evidence(NOW+1000,1)),
 ]);
 assert.equal(results.length,2);
 assert.equal((await store.listIncidentObservations('chefebot')).length,2);
 assert.equal(writes,2);
});
test('novo horário sem mudança não repete análise; cooldown mantém a nova evidência',async()=>{
 await store.recordIncidentObservation(evidence());
 const same=await store.recordIncidentObservation(evidence(NOW+1000));
 assert.equal(same.analysisOutcome,'NÃO EXECUTADO');
 assert.equal(same.decision,'no_new_evidence');
 const changed=await store.recordIncidentObservation(evidence(NOW+2000,1));
 assert.equal(changed.decision,'cooldown');
 assert.equal(changed.investigation,null);
 assert.equal((await store.listIncidentObservations('chefebot')).length,3);
});
test('requisições que chegam fora de ordem não descartam evidência nem simulam teste',async()=>{
 await store.recordIncidentObservation(evidence(NOW+2000,1));
 const earlier=await store.recordIncidentObservation(evidence(NOW,2));
 assert.equal(earlier.analysisOutcome,'NÃO EXECUTADO');
 assert.equal(earlier.decision,'cooldown');
 assert.equal((await store.listIncidentObservations('chefebot')).length,2);
});
test('falha de leitura ou escrita retorna erro explícito sem inicializar memória vazia',async()=>{
 readFailure=true;
 let response=await api.POST(request());
 assert.equal(response.status,503);assert.equal(writes,0);
 assert.ok(!(await response.text()).includes('synthetic-private'));
 readFailure=false;writeFailure=true;
 response=await api.POST(request());
 assert.equal(response.status,503);assert.equal(blobs.size,0);
});
test('conflitos persistentes são limitados, não produzem confirmação falsa',async()=>{
 alwaysConflict=true;
 await assert.rejects(()=>store.recordIncidentObservation(evidence()),/STORE_CONFLICT/);
 assert.equal(reads,3);assert.equal(writes,0);
});
test('arquivo adulterado falha em leitura; jamais devolve texto inserido no Blob',async()=>{
 await store.recordIncidentObservation(evidence());
 const [path,current]=[...blobs.entries()][0];
 const raw=JSON.parse(current.content);
 raw.entries[0].evidence.signals.canaryOutbox={value:'fake-sensitive-blob-text',quality:'valid'};
 blobs.set(path,{...current,content:JSON.stringify(raw)});
 const response=await api.GET(new Request(url));
 assert.equal(response.status,503);
 assert.ok(!(await response.text()).includes('fake-sensitive'));
 assert.equal(writes,1);
});
test('limite de 32 KiB é aplicado sem Content-Length e antes de persistir',async()=>{
 const response=await api.POST(request({...monitorFixture(),padding:'x'.repeat(33000)}));
 assert.equal(response.status,413);assert.equal(writes,0);
});
test('histórico cheio é preservado: nova entrada é recusada, sem limpeza silenciosa',async()=>{
 for(let i=0;i<128;i++)await store.recordIncidentObservation(evidence(NOW+i*1000));
 const original=[...blobs.values()][0].content;
 await assert.rejects(()=>store.recordIncidentObservation(evidence(NOW+128000)),/JOURNAL_FULL/);
 assert.equal((await store.listIncidentObservations('chefebot')).length,128);
 assert.equal([...blobs.values()][0].content,original);
 assert.equal(writes,128);
});

// Gatilho do painel não escreve nem executa teste real automaticamente.
test('GET mostra progresso e alerta técnico quando a janela importada atinge o mínimo',async()=>{
 const mk=(time:number)=>{
  const fixture=monitorFixture();
  return observeChefeBot({...fixture,checkedAt:time},
   {projectId:'chefebot',environment:'production',reportedCodeSha:SHA},time);
 };
 const base=Date.now()-12*60_000;
 for(const offset of [0,5*60_000,10*60_000])await store.recordIncidentObservation(mk(base+offset));
 const response=await api.GET(new Request(url));
 assert.equal(response.status,200);
 const body=await response.json();
 assert.equal(body.readiness.status,'review_ready');
 assert.equal(body.readiness.alert,true);
 assert.equal(body.readiness.observedSamples,3);
 assert.equal(body.readiness.operationalEvidence,'INCONCLUSIVO');
 assert.equal(body.readiness.realConnectorConnected,false);
 assert.equal(writes,3);
 await api.GET(new Request(url));
 assert.equal(writes,3);
});
