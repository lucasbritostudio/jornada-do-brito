import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLIENT_BATCH_ID, prepareClientImport, validateClientPackage } from '../scripts/import-client-merge.mjs';

function fixture() {
  return {
    batchId: CLIENT_BATCH_ID,
    sourceLabel: 'Drive — dados fictícios',
    sourceRef: 'documento-sintetico',
    sourceUpdatedAt: '2026-10-10',
    payload: {
      contacts: Array.from({ length: 5 }, (_, n) => ({
        importKey: 'contact-synth-' + n,
        name: 'Contato Sintético ' + n,
        lifecycle: 'prospect',
      })),
      opportunities: Array.from({ length: 4 }, (_, n) => ({
        importKey: 'opportunity-synth-' + n,
        contactImportKey: 'contact-synth-' + n,
        title: 'Proposta Sintética ' + n,
        stage: 'qualifying',
      })),
      projects: Array.from({ length: 3 }, (_, n) => ({
        importKey: 'project-synth-' + n,
        contactImportKey: 'contact-synth-' + n,
        opportunityImportKey: 'opportunity-synth-' + n,
        name: 'Projeto Sintético ' + n,
        status: 'planned',
      })),
      videoBriefs: [{
        importKey: 'video-synth-0',
        contactImportKey: 'contact-synth-0',
        projectImportKey: 'project-synth-0',
        title: 'Briefing fictício',
      }],
      inbox: [{ importKey: 'inbox-synth-0', title: 'Sem nome confirmado' }],
      clientExperiences: Array.from({ length: 9 }, (_, n) => ({
        importKey: 'experience-synth-' + n,
        contactImportKey: 'contact-synth-' + (n % 5),
        clientLabel: 'Contato Sintético ' + (n % 5),
        occurredOn: '2026-10-10',
        whatHappened: 'Etapa fictícia registrada com origem.',
        learnedRule: 'Nunca inventar dados.',
      })),
    },
  };
}

function state() {
  const s = { importBatches: [], audit: [], version: 1,
    profile: { displayName: 'Brito' }, financialAccounts: [{ id: 'own-bank', balance: 55 }],
    transactions: [{ id: 'own-transaction', amountCents: 123 }],
  };
  for (const k of Object.keys(fixture().payload)) s[k] = [];
  return s;
}

test('imports relationships and preserves finance and original state', () => {
  const initial = state();
  const plan = prepareClientImport(initial, fixture());
  assert.equal(plan.state.contacts.length, 5);
  assert.equal(plan.state.clientExperiences.length, 9);
  assert.equal(initial.contacts.length, 0);
  assert.deepEqual(plan.state.financialAccounts, initial.financialAccounts);
  assert.deepEqual(plan.state.transactions, initial.transactions);
  assert.ok(plan.state.projects.every(p => plan.state.contacts.some(c => c.id === p.contactId)));
  assert.ok(plan.state.projects.every(p => plan.state.opportunities.some(o => o.id === p.opportunityId)));
  assert.ok(plan.state.clientExperiences.every(e => plan.state.contacts.some(c => c.id === e.contactId)));
  assert.equal(plan.state.importBatches[0], CLIENT_BATCH_ID);
  assert.ok(plan.state.clientExperiences.every(e => e.clientLabel === 'Cliente atendido'));
  assert.ok(plan.state.clientExperiences.every(e => !('nextAction' in e)));

});

test('repeating the same batch is a no-op', () => {
  const first = prepareClientImport(state(), fixture());
  const again = prepareClientImport(first.state, fixture());
  assert.equal(again.alreadyApplied, true);
  assert.equal(again.changed, false);
  assert.equal(again.state.contacts.length, 5);
});

test('rejects financial collection and invalid relation', () => {
  const extra = fixture();
  extra.payload.financialAccounts = [];
  assert.throws(() => validateClientPackage(extra), /CLIENT_PACKAGE_UNEXPECTED_COLLECTION/);
  const broken = fixture();
  broken.payload.projects[0].contactImportKey = 'missing-client';
  assert.throws(() => prepareClientImport(state(), broken), /CLIENT_RELATION_NOT_FOUND/);
});

test('rejects unkeyed contact with matching name instead of duplicating', () => {
  const s = state();
  s.contacts.push({ id: 'existing', name: 'Contato Sintético 0' });
  assert.throws(() => prepareClientImport(s, fixture()), /CLIENT_NAME_ALREADY_EXISTS_WITHOUT_IMPORT_KEY/);
});

test('preserves original ID and creation date when an imported key is updated', () => {
  const s = state();
  s.contacts.push({ id: 'existing', name: 'Old name', importKey: 'contact-synth-0',
    createdAt: '2020-01-01T00:00:00.000Z' });
  const plan = prepareClientImport(s, fixture());
  const updated = plan.state.contacts.find(x => x.importKey === 'contact-synth-0');
  assert.equal(updated.id, 'existing');
  assert.equal(updated.createdAt, '2020-01-01T00:00:00.000Z');
  assert.equal(plan.summary.contacts.updated, 1);
});

test('rejects a learning summary with personal identifiers before writing state', () => {
  const pkg = fixture();
  pkg.payload.clientExperiences[0].learnedRule = 'Contatar email@exemplo.com';
  assert.throws(() => prepareClientImport(state(), pkg), /CLIENT_LEARNING_PRIVATE_FIELD_BLOCKED/);
});
