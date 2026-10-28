'use client';

import { upload } from '@vercel/blob/client';
import { useCallback, useEffect, useRef, useState } from 'react';

type PortfolioItem = {
  id: string;
  title: string;
  description: string;
  contentType: string;
  originalFilename: string;
  sizeBytes: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  previewUrl: string;
};
type PortfolioMetrics = { periodDays: number; plays: number; estimatedBytes: number; items: Array<{ id: string; title: string; plays: number; estimatedBytes: number }> };

const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
const moneySize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024 * 1024) >= 1 ? bytes / (1024 * 1024 * 1024) : bytes / (1024 * 1024)).toFixed(1)} ${bytes / (1024 * 1024 * 1024) >= 1 ? 'GB' : 'MB'}`;
};
const dataSize = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

function safeFilename(value: string) {
  return (value.split(/[\\/]/).pop() || 'video.mp4').normalize('NFKC').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-160);
}

export default function PortfolioManager() {
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [metrics, setMetrics] = useState<PortfolioMetrics | null>(null);
  const [instagramUrl, setInstagramUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [publishAfterUpload, setPublishAfterUpload] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const response = await fetch('/api/portfolio/manage', { cache: 'no-store' });
    if (response.status === 401) { location.href = '/login'; return; }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar seus vídeos.');
    setItems(data.items || []);
    setInstagramUrl(data.instagramUrl || '');
    try {
      const metricsResponse = await fetch('/api/public/portfolio/metrics', { cache: 'no-store' });
      if (metricsResponse.ok) setMetrics(await metricsResponse.json());
      else setMetrics(null);
    } catch { setMetrics(null); }
    setLoading(false);
  }, []);

  useEffect(() => { refresh().catch((e) => { setError(e.message); setLoading(false); }); }, [refresh]);

  async function submitVideo(event: React.FormEvent) {
    event.preventDefault();
    if (!file) { setError('Escolha um vídeo para enviar.'); return; }
    const supported = ['video/mp4', 'video/webm', 'video/quicktime'];
    const extensions = ['.mp4', '.webm', '.mov'];
    const filename = safeFilename(file.name);
    const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase();
    if (!supported.includes(file.type) || !extensions.includes(extension)) {
      setError('Use um vídeo MP4, WebM ou MOV.'); return;
    }
    if (file.size > MAX_VIDEO_BYTES) { setError('Este vídeo passa do limite de 1 GB.'); return; }
    if (title.trim().length < 2) { setError('Dê um título para este trabalho.'); return; }

    setBusy(true); setProgress(0); setError(''); setMessage('Enviando vídeo…');
    const id = crypto.randomUUID();
    try {
      await upload(`jornada/portfolio/${id}/${filename}`, file, {
        access: 'private',
        contentType: file.type,
        handleUploadUrl: '/api/portfolio/upload',
        clientPayload: JSON.stringify({ id, title: title.trim(), description: description.trim(), originalFilename: file.name, published: publishAfterUpload }),
        multipart: file.size > 50 * 1024 * 1024,
        onUploadProgress: (event) => setProgress(Math.round(event.percentage)),
      });
      setMessage('Vídeo enviado. Salvando os detalhes…');
      let found = false;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 900));
        const response = await fetch('/api/portfolio/manage', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível confirmar o envio.');
        setItems(data.items || []);
        setInstagramUrl(data.instagramUrl || '');
        setLoading(false);
        if ((data.items || []).some((item: PortfolioItem) => item.id === id)) { found = true; break; }
      }
      if (!found) throw new Error('O vídeo foi enviado, mas seus detalhes ainda não apareceram. Atualize a lista antes de tentar enviar de novo.');
      setTitle(''); setDescription(''); setFile(null); if (fileInput.current) fileInput.current.value = ''; setPublishAfterUpload(false); setProgress(100);
      setMessage('Vídeo adicionado ao seu portfólio.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível enviar o vídeo.');
      setMessage('');
    } finally { setBusy(false); }
  }

  async function saveInstagram(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/portfolio/manage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'contact', instagramUrl }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar o contato.');
      setMessage('Link de contato salvo.'); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao salvar.'); }
    finally { setBusy(false); }
  }

  function startEdit(item: PortfolioItem) { setEditing(item.id); setEditTitle(item.title); setEditDescription(item.description); setError(''); setMessage(''); }

  async function updateItem(item: PortfolioItem, published = item.published) {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/portfolio/manage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'update', id: item.id, title: editing === item.id ? editTitle : item.title, description: editing === item.id ? editDescription : item.description, published }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar.');
      setEditing(null); setMessage(published ? 'Trabalho publicado no portfólio.' : 'Trabalho ocultado do portfólio.'); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao atualizar.'); }
    finally { setBusy(false); }
  }

  async function deleteItem(item: PortfolioItem) {
    if (!window.confirm(`Excluir “${item.title}” e remover o vídeo do armazenamento?`)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/portfolio/manage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: item.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível excluir o vídeo.');
      setMessage('Trabalho e vídeo excluídos.'); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao excluir.'); }
    finally { setBusy(false); }
  }

  return <main className="portfolio-admin">
    <header className="portfolio-admin-head">
      <div><a href="/">← Jornada</a><span className="portfolio-kicker">ÁREA INTERNA · PORTFÓLIO</span><h1>Seus trabalhos em vídeo</h1><p>Esta área é separada do catálogo de serviços e preços.</p></div>
      <a className="portfolio-link-button" href="/portfolio" target="_blank" rel="noreferrer">Abrir portfólio público</a>
    </header>
    {error && <p className="portfolio-error" role="alert">{error}</p>}
    {message && <p className="portfolio-success" role="status">{message}</p>}

    <section className="portfolio-admin-card">
      <div className="portfolio-section-head"><div><h2>Monitoramento de reprodução</h2><p>Últimos 30 dias · conta reproduções que passam de 5 segundos</p></div></div>
      {!metrics ? <p>Monitoramento indisponível no momento.</p> : <>
        <div className="portfolio-metric-grid">
          <div className="portfolio-metric"><small>Reproduções registradas</small><strong>{metrics.plays}</strong></div>
          <div className="portfolio-metric"><small>Tráfego estimado sem cache</small><strong>{dataSize(metrics.estimatedBytes)}</strong></div>
        </div>
        <p className="portfolio-metric-note">Estimativa máxima: considera o tamanho inteiro do vídeo em cada reprodução. O cache do dispositivo pode reduzir o tráfego; o valor real faturado aparece no painel de uso da Vercel. Cada contagem também grava um pequeno registro no Blob.</p>
        {metrics.items.length > 0 && <div className="portfolio-metric-list">{metrics.items.slice(0, 5).map((item) => <div key={item.id}><span>{item.title}</span><small>{item.plays} reprodução(ões) · até {dataSize(item.estimatedBytes)}</small></div>)}</div>}
        <a className="portfolio-usage-link" href="https://vercel.com/dashboard" target="_blank" rel="noreferrer">Conferir consumo real na Vercel ↗</a>
      </>}
    </section>

    <section className="portfolio-admin-card">
      <h2>Enviar um trabalho</h2>
      <p>MP4, WebM ou MOV, até 1 GB por vídeo. Recomendação para economizar: MP4 1080p com até 100 MB. Vídeos com mais de 512 MB podem não aproveitar o cache da Vercel. O arquivo fica privado até você publicar o trabalho.</p>
      <form className="portfolio-form" onSubmit={submitVideo}>
        <label>Título do trabalho<input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Vídeo da marca X" /></label>
        <label>Descrição para quem visitar seu portfólio<textarea maxLength={1000} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Conte em poucas palavras sobre este trabalho." /></label>
        <label>Arquivo do vídeo<input ref={fileInput} required type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" onChange={(e) => setFile(e.target.files?.[0] || null)} />{file && <small>Este vídeo tem {moneySize(file.size)}. Dez reproduções completas podem transferir até {moneySize(file.size * 10)}, se o cache não for usado.</small>}</label>
        <label className="portfolio-check"><input type="checkbox" checked={publishAfterUpload} onChange={(e) => setPublishAfterUpload(e.target.checked)} /><span>Publicar no portfólio assim que terminar. Vídeos publicados ficam visíveis a qualquer visitante.</span></label>
        {busy && <div className="portfolio-progress" aria-live="polite"><span style={{ width: `${progress}%` }} /><small>{progress}% enviado</small></div>}
        <button className="portfolio-primary" disabled={busy}>{busy ? 'Enviando…' : 'Enviar vídeo'}</button>
      </form>
    </section>

    <section className="portfolio-admin-card">
      <h2>Contato pelo Instagram</h2>
      <p>Esse link serve para o cliente falar com você. Ele não substitui o portfólio nem o catálogo.</p>
      <form className="portfolio-contact-form" onSubmit={saveInstagram}>
        <label>Link do seu Instagram<input type="url" value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} placeholder="https://www.instagram.com/seuperfil" /></label>
        <button className="portfolio-secondary" disabled={busy}>Salvar contato</button>
      </form>
    </section>

    <section className="portfolio-admin-card">
      <div className="portfolio-section-head"><div><h2>Vídeos cadastrados</h2><p>{items.length} trabalho(s) no portfólio</p></div></div>
      {loading ? <p>Carregando seus vídeos…</p> : !items.length ? <p>Você ainda não enviou nenhum vídeo.</p> : <div className="portfolio-admin-grid">{items.map((item) => <article className="portfolio-admin-item" key={item.id}>
        <video controls preload="metadata" playsInline src={item.previewUrl} />
        {editing === item.id ? <div className="portfolio-form"><label>Título<input maxLength={120} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} /></label><label>Descrição<textarea maxLength={1000} rows={3} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} /></label><div className="portfolio-actions"><button className="portfolio-primary" disabled={busy} onClick={() => updateItem(item)}>Salvar edição</button><button type="button" className="portfolio-secondary" onClick={() => setEditing(null)}>Cancelar</button></div></div> : <><div className="portfolio-item-title"><div><h3>{item.title}</h3><span className={item.published ? 'portfolio-status published' : 'portfolio-status'}>{item.published ? 'Publicado' : 'Oculto'}</span></div><small>{moneySize(item.sizeBytes)} · {new Date(item.createdAt).toLocaleDateString('pt-BR')}</small></div><p>{item.description || 'Sem descrição.'}</p><div className="portfolio-actions"><button className="portfolio-secondary" onClick={() => startEdit(item)}>Editar detalhes</button><button className={item.published ? 'portfolio-secondary' : 'portfolio-primary'} disabled={busy} onClick={() => updateItem(item, !item.published)}>{item.published ? 'Ocultar' : 'Publicar'}</button><button className="portfolio-secondary" disabled={busy} onClick={() => deleteItem(item)}>Excluir</button></div></>}
      </article>)}</div>}
    </section>
    <footer className="portfolio-admin-footer"><a href="/servicos">Gerenciar serviços e preços no catálogo →</a></footer>
  </main>;
}
