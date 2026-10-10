import { get, put } from '@vercel/blob';

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

async function readJson<T>(pathname: string): Promise<T | null> {
  try {
    const result = await get(pathname, { access: 'private' });
    if (!result || result.statusCode !== 200) return null;
    return (await new Response(result.stream).json()) as T;
  } catch {
    return null;
  }
}

async function writeJson(pathname: string, value: unknown) {
  await put(pathname, JSON.stringify(value, null, 2), {
    access: 'private',
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: 'application/json',
  });
}

async function getIndex() {
  return (await readJson<AiMemoryIndex>(INDEX_PATH)) || {
    ...EMPTY_INDEX,
    threads: [],
    lessons: [],
  };
}

async function saveIndex(index: AiMemoryIndex) {
  index.updatedAt = now();
  index.threads = index.threads
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 500);
  index.lessons = index.lessons
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 300);
  await writeJson(INDEX_PATH, index);
}

export async function getAiThread(id: string) {
  const normalized = safeId(id);
  return readJson<AiThread>(threadPath(normalized));
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
  if (idx >= 0) index.threads[idx] = next;
  else index.threads.unshift(next);
}

function cleanText(value: string, max = 5000) {
  return value.trim().slice(0, max);
}

function titleFrom(text: string) {
  const clean = cleanText(text, 90);
  return clean.length < 90 ? clean : clean.slice(0, 87) + '...';
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
  const existing = await getAiThread(id);
  const thread: AiThread =
    existing || {
      id,
      title: titleFrom(input.userText),
      status: 'open',
      createdAt: at,
      updatedAt: at,
      turns: [],
    };

  const turn: AiTurn = {
    id: crypto.randomUUID(),
    userText: cleanText(input.userText),
    assistantText: cleanText(input.assistantText, 8000),
    provider: cleanText(input.provider || 'unknown', 80),
    model: cleanText(input.model || 'unknown', 120),
    outcome: input.outcome,
    actionName: input.actionName
      ? cleanText(input.actionName, 120)
      : undefined,
    errorCode: input.errorCode
      ? cleanText(input.errorCode, 120)
      : undefined,
    createdAt: at,
    updatedAt: at,
  };

  thread.turns.push(turn);
  thread.updatedAt = at;

  const index = await getIndex();
  upsertThreadMeta(index, thread);

  await writeJson(threadPath(id), thread);
  await saveIndex(index);

  return {
    threadId: id,
    turnId: turn.id,
    learningCount: index.lessons.length,
  };
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
  const thread = await getAiThread(input.threadId);
  if (!thread) throw new Error('Conversa não encontrada.');

  const turn = thread.turns.find((item) => item.id === input.turnId);
  if (!turn) throw new Error('Resposta não encontrada.');

  const at = now();
  turn.feedback = input.feedback;
  turn.feedbackAt = at;
  turn.updatedAt = at;

  const index = await getIndex();
  let lessonCreated = false;

  if (input.feedback === 'not_resolved') {
    thread.status = 'needs_attention';
  } else {
    const currentIndex = thread.turns.findIndex(
      (item) => item.id === input.turnId,
    );
    const failedBefore = thread.turns
      .slice(0, currentIndex)
      .filter((item) => item.feedback === 'not_resolved');

    if (failedBefore.length) {
      const firstFailure = failedBefore[0];
      const key = lessonKey(
        firstFailure.userText,
        turn.assistantText,
      );
      const existing = index.lessons.find(
        (item) =>
          lessonKey(item.problem, item.successfulResolution) === key,
      );

      const lesson: AiLearningLesson = {
        id: existing?.id || crypto.randomUUID(),
        problem: firstFailure.userText,
        successfulResolution: turn.assistantText,
        failureCount: failedBefore.length,
        sourceThreadId: thread.id,
        sourceTurnId: turn.id,
        tags: tokenize(
          failedBefore.map((item) => item.userText).join(' ') +
            ' ' +
            turn.userText,
        ),
        createdAt: existing?.createdAt || at,
        updatedAt: at,
        useCount: existing?.useCount || 0,
      };

      if (existing) {
        const idx = index.lessons.findIndex(
          (item) => item.id === existing.id,
        );
        index.lessons[idx] = lesson;
      } else {
        index.lessons.unshift(lesson);
      }
      lessonCreated = true;
    }

    const hasUnresolvedAfter = thread.turns.some(
      (item, idx) =>
        idx > currentIndex && item.feedback === 'not_resolved',
    );
    thread.status = hasUnresolvedAfter ? 'needs_attention' : 'resolved';
  }

  thread.updatedAt = at;
  upsertThreadMeta(index, thread);

  await writeJson(threadPath(thread.id), thread);
  await saveIndex(index);

  return {
    feedback: turn.feedback,
    threadStatus: thread.status,
    lessonCreated,
    learningCount: index.lessons.length,
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
    .filter((item) => item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.lesson.updatedAt.localeCompare(a.lesson.updatedAt),
    )
    .slice(0, limit);

  if (ranked.length) {
    const used = new Set(ranked.map((item) => item.lesson.id));
    let changed = false;
    for (const lesson of index.lessons) {
      if (used.has(lesson.id)) {
        lesson.useCount += 1;
        lesson.updatedAt = now();
        changed = true;
      }
    }
    if (changed) await saveIndex(index);
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
