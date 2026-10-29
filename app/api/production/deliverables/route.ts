import { del, head } from '@vercel/blob';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { getState } from '@/lib/store';
import { changeProduction, readProduction } from '@/lib/production-store';
import type { WorkAsset } from '@/lib/production';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PREFIX = 'jornada/client-deliverables/';
const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
const TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const EXTENSIONS: Record<string, string> = { 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov' };
type UploadDetails = { workId: string; kind: 'review' | 'final'; assetId: string; name: string; contentType: string };

function clean(value: unknown, limit: number) { return typeof value === 'string' ? value.trim().slice(0, limit) : ''; }
function safeFilename(value: string) {
  const leaf = value.split(/[\\/]/).pop() || 'video.mp4';
  return leaf.normalize('NFKC').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-160);
}
function parseDetails(value: string | null | undefined): UploadDetails {
  if (!value || value.length > 1200) throw new Error('INVALID_UPLOAD');
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error('INVALID_UPLOAD'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('INVALID_UPLOAD');
  const body = parsed as Record<string, unknown>;
  const details = { workId: clean(body.workId, 100), kind: clean(body.kind, 10), assetId: clean(body.assetId, 80), name: clean(body.name, 180), contentType: clean(body.contentType, 100) };
  if (!/^[\w-]{12,100}$/.test(details.workId) || !['review', 'final'].includes(details.kind) || !/^[\w-]{16,80}$/.test(details.assetId) || !details.name || !TYPES.has(details.contentType) || !safeFilename(details.name).toLowerCase().endsWith(EXTENSIONS[details.contentType])) throw new Error('INVALID_UPLOAD');
  return details as UploadDetails;
}
function eligible(work: { stage: string; capturedAt?: string; deliveryClockMode?: string; materialsReadyAt?: string }, kind: UploadDetails['kind']) {
  if (kind === 'review') return ['editing', 'changes_requested'].includes(work.stage) && Boolean(work.capturedAt) && (work.deliveryClockMode !== 'after_capture_and_materials' || Boolean(work.materialsReadyAt));
  return work.stage === 'approved';
}

export async function POST(request: Request) {
  let eventType = 'unknown';
  try {
    const body = await request.json() as HandleUploadBody;
    eventType = typeof body?.type === 'string' ? body.type : eventType;
    const response = await handleUpload({
      body, request,
      onBeforeGenerateToken: async (pathname, payload) => {
        await requireAuthenticated();
        const details = parseDetails(payload);
        if (pathname !== `${PREFIX}${details.workId}/${details.kind}/${details.assetId}/${safeFilename(details.name)}`) throw new Error('INVALID_UPLOAD');
        const data = await readProduction();
        const work = data.works.find(item => item.id === details.workId);
        const state = await getState();
        if (work?.clientRequestId && state.clientRequests.some(item => item.id === work.clientRequestId && item.cancellation)) throw new Error('UPLOAD_NOT_ALLOWED');
        if (!work || !eligible(work, details.kind)) throw new Error('UPLOAD_NOT_ALLOWED');
        return { allowedContentTypes: [details.contentType], maximumSizeInBytes: MAX_VIDEO_BYTES, addRandomSuffix: true, validUntil: Date.now() + 15 * 60 * 1000, tokenPayload: JSON.stringify(details) };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const details = parseDetails(tokenPayload);
        const expectedPrefix = `${PREFIX}${details.workId}/${details.kind}/${details.assetId}/`;
        const metadata = await head(blob.pathname);
        if (!blob.pathname.startsWith(expectedPrefix) || !blob.pathname.toLowerCase().endsWith(EXTENSIONS[details.contentType]) || metadata.contentType !== details.contentType || metadata.size > MAX_VIDEO_BYTES) {
          await del(blob.pathname).catch(() => {}); return;
        }
        const before = await readProduction();
        const priorWork = before.works.find(item => item.id === details.workId);
        const state = await getState();
        if (priorWork?.clientRequestId && state.clientRequests.some(item => item.id === priorWork.clientRequestId && item.cancellation)) { await del(blob.pathname).catch(() => {}); return; }
        let saved = false, oldPath = '';
        await changeProduction(data => {
          const work = data.works.find(item => item.id === details.workId);
          if (!work) return;
          const field = details.kind === 'review' ? 'reviewAsset' : 'finalAsset';
          const existing = work[field];
          if (existing?.id === details.assetId) { saved = existing.pathname === blob.pathname; return; }
          if (!eligible(work, details.kind)) return;
          const asset: WorkAsset = { id: details.assetId, pathname: blob.pathname, name: details.name, contentType: details.contentType as WorkAsset['contentType'], size: metadata.size, createdAt: new Date().toISOString() };
          oldPath = existing?.pathname || '';
          work[field] = asset; work.updatedAt = new Date().toISOString(); saved = true;
        });
        if (!saved) { await del(blob.pathname).catch(() => {}); return; }
        if (oldPath.startsWith(`${PREFIX}${details.workId}/${details.kind}/`) && oldPath !== blob.pathname) await del(oldPath).catch(() => {});
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    console.error('[production/deliverables] upload failed', { eventType, name: error instanceof Error ? error.name : 'UnknownError' });
    const reason = error instanceof Error ? error.message : '';
    const unauthorized = reason === 'UNAUTHORIZED';
    const clientError = unauthorized || reason === 'INVALID_UPLOAD' || reason === 'UPLOAD_NOT_ALLOWED';
    const message = unauthorized ? 'Entre na área do proprietário para enviar vídeos.' : reason === 'UPLOAD_NOT_ALLOWED' ? 'A etapa do trabalho não permite este envio.' : clientError ? 'Confira o vídeo e a etapa do trabalho.' : 'Não foi possível enviar o vídeo. Tente novamente.';
    return NextResponse.json({ error: message }, { status: unauthorized ? 401 : clientError ? 400 : 500 });
  }
}
