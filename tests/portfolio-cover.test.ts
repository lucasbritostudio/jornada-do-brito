import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const id = '12345678-1234-4234-8234-123456789abc';
const videoPath = `jornada/portfolio/${id}/video.mp4`;
const oldCover = `jornada/portfolio-covers/${id}/old.jpg`;
let authenticated = true;
let writes: string[] = [];
let deleted: string[] = [];
let race = false;
let failMutation = false;
let item: any;
const state = { portfolioItems: [] as any[], profile: { displayName: 'Brito' } };
const moduleUrl = (path: string) => pathToFileURL(resolve(path)).href;
mock.module('@vercel/blob', { namedExports: {
  put: async (path: string, _image: Buffer, options: any) => { assert.equal(options.access, 'private'); assert.equal(options.contentType, 'image/jpeg'); writes.push(path); return { pathname: path }; },
  del: async (path: string) => { deleted.push(path); },
  issueSignedToken: async ({ pathname }: any) => pathname,
  presignUrl: async (_token: string, { pathname }: any) => ({ presignedUrl: `https://media.example.test/${pathname}` }),
}});
mock.module(moduleUrl('lib/auth.ts'), { namedExports: { requireAuthenticated: async () => { if (!authenticated) throw new Error('UNAUTHORIZED'); } } });
mock.module(moduleUrl('lib/store.ts'), { namedExports: { getState: async () => state, audit: () => {} } });
mock.module(moduleUrl('lib/state-mutation.ts'), { namedExports: {
  mutateStateSafely: async (mutate: (state: any) => void) => {
    if (failMutation) throw new Error('STATE_WRITE_CONFLICT');
    if (race) { item.coverPathname = oldCover; item.coverFrameSeconds = 7; race = false; }
    mutate(state);
  },
}});
mock.module(moduleUrl('lib/portfolio-metrics.ts'), { namedExports: { signPortfolioPlayToken: () => 'play-token' } });
const { POST } = await import('../app/api/portfolio/cover/route');
const { GET } = await import('../app/api/public/portfolio/route');
const { automaticFrame } = await import('../app/portfolio/video-cover');
function reset() {
  authenticated = true; writes = []; deleted = []; race = false; failMutation = false;
  item = { id, title: 'Trabalho', description: '', blobPathname: videoPath, published: true, sizeBytes: 100, createdAt: '2026-10-28' };
  state.portfolioItems = [item];
}
function save(extra: Record<string, unknown> = {}) {
  return POST(new Request('https://localhost/api/portfolio/cover', { method: 'POST', body: JSON.stringify({ itemId: id, imageDataUrl: 'data:image/jpeg;base64,/9j/2Q==', frameSeconds: 2.35, ...extra }) }));
}
test('owner saves a frame as a private JPEG and preserves the video', async () => {
  reset(); const response = await save(); assert.equal(response.status, 200);
  assert.match(item.coverPathname, new RegExp(`^jornada/portfolio-covers/${id}/`));
  assert.equal(item.coverFrameSeconds, 2.35); assert.equal(item.blobPathname, videoPath);
  assert.equal((await response.json()).coverFrameSeconds, 2.35);
});
test('replacement removes the old cover only after saving its replacement', async () => {
  reset(); item.coverPathname = oldCover;
  assert.equal((await save()).status, 200); assert.deepEqual(deleted, [oldCover]);
});
test('automatic retry keeps the cover selected by the owner, including concurrent selection', async () => {
  reset(); item.coverPathname = oldCover; item.coverFrameSeconds = 7;
  assert.equal((await save({ automatic: true })).status, 200); assert.equal(writes.length, 0);
  reset(); race = true;
  assert.equal((await save({ automatic: true })).status, 200);
  assert.equal(item.coverPathname, oldCover); assert.equal(item.coverFrameSeconds, 7);
  assert.deepEqual(deleted, writes);
});
test('invalid data, missing video and unauthenticated callers cannot store covers', async () => {
  reset(); authenticated = false; assert.equal((await save()).status, 401);
  authenticated = true;
  for (const extra of [{ imageDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }, { frameSeconds: -1 }, { imageDataUrl: 'data:image/jpeg;base64,YmFk' }, { imageDataUrl: 'x'.repeat(900_001) }]) assert.equal((await save(extra)).status, 400);
  state.portfolioItems = []; assert.equal((await save()).status, 404); assert.equal(writes.length, 0);
});
test('failed state write removes the unreferenced upload and keeps the previous cover', async () => {
  reset(); item.coverPathname = oldCover; failMutation = true;
  assert.equal((await save()).status, 409); assert.equal(item.coverPathname, oldCover); assert.deepEqual(deleted, writes);
});
test('public gallery exposes signed covers only for published videos, with no internal path fields', async () => {
  reset(); item.coverPathname = oldCover;
  let data = await (await GET()).json();
  assert.equal(data.items.length, 1); assert.match(data.items[0].coverUrl, /old\.jpg$/);
  assert.equal(data.items[0].coverPathname, undefined); assert.equal(data.items[0].blobPathname, undefined);
  item.published = false; data = await (await GET()).json(); assert.equal(data.items.length, 0);
});
test('automatic frame stays inside short and long videos', () => {
  assert.equal(automaticFrame(0.2), 0.020000000000000004);
  assert.equal(automaticFrame(10), 1); assert.equal(automaticFrame(80), 3);
});
