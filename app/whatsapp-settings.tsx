'use client';

import { useEffect, useState } from 'react';

type WhatsAppStatus = {
  configured: boolean;
  automationEnabled: boolean;
  humanTakeoverStopsAi: boolean;
};

export default function WhatsAppSettingsCard() {
  const [status, setStatus] =
    useState<WhatsAppStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const response = await fetch('/api/whatsapp/status', {
      cache: 'no-store',
    });
    if (response.ok) {
      setStatus(await response.json());
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle() {
    if (!status || busy) return;
    setBusy(true);
    setError('');

    const response = await fetch('/api/whatsapp/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        enabled: !status.automationEnabled,
      }),
    });

    const json = await response.json();
    setBusy(false);

    if (!response.ok) {
      setError(
        json.error ||
          'Não foi possível alterar a automação.',
      );
      return;
    }

    setStatus((current) =>
      current
        ? {
            ...current,
            configured: json.configured,
            automationEnabled: json.automationEnabled,
          }
        : current,
    );
  }

  return (
    <div className="card span-6">
      <h3>WhatsApp</h3>

      <div className="row">
        <div>
          <div className="row-title">
            WhatsApp Business + Cloud API
          </div>
          <div className="row-sub">
            Coexistência, histórico, contatos e tomada humana.
          </div>
        </div>
        <span
          className={`badge ${
            status?.configured ? 'good' : 'warn'
          }`}
        >
          {status?.configured
            ? 'Meta conectada'
            : 'Aguardando Meta'}
        </span>
      </div>

      <div className="row">
        <div>
          <div className="row-title">
            Respostas automáticas
          </div>
          <div className="row-sub">
            Quando Brito responder pelo WhatsApp Business, a IA
            para naquela conversa.
          </div>
        </div>
        <button
          className={`btn small ${
            status?.automationEnabled ? 'danger' : 'secondary'
          }`}
          onClick={toggle}
          disabled={
            busy ||
            !status ||
            (!status.configured &&
              !status.automationEnabled)
          }
        >
          {busy
            ? 'Salvando…'
            : status?.automationEnabled
              ? 'Desligar'
              : 'Ligar'}
        </button>
      </div>

      <div className="row-sub" style={{ marginTop: 10 }}>
        Automático: saudação, briefing básico e status
        confirmado. Preço, contrato, reclamação, prazo incerto
        e negociação sensível ficam para Brito.
      </div>

      {error && <div className="error">{error}</div>}
    </div>
  );
}
