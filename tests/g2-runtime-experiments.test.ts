import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
 deadlineFor,productionUrgency,transitionAllowed,
 type Work,type Stage
} from '../lib/production';
import {evaluateG2RuntimeExperiment,type G2RuntimeProbe} from '../lib/g2-runtime-experiments';

const capture='2026-10-13T21:00:00.000Z';
function work(extra:Partial<Work>={}):Work{
 return {id:'fixture-not-client',title:'Caso de teste',clientName:'Sintético',
  stage:'editing',capturedAt:capture,createdAt:capture,updatedAt:capture,history:[],...extra};
}
/**
 * MUTANTE intencional para avaliar um experimento — NUNCA foi bug de produção.
 * A intervenção começa prazo na hora da gravação, contrariando a regra da Jornada.
 */
function mutantDeadlineFor(instant?:string){
 if(!instant)return null;
 const ms=new Date(instant).getTime();
 if(!Number.isFinite(ms))return null;
 return {
  startedAt:new Date(ms).toISOString(),
  targetAt:new Date(ms+48*3_600_000).toISOString(),
  dueAt:new Date(ms+72*3_600_000).toISOString()
 };
}
const deadlineProbes:G2RuntimeProbe[]=[
 {id:'deadline-repro-midnight',kind:'reproducer',
  expected:'2026-10-14T03:00:00.000Z',
  baseline:()=>mutantDeadlineFor(capture)?.startedAt,
  candidate:()=>deadlineFor(capture)?.startedAt},
 {id:'deadline-repro-target',kind:'reproducer',
  expected:'2026-10-16T03:00:00.000Z',
  baseline:()=>mutantDeadlineFor(capture)?.targetAt,
  candidate:()=>deadlineFor(capture)?.targetAt},
 {id:'deadline-regression-null',kind:'regression',expected:null,
  baseline:()=>mutantDeadlineFor(),candidate:()=>deadlineFor()},
 {id:'deadline-regression-invalid',kind:'regression',expected:null,
  baseline:()=>mutantDeadlineFor('inválido'),candidate:()=>deadlineFor('inválido')},
 {id:'deadline-holdout-next-day',kind:'holdout',expected:'2026-10-15T03:00:00.000Z',
  baseline:()=>mutantDeadlineFor('2026-10-14T18:00:00Z')?.startedAt,
  candidate:()=>deadlineFor('2026-10-14T18:00:00Z')?.startedAt},
 {id:'deadline-holdout-near-midnight',kind:'holdout',expected:'2026-10-14T03:00:00.000Z',
  baseline:()=>mutantDeadlineFor('2026-10-14T02:59:59Z')?.startedAt,
  candidate:()=>deadlineFor('2026-10-14T02:59:59Z')?.startedAt}
];
test('causalidade controlada: mutação de relógio é reproduzida e reparada pela REGRA REAL',async()=>{
 const r=await evaluateG2RuntimeExperiment(deadlineProbes);
 assert.equal(r.kind,'controlled_mutation_runtime');
 assert.equal(r.reproducedFailure,true);
 assert.equal(r.baselineCorrect,2);
 assert.equal(r.candidateCorrect,6);
 assert.equal(r.fixedReproducerIds.length,2);
 assert.deepEqual(r.regressions,[]);
 assert.deepEqual(r.holdoutFailures,[]);
 assert.equal(r.acceptedForFurtherReview,true);
 assert.equal(r.productionDefectConfirmed,false);
 assert.equal(r.realWorldCauseConfirmed,false);
 assert.equal(r.deployAuthorized,false);
 assert.equal(r.automaticallyApplied,false);
});
/** Mutação: permitir entregar antes de avaliação/aprovação. */
const badTransition=(from:Stage,to:Stage)=>
 transitionAllowed(from,to)||(from==='captured'&&to==='delivered');
