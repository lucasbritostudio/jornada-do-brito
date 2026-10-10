import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  UndoChange,
  WorkspaceState,
} from './types';

type UndoTokenPayload = {
  v: 1;
  eventId: string;
  exp: number;
};

function secret() {
  const value = process.env.JORNADA_SESSION_SECRET;
  if (!value) {
    throw new Error('JORNADA_SESSION_SECRET não configurado');
  }
  return value;
}

function sign(payload: UndoTokenPayload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString(
    'base64url',
  );
  const signature = createHmac('sha256', secret())
    .update(`jornada-undo-v2.${encoded}`)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

function verify(token: string) {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) {
    throw new Error('Token de desfazer inválido.');
  }

  const expected = createHmac('sha256', secret())
    .update(`jornada-undo-v2.${encoded}`)
    .digest('base64url');

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('Token de desfazer inválido.');
  }

  const payload = JSON.parse(
    Buffer.from(encoded, 'base64url').toString('utf8'),
  ) as UndoTokenPayload;

  if (
    payload.v !== 1 ||
    payload.exp < Date.now() ||
    !payload.eventId
  ) {
    throw new Error('O prazo para desfazer terminou.');
  }

  return payload;
}

export function registerUndoEvent(
  state: WorkspaceState,
  changes: UndoChange[],
  minutes = 10,
) {
  const now = new Date();
  const safeMinutes = Math.max(1, Math.min(minutes, 60));
  const expiresAt = new Date(
    now.getTime() + safeMinutes * 60 * 1000,
  );
  const id = crypto.randomUUID();

  state.aiUndoEvents.unshift({
    id,
    expiresAt: expiresAt.toISOString(),
    changes,
    createdAt: now.toISOString(),
  });

  state.aiUndoEvents = state.aiUndoEvents.slice(0, 60);

  return sign({
    v: 1,
    eventId: id,
    exp: expiresAt.getTime(),
  });
}

function collectionArray(
  state: WorkspaceState,
  collection: string,
): Array<Record<string, any>> {
  const value = (state as unknown as Record<string, unknown>)[
    collection
  ];
  if (!Array.isArray(value)) {
    throw new Error('Coleção de desfazer inválida.');
  }
  return value as Array<Record<string, any>>;
}

export function applyUndo(
  state: WorkspaceState,
  token: string,
) {
  const payload = verify(token);
  const index = state.aiUndoEvents.findIndex(
    (item) => item.id === payload.eventId,
  );

  if (index < 0) {
    throw new Error(
      'Essa alteração já foi desfeita ou o prazo terminou.',
    );
  }

  const event = state.aiUndoEvents[index];

  for (const change of [...event.changes].reverse()) {
    const collection = collectionArray(
      state,
      change.collection,
    );
    const recordIndex = collection.findIndex(
      (item) => item.id === change.entityId,
    );

    if (change.kind === 'delete') {
      if (recordIndex >= 0) {
        collection.splice(recordIndex, 1);
      }
      continue;
    }

    if (!change.before) {
      throw new Error('Snapshot de desfazer ausente.');
    }

    const restored = structuredClone(change.before);
    if (recordIndex >= 0) {
      collection[recordIndex] = restored;
    } else {
      collection.unshift(restored);
    }
  }

  state.aiUndoEvents.splice(index, 1);

  return {
    eventId: event.id,
    changeCount: event.changes.length,
  };
}
