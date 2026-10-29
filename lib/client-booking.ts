import type { ClientRequest } from '@/lib/types';
import type { ProductionData } from '@/lib/production';
import { audit, getState } from '@/lib/store';
import { mutateStateSafely } from '@/lib/state-mutation';
import { requestWorkIds, syncAcceptedVideoRequests } from '@/lib/client-request-production';
import { isProductionFinished } from '@/lib/production';

export function bookingDepositCents(totalCents: number) {
  return Math.ceil(totalCents / 2);
}

export function requestPaymentsCents(request: ClientRequest, production: ProductionData) {
  const workIds = new Set(requestWorkIds(request));
  return production.payments.filter(payment => workIds.has(payment.workId)).reduce((sum, payment) => sum + payment.amountCents, 0);
}

/** Confirm a requested time only after the owner has recorded at least 50% received. */
export async function reservePaidClientBooking(requestId: string, production: ProductionData) {
  const before = await getState();
  const request = before.clientRequests.find(item => item.id === requestId);
  if (!request || request.status !== 'accepted' || request.deliveryMode !== 'video' || request.cancellation || !request.scheduleProposalAt || request.bookingStatus !== 'awaiting_deposit') return 'unchanged' as const;
  if (requestPaymentsCents(request, production) < bookingDepositCents(request.agreedPriceCents)) return 'awaiting_deposit' as const;
  const workIds = new Set(requestWorkIds(request));
  const proposedAt = request.scheduleProposalAt;
  const result = await mutateStateSafely<'reserved' | 'conflict' | 'unchanged'>(state => {
    const target = state.clientRequests.find(item => item.id === requestId);
    if (!target || target.status !== 'accepted' || target.deliveryMode !== 'video' || target.cancellation || target.bookingStatus !== 'awaiting_deposit' || target.scheduleProposalAt !== proposedAt) return 'unchanged';
    if (requestPaymentsCents(target, production) < bookingDepositCents(target.agreedPriceCents)) return 'unchanged';
    const expired = Date.parse(proposedAt) <= Date.now();
    const stateConflict = state.clientRequests.some(item => item.id !== requestId && item.status === 'accepted' && item.scheduledAt === proposedAt);
    const productionConflict = production.works.some(work => !workIds.has(work.id) && !isProductionFinished(work) && !work.capturedAt && work.scheduledAt === proposedAt);
    if (expired || stateConflict || productionConflict) {
      target.bookingStatus = 'deposit_paid_reschedule_needed';
      target.scheduleMessage = expired ? 'Pagamento confirmado. Essa data passou; vamos combinar outra por este link.' : 'Pagamento confirmado. Esse horário ficou indisponível; vamos combinar outro por este link.';
      target.updatedAt = new Date().toISOString();
      audit(state, { action: 'client_request.deposit_schedule_conflict', collection: 'clientRequests', recordId: requestId, summary: proposedAt });
      return 'conflict';
    }
    target.scheduledAt = proposedAt;
    target.bookingStatus = 'confirmed';
    target.bookingReservedAt ||= new Date().toISOString();
    target.scheduleMessage = undefined;
    target.updatedAt = new Date().toISOString();
    audit(state, { action: 'client_request.schedule_reserved_after_deposit', collection: 'clientRequests', recordId: requestId, summary: proposedAt });
    return 'reserved';
  });
  if (result === 'reserved') {
    try { await syncAcceptedVideoRequests(await getState(), requestId); } catch { /* GET on the owner panel repairs this sync. */ }
  }
  return result;
}

