import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { createYouTubeRun, getYouTubeState, saveYouTubeState, type YouTubeModuleState } from '@/lib/youtube-module';
import { getYouTubeReadiness } from '@/lib/youtube-readiness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try { await requireAuthenticated(); const state = await getYouTubeState(); return NextResponse.json({ ...state, readiness: getYouTubeReadiness(state) }); }
  catch (error) { const unauthorized = error instanceof Error && error.message === 'UNAUTHORIZED'; return NextResponse.json({ error: unauthorized ? 'Não autorizado.' : 'Não foi possível carregar o módulo YouTube.' }, { status: unauthorized ? 401 : 500 }); }
}

export async function POST(req: Request) {
  try {
    await requireAuthenticated();
    const body = await req.json() as { action?: string; state?: Partial<YouTubeModuleState> };
    const state = await getYouTubeState();
    if (body.action === 'save_settings') {
      const next = { ...state, ...(body.state || {}) } as YouTubeModuleState;
      if (typeof next.channelName !== 'string' || next.channelName.length > 120) return NextResponse.json({ error: 'Nome do canal inválido.' }, { status: 400 });
      if (typeof next.audience !== 'string' || next.audience.length > 500) return NextResponse.json({ error: 'Público inválido.' }, { status: 400 });
      return NextResponse.json({ ok: true, state: await saveYouTubeState(next) });
    }
    if (body.action === 'set_mode') {
      const mode = body.state?.mode;
      if (mode !== 'autonomous' && mode !== 'paused') return NextResponse.json({ error: 'Modo inválido.' }, { status: 400 });
      return NextResponse.json({ ok: true, state: await saveYouTubeState({ ...state, mode, enabled: mode === 'autonomous' }) });
    }
    if (body.action === 'queue_run') {
      if (!state.enabled || state.mode !== 'autonomous') return NextResponse.json({ error: 'Ative a automação YouTube antes de iniciar uma execução.' }, { status: 400 });
      const readiness = getYouTubeReadiness(state);
      if (!readiness.ready) return NextResponse.json({ error: 'O módulo ainda não está pronto para executar.', readiness }, { status: 400 });
      const run = createYouTubeRun();
      const nextState = await saveYouTubeState({ ...state, runs: [run, ...state.runs] });
      return NextResponse.json({ ok: true, run, state: nextState, readiness: getYouTubeReadiness(nextState) });
    }
    return NextResponse.json({ error: 'Ação não reconhecida.' }, { status: 400 });
  } catch (error) { const unauthorized = error instanceof Error && error.message === 'UNAUTHORIZED'; return NextResponse.json({ error: unauthorized ? 'Não autorizado.' : 'Não foi possível atualizar o módulo YouTube.' }, { status: unauthorized ? 401 : 500 }); }
}
