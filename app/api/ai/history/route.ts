import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { getAiHistory, getAiMemoryStats } from '@/lib/ai-memory';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    await requireAuthenticated();
    const url = new URL(req.url);
    const threadId = String(
      url.searchParams.get('threadId') || '',
    ).trim();

    if (!threadId) {
      return NextResponse.json({
        messages: [],
        stats: await getAiMemoryStats(),
      });
    }

    return NextResponse.json(await getAiHistory(threadId));
  } catch {
    return NextResponse.json(
      { error: 'Não autorizado.' },
      { status: 401 },
    );
  }
}
