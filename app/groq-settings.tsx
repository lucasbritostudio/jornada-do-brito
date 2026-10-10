'use client';

import { useEffect, useState } from 'react';

type Status = {
  configured: boolean;
  source?: 'environment' | 'encrypted-store' | 'none';
  last4?: string | null;
  model?: string;
};

export default function GroqSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [key, setKey] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await fetch('/api/settings/groq', { cache: 'no-store' });
    if (response.ok) setStatus(await response.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    setSaving(true);
    setMessage('');
    const response = await fetch('/api/settings/groq', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey: key.trim() }),
    });
    const json = await response.json();
    setSaving(false);
    if (response.ok) {
      setKey('');
      setMessage('Groq conectada e validada.');
      setStatus(json);
    } else {
      setMessage(json.error || 'Não foi possível conectar.');
    }
  }

  async function remove() {
    if (!confirm('Remover a chave Groq salva na Jornada?')) return;
    setSaving(true);
    const response = await fetch('/api/settings/groq', { method: 'DELETE' });
    const json = await response.json();
    setSaving(false);
    setMessage(response.ok ? 'Chave removida.' : json.error || 'Falha ao remover.');
    if (response.ok) await load();
  }

  return (
    <div className="card span-12">
      <h3>Jornada IA · Groq Free</h3>
      <div className="row">
        <div>
          <div className="row-title">
            {status?.configured ? 'Groq conectada' : 'Groq ainda não conectada'}
          </div>
          <div className="row-sub">
            {status?.configured
              ? `${status.model || 'openai/gpt-oss-20b'} · chave terminando em ${status.last4 || '••••'}`
              : 'Crie uma chave gratuita na Groq e cole aqui uma única vez.'}
          </div>
        </div>
        <span className={`badge ${status?.configured ? 'good' : 'warn'}`}>
          {status?.configured ? 'Ativa' : 'Pendente'}
        </span>
      </div>

      {!status?.configured && (
        <form onSubmit={connect} style={{ marginTop: 14 }}>
          <div className="field">
            <label>Chave da Groq</label>
            <input
              className="input"
              type="password"
              autoComplete="off"
              placeholder="gsk_••••••••••••"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <div className="row-sub">
              A Jornada valida a chave no servidor, criptografa com AES-256-GCM e não mostra o valor novamente.
            </div>
          </div>
          <button className="btn" disabled={saving || !key.trim()} style={{ marginTop: 12 }}>
            {saving ? 'Validando…' : 'Conectar Groq Free'}
          </button>
        </form>
      )}

      {status?.configured && status.source === 'encrypted-store' && (
        <button
          className="btn danger small"
          style={{ marginTop: 14 }}
          onClick={remove}
          disabled={saving}
        >
          Remover chave
        </button>
      )}

      {message && (
        <div className={message.includes('conectada') ? 'success' : 'row-sub'} style={{ marginTop: 10 }}>
          {message}
        </div>
      )}
    </div>
  );
}
