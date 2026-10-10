import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planMemoryRetention } from '../lib/memory-retention';

test('no policy means no automatic deletion candidates', () => {
  const output = planMemoryRetention([
    { id: 'old-thread', updatedAt: '2025-01-01T00:00:00.000Z', status: 'resolved' },
  ], [], null);
  assert.equal(output.policyConfigured, false);
  assert.equal(output.mode, 'dry-run');
  assert.deepEqual(output.threadIds, []);
});

test('old unresolved threads are excluded and require manual review', () => {
  const preview = planMemoryRetention([
    { id: 'closed', updatedAt: '2025-01-01T00:00:00.000Z', status: 'resolved' },
    { id: 'open', updatedAt: '2025-01-01T00:00:00.000Z', status: 'needs_attention' },
    { id: 'recent', updatedAt: '2026-12-01T00:00:00.000Z', status: 'resolved' },
  ], [{ id: 'lesson-old', updatedAt: '2025-01-01T00:00:00.000Z' }], '2026-01-01T00:00:00.000Z');
  assert.deepEqual(preview.threadIds, ['closed']);
  assert.deepEqual(preview.lessonIds, ['lesson-old']);
  assert.equal(preview.unresolvedExcluded, 1);
  assert.equal(preview.reviewRequired, true);
});

test('invalid cutoff is rejected', () => {
  assert.throws(() => planMemoryRetention([], [], 'yesterday'), /INVALID_RETENTION_CUTOFF/);
});
