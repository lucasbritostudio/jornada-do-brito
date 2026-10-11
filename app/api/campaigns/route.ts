import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { loadCampaigns, mutateCampaigns, CampaignConflict } from '@/lib/campaign-store';
import { metrics, normalizedCode, positiveInteger, addIfUnique, type Campaign } from '@/lib/campaigns';
import { createHmac } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function replyError(error: unknown) {
  if (error instanceof CampaignConflict)
    return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof Error && error.message === 'UNAUTHORIZED')
    return NextResponse.json({ error: 'Acesso restrito.' }, { status: 401 });
  return NextResponse.json({ error: 'Operação indisponível. Não houve confirmação de gravação.' }, { status: 500 });
}
function label(input: unknown, max = 140) {
  return String(input || '').trim().slice(0, max);
}
function validDate(s: unknown) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}
function validMedia(s: unknown) {
  return typeof s === 'string' && /^\d{7,32}$/.test(s) ? s : undefined;
}
function keyFor(value: string) {
  const secret = process.env.CAMPAIGN_HASH_SECRET;
  if (!secret || !value.trim()) return undefined;
  return createHmac('sha256', secret).update(value.trim().toLowerCase()).digest('hex');
}

export async function GET() {
  try {
    await requireAuthenticated();
    const data = await loadCampaigns();
    return NextResponse.json({
      campaigns: data.campaigns.map(c => ({ ...c, metrics: metrics(data, c.id) })),
      events: data.events.map(({ customerKey, providerEventId, ...event }) => event),
      instagram: data.instagram,
      connections: {
        whatsapp: Boolean(process.env.CAMPAIGN_WA_PHONE_ID &&
          process.env.CAMPAIGN_WA_APP_SECRET && process.env.CAMPAIGN_WA_VERIFY_TOKEN &&
          process.env.CAMPAIGN_HASH_SECRET),
        instagram: Boolean(process.env.CAMPAIGN_IG_USER_ID && process.env.CAMPAIGN_IG_ACCESS_TOKEN),
        caveat: 'Configuração não comprova que os webhooks estão entregando nem que a Meta concedeu as permissões.',
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return replyError(e); }
}

export async function POST(req: Request) {
  try {
    await requireAuthenticated();
    const body = await req.json() as Record<string, unknown>;
    if (!body || typeof body !== 'object')
      return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
    const action = label(body.action, 24);
    if (action === 'create') {
      const title = label(body.title), business = label(body.business);
      const code = normalizedCode(label(body.code, 32));
      if (title.length < 4 || business.length < 2 || code.length < 4 || code.length > 24)
        return NextResponse.json({ error: 'Informe empresa, campanha e código de pelo menos quatro caracteres.' }, { status: 400 });
      await mutateCampaigns(s => {
        if (s.campaigns.some(c => c.code === code)) throw new Error('DUPLICATE_CODE');
        const at = new Date().toISOString();
        const campaign: Campaign = { id: crypto.randomUUID(), title, business, code,
          status: 'draft', startDate: validDate(body.startDate), endDate: validDate(body.endDate),
          adSpendCents: 0, createdAt: at, updatedAt: at };
        s.campaigns.unshift(campaign);
      });
    } else if (action === 'update') {
      const id = label(body.campaignId);
      const status = label(body.status);
      if (!['draft','active','finished'].includes(status))
        return NextResponse.json({ error: 'Situação inválida.' }, { status: 400 });
      await mutateCampaigns(s => {
        const c = s.campaigns.find(x => x.id === id);
        if (!c) throw new Error('NOT_FOUND');
        c.status = status as Campaign['status'];
        if (typeof body.instagramMediaId === 'string')
          c.instagramMediaId = validMedia(body.instagramMediaId);
        if (typeof body.adSpendCents === 'number' && Number.isSafeInteger(body.adSpendCents) &&
          body.adSpendCents >= 0 && body.adSpendCents <= 1_000_000_000)
          c.adSpendCents = positiveInteger(body.adSpendCents);
        c.updatedAt = new Date().toISOString();
      });
    } else if (action === 'event') {
      const campaignId = label(body.campaignId);
      const kind = label(body.kind);
      const amount = body.amountCents === undefined ? 0 : body.amountCents;
      if (!['contact','quote','sale'].includes(kind) ||
          typeof amount !== 'number' || !Number.isSafeInteger(amount) ||
          amount < 0 || amount > 100_000_000 ||
          (kind !== 'sale' && amount !== 0) || (kind === 'sale' && amount === 0)) {
        return NextResponse.json({ error: 'Tipo ou valor inválido. Venda exige valor confirmado.' }, { status: 400 });
      }
      if (body.confirmed !== true) {
        return NextResponse.json({ error: 'Registre apenas fatos confirmados manualmente.' }, { status: 400 });
      }
      const customerKey = typeof body.customerReference === 'string' ?
        keyFor(body.customerReference.slice(0,120)) : undefined;
      await mutateCampaigns(s => {
        if (!s.campaigns.some(c => c.id === campaignId)) throw new Error('NOT_FOUND');
        addIfUnique(s, {
          id: crypto.randomUUID(), campaignId, kind: kind as 'contact' | 'quote' | 'sale',
          source: 'manual', amountCents: amount, confirmed: true, customerKey,
          occurredAt: new Date().toISOString(), createdAt: new Date().toISOString(),
        });
      });
    } else {
      return NextResponse.json({ error: 'Ação não reconhecida.' }, { status: 400 });
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    if (e instanceof Error && e.message === 'DUPLICATE_CODE')
      return NextResponse.json({ error: 'Código já usado por outra campanha.' }, { status: 409 });
    if (e instanceof Error && e.message === 'NOT_FOUND')
      return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 });
    return replyError(e);
  }
}
