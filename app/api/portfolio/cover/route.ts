import { randomUUID } from 'node:crypto';
import { del, issueSignedToken, presignUrl, put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { audit, getState } from '@/lib/store';
import { mutateStateSafely } from '@/lib/state-mutation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let uploadedPath = '';
  let committed = false;
  try {
    await requireAuthenticated();
    const raw = await request.text();
    if (raw.length > 900_000) throw new Error('INVALID_COVER');
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        (body.automatic !== undefined && typeof body.automatic !== 'boolean')) throw new Error('INVALID_COVER');
    const { itemId, imageDataUrl, frameSeconds } = body;
    if (typeof itemId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(itemId) ||
        typeof frameSeconds !== 'number' || !Number.isFinite(frameSeconds) || frameSeconds < 0 ||
        typeof imageDataUrl !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(imageDataUrl)) {
      throw new Error('INVALID_COVER');
    }
    const image = Buffer.from(imageDataUrl.slice('data:image/jpeg;base64,'.length), 'base64');
    if (image.length < 4 || image.length > 600 * 1024 || image[0] !== 0xff || image[1] !== 0xd8 ||
        image[image.length - 2] !== 0xff || image[image.length - 1] !== 0xd9) throw new Error('INVALID_COVER');
    const existing = (await getState()).portfolioItems.find(item => item.id === itemId);
    if (!existing) throw new Error('PORTFOLIO_ITEM_NOT_FOUND');

    let coverPathname = existing.coverPathname || '';
    let selectedSeconds = existing.coverFrameSeconds ?? frameSeconds;
    if (!body.automatic || !coverPathname) {
      const blob = await put(`jornada/portfolio-covers/${itemId}/${randomUUID()}.jpg`, image, {
        access: 'private', contentType: 'image/jpeg', addRandomSuffix: false,
        cacheControlMaxAge: 30 * 24 * 60 * 60,
      });
      uploadedPath = blob.pathname;
      let oldPath = '';
      await mutateStateSafely(state => {
        const item = state.portfolioItems.find(entry => entry.id === itemId);
        if (!item) throw new Error('PORTFOLIO_ITEM_NOT_FOUND');
        // An automatic job must never replace a cover the owner just selected.
        if (body.automatic && item.coverPathname) {
          coverPathname = item.coverPathname;
          selectedSeconds = item.coverFrameSeconds ?? frameSeconds;
          return;
        }
        oldPath = item.coverPathname || '';
        coverPathname = uploadedPath;
        selectedSeconds = frameSeconds;
        item.coverPathname = uploadedPath;
        item.coverFrameSeconds = frameSeconds;
        item.updatedAt = new Date().toISOString();
        audit(state, { action: 'portfolio.cover.update', collection: 'portfolioItems', recordId: itemId, summary: item.title });
      });
      committed = coverPathname === uploadedPath;
      if (!committed) await del(uploadedPath).catch(() => {});
      if (oldPath.startsWith(`jornada/portfolio-covers/${itemId}/`)) await del(oldPath).catch(() => {});
    }
    const validUntil = Date.now() + 24 * 60 * 60 * 1000;
    const token = await issueSignedToken({ pathname: coverPathname, operations: ['get'], validUntil });
    const { presignedUrl } = await presignUrl(token, { operation: 'get', pathname: coverPathname, access: 'private', validUntil });
    return NextResponse.json({ ok: true, coverUrl: presignedUrl, coverFrameSeconds: selectedSeconds }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (uploadedPath && !committed) await del(uploadedPath).catch(() => {});
    const reason = error instanceof Error ? error.message : '';
    if (reason === 'UNAUTHORIZED') return NextResponse.json({ error: 'Entre na área do proprietário para escolher a capa.' }, { status: 401 });
    if (reason === 'PORTFOLIO_ITEM_NOT_FOUND') return NextResponse.json({ error: 'Esse vídeo não está no portfólio.' }, { status: 404 });
    if (reason === 'INVALID_COVER' || error instanceof SyntaxError) return NextResponse.json({ error: 'Não consegui ler essa capa. Escolha outro momento do vídeo.' }, { status: 400 });
    return NextResponse.json({ error: 'Não foi possível salvar a capa. Tente novamente.' }, { status: reason === 'STATE_WRITE_CONFLICT' ? 409 : 500 });
  }
}
