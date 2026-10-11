import assert from 'node:assert/strict';
import {test} from 'node:test';
import {G2_LIVE_BLIND_V1} from './fixtures/g2-live-blind-v1';
import {buildG2LivePrompt,gradeG2LiveAnswers,parseG2LiveAnswer} from '../lib/g2-live-benchmark';
import type {LiveAnswer} from '../lib/g2-live-benchmark';

const canned=(caseId:string):LiveAnswer=>{
 const task=G2_LIVE_BLIND_V1.find(c=>c.id===caseId)!;
 return {caseId,linked:task.expected.linked,cause:task.expected.cause,
  fix:task.expected.fix,evidence:task.expected.evidence[0],
  runtimeConfirmed:false,experiment:'Simular o método e a rota em teste HTTP isolado, sem deploy.'};
};
test('12 casos reais para Groq estão balanceados, sem enviar rótulos no prompt',()=>{
 assert.equal(G2_LIVE_BLIND_V1.length,12);
 assert.equal(G2_LIVE_BLIND_V1.filter(x=>x.expected.linked).length,6);
 assert.equal(G2_LIVE_BLIND_V1.filter(x=>!x.expected.linked).length,6);
 for(const item of G2_LIVE_BLIND_V1){
  const p=buildG2LivePrompt(item);
  assert.equal(typeof p.system,'string');
  assert.ok(p.user.includes(item.id));
  assert.ok(!p.user.includes('"expected":'));
  assert.ok(!p.system.includes('"expected":'));
  for(const s of item.sources)assert.ok(p.user.includes(s.path));
 }
});
test('respostas CANÔNICAS simuladas para validar rubrica: não contar como respostas Groq',()=>{
 const raw=G2_LIVE_BLIND_V1.map(c=>JSON.stringify(canned(c.id)));
 const result=gradeG2LiveAnswers(G2_LIVE_BLIND_V1,raw);
 assert.equal(result.total,12);
 assert.equal(result.linksCorrect,12);
 assert.equal(result.causesCorrect,12);
 assert.equal(result.fixesCorrect,12);
 assert.equal(result.fullyCorrect,12);
 assert.equal(result.badCitations.length,0);
 assert.equal(result.needsHumanReview,true);
 assert.equal(result.mayDeploy,false);
});
test('JSON malformado, ausência de resposta ou ID trocado NÃO viram acerto',()=>{
 const raw=G2_LIVE_BLIND_V1.map(c=>JSON.stringify(canned(c.id)));
 raw[0]='{"caseId":"live-a01-direct","linked":true}';
 raw[1]='não é json';
 raw[2]=JSON.stringify({...canned(G2_LIVE_BLIND_V1[2].id),caseId:'live-another'});
 const score=gradeG2LiveAnswers(G2_LIVE_BLIND_V1,raw);
 assert.equal(score.invalidResponses.length,3);
 assert.equal(score.fullyCorrect,9);
 assert.equal(score.mayDeploy,false);
 const some=gradeG2LiveAnswers(G2_LIVE_BLIND_V1,[...raw.slice(0,4),...Array(8).fill(null)]);
 assert.equal(some.total,12);
 assert.ok(some.fullyCorrect<=4);
});
test('alucinar citação ou causalidade comprovada reduz pontuação apesar do acerto de rota',()=>{
 const raw=G2_LIVE_BLIND_V1.map(c=>JSON.stringify(canned(c.id)));
 raw[0]=JSON.stringify({...canned(G2_LIVE_BLIND_V1[0].id),
  evidence:{file:'app/studio/view.ts',line:999}});
 raw[1]=JSON.stringify({...canned(G2_LIVE_BLIND_V1[1].id),runtimeConfirmed:true});
 const score=gradeG2LiveAnswers(G2_LIVE_BLIND_V1,raw);
 assert.equal(score.linksCorrect,12);
 assert.equal(score.fullyCorrect,10);
 assert.deepEqual(score.badCitations,[G2_LIVE_BLIND_V1[0].id]);
 assert.deepEqual(score.runtimeOverclaims,[G2_LIVE_BLIND_V1[1].id]);
});
test('propostas ruins e formato incompleto são reprovados mesmo com referência correta',()=>{
 const correct=G2_LIVE_BLIND_V1.map(x=>JSON.stringify(canned(x.id)));
 const example=canned(G2_LIVE_BLIND_V1[0].id);
 correct[0]=JSON.stringify({...example,fix:'add_missing_route'});
 const score=gradeG2LiveAnswers(G2_LIVE_BLIND_V1,correct);
 assert.equal(score.fixesCorrect,11);
 assert.equal(score.fullyCorrect,11);
 assert.equal(score.mayDeploy,false);
 assert.equal(parseG2LiveAnswer(JSON.stringify({...example,experiment:'ok'})),null);
 assert.equal(parseG2LiveAnswer('texto não JSON'),null);
});
test('fonte e linha independente dos rótulos são verificadas no relatório',()=>{
 const first=G2_LIVE_BLIND_V1[0];
 const change=G2_LIVE_BLIND_V1.map((item,i)=>i===0?
  {...item,expected:{...item.expected,evidence:[{file:'lib/phantom.ts',line:99}]}}:item);
 const result=gradeG2LiveAnswers(change,G2_LIVE_BLIND_V1.map(x=>JSON.stringify(canned(x.id))));
 assert.deepEqual(result.badCitations,[first.id]);
 assert.equal(result.fullyCorrect,11);
});
