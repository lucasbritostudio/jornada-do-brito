'use client';
import { useState } from 'react';
import './booking.css';

type Props = { token: string; status: string; proposalAt?: string; confirmedAt?: string; message?: string; depositRemainingCents: number; cancellationTermsAccepted: boolean; onSaved: () => Promise<void> };
const showDate = (value?: string) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Fortaleza', dateStyle: 'long', timeStyle: 'short' }).format(new Date(value)) : '';
export default function BookingResponse({ token, status, proposalAt, confirmedAt, message, depositRemainingCents, cancellationTermsAccepted, onSaved }: Props) {
  const [asking, setAsking] = useState(false), [reply, setReply] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(cancellationTermsAccepted);
  async function respond(action: 'confirm' | 'request-change') {
    if (action === 'request-change' && reply.trim().length < 5) { setError('Conte pelo menos uma frase sobre outro horário.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/public/request-booking', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, action, message: reply, ...(action === 'confirm' ? { acceptCancellationTerms: acceptTerms } : {}) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não consegui salvar sua resposta.');
      setNotice(action === 'confirm' ? data.message || 'Horário registrado.' : 'Pedido de outro horário enviado.'); setAsking(false); setReply(''); await onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não consegui salvar sua resposta.'); }
    finally { setBusy(false); }
  }
  return <section className="svc-booking-response">
    {confirmedAt && <p><strong>Data reservada:</strong> {showDate(confirmedAt)}</p>}
    {status === 'awaiting_deposit' && <p><strong>Horário escolhido:</strong> {showDate(proposalAt)}. Ainda não está reservado. Falta confirmar {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(depositRemainingCents / 100)} para completar o sinal de 50%.</p>}
    {status === 'deposit_paid_reschedule_needed' && <p>O sinal foi recebido, mas esse horário não está mais disponível. Aguarde uma nova proposta para reservar outra data.</p>}
    {status === 'proposed' || status === 'reschedule_proposed' ? <><p><strong>{status === 'reschedule_proposed' ? 'Nova data proposta' : 'Data proposta para gravação'}:</strong> {showDate(proposalAt)}</p><p>Confirme se esse horário funciona. A data será reservada depois que o sinal de 50% for confirmado. Se não, conte qual dia ou período é melhor.</p>{!cancellationTermsAccepted && <label className="svc-terms-check"><input type="checkbox" checked={acceptTerms} disabled={busy} onChange={event => setAcceptTerms(event.target.checked)} /><span>Li e aceito: posso cancelar sem taxa nos primeiros 7 dias. Depois disso, se a gravação ainda não começou, a taxa é 10% do valor total. Se já começou, o pedido será analisado.</span></label>}<div className="svc-review-actions"><button type="button" disabled={busy || (!cancellationTermsAccepted && !acceptTerms)} onClick={() => respond('confirm')}>Escolher este horário</button><button type="button" disabled={busy} onClick={() => { setAsking(value => !value); setError(''); }}>Pedir outra data</button></div>{asking && <div className="svc-review-form"><label>Qual horário funciona melhor para você?<textarea rows={3} maxLength={500} value={reply} disabled={busy} onChange={event => setReply(event.target.value)} placeholder="Ex.: Não posso na terça. Posso na quinta à tarde." /></label><button type="button" disabled={busy || reply.trim().length < 5} onClick={() => respond('request-change')}>Enviar pedido de outra data</button></div>}</> : status === 'change_requested' ? <p>Seu pedido de outra data foi enviado. Aguarde uma nova proposta por este link.</p> : status === 'awaiting_deposit' || status === 'deposit_paid_reschedule_needed' ? null : confirmedAt ? null : <p>O horário da gravação ainda será combinado por este link.</p>}
    {message && <p><strong>Resposta enviada:</strong> {message}</p>}{notice && <p role="status">{notice}</p>}{error && <p className="svc-error" role="alert">{error}</p>}
  </section>;
}
