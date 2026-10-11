import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {inspectG2ControlFlow} from '../lib/g2-flow-facts';
import {analyzeG2CausalChain} from '../lib/g2-causal-chain';
import type {GraphSource} from '../lib/g2-function-graph';

const sha='e'.repeat(40);
test('fatos estruturais REAIS de ask: fetch, status, catch, finally com linhas verificáveis',()=>{
 const path='app/desenvolvimento/console.tsx';
 const src:GraphSource={path,sha,content:readFileSync(path,'utf8')};
 const out=inspectG2ControlFlow(src,'ask');
 assert.equal(out.state,'unique_function');
 assert.deepEqual(new Set(out.facts.map(f=>f.kind)),new Set([
  'await_fetch','http_status_throw','catch_updates_error','finally_resets_loading'
 ]));
 assert.ok(out.facts.every(f=>f.scope==='static_syntax_only'&&
  f.runtimeTested===false&&f.path===path));
 const lines=src.content.split('\n');
 for(const fact of out.facts)assert.ok(lines[fact.line-1]!==undefined);
 assert.ok(out.facts.some(f=>f.kind==='http_status_throw'&&
  lines[f.line-1].includes('if(!r.ok)throw')));
 assert.ok(out.facts.some(f=>f.kind==='finally_resets_loading'&&
  lines[f.line-1].includes('finally{setAsking(false);}')));
 const report=analyzeG2CausalChain([src],path,'ask','http_500');
 assert.equal(report.flowSyntaxFacts.length,4);
 assert.equal(report.runtimeOutcomeVerified,false);
 assert.equal(report.causeConfirmed,false);
});
test('código sintético sem status HTTP não recebe fato positivo inventado',()=>{
 const path='app/demo/ask.ts';
 const input:GraphSource={path,sha,content:[
  'export async function ask(){',
  ' try{const r=await fetch("/api/data");return r.json();}',
  ' catch(e){setError("falhou");}',
  ' finally{setLoading(false);}',
  '}'
 ].join('\n')};
 const output=inspectG2ControlFlow(input,'ask');
 assert.equal(output.state,'unique_function');
 assert.ok(output.facts.some(f=>f.kind==='await_fetch'));
 assert.ok(output.facts.some(f=>f.kind==='catch_updates_error'));
 assert.ok(output.facts.some(f=>f.kind==='finally_resets_loading'));
 assert.ok(!output.facts.some(f=>f.kind==='http_status_throw'));
 assert.equal(output.executionVerified,false);
});
test('guard de variável de outro bloco não é atribuído ao fetch do ramo alheio',()=>{
 const src:GraphSource={path:'lib/demo/scope.ts',sha,content:[
  'export async function ask(){',
  ' if (false) {const r=await fetch("/api/a");}',
  ' if(!r.ok)throw new Error("not bound");',
  '}'
 ].join('\n')};
 const r=inspectG2ControlFlow(src,'ask');
 assert.ok(!r.facts.some(f=>f.kind==='http_status_throw'));
});
test('funções duplicadas são ambíguas; função não fornecida não é bug confirmado',()=>{
 const src:GraphSource={path:'lib/demo/duplicated.ts',sha,content:[
  'function outer(){function ask(){return 1;}}',
  'function another(){function ask(){return 2;}}'
 ].join('\n')};
 const r=inspectG2ControlFlow(src,'ask');
 assert.equal(r.state,'ambiguous_or_missing_function');
 assert.equal(r.facts.length,0);
 assert.equal(inspectG2ControlFlow(src,'missing').executionVerified,false);
});
