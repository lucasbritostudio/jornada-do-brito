import assert from 'node:assert/strict';
import {test} from 'node:test';
import {evaluateProofCandidate} from '../lib/g2-proof-evaluation';
import {proposeG2Corrections} from '../lib/g2-remediation-plan';
import {G2_INDEPENDENT_V2} from './fixtures/g2-independent-v2';

test('G2 preserva a referência e relata melhorias/limites sem autopublicação',()=>{
 const report=evaluateProofCandidate(G2_INDEPENDENT_V2);
 const plan=proposeG2Corrections(report);
 assert.equal(report.baselineCorrect,13,'baseline histórico é imutável');
 assert.equal(report.falseCases,12);
 assert.equal(report.trueCases,12);
 assert.ok(report.candidateCorrect>=19,'não perder qualidade dos testes históricos');
 assert.equal(report.regressedCases.length,0,'não perder caso antes acertado');
 assert.equal(report.correctClaimsWithheld.length,0,'não bloquear caso verdadeiro anterior');
 assert.equal(report.falselyApprovedCases.length,0,'não aceitar falsos conhecidos');
 assert.equal(plan.errorsFound,0);
 assert.equal(plan.completedAutonomousChanges,0);
 assert.equal(plan.productionUnchanged,true);
 assert.equal(plan.requiresHumanReview,true);
 assert.equal(report.safeToAutoMerge,false);
 assert.equal(report.safeToAutoDeploy,false);
});

test('G2 não cria promessas de correção quando a hipótese ainda não foi testada',()=>{
 const report=evaluateProofCandidate(G2_INDEPENDENT_V2);
 const plan=proposeG2Corrections(report);
 assert.ok(plan.proposals.every(p=>!p.observation.includes('corrigido automaticamente')));
 assert.equal(plan.completedAutonomousChanges,0);
 assert.equal(report.safeToAutoMerge,false);
 assert.equal(report.safeToAutoDeploy,false);
});
