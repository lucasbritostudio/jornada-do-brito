import { get, put } from '@vercel/blob';

export type YouTubeAutomationMode = 'autonomous' | 'paused';
export type YouTubePublishMode = 'private' | 'unlisted' | 'public';
export type YouTubeRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'paused';

export type YouTubeRun = {
  id: string;
  status: YouTubeRunStatus;
  stage: 'research' | 'script' | 'media' | 'seo' | 'review' | 'publish' | 'complete';
  summary?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type YouTubeModuleState = {
  version: 1;
  enabled: boolean;
  mode: YouTubeAutomationMode;
  channelName: string;
  audience: string;
  contentPillars: string[];
  cadence: 'daily' | 'weekly' | 'manual';
  publishMode: YouTubePublishMode;
  provider: 'not_configured' | 'openai' | 'gemini' | 'openrouter';
  runs: YouTubeRun[];
  updatedAt: string;
};

const PATH = 'jornada/youtube/state.json';
const now = () => new Date().toISOString();

export function defaultYouTubeState(): YouTubeModuleState {
  return { version: 1, enabled: false, mode: 'paused', channelName: '', audience: '', contentPillars: [], cadence: 'weekly', publishMode: 'private', provider: 'not_configured', runs: [], updatedAt: now() };
}

function normalize(raw: unknown): YouTubeModuleState {
  const base = defaultYouTubeState();
  const value = raw && typeof raw === 'object' ? raw as Partial<YouTubeModuleState> : {};
  return { ...base, ...value, version: 1,
    contentPillars: Array.isArray(value.contentPillars) ? value.contentPillars.filter((item): item is string => typeof item === 'string').slice(0, 12) : [],
    runs: Array.isArray(value.runs) ? value.runs.filter((run): run is YouTubeRun => Boolean(run && typeof run === 'object')).slice(0, 100) : [],
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : base.updatedAt };
}

export async function getYouTubeState(): Promise<YouTubeModuleState> {
  const result = await get(PATH, { access: 'private', useCache: false });
  if (!result) return defaultYouTubeState();
  return normalize(await new Response(result.stream).json());
}

export async function saveYouTubeState(input: YouTubeModuleState) {
  const state = normalize(input);
  state.updatedAt = now();
  await put(PATH, JSON.stringify(state, null, 2), { access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json' });
  return state;
}

export function createYouTubeRun(): YouTubeRun {
  const at = now();
  return { id: crypto.randomUUID(), status: 'queued', stage: 'research', createdAt: at, updatedAt: at };
}
