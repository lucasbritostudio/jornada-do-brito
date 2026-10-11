import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {buildG2FunctionGraph,traceG2Function,type GraphSource} from '../lib/g2-function-graph';

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
