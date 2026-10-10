import { get, put, list, BlobPreconditionFailedError } from '@vercel/blob';
import { sanitizeForLlm } from './ai-policy';
import { planMemoryRetention } from './memory-retention';

const INDEX_PATH = 'jornada/ai-memory/index.json';
const THREAD_PREFIX = 'jornada/ai-memory/threads/';

export type AiFeedback = 'resolved' | 'not_resolved';

export type AiTurn = {
  id: string;
  userText: string;
  assistantText: string;
  provider: string;
  model: string;
  outcome:
    | 'answered'
    | 'action'
    | 'proposal'
    | 'fallback'
    | 'error';
  actionName?: string;
  errorCode?: string;
  feedback?: AiFeedback;
  feedbackAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type AiThread = {
  id: string;
  title: string;
  status: 'open' | 'needs_attention' | 'resolved';
  createdAt: string;
  updatedAt: string;
  turns: AiTurn[];
};

export type AiLearningLesson = {
  id: string;
  problem: string;
  successfulResolution: string;
  failureCount: number;
  sourceThreadId: string;
  sourceTurnId: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  useCount: number;
};

type AiThreadMeta = {
  id: string;
  title: string;
  status: AiThread['status'];
  createdAt: string;
  updatedAt: string;
  turnCount: number;
};

type AiMemoryIndex = {
  version: 1;
  threads: AiThreadMeta[];
  lessons: AiLearningLesson[];
  updatedAt: string;
};

const EMPTY_INDEX: AiMemoryIndex = {
  version: 1,
  threads: [],
  lessons: [],
  updatedAt: new Date(0).toISOString(),
};

const STOPWORDS = new Set([
  'a','o','as','os','de','da','do','das','dos','e','em','um','uma','para','por',
  'com','que','eu','me','meu','minha','na','no','nas','nos','isso','essa','esse',
  'como','foi','ser','ter','esta','está','estou','mais','menos','ja','já','se',
  'ao','aos','ele','ela','eles','elas','voce','você','pra','pro',
]);

function now() {
  return new Date().toISOString();
}

function safeId(value: string) {
  const id = value.trim();
  return /^[a-zA-Z0-9_-]{8,120}$/.test(id)
    ? id
    : crypto.randomUUID();
}

function threadPath(id: string) {
  return `${THREAD_PREFIX}${safeId(id)}.json`;
}

const versions = new WeakMap<object, string | null>();

async function readJson<T extends object>(pathname: string): Promise<T | null> {
  try {
    const result = await get(pathname, { access: 'private', useCache: false });
    if (!result) return null;
    if (!result.blob?.etag) throw new Error('BLOB_ETAG_MISSING');
    const data = (await new Response(result.stream).json()) as T;
    versions.set(data, result.blob.etag);
    return data;
  } catch (error) {
    // Ausência do objeto é diferente de falha de rede, autorização ou
    // corrupção. Não converter erro em memória vazia evita perda silenciosa.
    throw error;
  }
}

async function writeJson(pathname: string, value: object) {
  if (!versions.has(value)) throw new Error('MEMORY_VERSION_REQUIRED');
  const etag = versions.get(value);
  await put(pathname, JSON.stringify(value, null, 2), {
    access: 'private',
    allowOverwrite: Boolean(etag),
    ...(etag ? { ifMatch: etag } : {}),
    addRandomSuffix: false,
    contentType: 'application/json',
  });
}

async function getIndex() {
  const stored = await readJson<AiMemoryIndex>(INDEX_PATH);
  if (!stored) {
    const empty: AiMemoryIndex = { ...EMPTY_INDEX, threads: [], lessons: [] };
    versions.set(empty, null);
    return empty;
  }

  const normalized: AiMemoryIndex = {
    version: 1 as const,
    threads: Array.isArray(stored.threads)
      ? stored.threads.map((thread) => ({
          ...thread,
          title: cleanText(String(thread.title || ''), 90),
        }))
      : [],
    lessons: Array.isArray(stored.lessons)
      ? stored.lessons.map((lesson) => {
          const problem = cleanText(String(lesson.problem || ''));
          const successfulResolution = cleanText(
            String(lesson.successfulResolution || ''),
            8000,
          );

          return {
            ...lesson,
            problem,
            successfulResolution,
            failureCount: Number.isFinite(lesson.failureCount)
              ? lesson.failureCount
              : 1,
            tags: tokenize(`${problem} ${successfulResolution}`),
            useCount: Number.isFinite(lesson.useCount)
              ? lesson.useCount
              : 0,
          };
        })
      : [],
    updatedAt: String(stored.updatedAt || EMPTY_INDEX.updatedAt),
  };
  versions.set(normalized, versions.get(stored) ?? null);
  return normalized;
}

async function saveIndex(index: AiMemoryIndex) {
  index.updatedAt = now();
  // Never silently drop older memories when an arbitrary display cap is met.
  // UI endpoints can page, but persistent metadata must stay complete.
  index.threads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  index.lessons.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (Buffer.byteLength(JSON.stringify(index), 'utf8') > 3_000_000) {
    throw new Error('MEMORY_INDEX_CAPACITY_REACHED');
  }
  await writeJson(INDEX_PATH, index);
}

export async function getAiThread(id: string) {
  const normalized = safeId(id);
  const thread = await readJson<AiThread>(threadPath(normalized));
  if (!thread) return null;

  const sanitized: AiThread = {
    ...thread,
    title: cleanText(String(thread.title || ''), 90),
    turns: Array.isArray(thread.turns)
      ? thread.turns.map((turn) => ({
          ...turn,
          userText: cleanText(String(turn.userText || '')),
          assistantText: cleanText(
            String(turn.assistantText || ''),
            8000,
          ),
          provider: cleanText(String(turn.provider || 'unknown'), 80),
          model: cleanText(String(turn.model || 'unknown'), 120),
          actionName: turn.actionName
            ? cleanText(String(turn.actionName), 120)
            : undefined,
          errorCode: turn.errorCode
            ? cleanText(String(turn.errorCode), 120)
            : undefined,
        }))
      : [],
  };
  versions.set(sanitized, versions.get(thread) ?? null);
  return sanitized;
}

function upsertThreadMeta(index: AiMemoryIndex, thread: AiThread) {
  const next: AiThreadMeta = {
    id: thread.id,
    title: thread.title,
    status: thread.status,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    turnCount: thread.turns.length,
  };
  const idx = index.threads.findIndex((item) => item.id === thread.id);
  // A slower index update may finish after a newer thread write.
  // Do not move its metadata backwards.
  if (idx >= 0) {
    const current = index.threads[idx];
    if (current.updatedAt > next.updatedAt ||
        (current.updatedAt === next.updatedAt && current.turnCount > next.turnCount)) return;
    index.threads[idx] = next;
  } else index.threads.unshift(next);
}

function cleanText(value: string, max = 5000) {
  return sanitizeForLlm(value).trim().slice(0, max);
}

function titleFrom(text: string) {
  const clean = cleanText(text, 90);
  return clean.length < 90 ? clean : clean.slice(0, 87) + '...';
}

function deriveThreadStatus(thread: AiThread): AiThread['status'] {
  const feedbackTurns = thread.turns.filter(
    (item) => item.feedback,
  );
  if (!feedbackTurns.length) return 'open';

  let lastResolved = -1;
  for (let index = thread.turns.length - 1; index >= 0; index -= 1) {
    if (thread.turns[index].feedback === 'resolved') {
      lastResolved = index;
      break;
    }
  }

  const hasOpenFailure = thread.turns
    .slice(lastResolved + 1)
    .some((item) => item.feedback === 'not_resolved');

  return hasOpenFailure || lastResolved < 0
    ? 'needs_attention'
    : 'resolved';
}

// Retry only actual ETag conflicts, never authorization/network/JSON errors.
function isConcurrencyConflict(error: unknown) {
  return error instanceof BlobPreconditionFailedError ||
    (error instanceof Error && /BlobAlreadyExists|already exists/i.test(error.name));
}

async function mutateIndex<T>(modify: (index: AiMemoryIndex) => T): Promise<{ index: AiMemoryIndex; result: T }> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const index = await getIndex();
    const result = modify(index);
    try {
      await saveIndex(index);
      return { index, result };
    } catch (error) {
      if (!isConcurrencyConflict(error) || attempt === 5) throw error;
    }
  }
  throw new Error('MEMORY_INDEX_CONFLICT');
}

