import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { head } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { mutateStateSafely } from '@/lib/state-mutation';
import type { PortfolioItem } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov']);
const PREFIX = 'jornada/portfolio/';

type UploadDetails = { id: string; title: string; description: string; originalFilename: string; published: boolean };

function text(value: unknown, limit: number) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function parseDetails(value: string | null): UploadDetails {
  if (!value || value.length > 1800) throw new Error('INVALID_UPLOAD_DETAILS');
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error('INVALID_UPLOAD_DETAILS'); }
  if (!parsed || typeof parsed !== 'object') throw new Error('INVALID_UPLOAD_DETAILS');
  const item = parsed as Record<string, unknown>;
  const id = text(item.id, 80);
  const title = text(item.title, 120);
  const description = text(item.description, 1000);
  const originalFilename = text(item.originalFilename, 180);
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(id) || title.length < 2 || !originalFilename) {
    throw new Error('INVALID_UPLOAD_DETAILS');
  }
  return { id, title, description, originalFilename, published: item.published === true };
}

function safeFilename(value: string) {
  const base = value.split(/[\\/]/).pop() || 'video.mp4';
  return base.normalize('NFKC').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-160);
}

function uploadError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Entre na área do proprietário para enviar vídeos.' }, { status: 401 });
  if (message === 'INVALID_UPLOAD_DETAILS') return NextResponse.json({ error: 'Confira o título e o arquivo de vídeo.' }, { status: 400 });
  if (message === 'INVALID_VIDEO') return NextResponse.json({ error: 'Envie um vídeo MP4, WebM ou MOV com até 1 GB.' }, { status: 400 });
  console.error('[portfolio/upload] request failed', { name: error instanceof Error ? error.name : 'UnknownError' });
  return NextResponse.json({ error: 'Não foi possível enviar o vídeo. Tente novamente.' }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as HandleUploadBody;
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        await requireAuthenticated();
        const details = parseDetails(clientPayload);
        const filename = safeFilename(details.originalFilename);
        const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase();
        if (!VIDEO_EXTENSIONS.has(extension) || pathname !== `${PREFIX}${details.id}/${filename}`) {
          throw new Error('INVALID_VIDEO');
        }
        return {
          allowedContentTypes: [...VIDEO_TYPES],
          maximumSizeInBytes: MAX_VIDEO_BYTES,
          addRandomSuffix: true,
          cacheControlMaxAge: 30 * 24 * 60 * 60,
          validUntil: Date.now() + 15 * 60 * 1000,
          tokenPayload: JSON.stringify(details),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const details = parseDetails(tokenPayload ?? null);
        const filename = safeFilename(details.originalFilename);
        const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase();
        if (!blob.pathname.startsWith(`${PREFIX}${details.id}/`) || !VIDEO_EXTENSIONS.has(extension) || !VIDEO_TYPES.has(blob.contentType)) {
          throw new Error('INVALID_VIDEO');
        }
        const metadata = await head(blob.pathname);
        if (metadata.size > MAX_VIDEO_BYTES) throw new Error('INVALID_VIDEO');
        const now = new Date().toISOString();
        await mutateStateSafely((state) => {
          const previous = state.portfolioItems.find((item) => item.id === details.id);
          if (previous) {
            previous.blobPathname = blob.pathname;
            previous.contentType = blob.contentType;
            previous.originalFilename = filename;
            previous.sizeBytes = metadata.size;
            previous.updatedAt = now;
            return;
          }
          const item: PortfolioItem = {
            id: details.id,
            title: details.title,
            description: details.description,
            blobPathname: blob.pathname,
            contentType: blob.contentType,
            originalFilename: filename,
            sizeBytes: metadata.size,
            published: details.published,
            createdAt: now,
            updatedAt: now,
          };
          state.portfolioItems.unshift(item);
        });
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return uploadError(error);
  }
}
