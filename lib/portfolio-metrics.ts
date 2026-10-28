import { get, put } from '@vercel/blob';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { isBlobConflict } from './blob-conflict';

const PATH = 'jornada/portfolio-metrics-v1.json';
const RETENTION_DAYS = 180;

type DailyItemMetric = { title: string; plays: number; estimatedBytes: number };
type MetricsFile = { version: 1; days: Record<string, Record<string, DailyItemMetric>> };
type PlayTokenPayload = { id: string; title: string; sizeBytes: number; exp: number };

export type PortfolioMetricsReport = {
  periodDays: 30;
  plays: number;
  estimatedBytes: number;
  items: Array<{ id: string; title: string; plays: number; estimatedBytes: number }>;
  days: Array<{ date: string; plays: number; estimatedBytes: number }>;
};

function emptyMetrics(): MetricsFile { return { version: 1, days: {} }; }

function metricSecret() {
  const secret = process.env.JORNADA_SESSION_SECRET;
  if (!secret) throw new Error('JORNADA_SESSION_SECRET_MISSING');
  return secret;
}

export function signPortfolioPlayToken(item: { id: string; title: string; sizeBytes: number }) {
  const payload: PlayTokenPayload = {
    id: item.id,
    title: item.title.slice(0, 120),
    sizeBytes: item.sizeBytes,
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', metricSecret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyPortfolioPlayToken(token: unknown, itemId: string): PlayTokenPayload | null {
  if (typeof token !== 'string' || token.length > 1200) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  const expected = createHmac('sha256', metricSecret()).update(encoded).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as PlayTokenPayload;
    if (payload.id !== itemId || !/^[a-zA-Z0-9_-]{16,80}$/.test(payload.id) ||
      typeof payload.title !== 'string' || payload.title.length > 120 ||
      !Number.isSafeInteger(payload.sizeBytes) || payload.sizeBytes < 1 || payload.sizeBytes > 1024 ** 3 ||
      !Number.isSafeInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function readMetrics(): Promise<{ value: MetricsFile; etag: string | null }> {
  const result = await get(PATH, { access: 'private', useCache: false });
  if (!result) return { value: emptyMetrics(), etag: null };
  const raw = await new Response(result.stream).json() as Partial<MetricsFile>;
  if (!result.blob.etag || raw.version !== 1 || !raw.days || typeof raw.days !== 'object') {
    throw new Error('PORTFOLIO_METRICS_INVALID');
  }
  return { value: { version: 1, days: raw.days }, etag: result.blob.etag };
}

export async function recordPortfolioPlay(item: { id: string; title: string; sizeBytes: number }) {
  const today = new Date().toISOString().slice(0, 10);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { value, etag } = await readMetrics();
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString().slice(0, 10);
    for (const date of Object.keys(value.days)) if (date < cutoff) delete value.days[date];
    const day = value.days[today] ||= {};
    const metric = day[item.id] ||= { title: item.title, plays: 0, estimatedBytes: 0 };
    metric.title = item.title;
    metric.plays += 1;
    metric.estimatedBytes += item.sizeBytes;
    try {
      await put(PATH, JSON.stringify(value), {
        access: 'private', contentType: 'application/json', addRandomSuffix: false,
        allowOverwrite: Boolean(etag), ...(etag ? { ifMatch: etag } : {}),
      });
      return;
    } catch (error) {
      if (!isBlobConflict(error) || attempt === 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  throw new Error('PORTFOLIO_METRICS_CONFLICT');
}

export async function getPortfolioMetricsReport(): Promise<PortfolioMetricsReport> {
  const { value } = await readMetrics();
  const cutoff = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const byItem = new Map<string, { id: string; title: string; plays: number; estimatedBytes: number }>();
  const byDay = new Map<string, { date: string; plays: number; estimatedBytes: number }>();
  for (const [date, records] of Object.entries(value.days)) {
    if (date < cutoff) continue;
    for (const [id, metric] of Object.entries(records)) {
      if (!Number.isSafeInteger(metric.plays) || !Number.isSafeInteger(metric.estimatedBytes)) continue;
      const item = byItem.get(id) || { id, title: metric.title, plays: 0, estimatedBytes: 0 };
      item.title = metric.title;
      item.plays += metric.plays;
      item.estimatedBytes += metric.estimatedBytes;
      byItem.set(id, item);
      const day = byDay.get(date) || { date, plays: 0, estimatedBytes: 0 };
      day.plays += metric.plays;
      day.estimatedBytes += metric.estimatedBytes;
      byDay.set(date, day);
    }
  }
  const items = [...byItem.values()].sort((a, b) => b.plays - a.plays);
  return {
    periodDays: 30,
    plays: items.reduce((sum, item) => sum + item.plays, 0),
    estimatedBytes: items.reduce((sum, item) => sum + item.estimatedBytes, 0),
    items,
    days: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
