import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { audit, getState, saveState } from '@/lib/store';
import type { RecordSource, WorkspaceState } from '@/lib/types';

import { isBlobConflict } from '@/lib/blob-conflict';

export const runtime = 'nodejs';

const IMPORT_ORDER = [
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
] as const;

const IMPORTABLE_COLLECTIONS = new Set<string>(IMPORT_ORDER);

type ImportCollection = (typeof IMPORT_ORDER)[number];

type IdIndex = Map<string, string>;

function validBatchId(value: unknown) {
  const valueText = String(value || '').trim();
  if (!/^[a-zA-Z0-9._:-]{6,120}$/.test(valueText)) {
    throw new Error('batchId inválido.');
  }
  return valueText;
}

function collectionArray(
  state: WorkspaceState,
  collection: ImportCollection,
) {
  return state[collection] as unknown as Array<
    Record<string, any>
  >;
}

function makeIndex(state: WorkspaceState) {
  const index: Record<string, IdIndex> = {};

  for (const collection of IMPORT_ORDER) {
    const map = new Map<string, string>();
    for (const item of collectionArray(state, collection)) {
      if (item.importKey && item.id) {
        map.set(String(item.importKey), String(item.id));
      }
    }
    index[collection] = map;
  }

  return index;
}

function requireRelation(
  index: Record<string, IdIndex>,
  collection: ImportCollection,
  importKey: unknown,
  field: string,
) {
  if (!importKey) return undefined;
  const key = String(importKey);
  const id = index[collection]?.get(key);
  if (!id) {
    throw new Error(
      `Relação ${field} não encontrada: ${key}.`,
    );
  }
  return id;
}

function resolveRelations(
  record: Record<string, any>,
  index: Record<string, IdIndex>,
) {
  const clean = { ...record };

  if (clean.contactImportKey) {
    clean.contactId = requireRelation(
      index,
      'contacts',
      clean.contactImportKey,
      'contactImportKey',
    );
    delete clean.contactImportKey;
  }

  if (clean.opportunityImportKey) {
    clean.opportunityId = requireRelation(
      index,
      'opportunities',
      clean.opportunityImportKey,
      'opportunityImportKey',
    );
    delete clean.opportunityImportKey;
  }

  if (clean.projectImportKey) {
    clean.projectId = requireRelation(
      index,
      'projects',
      clean.projectImportKey,
      'projectImportKey',
    );
    delete clean.projectImportKey;
  }

  if (clean.accountImportKey) {
    clean.accountId = requireRelation(
      index,
      'financialAccounts',
      clean.accountImportKey,
      'accountImportKey',
    );
    delete clean.accountImportKey;
  }

  if (clean.goalImportKey) {
    clean.goalId = requireRelation(
      index,
      'goals',
      clean.goalImportKey,
      'goalImportKey',
    );
    delete clean.goalImportKey;
  }

  return clean;
}

function mergeCollection(
  state: WorkspaceState,
  collection: ImportCollection,
  incoming: unknown[],
  source: RecordSource,
  index: Record<string, IdIndex>,
) {
  const target = collectionArray(state, collection);
  let created = 0;
  let updated = 0;

  for (const value of incoming) {
    if (!value || typeof value !== 'object') continue;

    const raw = value as Record<string, any>;
    const importKey = String(raw.importKey || '').trim();

    if (!importKey) {
      throw new Error(
        `Todo registro importado em ${collection} precisa de importKey.`,
      );
    }

    const { id: _ignoredIncomingId, ...withoutIncomingId } =
      raw;
    const resolved = resolveRelations(
      withoutIncomingId,
      index,
    );

    const existingIndex = target.findIndex(
      (item) => item.importKey === importKey,
    );
    const timestamp = new Date().toISOString();

    const clean = {
      ...resolved,
      importKey,
      provenance: {
        ...source,
        ...(resolved.provenance || {}),
        kind: 'drive_import',
      },
      updatedAt: resolved.updatedAt || timestamp,
    };

    if (existingIndex >= 0) {
      target[existingIndex] = {
        ...target[existingIndex],
        ...clean,
        id: target[existingIndex].id,
        createdAt: target[existingIndex].createdAt,
      };
      index[collection].set(
        importKey,
        String(target[existingIndex].id),
      );
      updated += 1;
    } else {
      const id = crypto.randomUUID();
      target.unshift({
        ...clean,
        id,
        createdAt: resolved.createdAt || timestamp,
      });
      index[collection].set(importKey, id);
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
      return NextResponse.json(
        { error: 'Payload inválido.' },
        { status: 400 },
      );
    }

    for (const key of Object.keys(body.payload)) {
      if (!IMPORTABLE_COLLECTIONS.has(key)) {
        return NextResponse.json(
          {
            error: `Coleção de importação não permitida: ${key}`,
          },
          { status: 400 },
        );
      }
      if (!Array.isArray(body.payload[key])) {
        return NextResponse.json(
          {
            error: `A coleção ${key} precisa ser uma lista.`,
          },
          { status: 400 },
        );
      }
    }

    const source: RecordSource = {
      kind: 'drive_import',
      label: String(
        body?.sourceLabel || 'Migração privada da Jornada',
      ).slice(0, 180),
      ref: body?.sourceRef
        ? String(body.sourceRef).slice(0, 500)
        : undefined,
      updatedAt: body?.sourceUpdatedAt
        ? String(body.sourceUpdatedAt).slice(0, 80)
        : undefined,
    };

    const results: Record<
      string,
      { created: number; updated: number }
    > = {};
    const index = makeIndex(state);

    for (const collection of IMPORT_ORDER) {
      const value = body.payload[collection];
      if (!Array.isArray(value) || value.length === 0) {
        continue;
      }

      results[collection] = mergeCollection(
        state,
        collection,
        value,
        source,
        index,
      );
    }

    state.importBatches.unshift(batchId);
    state.importBatches = state.importBatches.slice(0, 100);

    audit(state, {
      action: 'migration.import.applied',
      collection: 'migration',
      recordId: batchId,
      summary: Object.entries(results)
        .map(
          ([key, value]) =>
            `${key}: +${value.created}/~${value.updated}`,
        )
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
    if (isBlobConflict(error)) {
      return NextResponse.json(
        { error: 'Outra alteração foi salva ao mesmo tempo. Atualize e tente novamente.' },
        { status: 409 },
      );
    }
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
            : 'Não foi possível importar os dados.',
      },
      { status: 400 },
    );
  }
}
