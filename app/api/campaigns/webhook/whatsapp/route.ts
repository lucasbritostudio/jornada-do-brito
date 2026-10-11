import { createHmac, timingSafeEqual } from 'node:crypto';
import { mutateCampaigns } from '@/lib/campaign-store';
import { addIfUnique, containsCampaignCode } from '@/lib/campaigns';

export const runtime = 'nodejs';

const configured = () => Boolean(
  process.env.CAMPAIGN_WA_VERIFY_TOKEN &&
  process.env.CAMPAIGN_WA_APP_SECRET &&
  process.env.CAMPAIGN_WA_PHONE_ID &&
  process.env.CAMPAIGN_HASH_SECRET
);

export async function GET(req: Request) {
  if (!configured()) return new Response('not configured', { status: 503 });
  const p = new URL(req.url).searchParams;
  if (p.get('hub.mode') !== 'subscribe' ||
      p.get('hub.verify_token') !== process.env.CAMPAIGN_WA_VERIFY_TOKEN)
    return new Response('forbidden', { status: 403 });
  return new Response(p.get('hub.challenge') || '', { status: 200 });
}

export async function POST(req: Request) {
  if (!configured()) return new Response('not configured', { status: 503 });
  const raw = await req.text();
  // Reject oversized payloads and unsigned traffic before JSON parsing.
  if (raw.length > 500_000) return new Response('too large', { status: 413 });
  const expected = 'sha256=' + createHmac('sha256', process.env.CAMPAIGN_WA_APP_SECRET!)
    .update(raw).digest('hex');
  const supplied = req.headers.get('x-hub-signature-256') || '';
  const a = Buffer.from(expected, 'utf8'), b = Buffer.from(supplied, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a,b))
    return new Response('bad signature', { status: 401 });

  let body: any;
  try { body = JSON.parse(raw); } catch { return new Response('invalid JSON', { status: 400 }); }
  if (body?.object !== 'whatsapp_business_account') return new Response('ignored', { status: 200 });
  try {
    await mutateCampaigns(store => {
      const campaigns = store.campaigns.filter(c => c.status === 'active');
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change?.field !== 'messages') continue;
          const value = change.value || {};
          // Only accept the authorized Arte Print phone, not the owner's unrelated number.
          if (String(value.metadata?.phone_number_id || '') !== process.env.CAMPAIGN_WA_PHONE_ID)
            continue;
          for (const msg of value.messages || []) {
            if (!msg || msg.type !== 'text' || typeof msg.text?.body !== 'string' ||
                typeof msg.id !== 'string' || typeof msg.from !== 'string') continue;
            const text = String(msg.text.body).slice(0,1000);
            // Explicit code identifies this campaign, not the mere existence of a DM.
            const campaign = campaigns.find(c => containsCampaignCode(text,c.code));
            if (!campaign) continue;
            const customerKey = createHmac('sha256',process.env.CAMPAIGN_HASH_SECRET!)
              .update(campaign.id + ':' + String(msg.from)).digest('hex');
            const time = Number(msg.timestamp);
            const occurredAt = Number.isFinite(time) && time > 0 ?
              new Date(time * 1000).toISOString() : new Date().toISOString();
            addIfUnique(store, {
              id: crypto.randomUUID(), campaignId:campaign.id, kind:'contact',
              source:'meta_whatsapp', amountCents:0, confirmed:true,
              providerEventId:'whatsapp:'+msg.id, customerKey, occurredAt,
              createdAt:new Date().toISOString()
            });
          }
        }
      }
    });
    // No outbound messages, no AI and no modification to the owner's WhatsApp state.
    return new Response('ok', { status: 200 });
  } catch {
    // Meta retries after transient persistence failures; CAS makes events idempotent.
    return new Response('retry', { status: 503 });
  }
}
