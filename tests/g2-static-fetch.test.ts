import assert from 'node:assert/strict';
import {test} from 'node:test';
import ts from 'typescript';
import {listG2StaticFetches} from '../lib/g2-static-fetch';
const extract=(content:string)=>listG2StaticFetches(ts.createSourceFile(
 'app/challenges/screen.tsx',content,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX));

test('URL literal, template, const e query criam apenas caminho sanitizado',()=>{
 const source=[
  'const endpoint="/api/challenge?token=do-not-leak";',
  'const method="POST";',
  'export function start(){',
  ' fetch(endpoint,{method});',
  ' fetch(`/api/challenge`,{method:"POST"});',
  '}'
 ].join('\n');
 const result=extract(source);
 assert.equal(result.length,2);
 assert.deepEqual(result.map(x=>[x.url,x.method]),[
  ['/api/challenge','POST'],['/api/challenge','POST']
 ]);
 assert.ok(!JSON.stringify(result).includes('do-not-leak'));
});
test('método dinâmico, const tardio e parâmetro sombreando impedem falsa certeza',()=>{
 const source=[
  'const endpoint="/api/challenge";',
  'let method="POST";',
  'export function start(endpoint:string){',
  ' fetch(endpoint,{method});',
  ' fetch("/api/challenge",{method});',
  ' fetch(pending,{method:"POST"});',
  ' const pending="/api/challenge";',
  '}'
 ].join('\n');
 const items=extract(source);
 assert.equal(items.length,1);
 assert.equal(items[0].url,'/api/challenge');
 assert.equal(items[0].method,null);
});
test('const local no escopo correto pode ser usada, const do ramo errado não',()=>{
 const valid=extract([
  'export function start(){',
  ' const endpoint="/api/challenge";',
  ' const method="POST";',
  ' return fetch(endpoint,{method});',
  '}'
 ].join('\n'));
 assert.equal(valid.length,1);
 assert.equal(valid[0].method,'POST');
 const invalid=extract([
  'export function start(){',
  ' if(false){const endpoint="/api/challenge";}',
  ' return fetch(endpoint,{method:"POST"});',
  '}'
 ].join('\n'));
 assert.equal(invalid.length,0);
});
test('nenhuma resolução de URL externa, interpolada ou comando contido em comentário',()=>{
 const source=[
  'export function start(){',
  ' fetch("https://api.exemplo.com/items",{method:"POST"});',
  ' fetch(`/api/${name}`,{method:"POST"});',
  ' // fetch("/api/challenge",{method:"POST"});',
  '}'
 ].join('\n');
 assert.deepEqual(extract(source),[]);
});
test('query string e fragmento não passam ao relatório e não mudam método HTTP',()=>{
 const s='export function start(){return fetch("/api/challenge?x=1#fragment",{method:"post"});}';
 assert.deepEqual(extract(s).map(x=>[x.url,x.method]),[['/api/challenge','POST']]);
});
