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
type PendingUpload = {
  id: string;
  pathname: string;
  originalFilename: string;
  title: string;
  description: string;
  published: boolean;
};
type UnregisteredUpload = {
  id: string;
  pathname: string;
  originalFilename: string;
  sizeBytes: number;
  uploadedAt: string;
};
type PortfolioMetrics = { periodDays: number; plays: number; estimatedBytes: number; items: Array<{ id: string; title: string; plays: number; estimatedBytes: number }> };
const PENDING_UPLOAD_KEY = 'jornada-portfolio-pending-upload';

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
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [unregisteredUploads, setUnregisteredUploads] = useState<UnregisteredUpload[]>([]);
  const [uploadPhase, setUploadPhase] = useState<'uploading' | 'saving' | null>(null);
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
    setUnregisteredUploads(data.unregisteredUploads || []);
    try {
      const metricsResponse = await fetch('/api/public/portfolio/metrics', { cache: 'no-store' });
      if (metricsResponse.ok) setMetrics(await metricsResponse.json());
      else setMetrics(null);
    } catch { setMetrics(null); }
    setLoading(false);
  }, []);

  useEffect(() => { refresh().catch((e) => { setError(e.message); setLoading(false); }); }, [refresh]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_UPLOAD_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as PendingUpload;
      if (!saved?.id || !saved.pathname || !saved.originalFilename || !saved.title) return;
      setPendingUpload(saved);
      setTitle(saved.title);
      setDescription(saved.description || '');
      setPublishAfterUpload(saved.published === true);
      setMessage('Encontramos um vídeo que já foi enviado. Conclua o cadastro para ele aparecer na lista.');
    } catch {
      sessionStorage.removeItem(PENDING_UPLOAD_KEY);
    }
  }, []);

  useEffect(() => {
    if (pendingUpload) sessionStorage.setItem(PENDING_UPLOAD_KEY, JSON.stringify(pendingUpload));
    else sessionStorage.removeItem(PENDING_UPLOAD_KEY);
  }, [pendingUpload]);

  async function finishUpload(pending: PendingUpload) {
    const response = await fetch('/api/portfolio/manage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'complete-upload', ...pending }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'O arquivo foi enviado, mas não consegui salvar o cadastro.');

    setPendingUpload(null);
    setTitle(''); setDescription(''); setFile(null); setPublishAfterUpload(false); setProgress(0);
    if (fileInput.current) fileInput.current.value = '';
    try {
      await refresh();
      setMessage(pending.published ? 'Vídeo salvo e publicado no portfólio.' : 'Vídeo salvo. Ele está oculto até você publicar.');
    } catch {
      setMessage('Vídeo salvo. Atualize a lista para conferir.');
    }
  }

  async function submitVideo(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (title.trim().length < 2) { setError('Dê um título para este trabalho.'); return; }
    if (!pendingUpload && !file) { setError('Escolha um vídeo para enviar.'); return; }

    if (pendingUpload) {
      const updatedPending = { ...pendingUpload, title: title.trim(), description: description.trim(), published: publishAfterUpload };
      setPendingUpload(updatedPending);
      setBusy(true); setUploadPhase('saving'); setMessage('O arquivo já está enviado. Estou concluindo o cadastro…');
      try {
        await finishUpload(updatedPending);
        setError('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Não consegui concluir o cadastro. Tente novamente.');
      } finally { setBusy(false); setUploadPhase(null); }
      return;
    }

    const selectedFile = file!;
    const supported = ['video/mp4', 'video/webm', 'video/quicktime'];
    const extensions = ['.mp4', '.webm', '.mov'];
    const filename = safeFilename(selectedFile.name);
    const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase();
    if (!supported.includes(selectedFile.type) || !extensions.includes(extension)) {
      setError('Use um vídeo MP4, WebM ou MOV.'); return;
    }
    if (selectedFile.size > MAX_VIDEO_BYTES) { setError('Este vídeo passa do limite de 1 GB.'); return; }

    setBusy(true); setUploadPhase('uploading'); setProgress(0); setError(''); setMessage('Enviando o arquivo…');
    try {
      const id = crypto.randomUUID();
      const blob = await upload(`jornada/portfolio/${id}/${filename}`, selectedFile, {
        access: 'private',
        contentType: selectedFile.type,
        handleUploadUrl: '/api/portfolio/upload',
        clientPayload: JSON.stringify({ id, title: title.trim(), description: description.trim(), originalFilename: selectedFile.name, published: publishAfterUpload }),
        multipart: selectedFile.size > 50 * 1024 * 1024,
        onUploadProgress: (event) => setProgress(Math.round(event.percentage)),
      });
      const pending: PendingUpload = {
        id,
        pathname: blob.pathname,
        originalFilename: selectedFile.name,
        title: title.trim(),
        description: description.trim(),
        published: publishAfterUpload,
      };
      setPendingUpload(pending);
      setProgress(100);
      setUploadPhase('saving');
      setMessage('Arquivo enviado. Agora estou salvando o vídeo no portfólio…');
      await finishUpload(pending);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível enviar o vídeo.');
      setMessage('');
    } finally { setBusy(false); setUploadPhase(null); }
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
      <p>Preencha o título, escolha o vídeo e clique em enviar. Só considere concluído quando ele aparecer em “Vídeos cadastrados”. Aceitamos MP4, WebM ou MOV, até 1 GB. Para economizar, prefira MP4 1080p com até 100 MB.</p>
      <form id="portfolio-upload-form" className="portfolio-form" onSubmit={submitVideo}>
        <label>Título do trabalho<input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Vídeo da marca X" disabled={busy} /></label>
        <label>Descrição para quem visitar seu portfólio<textarea maxLength={1000} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Conte em poucas palavras sobre este trabalho." disabled={busy} /></label>
        <label>Arquivo do vídeo<input ref={fileInput} required={!pendingUpload} disabled={busy || Boolean(pendingUpload)} type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" onChange={(e) => setFile(e.target.files?.[0] || null)} />{file && <small>Este vídeo tem {moneySize(file.size)}. Dez reproduções completas podem transferir até {moneySize(file.size * 10)}, se o cache não for usado.</small>}</label>
        {pendingUpload && !busy && <p className="portfolio-upload-pending" role="status">O arquivo já foi enviado. Falta concluir o cadastro. Não envie o arquivo outra vez; clique no botão abaixo.</p>}
        <label className="portfolio-check"><input type="checkbox" checked={publishAfterUpload} disabled={busy} onChange={(e) => setPublishAfterUpload(e.target.checked)} /><span>Mostrar este vídeo para os clientes assim que terminar.</span></label>
        {uploadPhase && <div className="portfolio-upload-status" role="status" aria-live="polite">
          <strong>{uploadPhase === 'uploading' ? 'Enviando arquivo' : 'Salvando no portfólio'}</strong>
          {uploadPhase === 'uploading' ? <><div className="portfolio-progress" role="progressbar" aria-label="Envio do arquivo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div><small>{progress}% do arquivo enviado</small></> : <small>O envio terminou. Aguarde a confirmação do cadastro antes de sair desta página.</small>}
        </div>}
        <button className="portfolio-primary" disabled={busy}>{busy ? (uploadPhase === 'uploading' ? 'Enviando arquivo…' : 'Salvando cadastro…') : pendingUpload ? 'Concluir cadastro do vídeo' : 'Enviar vídeo'}</button>
      </form>
    </section>

    {unregisteredUploads.length > 0 && <section className="portfolio-admin-card portfolio-recovery-card">
      <h2>Vídeos enviados que faltam cadastrar</h2>
      <p>Encontramos arquivos já enviados, mas ainda não salvos no portfólio. Você pode concluir o cadastro sem enviar o vídeo novamente.</p>
      <div className="portfolio-recovery-list">{unregisteredUploads.map((candidate) => (
        <div key={candidate.pathname}>
          <div><strong>{candidate.originalFilename}</strong><small>{moneySize(candidate.sizeBytes)} · enviado em {new Date(candidate.uploadedAt).toLocaleDateString('pt-BR')}</small></div>
          <button type="button" className="portfolio-secondary" disabled={busy} onClick={() => {
            const recoveredTitle = candidate.originalFilename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
            const next: PendingUpload = { id: candidate.id, pathname: candidate.pathname, originalFilename: candidate.originalFilename, title: recoveredTitle, description: '', published: false };
            setPendingUpload(next); setTitle(recoveredTitle); setDescription(''); setPublishAfterUpload(false); setFile(null);
            if (fileInput.current) fileInput.current.value = '';
            setError(''); setMessage('Vídeo encontrado. Revise o título acima e clique em “Concluir cadastro do vídeo”.');
            document.getElementById('portfolio-upload-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}>Usar este vídeo sem reenviar</button>
        </div>
      ))}</div>
    </section>}

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
