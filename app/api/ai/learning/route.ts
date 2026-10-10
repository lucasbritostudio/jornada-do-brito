import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { getAiLearningOverview, recordConfirmedClientLesson } from '@/lib/ai-memory';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await requireAuthenticated();
    return NextResponse.json(await getAiLearningOverview());
  } catch {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAuthenticated();
    if (req.headers.get('origin') !== new URL(req.url).origin) {
      return NextResponse.json({ error: 'Origem não autorizada.' }, { status: 403 });
    }
    const body = await req.json();
    const lesson = await recordConfirmedClientLesson({
      situation: body?.situation,
      solution: body?.solution,
      confirmed: body?.confirmed,
    });
    return NextResponse.json({ ok: true, ...lesson });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('CLIENT_LESSON_')) {
      return NextResponse.json({
        error: 'Preencha e confirme uma situação e uma solução, sem informações pessoais.',
      }, { status: 400 });
    }
    return NextResponse.json({
      error: 'Não foi possível guardar o aprendizado agora.',
    }, { status: 503 });
  }
}
