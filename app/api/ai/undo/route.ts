import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { audit, getState, saveState } from '@/lib/store';
import { applyUndo } from '@/lib/undo';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    await requireAuthenticated();
    const body = await req.json();
    const state = await getState();

    const result = applyUndo(
      state,
      String(body?.token || ''),
    );

    audit(state, {
      action: 'ai.action.undone',
      collection: 'ai',
      recordId: result.eventId,
      summary: `${result.changeCount} alteração(ões) revertida(s).`,
    });

    await saveState(state);

    return NextResponse.json({
      ok: true,
      message: 'Desfeito. A Jornada voltou ao estado anterior dessa ação.',
    });
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
            : 'Não foi possível desfazer.',
      },
      { status: 400 },
    );
  }
}
