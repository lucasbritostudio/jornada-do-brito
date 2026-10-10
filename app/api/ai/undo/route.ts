import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { audit, getState, saveState } from '@/lib/store';
import { undoCreatedRecord, verifyUndoToken } from '@/lib/ai-actions';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    await requireAuthenticated();
    const body = await req.json();
    const payload = verifyUndoToken(String(body?.token || ''));
    const state = await getState();

    const alreadyUndone = state.audit.some(
      (entry) =>
        entry.action === 'ai.action.undone' &&
        entry.recordId === payload.jti,
    );
    if (alreadyUndone) {
      return NextResponse.json(
        { error: 'Essa ação já foi desfeita.' },
        { status: 409 },
      );
    }

    const result = undoCreatedRecord(state, payload);
    audit(state, {
      action: 'ai.action.undone',
      collection: result.collection,
      recordId: payload.jti,
      summary: `Registro ${result.entityId} removido pelo Desfazer.`,
    });
    await saveState(state);

    return NextResponse.json({
      ok: true,
      message: 'Desfeito. O registro foi removido.',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
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
