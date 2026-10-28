import { NextResponse } from 'next/server';
import { del, issueSignedToken, presignUrl } from '@vercel/blob';
import { requireAuthenticated } from '@/lib/auth';
import { audit, getState } from '@/lib/store';
import { mutateStateSafely } from '@/lib/state-mutation';

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
    const validUntil = Date.now() + 24 * 60 * 60 * 1000;
    const items = await Promise.all(state.portfolioItems.map(async ({ blobPathname, ...item }) => {
      const token = await issueSignedToken({ pathname: blobPathname, operations: ['get'], validUntil });
      const { presignedUrl } = await presignUrl(token, { operation: 'get', pathname: blobPathname, access: 'private', validUntil });
      return { ...item, previewUrl: presignedUrl };
    }));
    return NextResponse.json({ items, instagramUrl: state.profile.instagramUrl || '' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === 'UNAUTHORIZED' ? 'Não autorizado.' : 'Não foi possível carregar o portfólio.' }, { status: error instanceof Error && error.message === 'UNAUTHORIZED' ? 401 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAuthenticated();
    const body = await request.json() as Record<string, unknown>;
    const action = clean(body.action, 20);
    if (action === 'contact') {
      const link = instagramUrl(body.instagramUrl);
      await mutateStateSafely((state) => {
        state.profile.instagramUrl = link || undefined;
        audit(state, { action: 'portfolio.contact.update', summary: 'Link de contato do portfólio atualizado' });
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'delete') {
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
    if (message === 'STATE_WRITE_CONFLICT') return NextResponse.json({ error: 'Houve outra alteração ao mesmo tempo. Tente novamente.' }, { status: 409 });
    if (message === 'INVALID_INPUT') return NextResponse.json({ error: 'Confira os campos antes de salvar.' }, { status: 400 });
    console.error('[portfolio/manage] request failed', { name: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ error: 'Não foi possível salvar as alterações.' }, { status: 500 });
  }
}
