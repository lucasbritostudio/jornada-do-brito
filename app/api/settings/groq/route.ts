import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import {
  getGroqSecretStatus,
  saveGroqApiKey,
  removeStoredGroqApiKey,
} from '@/lib/secrets';

export const runtime = 'nodejs';

async function validateGroqKey(apiKey: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      signal: controller.signal,
    });
    return response.ok;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  try {
    await requireAuthenticated();
    return NextResponse.json({
      ...(await getGroqSecretStatus()),
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
      privacy: 'minimum-context',
    });
  } catch {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAuthenticated();
    const { apiKey } = await req.json();
    const key = String(apiKey || '').trim();

    if (!key) {
      return NextResponse.json(
        { error: 'Cole a chave da Groq.' },
        { status: 400 },
      );
    }

    const valid = await validateGroqKey(key);
    if (!valid) {
      return NextResponse.json(
        { error: 'A Groq recusou essa chave. Confira e tente novamente.' },
        { status: 400 },
      );
    }

    await saveGroqApiKey(key);
    return NextResponse.json({
      ok: true,
      configured: true,
      source: 'encrypted-store',
      last4: key.slice(-4),
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Não foi possível salvar a chave com segurança.' },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    await requireAuthenticated();
    await removeStoredGroqApiKey();
    return NextResponse.json({ ok: true, configured: false });
  } catch (error) {
    if (error instanceof Error && error.message === 'GROQ_KEY_MANAGED_BY_ENV') {
      return NextResponse.json(
        { error: 'Essa chave está configurada na hospedagem e não pode ser removida pela tela.' },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Falha ao remover a chave.' }, { status: 500 });
  }
}
