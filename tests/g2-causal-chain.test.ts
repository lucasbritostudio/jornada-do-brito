import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {analyzeG2CausalChain} from '../lib/g2-causal-chain';
import {verifiedCodeFacts} from '../lib/devops-claims';
import type {GraphSource} from '../lib/g2-function-graph';

const sha='e'.repeat(40);
const p=(path:string,content:string):GraphSource=>({path,sha,content});
const realistic:GraphSource[]=[
 p('app/lab/client.tsx',[
  "import {sanitize} from '@/lib/lab/utils';",
  "export async function ask(){",
  " const reply=await fetch('/api/lab',{method:'POST'});",
  " return sanitize(await reply.json());",
  "}"
 ].join('\n')),
 p('app/api/lab/route.ts',[
  "import {query} from '@/lib/lab/server';",
  "export async function POST(){return query();}"
 ].join('\n')),
 p('lib/lab/utils.ts',"export function sanitize(x:unknown){return String(x);}"),
 p('lib/lab/server.ts',"export function query(){return 'ok';}")
];
test('G2 conecta chamada em UI, fronteira HTTP e função do backend sem afirmar execução',()=>{
 const r=analyzeG2CausalChain(realistic,'app/lab/client.tsx','ask','http_500');
 assert.equal(r.status,'structural_only');
 assert.equal(r.subject.sha,sha);
 assert.ok(r.structuralSteps.some(x=>x.relation==='http_route_candidate'&&
  x.from.includes('#ask@')&&x.to.includes('app/api/lab/route.ts#POST@')&&
  x.evidence==='framework_convention_only'&&x.line===3));
 assert.ok(r.structuralSteps.some(x=>x.relation==='direct_call'&&
  x.from.includes('app/api/lab/route.ts#POST@')&&x.to.includes('lib/lab/server.ts#query@')));
 assert.ok(r.structuralSteps.some(x=>x.relation==='direct_call'&&
  x.to.includes('lib/lab/utils.ts#sanitize@')));
 assert.ok(r.examinedFunctions.some(x=>x.path==='lib/lab/server.ts'&&x.name==='query'));
 assert.equal(r.hypotheses[0].status,'hypothesis_not_verified');
 assert.equal(r.causeConfirmed,false);
 assert.equal(r.runtimeOutcomeVerified,false);
 assert.equal(r.deployAllowed,false);
 assert.equal(r.filesModified,false);
 assert.match(r.testsNotRun.join(' '),/HTTP 500/);
});
test('não deduz existência de backend quando arquivo da rota não é fornecido',()=>{
 const r=analyzeG2CausalChain(realistic.filter(f=>f.path!=='app/api/lab/route.ts'),
  'app/lab/client.tsx','ask','network_failure');
 assert.equal(r.status,'partial_sources');
 assert.ok(!r.structuralSteps.some(x=>x.relation==='http_route_candidate'));
 assert.equal(r.examinedFunctions.some(s=>s.name==='POST'),false);
 assert.ok(r.unresolved.some(x=>x.reason==='http_route_unexamined'));
});
test('não conecta handler POST quando cliente usa GET',()=>{
 const modified=realistic.map(f=>f.path==='app/lab/client.tsx'?
  {...f,content:f.content.replace("{method:'POST'}","{}")}:f);
 const r=analyzeG2CausalChain(modified,'app/lab/client.tsx','ask','unexpected_json');
 assert.ok(!r.structuralSteps.some(x=>x.relation==='http_route_candidate'));
 assert.ok(r.unresolved.some(x=>x.symbol==='/api/lab'&&x.reason==='http_route_unexamined'));
});
test('não conecta endpoint quando método não está demonstrado por literal',()=>{
 const modified=realistic.map(f=>f.path==='app/lab/client.tsx'?
  {...f,content:f.content.replace("{method:'POST'}","{method:requestMethod}")}:f);
 const r=analyzeG2CausalChain(modified,'app/lab/client.tsx','ask','unexpected_json');
 assert.ok(!r.structuralSteps.some(x=>x.relation==='http_route_candidate'));
});
test('não vincula rota mencionada apenas por outra função do mesmo arquivo',()=>{
 const changed=realistic.map(f=>f.path==='app/lab/client.tsx'?
  {...f,content:[
    "import {sanitize} from '@/lib/lab/utils';",
    "export async function ask(){return sanitize('ok');}",
    "export async function background(){return fetch('/api/lab',{method:'POST'});}"
  ].join('\n')}:f);
 const r=analyzeG2CausalChain(changed,'app/lab/client.tsx','ask','http_500');
 assert.ok(!r.structuralSteps.some(x=>x.relation==='http_route_candidate'));
 assert.ok(!r.examinedFunctions.some(x=>x.name==='POST'));
});
test('não conecta rota com export ausente ou apenas nome homônimo',()=>{
 const changed=realistic.map(f=>f.path==='app/api/lab/route.ts'?
  {...f,content:"function POST(){return 'private';}\nexport async function GET(){return 'ok';}"}:f);
 const r=analyzeG2CausalChain(changed,'app/lab/client.tsx','ask','http_500');
 assert.ok(!r.structuralSteps.some(x=>x.relation==='http_route_candidate'));
 assert.ok(r.unresolved.some(x=>x.reason==='http_route_unexamined'));
});
test('não mistura commits, caminhos proibidos ou permissões entre projetos',()=>{
 assert.throws(()=>analyzeG2CausalChain([
  realistic[0],{...realistic[1],sha:'b'.repeat(40)}
 ],'app/lab/client.tsx','ask','http_500'),/G2_GRAPH_INVALID_SOURCE/);
 assert.throws(()=>analyzeG2CausalChain([p('.env','API_KEY=secret')],
  '.env','ask','http_500'),/G2_GRAPH_INVALID_SOURCE/);
 assert.throws(()=>analyzeG2CausalChain(realistic,'app/lab/client.tsx','ask','unknown' as 'http_500'),
  /G2_CAUSAL_SCENARIO_INVALID/);
});
test('fonte REAL da Jornada: UI -> rota chat -> LLM é só cadeia estrutural, sem inventar bug',()=>{
 const path='app/desenvolvimento/console.tsx';
 const paths=[path,'app/api/desenvolvimento/chat/route.ts','lib/llm.ts'];
 const sources=paths.map(p=>({path:p,sha,content:readFileSync(p,'utf8')}));
 const facts=verifiedCodeFacts(sources[0].content,path,'Verificar ask r.ok e finally');
 assert.ok(facts.some(x=>x.quote.includes('if(!r.ok)')));
 assert.ok(facts.some(x=>x.quote.includes('finally')));
 const r=analyzeG2CausalChain(sources,path,'ask','network_failure');
 assert.ok(r.structuralSteps.some(x=>x.relation==='http_route_candidate'&&
  x.to.includes('app/api/desenvolvimento/chat/route.ts#POST@')));
 assert.ok(r.structuralSteps.some(x=>x.relation==='direct_call'&&
  x.to.includes('lib/llm.ts#generateWithFreeLlm@')));
 assert.ok(r.structuralSteps.some(x=>x.relation==='direct_call'&&
  x.to.includes('lib/llm.ts#callOpenAICompatible@')));
 assert.ok(r.unresolved.some(x=>x.symbol==='@/lib/auth'||
  x.symbol==='./secrets'||x.symbol==='next/server'));
 assert.equal(r.causeConfirmed,false);
 assert.equal(r.runtimeOutcomeVerified,false);
 assert.ok(r.hypotheses.some(h=>h.experiment.includes('rejeição do fetch')));
});
test('fonte REAL da Jornada: plano é outra rota distinta e não se mistura à pergunta',()=>{
 const path='app/desenvolvimento/console.tsx';
 const sources=[path,'app/api/desenvolvimento/plan/route.ts','lib/llm.ts'].map(p=>
  ({path:p,sha,content:readFileSync(p,'utf8')}));
 const ask=analyzeG2CausalChain(sources,path,'ask','http_500');
 assert.ok(!ask.structuralSteps.some(s=>s.relation==='http_route_candidate'));
 const plan=analyzeG2CausalChain(sources,path,'planChange','unexpected_json');
 assert.ok(plan.structuralSteps.some(s=>s.relation==='http_route_candidate'&&
  s.to.includes('app/api/desenvolvimento/plan/route.ts#POST@')));
 assert.ok(plan.hypotheses[0].whyNotProven.includes('runtime'));
});
