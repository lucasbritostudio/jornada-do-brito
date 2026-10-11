/**
 * API REAL de chat dev com GitHub/Vercel e LLM totalmente SIMULADOS.
 * Não lê contas, não executa ações, não testa modelos remotos.
 */
import assert from 'node:assert/strict';
import {mock,test} from 'node:test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const local=(p:string)=>pathToFileURL(resolve(p)).href;
let authenticated=true,connected=true,providerFail=false,modelCalls=0,snapshotCalls=0;
let recordedMessages:{role:string;content:string}[]=[];
const fakeRuns=[{name:'CI sintética',sha:'a'.repeat(40),state:'completed',result:'failure'}];
const deployments=[{id:'dpl-fixture-no-real-project',state:'READY',environment:'production',createdAt:0}];
mock.module(local('lib/auth.ts'),{namedExports:{
 requireAuthenticated:async()=>{if(!authenticated)throw new Error('UNAUTHORIZED');}
}});
mock.module(local('lib/devops-read.ts'),{namedExports:{
 getDevopsSnapshot:async()=>{
  snapshotCalls++;
  return {
   repository:'lucasbritostudio/jornada-do-brito',
   github:{connected,status:connected?'connected':'unconfigured',runs:connected?fakeRuns:[]},
   vercel:{connected,status:connected?'connected':'unconfigured',deployments:connected?deployments:[]},
   capabilities:{diagnostic:true,execution:false}
  };
 }
}});
mock.module(local('lib/llm.ts'),{namedExports:{
 generateWithFreeLlm:async(messages:{role:string;content:string}[])=>{
  modelCalls++;recordedMessages=messages;
  if(providerFail)throw new Error('test upstream outage');
  return {text:'Fato observado: há CI sintética com falha. Causa não comprovada.',
   provider:'groq'};
 }
}});
const {POST}=await import('../app/api/desenvolvimento/chat/route');
function reset(){authenticated=true;connected=true;providerFail=false;modelCalls=0;
 snapshotCalls=0;recordedMessages=[];}
function req(input:{origin?:string|null;body?:unknown;contentType?:string|null}={}){
 const headers:Record<string,string>={};
 const origin=input.origin===undefined?'https://jornada.test':input.origin;
 const type=input.contentType===undefined?'application/json':input.contentType;
 if(origin!==null)headers.origin=origin;
 if(type!==null)headers['content-type']=type;
 return new Request('https://jornada.test/api/desenvolvimento/chat',
  {method:'POST',headers,body:JSON.stringify(input.body===undefined?{message:'Qual é a evidência de erro?'}:input.body)});
}
async function send(input:Parameters<typeof req>[0]={}){
 const response=await POST(req(input));
 return {status:response.status,body:await response.json(),headers:response.headers};
}
test('chat G1 exige sessão autenticada antes de GitHub e LLM',async()=>{
 reset();authenticated=false;const r=await send();
 assert.equal(r.status,401);assert.equal(snapshotCalls,0);assert.equal(modelCalls,0);
});
test('chat G1 valida origem, formato e tamanho sem chamadas externas',async()=>{
 reset();
 assert.equal((await send({origin:null})).status,403);
 assert.equal((await send({origin:'https://wrong.example'})).status,403);
 assert.equal((await send({contentType:'text/plain'})).status,415);
 assert.equal((await send({body:{message:'oi'}})).status,400);
 assert.equal(snapshotCalls,0);assert.equal(modelCalls,0);
});
test('chat G1 bloqueia comando de deploy e não finge executá-lo',async()=>{
 reset();const r=await send({body:{message:'Execute o deploy na main agora'}});
 assert.equal(r.status,200);
 assert.equal(r.body.executed,false);
 assert.match(r.body.text,/não posso executar edições nem deploy/);
 assert.equal(snapshotCalls,0);assert.equal(modelCalls,0);
});
test('chat G1 sem conexões não inventa diagnóstico nem consome LLM',async()=>{
 reset();connected=false;const r=await send();
 assert.equal(r.status,200);
 assert.equal(r.body.executed,false);
 assert.equal(r.body.provider,'local');
 assert.match(r.body.text,/não tenho evidências de erros atuais/i);
 assert.equal(snapshotCalls,1);assert.equal(modelCalls,0);
});
test('chat G1 conectado usa uma LLM e separa análise de execução',async()=>{
 reset();const r=await send();
 assert.equal(r.status,200);
 assert.equal(r.body.provider,'groq');assert.equal(r.body.executed,false);
 assert.match(r.body.text,/Somente análise/);
 assert.equal(snapshotCalls,1);assert.equal(modelCalls,1);
 assert.equal(recordedMessages[1].role,'user');
 assert.match(recordedMessages[0].content,/DIAGNÓSTICO SOMENTE LEITURA/);
 assert.equal(r.headers.get('cache-control'),'private, no-store');
});
test('chat G1 falha do provedor retorna fonte consultada sem declarar correção',async()=>{
 reset();providerFail=true;const r=await send();
 assert.equal(r.status,200);assert.equal(r.body.executed,false);
 assert.equal(r.body.provider,'local');
 assert.match(r.body.text,/IA externa não respondeu/);
 assert.match(r.body.text,/CI sintética/);
 assert.match(r.body.text,/Nenhuma alteração foi executada/);
 assert.equal(modelCalls,1);
});
test('chat G1 não ecoa excesso de texto do provedor e não permite execução',async()=>{
 reset();
 const r=await send({body:{message:'Analise a falha atual com evidências disponíveis.'}});
 assert.equal(r.body.executed,false);
 assert.equal(r.status,200);
 assert.ok(r.body.text.length<=2500);
});
