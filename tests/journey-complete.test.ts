import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as sdk from '@vercel/blob';

const memory = new Map<string, { text: string; etag: string }>();
let version = 0, authenticated = true, failProduction = false, failFinance = false;
mock.module('@vercel/blob', { namedExports: {
  ...sdk,
  head: async (path: string) => { const item = memory.get(path); if (!item) throw new sdk.BlobNotFoundError(); return { etag: item.etag }; },
  get: async (path: string) => { const item = memory.get(path); return item ? { statusCode: 200, stream: new Response(item.text).body, blob: { etag: `delivery-${item.etag}` } } : null; },
  put: async (path: string, text: string, options: { ifMatch?: string; allowOverwrite?: boolean }) => {
    if (path === 'jornada/production-v1.json' && failProduction) { failProduction = false; throw new Error('synthetic production outage'); }
    if (path === 'jornada/state.json' && failFinance) { failFinance = false; throw new Error('synthetic finance outage'); }
    const current = memory.get(path);
    if (current && (options.ifMatch !== current.etag || !options.allowOverwrite)) throw new sdk.BlobPreconditionFailedError();
    const etag = `storage-${++version}`; memory.set(path, { text, etag }); return { etag };
  },
  list: async () => ({ blobs: [] }),
} });
mock.module(pathToFileURL(resolve('lib/auth.ts')).href, { namedExports: { requireAuthenticated: async () => { if (!authenticated) throw new Error('UNAUTHORIZED'); } } });
const store = await import('../lib/store');
const productionStore = await import('../lib/production-store');
const catalog = await import('../app/api/public/catalog/route');
const orders = await import('../app/api/client-requests/route');
const production = await import('../app/api/production/route');
const portal = await import('../app/api/public/request-status/route');
const booking = await import('../app/api/public/request-booking/route');
const cancellation = await import('../app/api/public/request-cancellation/route');
const { deadlineForWork } = await import('../lib/production');
const { applyApprovedJourneySetup } = await import('../lib/journey-setup');
const { executeDomainAction } = await import('../lib/domain-actions');
function reset() {
  memory.clear(); version = 0; authenticated = true; failProduction = false; failFinance = false;
  const state = store.defaultState();
  state.financialAccounts = [{ id: 'bank-1', name: 'Conta sintética', type: 'bank', openingBalanceCents: 0, currentBalanceCents: 0, active: true, createdAt: state.createdAt, updatedAt: state.updatedAt }];
  memory.set('jornada/state.json', { text: JSON.stringify(state), etag: `storage-${++version}` });
}
const input = (serviceId = 'brito-video-pacote-3', suffix = '01') => ({ requestId: `synthetic-request-2026-${suffix}`, portalToken: `synthetic-personal-token-2026-0000-${suffix}`, serviceId, name: 'Pessoa de teste', email: 'teste@example.com', phone: '5598999990000', objective: 'Apresentar os produtos para novos clientes.', note: 'Mostrar os produtos', consent: true });
async function post(route: any, path: string, body: any) { const response = await route.POST(new Request(`https://localhost${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })); return { status: response.status, data: await response.json() }; }
const order = (body: any) => post(catalog, '/api/public/catalog', body);
const accept = (id: string) => post(orders, '/api/client-requests', { id, action: 'accept' });
const pay = (workId: string, amountCents: number, operationId: string) => post(production, '/api/production', { action: 'payment', workId, amountCents, operationId, accountId: 'bank-1', confirmed: true });

test('approved catalog and portfolio are prepared once, with owner edits preserved', async () => {
  reset(); const state = await store.getState();
  assert.deepEqual(state.serviceCatalog.map(item => [item.videoQuantity, item.priceCents]), [[1,39700],[3,98700],[4,100000]]);
  assert.equal(state.receivables.length, 0); assert.equal(state.transactions.length, 0);
  state.serviceCatalog[0].name = 'Nome ajustado pelo proprietário'; await store.saveState(state);
  assert.equal((await store.getState()).serviceCatalog[0].name, 'Nome ajustado pelo proprietário');
  const draft = store.defaultState();
  draft.portfolioItems = [{ id:'975ed9d7-463e-45e8-a4b2-bd91ce5b4b88', title:'Aniversario', description:'' }, { id:'c9c23b60-a4ff-4ea3-95f7-7e5857b53d51', title:'Meu título', description:'Minha descrição' }] as any;
  applyApprovedJourneySetup(draft);
  assert.equal(draft.portfolioItems[0].title, 'Aniversário de 15 anos'); assert.ok(draft.portfolioItems[0].description);
  assert.equal(draft.portfolioItems[1].title, 'Meu título'); assert.equal(draft.portfolioItems[1].description, 'Minha descrição');
});
test('one real request creates three videos; partial and final payments update the same receivable once', async () => {
  reset(); const request = input();
  assert.equal((await order(request)).status, 201);
  assert.equal((await order(request)).status, 200);
  let state = await store.getState(); assert.equal(state.receivables.length, 0); assert.equal(state.transactions.length, 0);
  assert.equal((await accept(request.requestId)).status, 200); assert.equal((await accept(request.requestId)).status, 200);
  let data = await productionStore.readProduction();
  assert.equal(data.works.length, 3); assert.equal(data.works.reduce((sum, item) => sum + item.agreedFeeCents!, 0), 98700);
  state = await store.getState(); assert.equal(state.projects.length,1); assert.equal(state.receivables.length,1); assert.equal(state.receivables[0].amountCents,98700);
  const ids = state.clientRequests[0].workIds!;
  assert.equal((await pay(ids[0], 10000, 'synthetic-payment-partial')).status,200);
  assert.equal((await pay(ids[0], 10000, 'synthetic-payment-partial')).status,200);
  state = await store.getState(); assert.equal(state.receivables[0].amountCents,88700); assert.equal(state.transactions.length,1); assert.equal(state.financialAccounts[0].currentBalanceCents,10000);
  assert.equal((await pay(ids[0], 22900, 'synthetic-payment-remainder')).status,200);
  assert.equal((await pay(ids[1], 32900, 'synthetic-payment-video-2')).status,200);
  assert.equal((await pay(ids[2], 32900, 'synthetic-payment-video-3')).status,200);
  state = await store.getState(); assert.equal(state.receivables[0].status,'received'); assert.equal(state.receivables[0].amountCents,0); assert.equal(state.receivables[0].receivedCents,98700); assert.equal(state.financialAccounts[0].currentBalanceCents,98700);
  const tracking = await post(portal, '/api/public/request-status', { token: request.portalToken });
  assert.equal(tracking.data.videos.length,3); assert.equal(tracking.data.receivedCents,98700); assert.equal(tracking.data.remainingCents,0);
  assert.equal(JSON.stringify(tracking.data).includes('teste@example.com'),false); assert.equal(JSON.stringify(tracking.data).includes('bank-1'),false);
  assert.equal((await pay(ids[0], 1, 'synthetic-overpayment')).status,400);
  assert.equal((await pay(ids[1], 10000, 'synthetic-payment-partial')).status,400);
});
test('package keeps its agreed quantity and value after the catalog is edited', async () => {
  reset(); const request=input('brito-video-pacote-4'); await order(request);
  const state=await store.getState(); const service=state.serviceCatalog.find(item=>item.id===request.serviceId)!; service.priceCents=200000;service.videoQuantity=2; await store.saveState(state);
  assert.equal((await accept(request.requestId)).status,200);
  const works=(await productionStore.readProduction()).works;
  assert.equal(works.length,4);assert.equal(works.reduce((sum,item)=>sum+item.agreedFeeCents!,0),100000);
});
test('approval survives a production outage and repairs all videos without duplicating the contract', async () => {
  reset(); const request=input('brito-video-pacote-4'); await order(request);failProduction=true;
  const response=await accept(request.requestId);assert.equal(response.data.productionSyncPending,true);
  let state=await store.getState();assert.equal(state.clientRequests[0].status,'accepted');assert.equal(state.receivables.length,1);assert.equal(state.transactions.length,0);
  assert.equal((await orders.GET()).status,200); assert.equal((await productionStore.readProduction()).works.length,4);
  await accept(request.requestId);state=await store.getState();assert.equal(state.receivables.length,1);assert.equal(state.projects.length,1);
});
test('finance outage is repaired on refresh without recording the same payment twice', async () => {
  reset();const request=input('brito-video-avulso');await order(request);await accept(request.requestId);
  const id=(await store.getState()).clientRequests[0].workId!;failFinance=true;
  assert.equal((await pay(id,39700,'synthetic-finance-repair')).status,503);
  assert.equal((await productionStore.readProduction()).payments.length,1);
  assert.equal((await production.GET()).status,200);
  const state=await store.getState();assert.equal(state.transactions.length,1);assert.equal(state.financialAccounts[0].currentBalanceCents,39700);assert.equal(state.receivables[0].status,'received');
});
test('72h starts after both capture and materials, with an independent clock per video', async () => {
  reset();const request=input();await order(request);await accept(request.requestId);
  const ids=(await store.getState()).clientRequests[0].workIds!;
  assert.equal((await post(production,'/api/production',{action:'stage',workId:ids[0],stage:'captured',capturedAt:'2026-10-10T15:00:00Z'})).status,200);
  let works=(await productionStore.readProduction()).works;assert.equal(deadlineForWork(works.find(item=>item.id===ids[0])!),null);
  assert.equal((await post(production,'/api/production',{action:'stage',workId:ids[0],stage:'review'})).status,400);
  assert.equal((await post(production,'/api/production',{action:'materials-ready',workId:ids[0],materialsReadyAt:'2026-10-11T18:30:00Z'})).status,200);
  works=(await productionStore.readProduction()).works;
  assert.equal(deadlineForWork(works.find(item=>item.id===ids[0])!)?.dueAt,'2026-10-14T18:30:00.000Z');
  assert.equal(deadlineForWork(works.find(item=>item.id===ids[1])!),null);
  await post(production,'/api/production',{action:'materials-ready',workId:ids[0]});
  assert.equal(deadlineForWork((await productionStore.readProduction()).works.find(item=>item.id===ids[0])!)?.dueAt,'2026-10-14T18:30:00.000Z');
});
test('chosen recording date is not reserved until at least 50% is received', async () => {
  reset();const request=input('brito-video-avulso','deposit');await order(request);await accept(request.requestId);
  const scheduledAt='2026-11-05T15:00:00.000Z';
  assert.equal((await post(orders,'/api/client-requests',{id:request.requestId,action:'propose-schedule',scheduledAt})).status,200);
  const choice=await post(booking,'/api/public/request-booking',{token:request.portalToken,action:'confirm',acceptCancellationTerms:true});
  assert.equal(choice.status,200);assert.equal(choice.data.bookingStatus,'awaiting_deposit');
  let state=await store.getState();assert.equal(state.clientRequests[0].scheduledAt,undefined);
  let work=(await productionStore.readProduction()).works[0];assert.equal(work.scheduledAt,undefined);
  assert.equal((await pay(work.id,19849,'synthetic-deposit-partial')).status,200);
  state=await store.getState();assert.equal(state.clientRequests[0].scheduledAt,undefined);assert.equal(state.clientRequests[0].bookingStatus,'awaiting_deposit');
  assert.equal((await pay(work.id,1,'synthetic-deposit-complete')).status,200);
  state=await store.getState();assert.equal(state.clientRequests[0].scheduledAt,scheduledAt);assert.equal(state.clientRequests[0].bookingStatus,'confirmed');
  work=(await productionStore.readProduction()).works[0];assert.equal(work.scheduledAt,scheduledAt);
});
test('online cancellation in 7 days has no fee and after 7 days calculates the accepted 10% fee', async () => {
  reset();const request=input('brito-video-avulso','cancel-fee');await order(request);await accept(request.requestId);
  const scheduledAt='2026-11-06T15:00:00.000Z';
  await post(orders,'/api/client-requests',{id:request.requestId,action:'propose-schedule',scheduledAt});
  await post(booking,'/api/public/request-booking',{token:request.portalToken,action:'confirm',acceptCancellationTerms:true});
  const work=(await productionStore.readProduction()).works[0];
  await pay(work.id,19850,'synthetic-cancel-paid');
  let result=await post(cancellation,'/api/public/request-cancellation',{token:request.portalToken,reason:'Não vou mais precisar.'});
  assert.equal(result.status,200);assert.equal(result.data.cancellation.rule,'cooling_off_full_refund');assert.equal(result.data.cancellation.feeCents,0);assert.equal(result.data.cancellation.refundCents,19850);

  reset();const later=input('brito-video-avulso','cancel-after-7');await order(later);await accept(later.requestId);
  await post(orders,'/api/client-requests',{id:later.requestId,action:'propose-schedule',scheduledAt});
  await post(booking,'/api/public/request-booking',{token:later.portalToken,action:'confirm',acceptCancellationTerms:true});
  const laterWork=(await productionStore.readProduction()).works[0];await pay(laterWork.id,19850,'synthetic-cancel-later-paid');
  let state=await store.getState();const old=new Date(Date.now()-10*24*60*60*1000).toISOString();state.clientRequests[0].bookingReservedAt=old;await store.saveState(state);
  result=await post(cancellation,'/api/public/request-cancellation',{token:later.portalToken});
  assert.equal(result.status,200);assert.equal(result.data.cancellation.rule,'reservation_fee_10_percent');assert.equal(result.data.cancellation.feeCents,3970);assert.equal(result.data.cancellation.refundCents,15880);
  assert.equal((await post(orders,'/api/client-requests',{id:later.requestId,action:'complete-refund',accountId:'bank-1'})).status,200);
  state=await store.getState();assert.equal(state.clientRequests[0].cancellation?.status,'refunded');assert.equal(state.receivables[0].status,'cancelled');assert.equal(state.transactions.filter(item=>item.importKey==='client-request-refund:'+later.requestId).length,1);
  assert.equal((await productionStore.readProduction()).works[0].stage,'cancelled');
});
test('concurrent submissions and approval do not lose requests, videos, projects or receivables', async () => {
  reset();const requests=[input('brito-video-avulso','01'),input('brito-video-pacote-4','02')];
  const submissions=await Promise.all(requests.map(order));assert.ok(submissions.every(item=>item.status===201));
  const accepts=await Promise.all(requests.map(request=>accept(request.requestId)));assert.ok(accepts.every(item=>item.status===200));
  const state=await store.getState();assert.equal(state.clientRequests.length,2);assert.equal(state.projects.length,2);assert.equal(state.receivables.length,2);assert.equal((await productionStore.readProduction()).works.length,5);
});
test('invalid/reused submissions, hidden services, owner-only actions and invalid links are blocked', async () => {
  reset();const request=input();assert.equal((await order({...request,phone:'abc'})).status,400);assert.equal((await order({...request,consent:false})).status,400);
  await order(request);assert.equal((await order({...request,portalToken:'another-token-000000000000000000000'})).status,409);assert.equal((await order({...request,note:'Outro projeto'})).status,409);
  const state=await store.getState();state.serviceCatalog[0].published=false;await store.saveState(state);assert.equal((await order(input('brito-video-avulso','02'))).status,400);
  assert.equal((await post(portal,'/api/public/request-status',{token:'not-the-correct-token-000000000000'})).status,404);
  authenticated=false;assert.equal((await accept(request.requestId)).status,401);assert.equal((await production.GET()).status,401);
});
test('a public request cannot overwrite a known contact and the AI cannot receive the same website debt outside Production', async () => {
  reset();const request=input();let state=await store.getState();
  state.contacts.push({id:'known-contact',name:'Nome já conferido',email:request.email,phone:request.phone,lifecycle:'client',createdAt:state.createdAt,updatedAt:state.updatedAt});await store.saveState(state);
  await order({...request,name:'Nome enviado pelo formulário'});state=await store.getState();assert.equal(state.contacts.find(item=>item.id==='known-contact')!.name,'Nome já conferido');
  await accept(request.requestId);state=await store.getState();
  assert.throws(()=>executeDomainAction(state,{name:'receive_receivable',args:{reference:state.receivables[0].title,amount_cents:10000,account_name:'Conta sintética',occurred_on:'2026-10-28'}} as any),/Registrar recebimento/);
  assert.equal(state.transactions.length,0);assert.equal(state.financialAccounts[0].currentBalanceCents,0);
});
