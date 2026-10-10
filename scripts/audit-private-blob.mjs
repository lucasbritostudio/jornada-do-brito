/**
 * Read-only Blob audit. Run ONLY in an authorized runtime that already has
 * BLOB_READ_WRITE_TOKEN in its environment. Never paste that token into chat,
 * CI artifacts, command arguments, logs or external LLMs.
 *
 * npm run audit:blob
 * This script neither exports personal data nor alters any object.
 */
import { get, list } from '@vercel/blob';
import { verifyJornadaLink } from './verify-jornada-link.mjs';

try {
  verifyJornadaLink();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'WRONG_PROJECT');
  process.exit(4);
}

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('BLOB_CREDENTIAL_NOT_AVAILABLE');
  process.exitCode = 2;
} else {
  const GROUPS = {
    state: 'jornada/state.json',
    auth: 'jornada/auth.json',
    secrets: 'jornada/secrets.json',
    index: 'jornada/ai-memory/index.json',
  };

  function category(pathname) {
    for (const [name, path] of Object.entries(GROUPS)) {
      if (pathname === path) return name;
    }
    if (pathname.startsWith('jornada/ai-memory/threads/')) return 'threads';
    if (pathname.startsWith('jornada/files/')) return 'files';
    return 'other';
  }

  // This pattern scan detects explicit likely secrets, not all private data.
  const patterns = [
    /gsk_[a-zA-Z0-9_-]{16,}/,
    /sk-proj-[a-zA-Z0-9_-]{16,}/,
    /Bearer\s+[A-Za-z0-9._-]{20,}/i,
    /"(?:(?:api|access|refresh|session)[-_ ]?token|password|senha)"\s*:\s*"(?!\[REDACTED\]|\*\*\*)([^"]{12,})"/i,
  ];

  async function audit() {
    const summary = {
      mode: 'read-only',
      exhaustive: true,
      objectCount: 0,
      totalBytes: 0,
      categories: {
        state: 0, auth: 0, secrets: 0, index: 0,
        threads: 0, files: 0, other: 0,
      },
      checkedJson: 0,
      suspectedSecretObjects: 0,
      unreadableObjects: 0,
      oversizedObjectsSkipped: 0,
      jsonParseFailures: 0,
      unseenThreadMetadata: null,
      staleThreadMetadata: null,
      caution: 'Heuristic results are NOT a full PII/privacy audit.',
    };
    const blobs = [];
    let cursor;
    for (let pageNo = 0; pageNo < 100; pageNo += 1) {
      const page = await list({ prefix: 'jornada/', limit: 1000, ...(cursor ? { cursor } : {}) });
      blobs.push(...page.blobs);
      if (!page.hasMore) { cursor = undefined; break; }
      cursor = page.cursor;
    }
    if (cursor) summary.exhaustive = false;
    summary.objectCount = blobs.length;
    const paths = new Set();
    for (const blob of blobs) {
      paths.add(blob.pathname);
      summary.totalBytes += blob.size || 0;
      summary.categories[category(blob.pathname)] += 1;
    }

    const indexMeta = blobs.find((blob) => blob.pathname === GROUPS.index);
    if (indexMeta && indexMeta.size <= 2_000_000) {
      try {
        const response = await get(GROUPS.index, { access: 'private', useCache: false });
        if (response?.stream) {
          const data = await new Response(response.stream).json();
          const indexedIds = new Set(Array.isArray(data?.threads) ?
            data.threads.map((t) => t.id).filter((id) => typeof id === 'string') : []);
          let unindexed = 0;
          for (const blob of blobs) {
            if (!blob.pathname.startsWith('jornada/ai-memory/threads/')) continue;
            const id = blob.pathname.slice('jornada/ai-memory/threads/'.length).replace(/\.json$/, '');
            if (!indexedIds.has(id)) unindexed += 1;
          }
          summary.unseenThreadMetadata = unindexed;
          summary.staleThreadMetadata = [...indexedIds].filter(
            (id) => !paths.has(`jornada/ai-memory/threads/${id}.json`),
          ).length;
        }
      } catch {
        summary.unreadableObjects += 1;
      }
    }
    // Historical memory and the secret vault are inspected ONLY in aggregate.
    // Avoid reading main state containing clients, finance and WhatsApp history.
    for (const blob of blobs) {
      if (!(blob.pathname.startsWith('jornada/ai-memory/') || blob.pathname === GROUPS.secrets)) continue;
      if (blob.size > 2_000_000) { summary.oversizedObjectsSkipped += 1; continue; }
      try {
        const data = await get(blob.pathname, { access: 'private', useCache: false });
        if (!data?.stream) continue;
        const body = await new Response(data.stream).text();
        JSON.parse(body);
        summary.checkedJson += 1;
        if (patterns.some((p) => p.test(body))) summary.suspectedSecretObjects += 1;
      } catch (error) {
        if (error instanceof SyntaxError) summary.jsonParseFailures += 1;
        else summary.unreadableObjects += 1;
      }
    }
    // No raw records, personal details, IDs, individual pathnames, or matches.
    console.log(JSON.stringify(summary, null, 2));
    if (!summary.exhaustive || summary.unreadableObjects || summary.jsonParseFailures) {
      process.exitCode = 3;
    }
  }
  audit().catch(() => {
    console.error('AUDIT_FAILED_WITHOUT_EXPOSING_DETAILS');
    process.exitCode = 1;
  });
}
