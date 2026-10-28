import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { getState, saveState, audit } from '@/lib/store';
import type { WorkspaceState } from '@/lib/types';

import { isBlobConflict } from '@/lib/blob-conflict';
import { mutateStateSafely } from '@/lib/state-mutation';

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
  const errorId = crypto.randomUUID();
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

    // Catalog edits are safe to replay by ID. Read the latest Blob snapshot
    // for each attempt so an unrelated save from another screen cannot make
    // this new service disappear or fail with a stale version.
    if (collection === 'serviceCatalog' && body.operation === 'upsert') {
      const incoming = body.record && typeof body.record === 'object' ? body.record : {};
      const recordId = String(incoming.id || crypto.randomUUID());
      await mutateStateSafely((latest) => {
        const records = latest.serviceCatalog;
        const at = new Date().toISOString();
        const record = { ...incoming, id: recordId, updatedAt: at };
        if (!record.createdAt) record.createdAt = at;
        const idx = records.findIndex((item) => item.id === recordId);
        if (idx >= 0) records[idx] = { ...records[idx], ...record };
        else records.unshift(record as (typeof records)[number]);
        audit(latest, {
          action: idx >= 0 ? 'record.update' : 'record.create',
          collection,
          recordId,
          summary: String(record.name || record.description || 'Serviço do catálogo'),
        });
      });
      return NextResponse.json({ ok: true });
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
    console.error('[api/state] save failed', {
      errorId,
      name: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message.slice(0, 400) : 'Unknown error',
    });
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
    if (error instanceof Error && error.message === 'STATE_WRITE_CONFLICT') {
      return NextResponse.json(
        { error: 'O catálogo está recebendo outra alteração. Atualize a página e tente novamente.', errorId },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: 'Não foi possível salvar.', errorId },
      { status: 500 },
    );
  }
}
