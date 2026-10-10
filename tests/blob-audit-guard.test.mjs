import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EXPECTED_PROJECT_ID,
  EXPECTED_TEAM_ID,
  verifyJornadaLink,
} from '../scripts/verify-jornada-link.mjs';

function withFixture(project, fn) {
  const root = mkdtempSync(join(tmpdir(), 'jornada-blob-guard-'));
  try {
    if (project !== null) {
      mkdirSync(join(root, '.vercel'));
      writeFileSync(join(root, '.vercel', 'project.json'), JSON.stringify(project));
    }
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('accepts only precisely linked Jornada project and team', () => {
  withFixture({ projectId: EXPECTED_PROJECT_ID, orgId: EXPECTED_TEAM_ID }, (dir) => {
    assert.equal(verifyJornadaLink(dir), true);
  });
});

test('blocks a link pointing at any other project without querying Blob', () => {
  withFixture({ projectId: 'prj_unrelated', orgId: EXPECTED_TEAM_ID }, (dir) => {
    assert.throws(() => verifyJornadaLink(dir), /JORNADA_LINK_MISMATCH/);
  });
});

test('blocks a link with a different team or missing local link', () => {
  withFixture({ projectId: EXPECTED_PROJECT_ID, orgId: 'team_unrelated' }, (dir) => {
    assert.throws(() => verifyJornadaLink(dir), /JORNADA_LINK_MISMATCH/);
  });
  withFixture(null, (dir) => {
    assert.throws(() => verifyJornadaLink(dir), /JORNADA_LINK_MISSING/);
  });
});