const transitions:G2RuntimeProbe[]=[
 {id:'transition-repro-invalid-delivery',kind:'reproducer',expected:false,
  baseline:()=>badTransition('captured','delivered'),
  candidate:()=>transitionAllowed('captured','delivered')},
 {id:'transition-regression-approve',kind:'regression',expected:true,
  baseline:()=>badTransition('review','approved'),
  candidate:()=>transitionAllowed('review','approved')},
 {id:'transition-regression-finished',kind:'regression',expected:false,
  baseline:()=>badTransition('delivered','editing'),
  candidate:()=>transitionAllowed('delivered','editing')},
 {id:'transition-regression-valid-delivery',kind:'regression',expected:true,
  baseline:()=>badTransition('approved','delivered'),
  candidate:()=>transitionAllowed('approved','delivered')},
 {id:'transition-holdout-change-request',kind:'holdout',expected:true,
  baseline:()=>badTransition('review','changes_requested'),
  candidate:()=>transitionAllowed('review','changes_requested')},
 {id:'transition-holdout-cancel',kind:'holdout',expected:false,
  baseline:()=>badTransition('cancelled','scheduled'),
  candidate:()=>transitionAllowed('cancelled','scheduled')}
];
test('causalidade controlada: mutação da regra de entrega é revertida, sem quebrar transições',async()=>{
 const result=await evaluateG2RuntimeExperiment(transitions);
 assert.equal(result.baselineCorrect,5);
 assert.equal(result.candidateCorrect,6);
 assert.equal(result.acceptedForFurtherReview,true);
 assert.deepEqual(result.regressions,[]);
});
const review=work({stage:'review',firstReviewSentAt:'2026-10-15T17:00:00Z'});
const flawedUrgency=(w:Work,now:Date)=>{
 if(w.stage==='review')return 'overdue'; // mutação artificial
 return productionUrgency(w,now);
};
const now=new Date('2026-10-24T10:00:00Z');
const urgencyProbes:G2RuntimeProbe[]=[
 {id:'urgency-repro-wait',kind:'reproducer',expected:'waiting_client',
  baseline:()=>flawedUrgency(review,now),candidate:()=>productionUrgency(review,now)},
 {id:'urgency-regression-delivered',kind:'regression',expected:'finished',
  baseline:()=>flawedUrgency(work({stage:'delivered'}),now),
  candidate:()=>productionUrgency(work({stage:'delivered'}),now)},
 {id:'urgency-regression-revisions',kind:'regression',expected:'revisions',
  baseline:()=>flawedUrgency(work({stage:'changes_requested',
   firstReviewSentAt:review.firstReviewSentAt}),now),
  candidate:()=>productionUrgency(work({stage:'changes_requested',
   firstReviewSentAt:review.firstReviewSentAt}),now)},
 {id:'urgency-holdout-not-started',kind:'holdout',expected:'not_started',
  baseline:()=>flawedUrgency(work({capturedAt:undefined}),now),
  candidate:()=>productionUrgency(work({capturedAt:undefined}),now)},
 {id:'urgency-holdout-on-track',kind:'holdout',expected:'on_track',
  baseline:()=>flawedUrgency(work(),new Date('2026-10-14T05:00:00Z')),
  candidate:()=>productionUrgency(work(),new Date('2026-10-14T05:00:00Z'))},
 {id:'urgency-holdout-risk',kind:'holdout',expected:'at_risk',
  baseline:()=>flawedUrgency(work(),new Date('2026-10-16T05:00:00Z')),
  candidate:()=>productionUrgency(work(),new Date('2026-10-16T05:00:00Z'))}
];
test('causalidade controlada: corrigir estado de avaliação não compromete outros estados',async()=>{
 const result=await evaluateG2RuntimeExperiment(urgencyProbes);
 assert.equal(result.baselineCorrect,5);
 assert.equal(result.candidateCorrect,6);
 assert.equal(result.acceptedForFurtherReview,true);
 assert.deepEqual(result.regressions,[]);
});
test('a alteração ERRADA que só esconde o alerta não supera o portão',async()=>{
 const bad=transitions.map(p=>({...p,candidate:()=>false}));
 const r=await evaluateG2RuntimeExperiment(bad);
 assert.equal(r.fixedReproducerIds.length,1);
 assert.ok(r.regressions.includes('transition-regression-approve'));
 assert.ok(r.regressions.includes('transition-regression-valid-delivery'));
 assert.equal(r.acceptedForFurtherReview,false);
 assert.equal(r.causalFinding,'not_supported_by_trial');
});
test('a candidata idêntica ao mutante não comprova reparo',async()=>{
 const bad=deadlineProbes.map(p=>({...p,candidate:p.baseline}));
 const r=await evaluateG2RuntimeExperiment(bad);
 assert.equal(r.acceptedForFurtherReview,false);
 assert.equal(r.candidateCorrect,2);
 assert.deepEqual(r.fixedReproducerIds,[]);
});
test('exceção é falha do experimento e não vaza dados da função',async()=>{
 const r=await evaluateG2RuntimeExperiment(transitions.map(p=>p.id==='transition-repro-invalid-delivery'?
  {...p,candidate:()=>{throw new Error('SENSITIVE_UNSHARED_TOKEN')}}:p));
 assert.equal(r.acceptedForFurtherReview,false);
 assert.ok(r.uncorrected.includes('transition-repro-invalid-delivery'));
 assert.ok(r.observations.some(o=>o.candidateError));
 assert.ok(!JSON.stringify(r).includes('SENSITIVE_UNSHARED_TOKEN'));
});
test('experimento recusado se estiver vazio, desequilibrado ou duplicado',async()=>{
 await assert.rejects(evaluateG2RuntimeExperiment([]),/CASE_COUNT/);
 await assert.rejects(evaluateG2RuntimeExperiment([transitions[0],transitions[0],
  ...transitions.slice(2)]),/INVALID_PROBE/);
 await assert.rejects(evaluateG2RuntimeExperiment(transitions.slice(0,3)
  .concat(transitions.slice(1,4))),/INVALID_PROBE/);
});
