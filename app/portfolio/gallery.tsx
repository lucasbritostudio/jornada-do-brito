'use client';

import { useEffect, useState } from 'react';

type PublicItem = {
  id: string;
  title: string;
  description: string;
  contentType: string;
  createdAt: string;
  videoUrl: string;
  playToken: string;
};

type CachedVideoUrl = { url: string; expiresAt: number };
const URL_CACHE_KEY = 'jornada:portfolio-video-urls:v1';
const URL_REUSE_MS = 6 * 24 * 60 * 60 * 1000;

function readVideoUrlCache(): Record<string, CachedVideoUrl> {
  try {
    const value = JSON.parse(localStorage.getItem(URL_CACHE_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, CachedVideoUrl> : {};
  }
  catch { return {}; }
}

export default function PortfolioGallery() {
  const [items, setItems] = useState<PublicItem[]>([]);
  const [brand, setBrand] = useState('Jornada do Brito');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/public/portfolio', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o portfólio.');
        const now = Date.now();
        const cachedUrls = readVideoUrlCache();
        const nextCache: Record<string, CachedVideoUrl> = {};
        const freshItems = (data.items || []) as PublicItem[];
        const stableItems = freshItems.map((item) => {
          const cached = cachedUrls[item.id];
          let sameBlob = false;
          try {
            const currentUrl = new URL(item.videoUrl);
            const cachedUrl = new URL(cached?.url || '');
            sameBlob = currentUrl.origin === cachedUrl.origin && currentUrl.pathname === cachedUrl.pathname;
          } catch { /* Use the fresh signed URL when local cache data is invalid. */ }
          const useCached = cached && sameBlob && cached.expiresAt > now + 60 * 60 * 1000;
          const videoUrl = useCached ? cached.url : item.videoUrl;
          nextCache[item.id] = useCached ? cached : { url: videoUrl, expiresAt: now + URL_REUSE_MS };
          return { ...item, videoUrl };
        });
        try { localStorage.setItem(URL_CACHE_KEY, JSON.stringify(nextCache)); } catch { /* Storage may be disabled; fresh signed links still work. */ }
        setItems(stableItems);
        setBrand(data.brand || 'Jornada do Brito');
        setInstagramUrl(data.instagramUrl || '');
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o portfólio.'))
      .finally(() => setLoading(false));
  }, []);

  return <main className="portfolio-public">
    <header className="portfolio-public-head">
      <a className="portfolio-brand" href="/">JB <span>{brand}</span></a>
      <span className="portfolio-kicker">TRABALHOS SELECIONADOS</span>
      <h1>Portfólio de <em>vídeos</em></h1>
      <p>Conheça alguns trabalhos realizados. Para ver serviços e valores, acesse o catálogo.</p>
      <a className="portfolio-primary portfolio-catalog-link" href="/servicos">Ver serviços e preços</a>
    </header>

    {error ? <p className="portfolio-error" role="alert">{error}</p> : loading ? <p className="portfolio-muted">Carregando trabalhos…</p> : items.length === 0 ? <section className="portfolio-empty"><h2>Portfólio em preparação</h2><p>Os trabalhos serão exibidos aqui assim que forem publicados.</p></section> : <section className="portfolio-gallery" aria-label="Trabalhos em vídeo">
      {items.map((item) => <article className="portfolio-work" key={item.id}>
        <video controls playsInline preload="none" src={item.videoUrl} aria-label={item.title} onTimeUpdate={(event) => {
          const video = event.currentTarget;
          if (video.currentTime < 5 || video.paused) return;
          if (video.dataset.metricSent === 'true') return;
          video.dataset.metricSent = 'true';
          fetch('/api/public/portfolio/metrics', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemId: item.id, playToken: item.playToken }), keepalive: true }).catch(() => {});
        }} />
        <div className="portfolio-work-copy"><h2>{item.title}</h2>{item.description && <p>{item.description}</p>}</div>
      </article>)}
    </section>}

    <footer className="portfolio-public-footer">
      {instagramUrl && <a href={instagramUrl} target="_blank" rel="noreferrer">Fale comigo pelo Instagram ↗</a>}
      <a href="/servicos">Catálogo de serviços e preços</a>
    </footer>
  </main>;
}
