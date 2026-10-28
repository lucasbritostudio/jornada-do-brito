import { NextResponse } from 'next/server';
import { del, issueSignedToken, list, presignUrl } from '@vercel/blob';
import { requireAuthenticated } from '@/lib/auth';
import { audit, getState } from '@/lib/store';
import { mutateStateSafely } from '@/lib/state-mutation';
import type { PortfolioItem } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function instagramUrl(value: unknown) {
  const raw = clean(value, 500);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname.toLowerCase())) throw new Error();
    return url.toString();
  } catch {
    throw new Error('INVALID_INSTAGRAM_URL');
  }
}

export async function GET() {
  try {
    await requireAuthenticated();
    const state = await getState();
    const savedPaths = new Set(state.portfolioItems.map((item) => item.blobPathname));
    let unregisteredUploads: Array<{ id: string; pathname: string; originalFilename: string; sizeBytes: number; uploadedAt: string }> = [];
    try {
      const stored = await list({ prefix: 'jornada/portfolio/', limit: 1000 });
      unregisteredUploads = stored.blobs.flatMap((blob) => {
        if (savedPaths.has(blob.pathname)) return [];
        const match = /^jornada\/portfolio\/([a-zA-Z0-9_-]{16,80})\/([a-zA-Z0-9._-]{1,180})$/.exec(blob.pathname);
        if (!match || blob.size > 1024 * 1024 * 1024) return [];
        const extension = match[2].slice(match[2].lastIndexOf('.')).toLowerCase();
        if (!['.mp4', '.webm', '.mov'].includes(extension)) return [];
        return [{ id: match[1], pathname: blob.pathname, originalFilename: match[2], sizeBytes: blob.size, uploadedAt: blob.uploadedAt.toISOString() }];
      }).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    } catch (error) {
      console.warn('[portfolio/manage] could not scan pending uploads', { name: error instanceof Error ? error.name : 'UnknownError' });
    }
    const validUntil = Date.now() + 24 * 60 * 60 * 1000;
    const items = await Promise.all(state.portfolioItems.map(async ({ blobPathname, ...item }) => {
      const token = await issueSignedToken({ pathname: blobPathname, operations: ['get'], validUntil });
      const { presignedUrl } = await presignUrl(token, { operation: 'get', pathname: blobPathname, access: 'private', validUntil });
      return { ...item, previewUrl: presignedUrl };
    }));
    return NextResponse.json({ items, instagramUrl: state.profile.instagramUrl || '', unregisteredUploads }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === 'UNAUTHORIZED' ? 'Não autorizado.' : 'Não foi possível carregar o portfólio.' }, { status: error instanceof Error && error.message === 'UNAUTHORIZED' ? 401 : 500 });
  }
}

