import assert from 'node:assert/strict';
import {test} from 'node:test';
import {evaluateProofCandidate} from '../lib/g2-proof-evaluation';
import {checkG2Claim} from '../lib/g2-semantic-proof';
import {G2_INDEPENDENT_V2} from './fixtures/g2-independent-v2';

test('G2 segunda amostra INDEPENDENTE mede melhora e regressões sem retreinar',()=>{
 const r=evaluateProofCandidate(G2_INDEPENDENT_V2);
 assert.equal(r.cases,24);
 assert.equal(r.falseCases,12);
 assert.equal(r.trueCases,12);
 assert.equal(r.safeToAutoMerge,false);
 assert.equal(r.safeToAutoDeploy,false);
 assert.equal(r.correctedCases.length+r.baselineCorrect-r.regressedCases.length,r.candidateCorrect);
 assert.ok(r.exactOneSidedP>=0&&r.exactOneSidedP<=1);
 console.log('G2_INDEPENDENT_V2_RESULTS='+JSON.stringify(r));
});

test('provas são sempre reproduzíveis e não dependem de rótulos',()=>{
 for(const item of G2_INDEPENDENT_V2){
  const a=checkG2Claim(item);
  const relabeled={...item,label:item.label==='true'?'false':'true'};
  const b=checkG2Claim(relabeled);
  assert.deepEqual(a,b);
  assert.equal(a.codeExecuted,false);
 }
 const a=evaluateProofCandidate(G2_INDEPENDENT_V2);
 const b=evaluateProofCandidate([...G2_INDEPENDENT_V2].reverse());
 assert.equal(a.candidateCorrect,b.candidateCorrect);
 assert.equal(a.exactOneSidedP,b.exactOneSidedP);
});
