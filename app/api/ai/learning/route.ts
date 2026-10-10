import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { getAiLearningOverview } from '@/lib/ai-memory';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await requireAuthenticated();
    return NextResponse.json(
      await getAiLearningOverview(),
    );
  } catch {
    return NextResponse.json(
      { error: 'Não autorizado.' },
      { status: 401 },
    );
  }
}
