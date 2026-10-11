import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
 addIfUnique, campaignKey, containsCampaignCode,
 emptyCampaignStore, metrics, type CampaignEvent
} from '../lib/campaigns.ts';

function fixture(){
 const s=emptyCampaignStore();
 s.campaigns.push({
  id:'arte-print',title:'Semana da Criança',business:'Arte Print',
  code:'CRIANCA20',status:'active',adSpendCents:1000,
  createdAt:'2026-10-10T12:00:00Z',updatedAt:'2026-10-10T12:00:00Z'
 });
 return s;
}
function event(kind: CampaignEvent['kind'],id:string,customerKey?:string): CampaignEvent {
 return {id,campaignId:'arte-print',kind,source:'meta_whatsapp',
  customerKey,providerEventId:'wa-'+id,confirmed:true,
  amountCents:kind==='sale'?6500:0,occurredAt:'2026-10-13T10:00:00Z',
  createdAt:'2026-10-13T10:00:00Z'};
}
test('identifica código completo sem confundir prefixos ou outras palavras',()=>{
 assert.equal(campaignKey(' crianca20 '),'CRIANCA20');
 assert.equal(containsCampaignCode('Quero CRIANCA20, por favor','CRIANCA20'),true);
 assert.equal(containsCampaignCode('CRIANCA200','CRIANCA20'),false);
 assert.equal(containsCampaignCode('PROMOCAO CRIANCA20 OK','CRIANCA20'),true);
 assert.equal(containsCampaignCode('apenas CRIANCA','CRIANCA20'),false);
});
test('Meta duplicada e múltiplas mensagens da mesma pessoa não inflacionam contatos',()=>{
 const s=fixture();
 assert.equal(addIfUnique(s,event('contact','1','a')),true);
 assert.equal(addIfUnique(s,event('contact','1','a')),false);
 assert.equal(addIfUnique(s,event('contact','2','a')),false);
 assert.equal(addIfUnique(s,event('contact','3','b')),true);
 assert.equal(metrics(s,'arte-print').contacts,2);
});
test('contato WhatsApp não é orçamento nem venda; real receita só pela venda confirmada',()=>{
 const s=fixture();
 addIfUnique(s,event('contact','1','a'));
 assert.equal(metrics(s,'arte-print').quotes,0);
 assert.equal(metrics(s,'arte-print').revenueCents,0);
 addIfUnique(s,event('quote','2','a'));
 addIfUnique(s,event('sale','3','a'));
 assert.equal(metrics(s,'arte-print').contacts,1);
 assert.equal(metrics(s,'arte-print').quotes,1);
 assert.equal(metrics(s,'arte-print').salesCount,1);
 assert.equal(metrics(s,'arte-print').revenueCents,6500);
 assert.equal(metrics(s,'arte-print').netAfterMediaCents,5500);
});
test('dados de campanhas separadas não se misturam',()=>{
 const s=fixture();
 s.campaigns.push({...s.campaigns[0],id:'outro',code:'OUTRO20'});
 addIfUnique(s,event('contact','1','a'));
 assert.equal(metrics(s,'outro').contacts,0);
});
test('métrica ausente não vira zero inventado',()=>{
 const s=fixture();
 assert.equal(metrics(s,'arte-print').instagram,null);
 assert.equal(metrics(s,'arte-print').salesRate,null);
});
