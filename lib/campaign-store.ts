import { get, put } from '@vercel/blob';
import { emptyCampaignStore, type CampaignStore } from './campaigns';

const PATH = 'jornada/campaigns-results-v1.json';
const etags = new WeakMap<CampaignStore, string | null>();

export class CampaignConflict extends Error {
  constructor() { super('Dados alterados em outra sessão. Atualize e tente novamente.'); }
}

export async function loadCampaigns(): Promise<CampaignStore> {
  const blob = await get(PATH, { access: 'private', useCache: false });
  if (!blob) {
    const empty = emptyCampaignStore();
    etags.set(empty, null);
    return empty;
  }
  if (!blob.blob.etag) throw new Error('CAMPAIGN_ETAG_MISSING');
  const read = await new Response(blob.stream).json() as Partial<CampaignStore>;
  if (read?.version !== 1 || !Array.isArray(read.campaigns) ||
      !Array.isArray(read.events) || !Array.isArray(read.instagram)) {
    throw new Error('CAMPAIGN_DATA_INVALID');
  }
  const state = read as CampaignStore;
  etags.set(state, blob.blob.etag);
  return state;
}

export async function saveCampaigns(state: CampaignStore): Promise<CampaignStore> {
  if (!etags.has(state)) throw new Error('CAMPAIGN_VERSION_REQUIRED');
  const etag = etags.get(state);
  state.updatedAt = new Date().toISOString();
  try {
    await put(PATH, JSON.stringify(state), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: Boolean(etag),
      ...(etag ? { ifMatch: etag } : {}),
      contentType: 'application/json',
    });
  } catch (error) {
    // Never overwrite when a concurrent writer won.
    const code = String((error as { code?: string })?.code || '');
    const message = String((error as Error)?.message || '');
    if (/precondition|conflict|already exists|412|409/i.test(code + ' ' + message))
      throw new CampaignConflict();
    throw error;
  }
  return state;
}

export async function mutateCampaigns(change: (store: CampaignStore) => void) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const state = await loadCampaigns();
    change(state);
    try { return await saveCampaigns(state); }
    catch (e) { if (!(e instanceof CampaignConflict) || attempt === 3) throw e; }
  }
  throw new CampaignConflict();
}