export async function POST(request: Request) {
  let action = '';
  let stage = 'receber pedido';
  try {
    stage = 'confirmar acesso';
    await requireAuthenticated();
    const body = await request.json() as Record<string, unknown>;
    action = clean(body.action, 20);
    if (action === 'contact') {
      stage = 'salvar contato';
      const link = instagramUrl(body.instagramUrl);
      await mutateStateSafely((state) => {
        state.profile.instagramUrl = link || undefined;
        audit(state, { action: 'portfolio.contact.update', summary: 'Link de contato do portfólio atualizado' });
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'complete-upload') {
      stage = 'validar dados do vídeo';
      const id = clean(body.id, 80);
      const title = clean(body.title, 120);
      const description = clean(body.description, 1000);
      const originalFilename = clean(body.originalFilename, 180);
      const pathname = clean(body.pathname, 280);
      const published = body.published === true;
      const prefix = `jornada/portfolio/${id}/`;
      const filename = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '';
      const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase();
      const videoTypes: Record<string, string> = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
      };
      if (!/^[a-zA-Z0-9_-]{16,80}$/.test(id) || title.length < 2 || !originalFilename ||
          !filename || filename.length > 180 || !/^[a-zA-Z0-9._-]+$/.test(filename) ||
          !Object.hasOwn(videoTypes, extension)) {
        throw new Error('INVALID_INPUT');
      }

      stage = 'confirmar arquivo enviado';
      const stored = await list({ prefix: `jornada/portfolio/${id}/`, limit: 1000 });
      const metadata = stored.blobs.find((blob) => blob.pathname === pathname);
      if (!metadata) throw new Error('PORTFOLIO_BLOB_NOT_FOUND');
      if (metadata.size > 1024 * 1024 * 1024) {
        throw new Error('INVALID_VIDEO');
      }

      stage = 'salvar vídeo no portfólio';
      const now = new Date().toISOString();
      await mutateStateSafely((state) => {
        const previous = state.portfolioItems.find((item) => item.id === id);
        if (previous && previous.blobPathname !== pathname) throw new Error('PORTFOLIO_ID_CONFLICT');
        if (previous) {
          previous.title = title;
          previous.description = description;
          previous.published = published;
          previous.originalFilename = originalFilename;
          previous.contentType = videoTypes[extension];
          previous.sizeBytes = metadata.size;
          previous.updatedAt = now;
          return;
        }
        const item: PortfolioItem = {
          id,
          title,
          description,
          blobPathname: pathname,
          contentType: videoTypes[extension],
          originalFilename,
          sizeBytes: metadata.size,
          published,
          createdAt: now,
          updatedAt: now,
        };
        state.portfolioItems.unshift(item);
        audit(state, { action: 'portfolio.item.upload', collection: 'portfolioItems', recordId: id, summary: title });
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'delete') {
      stage = 'excluir vídeo';
      const id = clean(body.id, 80);
      if (!id) throw new Error('INVALID_INPUT');
      const item = (await getState()).portfolioItems.find((entry) => entry.id === id);
      if (!item || !item.blobPathname.startsWith('jornada/portfolio/')) throw new Error('PORTFOLIO_ITEM_NOT_FOUND');
      await del(item.blobPathname);
      await mutateStateSafely((state) => {
        state.portfolioItems = state.portfolioItems.filter((entry) => entry.id !== id);
        audit(state, { action: 'portfolio.item.delete', collection: 'portfolioItems', recordId: id, summary: item.title });
      });
      return NextResponse.json({ ok: true });
    }

    if (action !== 'update') throw new Error('INVALID_INPUT');
    stage = 'atualizar vídeo';
    const id = clean(body.id, 80);
    const title = clean(body.title, 120);
    const description = clean(body.description, 1000);
    if (!id || title.length < 2 || typeof body.published !== 'boolean') throw new Error('INVALID_INPUT');
    await mutateStateSafely((state) => {
      const item = state.portfolioItems.find((entry) => entry.id === id);
      if (!item) throw new Error('PORTFOLIO_ITEM_NOT_FOUND');
      item.title = title;
      item.description = description;
      item.published = body.published as boolean;
      item.updatedAt = new Date().toISOString();
      audit(state, { action: 'portfolio.item.update', collection: 'portfolioItems', recordId: id, summary: title });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Entre na área do proprietário para alterar o portfólio.' }, { status: 401 });
    if (message === 'INVALID_INSTAGRAM_URL') return NextResponse.json({ error: 'Informe um link válido do Instagram, começando com https://.' }, { status: 400 });
    if (message === 'PORTFOLIO_ITEM_NOT_FOUND') return NextResponse.json({ error: 'Esse vídeo não está no portfólio.' }, { status: 404 });
    if (message === 'PORTFOLIO_BLOB_NOT_FOUND') return NextResponse.json({ error: 'Não encontrei o arquivo no armazenamento. Se o envio ainda não terminou, tente novamente.' }, { status: 404 });
    if (message === 'PORTFOLIO_ID_CONFLICT') return NextResponse.json({ error: 'Este envio entrou em conflito com outro trabalho. Atualize a lista antes de continuar.' }, { status: 409 });
    if (message === 'STATE_WRITE_CONFLICT') return NextResponse.json({ error: 'Houve outra alteração ao mesmo tempo. Tente novamente.' }, { status: 409 });
    if (message === 'INVALID_INPUT') return NextResponse.json({ error: 'Confira os campos antes de salvar.' }, { status: 400 });
    if (message === 'INVALID_VIDEO') return NextResponse.json({ error: 'O arquivo não passou na conferência. Escolha um MP4, WebM ou MOV com até 1 GB.' }, { status: 400 });
    console.error('[portfolio/manage] request failed', { action, stage, name: error instanceof Error ? error.name : 'UnknownError' });
    if (action === 'complete-upload') {
      return NextResponse.json({ error: 'O arquivo já chegou, mas não consegui salvar os detalhes. Tente salvar novamente sem enviar o arquivo outra vez.' }, { status: 502 });
    }
    return NextResponse.json({ error: 'Não foi possível salvar as alterações.' }, { status: 500 });
  }
}