export async function recordAiTurn(input: {
  threadId?: string;
  userText: string;
  assistantText: string;
  provider?: string;
  model?: string;
  outcome: AiTurn['outcome'];
  actionName?: string;
  errorCode?: string;
}) {
  const id = safeId(input.threadId || crypto.randomUUID());
  const at = now();
  const turn: AiTurn = {
    id: crypto.randomUUID(),
    userText: cleanText(input.userText),
    assistantText: cleanText(input.assistantText, 8000),
    provider: cleanText(input.provider || 'unknown', 80),
    model: cleanText(input.model || 'unknown', 120),
    outcome: input.outcome,
    actionName: input.actionName ? cleanText(input.actionName, 120) : undefined,
    errorCode: input.errorCode ? cleanText(input.errorCode, 120) : undefined,
    createdAt: at,
    updatedAt: at,
  };

  let persisted: AiThread | undefined;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const existing = await getAiThread(id);
    const thread: AiThread = existing || {
      id,
      title: titleFrom(input.userText),
      status: 'open',
      createdAt: at,
      updatedAt: at,
      turns: [],
    };
    if (!existing) versions.set(thread, null);
    thread.turns.push(turn);
    thread.updatedAt = at;
    try {
      await writeJson(threadPath(id), thread);
      persisted = thread;
      break;
    } catch (error) {
      if (!isConcurrencyConflict(error) || attempt === 5) throw error;
    }
  }
  if (!persisted) throw new Error('MEMORY_THREAD_CONFLICT');
  const committedThread = persisted;
  // The durable thread was already written. An index outage must not tell
  // the client that the response itself was lost and trigger a duplicate.
  try {
    const { index } = await mutateIndex((index) => upsertThreadMeta(index, committedThread));
    return { threadId: id, turnId: turn.id, learningCount: index.lessons.length, indexPending: false };
  } catch {
    return { threadId: id, turnId: turn.id, learningCount: 0, indexPending: true };
  }
}

