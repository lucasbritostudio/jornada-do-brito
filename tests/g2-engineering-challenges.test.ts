import assert from 'node:assert/strict';
import {test} from 'node:test';
import {evaluateG2RouteChallenges} from '../lib/g2-engineering-challenges';
import {G2_ENGINEERING_V1} from './fixtures/g2-engineering-v1';

test('20 desafios de engenharia V1 avaliam encadeamento estático contra baseline ingênuo',()=>{
 const r=evaluateG2RouteChallenges(G2_ENGINEERING_V1);
 assert.equal(r.total,20);
 assert.equal(r.positives,10);
 assert.equal(r.negatives,10);
 assert.equal(r.baselineAlwaysLinkCorrect,10);
 assert.ok(r.correct>=0&&r.correct<=20);
 assert.ok(r.precision===null||r.precision>=0&&r.precision<=1);
 assert.ok(r.recall>=0&&r.recall<=1);
 assert.equal(r.safeToPromote,false);
 assert.ok(r.results.every(x=>x.runtimeCauseConfirmed===false&&
  x.confidence==='static_route_candidate_only'));
 console.log('G2_ENGINEERING_V1_RESULTS='+JSON.stringify(r));
});
test('a ordem dos problemas e os rótulos NÃO afetam decisões da candidata',()=>{
 const original=evaluateG2RouteChallenges(G2_ENGINEERING_V1);
 const backwards=evaluateG2RouteChallenges([...G2_ENGINEERING_V1].reverse());
 assert.equal(original.correct,backwards.correct);
 assert.equal(original.precision,backwards.precision);
 assert.equal(original.recall,backwards.recall);
 for(const entry of G2_ENGINEERING_V1){
  const changed=evaluateG2RouteChallenges(G2_ENGINEERING_V1.map(x=>x.id===entry.id?
   {...x,expectedRouteLink:!x.expectedRouteLink}:x));
  const originalDecision=original.results.find(x=>x.id===entry.id)?.predictedRouteLink;
  const changedDecision=changed.results.find(x=>x.id===entry.id)?.predictedRouteLink;
  assert.equal(changedDecision,originalDecision,entry.id);
 }
});
test('títulos iguais, IDs duplicados, desbalanceamento e fontes inválidas não passam',()=>{
 const incomplete=G2_ENGINEERING_V1.slice(0,8);
 assert.throws(()=>evaluateG2RouteChallenges(incomplete),/INVALID_COUNT/);
 const copy=G2_ENGINEERING_V1.map((x,i)=>i===1?{...x,id:G2_ENGINEERING_V1[0].id}:x);
 assert.throws(()=>evaluateG2RouteChallenges(copy),/INVALID_ITEM/);
 const oneSided=G2_ENGINEERING_V1.map(x=>({...x,expectedRouteLink:true}));
 assert.throws(()=>evaluateG2RouteChallenges(oneSided),/UNBALANCED/);
 const dangerous=G2_ENGINEERING_V1.map((x,i)=>i===0?{
  ...x,sources:[{path:'.env.local',sha:'d'.repeat(40),content:'API_KEY=do-not-print'}]
 }:x);
 assert.throws(()=>evaluateG2RouteChallenges(dangerous),/G2_GRAPH_INVALID_SOURCE/);
});
test('desafio da query com token não pode ecoar o segredo',()=>{
 const raw=G2_ENGINEERING_V1.find(x=>x.id==='engineering-b09-query-string');
 assert.ok(raw);
 const result=evaluateG2RouteChallenges(G2_ENGINEERING_V1);
 assert.ok(!JSON.stringify(result).includes('synthetic-secret'));
 assert.equal(result.results.find(x=>x.id===raw.id)?.predictedRouteLink,false);
});
