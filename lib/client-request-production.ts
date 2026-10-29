import type { ClientRequest, WorkspaceState } from './types';
import { changeProduction } from './production-store';
import type { Work } from './production';

export function requestWorkIds(request: ClientRequest) {
  if (request.workIds?.length) return request.workIds;
  const quantity = request.videoQuantity ?? 1;
  return Array.from({ length: quantity }, (_, index) => index === 0 ? (request.workId || `client-work-${request.id}`) : `client-work-${request.id}-${index + 1}`);
}
/** Replay only confirmed contracts. Stable IDs repair a cross-store failure
 * without recreating a paid/edited work or duplicating any financial record. */
export async function syncAcceptedVideoRequests(state: WorkspaceState, onlyId?: string) {
  const accepted = state.clientRequests.filter(request => request.status === 'accepted' && request.deliveryMode === 'video' && (!onlyId || request.id === onlyId));
  if (!accepted.length) return;
  await changeProduction(data => {
    for (const request of accepted) {
      const contact = state.contacts.find(item => item.id === request.contactId);
      if (!contact || !request.projectId) throw new Error('INCOMPLETE_CLIENT_REQUEST');
      const ids = requestWorkIds(request);
      const baseFee = Math.floor(request.agreedPriceCents / ids.length);
      for (let index = 0; index < ids.length; index++) {
        const existing = data.works.find(work => work.id === ids[index]);
        if (existing) {
          if (request.scheduledAt && ['planned', 'scheduled'].includes(existing.stage) && !existing.capturedAt && existing.scheduledAt !== request.scheduledAt) {
            existing.scheduledAt = request.scheduledAt;
            if (existing.stage === 'planned') { existing.stage = 'scheduled'; existing.history.push({ stage: 'scheduled', at: request.updatedAt }); }
            existing.updatedAt = request.updatedAt;
          }
          continue;
        }
        const initialStage = request.scheduledAt ? 'scheduled' : 'planned';
        const work: Work = {
          id: ids[index], clientRequestId: request.id, packageSize: ids.length,
          clientName: contact.name, contactId: contact.id, projectId: request.projectId,
          title: ids.length === 1 ? request.serviceName : `${request.serviceName} — vídeo ${index + 1} de ${ids.length}`,
          stage: initialStage, ...(request.scheduledAt ? { scheduledAt: request.scheduledAt } : {}), agreedFeeCents: baseFee + (index < request.agreedPriceCents % ids.length ? 1 : 0),
          deliveryClockMode: request.deliveryClockMode, notes: request.note,
          createdAt: request.createdAt, updatedAt: request.updatedAt, history: [{ stage: initialStage, at: request.updatedAt }],
        };
        data.works.unshift(work);
      }
    }
  });
}

/** Finish production rows only after a refund is recorded in Financeiro. */
export async function syncCancelledVideoRequests(state: WorkspaceState, onlyId?: string) {
  const cancelled = state.clientRequests.filter(request => request.deliveryMode === 'video' && request.cancellation?.status === 'refunded' && (!onlyId || request.id === onlyId));
  if (!cancelled.length) return;
  await changeProduction(data => {
    for (const request of cancelled) for (const id of requestWorkIds(request)) {
      const work = data.works.find(item => item.id === id);
      if (!work || work.stage === 'cancelled') continue;
      const at = request.cancellation?.refundedAt || new Date().toISOString();
      work.stage = 'cancelled'; work.updatedAt = at; work.history.push({ stage: 'cancelled', at });
    }
  });
}
