import { randomUUID } from 'node:crypto';

/** Only client and learning data, never bank accounts or personal finances. */
export const CLIENT_BATCH_ID = 'jornada-clientes-evolucao-2026-10-10-v2';
export const CLIENT_COLLECTIONS = [
  'contacts', 'opportunities', 'projects', 'videoBriefs', 'inbox', 'clientExperiences',
];

const RELATIONS = {
  contactImportKey: ['contacts', 'contactId'],
  opportunityImportKey: ['opportunities', 'opportunityId'],
  projectImportKey: ['projects', 'projectId'],
};

function validKey(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._:-]{5,119}$/i.test(value);
}

export function validateClientPackage(pkg) {
  if (!pkg || pkg.batchId !== CLIENT_BATCH_ID ||
      !pkg.payload || typeof pkg.payload !== 'object' ||
      Array.isArray(pkg.payload)) throw new Error('CLIENT_PACKAGE_NOT_APPROVED');
  const keys = Object.keys(pkg.payload).sort();
  const expected = [...CLIENT_COLLECTIONS].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    throw new Error('CLIENT_PACKAGE_UNEXPECTED_COLLECTION');
  }
  let total = 0;
  for (const collection of CLIENT_COLLECTIONS) {
    const list = pkg.payload[collection];
    if (!Array.isArray(list) || list.length > 80) {
      throw new Error('CLIENT_PACKAGE_INVALID_LIST');
    }
    const unique = new Set();
    for (const record of list) {
      if (!record || typeof record !== 'object' || Array.isArray(record) ||
          !validKey(record.importKey) || unique.has(record.importKey) ||
          Object.prototype.hasOwnProperty.call(record, 'id') ||
          Object.keys(record).some(k => k === '__proto__' ||
            k === 'constructor' || k === 'prototype')) {
        throw new Error('CLIENT_PACKAGE_INVALID_RECORD');
      }
      unique.add(record.importKey);
      total++;
    }
  }
  if (pkg.payload.contacts.length !== 5 || total < 18 || total > 100) {
    throw new Error('CLIENT_PACKAGE_COUNT_MISMATCH');
  }
  return { total, collections: CLIENT_COLLECTIONS.length };
}

function getArray(state, collection) {
  const arr = state[collection];
  if (!Array.isArray(arr)) throw new Error('JORNADA_STATE_INCOMPATIBLE');
  return arr;
}

/**
 * Pure in-memory merge. On conflict, NEVER guess whether two people
 * with the same name are the same contact.
 */
export function prepareClientImport(currentState, pkg, date = new Date().toISOString()) {
  validateClientPackage(pkg);
  if (!currentState || typeof currentState !== 'object' ||
      !Array.isArray(currentState.importBatches)) {
    throw new Error('JORNADA_STATE_INCOMPATIBLE');
  }
  if (currentState.importBatches.includes(CLIENT_BATCH_ID)) {
    return { alreadyApplied: true, changed: false, state: currentState, summary: {} };
  }

  const state = structuredClone(currentState);
  const keysByCollection = {};
  const summary = {};
  for (const collection of CLIENT_COLLECTIONS) {
    keysByCollection[collection] = new Map();
    for (const r of getArray(state, collection)) {
      if (validKey(r.importKey) && r.id) keysByCollection[collection].set(r.importKey, r.id);
    }
  }

  for (const collection of CLIENT_COLLECTIONS) {
    let added = 0;
    let updated = 0;
    const target = getArray(state, collection);
    for (const raw of pkg.payload[collection]) {
      const src = { ...raw };
      const key = src.importKey;
      const existing = target.find(t => t.importKey === key);

      if (collection === 'contacts' && !existing) {
        const ambiguous = target.find(t =>
          !t.importKey &&
          String(t.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().trim() ===
          String(src.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().trim());
        if (ambiguous) throw new Error('CLIENT_NAME_ALREADY_EXISTS_WITHOUT_IMPORT_KEY');
      }

      for (const [relation, [refCollection, idField]] of Object.entries(RELATIONS)) {
        if (src[relation]) {
          const id = keysByCollection[refCollection].get(src[relation]);
          if (!id) throw new Error('CLIENT_RELATION_NOT_FOUND');
          src[idField] = id;
          delete src[relation];
        }
      }

      src.provenance = {
        kind: 'drive_import',
        label: String(src.provenance?.label || pkg.sourceLabel || '').slice(0, 180),
        ref: String(src.provenance?.ref || pkg.sourceRef || '').slice(0, 500),
        updatedAt: String(src.provenance?.updatedAt || pkg.sourceUpdatedAt || '').slice(0, 80),
      };

      if (existing) {
        const oldId = existing.id;
        const oldCreated = existing.createdAt;
        Object.assign(existing, src);
        existing.id = oldId;
        existing.createdAt = oldCreated;
        existing.updatedAt = date;
        updated += 1;
      } else {
        const entry = { ...src, id: randomUUID(), createdAt: date, updatedAt: date };
        target.unshift(entry);
        keysByCollection[collection].set(key, entry.id);
        added += 1;
      }
    }
    summary[collection] = { added, updated };
  }
  state.importBatches = [CLIENT_BATCH_ID, ...state.importBatches].slice(0, 100);
  state.updatedAt = date;
  return { alreadyApplied: false, changed: true, state, summary };
}
