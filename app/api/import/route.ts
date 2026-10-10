import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { audit, getState, saveState } from '@/lib/store';
import type { RecordSource, WorkspaceState } from '@/lib/types';

export const runtime = 'nodejs';

const IMPORTABLE_COLLECTIONS = new Set([
  'contacts',
  'opportunities',
  'projects',
  'videoBriefs',
  'financialAccounts',
  'transactions',
  'debts',
  'receivables',
  'obligations',
  'goals',
  'tasks',
  'inbox',
  'clientExperiences',
  'studyAreas',
  'studyEvents',
]);

type ImportCollection = keyof Pick<
  WorkspaceState,
  | 'contacts'
  | 'opportunities'
  | 'projects'
  | 'videoBriefs'
  | 'financialAccounts'
  | 'transactions'
  | 'debts'
  | 'receivables'
  | 'obligations'
  | 'goals'
  | 'tasks'
  | 'inbox'
  | 'clientExperiences'
  | 'studyAreas'
  | 'studyEvents'
>;

function validBatchId(value: unknown) {
  const text = String(value || '').trim();
  if (!/^[a-zA-Z0-9._:-]{6,120}$/.test(text)) {
    throw new Error('batchId inválido.');
  }
  return text;
}

function mergeCollection(
  state: WorkspaceState,
  collection: ImportCollection,
  incoming: unknown[],
  source: RecordSource,
) {
  const target = state[collection] as unknown as Array<Record<string, any>>;
  let created = 0;
  let updated = 0;

  for (const value of incoming) {
    if (!value || typeof value !== 'object') continue;
    const record = value as Record<string, any>;
    const importKey = String(record.importKey || '').trim();
    if (!importKey) {
      throw new Error(`Todo registro importado em ${collection} precisa de importKey.`);
    }

    const existingIndex = target.findIndex((item) => item.importKey === importKey);
    const timestamp = new Date().toISOString();
    const clean = {
      ...record,
      importKey,
      provenance: {
        ...source,
        ...(record.provenance || {}),
        kind: 'drive_import',
      },
      updatedAt: record.updatedAt || timestamp,
    };

    delete clean.id;

    if (existingIndex >= 0) {
      target[existingIndex] = {
        ...target[existingIndex],
        ...clean,
        id: target[existingIndex].id,
        createdAt: target[existingIndex].createdAt,
      };
      updated += 1;
    } else {
      target.unshift({
        ...clean,
        id: crypto.randomUUID(),
        createdAt: record.createdAt || timestamp,
      });
      created += 1;
    }
  }

  return { created, updated };
}

export async function POST(req: Request) {
  try {
    await requireAuthenticated();
    const body = await req.json();
    const batchId = validBatchId(body?.batchId);
    const state = await getState();

    if (state.importBatches.includes(batchId)) {
      return NextResponse.json({
        ok: true,
        alreadyApplied: true,
        batchId,
      });
    }

    if (!body?.payload || typeof body.payload !== 'object') {
      return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
    }

    const source: RecordSource = {
      kind: 'drive_import',
      label: String(body?.sourceLabel || 'Migração privada da Jornada').slice(0, 180),
      ref: body?.sourceRef ? String(body.sourceRef).slice(0, 500) : undefined,
      updatedAt: body?.sourceUpdatedAt
        ? String(body.sourceUpdatedAt).slice(0, 80)
        : undefined,
    };

    const results: Record<string, { created: number; updated: number }> = {};

    for (const [collection, value] of Object.entries(body.payload)) {
      if (!IMPORTABLE_COLLECTIONS.has(collection)) {
        return NextResponse.json(
          { error: `Coleção de importação não permitida: ${collection}` },
          { status: 400 },
        );
      }
      if (!Array.isArray(value)) {
        return NextResponse.json(
          { error: `A coleção ${collection} precisa ser uma lista.` },
          { status: 400 },
        );
      }

      results[collection] = mergeCollection(
        state,
        collection as ImportCollection,
        value,
        source,
      );
    }

    state.importBatches.unshift(batchId);
    state.importBatches = state.importBatches.slice(0, 100);

    audit(state, {
      action: 'migration.import.applied',
      collection: 'migration',
      recordId: batchId,
      summary: Object.entries(results)
        .map(([key, value]) => `${key}: +${value.created}/~${value.updated}`)
        .join(' · '),
    });

    await saveState(state);

    return NextResponse.json({
      ok: true,
      alreadyApplied: false,
      batchId,
      results,
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
            : 'Não foi possível importar os dados.',
      },
      { status: 400 },
    );
  }
}
