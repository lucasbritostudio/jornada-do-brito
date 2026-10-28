import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { getState, saveState, audit } from '@/lib/store';
import type { WorkspaceState } from '@/lib/types';

import { isBlobConflict } from '@/lib/blob-conflict';

export const runtime = 'nodejs';

const allowed = new Set([
  'contacts',
  'opportunities',
  'projects',
  'serviceCatalog',
  'videoBriefs',
  'financialAccounts',
  'transactions',
  'debts',
  'receivables',
  'obligations',
  'goals',
  'tasks',
  'conversations',
  'messages',
  'inbox',
  'clientExperiences',
  'studyAreas',
  'studyEvents',
  'professionalPatterns',
]);

export async function GET() {
  try {
    await requireAuthenticated();
    return NextResponse.json(await getState());
  } catch {
    return NextResponse.json(
      { error: 'Não autorizado.' },
      { status: 401 },
    );
  }
}

export async function POST(req: Request) {
  try {
    await requireAuthenticated();
    const body = await req.json();
    const state = await getState();

    if (body.operation === 'profile') {
      state.profile = {
        ...state.profile,
        ...(body.record || {}),
      };
      audit(state, {
        action: 'profile.update',
        summary: 'Perfil atualizado',
      });
      return NextResponse.json(await saveState(state));
    }

    if (body.operation === 'settings') {
      const incoming = body.record || {};
      if (incoming.whatsappAutomation) {
        state.settings.whatsappAutomation = {
          ...state.settings.whatsappAutomation,
          ...incoming.whatsappAutomation,
        };
      }
      if (incoming.ai) {
        state.settings.ai = {
          ...state.settings.ai,
          ...incoming.ai,
        };
      }
      audit(state, {
        action: 'settings.update',
        summary: 'Configurações da Jornada atualizadas',
      });
      return NextResponse.json(await saveState(state));
    }

    const collection = String(body.collection || '');
    if (!allowed.has(collection)) {
      return NextResponse.json(
        { error: 'Coleção inválida.' },
        { status: 400 },
      );
    }

    const arr = (state as unknown as Record<string, unknown[]>)[collection];

    if (body.operation === 'delete') {
      const idx = arr.findIndex((item: any) => item.id === body.id);
      if (idx >= 0) arr.splice(idx, 1);
      audit(state, {
        action: 'record.delete',
        collection,
        recordId: body.id,
      });
    } else if (body.operation === 'upsert') {
      const at = new Date().toISOString();
      const record = {
        ...body.record,
        updatedAt: at,
      };
      if (!record.id) {
        record.id = crypto.randomUUID();
        record.createdAt = at;
      }
      const idx = arr.findIndex((item: any) => item.id === record.id);
      if (idx >= 0) {
        arr[idx] = {
          ...(arr[idx] as object),
          ...record,
        };
      } else {
        arr.unshift(record);
      }
      audit(state, {
        action: idx >= 0 ? 'record.update' : 'record.create',
        collection,
        recordId: record.id,
        summary:
          record.title ||
          record.name ||
          record.description ||
          record.creditorName ||
          record.clientLabel ||
          record.skill,
      });
    } else {
      return NextResponse.json(
        { error: 'Operação inválida.' },
        { status: 400 },
      );
    }

    return NextResponse.json(
      await saveState(state as WorkspaceState),
    );
  } catch (error) {
    if (isBlobConflict(error)) {
      return NextResponse.json(
        { error: 'Outra alteração foi salva ao mesmo tempo. Atualize e tente novamente.' },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { error: 'Não autorizado.' },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { error: 'Não foi possível salvar.' },
      { status: 500 },
    );
  }
}
