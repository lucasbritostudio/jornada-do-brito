/**
 * Integração da ROTA REAL de planejamento com Auth, GitHub e LLM simulados.
 * Não solicita sessão real, não lê credenciais e não faz HTTP externo.
 * Os testes demonstram a política de fallback e status, não o raciocínio
 * de um provedor de IA ao vivo.
 */
import assert from 'node:assert/strict';
import {mock,test} from 'node:test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {selectLabEvidence} from '../lib/devops-lab-v2';

const local=(path:string)=>pathToFileURL(resolve(path)).href;
const file='app/desenvolvimento/console.tsx',sha='f'.repeat(40);
let authenticated=true,readFails=false,providerMode='approved';
let reads=0,modelCalls=0;
const evidence=selectLabEvidence('const ready = true;\nconst awaiting = false;', 'ready',1800);
const prepared={...evidence,staticFacts:[],refSha:sha,totalLines:2};
class FakeLlmProviderError extends Error{
 status?:number;
 constructor(status:number){super('synthetic provider error');this.status=status;}
}
mock.module(local('lib/auth.ts'),{namedExports:{
 requireAuthenticated:async()=>{if(!authenticated)throw new Error('UNAUTHORIZED');}
}});
mock.module(local('lib/devops-planning.ts'),{namedExports:{
 allowedPlanningPath:(path:string)=>path===file,
 validPlanningObjective:(objective:unknown)=>typeof objective==='string'&&objective.length>=10&&objective.length<=650,
 relatedPlanningPath:()=>null,
 readPlanningSource:async()=>{
  reads++;
  if(readFails)throw new Error('DEVOPS_GITHUB_READ_FAILED');
  return prepared;
 }
}});
mock.module(local('lib/llm.ts'),{namedExports:{
 LlmProviderError:FakeLlmProviderError,
 generateWithFreeLlm:async()=>{
  modelCalls++;
  if(providerMode==='429'||providerMode==='504'||providerMode==='500')
   throw new FakeLlmProviderError(Number(providerMode));
  if(providerMode==='invalid_json')return {text:'NAO JSON',provider:'groq'};
  if(providerMode==='invalid_quote')return {text:JSON.stringify({
   findings:[{file,line:1,quote:'const ready = false;',
    interpretation:'ready inicia com false'}],
   uncertain:[],risks:[],suggestion:'Revisar teste.',test:'Teste sintético.'
  }),provider:'groq'};
  return {text:JSON.stringify({
   findings:[{file,line:1,quote:'const ready = true;',
    interpretation:'A declaração atribui true à variável ready.'}],
   uncertain:[],risks:[],suggestion:'Nenhuma alteração justificada.',
   test:'Confirmar a inicialização em teste isolado.'
  }),provider:'groq',usage:{totalTokens:22}};
 }
}});
const {POST}=await import('../app/api/desenvolvimento/plan/route');

const objective='Verifique se a função está correta sem inventar falhas';
function request(options:{origin?:string|null;contentType?:string|null;payload?:unknown}={}){
 const origin=options.origin===undefined?'https://jornada.test':options.origin;
 const contentType=options.contentType===undefined?'application/json':options.contentType;
 const headers:Record<string,string>={};
 if(origin!==null)headers.origin=origin;
 if(contentType!==null)headers['content-type']=contentType;
 return new Request('https://jornada.test/api/desenvolvimento/plan',{
  method:'POST',headers,body:JSON.stringify(options.payload===undefined?{file,objective}:options.payload)
 });
}
async function invoke(options:Parameters<typeof request>[0]={}){
 const response=await POST(request(options));
 return {status:response.status,json:await response.json(),headers:response.headers};
}
function reset(){authenticated=true;readFails=false;providerMode='approved';reads=0;modelCalls=0;}
test('rota real rejeita sessão sem autenticação antes de consultar LLM e GitHub',async()=>{
 reset();authenticated=false;
 const out=await invoke();
 assert.equal(out.status,401);
 assert.equal(out.json.error,'Não autorizado.');
 assert.equal(modelCalls,0);assert.equal(reads,0);
});
test('rota real bloqueia origin ausente, CSRF e mídia incorreta antes da análise',async()=>{
 reset();
 assert.equal((await invoke({origin:null})).status,403);
 assert.equal((await invoke({origin:'https://intruso.test'})).status,403);
 assert.equal((await invoke({contentType:'text/plain'})).status,415);
 assert.equal(modelCalls,0);assert.equal(reads,0);
});
test('rota real recusa arquivos e objetivos fora da política',async()=>{
 reset();
 assert.equal((await invoke({payload:{file:'lib/auth.ts',objective}})).status,400);
 assert.equal((await invoke({payload:{file,objective:'oi'}})).status,400);
 assert.equal(modelCalls,0);assert.equal(reads,0);
});
test('rota real avalia citação positiva correta, apenas uma consulta, nenhuma edição',async()=>{
 reset();const r=await invoke();
 assert.equal(r.status,200);
 assert.equal(r.json.analysisStatus,'approved');
 assert.equal(r.json.evidenceLevel,'checked_quotes');
 assert.equal(r.json.executed,false);
 assert.equal(r.json.baseSha,sha);
 assert.equal(r.json.provider,'groq');
 assert.equal(r.json.usage,22);
 assert.equal(r.json.research.requiresApproval,true);
 assert.equal(reads,1);assert.equal(modelCalls,1);
 assert.equal(r.headers.get('cache-control'),'private, no-store');
 assert.match(r.json.statement,/NENHUM ARQUIVO MODIFICADO/);
});
test('citação inventada não recebe aprovação do modelo nem segunda chamada',async()=>{
 reset();providerMode='invalid_quote';const r=await invoke();
 assert.equal(r.status,200);
 assert.equal(r.json.analysisStatus,'invalid_citation');
 assert.equal(r.json.evidenceLevel,'source_only');
 assert.equal(r.json.executed,false);
 assert.equal(modelCalls,1);assert.equal(reads,1);
});
test('JSON inválido do modelo causa fallback local explicado sem autorizar alteração',async()=>{
 reset();providerMode='invalid_json';const r=await invoke();
 assert.equal(r.status,200);
 assert.equal(r.json.analysisStatus,'invalid_format');
 assert.equal(r.json.executed,false);
 assert.equal(r.json.provider,'groq');
 assert.equal(modelCalls,1);assert.equal(reads,1);
});
test('erros de provedor 429, 504 e 500 conservam status distinto e fallback sem retry',async()=>{
 for(const [upstream,code] of [['429','provider_rate_limited'],['504','provider_timeout'],
  ['500','provider_unavailable']]){
  reset();providerMode=upstream;const r=await invoke();
  assert.equal(r.status,200);
  assert.equal(r.json.analysisStatus,code,upstream);
  assert.equal(r.json.executed,false);
  assert.equal(r.json.provider,'local');
  assert.equal(modelCalls,1);assert.equal(reads,1);
 }
});
test('falha de leitura real da fonte termina em 502 sem consultar o provedor',async()=>{
 reset();readFails=true;const r=await invoke();
 assert.equal(r.status,502);
 assert.equal(modelCalls,0);assert.equal(reads,1);
 assert.match(r.json.error,/GitHub/);
});
