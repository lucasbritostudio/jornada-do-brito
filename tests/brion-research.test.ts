import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
 BRION_NAME,createBrionOpportunity,formatBrionOpportunity,
 measureBrionBenchmark,evaluateBrionPromotion,type BrionSignal
} from '../lib/brion-research';

const signals:BrionSignal[]=[
 'approved','invalid_format','no_findings','invalid_citation','contradiction',
 'unverified','provider_unavailable','provider_rate_limited','provider_timeout'
];
for(const signal of signals){
 test('BRIÔN cria hipótese falsificável para: '+signal,()=>{
  const r=createBrionOpportunity({
   signal,factCount:3,sourceTruncated:true,filesExamined:1
  });
  assert.equal(r.name,BRION_NAME);
  assert.match(r.generation,/G1/);
  assert.match(r.status,/proposal_only/);
  assert.ok(r.hypothesis.length>40);
  assert.ok(r.experiment.length>30);
  assert.ok(r.metric.length>25);
  assert.ok(r.falsification.length>25);
  assert.ok(r.priorityIndex>=1&&Number.isInteger(r.priorityIndex));
  assert.match(r.safety,/Nenhum arquivo, modelo, banco ou infraestrutura é modificado automaticamente/);
  assert.match(formatBrionOpportunity(r),/Oportunidade de pesquisa/);
 });
}
test('BRIÔN não inventa melhora nem nível quando dados são inválidos',()=>{
 assert.throws(()=>createBrionOpportunity({
  signal:'approved',factCount:-1,sourceTruncated:false,filesExamined:1
 }),/INVALID_RESEARCH/);
 assert.throws(()=>createBrionOpportunity({
  signal:'approved',factCount:2,sourceTruncated:false,filesExamined:7
 }),/INVALID_RESEARCH/);
 assert.throws(()=>createBrionOpportunity({
  signal:'inexistente' as BrionSignal,factCount:2,sourceTruncated:false,filesExamined:1
 }),/UNKNOWN_SIGNAL/);
 assert.throws(()=>measureBrionBenchmark({
  falseRejected:10,falseTotal:0,trueAccepted:3,trueTotal:3
 }),/INVALID_BENCHMARK/);
 assert.throws(()=>measureBrionBenchmark({
  falseRejected:11,falseTotal:10,trueAccepted:3,trueTotal:3
 }),/INVALID_BENCHMARK/);
});
test('BRIÔN mede precisão do FILTRO em casos ROTULADOS, não LLM externa',()=>{
 const data=measureBrionBenchmark({
  falseRejected:10,falseTotal:10,trueAccepted:3,trueTotal:3
 });
 assert.equal(data.falseRejectionRate,1);
 assert.equal(data.trueAcceptanceRate,1);
 assert.equal(data.balancedScore,1);
 assert.equal(data.cases,13);
});
test('BRIÔN bloqueia candidato quando começa a aceitar um diagnóstico falso',()=>{
 const baseline={falseRejected:9,falseTotal:10,trueAccepted:3,trueTotal:3};
 const bad={falseRejected:8,falseTotal:10,trueAccepted:3,trueTotal:3};
 const v=evaluateBrionPromotion(baseline,bad);
 assert.equal(v.candidatePassesGate,false);
 assert.equal(v.automaticallyDeployable,false);
 assert.equal(v.requiresHumanApproval,true);
});
test('BRIÔN bloqueia candidato com menos casos ou mais falsos negativos',()=>{
 const base={falseRejected:10,falseTotal:10,trueAccepted:3,trueTotal:3};
 const less={falseRejected:9,falseTotal:9,trueAccepted:3,trueTotal:3};
 assert.equal(evaluateBrionPromotion(base,less).candidatePassesGate,false);
 const tooStrict={falseRejected:10,falseTotal:10,trueAccepted:2,trueTotal:3};
 assert.equal(evaluateBrionPromotion(base,tooStrict).candidatePassesGate,false);
});
test('BRIÔN recomenda apenas candidaturas avaliadas sem regressão e nunca publica',()=>{
 const base={falseRejected:9,falseTotal:10,trueAccepted:2,trueTotal:3};
 const candidate={falseRejected:10,falseTotal:10,trueAccepted:3,trueTotal:3};
 const verdict=evaluateBrionPromotion(base,candidate);
 assert.equal(verdict.improved,true);
 assert.equal(verdict.candidatePassesGate,true);
 assert.equal(verdict.automaticallyDeployable,false);
 assert.equal(verdict.requiresHumanApproval,true);
});
