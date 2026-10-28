import { issueSignedToken, presignUrl } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { getState } from '@/lib/store';
import { signPortfolioPlayToken } from '@/lib/portfolio-metrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const URL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET() {
  try {
    const state = await getState();
    const items = state.portfolioItems.filter((item) => item.published && item.blobPathname.startsWith('jornada/portfolio/'));
    if (!items.length) {
      return NextResponse.json({ brand: state.profile.displayName, instagramUrl: state.profile.instagramUrl || null, items: [] }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const validUntil = Date.now() + URL_TTL_MS;
    const publicItems = await Promise.all(items.map(async (item) => {
      const signedToken = await issueSignedToken({ pathname: item.blobPathname, operations: ['get'], validUntil });
      const { presignedUrl } = await presignUrl(signedToken, {
        operation: 'get',
        pathname: item.blobPathname,
        access: 'private',
        validUntil,
      });
      let coverUrl: string | undefined;
      if (item.coverPathname?.startsWith(`jornada/portfolio-covers/${item.id}/`)) {
        const token = await issueSignedToken({ pathname: item.coverPathname, operations: ['get'], validUntil });
        coverUrl = (await presignUrl(token, { operation: 'get', pathname: item.coverPathname, access: 'private', validUntil })).presignedUrl;
      }
      return {
        id: item.id,
        title: item.title,
        description: item.description,
        contentType: item.contentType,
        sizeBytes: item.sizeBytes,
        createdAt: item.createdAt,
        videoUrl: presignedUrl,
        coverUrl,
        playToken: signPortfolioPlayToken({ id: item.id, title: item.title, sizeBytes: item.sizeBytes }),
      };
    }));

    return NextResponse.json({ brand: state.profile.displayName, instagramUrl: state.profile.instagramUrl || null, items: publicItems }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[public/portfolio] request failed', { name: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ error: 'Portfólio indisponível no momento.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
