import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { requireAuthenticated } from '@/lib/auth';
import { getPortfolioMetricsReport, recordPortfolioPlay, verifyPortfolioPlayToken } from '@/lib/portfolio-metrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestBuckets = new Map<string, { startedAt: number; count: number }>();
function withinRateLimit(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const key = createHash('sha256').update(forwarded).digest('hex');
  const now = Date.now();
  const current = requestBuckets.get(key);
  if (!current || now - current.startedAt > 60_000) {
    requestBuckets.set(key, { startedAt: now, count: 1 });
  } else if (current.count >= 20) {
    return false;
  } else {
    current.count += 1;
  }
  if (requestBuckets.size > 2_000) {
    for (const [bucketKey, bucket] of requestBuckets) if (now - bucket.startedAt > 60_000) requestBuckets.delete(bucketKey);
  }
  return true;
}

export async function GET() {
  try {
    await requireAuthenticated();
    const report = await getPortfolioMetricsReport();
    return NextResponse.json(report, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === 'UNAUTHORIZED';
    return NextResponse.json(
      { error: unauthorized ? 'Entre na área do proprietário para ver o monitoramento.' : 'Não foi possível carregar o monitoramento.' },
      { status: unauthorized ? 401 : 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!withinRateLimit(request)) return NextResponse.json({ error: 'Aguarde um pouco antes de registrar novas reproduções.' }, { status: 429 });
    const raw = await request.text();
    if (raw.length > 500) return NextResponse.json({ error: 'Reprodução inválida.' }, { status: 413 });
    let body: { itemId?: unknown; playToken?: unknown };
    try { body = JSON.parse(raw) as { itemId?: unknown; playToken?: unknown }; }
    catch { return NextResponse.json({ error: 'Reprodução inválida.' }, { status: 400 }); }
    if (typeof body.itemId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(body.itemId)) {
      return NextResponse.json({ error: 'Reprodução inválida.' }, { status: 400 });
    }
    const item = verifyPortfolioPlayToken(body.playToken, body.itemId);
    if (!item) return NextResponse.json({ error: 'Reprodução expirada; atualize a página.' }, { status: 401 });
    await recordPortfolioPlay(item);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[public/portfolio/metrics] event failed', { name: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ error: 'Não foi possível registrar a reprodução.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
