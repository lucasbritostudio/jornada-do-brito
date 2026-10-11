import assert from 'node:assert/strict';
import {test} from 'node:test';
import {evaluateProofCandidate} from '../lib/g2-proof-evaluation';
import {proposeG2Corrections} from '../lib/g2-remediation-plan';
import {G2_INDEPENDENT_V2} from './fixtures/g2-independent-v2';

test('G2 identifica bloqueios do segundo desafio e propõe melhorias testáveis',()=>{
 const report=evaluateProofCandidate(G2_INDEPENDENT_V2);
 const plan=proposeG2Corrections(report);
 assert.equal(report.baselineCorrect,13);
 assert.equal(report.candidateCorrect,19);
 assert.equal(report.correctedCases.length,7);
 assert.equal(report.regressedCases.length,1);
 assert.equal(report.falselyApprovedCases.length,4);
 assert.equal(report.correctClaimsWithheld.length,1);
 assert.equal(report.candidatePassesControlledGate,false);
 assert.equal(plan.releaseGate,'blocked');
 assert.equal(plan.errorsFound,5);
 assert.deepEqual(plan.proposals.map(p=>p.kind),[
  'overconfident_claim','lost_valid_claim','insufficient_independent_evidence'
 ]);
 assert.equal(plan.completedAutonomousChanges,0);
 assert.equal(plan.productionUnchanged,true);
 assert.equal(plan.requiresHumanReview,true);
 for(const p of plan.proposals){
  assert.ok(p.observation.length>40);
  assert.ok(p.hypothesis.length>40);
  assert.ok(p.proposedChange.length>40);
  assert.ok(p.experiment.length>40);
  assert.ok(p.passCondition.length>40);
 }
});
test('G2 não cria promessas de correção quando a hipótese ainda não foi testada',()=>{
 const report=evaluateProofCandidate(G2_INDEPENDENT_V2);
 const plan=proposeG2Corrections(report);
 assert.ok(plan.proposals.every(p=>!p.observation.includes('corrigido automaticamente')));
 assert.equal(plan.completedAutonomousChanges,0);
 assert.equal(report.safeToAutoMerge,false);
 assert.equal(report.safeToAutoDeploy,false);
});
