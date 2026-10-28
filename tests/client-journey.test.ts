import assert from 'node:assert/strict';
import {test,mock} from 'node:test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const moduleUrl=(file:string)=>pathToFileURL(resolve(process.cwd(),file)).href;
let state:any;let works:any[]=[];let authenticated=true;
mock.module(moduleUrl('lib/store.ts'),{namedExports:{
  getState:async()=>state,
  saveState:async(value:any)=>{state=value;return value;},
  audit:()=>{}
}});
mock.module(moduleUrl('lib/auth.ts'),{namedExports:{requireAuthenticated:async()=>{if(!authenticated)throw new Error('UNAUTHORIZED');}}});
mock.module(moduleUrl('lib/production-store.ts'),{namedExports:{
  changeProduction:async(fn:(data:any)=>unknown)=>{const data={works};const out=fn(data);works=data.works;return out;},
  readProduction:async()=>({works,payments:[]})
}});
const pub=await import('../app/api/public/catalog/route');
const admin=await import('../app/api/client-requests/route');
const portal=await import('../app/api/public/request-status/route');
function reset(){authenticated=true;works=[];state={profile:{displayName:'Brito'},serviceCatalog:[{id:'video-1',name:'Filme de marca',description:'Vídeo para sua marca.',priceCents:85000,deliveryMode:'video',published:true,portfolioImageUrl:'javascript:alert(1)'},{id:'hidden',name:'Oculto',description:'Não publicar.',priceCents:100,deliveryMode:'general',published:false}],contacts:[],opportunities:[],projects:[],tasks:[],clientRequests:[],receivables:[],audit:[]};}
async function send(route:any,path:string,body:any){const response=await route.POST(new Request(`https://local${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));return {status:response.status,data:await response.json()};}
const input={requestId:'request-id-000000000001',portalToken:'token-value-000000000000000001',serviceId:'video-1',name:'Ana Cliente',email:'ana@example.com',phone:'5511999999999',note:'Vídeo de apresentação',consent:true};

test('página pública lista só serviços publicados e URLs seguras',async()=>{
  reset();const response=await pub.GET();const data=await response.json();
  assert.equal(response.status,200);assert.equal(data.services.length,1);assert.equal(data.services[0].portfolioImageUrl,undefined);assert.equal(JSON.stringify(data).includes('ana@example.com'),false);
});

test('pedido cria prospecto privado e conversão liga cliente, projeto, produção e financeiro',async()=>{
  reset();const result=await send(pub,'/api/public/catalog',input);
  assert.equal(result.status,201);assert.equal(state.contacts.length,1);assert.equal(state.opportunities.length,1);assert.equal(state.clientRequests[0].status,'pending');assert.equal(state.receivables.length,0);
  const tracking=await send(portal,'/api/public/request-status',{token:input.portalToken});assert.equal(tracking.status,200);assert.equal(tracking.data.requestStatus,'Aguardando revisão');assert.equal(JSON.stringify(tracking.data).includes(input.email),false);
  const accepted=await send(admin,'/api/client-requests',{id:input.requestId,action:'accept'});
  assert.equal(accepted.status,200);assert.equal(state.contacts[0].lifecycle,'client');assert.equal(state.opportunities[0].stage,'won');assert.equal(state.projects.length,1);assert.equal(works.length,1);assert.equal(state.receivables.length,1);assert.equal(state.receivables[0].status,'pending');
  const repeated=await send(admin,'/api/client-requests',{id:input.requestId,action:'accept'});
  assert.equal(repeated.status,200);assert.equal(works.length,1);assert.equal(state.receivables.length,1);
});

test('serviço geral vira projeto e tarefa, sem entrar no relógio de vídeo',async()=>{
  reset();state.serviceCatalog[1].published=true;const general={...input,requestId:'request-id-general-000001',serviceId:'hidden',portalToken:'token-general-000000000000000001'};
  assert.equal((await send(pub,'/api/public/catalog',general)).status,201);
  assert.equal((await send(admin,'/api/client-requests',{id:general.requestId,action:'accept'})).status,200);
  assert.equal(works.length,0);assert.equal(state.tasks.length,1);assert.equal(state.projects.length,1);
});

test('bloqueia pedido sem consentimento, serviço oculto e leitura interna sem login',async()=>{
  reset();assert.equal((await send(pub,'/api/public/catalog',{...input,consent:false})).status,400);assert.equal((await send(pub,'/api/public/catalog',{...input,serviceId:'hidden'})).status,400);
  authenticated=false;assert.equal((await admin.GET()).status,401);assert.equal((await send(admin,'/api/client-requests',{id:input.requestId,action:'accept'})).status,401);
});
