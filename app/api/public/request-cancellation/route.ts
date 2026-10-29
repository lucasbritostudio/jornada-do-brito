import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getState, audit } from '@/lib/store';
import { mutateStateSafely } from '@/lib/state-mutation';
import { requestPaymentsCents } from '@/lib/client-booking';
import { readProduction } from '@/lib/production-store';
import { requestWorkIds } from '@/lib/client-request-production';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const COOLING_OFF_MS = 7 * 24 * 60 * 60 * 1000;
const CANCELLATION_RATE_BPS = 1_000;
const REFUND_TARGET_MS = 48 * 60 * 60 * 1000;

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 2_000) return NextResponse.json({ error: 'Pedido muito grande.' }, { status: 413 });
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 }); }
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
    if (!/^[\w-]{30,100}$/.test(token)) return invalidLink();
    const hash = createHash('sha256').update(token).digest();
    const state = await getState();
    const request = state.clientRequests.find(item => {
      if (!item.portalTokenHash || !/^[a-f0-9]{64}$/.test(item.portalTokenHash)) return false;
      return timingSafeEqual(Buffer.from(item.portalTokenHash, 'hex'), hash);
    });
    if (!request || request.status !== 'accepted' || request.deliveryMode !== 'video') return invalidLink();
    if (request.cancellation) return NextResponse.json({ ok: true, cancellation: request.cancellation, duplicate: true });
    const production = await readProduction();
    const paidCents = requestPaymentsCents(request, production);
    if (paidCents <= 0) return NextResponse.json({ error: 'Ainda não há pagamento registrado para este pedido.' }, { status: 409 });
    const ids = new Set(requestWorkIds(request));
    const started = production.works.some(work => ids.has(work.id) && (Boolean(work.capturedAt) || !['planned', 'scheduled', 'cancelled'].includes(work.stage)));
    const now = new Date(), at = now.toISOString();
    const reservedAt = request.bookingReservedAt;
    const withinCoolingOff = Boolean(reservedAt && now.getTime() <= Date.parse(reservedAt) + COOLING_OFF_MS);
    const rule = withinCoolingOff ? 'cooling_off_full_refund' : started ? 'manual_review' : reservedAt && request.cancellationTermsAcceptedAt ? 'reservation_fee_10_percent' : 'no_reservation_full_refund';
    const feeCents = rule === 'reservation_fee_10_percent' ? Math.min(paidCents, Math.ceil(request.agreedPriceCents * CANCELLATION_RATE_BPS / 10_000)) : rule === 'manual_review' ? undefined : 0;
    const refundCents = feeCents === undefined ? undefined : Math.max(0, paidCents - feeCents);
    const result = await mutateStateSafely(current => {
      const target = current.clientRequests.find(item => item.id === request.id);
      if (!target || target.status !== 'accepted' || target.deliveryMode !== 'video') throw new Error('CANCELLATION_NOT_ALLOWED');
      if (target.cancellation) return { cancellation: target.cancellation, duplicate: true };
      target.cancellation = {
        requestedAt: at,
        status: rule === 'manual_review' ? 'review_required' : 'refund_pending',
        reason: reason || undefined,
        rule,
        paidCents,
        feeCents,
        refundCents,
        refundDeadlineAt: rule === 'cooling_off_full_refund' ? at : new Date(now.getTime() + REFUND_TARGET_MS).toISOString(),
      };
      target.updatedAt = at;
      audit(current, { action: 'client_request.cancellation_requested', collection: 'clientRequests', recordId: target.id, summary: `${rule}; refund ${refundCents ?? 'needs review'}` });
      return { cancellation: target.cancellation, duplicate: false };
    });
    return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const reason = error instanceof Error ? error.message : '';
    if (reason === 'CANCELLATION_NOT_ALLOWED') return NextResponse.json({ error: 'Este pedido não pode ser cancelado por este link.' }, { status: 409 });
    return NextResponse.json({ error: 'Não foi possível registrar o cancelamento. Tente novamente.' }, { status: 500 });
  }
}

function invalidLink() { return NextResponse.json({ error: 'Link de acompanhamento inválido.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } }); }
