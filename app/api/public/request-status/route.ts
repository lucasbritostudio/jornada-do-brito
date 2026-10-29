import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getState } from '@/lib/store';
import { readProduction } from '@/lib/production-store';
import { deadlineForWork } from '@/lib/production';
import { requestWorkIds } from '@/lib/client-request-production';
import { bookingDepositCents, requestPaymentsCents, reservePaidClientBooking } from '@/lib/client-booking';
import { issueSignedToken, presignUrl } from '@vercel/blob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const stages: Record<string, string> = { planned: 'Preparando a gravação', scheduled: 'Gravação agendada', captured: 'Gravação concluída', editing: 'Em edição', review: 'Pronto para você avaliar', changes_requested: 'Ajustes em andamento', approved: 'Aprovado por você', delivered: 'Entregue', cancelled: 'Cancelado' };
export async function POST(req: Request) {
  try {
    const body = await req.json(), token = typeof body?.token === 'string' ? body.token : '';
    if (!/^[\w-]{30,100}$/.test(token)) return invalidLink();
    const digest = createHash('sha256').update(token).digest(); let state = await getState();
    let request = state.clientRequests.find(item => {
      if (!item.portalTokenHash) return false;
      const saved = Buffer.from(item.portalTokenHash, 'hex');
      return saved.length === digest.length && timingSafeEqual(saved, digest);
    });
    if (!request) return invalidLink();
    const ids = requestWorkIds(request), idSet = new Set(ids);
    const production = request.status === 'accepted' && request.deliveryMode === 'video' ? await readProduction() : null;
    if (production && request.bookingStatus === 'awaiting_deposit') {
      await reservePaidClientBooking(request.id, production);
      state = await getState();
      request = state.clientRequests.find(item => item.id === request!.id);
      if (!request) return invalidLink();
    }
    const works = production ? ids.flatMap(id => production.works.filter(item => item.id === id)) : [];
    const validUntil = Date.now() + 15 * 60 * 1000;
    const videos = await Promise.all(works.map(async work => {
      const reviewUrl = work.stage === 'review' && work.reviewAsset && work.reviewAsset.pathname.startsWith(`jornada/client-deliverables/${work.id}/review/`)
        ? (await presignUrl(await issueSignedToken({ pathname: work.reviewAsset.pathname, operations: ['get'], validUntil }), { operation: 'get', pathname: work.reviewAsset.pathname, access: 'private', validUntil })).presignedUrl : undefined;
      const finalUrl = work.stage === 'delivered' && work.finalAsset && work.finalAsset.pathname.startsWith(`jornada/client-deliverables/${work.id}/final/`)
        ? (await presignUrl(await issueSignedToken({ pathname: work.finalAsset.pathname, operations: ['get'], validUntil }), { operation: 'get', pathname: work.finalAsset.pathname, access: 'private', validUntil })).presignedUrl : undefined;
      return { id: work.id, title: work.title, stage: stages[work.stage] || 'Em andamento', delivered: work.stage === 'delivered', scheduledAt: work.scheduledAt || request.scheduledAt || null, dueAt: deadlineForWork(work)?.dueAt || null, awaitingMaterials: Boolean(work.deliveryClockMode === 'after_capture_and_materials' && work.capturedAt && !work.materialsReadyAt), reviewUrl, finalUrl, lastFeedback: work.clientFeedback?.at(-1)?.message };
    }));
    const receivedCents = production?.payments.filter(payment => idSet.has(payment.workId)).reduce((sum, payment) => sum + payment.amountCents, 0) || 0;
    const depositReceivedCents = production ? requestPaymentsCents(request, production) : 0;
    const depositCents = bookingDepositCents(request.agreedPriceCents);
    const project = state.projects.find(item => item.id === request.projectId);
    const projectLabels: Record<string, string> = { planned: 'Preparando o projeto', active: 'Em andamento', waiting_client: 'Aguardando você', review: 'Em avaliação', completed: 'Concluído', cancelled: 'Cancelado' };
    const delivered = videos.filter(video => video.delivered).length;
    const progress = videos.length > 1 ? `${delivered} de ${request.videoQuantity || videos.length} vídeos entregues` : videos[0]?.stage || (request.status === 'accepted' ? request.deliveryMode === 'video' ? 'Preparando seus vídeos' : projectLabels[project?.status || ''] || 'Em andamento' : request.status === 'declined' ? 'Pedido encerrado' : 'Aguardando análise');
    const updatedAt = [request.updatedAt, ...works.map(work => work.updatedAt)].sort().at(-1);
    return NextResponse.json({ requestId: request.id, serviceName: request.serviceName, requestStatus: request.status === 'pending' ? 'Aguardando revisão' : request.status === 'accepted' ? 'Pedido aprovado' : 'Pedido encerrado', progress, videoQuantity: request.deliveryMode === 'video' ? (request.videoQuantity || 1) : undefined, deliveryLabel: request.deliveryLabel, objective: request.objective, desiredDate: request.desiredDate, bookingStatus: request.bookingStatus || 'not_scheduled', scheduleProposalAt: request.scheduleProposalAt, scheduledAt: request.scheduledAt, scheduleMessage: request.scheduleMessage, cancellationTermsAccepted: Boolean(request.cancellationTermsAcceptedAt), cancellation: request.cancellation, location: request.location, materials: (request.materials || []).map(({ id, name, size, createdAt }) => ({ id, name, size, createdAt })), materialUploadsAllowed: request.deliveryMode === 'video' && request.status === 'accepted' && !request.cancellation, totalCents: request.agreedPriceCents, receivedCents, remainingCents: request.status === 'accepted' ? Math.max(0, request.agreedPriceCents - receivedCents) : null, depositCents, depositReceivedCents, depositRemainingCents: Math.max(0, depositCents - depositReceivedCents), videos, updatedAt }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Não foi possível consultar o pedido. Tente atualizar a página.' }, { status: 500 }); }
}
function invalidLink() { return NextResponse.json({ error: 'Link de acompanhamento inválido.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } }); }
