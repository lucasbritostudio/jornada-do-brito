'use client';
import { upload } from '@vercel/blob/client';
import { useRef, useState } from 'react';
import './deliverable.css';

const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
const TYPES: Record<string, string> = { 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov' };
function safeFilename(value: string) { return (value.split(/[\\/]/).pop() || 'video.mp4').normalize('NFKC').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-160); }
type Asset = { id: string; name: string; size: number };
export default function DeliverableUploader({ workId, kind, current, busy, onComplete }: { workId: string; kind: 'review' | 'final'; current?: Asset; busy: boolean; onComplete: (assetId: string, kind: 'review' | 'final') => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null), assetId = useRef(''), uploaded = useRef(false);
  const [file, setFile] = useState<File | null>(null), [uploading, setUploading] = useState(false), [progress, setProgress] = useState(''), [error, setError] = useState('');
  function choose(next: File | null) {
    if (input.current) input.current.value = '';
    setError(''); uploaded.current = false; assetId.current = '';
    if (!next) return;
    if (!TYPES[next.type] || !safeFilename(next.name).toLowerCase().endsWith(TYPES[next.type])) { setError('Use um vídeo MP4, WebM ou MOV.'); setFile(null); return; }
    if (next.size > MAX_VIDEO_BYTES) { setError('O limite é 1 GB por vídeo.'); setFile(null); return; }
    assetId.current = crypto.randomUUID(); setFile(next);
  }
  async function send() {
    if (!file || uploading || busy) return;
    setUploading(true); setError('');
    try {
      if (!uploaded.current) {
        const filename = safeFilename(file.name), id = assetId.current || crypto.randomUUID(); assetId.current = id;
        setProgress('Enviando…');
        await upload(`jornada/client-deliverables/${workId}/${kind}/${id}/${filename}`, file, {
          access: 'private', contentType: file.type, handleUploadUrl: '/api/production/deliverables', multipart: file.size > 50 * 1024 * 1024,
          clientPayload: JSON.stringify({ workId, kind, assetId: id, name: file.name, contentType: file.type }),
          onUploadProgress: event => setProgress(`Enviando… ${Math.round(event.percentage)}%`),
        });
        uploaded.current = true;
      }
      setProgress('Salvando e preparando o acompanhamento…');
      await onComplete(assetId.current, kind);
      setFile(null); assetId.current = ''; uploaded.current = false; if (input.current) input.current.value = '';
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível enviar este vídeo.'); }
    finally { setUploading(false); setProgress(''); }
  }
  return <div className="pr-deliverable">
    {current && <small>Arquivo atual: {current.name} · {(current.size / 1024 / 1024).toFixed(1)} MB</small>}
    <input ref={input} hidden type="file" accept="video/mp4,video/webm,video/quicktime" disabled={uploading || busy} onChange={event => choose(event.target.files?.[0] || null)} />
    {!file ? <button className="pr-btn-light" disabled={uploading || busy} onClick={() => input.current?.click()}>{kind === 'review' ? current ? 'Trocar prévia' : 'Escolher prévia para avaliação' : current ? 'Trocar vídeo final' : 'Escolher vídeo final'}</button> : <><small>{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</small><div><button disabled={uploading || busy} onClick={send}>{uploading ? progress : kind === 'review' ? 'Enviar para avaliação' : 'Entregar vídeo final'}</button><button className="pr-btn-light" disabled={uploading || busy} onClick={() => choose(null)}>Cancelar</button></div></>}
    <small>MP4, WebM ou MOV · até 1 GB. O arquivo fica privado; a prévia e a entrega aparecem no link pessoal do cliente.</small>
    {error && <p className="pr-error" role="alert">{error}</p>}
  </div>;
}
