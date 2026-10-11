import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {buildG2FunctionGraph,traceG2Function,type GraphSource} from '../lib/g2-function-graph';
import {findG2ImportCycles} from '../lib/g2-import-cycles';

const sha='a'.repeat(40);
const synthetic:GraphSource[]=[
 {path:'app/demo/page.tsx',sha,content:[
  "import {loadData as pull} from '@/lib/demo/logic';",
  "import {mapData} from '@/components/demo/mapper';",
  "import './styles.css';",
  "export function screen(){return go();}",
  "function go(){return mapData(pull());}"
 ].join('\n')},
 {path:'components/demo/mapper.ts',sha,content:[
  "import {parse} from '@/lib/demo/logic';",
  "export function mapData(item:string){return parse(item);}"
 ].join('\n')},
 {path:'lib/demo/logic.ts',sha,content:[
  "export function loadData(){return '42';}",
  "export function parse(value:string){return Number(value);}"
 ].join('\n')},
 {path:'app/demo/styles.css',sha,content:'.screen{display:flex}'}
];
test('AST G2 descobre cadeia trans-arquivo com import alias, calls e CSS',()=>{
 const g=buildG2FunctionGraph(synthetic);
 assert.equal(g.status,'static_only');
 assert.equal(g.sha,sha);
 assert.equal(g.files.length,4);
 assert.ok(g.edges.some(e=>e.kind==='import'&&e.from==='file:app/demo/page.tsx'&&e.to==='file:app/demo/styles.css'));
 assert.ok(g.edges.some(e=>e.kind==='import'&&e.from==='file:app/demo/page.tsx'&&e.to==='file:lib/demo/logic.ts'));
 const trace=traceG2Function(g,'app/demo/page.tsx','screen',4);
 assert.equal(trace.status,'static_trace_only');
 assert.deepEqual(new Set(trace.nodes.map(n=>n.name)),new Set(['screen','go','loadData','mapData','parse']));
 assert.ok(trace.edges.some(e=>e.kind==='call'&&e.path==='app/demo/page.tsx'&&e.line===5));
 assert.ok(trace.edges.every(e=>e.proof==='static_reference_only'));
 assert.equal(traceG2Function(g,'app/demo/page.tsx','screen',1).nodes.length,2);
});
test('chamadas externas, caminhos ausentes e métodos arbitrários NÃO são inventados',()=>{
 const s:GraphSource[]=[{path:'app/demo/untrusted.tsx',sha,content:[
  "import {secret as run} from '@/lib/private';",
  "import {useEffect} from 'react';",
  "export function page(obj:{run:()=>void}){obj.run();run();useEffect(()=>{},[])}",
  "function unrelated(){return 4;}"
 ].join('\n')}];
 const g=buildG2FunctionGraph(s);
 assert.ok(g.gaps.some(x=>x.reason==='external_or_unprovided'&&x.symbol==='@/lib/private'));
 assert.ok(g.gaps.some(x=>x.reason==='external_or_unprovided'&&x.symbol==='react'));
 assert.ok(!g.edges.some(x=>x.kind==='call'));
 const result=traceG2Function(g,'app/demo/untrusted.tsx','page');
 assert.equal(result.nodes.length,1);
 assert.ok(!result.nodes.some(x=>x.name==='unrelated'));
});
test('import de função não exportada não estabelece ligação falsa',()=>{
 const xs:GraphSource[]=[
  {path:'app/demo/consumer.ts',sha,content:"import {work} from '@/lib/demo/hidden';\nexport function use(){return work();}"},
  {path:'lib/demo/hidden.ts',sha,content:"function work(){return 1;}"}
 ];
 const g=buildG2FunctionGraph(xs);
 assert.ok(g.gaps.some(x=>x.reason==='not_exported'&&x.symbol==='work'));
 assert.ok(!g.edges.some(e=>e.kind==='call'));
});
test('o motor recusa fontes em revisões diferentes, duplicações e caminhos proibidos',()=>{
 assert.throws(()=>buildG2FunctionGraph([{...synthetic[0],sha:'b'.repeat(40)},synthetic[1]]),/INVALID_SOURCE/);
 assert.throws(()=>buildG2FunctionGraph([synthetic[0],synthetic[0]]),/INVALID_SOURCE/);
 assert.throws(()=>buildG2FunctionGraph([{path:'.env.production',sha,content:'SECRET=x'}]),/INVALID_SOURCE/);
 assert.throws(()=>buildG2FunctionGraph([{path:'app/../lib/secret.ts',sha,content:'const x=1;'}]),/INVALID_SOURCE/);
 assert.throws(()=>buildG2FunctionGraph([]),/INVALID_FILES/);
 assert.throws(()=>traceG2Function(buildG2FunctionGraph(synthetic),'app/demo/page.tsx','screen',100),/INVALID_DEPTH/);
});
test('grafo real encontra funções locais sem inventar importações para APIs ausentes',()=>{
 const path='app/desenvolvimento/console.tsx';
 const content=readFileSync(path,'utf8');
 const g=buildG2FunctionGraph([{path,sha,content}]);
 assert.ok(g.symbols.some(s=>s.name==='DevelopmentConsole'&&s.exportName==='default'));
 assert.ok(g.symbols.some(s=>s.name==='ask'&&s.parent!==null));
 assert.ok(g.symbols.some(s=>s.name==='refresh'&&s.parent!==null));
 assert.ok(g.symbols.some(s=>s.name==='copyAnswer'&&s.parent!==null));
 assert.ok(g.gaps.some(x=>x.symbol==='react'&&x.reason==='external_or_unprovided'));
 assert.ok(g.gaps.some(x=>x.reason==='http_route_unexamined'&&x.symbol==='/api/desenvolvimento/chat'));
 assert.ok(g.gaps.some(x=>x.reason==='http_route_unexamined'&&x.symbol==='/api/desenvolvimento/plan'));
 assert.ok(!g.edges.some(x=>x.to.includes('/api/desenvolvimento/chat')));
 assert.ok(!g.edges.some(e=>e.to.startsWith('file:lib/auth')));
});
test('funções com mesmo nome aninhadas ficam identificadas pelo escopo e linha',()=>{
 const path='lib/demo/shadow.ts';
 const content=[
  "export function outer(){",
  " function go(){return 1;}",
  " return go();",
  "}",
  "export function other(){",
  " function go(){return 2;}",
  " return go();",
  "}"
 ].join('\n');
 const g=buildG2FunctionGraph([{path,content,sha}]);
 const a=traceG2Function(g,path,'outer');
 const b=traceG2Function(g,path,'other');
 assert.equal(a.nodes.length,2);
 assert.equal(b.nodes.length,2);
 assert.notEqual(a.nodes.find(n=>n.name==='go')?.id,b.nodes.find(n=>n.name==='go')?.id);
});

