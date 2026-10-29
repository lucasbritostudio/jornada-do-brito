import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getState } from '@/lib/store';
import { readProduction, changeProduction } from '@/lib/production-store';
import { requestWorkIds } from '@/lib/client-request-production';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4_000) return NextResponse.json({ error: 'A mensagem ficou muito grande.' }, { status: 413 });
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 }); }
    const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
    const token = text(body.token, 100), workId = text(body.workId, 100), feedbackId = text(body.feedbackId, 80), decision = text(body.decision, 30), message = text(body.message, 1000);
    if (!/^[\w-]{30,100}$/.test(token) || !/^[\w-]{12,100}$/.test(workId) || !/^[\w-]{16,80}$/.test(feedbackId) || !['approved', 'changes_requested'].includes(decision) || (decision === 'changes_requested' && message.length < 5)) return NextResponse.json({ error: 'Confira sua resposta e, se pedir ajustes, conte o que deseja mudar.' }, { status: 400 });
    const hash = createHash('sha256').update(token).digest('hex');
    const state = await getState();
    const requestRecord = state.clientRequests.find(item => {
      if (item.status !== 'accepted' || item.deliveryMode !== 'video' || item.cancellation || !item.portalTokenHash || !/^[a-f0-9]{64}$/.test(item.portalTokenHash)) return false;
      return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(item.portalTokenHash, 'hex'));
    });
    if (!requestRecord || !requestWorkIds(requestRecord).includes(workId)) return NextResponse.json({ error: 'Esse link ou vídeo não é válido.' }, { status: 404 });
    const production = await readProduction();
    const work = production.works.find(item => item.id === workId);
    if (!work || work.clientRequestId !== requestRecord.id) return NextResponse.json({ error: 'Esse vídeo não está disponível.' }, { status: 404 });
    let duplicate = false;
    await changeProduction(data => {
      const current = data.works.find(item => item.id === workId);
      if (!current || current.clientRequestId !== requestRecord.id) throw new Error('REVIEW_CLOSED');
      current.clientFeedback ||= [];
      const existing = current.clientFeedback.find(item => item.id === feedbackId);
      if (existing) {
        if (existing.decision !== decision || existing.message !== (message || undefined)) throw new Error('FEEDBACK_CONFLICT');
        duplicate = true; return;
      }
      if (!current.reviewAsset || current.stage !== 'review') throw new Error('REVIEW_CLOSED');
      const at = new Date().toISOString(), next = decision as 'approved' | 'changes_requested';
      current.clientFeedback.push({ id: feedbackId, decision: next, message: message || undefined, createdAt: at });
      current.stage = next; current.updatedAt = at;
      if (next === 'approved') current.approvedAt = at;
      current.history.push({ stage: next, at });
    });
    return NextResponse.json({ ok: true, duplicate });
  } catch (error) {
    const reason = error instanceof Error ? error.message : '';
    if (reason === 'REVIEW_CLOSED') return NextResponse.json({ error: 'Este vídeo não está aguardando uma resposta agora. Atualize o acompanhamento.' }, { status: 409 });
    if (reason === 'FEEDBACK_CONFLICT') return NextResponse.json({ error: 'Esta resposta já foi enviada com outros dados. Atualize o acompanhamento.' }, { status: 409 });
    return NextResponse.json({ error: 'Não consegui salvar sua resposta. Tente novamente.' }, { status: 500 });
  }
}
