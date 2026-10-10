import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { previewAiMemoryRetention } from '@/lib/ai-memory';

export const runtime = 'nodejs';

// Planning only. Deliberately no DELETE or POST endpoint.
export async function GET(req: Request) {
  try {
    await requireAuthenticated();
    const cutoff = new URL(req.url).searchParams.get('cutoff');
    return NextResponse.json(await previewAiMemoryRetention(cutoff));
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'INVALID_RETENTION_CUTOFF') {
      return NextResponse.json({ error: 'Data inválida.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Não foi possível consultar a memória.' },
      { status: 503 });
  }
}