test('parâmetro/variável com mesmo nome da importação impede ligação falsa',()=>{
 const xs:GraphSource[]=[
  {path:'lib/demo/use.ts',sha,content:[
   "import {fetchOrder as run} from './api';",
   "export function handler(run:()=>void){return run();}",
   "export function shadow(){const run = ()=>0;return run();}",
   "export function real(){return run();}"
  ].join('\n')},
  {path:'lib/demo/api.ts',sha,content:"export function fetchOrder(){return 7;}"}
 ];
 const graph=buildG2FunctionGraph(xs);
 const real=traceG2Function(graph,'lib/demo/use.ts','real');
 assert.ok(real.nodes.some(n=>n.name==='fetchOrder'));
 const handler=traceG2Function(graph,'lib/demo/use.ts','handler');
 assert.ok(!handler.nodes.some(n=>n.name==='fetchOrder'));
 const shadow=traceG2Function(graph,'lib/demo/use.ts','shadow');
 assert.ok(!shadow.nodes.some(n=>n.name==='fetchOrder'));
 assert.ok(shadow.nodes.some(n=>n.name==='run'&&n.path==='lib/demo/use.ts'));
});
test('importações via namespace e imports default funcionam somente com export confirmado',()=>{
 const xs:GraphSource[]=[
  {path:'app/demo/entry.ts',sha,content:[
   "import * as math from '@/lib/demo/math';",
   "import defaultHandler from '@/lib/demo/default';",
   "export function entry(){return math.compute()+defaultHandler();}"
  ].join('\n')},
  {path:'lib/demo/math.ts',sha,content:"export function compute(){return 12;}"},
  {path:'lib/demo/default.ts',sha,content:"export default function defaultHandler(){return 8;}"}
 ];
 const graph=buildG2FunctionGraph(xs);
 const trace=traceG2Function(graph,'app/demo/entry.ts','entry');
 assert.ok(trace.nodes.some(n=>n.name==='compute'));
 assert.ok(trace.nodes.some(n=>n.name==='defaultHandler'));
});
test('ciclo de função não causa laço infinito no rastreador',()=>{
 const path='lib/demo/cycle.ts',content=[
  "export function first(){return second();}",
  "export function second(){return first();}"
 ].join('\n');
 const graph=buildG2FunctionGraph([{path,sha,content}]);
 const trace=traceG2Function(graph,path,'first',5);
 assert.equal(trace.status,'static_trace_only');
 assert.equal(trace.nodes.length,2);
 assert.ok(trace.edges.length>0&&trace.edges.length<=5);
});

test('fronteira HTTP dinâmica não é inventada, nem vazamento de tokens na URL',()=>{
 const path='app/demo/client.tsx';
 const g=buildG2FunctionGraph([{path,sha,content:[
  'export async function sync(){',
  ' await fetch("/api/works?token=not-for-logs");',
  ' await fetch("/api/works");',
  ' await fetch(nextUrl);',
  '}'
 ].join('\n')}]);
 assert.equal(g.gaps.filter(x=>x.reason==='http_route_unexamined').length,1);
 assert.equal(g.gaps.find(x=>x.reason==='http_route_unexamined')?.symbol,'/api/works');
 assert.ok(!JSON.stringify(g).includes('not-for-logs'));
});

test('identifica ciclo de import entre três módulos, sem afirmar erro de execução',()=>{
 const files:GraphSource[]=[
  {path:'lib/cycles/a.ts',sha,content:"import {b} from './b';\nexport function a(){return b();}"},
  {path:'lib/cycles/b.ts',sha,content:"import {c} from './c';\nexport function b(){return c();}"},
  {path:'lib/cycles/c.ts',sha,content:"import {a} from './a';\nexport function c(){return a();}"}
 ];
 const graph=buildG2FunctionGraph(files);
 const cycles=findG2ImportCycles(graph);
 assert.equal(cycles.length,1);
 assert.equal(cycles[0].imports.length,3);
 assert.equal(cycles[0].runtimeBugConfirmed,false);
 assert.equal(cycles[0].observation,'possible_static_import_cycle');
 assert.equal(findG2ImportCycles(buildG2FunctionGraph(synthetic)).length,0);
});
