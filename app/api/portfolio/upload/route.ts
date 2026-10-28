import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';

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
  let stage = 'ler pedido do vídeo';
  let eventType = 'desconhecido';
  try {
    const body = await request.json() as HandleUploadBody;
    eventType = typeof body?.type === 'string' ? body.type : eventType;
    stage = 'processar pedido de envio';
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        stage = 'confirmar proprietário';
        await requireAuthenticated();
        stage = 'validar vídeo';
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
        };
      },
    });
    stage = 'responder ao serviço de vídeos';
    return NextResponse.json(result);
  } catch (error) {
    console.error('[portfolio/upload] request failed', { stage, eventType, name: error instanceof Error ? error.name : 'UnknownError' });
    return uploadError(error);
  }
}
