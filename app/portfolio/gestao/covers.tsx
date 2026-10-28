'use client';

import { useEffect, useRef, useState } from 'react';
import { automaticFrame, captureVideoCover, createAutomaticCover, saveVideoCover } from '../video-cover';

type CoverItem = { id: string; title: string; previewUrl: string; coverUrl?: string; coverFrameSeconds?: number };
export type SavedCover = { coverUrl: string; coverFrameSeconds: number };

export function AutomaticCovers({ items, onSaved }: { items: CoverItem[]; onSaved: (id: string, cover: SavedCover) => void }) {
  const initialItems = useRef(items);
  const [status, setStatus] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const missing = initialItems.current.filter(item => !item.coverUrl);
    if (!missing.length) return;
    void (async () => {
      let failures = 0;
      for (let index = 0; index < missing.length; index++) {
        if (controller.signal.aborted) return;
        const item = missing[index];
        setStatus(`Preparando capas: ${index + 1} de ${missing.length}…`);
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            if (attempt) setStatus(`Tentando novamente a capa ${index + 1} de ${missing.length}…`);
            const cover = await createAutomaticCover(item.previewUrl, controller.signal);
            const saved = await saveVideoCover(item.id, cover, true, controller.signal);
            if (!controller.signal.aborted) onSaved(item.id, saved);
            break;
          } catch {
            if (controller.signal.aborted) return;
            if (attempt === 1) failures++;
          }
        }
      }
      setStatus(failures ? 'Algumas capas não ficaram prontas. Use “Escolher capa” nesses vídeos para tentar novamente.' : 'As capas automáticas estão prontas. Você pode trocar qualquer uma em “Escolher capa”.');
    })();
    return () => controller.abort();
  }, [onSaved]);
  return status ? <p className="portfolio-cover-status" role="status">{status}</p> : null;
}

export function CoverEditor({ item, onSaved, onClose }: { item: CoverItem; onSaved: (id: string, cover: SavedCover) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { const modal = dialog.current; modal?.showModal(); return () => modal?.close(); }, []);

  function seek(value: number) {
    if (!video.current || !Number.isFinite(value)) return;
    const target = Math.max(0, Math.min(Math.max(0, duration - 0.01), value));
    video.current.pause(); setSeconds(target); video.current.currentTime = target;
  }
  async function save() {
    if (!video.current) return;
    setBusy(true); setError(''); video.current.pause();
    try {
      const cover = await captureVideoCover(video.current);
      const saved = await saveVideoCover(item.id, cover);
      onSaved(item.id, saved); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não consegui salvar a capa.'); }
    finally { setBusy(false); }
  }

  return <dialog className="portfolio-cover-dialog" ref={dialog} aria-labelledby="portfolio-cover-title" onCancel={event => { if (busy) event.preventDefault(); else onClose(); }}>
    <div className="portfolio-cover-heading"><div><h2 id="portfolio-cover-title">Escolher capa</h2><p>{item.title}</p></div><button type="button" className="portfolio-secondary" disabled={busy} onClick={onClose} aria-label="Fechar escolha de capa">Fechar</button></div>
    <p className="portfolio-muted">Arraste a barra ou reproduza o vídeo e pause no momento que quer usar como capa.</p>
    <video ref={video} crossOrigin="anonymous" src={item.previewUrl} controls playsInline preload="auto" aria-label={`Escolher momento de ${item.title}`} onLoadedMetadata={event => {
      const media = event.currentTarget;
      if (!Number.isFinite(media.duration) || media.duration <= 0) { setError('Não consegui ler este vídeo.'); return; }
      setDuration(media.duration);
      const initial = Math.min(item.coverFrameSeconds ?? automaticFrame(media.duration), Math.max(0, media.duration - 0.01));
      media.currentTime = initial; setSeconds(initial);
    }} onSeeking={() => setReady(false)} onLoadedData={event => setReady(!event.currentTarget.seeking)} onSeeked={event => setReady(event.currentTarget.readyState >= 2)} onTimeUpdate={event => setSeconds(event.currentTarget.currentTime)} onError={() => setError('Não consegui abrir este vídeo. Feche e tente novamente.')} />
    {!ready && !error && <p className="portfolio-muted" role="status">{duration ? 'Carregando este momento do vídeo…' : 'Abrindo vídeo…'}</p>}
    <label className="portfolio-cover-slider">Momento da capa<input type="range" min="0" max={Math.max(0, duration - 0.01)} step="0.01" value={seconds} disabled={!duration || busy} onChange={event => seek(Number(event.target.value))} /></label>
    <div className="portfolio-cover-time"><label>Tempo em segundos<input type="number" min="0" max={Math.max(0, duration - 0.01)} step="0.01" value={Number(seconds.toFixed(2))} disabled={!duration || busy} onChange={event => seek(Number(event.target.value))} /></label><span>de {duration.toFixed(2)} segundos</span></div>
    {error && <p role="alert" className="portfolio-error">{error}</p>}
    <div className="portfolio-cover-actions"><button type="button" className="portfolio-secondary" disabled={!ready || busy} onClick={() => seek(automaticFrame(duration))}>Escolher automaticamente</button><button type="button" className="portfolio-primary" disabled={!ready || busy} onClick={save}>{busy ? 'Salvando capa…' : 'Usar este momento como capa'}</button></div>
  </dialog>;
}
