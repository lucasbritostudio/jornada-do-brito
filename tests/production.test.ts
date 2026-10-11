import assert from 'node:assert/strict';
import {test} from 'node:test';
import {deadlineFor,productionUrgency,paymentSummary,
 overlappingEditions,transitionAllowed,emptyProduction,type Work} from '../lib/production';

const capture='2026-10-13T21:00:00.000Z'; // terça, 18:00 Fortaleza
function work(extra:Partial<Work>={}):Work{
  return {id:'video-1',title:'Vídeo teste',clientName:'Cliente sintético',
    stage:'editing',capturedAt:capture,createdAt:capture,updatedAt:capture,history:[],...extra};
}
test('72h começa 00h do dia seguinte à gravação em Fortaleza',()=>{
 const t=deadlineFor(capture);
 assert.deepEqual(t,{
   startedAt:'2026-10-14T03:00:00.000Z',
   targetAt:'2026-10-16T03:00:00.000Z',
   dueAt:'2026-10-17T03:00:00.000Z'
 });
});
test('manhã e noite da mesma data de gravação geram o mesmo prazo',()=>{
 assert.deepEqual(deadlineFor('2026-10-13T03:02:00Z'),deadlineFor('2026-10-14T02:59:00Z'));
 assert.notDeepEqual(deadlineFor('2026-10-14T03:01:00Z'),deadlineFor(capture));
});
test('sem hora confirmada de captação não começa relógio',()=>{
 assert.equal(deadlineFor(undefined),null);
 assert.equal(productionUrgency(work({capturedAt:undefined})), 'not_started');
});
test('alerta de meta 48h e vencimento 72h nos instantes exatos',()=>{
 assert.equal(productionUrgency(work(),new Date('2026-10-16T02:59:59Z')),'on_track');
 assert.equal(productionUrgency(work(),new Date('2026-10-16T03:00:00Z')),'at_risk');
 assert.equal(productionUrgency(work(),new Date('2026-10-17T03:00:00Z')),'overdue');
});
test('envio para avaliar no prazo não vira atraso por demora do cliente',()=>{
 const w=work({stage:'review',firstReviewSentAt:'2026-10-15T17:00:00Z'});
 assert.equal(productionUrgency(w,new Date('2026-10-25T10:00:00Z')),'waiting_client');
 assert.equal(productionUrgency({...w,stage:'changes_requested'}),'revisions');
 assert.equal(productionUrgency({...w,stage:'delivered'}),'finished');
});
test('estados respeitam aprovação antes da entrega e ajustes',()=>{
 assert.equal(transitionAllowed('captured','delivered'),false);
 assert.equal(transitionAllowed('editing','review'),true);
 assert.equal(transitionAllowed('review','approved'),true);
 assert.equal(transitionAllowed('review','changes_requested'),true);
 assert.equal(transitionAllowed('approved','delivered'),true);
 assert.equal(transitionAllowed('delivered','editing'),false);
});
test('pagamentos parciais ficam separados do caixa financeiro real',()=>{
 const state=emptyProduction(),w=work({agreedFeeCents:20000});
 state.works.push(w);
 state.payments.push({id:'pay-1',workId:w.id,amountCents:5000,
  receivedAt:capture,createdAt:capture});
 assert.deepEqual(paymentSummary(state,w),{
  receivedCents:5000,remainingCents:15000,status:'partial'
 });
 assert.equal(paymentSummary(state,work({id:'video-sem-preco'})).status,'not_agreed');
});
test('dois vídeos gravados no mesmo dia avisam conflito de edição',()=>{
 const conflict=overlappingEditions([
  work(),work({id:'video-2',capturedAt:'2026-10-13T23:50:00Z'}),
  work({id:'video-cancelado',stage:'cancelled'})
 ]);
 assert.equal(conflict.length,1);
 assert.deepEqual(conflict[0].workIds,['video-1','video-2']);
});
