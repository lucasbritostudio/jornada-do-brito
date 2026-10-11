import assert from 'node:assert/strict';
import {test} from 'node:test';
import {evaluateProofCandidate} from '../lib/g2-proof-evaluation';
import {checkG2Claim} from '../lib/g2-semantic-proof';
import {G2_FROZEN_V3} from './fixtures/g2-frozen-v3';

test('desafio V3, congelado antes da inspeção, mede 30 casos sem selecionar regras',()=>{
 const r=evaluateProofCandidate(G2_FROZEN_V3);
 assert.equal(r.cases,30);
 assert.equal(r.falseCases,15);
 assert.equal(r.trueCases,15);
 assert.equal(r.safeToAutoMerge,false);
 assert.equal(r.safeToAutoDeploy,false);
 assert.ok(r.exactOneSidedP>=0&&r.exactOneSidedP<=1);
 assert.equal(r.baselineCorrect+r.correctedCases.length-r.regressedCases.length,r.candidateCorrect);
 console.log('G2_FROZEN_V3_RESULTS='+JSON.stringify(r));
});
test('desafio V3 nunca executa código recebido nem usa rótulos para prever',()=>{
 for(const item of G2_FROZEN_V3){
  const first=checkG2Claim(item);
  const relabeled={...item,label:item.label==='false'?'true':'false'};
  const second=checkG2Claim(relabeled);
  assert.deepEqual(first,second);
  assert.equal(first.codeExecuted,false);
 }
});
test('método de medição apresenta métricas estáveis sob permutação de ordem',()=>{
 const a=evaluateProofCandidate(G2_FROZEN_V3);
 const b=evaluateProofCandidate([...G2_FROZEN_V3].reverse());
 assert.equal(a.baselineCorrect,b.baselineCorrect);
 assert.equal(a.candidateCorrect,b.candidateCorrect);
 assert.equal(a.exactOneSidedP,b.exactOneSidedP);
});
