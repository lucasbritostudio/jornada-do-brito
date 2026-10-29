'use client';
import { useState } from 'react';
import './booking.css';

type Cancellation = { requestedAt: string; status: 'refund_pending' | 'review_required' | 'refunded'; rule: string; paidCents: number; feeCents?: number; refundCents?: number; refundedAt?: string };
type Props = { token: string; cancellation?: Cancellation; onSaved: () => Promise<void> };
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
export default function CancellationRequest({ token, cancellation, onSaved }: Props) {
  const [open, setOpen] = useState(false), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  async function submit() {
    if (busy) return;
    if (!window.confirm('Quer mesmo pedir o cancelamento deste serviço?')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/public/request-cancellation', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, reason }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível registrar.');
      setNotice('Pedido de cancelamento registrado.'); setOpen(false); setReason(''); await onSaved();
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Não foi possível registrar.'); }
    finally { setBusy(false); }
  }
  return <section className="svc-booking-response">
    <h3>Cancelar serviço</h3>
    {!cancellation && <><p>Você pode pedir o cancelamento por aqui. O sistema informa a taxa e o valor do reembolso. A transferência do reembolso é feita manualmente por Brito.</p>{!open ? <button type="button" className="svc-button" onClick={() => setOpen(true)}>Pedir cancelamento</button> : <><label>Motivo (opcional)<textarea rows={2} maxLength={500} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} placeholder="Conte brevemente o motivo." /></label><div className="svc-review-actions"><button type="button" disabled={busy} onClick={submit}>{busy ? 'Registrando…' : 'Confirmar cancelamento'}</button><button type="button" disabled={busy} onClick={() => setOpen(false)}>Voltar</button></div></>}</>}
    {cancellation?.status === 'refund_pending' && <><p>Pedido registrado. Valor recebido: <strong>{money(cancellation.paidCents)}</strong></p><p>Taxa: <strong>{money(cancellation.feeCents || 0)}</strong> · Reembolso: <strong>{money(cancellation.refundCents || 0)}</strong></p><p>{cancellation.rule === 'cooling_off_full_refund' ? 'Cancelamento dentro do prazo de arrependimento: sem taxa e com devolução integral.' : cancellation.rule === 'no_reservation_full_refund' ? 'Não havia data reservada: sem taxa.' : 'A taxa de cancelamento é 10% do valor total do serviço.'} Brito fará a transferência do reembolso manualmente.</p></>}
    {cancellation?.status === 'review_required' && <p>O pedido foi registrado. Como a gravação já começou, o sistema pediu uma análise antes de calcular a taxa e o valor a devolver.</p>}
    {cancellation?.status === 'refunded' && <p>Reembolso de <strong>{money(cancellation.refundCents || 0)}</strong> registrado em {cancellation.refundedAt ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(cancellation.refundedAt)) : 'data não informada'}.</p>}
    {notice && <p role="status">{notice}</p>}{error && <p className="svc-error" role="alert">{error}</p>}
  </section>;
}
