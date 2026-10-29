import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { audit, getState } from '@/lib/store';
import { mutateStateSafely } from '@/lib/state-mutation';
import { requestWorkIds, syncAcceptedVideoRequests } from '@/lib/client-request-production';
import { isProductionFinished } from '@/lib/production';
import { readProduction } from '@/lib/production-store';
import { bookingDepositCents, requestPaymentsCents, reservePaidClientBooking } from '@/lib/client-booking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 2_000) return NextResponse.json({ error: 'Pedido muito grande.' }, { status: 413 });
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 }); }
    const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
    const token = text(body.token, 100), action = text(body.action, 30), message = text(body.message, 500);
    if (!/^[\w-]{30,100}$/.test(token) || !['confirm', 'request-change'].includes(action) || (action === 'request-change' && message.length < 5)) return NextResponse.json({ error: 'Escolha uma opção. Se pedir outra data, conte qual horário funciona para você.' }, { status: 400 });
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const state = await getState();
    const request = state.clientRequests.find(item => item.portalTokenHash && /^[a-f0-9]{64}$/.test(item.portalTokenHash) && timingSafeEqual(Buffer.from(item.portalTokenHash, 'hex'), Buffer.from(tokenHash, 'hex')));
    if (!request || request.status !== 'accepted' || request.deliveryMode !== 'video') return invalid();
    if (request.cancellation) return NextResponse.json({ error: 'Este pedido está em processo de cancelamento.' }, { status: 409 });
    if (action === 'request-change') {
      if (request.bookingStatus === 'change_requested' && request.scheduleMessage === message) return NextResponse.json({ ok: true, duplicate: true });
      await mutateStateSafely(current => {
        const target = current.clientRequests.find(item => item.id === request.id);
        if (target?.status === 'accepted' && target.bookingStatus === 'change_requested' && target.scheduleMessage === message) return;
        if (!target || target.status !== 'accepted' || !target.scheduleProposalAt || !['proposed', 'reschedule_proposed'].includes(target.bookingStatus || '')) throw new Error('NO_ACTIVE_PROPOSAL');
        target.bookingStatus = 'change_requested'; target.scheduleMessage = message; target.updatedAt = new Date().toISOString();
        audit(current, { action: 'client_request.schedule_change_requested', collection: 'clientRequests', recordId: target.id, summary: message });
      });
      return NextResponse.json({ ok: true });
    }
    if (request.bookingStatus === 'confirmed' && request.scheduledAt === request.scheduleProposalAt) return NextResponse.json({ ok: true, duplicate: true });
    const proposedAt = request.scheduleProposalAt;
    if (!proposedAt || !['proposed', 'reschedule_proposed'].includes(request.bookingStatus || '') || Date.parse(proposedAt) <= Date.now()) return NextResponse.json({ error: 'Esta proposta de horário venceu. Aguarde uma nova data.' }, { status: 409 });
    if (body.acceptCancellationTerms !== true && !request.cancellationTermsAcceptedAt) return NextResponse.json({ error: 'Leia e aceite as regras de cancelamento antes de escolher o horário.' }, { status: 400 });
    const workIds = new Set(requestWorkIds(request));
    const production = await readProduction();
    const alreadyPaid = requestPaymentsCents(request, production) >= bookingDepositCents(request.agreedPriceCents);
    if (alreadyPaid && production.works.some(work => !workIds.has(work.id) && !isProductionFinished(work) && !work.capturedAt && work.scheduledAt === proposedAt)) return NextResponse.json({ error: 'Esse horário acabou de ficar ocupado. Avise pelo pedido para escolher outra data.' }, { status: 409 });
    await mutateStateSafely(current => {
      const target = current.clientRequests.find(item => item.id === request.id);
      if (target?.status === 'accepted' && target.bookingStatus === 'confirmed' && target.scheduledAt === proposedAt) return;
      if (!target || target.status !== 'accepted' || target.scheduleProposalAt !== proposedAt || !['proposed', 'reschedule_proposed'].includes(target.bookingStatus || '')) throw new Error('PROPOSAL_CHANGED');
      if (Date.parse(proposedAt) <= Date.now()) throw new Error('PROPOSAL_EXPIRED');
      const paid = requestPaymentsCents(target, production) >= bookingDepositCents(target.agreedPriceCents);
      const conflict = paid && current.clientRequests.some(item => item.id !== target.id && item.status === 'accepted' && item.scheduledAt === proposedAt);
      if (conflict) throw new Error('BOOKING_CONFLICT');
      target.scheduleMessage = undefined; target.updatedAt = new Date().toISOString();
      if (body.acceptCancellationTerms === true) target.cancellationTermsAcceptedAt ||= new Date().toISOString();
      if (paid) {
        target.scheduledAt = proposedAt; target.bookingStatus = 'confirmed';
        target.bookingReservedAt ||= new Date().toISOString();
        audit(current, { action: 'client_request.schedule_reserved_after_deposit', collection: 'clientRequests', recordId: target.id, summary: proposedAt });
      } else {
        target.bookingStatus = 'awaiting_deposit';
        audit(current, { action: 'client_request.schedule_waiting_for_deposit', collection: 'clientRequests', recordId: target.id, summary: proposedAt });
      }
    });
    if (!alreadyPaid) {
      const reservation = await reservePaidClientBooking(request.id, await readProduction());
      if (reservation === 'reserved') return NextResponse.json({ ok: true, bookingStatus: 'confirmed', message: 'Pagamento mínimo confirmado. Sua data está reservada.' });
      if (reservation === 'conflict') return NextResponse.json({ ok: true, bookingStatus: 'deposit_paid_reschedule_needed', message: 'Pagamento confirmado, mas esse horário ficou indisponível. Vamos combinar outro por este link.' });
      return NextResponse.json({ ok: true, bookingStatus: 'awaiting_deposit', message: 'Horário escolhido. Ele será reservado após a confirmação do pagamento de 50%.' });
    }
    let productionSyncPending = false;
    try { await syncAcceptedVideoRequests(await getState(), request.id); } catch { productionSyncPending = true; }
    return NextResponse.json({ ok: true, productionSyncPending, message: productionSyncPending ? 'Data confirmada. A Produção será atualizada ao recarregar.' : undefined });
  } catch (error) {
    const reason = error instanceof Error ? error.message : '';
    if (reason === 'NO_ACTIVE_PROPOSAL' || reason === 'PROPOSAL_CHANGED') return NextResponse.json({ error: 'Essa proposta mudou. Atualize o acompanhamento antes de responder.' }, { status: 409 });
    if (reason === 'PROPOSAL_EXPIRED') return NextResponse.json({ error: 'Essa data já passou. Aguarde uma nova proposta.' }, { status: 409 });
    if (reason === 'BOOKING_CONFLICT') return NextResponse.json({ error: 'Esse horário acabou de ser confirmado para outro trabalho. Aguarde uma nova proposta.' }, { status: 409 });
    return NextResponse.json({ error: 'Não foi possível salvar sua resposta. Tente novamente.' }, { status: 500 });
  }
}

function invalid() { return NextResponse.json({ error: 'Link de acompanhamento inválido.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } }); }
