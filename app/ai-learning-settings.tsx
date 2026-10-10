'use client';

import { useEffect, useState } from 'react';

type Overview = {
  stats: {
    threads: number;
    resolved: number;
    needsAttention: number;
    learningCount: number;
  };
  recentLessons: Array<{
    id: string;
    problem: string;
    successfulResolution: string;
    failureCount: number;
    useCount: number;
    updatedAt: string;
  }>;
};

export default function AiLearningSettingsCard() {
  const [data, setData] = useState<Overview | null>(null);
  const [situation, setSituation] = useState('');
  const [solution, setSolution] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resultMessage, setResultMessage] = useState('');

  useEffect(() => {
    fetch('/api/ai/learning', { cache: 'no-store' })
      .then((response) =>
        response.ok ? response.json() : null,
      )
      .then((json) => setData(json))
      .catch(() => setData(null));
  }, []);

  async function teachFromConversation(event: React.FormEvent) {
    event.preventDefault();
    if (!confirmed || saving) return;
    setSaving(true);
    setResultMessage('');
    try {
      const response = await fetch('/api/ai/learning', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ situation, solution, confirmed }),
      });
      const result = await response.json();
      if (!response.ok) {
        setResultMessage(result.error || 'Não foi possível salvar.');
        return;
      }
      setResultMessage(result.duplicate
        ? 'Essa lição já estava guardada. Nada foi duplicado.'
        : 'Lição salva. A Jornada poderá reutilizá-la em casos parecidos.');
      setSituation('');
      setSolution('');
      setConfirmed(false);
      const refreshed = await fetch('/api/ai/learning', { cache: 'no-store' });
      if (refreshed.ok) setData(await refreshed.json());
    } catch {
      setResultMessage('Falha na conexão. Confira antes de tentar novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card span-12">
      <h3>Aprendizado da IA</h3>
      <p
        style={{
          color: 'var(--muted)',
          lineHeight: 1.6,
        }}
      >
        A Jornada aprende com soluções que você confirma. Ela não lê
        o WhatsApp automaticamente: você ensina o que funcionou após
        cada atendimento, sem precisar conectar a API da Meta.
      </p>

      <form onSubmit={teachFromConversation} style={{ marginTop: 16 }}>
        <h4>Ensinar com uma conversa atendida</h4>
        <p className="row-sub" style={{ lineHeight: 1.6 }}>
          Continue usando o WhatsApp Business no iPhone. Depois do atendimento,
          anote somente o que o cliente precisava e o que resolveu.
          Não copie nomes, telefones, links, dados financeiros nem a conversa inteira.
        </p>
        <div className="field">
          <label htmlFor="lesson-situation">O que o cliente precisava?</label>
          <textarea
            id="lesson-situation"
            className="input"
            rows={3}
            maxLength={3000}
            value={situation}
            onChange={(event) => setSituation(event.target.value)}
            placeholder="Ex.: cliente queria um vídeo curto e não sabia por onde começar."
          />
        </div>
        <div className="field">
          <label htmlFor="lesson-solution">O que você fez que funcionou?</label>
          <textarea
            id="lesson-solution"
            className="input"
            rows={3}
            maxLength={3000}
            value={solution}
            onChange={(event) => setSolution(event.target.value)}
            placeholder="Ex.: apresentei um roteiro de 30 segundos e o cliente aprovou."
          />
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12 }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>Confirmei que essa solução funcionou. Quero guardar como aprendizado.</span>
        </label>
        <button
          className="btn"
          style={{ marginTop: 12 }}
          disabled={saving || !confirmed || situation.trim().length < 12 || solution.trim().length < 12}
        >
          {saving ? 'Guardando…' : 'Ensinar a Jornada'}
        </button>
        {resultMessage && <p role="status" className="row-sub" style={{ marginTop: 10 }}>
          {resultMessage}
        </p>}
      </form>

      <div className="grid" style={{ marginTop: 14 }}>
        <div className="insight span-3">
          <strong>{data?.stats.threads || 0}</strong>
          <p>conversas guardadas</p>
        </div>
        <div className="insight span-3">
          <strong>{data?.stats.resolved || 0}</strong>
          <p>conversas resolvidas</p>
        </div>
        <div className="insight warn span-3">
          <strong>{data?.stats.needsAttention || 0}</strong>
          <p>casos ainda não resolvidos</p>
        </div>
        <div className="insight good span-3">
          <strong>{data?.stats.learningCount || 0}</strong>
          <p>soluções transformadas em aprendizado</p>
        </div>
      </div>

      {!!data?.recentLessons?.length && (
        <div className="list" style={{ marginTop: 16 }}>
          {data.recentLessons.map((lesson) => (
            <div className="row" key={lesson.id}>
              <div className="row-main">
                <div className="row-title">
                  Problema: {lesson.problem}
                </div>
                <div className="row-sub">
                  Solução confirmada:{' '}
                  {lesson.successfulResolution}
                </div>
              </div>
              <span className="badge good">
                {lesson.failureCount === 0
                  ? 'Ensinado por você'
                  : `${lesson.failureCount} ${lesson.failureCount === 1
                      ? 'tentativa falhou' : 'tentativas falharam'}`}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="row-sub" style={{ marginTop: 12 }}>
        Isso é memória privada da Jornada, não treinamento do
        modelo externo.
      </div>
    </div>
  );
}
