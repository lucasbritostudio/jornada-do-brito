import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { getState, saveState, audit } from '@/lib/store';
import { executeAction, verifyActionToken } from '@/lib/ai-actions';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    await requireAuthenticated();
    const { token } = await req.json();
    const payload = verifyActionToken(String(token || ''));
    const state = await getState();

    const alreadyUsed = state.audit.some(
      (entry) => entry.action === 'ai.action.executed' && entry.recordId === payload.jti,
    );
    if (alreadyUsed) {
      return NextResponse.json(
        { error: 'Essa ação já foi confirmada.' },
        { status: 409 },
      );
    }

    const result = executeAction(state, payload);
    audit(state, {
      action: 'ai.action.executed',
      collection: payload.name,
      recordId: payload.jti,
      summary: result.message,
    });
    await saveState(state);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Não foi possível executar a ação.' },
      { status: 400 },
    );
  }
}
