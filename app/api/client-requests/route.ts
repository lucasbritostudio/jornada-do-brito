import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { audit, getState } from '@/lib/store';
import { mutateStateSafely } from '@/lib/state-mutation';
import { requestWorkIds, syncAcceptedVideoRequests, syncCancelledVideoRequests } from '@/lib/client-request-production';
import { isBlobConflict } from '@/lib/blob-conflict';
import { ensureValidDate, isProductionFinished } from '@/lib/production';
import { readProduction } from '@/lib/production-store';
import { bookingDepositCents, requestPaymentsCents } from '@/lib/client-booking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function requestSummary(request: { objective?: string; desiredDate?: string; location?: string; note?: string }) {
  return [request.objective && `Objetivo: ${request.objective}`, request.desiredDate && `Data sugerida (a confirmar): ${request.desiredDate}`, request.location && `Local sugerido: ${request.location}`, request.note && `Detalhes: ${request.note}`].filter(Boolean).join('\n');
}
export async function GET() {
  try {
    await requireAuthenticated();
    const state = await getState();
    let productionSyncPending = false;
    try { await syncAcceptedVideoRequests(state); } catch { productionSyncPending = true; }
    try { await syncCancelledVideoRequests(state); } catch { productionSyncPending = true; }
    const production = await readProduction();
    return NextResponse.json({ productionSyncPending, refundAccounts: state.financialAccounts.filter(account => account.active && ['cash', 'bank', 'wallet'].includes(account.type)).map(({ id, name, currentBalanceCents, openingBalanceCents }) => ({ id, name, balanceCents: currentBalanceCents ?? openingBalanceCents })), requests: state.clientRequests.map(({ portalTokenHash, requestFingerprint, materials, ...request }) => {
      const contact = state.contacts.find(item => item.id === request.contactId);
      const depositCents = bookingDepositCents(request.agreedPriceCents);
      const depositReceivedCents = requestPaymentsCents(request, production);
      return { ...request, depositCents, depositReceivedCents, depositRemainingCents: Math.max(0, depositCents - depositReceivedCents), materials: (materials || []).map(({ id, name, contentType, size, createdAt }) => ({ id, name, contentType, size, createdAt })), clientName: contact?.name || 'Cliente', email: contact?.email, phone: contact?.phone };
    }) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  try {
    await requireAuthenticated();
    const body = await req.json();
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!id || !['accept', 'decline', 'propose-schedule', 'complete-refund'].includes(body?.action)) return NextResponse.json({ error: 'Pedido ou ação inválidos.' }, { status: 400 });
    if (body.action === 'propose-schedule') return await proposeSchedule(id, body.scheduledAt);
    if (body.action === 'complete-refund') return await completeRefund(id, body.accountId, body.refundCents);
    await mutateStateSafely(state => {
      const request = state.clientRequests.find(item => item.id === id);
      if (!request) throw new Error('REQUEST_NOT_FOUND');
      if (body.action === 'decline') {
        if (request.status === 'accepted') throw new Error('ALREADY_ACCEPTED');
        if (request.status === 'declined') return;
        request.status = 'declined'; request.updatedAt = new Date().toISOString();
        audit(state, { action: 'client_request.declined', collection: 'clientRequests', recordId: id });
        return;
      }
      if (request.status === 'accepted') return;
      const contact = state.contacts.find(item => item.id === request.contactId);
      const opportunity = state.opportunities.find(item => item.id === request.opportunityId);
      if (!contact || !opportunity) throw new Error('INCOMPLETE_CLIENT_REQUEST');
      const at = new Date().toISOString(), projectId = request.projectId || `client-project-${id}`;
      if (!state.projects.some(item => item.id === projectId)) state.projects.unshift({ id: projectId, contactId: contact.id, opportunityId: opportunity.id, name: request.serviceName, status: 'active', budgetCents: request.agreedPriceCents, projectType: 'other', description: requestSummary(request) || undefined, importKey: `client-request:${id}`, provenance: { kind: 'system', label: 'Contratação pelo site' }, createdAt: request.createdAt, updatedAt: at });
      if (request.deliveryMode === 'video') { request.workIds = requestWorkIds(request); request.workId = request.workIds[0]; }
      else if (!state.tasks.some(item => item.importKey === `client-request:${id}`)) {
        request.taskId = `client-task-${id}`;
        state.tasks.unshift({ id: request.taskId, title: `Iniciar: ${request.serviceName}`, status: 'todo', priority: 'medium', contactId: contact.id, projectId, notes: request.note, importKey: `client-request:${id}`, provenance: { kind: 'system', label: 'Contratação pelo site' }, createdAt: request.createdAt, updatedAt: at });
      }
      request.status = 'accepted'; request.projectId = projectId; request.updatedAt = at;
      contact.lifecycle = 'client'; contact.updatedAt = at;
      opportunity.stage = 'won'; opportunity.certainty = 'confirmed'; opportunity.updatedAt = at;
      if (!state.receivables.some(item => item.importKey === `client-request:${id}`)) state.receivables.unshift({ id: `client-receivable-${id}`, contactId: contact.id, projectId, title: request.serviceName, amountCents: request.agreedPriceCents, agreedAmountCents: request.agreedPriceCents, receivedCents: 0, certainty: 'confirmed', status: 'pending', notes: 'Valor aprovado. O saldo é atualizado com os recebimentos confirmados na Produção.', importKey: `client-request:${id}`, provenance: { kind: 'system', label: 'Contratação pelo site' }, createdAt: request.createdAt, updatedAt: at });
      audit(state, { action: 'client_request.accepted', collection: 'clientRequests', recordId: id, summary: request.serviceName });
    });
    if (body.action === 'accept') {
      try { await syncAcceptedVideoRequests(await getState(), id); }
      catch { return NextResponse.json({ ok: true, productionSyncPending: true, message: 'Pedido aprovado. A produção será sincronizada ao atualizar esta tela; não aceite outra vez.' }); }
    }
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
}
async function proposeSchedule(id: string, rawDate: unknown) {
  let scheduledAt: string;
  try { scheduledAt = ensureValidDate(rawDate); } catch { throw new Error('INVALID_SCHEDULE'); }
  if (Date.parse(scheduledAt) <= Date.now()) throw new Error('INVALID_SCHEDULE');
  const before = await getState();
  const request = before.clientRequests.find(item => item.id === id);
  if (!request || request.status !== 'accepted' || request.deliveryMode !== 'video' || request.cancellation) throw new Error('REQUEST_NOT_SCHEDULABLE');
  const production = await readProduction();
  const workIds = new Set(requestWorkIds(request));
  const works = production.works.filter(work => workIds.has(work.id));
  if (works.some(work => isProductionFinished(work) || work.capturedAt || !['planned', 'scheduled'].includes(work.stage))) throw new Error('SCHEDULE_LOCKED');
  const otherRequestConflict = before.clientRequests.some(item => item.id !== id && item.status === 'accepted' && item.scheduledAt === scheduledAt);
  if (otherRequestConflict || production.works.some(work => !workIds.has(work.id) && !isProductionFinished(work) && !work.capturedAt && work.scheduledAt === scheduledAt)) throw new Error('SCHEDULE_CONFLICT');
  await mutateStateSafely(state => {
    const target = state.clientRequests.find(item => item.id === id);
    if (!target || target.status !== 'accepted' || target.deliveryMode !== 'video' || target.cancellation) throw new Error('REQUEST_NOT_SCHEDULABLE');
    const conflict = state.clientRequests.some(item => item.id !== id && item.status === 'accepted' && item.scheduledAt === scheduledAt);
    if (conflict) throw new Error('SCHEDULE_CONFLICT');
    target.scheduleProposalAt = scheduledAt;
    target.bookingStatus = target.scheduledAt ? 'reschedule_proposed' : 'proposed';
    target.scheduleMessage = undefined;
    target.updatedAt = new Date().toISOString();
    audit(state, { action: 'client_request.schedule_proposed', collection: 'clientRequests', recordId: id, summary: scheduledAt });
  });
  return NextResponse.json({ ok: true });
}
async function completeRefund(id: string, rawAccountId: unknown, rawRefundCents: unknown) {
  const accountId = typeof rawAccountId === 'string' ? rawAccountId.trim() : '';
  const result = await mutateStateSafely(state => {
    const request = state.clientRequests.find(item => item.id === id);
    const cancellation = request?.cancellation;
    if (!request || !cancellation) throw new Error('CANCELLATION_NOT_FOUND');
    if (cancellation.status === 'refunded') return { alreadyApplied: true, productionSyncPending: false };
    if (!['refund_pending', 'review_required'].includes(cancellation.status)) throw new Error('CANCELLATION_NOT_READY');
    const manuallyReviewed = cancellation.status === 'review_required';
    const refundCents = manuallyReviewed ? rawRefundCents : cancellation.refundCents;
    if (!Number.isSafeInteger(refundCents) || Number(refundCents) < 0 || Number(refundCents) > cancellation.paidCents) throw new Error('REFUND_AMOUNT_INVALID');
    if (!manuallyReviewed && refundCents !== cancellation.refundCents) throw new Error('REFUND_AMOUNT_CHANGED');
    const amount = Number(refundCents);
    const account = amount > 0 ? state.financialAccounts.find(item => item.id === accountId && item.active && ['cash', 'bank', 'wallet'].includes(item.type)) : undefined;
    if (amount > 0 && !account) throw new Error('REFUND_ACCOUNT_REQUIRED');
    const importKey = `client-request-refund:${request.id}`;
    const existing = state.transactions.find(item => item.importKey === importKey);
    const at = new Date().toISOString();
    if (!existing && amount > 0 && account) {
      const balance = account.currentBalanceCents ?? account.openingBalanceCents;
      if (balance < amount) throw new Error('REFUND_BALANCE_LOW');
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
      account.currentBalanceCents = balance - amount; account.balanceAsOf = day; account.updatedAt = at;
      state.transactions.unshift({
        id: crypto.randomUUID(), accountId: account.id, actionId: importKey, type: 'expense', amountCents: amount, occurredOn: day,
        category: 'Reembolso de serviço', description: `Reembolso do pedido ${request.serviceName}`,
        contactId: request.contactId, projectId: request.projectId, status: 'cleared', certainty: 'confirmed', importKey,
        provenance: { kind: 'system', label: 'Reembolso de contratação', ref: request.id, updatedAt: at }, createdAt: at, updatedAt: at,
      });
    }
    cancellation.feeCents = cancellation.paidCents - amount;
    cancellation.refundCents = amount;
    cancellation.refundedAt = at;
    cancellation.status = 'refunded';
    cancellation.refundTransactionId = amount > 0 ? existing?.id || state.transactions.find(item => item.importKey === importKey)?.id : undefined;
    request.updatedAt = at;
    const receivable = state.receivables.find(item => item.importKey === `client-request:${request.id}`);
    if (receivable) { receivable.status = 'cancelled'; receivable.amountCents = 0; receivable.updatedAt = at; receivable.notes = 'Serviço cancelado. Pagamentos e eventual reembolso ficam registrados no Financeiro.'; }
    audit(state, { action: 'client_request.refund_completed', collection: 'clientRequests', recordId: request.id, summary: `Reembolso de ${amount} centavos; taxa de ${cancellation.feeCents} centavos` });
    return { alreadyApplied: false, productionSyncPending: true };
  });
  let productionSyncPending = false;
  try { await syncCancelledVideoRequests(await getState(), id); } catch { productionSyncPending = true; }
  return NextResponse.json({ ok: true, ...result, productionSyncPending });
}
function failure(error: unknown) {
  const reason = error instanceof Error ? error.message : '';
  const messages: Record<string, [number, string]> = { UNAUTHORIZED: [401, 'Não autorizado.'], REQUEST_NOT_FOUND: [404, 'Pedido não encontrado.'], ALREADY_ACCEPTED: [409, 'Um pedido aprovado não pode ser recusado nesta tela.'], INCOMPLETE_CLIENT_REQUEST: [409, 'Dados do cliente incompletos.'], INVALID_SCHEDULE: [400, 'Escolha uma data e hora futuras.'], REQUEST_NOT_SCHEDULABLE: [409, 'Aprove este pedido de vídeo antes de propor a gravação.'], SCHEDULE_LOCKED: [409, 'Este trabalho já começou ou foi encerrado; a data não pode ser alterada.'], SCHEDULE_CONFLICT: [409, 'Já existe uma gravação reservada para esse horário. Escolha outro horário.'], CANCELLATION_NOT_FOUND: [404, 'Pedido de cancelamento não encontrado.'], CANCELLATION_NOT_READY: [409, 'Este cancelamento ainda não pode ser concluído.'], REFUND_AMOUNT_INVALID: [400, 'Informe um valor de reembolso entre zero e o total recebido.'], REFUND_AMOUNT_CHANGED: [409, 'O valor calculado não pode ser alterado neste tipo de reembolso.'], REFUND_ACCOUNT_REQUIRED: [400, 'Escolha a conta de onde você fez o reembolso.'], REFUND_BALANCE_LOW: [409, 'O saldo dessa conta não cobre o valor do reembolso. Atualize o saldo ou escolha a conta usada na transferência.'] };
  if (isBlobConflict(error) || reason === 'STATE_WRITE_CONFLICT') return NextResponse.json({ error: 'Outra alteração foi salva ao mesmo tempo. Atualize a tela e tente novamente.' }, { status: 409 });
  const [status, message] = messages[reason] || [500, 'Não foi possível atualizar o pedido.'];
  return NextResponse.json({ error: message }, { status });
}
