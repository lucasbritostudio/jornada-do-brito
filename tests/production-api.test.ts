import * as realBlobSdk from '@vercel/blob';
import assert from 'node:assert/strict';
import {test, mock} from 'node:test';
import {resolve as resolvePath} from 'node:path';
import {pathToFileURL} from 'node:url';

const localModule=(path:string)=>pathToFileURL(resolvePath(process.cwd(),path)).href;
const blobs=new Map<string,string>();
const etags=new Map<string,string>();
let writeCount=0;
let authenticated=true;
let financeState:any;
class BlobPreconditionFailedError extends Error {
  name='BlobPreconditionFailedError';
}
class BlobAlreadyExistsError extends Error {
  name='BlobAlreadyExistsError';
}
mock.module('@vercel/blob',{namedExports:{
 ...realBlobSdk,
  head:async(path:string)=>{if(!etags.has(path))throw new realBlobSdk.BlobNotFoundError();return {etag:etags.get(path)};},
  list:async()=>({blobs:[]}),
  get:async(path:string)=>{
    const content=blobs.get(path);
    if(content===undefined)return null;
    return {statusCode:200,stream:new Response(content).body,blob:{etag:`delivery-${etags.get(path)}`}};
  },
  put:async(path:string,content:string,opts:{allowOverwrite?:boolean;ifMatch?:string}={})=>{
    const current=etags.get(path);
    if(opts.ifMatch&&opts.ifMatch!==current)
      throw new BlobPreconditionFailedError('synthetic concurrent write');
    if(!opts.allowOverwrite&&current)
      throw new BlobAlreadyExistsError('synthetic duplicate initialization');
    writeCount++;
    const version=String(writeCount);
    blobs.set(path,content);
    etags.set(path,version);
    return {etag:version};
  }
}});
mock.module(localModule('lib/store.ts'),{namedExports:{
  getState:async()=>financeState,
  saveState:async(state:any)=>{financeState=state;return state;},
  audit:()=>{}
}});
mock.module(localModule('lib/auth.ts'),{namedExports:{
  requireAuthenticated:async()=>{
    if(!authenticated)throw new Error('UNAUTHORIZED');
  }
}});
const api=await import('../app/api/production/route');
const store=await import('../lib/production-store');

function reset(){
  blobs.clear();etags.clear();writeCount=0;authenticated=true;
  financeState={financialAccounts:[{id:'bank-1',name:'Conta principal',type:'bank',openingBalanceCents:100000,currentBalanceCents:100000,active:true}],transactions:[],audit:[]};
}
async function post(body:Record<string,unknown>){
  const response=await api.POST(new Request('https://localhost/api/production',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)
  }));
  return {status:response.status,result:await response.json()};
}
const workId='synthetic-video-001';
test('API protegida; GET vazio não escreve nem acessa outro estado',async()=>{
  reset();authenticated=false;
  assert.equal((await api.GET()).status,401);
  assert.equal((await post({action:'create',operationId:workId,
    clientName:'Cliente fictício',title:'Vídeo teste'})).status,401);
  authenticated=true;
  const response=await api.GET();
  assert.equal(response.status,200);
  assert.equal((await response.json()).works.length,0);
  assert.equal(blobs.size,0);
});
test('criação idempotente, agendamento, captação e prazo real em Fortaleza',async()=>{
  reset();
  const create={action:'create',operationId:workId,
    clientName:'Cliente fictício',title:'Vídeo teste',agreedFeeCents:20000};
  assert.equal((await post(create)).status,200);
  assert.equal((await post(create)).status,200);
  assert.equal((await store.readProduction()).works.length,1);
  assert.equal((await post({action:'stage',workId,stage:'scheduled'})).status,400);
  assert.equal((await post({action:'update',workId,
    scheduledAt:'2026-10-09T15:00:00.000Z'})).status,200);
  assert.equal((await post({action:'stage',workId,stage:'scheduled'})).status,200);
  assert.equal((await post({action:'stage',workId,stage:'review'})).status,400);
  assert.equal((await post({action:'stage',workId,stage:'captured',
    capturedAt:'2026-10-09T17:20:00.000Z'})).status,200);
  const state=await (await api.GET()).json();
  assert.equal(state.works[0].clock.startedAt,'2026-10-10T03:00:00.000Z');
  assert.equal(state.works[0].clock.dueAt,'2026-10-13T03:00:00.000Z');
  assert.deepEqual([...blobs.keys()],['jornada/production-v1.json']);
});
test('envio à avaliação preservado; pagamento não duplica e não ultrapassa contrato',async()=>{
  reset();
  assert.equal((await post({action:'create',operationId:workId,
    clientName:'Cliente fictício',title:'Vídeo teste',agreedFeeCents:20000})).status,200);
  for(const stage of ['captured','editing','review'] as const)
    assert.equal((await post({action:'stage',workId,stage})).status,200);
  const first=(await store.readProduction()).works[0].firstReviewSentAt;
  for(const stage of ['changes_requested','editing','review'] as const)
    assert.equal((await post({action:'stage',workId,stage})).status,200);
  assert.equal((await store.readProduction()).works[0].firstReviewSentAt,first);
  const pay={action:'payment',workId,operationId:'payment-synthetic-01',
    amountCents:5000,accountId:'bank-1',confirmed:true};
  assert.equal((await post(pay)).status,200);
  assert.equal((await post(pay)).status,200);
  assert.equal((await store.readProduction()).payments.length,1);
  assert.equal(financeState.transactions.length,1);
  assert.equal(financeState.transactions[0].amountCents,5000);
  assert.equal(financeState.financialAccounts[0].currentBalanceCents,105000);
  assert.equal((await post(pay)).status,200);
  assert.equal(financeState.transactions.length,1);
  assert.equal(financeState.financialAccounts[0].currentBalanceCents,105000);
  assert.equal((await post({...pay,operationId:'payment-synthetic-02',amountCents:16000})).status,400);
  assert.equal((await post({...pay,operationId:'payment-synthetic-03',amountCents:15000})).status,200);
  assert.equal((await (await api.GET()).json()).works[0].payment.remainingCents,0);
  assert.equal((await post({action:'stage',workId,stage:'approved'})).status,200);
  assert.equal((await post({action:'stage',workId,stage:'delivered'})).status,200);
  assert.equal((await post({action:'stage',workId,stage:'editing'})).status,400);
});
test('duas atualizações simultâneas não apagam os campos uma da outra',async()=>{
  reset();
  assert.equal((await post({action:'create',operationId:workId,
    clientName:'Cliente fictício',title:'Vídeo teste'})).status,200);
  const results=await Promise.all([
    post({action:'update',workId,notes:'Observação A'}),
    post({action:'update',workId,title:'Título B'})
  ]);
  assert.ok(results.every(r=>r.status===200));
  const work=(await store.readProduction()).works[0];
  assert.equal(work.notes,'Observação A');
  assert.equal(work.title,'Título B');
  assert.deepEqual([...blobs.keys()],['jornada/production-v1.json']);
});
