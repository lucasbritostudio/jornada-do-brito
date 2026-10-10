import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { reconcileAiMemoryIndex } from '@/lib/ai-memory';

export const runtime = 'nodejs';

/**
 * Owner-only repair. Never touches individual threads, providers or WhatsApp.
 * Deliberately not run on normal chat requests, to avoid unnecessary reads.
 */
export async function POST(req: Request) {
  try {
    await requireAuthenticated();
    const origin = req.headers.get('origin');
    if (!origin || origin !== new URL(req.url).origin) {
      return NextResponse.json({ error: 'Origem não autorizada.' }, { status: 403 });
    }
    const input = await req.json();
    if (input?.confirm !== 'RECONCILE_AI_MEMORY_INDEX') {
      return NextResponse.json({ error: 'Confirmação necessária.' }, { status: 400 });
    }
    const result = await reconcileAiMemoryIndex();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Não foi possível reconciliar o índice de memória.' },
      { status: 503 },
    );
  }
}
