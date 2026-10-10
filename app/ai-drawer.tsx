'use client';
import { useEffect, useState } from 'react';

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type PendingAction = {
  token: string;
  name: string;
  title: string;
  summary: string;
  details?: string[];
};

export default function AIDrawerV2({
  insights,
  close,
  onExecuted,
}: {
  insights: any[];
  close: () => void;
  onExecuted: () => Promise<void>;
}) {
  const [msg, setMsg] = useState('');
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'checking' | 'groq' | 'local'>('checking');
  const [pending, setPending] = useState<PendingAction | null>(null);

  useEffect(() => {
    fetch('/api/ai/chat')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setStatus(j?.groqConfigured ? 'groq' : 'local'))
      .catch(() => setStatus('local'));
  }, []);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const prompt = msg.trim();
    if (!prompt || loading || pending) return;

    const previous = history;
    setHistory([...previous, { role: 'user', content: prompt }]);
    setMsg('');
    setLoading(true);

    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: prompt, history: previous }),
    });
    const json = await response.json();
    setLoading(false);

    if (response.ok) {
      setHistory((h) => [
        ...h,
        {
          role: 'assistant',
          content: json.text || (json.action ? 'Preparei uma ação para sua confirmação.' : 'Pronto.'),
        },
      ]);
      if (json.action) setPending(json.action);
      setStatus(json.provider === 'groq' ? 'groq' : 'local');
      return;
    }

    setHistory((h) => [
      ...h,
      { role: 'assistant', content: json.error || 'Não consegui responder agora.' },
    ]);
  }

  async function confirmAction() {
    if (!pending || loading) return;
    setLoading(true);
    const response = await fetch('/api/ai/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: pending.token }),
    });
    const json = await response.json();
    setLoading(false);

    if (response.ok) {
      setHistory((h) => [...h, { role: 'assistant', content: json.message }]);
      setPending(null);
      await onExecuted();
    } else {
      setHistory((h) => [
        ...h,
        { role: 'assistant', content: json.error || 'Não foi possível executar.' },
      ]);
    }
  }

  function cancelAction() {
    setHistory((h) => [
      ...h,
      { role: 'assistant', content: 'Ação cancelada. Nenhum dado foi alterado.' },
    ]);
    setPending(null);
  }

  return (
    <aside className="ai-drawer">
      <div className="modal-head">
        <div>
          <div className="ai-label">
            Jornada IA · {status === 'groq' ? 'Groq Free ativo' : status === 'local' ? 'modo local' : 'verificando'}
          </div>
          <h2>Seu copiloto.</h2>
        </div>
        <button className="close" onClick={close}>×</button>
      </div>

      <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
        Eu analiso sua Jornada e também posso preparar registros. Nada é gravado sem você confirmar.
      </p>

      {history.length ? (
        <div className="list" style={{ margin: '18px 0' }}>
          {history.map((m, k) => (
            <div
              key={k}
              className="insight"
              style={{
                marginLeft: m.role === 'user' ? 32 : 0,
                marginRight: m.role === 'assistant' ? 24 : 0,
              }}
            >
              <strong>{m.role === 'user' ? 'Você' : 'Jornada IA'}</strong>
              <p style={{ whiteSpace: 'pre-wrap' }}>{m.content}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="list">
          {insights.slice(0, 3).map((i, k) => (
            <div className={`insight ${i.kind}`} key={k}>
              <strong>{i.title}</strong>
              <p>{i.detail}</p>
            </div>
          ))}
        </div>
      )}

      {pending && (
        <div className="card" style={{ marginTop: 16, borderColor: '#73804d' }}>
          <div className="ai-label">Aguardando sua confirmação</div>
          <h3 style={{ marginTop: 8 }}>{pending.title}</h3>
          <p style={{ color: 'var(--text)', lineHeight: 1.5 }}>{pending.summary}</p>
          {!!pending.details?.length && (
            <div className="row-sub">{pending.details.join(' · ')}</div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn" onClick={confirmAction} disabled={loading}>
              {loading ? 'Salvando…' : 'Confirmar'}
            </button>
            <button className="btn secondary" onClick={cancelAction} disabled={loading}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <form onSubmit={ask} style={{ marginTop: 18 }}>
        <textarea
          className="textarea"
          placeholder={pending ? 'Confirme ou cancele a ação acima.' : 'Ex.: Registre um gasto de R$ 50 com gasolina.'}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          maxLength={5000}
          disabled={!!pending}
        />
        <button
          className="btn"
          style={{ width: '100%', marginTop: 8 }}
          disabled={loading || !msg.trim() || !!pending}
        >
          {loading ? 'Pensando…' : 'Perguntar à Jornada'}
        </button>
      </form>

      <div className="row-sub" style={{ marginTop: 10 }}>
        Criar registros exige confirmação. Excluir dados, pagar contas e enviar WhatsApp continuam bloqueados.
      </div>
    </aside>
  );
}
