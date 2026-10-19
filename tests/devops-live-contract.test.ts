import assert from 'node:assert/strict';
import {test} from 'node:test';
import {observeChefeBot,markAuthenticatedObservation,validateStoredObservation} from '../lib/devops-observer';
import {evaluateAuthenticatedReadiness} from '../lib/devops-readiness';
import {validSubscription} from '../lib/devops-push';
import {monitorFixture,NOW,SHA} from './devops-v3-fixtures';

const snapshot=(time:number)=>({...monitorFixture(),checkedAt:time});
const build=(time:number)=>observeChefeBot(snapshot(time),
 {projectId:'chefebot',environment:'production',reportedCodeSha:SHA},time);
test('coleta técnica autenticada mantém análise inconclusiva e identidade distinta',()=>{
 const manual=build(NOW),authenticated=markAuthenticatedObservation(manual);
 assert.notEqual(authenticated.id,manual.id);
 assert.equal(authenticated.source.kind,'service_authenticated');
 assert.equal(authenticated.verification.outcome,'INCONCLUSIVO');
 assert.equal(authenticated.verifiedCodeSha,null);
 assert.deepEqual(validateStoredObservation(authenticated),authenticated);
 assert.deepEqual(validateStoredObservation(manual),manual);
});
test('declaração falsificada do código-fonte e origem não passam',()=>{
 const manual=build(NOW);
 assert.throws(()=>validateStoredObservation({...manual,source:{
  kind:'service_authenticated',reference:'/api/dev/observability/jornada',
 }}),/STORE_INVALID/);
});
test('importações manuais não satisfazem gatilho de dados reais',()=>{
 const times=[NOW,NOW+5*60_000,NOW+10*60_000];
 const manual=times.map(at=>({evidence:build(at)}));
 const result=evaluateAuthenticatedReadiness(manual,NOW+15*60_000);
 assert.equal(result.observedSamples,0);
 assert.equal(result.alert,false);
 assert.equal(result.operationalEvidence,'INCONCLUSIVO');
});
test('três leituras autenticadas distintas alcançam alerta sem autorizar a produção',()=>{
 const times=[NOW,NOW+5*60_000,NOW+10*60_000];
 const auth=times.map(at=>({evidence:markAuthenticatedObservation(build(at))}));
 const result=evaluateAuthenticatedReadiness(auth,NOW+12*60_000);
 assert.equal(result.observedSamples,3);
 assert.equal(result.alert,true);
 assert.equal(result.operationalEvidence,'INCONCLUSIVO');
});
test('repetir a mesma leitura remota não cria nova amostra',()=>{
 const same=markAuthenticatedObservation(build(NOW));
 const result=evaluateAuthenticatedReadiness(Array.from({length:10},()=>({evidence:same})),NOW+600000);
 assert.equal(result.observedSamples,1);
 assert.equal(result.alert,false);
});
test('somente endpoints Web Push legítimos podem ser registrados',()=>{
 const sub=(endpoint:string)=>({endpoint,keys:{p256dh:'a'.repeat(45),auth:'b'.repeat(22)}});
 assert.equal(validSubscription(sub('https://web.push.apple.com/Q')),true);
 assert.equal(validSubscription(sub('https://fcm.googleapis.com/fcm/send/X')),true);
 for(const input of ['http://web.push.apple.com/X','https://localhost/internal','https://127.0.0.1/internal',
  'https://web.push.apple.com.evil.invalid/X','https://user:password@169.254.169.254/latest',
  'file:///etc/passwd']){
  assert.equal(validSubscription(sub(input)),false);
 }
});