function tokenize(text: string) {
  return Array.from(
    new Set(
      text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, ' ')
        .split(/\s+/)
        .filter((item) => item.length >= 3 && !STOPWORDS.has(item))
        .slice(0, 30),
    ),
  );
}

function lessonKey(problem: string, resolution: string) {
  const seed = `${problem}\n${resolution}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 160);
  return seed || crypto.randomUUID();
}

export async function recordAiFeedback(input: {
  threadId: string;
  turnId: string;
  feedback: AiFeedback;
}) {
  let persisted: AiThread | undefined;
  let finalTurn: AiTurn | undefined;
  let at = now();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const thread = await getAiThread(input.threadId);
    if (!thread) throw new Error('Conversa não encontrada.');
    const turn = thread.turns.find((item) => item.id === input.turnId);
    if (!turn) throw new Error('Resposta não encontrada.');
    at = now();
    turn.feedback = input.feedback;
    turn.feedbackAt = at;
    turn.updatedAt = at;
    thread.status = deriveThreadStatus(thread);
    thread.updatedAt = at;
    try {
      await writeJson(threadPath(thread.id), thread);
      persisted = thread;
      finalTurn = turn;
      break;
    } catch (error) {
      if (!isConcurrencyConflict(error) || attempt === 5) throw error;
    }
  }
  if (!persisted || !finalTurn) throw new Error('MEMORY_FEEDBACK_CONFLICT');
  const thread = persisted;
  const turn = finalTurn;
  const update = await mutateIndex((index) => {
    let lessonCreated = false;
    if (input.feedback === 'resolved') {
      const currentIndex = thread.turns.findIndex((item) => item.id === input.turnId);
      const previousTurns = thread.turns.slice(0, currentIndex);
      let lastResolvedIndex = -1;
      for (let i = previousTurns.length - 1; i >= 0; i -= 1) {
        if (previousTurns[i].feedback === 'resolved') {
          lastResolvedIndex = i;
          break;
        }
      }
      const failedBefore = thread.turns.slice(lastResolvedIndex + 1, currentIndex)
        .filter((item) => item.feedback === 'not_resolved');
      if (failedBefore.length) {
        const firstFailure = failedBefore[0];
        const key = lessonKey(firstFailure.userText, turn.assistantText);
        const existing = index.lessons.find((item) =>
          lessonKey(item.problem, item.successfulResolution) === key,
        );
        const lesson: AiLearningLesson = {
          id: existing?.id || crypto.randomUUID(),
          problem: firstFailure.userText,
          successfulResolution: turn.assistantText,
          failureCount: failedBefore.length,
          sourceThreadId: thread.id,
          sourceTurnId: turn.id,
          tags: tokenize(failedBefore.map((item) => item.userText).join(' ') + ' ' + turn.userText),
          createdAt: existing?.createdAt || at,
          updatedAt: at,
          useCount: existing?.useCount || 0,
        };
        if (existing) {
          const idx = index.lessons.findIndex((item) => item.id === existing.id);
          index.lessons[idx] = lesson;
        } else index.lessons.unshift(lesson);
        lessonCreated = true;
      }
    }
    upsertThreadMeta(index, thread);
    return lessonCreated;
  });
  return {
    feedback: turn.feedback,
    threadStatus: thread.status,
    lessonCreated: update.result,
    learningCount: update.index.lessons.length,
  };
}

export async function findRelevantAiLessons(
  prompt: string,
  limit = 5,
) {
  const index = await getIndex();
  const query = new Set(tokenize(prompt));
  if (!query.size) return [];

  const ranked = index.lessons
    .map((lesson) => {
      const score = lesson.tags.reduce(
        (sum, tag) => sum + (query.has(tag) ? 1 : 0),
        0,
      );
      return { lesson, score };
    })
    .filter((item) => item.score >= (query.size <= 2 ? 1 : 2))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.lesson.updatedAt.localeCompare(a.lesson.updatedAt),
    )
    .slice(0, limit);

  if (ranked.length) {
    const used = new Set(ranked.map((item) => item.lesson.id));
    // Usage metrics must never break chat if another writer updates the index.
    try {
      await mutateIndex((fresh) => {
        for (const lesson of fresh.lessons) {
          if (used.has(lesson.id)) {
            lesson.useCount += 1;
            lesson.updatedAt = now();
          }
        }
      });
    } catch {
      // Read-only recommendations still work; the optional counter is best effort.
    }
  }

  return ranked.map(({ lesson }) => ({
    problem: lesson.problem,
    successfulResolution: lesson.successfulResolution,
    failureCount: lesson.failureCount,
  }));
}

export async function getAiMemoryStats() {
  const index = await getIndex();
  const resolved = index.threads.filter(
    (item) => item.status === 'resolved',
  ).length;
  const needsAttention = index.threads.filter(
    (item) => item.status === 'needs_attention',
  ).length;

  return {
    threads: index.threads.length,
    resolved,
    needsAttention,
    learningCount: index.lessons.length,
  };
}

export async function getAiHistory(threadId: string) {
  const thread = await getAiThread(threadId);
  const stats = await getAiMemoryStats();

  if (!thread) {
    return {
      threadId: safeId(threadId),
      title: '',
      status: 'open' as const,
      messages: [],
      stats,
    };
  }

  const messages = thread.turns.flatMap((turn) => [
    {
      role: 'user' as const,
      content: turn.userText,
      createdAt: turn.createdAt,
    },
    {
      role: 'assistant' as const,
      content: turn.assistantText,
      turnId: turn.id,
      feedback: turn.feedback,
      outcome: turn.outcome,
      createdAt: turn.createdAt,
    },
  ]);

  return {
    threadId: thread.id,
    title: thread.title,
    status: thread.status,
    messages,
    stats,
  };
}


export async function getAiLearningOverview() {
  const index = await getIndex();
  return {
    stats: {
      threads: index.threads.length,
      resolved: index.threads.filter(
        (item) => item.status === 'resolved',
      ).length,
      needsAttention: index.threads.filter(
        (item) => item.status === 'needs_attention',
      ).length,
      learningCount: index.lessons.length,
    },
    recentLessons: index.lessons.slice(0, 5).map((lesson) => ({
      id: lesson.id,
      problem: lesson.problem.slice(0, 220),
      successfulResolution:
        lesson.successfulResolution.slice(0, 320),
      failureCount: lesson.failureCount,
      useCount: lesson.useCount,
      updatedAt: lesson.updatedAt,
    })),
  };
}

/** Read-only audit preview; no retention rule or deletion is applied. */
export async function previewAiMemoryRetention(cutoffIso: string | null) {
  const index = await getIndex();
  return planMemoryRetention(index.threads, index.lessons, cutoffIso);
}

/**
 * Reconstruct a lesson after a failure between saving thread feedback and
 * updating the index. Never replaces an existing lesson or resets useCount.
 */
function restoreLessonsFromThread(index: AiMemoryIndex, thread: AiThread) {
  let restored = 0;
  for (let current = 0; current < thread.turns.length; current += 1) {
    const resolution = thread.turns[current];
    if (resolution.feedback !== 'resolved') continue;
    let lastResolved = -1;
    for (let prev = current - 1; prev >= 0; prev -= 1) {
      if (thread.turns[prev].feedback === 'resolved') {
        lastResolved = prev;
        break;
      }
    }
    const failures = thread.turns
      .slice(lastResolved + 1, current)
      .filter((turn) => turn.feedback === 'not_resolved');
    if (!failures.length) continue;
    const problem = failures[0].userText;
    const successfulResolution = resolution.assistantText;
    const key = lessonKey(problem, successfulResolution);
    if (index.lessons.some((lesson) =>
      lessonKey(lesson.problem, lesson.successfulResolution) === key)) continue;
    const at = resolution.feedbackAt || resolution.updatedAt || now();
    index.lessons.push({
      id: crypto.randomUUID(),
      problem,
      successfulResolution,
      failureCount: failures.length,
      sourceThreadId: thread.id,
      sourceTurnId: resolution.id,
      tags: tokenize(failures.map((turn) => turn.userText).join(' ') + ' ' + resolution.userText),
      createdAt: at,
      updatedAt: at,
      useCount: 0,
    });
    restored += 1;
  }
  return restored;
}

/**
 * Explicit, owner-initiated maintenance only. Blob writes remain restricted
 * to the *index*, never the underlying conversations, and are CAS-protected.
 * Restores metadata for a conversation committed before an index write failed.
 */
export async function reconcileAiMemoryIndex() {
  const paths: string[] = [];
  let cursor: string | undefined;
  for (let pageNo = 0; pageNo < 20; pageNo += 1) {
    const page = await list({
      prefix: THREAD_PREFIX,
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    paths.push(...page.blobs
      .map((blob) => blob.pathname)
      .filter((path) => /^jornada\/ai-memory\/threads\/[a-zA-Z0-9_-]{8,120}\.json$/.test(path)));
    if (!page.hasMore) {
      cursor = undefined;
      break;
    }
    if (!page.cursor) throw new Error('MEMORY_INDEX_RECONCILE_INCOMPLETE');
    cursor = page.cursor;
  }
  if (cursor) throw new Error('MEMORY_INDEX_RECONCILE_INCOMPLETE');
  const unique = [...new Set(paths)];
  let repaired = 0;
  let lessonsRestored = 0;
  const threads: AiThread[] = [];
  for (const pathname of unique) {
    const id = pathname.slice(THREAD_PREFIX.length, -'.json'.length);
    const thread = await getAiThread(id);
    if (!thread) throw new Error('MEMORY_INDEX_THREAD_MISSING');
    threads.push(thread);
  }
  await mutateIndex((index) => {
    repaired = 0;
    lessonsRestored = 0;
    for (const thread of threads) {
      const current = index.threads.find((meta) => meta.id === thread.id);
      if (!current || current.turnCount < thread.turns.length) repaired += 1;
      upsertThreadMeta(index, thread);
      lessonsRestored += restoreLessonsFromThread(index, thread);
    }
  });
  return { scanned: unique.length, repaired, lessonsRestored, completed: true };
}
