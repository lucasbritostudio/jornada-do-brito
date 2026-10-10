'use client';

import { useEffect, useState } from 'react';

type Feedback = 'resolved' | 'not_resolved';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  turnId?: string;
  feedback?: Feedback;
  outcome?: string;
};

type PendingAction = {
  token: string;
  name: string;
  title: string;
  summary: string;
  details?: string[];
};

type UndoState = {
  token: string;
  minutes?: number;
  message: string;
};

function validThreadId(value: string | null) {
  return Boolean(
    value && /^[a-zA-Z0-9_-]{8,120}$/.test(value),
  );
}

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
  const [historyLoading, setHistoryLoading] = useState(true);
  const [status, setStatus] = useState<
    'checking' | 'groq' | 'local'
  >('checking');
  const [pending, setPending] =
    useState<PendingAction | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [threadId, setThreadId] = useState('');
  const [learningCount, setLearningCount] = useState(0);
  const [feedbackBusy, setFeedbackBusy] = useState('');

  useEffect(() => {
    fetch('/api/ai/chat')
      .then((response) =>
        response.ok ? response.json() : null,
      )
      .then((json) =>
        setStatus(json?.groqConfigured ? 'groq' : 'local'),
      )
      .catch(() => setStatus('local'));

    const saved = window.localStorage.getItem(
      'jornada_ai_thread_id',
    );
    const id = validThreadId(saved)
      ? String(saved)
      : crypto.randomUUID();

    setThreadId(id);
    window.localStorage.setItem(
      'jornada_ai_thread_id',
      id,
    );

    fetch(
      `/api/ai/history?threadId=${encodeURIComponent(id)}`,
      { cache: 'no-store' },
    )
      .then((response) =>
        response.ok ? response.json() : null,
      )
      .then((json) => {
        if (Array.isArray(json?.messages)) {
          setHistory(json.messages);
        }
        setLearningCount(json?.stats?.learningCount || 0);
      })
      .finally(() => setHistoryLoading(false));
  }, []);

  function startNewConversation() {
    const id = crypto.randomUUID();
    setThreadId(id);
    window.localStorage.setItem(
      'jornada_ai_thread_id',
      id,
    );
    setHistory([]);
    setPending(null);
    setUndo(null);
    setMsg('');
  }

  async function ask(event: React.FormEvent) {
    event.preventDefault();

    const prompt = msg.trim();
    if (!prompt || loading || pending) return;

    const id = threadId || crypto.randomUUID();
    if (!threadId) {
      setThreadId(id);
      window.localStorage.setItem(
        'jornada_ai_thread_id',
        id,
      );
    }

    const previous = history.map((item) => ({
      role: item.role,
      content: item.content,
    }));

    setHistory((current) => [
      ...current,
      { role: 'user', content: prompt },
    ]);
    setMsg('');
    setLoading(true);
    setUndo(null);

    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: prompt,
        history: previous,
        threadId: id,
      }),
    });

    const json = await response.json();
    setLoading(false);

    if (response.ok) {
      const finalThreadId = json.threadId || id;
      setThreadId(finalThreadId);
      window.localStorage.setItem(
        'jornada_ai_thread_id',
        finalThreadId,
      );

      setHistory((current) => [
        ...current,
        {
          role: 'assistant',
          content:
            json.text ||
            (json.action
              ? 'Preparei uma ação para sua confirmação.'
              : 'Pronto.'),
          turnId: json.turnId,
          outcome: json.executed
            ? 'action'
            : json.action
              ? 'proposal'
              : json.fallback
                ? 'fallback'
                : 'answered',
        },
      ]);

      if (typeof json.learningCount === 'number') {
        setLearningCount(json.learningCount);
      }

      if (json.executed?.undoToken) {
        setUndo({
          token: json.executed.undoToken,
          minutes: json.executed.undoMinutes,
          message:
            json.executed.message ||
            json.text ||
            'Registro salvo.',
        });
        await onExecuted();
      }

      if (json.action) setPending(json.action);
      setStatus(
        json.provider === 'groq' ? 'groq' : 'local',
      );
      return;
    }

    setHistory((current) => [
      ...current,
      {
        role: 'assistant',
        content:
          json.error || 'Não consegui responder agora.',
      },
    ]);
  }

  async function giveFeedback(
    turnId: string,
    feedback: Feedback,
  ) {
    if (!threadId || !turnId || feedbackBusy) return;

    setFeedbackBusy(turnId);

    const response = await fetch('/api/ai/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        threadId,
        turnId,
        feedback,
      }),
    });

    const json = await response.json();
    setFeedbackBusy('');

    if (!response.ok) return;

    setHistory((current) =>
      current.map((item) =>
        item.turnId === turnId
          ? { ...item, feedback }
          : item,
      ),
    );

    if (typeof json.learningCount === 'number') {
      setLearningCount(json.learningCount);
    }

    if (json.lessonCreated) {
      setHistory((current) => [
        ...current,
        {
          role: 'assistant',
          content:
            'Aprendi com esse caso: guardei o que não resolveu e a solução que você confirmou que funcionou.',
        },
      ]);
    }
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
      setHistory((current) => [
        ...current,
        {
          role: 'assistant',
          content: json.message,
        },
      ]);
      setPending(null);
      await onExecuted();
      return;
    }

    setHistory((current) => [
      ...current,
      {
        role: 'assistant',
        content:
          json.error || 'Não foi possível executar.',
      },
    ]);
  }

  function cancelAction() {
    setHistory((current) => [
      ...current,
      {
        role: 'assistant',
        content:
          'Ação cancelada. Nenhum dado foi alterado.',
      },
    ]);
    setPending(null);
  }

  async function undoLast() {
    if (!undo || loading) return;

    setLoading(true);

    const response = await fetch('/api/ai/undo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: undo.token }),
    });

    const json = await response.json();
    setLoading(false);

    if (response.ok) {
      setHistory((current) => [
        ...current,
        {
          role: 'assistant',
          content: json.message,
        },
      ]);
      setUndo(null);
      await onExecuted();
      return;
    }

    setHistory((current) => [
      ...current,
      {
        role: 'assistant',
        content:
          json.error || 'Não foi possível desfazer.',
      },
    ]);
  }

  return (
    <aside className="ai-drawer">
      <div className="modal-head">
        <div>
          <div className="ai-label">
            Jornada IA ·{' '}
            {status === 'groq'
              ? 'Groq Free ativo'
              : status === 'local'
                ? 'modo local'
                : 'verificando'}
          </div>
          <h2>Seu copiloto.</h2>
          <div className="row-sub">
            Memória privada · {learningCount}{' '}
            {learningCount === 1
              ? 'caso aprendido'
              : 'casos aprendidos'}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <button
            className="btn secondary small"
            onClick={startNewConversation}
            type="button"
          >
            Nova conversa
          </button>
          <button className="close" onClick={close}>
            ×
          </button>
        </div>
      </div>

      <p
        style={{
          color: 'var(--muted)',
          lineHeight: 1.6,
        }}
      >
        Suas conversas ficam guardadas na Jornada. Quando uma
        tentativa falhar e outra resolver, seu feedback ajuda a IA
        reaproveitar a solução em casos parecidos.
      </p>

      {historyLoading ? (
        <div className="empty">Carregando conversa…</div>
      ) : history.length ? (
        <div
          className="list"
          style={{ margin: '18px 0' }}
        >
          {history.map((message, index) => (
            <div
              key={
                message.turnId ||
                `${message.role}-${index}`
              }
              className="insight"
              style={{
                marginLeft:
                  message.role === 'user' ? 32 : 0,
                marginRight:
                  message.role === 'assistant' ? 24 : 0,
              }}
            >
              <strong>
                {message.role === 'user'
                  ? 'Você'
                  : 'Jornada IA'}
              </strong>

              <p style={{ whiteSpace: 'pre-wrap' }}>
                {message.content}
              </p>

              {message.role === 'assistant' &&
                message.turnId && (
                  <div
                    style={{
                      display: 'flex',
                      gap: 7,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      marginTop: 10,
                    }}
                  >
                    {!message.feedback ? (
                      <>
                        <button
                          className="btn secondary small"
                          type="button"
                          disabled={
                            feedbackBusy === message.turnId
                          }
                          onClick={() =>
                            giveFeedback(
                              message.turnId!,
                              'resolved',
                            )
                          }
                        >
                          Resolveu
                        </button>

                        <button
                          className="btn secondary small"
                          type="button"
                          disabled={
                            feedbackBusy === message.turnId
                          }
                          onClick={() =>
                            giveFeedback(
                              message.turnId!,
                              'not_resolved',
                            )
                          }
                        >
                          Não resolveu
                        </button>
                      </>
                    ) : (
                      <span
                        className={`badge ${
                          message.feedback === 'resolved'
                            ? 'good'
                            : 'warn'
                        }`}
                      >
                        {message.feedback === 'resolved'
                          ? 'Resolveu ✓'
                          : 'Não resolveu'}
                      </span>
                    )}
                  </div>
                )}
            </div>
          ))}
        </div>
      ) : (
        <div className="list">
          {insights.slice(0, 3).map((item, index) => (
            <div
              className={`insight ${item.kind}`}
              key={index}
            >
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
            </div>
          ))}
        </div>
      )}

      {undo && (
        <div
          className="card"
          style={{
            marginTop: 16,
            borderColor: '#73804d',
          }}
        >
          <div className="ai-label">
            Salvo automaticamente
          </div>
          <p
            style={{
              color: 'var(--text)',
              lineHeight: 1.5,
            }}
          >
            {undo.message}
          </p>
          <button
            className="btn secondary small"
            onClick={undoLast}
            disabled={loading}
          >
            {loading ? 'Desfazendo…' : 'Desfazer'}
          </button>
          <div
            className="row-sub"
            style={{ marginTop: 8 }}
          >
            {undo.minutes
              ? `Disponível por cerca de ${undo.minutes} minutos.`
              : 'Disponível por tempo limitado.'}
          </div>
        </div>
      )}

      {pending && (
        <div
          className="card"
          style={{
            marginTop: 16,
            borderColor: '#73804d',
          }}
        >
          <div className="ai-label">
            Aguardando sua confirmação
          </div>
          <h3 style={{ marginTop: 8 }}>
            {pending.title}
          </h3>
          <p
            style={{
              color: 'var(--text)',
              lineHeight: 1.5,
            }}
          >
            {pending.summary}
          </p>

          {!!pending.details?.length && (
            <div className="row-sub">
              {pending.details.join(' · ')}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 14,
            }}
          >
            <button
              className="btn"
              onClick={confirmAction}
              disabled={loading}
            >
              {loading ? 'Salvando…' : 'Confirmar'}
            </button>
            <button
              className="btn secondary"
              onClick={cancelAction}
              disabled={loading}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={ask}
        style={{ marginTop: 18 }}
      >
        <textarea
          className="textarea"
          placeholder={
            pending
              ? 'Confirme ou cancele a ação acima.'
              : 'Ex.: Registre que recebi R$ 200 de um cliente hoje.'
          }
          value={msg}
          onChange={(event) =>
            setMsg(event.target.value)
          }
          maxLength={5000}
          disabled={!!pending}
        />

        <button
          className="btn"
          style={{
            width: '100%',
            marginTop: 8,
          }}
          disabled={
            loading ||
            !msg.trim() ||
            !!pending
          }
        >
          {loading
            ? 'Pensando…'
            : 'Enviar para a Jornada'}
        </button>
      </form>

      <div
        className="row-sub"
        style={{ marginTop: 10 }}
      >
        Feedback e histórico ficam privados na Jornada. Registrar
        dados pode ser automático; pagar, transferir, apagar e
        enviar mensagens externas continuam protegidos.
      </div>
    </aside>
  );
}
