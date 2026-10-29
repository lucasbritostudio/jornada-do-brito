'use client';
import { useRef, useState } from 'react';

type Props = { token: string; workId: string; title: string; stage: string; reviewUrl?: string; finalUrl?: string; lastFeedback?: string; onSaved: () => Promise<void> };
type Operation = { id: string; decision: 'approved' | 'changes_requested'; message: string };
export default function VideoReview({ token, workId, title, stage, reviewUrl, finalUrl, lastFeedback, onSaved }: Props) {
  const [showChanges, setShowChanges] = useState(false), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const operation = useRef<Operation | null>(null);
  async function respond(decision: Operation['decision']) {
    const cleanMessage = message.trim();
    if (decision === 'changes_requested' && cleanMessage.length < 5) { setError('Conte pelo menos uma frase sobre os ajustes.'); return; }
    const current = operation.current;
    const pending = current && current.decision === decision && current.message === cleanMessage ? current : { id: crypto.randomUUID(), decision, message: cleanMessage };
    operation.current = pending; setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/public/request-feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, workId, feedbackId: pending.id, decision, message: cleanMessage }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não consegui salvar.');
      operation.current = null; setMessage(''); setShowChanges(false); setNotice(decision === 'approved' ? 'Vídeo aprovado.' : 'Pedido de ajuste enviado.'); await onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não consegui salvar. Tente novamente.'); }
    finally { setBusy(false); }
  }
  if (!reviewUrl && !finalUrl && !lastFeedback && !['Pronto para você avaliar', 'Aprovado por você', 'Entregue'].includes(stage)) return null;
  return <section className="svc-video-delivery">
    {reviewUrl && <><h4>Prévia para você avaliar</h4><video controls playsInline preload="none" src={reviewUrl} aria-label={`Prévia: ${title}`} /><div className="svc-review-actions"><button type="button" disabled={busy} onClick={() => respond('approved')}>Aprovar vídeo</button><button type="button" disabled={busy} onClick={() => { setShowChanges(value => !value); setError(''); }}>Pedir ajustes</button></div>{showChanges && <div className="svc-review-form"><label>O que você quer ajustar?<textarea rows={3} maxLength={1000} value={message} disabled={busy} onChange={event => { setMessage(event.target.value); setError(''); }} placeholder="Ex.: aumentar o tempo mostrando a fachada da loja." /></label><button type="button" disabled={busy || message.trim().length < 5} onClick={() => respond('changes_requested')}>{busy ? 'Enviando…' : 'Enviar pedido de ajuste'}</button></div>}</>}
    {stage === 'Pronto para você avaliar' && !reviewUrl && <p>A prévia ainda está sendo preparada. Atualize o acompanhamento em instantes.</p>}
    {stage === 'Aprovado por você' && !finalUrl && <p>Seu vídeo foi aprovado. O vídeo final será disponibilizado aqui quando estiver pronto.</p>}
    {stage === 'Entregue' && !finalUrl && <p>A entrega foi registrada. Se o vídeo não aparecer, atualize o acompanhamento.</p>}
    {lastFeedback && <p><strong>Seu último pedido de ajuste:</strong> {lastFeedback}</p>}
    {finalUrl && <><h4>Seu vídeo final</h4><video controls playsInline preload="none" src={finalUrl} aria-label={`Vídeo final: ${title}`} /><a href={finalUrl} target="_blank" rel="noreferrer">Abrir ou baixar o vídeo final ↗</a><small>O link é pessoal e temporário. Se vencer, atualize esta página.</small></>}
    {notice && <p role="status">{notice}</p>}{error && <p className="svc-error" role="alert">{error}</p>}
  </section>;
}
