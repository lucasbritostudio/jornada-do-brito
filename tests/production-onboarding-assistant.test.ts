import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyProduction,deadlineFor} from '../lib/production';
import {mergeKnownProduction,mergeKnownContacts} from '../lib/production-onboarding';
import {defaultState} from '../lib/store';
import {applyProductionStage,recordProductionPayment,simpleProductionIntent,addProductionVideo} from '../lib/production-assistant';

test('importação inicial é idempotente e nunca cria pagamento nem contrato fictício',()=>{
 const p=emptyProduction(),s=defaultState();
 assert.equal(mergeKnownContacts(s),7);
 assert.equal(mergeKnownContacts(s),0);
 assert.equal(mergeKnownProduction(p),3);
 assert.equal(mergeKnownProduction(p),0);
 assert.equal(p.payments.length,0);
 assert.equal(p.works.filter(x=>x.clientName==='Garreto').length,1);
 assert.equal(p.works.some(x=>x.clientName.includes('Arte Print')),false);
 assert.equal(p.works.some(x=>x.clientName.includes('Mundo do Celular')),false);
 assert.equal(s.contacts.some(x=>x.name==='Arte Print (contato Alan)'&&x.lifecycle==='prospect'),true);
 assert.equal(s.transactions.length,0);
 assert.equal(s.receivables.length,0);
});
test('AI local interpreta captação agora e grava a hora real sem inventar prazo',()=>{
 const p=emptyProduction();mergeKnownProduction(p);
 const msg='Acabei de gravar o vídeo do Garreto agora';
 const decision=simpleProductionIntent(msg,p);
 assert.deepEqual(decision,{name:'production_change_stage',args:{client_name:'Garreto',stage:'captured'}});
 const moment=new Date('2026-10-13T21:30:00.000Z');
 const result=applyProductionStage(p,'Garreto','captured',msg,undefined,moment);
 assert.equal(result.changed,true);
 assert.equal(p.works.find(w=>w.clientName==='Garreto')?.capturedAt,moment.toISOString());
 assert.deepEqual(deadlineFor(moment.toISOString()),{
  startedAt:'2026-10-14T03:00:00.000Z',
  targetAt:'2026-10-16T03:00:00.000Z',
  dueAt:'2026-10-17T03:00:00.000Z'
 });
 assert.equal(applyProductionStage(p,'Garreto','captured',msg,undefined,moment).changed,false);
});
test('não permite horário presumido, prometer entrega ou pular aprovação',()=>{
 const p=emptyProduction();mergeKnownProduction(p);
 assert.throws(()=>applyProductionStage(p,'Garreto','captured','Gravei ontem'),/horário exatos/);
 assert.throws(()=>applyProductionStage(p,'Garreto','delivered','Entreguei o vídeo'),/pular etapas/);
 assert.equal(p.works.find(w=>w.clientName==='Garreto')?.stage,'planned');
});
test('primeiro envio fica fixo mesmo após rodada de ajustes',()=>{
 const p=emptyProduction();mergeKnownProduction(p);
 applyProductionStage(p,'Garreto','captured','Acabei de gravar agora',undefined,new Date('2026-10-13T20:00:00Z'));
 applyProductionStage(p,'Garreto','editing','Estou editando o vídeo',undefined,new Date('2026-10-14T13:00:00Z'));
 applyProductionStage(p,'Garreto','review','Enviei o vídeo para avaliação',undefined,new Date('2026-10-15T13:00:00Z'));
 const first=p.works.find(w=>w.clientName==='Garreto')?.firstReviewSentAt;
 applyProductionStage(p,'Garreto','changes_requested','Cliente pediu ajustes',undefined,new Date('2026-10-15T21:00:00Z'));
 applyProductionStage(p,'Garreto','editing','Estou editando',undefined,new Date('2026-10-16T10:00:00Z'));
 applyProductionStage(p,'Garreto','review','Enviei para avaliação',undefined,new Date('2026-10-16T20:00:00Z'));
 assert.equal(p.works.find(w=>w.clientName==='Garreto')?.firstReviewSentAt,first);
});
test('pagamento só entra se fonte afirmar recebimento e valor literal bater',()=>{
 const p=emptyProduction();mergeKnownProduction(p);
 const op='payment-once-2026';
 assert.throws(()=>recordProductionPayment(p,'Julianny da Nisilene',20000,op,'Julianny prometeu R$ 200'),/Só registro/);
 assert.throws(()=>recordProductionPayment(p,'Julianny da Nisilene',20000,op,'Recebi R$ 100 da Julianny'),/não confere/);
 const yes=recordProductionPayment(p,'Julianny da Nisilene',20000,op,'Recebi R$ 200 da Julianny');
 assert.equal(yes.changed,true);
 assert.equal(p.payments.length,1);
 assert.equal(recordProductionPayment(p,'Julianny da Nisilene',20000,op,'Recebi R$ 200 da Julianny').changed,false);
 assert.equal(p.payments.length,1);
});
test('novos vídeos são planejados sem registro de pagamento',()=>{
 const p=emptyProduction();
 assert.equal(addProductionVideo(p,'Cliente teste','Vídeo 01',undefined,'operation-one-2026').changed,true);
 assert.equal(addProductionVideo(p,'Cliente teste','Vídeo 01',undefined,'operation-two-2026').changed,false);
 assert.equal(p.works.length,1);
 assert.equal(p.payments.length,0);
});
