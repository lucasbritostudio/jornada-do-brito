import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as sdk from '@vercel/blob';

let stateText = '';
let version = 1;
let writes = 0;
let authenticated = true;
let raceOnRead = false;
let raceOnWrite = false;
let videoSize = Math.round(125.4 * 1024 * 1024);
const id = '12345678-1234-4234-8234-123456789abc';
const pathname = `jornada/portfolio/${id}/Max_iphone-abc.mp4`;
const storageEtag = () => `"storage-${version}"`;
mock.module('@vercel/blob', { namedExports: {
  ...sdk,
  head: async () => ({ etag: storageEtag() }),
  get: async () => {
    const snapshot = stateText;
    if (raceOnRead) {
      raceOnRead = false;
      const current = JSON.parse(stateText);
      current.profile.displayName = 'Nome atualizado em outra sessão';
      stateText = JSON.stringify(current); version++;
    }
    return { statusCode: 200, stream: new Response(snapshot).body, blob: { etag: '"delivery-etag"' } };
  },
  put: async (_path: string, text: string, options: { ifMatch?: string }) => {
    if (raceOnWrite) {
      raceOnWrite = false;
      const current = JSON.parse(stateText);
      current.profile.workspaceName = 'Atualização simultânea preservada';
      stateText = JSON.stringify(current); version++;
      throw new sdk.BlobPreconditionFailedError();
    }
    if (options.ifMatch !== storageEtag()) throw new sdk.BlobPreconditionFailedError();
    stateText = text; version++; writes++;
    return { etag: storageEtag() };
  },
  list: async () => ({ blobs: [{ pathname, size: videoSize, uploadedAt: new Date() }] }),
}});
mock.module(pathToFileURL(resolve('lib/auth.ts')).href, { namedExports: {
  requireAuthenticated: async () => { if (!authenticated) throw new Error('UNAUTHORIZED'); },
}});
const { defaultState } = await import('../lib/store');
const { isBlobConflict } = await import('../lib/blob-conflict');
const { POST } = await import('../app/api/portfolio/manage/route');
function reset() {
  stateText = JSON.stringify(defaultState()); version = 1; writes = 0;
  authenticated = true; raceOnRead = false; raceOnWrite = false;
  videoSize = Math.round(125.4 * 1024 * 1024);
}
async function save() {
  return POST(new Request('https://localhost/api/portfolio/manage', { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'complete-upload', id, pathname, originalFilename: 'Max iphone.mp4', title: 'Max iphone', published: false }),
  }));
}
test('real SDK conflict has generic Error name and is still recognized', () => {
  const error = new sdk.BlobPreconditionFailedError();
  assert.equal(error.name, 'Error'); assert.equal(isBlobConflict(error), true);
  assert.equal(isBlobConflict(new Error('unrelated failure')), false);
});
test('125 MB video saves with storage ETag even when HTTP delivery ETag differs; retry does not duplicate', async () => {
  reset(); assert.equal((await save()).status, 200);
  assert.equal((await save()).status, 200);
  const data = JSON.parse(stateText);
  assert.equal(data.portfolioItems.length, 1);
  assert.equal(data.portfolioItems[0].sizeBytes, videoSize);
  assert.equal(data.audit.filter((x: any) => x.action === 'portfolio.item.upload').length, 1);
});
test('change during content read is detected and preserves the newer snapshot', async () => {
  reset(); raceOnRead = true;
  assert.equal((await save()).status, 200);
  assert.equal(JSON.parse(stateText).profile.displayName, 'Nome atualizado em outra sessão');
});
test('real SDK conditional-write conflict retries and preserves concurrent data', async () => {
  reset(); raceOnWrite = true;
  assert.equal((await save()).status, 200);
  assert.equal(JSON.parse(stateText).profile.workspaceName, 'Atualização simultânea preservada');
  assert.equal(JSON.parse(stateText).portfolioItems.length, 1);
});
test('oversized and unauthenticated requests do not write', async () => {
  reset(); videoSize = 1024 ** 3 + 1;
  assert.equal((await save()).status, 400); assert.equal(writes, 0);
  authenticated = false;
  assert.equal((await save()).status, 401); assert.equal(writes, 0);
});
