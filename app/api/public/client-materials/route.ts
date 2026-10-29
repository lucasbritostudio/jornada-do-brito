import { createHash, timingSafeEqual } from 'node:crypto';
import { del, head } from '@vercel/blob';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { getState } from '@/lib/store';
import { mutateStateSafely } from '@/lib/state-mutation';
import type { ClientRequestMaterial } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PREFIX = 'jornada/client-materials/';
const MAX_FILES = 4;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const EXTENSIONS: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };

type UploadDetails = { requestId: string; token: string; materialId: string; name: string; contentType: string };
function clean(value: unknown, max: number) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function safeFilename(value: string) {
  const leaf = value.split(/[\\/]/).pop() || 'material';
  return leaf.normalize('NFKC').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-140);
}
function parseDetails(value: string | null): UploadDetails {
  if (!value || value.length > 1200) throw new Error('INVALID_UPLOAD');
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error('INVALID_UPLOAD'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('INVALID_UPLOAD');
  const body = parsed as Record<string, unknown>;
  const details = { requestId: clean(body.requestId, 80), token: clean(body.token, 100), materialId: clean(body.materialId, 80), name: clean(body.name, 180), contentType: clean(body.contentType, 100) };
  if (!/^[\w-]{20,80}$/.test(details.requestId) || !/^[\w-]{30,100}$/.test(details.token) || !/^[\w-]{16,80}$/.test(details.materialId) || !details.name || !TYPES.has(details.contentType)) throw new Error('INVALID_UPLOAD');
  if (!safeFilename(details.name).toLowerCase().endsWith(EXTENSIONS[details.contentType])) throw new Error('INVALID_UPLOAD');
  return details;
}
function belongs(request: { portalTokenHash?: string; status: string }, token: string) {
  if (!request.portalTokenHash || request.status !== 'accepted') return false;
  return belongsHash(request, createHash('sha256').update(token).digest('hex'));
}
function belongsHash(request: { portalTokenHash?: string; status: string }, hash: string) {
  if (!request.portalTokenHash || request.status !== 'accepted' || !/^[a-f0-9]{64}$/.test(hash) || !/^[a-f0-9]{64}$/.test(request.portalTokenHash)) return false;
  return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(request.portalTokenHash, 'hex'));
}
async function allowed(details: UploadDetails) {
  const state = await getState();
  const request = state.clientRequests.find(item => item.id === details.requestId);
  if (!request || request.cancellation || !belongs(request, details.token)) return false;
  const materials = request.materials || [];
  return materials.some(item => item.id === details.materialId) || (materials.length < MAX_FILES && materials.reduce((sum, item) => sum + item.size, 0) < MAX_TOTAL_BYTES);
}

export async function POST(request: Request) {
  let eventType = 'unknown';
  try {
    const body = await request.json() as HandleUploadBody;
    eventType = typeof body?.type === 'string' ? body.type : eventType;
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const details = parseDetails(clientPayload);
        if (pathname !== `${PREFIX}${details.requestId}/${details.materialId}/${safeFilename(details.name)}` || !await allowed(details)) throw new Error('UPLOAD_NOT_ALLOWED');
        return { allowedContentTypes: [details.contentType], maximumSizeInBytes: MAX_FILE_BYTES, addRandomSuffix: true, validUntil: Date.now() + 15 * 60 * 1000, tokenPayload: JSON.stringify({ requestId: details.requestId, materialId: details.materialId, name: details.name, contentType: details.contentType, tokenHash: createHash('sha256').update(details.token).digest('hex') }) };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const details = parseCallbackPayload(tokenPayload);
        const safePrefix = `${PREFIX}${details.requestId}/${details.materialId}/`;
        const metadata = await head(blob.pathname);
        if (!blob.pathname.startsWith(safePrefix) || !blob.pathname.toLowerCase().endsWith(EXTENSIONS[details.contentType]) || metadata.contentType !== details.contentType || metadata.size > MAX_FILE_BYTES) {
          await del(blob.pathname).catch(() => {});
          return;
        }
        let saved = false;
        await mutateStateSafely(state => {
          const target = state.clientRequests.find(item => item.id === details.requestId);
          if (!target || target.cancellation || !belongsHash(target, details.tokenHash)) return;
          target.materials ||= [];
          if (target.materials.some(item => item.id === details.materialId || item.pathname === blob.pathname)) { saved = target.materials.some(item => item.pathname === blob.pathname); return; }
          if (target.materials.length >= MAX_FILES || target.materials.reduce((sum, item) => sum + item.size, 0) + metadata.size > MAX_TOTAL_BYTES) return;
          const material: ClientRequestMaterial = { id: details.materialId, pathname: blob.pathname, name: details.name, contentType: details.contentType as ClientRequestMaterial['contentType'], size: metadata.size, createdAt: new Date().toISOString() };
          target.materials.push(material); target.updatedAt = new Date().toISOString(); saved = true;
        });
        if (!saved) await del(blob.pathname).catch(() => {});
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[client-materials/upload] failed', { eventType, name: error instanceof Error ? error.name : 'UnknownError' });
    const reason = error instanceof Error ? error.message : '';
    const status = reason === 'INVALID_UPLOAD' || reason === 'UPLOAD_NOT_ALLOWED' ? 400 : 500;
    return NextResponse.json({ error: status === 400 ? 'Este arquivo não pode ser enviado. Confira o pedido, o formato e o limite.' : 'Não foi possível enviar o arquivo. Tente novamente.' }, { status });
  }
}

function parseCallbackPayload(value: string | null | undefined): Omit<UploadDetails, 'token'> & { tokenHash: string } {
  if (!value || value.length > 1200) throw new Error('INVALID_UPLOAD');
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error('INVALID_UPLOAD'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('INVALID_UPLOAD');
  const body = parsed as Record<string, unknown>;
  const details = { requestId: clean(body.requestId, 80), materialId: clean(body.materialId, 80), name: clean(body.name, 180), contentType: clean(body.contentType, 100), tokenHash: clean(body.tokenHash, 64) };
  if (!/^[\w-]{20,80}$/.test(details.requestId) || !/^[\w-]{16,80}$/.test(details.materialId) || !details.name || !TYPES.has(details.contentType) || !/^[a-f0-9]{64}$/.test(details.tokenHash) || !safeFilename(details.name).toLowerCase().endsWith(EXTENSIONS[details.contentType])) throw new Error('INVALID_UPLOAD');
  return details;
}
