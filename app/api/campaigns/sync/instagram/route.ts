import { NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/auth';
import { loadCampaigns, mutateCampaigns, CampaignConflict } from '@/lib/campaign-store';
import { positiveInteger, type InstagramSnapshot } from '@/lib/campaigns';

export const runtime = 'nodejs';
const configured = () => Boolean(process.env.CAMPAIGN_IG_USER_ID && process.env.CAMPAIGN_IG_ACCESS_TOKEN);

type GraphResponse = Record<string, any>;
async function graph(path: string): Promise<GraphResponse> {
  const version = process.env.CAMPAIGN_GRAPH_VERSION || 'v25.0';
  if (!/^v\d{1,2}\.\d$/.test(version)) throw new Error('GRAPH_VERSION_INVALID');
  const res = await fetch('https://graph.facebook.com/' + version + '/' + path, {
    headers: { Authorization: 'Bearer ' + process.env.CAMPAIGN_IG_ACCESS_TOKEN! },
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000)
  });
  if (!res.ok) throw new Error('META_REQUEST_FAILED_' + res.status);
  return res.json();
}

export async function POST(req: Request) {
  try {
    await requireAuthenticated();
    if (!configured()) return NextResponse.json({ error: 'Instagram da Arte Print ainda não conectado.' }, { status: 409 });
    const { campaignId } = await req.json() as { campaignId?: string };
    if (typeof campaignId !== 'string') return NextResponse.json({ error: 'Campanha inválida.' }, { status: 400 });
    const store = await loadCampaigns();
    const campaign = store.campaigns.find(c => c.id === campaignId);
    const mediaId = campaign?.instagramMediaId;
    if (!mediaId || !/^\d{7,32}$/.test(mediaId))
      return NextResponse.json({ error: 'Vincule primeiro o ID real do Reels da Arte Print.' }, { status: 409 });

    // Check that the media belongs to the explicitly authorized IG professional account.
    const igUserId = process.env.CAMPAIGN_IG_USER_ID!;
    if (!/^\d{7,32}$/.test(igUserId)) return NextResponse.json({error:'Conta Meta inválida.'},{status:409});
    let next: string | undefined = igUserId + '/media?fields=id&limit=100';
    let owned = false;
    for (let page = 0; page < 4 && next; page++) {
      // Only follow Meta's own graph next URLs, stripping out token and host.
      const response: GraphResponse = await graph(next);
      if (Array.isArray(response.data) && response.data.some((m:any) => m.id === mediaId)) { owned = true; break; }
      const url: URL | null = response.paging?.next ? new URL(response.paging.next) : null;
      if (!url || url.hostname !== 'graph.facebook.com') { next = undefined; continue; }
      url.searchParams.delete('access_token');
      next = url.pathname.replace(/^\/(?:v\d+\.\d\/)?/, '') + url.search;
    }
    if (!owned)
      return NextResponse.json({ error:'Reels não encontrado entre as publicações acessíveis da conta autorizada.' }, {status:409});

    const media = await graph(mediaId + '?fields=id,like_count,comments_count');
    const snapshot: InstagramSnapshot = {
      campaignId, mediaId, measuredAt: new Date().toISOString(),
      likes:positiveInteger(media.like_count),comments:positiveInteger(media.comments_count)
    };
    // Media insights depend on the account permissions and media type.
    // Missing permissions must NOT become fake zeros.
    for (const metric of ['reach', 'views', 'saved', 'shares'] as const) {
      try {
        const insight = await graph(mediaId + '/insights?metric=' + metric);
        const values = insight?.data?.[0]?.values;
        const value = Array.isArray(values) ? values[0]?.value : insight?.data?.[0]?.total_value?.value;
        if (Number.isSafeInteger(value) && value >= 0) snapshot[metric] = value;
      } catch { /* explicit metric unavailable; omit, don't fabricate */ }
    }
    await mutateCampaigns(latest => {
      const current = latest.campaigns.find(c => c.id === campaignId);
      if (!current || current.instagramMediaId !== mediaId) throw new Error('CAMPAIGN_CHANGED');
      latest.instagram = [
        snapshot,
        ...latest.instagram.filter(item => !(item.campaignId === campaignId &&
           item.mediaId === mediaId)).slice(0, 249),
      ];
    });
    return NextResponse.json({ ok: true, snapshot });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') return NextResponse.json({error:'Não autorizado.'},{status:401});
    if (e instanceof CampaignConflict) return NextResponse.json({error:e.message},{status:409});
    if (e instanceof Error && e.message === 'CAMPAIGN_CHANGED') return NextResponse.json({error:'A campanha mudou durante a leitura; atualize.'},{status:409});
    return NextResponse.json({error:'Não foi possível consultar a Meta. Verifique permissões, ID do Reels e token.'},{status:502});
  }
}
