import assert from 'node:assert/strict';
import {test} from 'node:test';
import {evaluateProofCandidate} from '../lib/g2-proof-evaluation';
import {checkG2Claim} from '../lib/g2-semantic-proof';
import {G2_INDEPENDENT_V1} from './fixtures/g2-independent-v1';

test('G2 avaliação INDEPENDENTE de 24 casos registra falhas e não publica',()=>{
 const report=evaluateProofCandidate(G2_INDEPENDENT_V1);
 assert.equal(report.cases,24);
 assert.equal(report.falseCases,12);
 assert.equal(report.trueCases,12);
 assert.equal(report.safeToAutoMerge,false);
 assert.equal(report.safeToAutoDeploy,false);
 assert.ok(report.candidateCorrect>=0&&report.candidateCorrect<=24);
 assert.ok(report.exactOneSidedP>=0&&report.exactOneSidedP<=1);
 assert.equal(report.correctedCases.length+report.baselineCorrect-report.regressedCases.length,
  report.candidateCorrect);
 // Reportar contagens REAIS, sem construir porcentagem artificial.
 console.log('G2_INDEPENDENT_V1_RESULTS='+JSON.stringify(report));
});

test('o motor de prova não consulta rótulos ao analisar um problema',()=>{
 for(const x of G2_INDEPENDENT_V1){
  const original=checkG2Claim(x);
  const relabeled={...x,label:x.label==='true'?'false':'true'};
  const inverted=checkG2Claim(relabeled);
  assert.deepEqual(original,inverted);
 }
});

test('resultado é reproduzível e ordem não altera medidas',()=>{
 const a=evaluateProofCandidate(G2_INDEPENDENT_V1);
 const b=evaluateProofCandidate([...G2_INDEPENDENT_V1].reverse());
 assert.equal(a.candidateCorrect,b.candidateCorrect);
 assert.equal(a.baselineCorrect,b.baselineCorrect);
 assert.equal(a.exactOneSidedP,b.exactOneSidedP);
});
