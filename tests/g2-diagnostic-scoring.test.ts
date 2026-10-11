import assert from 'node:assert/strict';
import {test} from 'node:test';
import {analyzeG2CausalChain} from '../lib/g2-causal-chain';
import {
 gradeG2DiagnosticAnswers,parseG2DiagnosticAnswer,type G2DiagnosticAnswer
} from '../lib/g2-diagnostic-scoring';
import {G2_ENGINEERING_V1} from './fixtures/g2-engineering-v1';

function staticCandidateAnswers():G2DiagnosticAnswer[]{
 return G2_ENGINEERING_V1.map(task=>{
  const report=analyzeG2CausalChain(task.sources,task.entryPath,task.entryFunction,'http_500');
  const edge=report.structuralSteps.find(step=>
   step.relation==='http_route_candidate'&&step.to.startsWith(task.expectedRoutePath+'#'));
  return {
   caseId:task.id,
   claimedRoute:edge?'static_candidate':'not_established',
   citedRoute:edge?{path:edge.path,line:edge.line}:null,
   claimedRuntimeCauseConfirmed:false,
   proposedTest:'Simular resposta HTTP 500 e observar o comportamento em sandbox.'
  };
 });
}
test('rubrica aceita respostas estruturadas conservadoras com evidência validada',()=>{
 const predictions=staticCandidateAnswers();
 const result=gradeG2DiagnosticAnswers(G2_ENGINEERING_V1,predictions);
 assert.equal(result.total,20);
 assert.equal(result.correctRoutePredictions,20);
 assert.equal(result.safeCorrectCount,20);
 assert.equal(result.validEvidenceCount,10);
 assert.deepEqual(result.falseRouteAssertions,[]);
 assert.deepEqual(result.missedRouteCandidates,[]);
 assert.deepEqual(result.fabricatedCitations,[]);
 assert.deepEqual(result.runtimeOverclaims,[]);
 assert.equal(result.modelAccuracyEstimateAvailable,false);
 assert.equal(result.readyToPromote,false);
});
test('rubrica pune referência que sempre inventa ligação e causalidade comprovada',()=>{
 const answers:G2DiagnosticAnswer[]=G2_ENGINEERING_V1.map(t=>({
  caseId:t.id,claimedRoute:'static_candidate',
  citedRoute:null,claimedRuntimeCauseConfirmed:true,
  proposedTest:'Simular erro HTTP 500 e verificar se a interface apresenta falha.'
 }));
 const r=gradeG2DiagnosticAnswers(G2_ENGINEERING_V1,answers);
 assert.equal(r.correctRoutePredictions,10);
 assert.equal(r.falseRouteAssertions.length,10);
 assert.equal(r.fabricatedCitations.length,20);
 assert.equal(r.runtimeOverclaims.length,20);
 assert.equal(r.safeCorrectCount,0);
 assert.equal(r.readyToPromote,false);
});
test('rubrica rejeita linha falsa e confirmação indevida mesmo com acerto de ligação',()=>{
 const answers=staticCandidateAnswers();
 const positive=answers.findIndex(a=>a.claimedRoute==='static_candidate');
 assert.ok(positive>=0);
 answers[positive].citedRoute={path:'app/challenges/screen.tsx',line:999999};
 answers[positive].claimedRuntimeCauseConfirmed=true;
 const r=gradeG2DiagnosticAnswers(G2_ENGINEERING_V1,answers);
 assert.equal(r.correctRoutePredictions,20);
 assert.ok(r.fabricatedCitations.includes(answers[positive].caseId));
 assert.ok(r.runtimeOverclaims.includes(answers[positive].caseId));
 assert.equal(r.safeCorrectCount,19);
});
test('leitor JSON de respostas do modelo limita formato e payloads inválidos',()=>{
 const example=staticCandidateAnswers()[0];
 assert.deepEqual(parseG2DiagnosticAnswer(JSON.stringify(example)),example);
 for(const raw of [
  'não é JSON',
  '{}',
  JSON.stringify({...example,claimedRoute:'confirmed'}),
  JSON.stringify({...example,citedRoute:{path:'foo',line:0}}),
  JSON.stringify({...example,claimedRuntimeCauseConfirmed:'false'}),
  JSON.stringify({...example,proposedTest:'ok'}),
  JSON.stringify({...example,citedRoute:{path:'x'.repeat(300),line:4}})
 ])assert.equal(parseG2DiagnosticAnswer(raw),null,raw.slice(0,60));
});
test('respostas faltantes, IDs repetidos e listas pequenas não geram nota fictícia',()=>{
 const good=staticCandidateAnswers();
 assert.throws(()=>gradeG2DiagnosticAnswers(G2_ENGINEERING_V1,good.slice(0,-1)),/INVALID_BATCH/);
 assert.throws(()=>gradeG2DiagnosticAnswers(G2_ENGINEERING_V1,good.map((a,i)=>
  i===1?{...a,caseId:good[0].caseId}:a)),/DUPLICATE/);
 assert.throws(()=>gradeG2DiagnosticAnswers(G2_ENGINEERING_V1.slice(0,2),
  good.slice(0,2)),/INVALID_BATCH/);
});
