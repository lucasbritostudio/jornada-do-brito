'use client';

import { FormEvent, useState } from 'react';

export default function PasswordSettings() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (password !== confirmation) {
      setError('As senhas não conferem.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error || 'Não foi possível atualizar a senha.');
        return;
      }
      setPassword('');
      setConfirmation('');
      setSuccess('Senha atualizada. As outras sessões foram encerradas.');
    } catch {
      setError('Não foi possível atualizar a senha. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card span-6">
      <h3>Segurança</h3>
      <p className="row-sub">Crie uma nova senha. As sessões abertas em outros dispositivos serão encerradas.</p>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="new-password">Criar nova senha</label>
          <input id="new-password" className="input" type="password" autoComplete="new-password" minLength={8} maxLength={1024} value={password} onChange={(event) => setPassword(event.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="confirm-new-password">Confirmar nova senha</label>
          <input id="confirm-new-password" className="input" type="password" autoComplete="new-password" minLength={8} maxLength={1024} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        {success && <div className="success" role="status">{success}</div>}
        <button className="btn secondary small" type="submit" disabled={saving} style={{ marginTop: 16 }}>
          {saving ? 'Atualizando…' : 'Criar nova senha'}
        </button>
      </form>
    </div>
  );
}
