/**
 * Resultados das Campanhas. Dados financeiros sempre em CENTAVOS.
 * Instagram mede atenção; WhatsApp mede contatos identificados; apenas
 * vendas confirmadas são receitas atribuídas. Não inferir faturamento.
 */
export type CampaignStatus = 'draft' | 'active' | 'finished';
export type CampaignSource = 'manual' | 'meta_whatsapp';
export type CampaignEventKind = 'contact' | 'quote' | 'sale';
export type Campaign = {
  id: string;
  business: string;
  title: string;
  code: string;
  status: CampaignStatus;
  startDate?: string;
  endDate?: string;
  instagramMediaId?: string;
  adSpendCents: number;
  createdAt: string;
  updatedAt: string;
};
export type CampaignEvent = {
  id: string;
  campaignId: string;
  kind: CampaignEventKind;
  source: CampaignSource;
  customerKey?: string;
  providerEventId?: string;
  confirmed: boolean;
  amountCents: number;
  occurredAt: string;
  createdAt: string;
};
export type InstagramSnapshot = {
  campaignId: string;
  mediaId: string;
  measuredAt: string;
  likes?: number;
  comments?: number;
  reach?: number;
  views?: number;
  saved?: number;
  shares?: number;
};
export type CampaignStore = {
  version: 1;
  campaigns: Campaign[];
  events: CampaignEvent[];
  instagram: InstagramSnapshot[];
  updatedAt: string;
};

export function emptyCampaignStore(): CampaignStore {
  return { version: 1, campaigns: [], events: [], instagram: [], updatedAt: new Date().toISOString() };
}
export function normalizedCode(value: string) {
  return value.trim().toLocaleUpperCase('pt-BR').replace(/[^A-Z0-9_-]/g, '');
}
export function campaignKey(value: string) {
  return normalizedCode(value);
}
export function containsCampaignCode(text: string, code: string) {
  const normalized = normalizedCode(code);
  if (!normalized || normalized.length < 4) return false;
  return new RegExp('(?:^|[^A-Z0-9])' + normalized.replace(/[-]/g, '\\-') + '(?:$|[^A-Z0-9])', 'i')
    .test(text.normalize('NFKC').toLocaleUpperCase('pt-BR'));
}
export function positiveInteger(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
export function metrics(store: CampaignStore, campaignId: string) {
  const campaign = store.campaigns.find(item => item.id === campaignId);
  const all = store.events.filter(event => event.campaignId === campaignId);
  const touched = (kind: CampaignEventKind) => all.filter(e => e.kind === kind && e.confirmed);
  const unique = (events: CampaignEvent[]) =>
    new Set(events.map(e => e.customerKey || e.id)).size;
  const contacts = unique(touched('contact'));
  const quotes = unique(touched('quote'));
  const sales = touched('sale');
  const buyers = unique(sales);
  const revenueCents = sales.reduce((sum, e) => sum + positiveInteger(e.amountCents), 0);
  const adSpendCents = positiveInteger(campaign?.adSpendCents);
  // Receita atribuída menos gastos de campanha NÃO representa lucro.
  const latest = store.instagram.filter(s => s.campaignId === campaignId)
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0] || null;
  return {
    contacts, quotes, buyers, salesCount: sales.length, revenueCents, adSpendCents,
    netAfterMediaCents: revenueCents - adSpendCents,
    quoteRate: contacts > 0 ? quotes / contacts : null,
    salesRate: quotes > 0 ? buyers / quotes : null,
    instagram: latest,
    sampleSize: contacts,
    status: campaign?.status || 'draft',
  };
}
export function addIfUnique(store: CampaignStore, item: CampaignEvent) {
  if (!store.campaigns.some(c => c.id === item.campaignId)) return false;
  if (store.events.some(e => e.id === item.id ||
       Boolean(item.providerEventId && e.providerEventId === item.providerEventId))) return false;
  // WhatsApp: count a person once per campaign, not each repeat message.
  if (item.kind === 'contact' && item.source === 'meta_whatsapp' && item.customerKey &&
      store.events.some(e => e.campaignId === item.campaignId && e.kind === 'contact' &&
        e.customerKey === item.customerKey)) return false;
  store.events.push(item);
  return true;
}
