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

  useEffect(() => {
    fetch('/api/ai/learning', { cache: 'no-store' })
      .then((response) =>
        response.ok ? response.json() : null,
      )
      .then((json) => setData(json))
      .catch(() => setData(null));
  }, []);

  return (
    <div className="card span-12">
      <h3>Aprendizado da IA</h3>
      <p
        style={{
          color: 'var(--muted)',
          lineHeight: 1.6,
        }}
      >
        A Jornada aprende com seu feedback. Uma tentativa ruim só
        vira lição quando você confirma depois qual resposta
        realmente resolveu.
      </p>

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
                {lesson.failureCount}{' '}
                {lesson.failureCount === 1
                  ? 'tentativa falhou'
                  : 'tentativas falharam'}
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
