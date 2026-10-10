import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { recordAiFeedback } from '@/lib/ai-memory';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    await requireAuthenticated();
    const body = await req.json();
    const feedback =
      body?.feedback === 'resolved'
        ? 'resolved'
        : body?.feedback === 'not_resolved'
          ? 'not_resolved'
          : null;

    if (!body?.threadId || !body?.turnId || !feedback) {
      return NextResponse.json(
        { error: 'Feedback inválido.' },
        { status: 400 },
      );
    }

    return NextResponse.json(
      await recordAiFeedback({
        threadId: String(body.threadId),
        turnId: String(body.turnId),
        feedback,
      }),
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'UNAUTHORIZED'
    ) {
      return NextResponse.json(
        { error: 'Não autorizado.' },
        { status: 401 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Não foi possível salvar o feedback.',
      },
      { status: 400 },
    );
  }
}
