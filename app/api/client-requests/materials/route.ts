import { get } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { getState } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAuthenticated();
    const url = new URL(request.url), requestId = url.searchParams.get('requestId') || '', materialId = url.searchParams.get('materialId') || '';
    const state = await getState();
    const order = state.clientRequests.find(item => item.id === requestId);
    const material = order?.materials?.find(item => item.id === materialId);
    if (!material || !material.pathname.startsWith(`jornada/client-materials/${requestId}/${materialId}/`)) return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 });
    const result = await get(material.pathname, { access: 'private', useCache: false });
    if (!result) return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 });
    const filename = material.name.replace(/[\r\n"\\]/g, '_');
    return new Response(result.stream, { headers: { 'Content-Type': material.contentType, 'Content-Length': String(material.size), 'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(material.name)}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === 'UNAUTHORIZED';
    return NextResponse.json({ error: unauthorized ? 'Não autorizado.' : 'Não foi possível abrir o arquivo.' }, { status: unauthorized ? 401 : 500 });
  }
}
