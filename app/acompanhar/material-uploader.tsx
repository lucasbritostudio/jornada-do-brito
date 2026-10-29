'use client';
import { upload } from '@vercel/blob/client';
import { useRef, useState } from 'react';
import '../servicos/materials.css';

export type RequestMaterial = { id: string; name: string; size: number; createdAt?: string };
type PendingFile = { id: string; file: File };
const MAX_FILES = 4, MAX_FILE_BYTES = 20 * 1024 * 1024, MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const TYPES: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };
const formatSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
function safeFilename(value: string) { return (value.split(/[\\/]/).pop() || 'material').normalize('NFKC').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-140); }

export default function MaterialUploader({ requestId, token, materials, allowed, onUploaded }: { requestId: string; token: string; materials: RequestMaterial[]; allowed: boolean; onUploaded: () => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null), [pending, setPending] = useState<PendingFile[]>([]), [busy, setBusy] = useState(false), [progress, setProgress] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState('');
  const totalBytes = materials.reduce((sum, material) => sum + material.size, 0);
  const remainingCount = Math.max(0, MAX_FILES - materials.length - pending.length), remainingBytes = Math.max(0, MAX_TOTAL_BYTES - totalBytes - pending.reduce((sum, item) => sum + item.file.size, 0));
  function choose(files: FileList | null) {
    if (!files) return;
    setError(''); setMessage('');
    const accepted: PendingFile[] = [];
    let count = materials.length + pending.length, bytes = totalBytes + pending.reduce((sum, item) => sum + item.file.size, 0);
    for (const file of Array.from(files)) {
      if (!TYPES[file.type] || !safeFilename(file.name).toLowerCase().endsWith(TYPES[file.type])) { setError(`“${file.name}” não é JPG, PNG, WebP ou PDF.`); continue; }
      if (file.size > MAX_FILE_BYTES) { setError(`“${file.name}” passa do limite de 20 MB.`); continue; }
      if (count >= MAX_FILES || bytes + file.size > MAX_TOTAL_BYTES) { setError('Este pedido aceita até 4 arquivos e 50 MB no total.'); continue; }
      accepted.push({ id: crypto.randomUUID(), file }); count += 1; bytes += file.size;
    }
    setPending(current => [...current, ...accepted]);
    if (input.current) input.current.value = '';
  }
  async function send() {
    if (!pending.length || busy || !allowed) return;
    setBusy(true); setError(''); setMessage('');
    const completed: string[] = [], confirmed = new Set<string>();
    try {
      for (let index = 0; index < pending.length; index += 1) {
        const item = pending[index], filename = safeFilename(item.file.name);
        setProgress(`Enviando arquivo ${index + 1} de ${pending.length}…`);
        await upload(`jornada/client-materials/${requestId}/${item.id}/${filename}`, item.file, {
          access: 'private', contentType: item.file.type, handleUploadUrl: '/api/public/client-materials',
          clientPayload: JSON.stringify({ requestId, token, materialId: item.id, name: item.file.name, contentType: item.file.type }),
          onUploadProgress: event => setProgress(`Enviando arquivo ${index + 1} de ${pending.length}… ${Math.round(event.percentage)}%`),
        });
        completed.push(item.id);
      }
      setProgress('Confirmando os arquivos…');
      let saved = false;
      for (let attempt = 0; attempt < 4 && !saved; attempt += 1) {
        if (attempt) await new Promise(resolve => setTimeout(resolve, 350));
        await onUploaded();
        const response = await fetch('/api/public/request-status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }), cache: 'no-store' });
        if (!response.ok) break;
        const state = await response.json();
        const stored = new Set((state.materials || []).map((material: RequestMaterial) => material.id));
        for (const id of completed) if (stored.has(id)) confirmed.add(id);
        saved = completed.every(id => stored.has(id));
      }
      if (!saved) throw new Error('O arquivo foi enviado e está sendo confirmado. Atualize o acompanhamento em instantes.');
      setPending(current => current.filter(item => !completed.includes(item.id)));
      setMessage(`${completed.length} arquivo${completed.length === 1 ? '' : 's'} enviado${completed.length === 1 ? '' : 's'} com segurança.`);
      await onUploaded();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível enviar os arquivos. Tente novamente.');
      setPending(current => current.filter(item => !confirmed.has(item.id)));
    } finally { setBusy(false); setProgress(''); }
  }
  if (!allowed) return null;
  return <section className="svc-materials"><h3>Enviar materiais</h3><p>Adicione imagens ou um PDF de referência para explicar melhor seu pedido. O Brito poderá ver os arquivos. Vídeos não são aceitos aqui.</p>
    {materials.length > 0 && <ul>{materials.map(material => <li key={material.id}>{material.name} <small>({formatSize(material.size)})</small></li>)}</ul>}
    <small>{materials.length} de {MAX_FILES} arquivos · {formatSize(totalBytes)} de {formatSize(MAX_TOTAL_BYTES)} usados</small>
    <input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple disabled={busy || !remainingCount} onChange={event => choose(event.target.files)} />
    <div className="svc-material-actions"><button type="button" disabled={busy || !remainingCount || !remainingBytes} onClick={() => input.current?.click()}>{pending.length ? 'Escolher mais arquivos' : 'Escolher arquivos'}</button>{pending.length > 0 && <button type="button" className="svc-button" disabled={busy} onClick={send}>{busy ? progress || 'Enviando…' : `Enviar ${pending.length} arquivo${pending.length === 1 ? '' : 's'}`}</button>}</div>
    {pending.length > 0 && <ul className="svc-muted">{pending.map(item => <li key={item.id}>{item.file.name} · {formatSize(item.file.size)} <button type="button" disabled={busy} onClick={() => setPending(current => current.filter(entry => entry.id !== item.id))}>Remover</button></li>)}</ul>}
    {message && <p className="success" role="status">{message}</p>}{error && <p className="svc-error" role="alert">{error}</p>}
    <small>Até {MAX_FILE_BYTES / 1024 / 1024} MB por arquivo. JPG, PNG, WebP ou PDF.</small>
  </section>;
}
