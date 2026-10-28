'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  ConversationAutomationMode,
  StudyArea,
  StudyEvent,
  WorkspaceState,
} from '@/lib/types';
import { summarizeCurrentMonth } from '@/lib/finance-period';
import {
  CINEMA_DECISION_RULE,
  VIDEO_PROFESSIONAL_METHOD,
} from '@/lib/professional-method';
import GroqSettings from './groq-settings';
import AIDrawerV2 from './ai-drawer';
import WhatsAppSettingsCard from './whatsapp-settings';
import AiLearningSettingsCard from './ai-learning-settings';
import PasswordSettings from './password-settings';

type Tab =
  | 'today'
  | 'conversations'
  | 'work'
  | 'finance'
  | 'journey'
  | 'settings';

type QuickType =
  | 'contact'
  | 'expense'
  | 'income'
  | 'debt'
  | 'task'
  | 'goal'
  | 'inbox'
  | 'study'
  | 'experience';

const brl = (cents = 0) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);

const moneyToCents = (value: string) =>
  Math.round(
    Number(value.replace(/\./g, '').replace(',', '.')) * 100 || 0,
  );

const dateLabel = (value?: string) =>
  value
    ? new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: 'short',
      }).format(new Date(value.slice(0, 10) + 'T12:00:00'))
    : '—';

const certaintyLabel: Record<string, string> = {
  confirmed: 'Confirmado',
  estimate: 'Estimativa',
  forecast: 'Previsão',
  pending: 'Pendente',
  interpretation: 'Interpretação',
};

export default function Dashboard() {
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [tab, setTab] = useState<Tab>('today');
  const [quick, setQuick] = useState(false);
  const [qtype, setQtype] = useState<QuickType>('inbox');
  const [ai, setAi] = useState(false);
  const [insights, setInsights] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  async function load() {
    const response = await fetch('/api/state', { cache: 'no-store' });
    if (response.status === 401) {
      location.href = '/login';
      return;
    }
    setState(await response.json());

    const aiResponse = await fetch('/api/ai', { cache: 'no-store' });
    if (aiResponse.ok) {
      setInsights((await aiResponse.json()).insights || []);
    }
  }

  useEffect(() => {
    load();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  async function mutate(
    collection: string,
    record: any,
    operation = 'upsert',
    id?: string,
  ) {
    setBusy(true);
    const response = await fetch('/api/state', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        collection,
        record,
        operation,
        id,
      }),
    });
    setBusy(false);

    if (!response.ok) return false;

    setState(await response.json());
    setNotice('Salvo.');
    setTimeout(() => setNotice(''), 1600);
    return true;
  }

  const derived = useMemo(() => {
    if (!state) return null;

    const monthFinance = summarizeCurrentMonth(state.transactions);

    const structuralDebts = state.debts
      .filter(
        (item) =>
          item.status === 'active' && item.structural !== false,
      )
      .reduce((sum, item) => sum + item.currentBalanceCents, 0);

    const bankCash = state.financialAccounts
      .filter(
        (item) =>
          item.active &&
          ['cash', 'bank', 'wallet'].includes(item.type),
      )
      .reduce(
        (sum, item) =>
          sum + (item.currentBalanceCents ?? item.openingBalanceCents),
        0,
      );

    const rescuable = state.financialAccounts
      .filter((item) => item.active)
      .reduce((sum, item) => {
        if (item.rescuableBalanceCents) {
          return sum + item.rescuableBalanceCents;
        }
        if (item.type === 'own_collateral') {
          return (
            sum +
            (item.currentBalanceCents ?? item.openingBalanceCents)
          );
        }
        return sum;
      }, 0);

    const obligations = state.obligations
      .filter((item) => item.status === 'planned')
      .reduce((sum, item) => sum + item.amountCents, 0);

    const obligationsInReview = state.obligations
      .filter((item) => item.status === 'review')
      .reduce((sum, item) => sum + item.amountCents, 0);

    const confirmedReceivables = state.receivables
      .filter(
        (item) =>
          item.status === 'pending' &&
          item.certainty === 'confirmed',
      )
      .reduce((sum, item) => sum + (item.amountCents || 0), 0);

    const estimatedReceivables = state.receivables
      .filter(
        (item) =>
          item.status === 'pending' &&
          item.certainty !== 'confirmed',
      )
      .reduce((sum, item) => sum + (item.amountCents || 0), 0);

    const dueTasks = state.tasks
      .filter(
        (item) => !['done', 'cancelled'].includes(item.status),
      )
      .sort((a, b) =>
        (a.dueAt || '9999').localeCompare(b.dueAt || '9999'),
      );

    return {
      income: monthFinance.incomeCents,
      expense: monthFinance.expenseCents,
      net: monthFinance.netCents,
      plannedIncome: monthFinance.plannedIncomeCents,
      plannedExpense: monthFinance.plannedExpenseCents,
      hasClearedMonthActivity: monthFinance.hasClearedTransactions,
      structuralDebts,
      bankCash,
      rescuable,
      obligations,
      obligationsInReview,
      confirmedReceivables,
      estimatedReceivables,
      dueTasks,
      openConversations: state.conversations.filter(
        (item) =>
          item.status === 'waiting_me' || item.unreadCount > 0,
      ),
      openOpportunities: state.opportunities.filter(
        (item) => !['won', 'lost'].includes(item.stage),
      ),
      inboxPending: state.inbox.filter(
        (item) =>
          item.status === 'new' ||
          item.status === 'needs_review',
      ),
    };
  }, [state]);

  if (!state || !derived) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <p>Carregando sua Jornada…</p>
        </div>
      </div>
    );
  }

  const nav: [Tab, string][] = [
    ['today', 'Hoje'],
    ['conversations', 'Conversas'],
    ['work', 'Trabalho'],
    ['finance', 'Finanças'],
    ['journey', 'Jornada'],
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">JB</div>
          <div>
            <strong>Jornada</strong>
            <small>do Brito</small>
          </div>
        </div>

        <div className="nav">
          {nav.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={tab === key ? 'active' : ''}
            >
              <span className="dot-icon" />
              {label}
            </button>
          ))}
          <a href="/producao" style={{display:'flex',gap:11,alignItems:'center',width:'100%',padding:'11px 12px',borderRadius:12,background:'#1c312b',color:'#d4eb99',fontWeight:750,fontSize:13}}>
            <span className="dot-icon" aria-hidden="true" />
            Minha produção
          </a>
          <a href="/desenvolvimento" style={{display:'flex',gap:11,alignItems:'center',width:'100%',padding:'11px 12px',borderRadius:12,background:'#202b35',color:'#d0e7e7',fontWeight:750,fontSize:13}}>
            <span className="dot-icon" aria-hidden="true" />
            Desenvolvimento
          </a>
          <button
            onClick={() => setTab('settings')}
            className={tab === 'settings' ? 'active' : ''}
          >
            <span className="dot-icon" />
            Configurações
          </button>
        </div>

        <div className="sidebar-bottom">
          <div className="status-line">
            <span className="status-dot" />
            Dados privados ativos
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <h2>
            {nav.find((item) => item[0] === tab)?.[1] ||
              'Configurações'}
          </h2>
          <div className="top-actions">
            <button
              className="btn secondary small"
              onClick={() => setAi(true)}
            >
              IA
            </button>
          </div>
        </header>

        <div className="content">
          {notice && (
            <div
              className="success"
              style={{ marginBottom: 12 }}
            >
              {notice}
            </div>
          )}

          {tab === 'today' && (
            <Today
              state={state}
              d={derived}
              insights={insights}
              setTab={setTab}
            />
          )}

          {tab === 'conversations' && (
            <Conversations
              state={state}
              onReload={load}
            />
          )}

          {tab === 'work' && <Work state={state} />}

          {tab === 'finance' && (
            <Finance state={state} d={derived} />
          )}

          {tab === 'journey' && (
            <Journey state={state} />
          )}

          {tab === 'settings' && (
            <Settings state={state} />
          )}
        </div>
      </main>

      <button
        className="fab"
        aria-label="Adicionar"
        onClick={() => setQuick(true)}
      >
        +
      </button>

      <nav className="mobile-nav">
        {nav.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={tab === key ? 'active' : ''}
          >
            {label}
          </button>
        ))}
        <a href="/producao" style={{padding:'12px 9px',color:'#d4eb99',fontWeight:750,whiteSpace:'nowrap'}}>Produção</a>
        <a href="/desenvolvimento" style={{padding:'12px 9px',color:'#d0e7e7',fontWeight:750,whiteSpace:'nowrap'}}>Dev</a>
      </nav>

      {quick && (
        <QuickCapture
          type={qtype}
          setType={setQtype}
          close={() => setQuick(false)}
          save={async (collection, record) => {
            const ok = await mutate(collection, record);
            if (ok) setQuick(false);
          }}
          busy={busy}
        />
      )}

      {ai && (
        <AIDrawerV2
          insights={insights}
          close={() => setAi(false)}
          onExecuted={load}
        />
      )}
    </div>
  );
}

function Today({
  state,
  d,
  insights,
  setTab,
}: {
  state: WorkspaceState;
  d: any;
  insights: any[];
  setTab: (tab: Tab) => void;
}) {
  const next = d.dueTasks[0];

  return (
    <>
      <section className="hero">
        <div>
          <div className="metric-label">Seu centro de comando</div>
          <h1>Hoje.</h1>
          <p>O que merece sua atenção agora, sem poluição.</p>
        </div>
      </section>

      <div className="grid">
        <div className="card span-7">
          <div className="metric-label">Agora</div>
          {next ? (
            <div style={{ marginTop: 12 }}>
              <div
                className="metric"
                style={{ fontSize: 24 }}
              >
                {next.title}
              </div>
              <div className="metric-sub">
                {next.dueAt
                  ? `Prazo ${dateLabel(next.dueAt)}`
                  : 'Sem prazo'}{' '}
                · prioridade {next.priority}
              </div>
            </div>
          ) : (
            <div
              className="empty"
              style={{ marginTop: 12 }}
            >
              Nenhuma tarefa pendente.
            </div>
          )}
        </div>

        <div className="card span-5">
          <div className="metric-label">Mês realizado</div>
          <div
            className="metric"
            style={{ marginTop: 10 }}
          >
            {brl(d.net)}
          </div>
          <div className="metric-sub">
            {brl(d.income)} entrou · {brl(d.expense)} saiu
          </div>
        </div>

        <div className="card span-3">
          <div className="metric-label">Clientes esperando</div>
          <div className="metric">{d.openConversations.length}</div>
          <button
            className="btn secondary small"
            style={{ marginTop: 12 }}
            onClick={() => setTab('conversations')}
          >
            Abrir
          </button>
        </div>

        <div className="card span-3">
          <div className="metric-label">Oportunidades</div>
          <div className="metric">{d.openOpportunities.length}</div>
          <button
            className="btn secondary small"
            style={{ marginTop: 12 }}
            onClick={() => setTab('work')}
          >
            Ver
          </button>
        </div>

        <div className="card span-3">
          <div className="metric-label">Dívida estrutural</div>
          <div
            className="metric"
            style={{ fontSize: 23 }}
          >
            {brl(d.structuralDebts)}
          </div>
          <button
            className="btn secondary small"
            style={{ marginTop: 12 }}
            onClick={() => setTab('finance')}
          >
            Finanças
          </button>
        </div>

        <div className="card span-3">
          <div className="metric-label">Caixa de Entrada</div>
          <div className="metric">{d.inboxPending.length}</div>
          <div className="metric-sub">
            informações para organizar
          </div>
        </div>

        {d.inboxPending.length > 0 && (
          <div className="card span-12">
            <h3>Últimas informações</h3>
            <div className="list">
              {d.inboxPending.slice(0, 4).map((item: any) => (
                <div
                  className="row"
                  key={item.id}
                >
                  <div className="row-main">
                    <div className="row-title">{item.text}</div>
                    <div className="row-sub">
                      {item.kind} ·{' '}
                      {certaintyLabel[item.certainty] ||
                        item.certainty}
                    </div>
                  </div>
                  <span className="badge">
                    {item.status === 'needs_review'
                      ? 'Revisar'
                      : 'Novo'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card span-12">
          <h3>Leitura inteligente</h3>
          <div className="grid">
            {insights.slice(0, 3).map((item, index) => (
              <div
                className={`insight ${item.kind} span-4`}
                key={index}
              >
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Conversations({
  state,
  onReload,
}: {
  state: WorkspaceState;
  onReload: () => Promise<void>;
}) {
  const [busyId, setBusyId] = useState('');

  async function changeMode(
    conversationId: string,
    mode: ConversationAutomationMode,
  ) {
    setBusyId(conversationId);
    await fetch('/api/whatsapp/conversation-mode', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversationId, mode }),
    });
    setBusyId('');
    await onReload();
  }

  const modeLabel: Record<ConversationAutomationMode, string> = {
    ai: 'IA ativa',
    human: 'Brito assumiu',
    suggest: 'IA sugere',
    off: 'Automação off',
  };

  return (
    <>
      <section className="hero">
        <div>
          <div className="metric-label">Atendimento</div>
          <h1>Conversas.</h1>
          <p>
            A IA atende quando estiver liberada. Quando você
            responde, ela para.
          </p>
        </div>
        <span className="badge warn">
          Meta ainda não conectada
        </span>
      </section>

      <div className="card">
        {state.conversations.length === 0 ? (
          <div className="empty">
            Ainda não há conversas sincronizadas.
          </div>
        ) : (
          <div className="list">
            {state.conversations.map((conversation) => {
              const contact = state.contacts.find(
                (item) => item.id === conversation.contactId,
              );
              const last = state.messages.find(
                (item) =>
                  item.conversationId === conversation.id,
              );

              return (
                <div
                  className="row"
                  key={conversation.id}
                >
                  <div className="row-main">
                    <div className="row-title">
                      {contact?.name || 'Contato'}
                    </div>
                    <div className="row-sub">
                      {last?.text || 'Sem mensagem'}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        gap: 6,
                        marginTop: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        className={`badge ${
                          conversation.automationMode === 'human'
                            ? 'warn'
                            : conversation.automationMode === 'ai'
                              ? 'good'
                              : ''
                        }`}
                      >
                        {modeLabel[conversation.automationMode]}
                      </span>
                      {conversation.unreadCount > 0 && (
                        <span className="badge warn">
                          {conversation.unreadCount} nova(s)
                        </span>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: 7,
                      flexWrap: 'wrap',
                      justifyContent: 'flex-end',
                    }}
                  >
                    {conversation.automationMode !== 'human' && (
                      <button
                        className="btn secondary small"
                        disabled={busyId === conversation.id}
                        onClick={() =>
                          changeMode(conversation.id, 'human')
                        }
                      >
                        Assumir
                      </button>
                    )}

                    {conversation.automationMode !== 'ai' && (
                      <button
                        className="btn small"
                        disabled={busyId === conversation.id}
                        onClick={() =>
                          changeMode(conversation.id, 'ai')
                        }
                      >
                        Devolver para IA
                      </button>
                    )}

                    {conversation.automationMode !== 'suggest' && (
                      <button
                        className="btn secondary small"
                        disabled={busyId === conversation.id}
                        onClick={() =>
                          changeMode(conversation.id, 'suggest')
                        }
                      >
                        Só sugerir
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function Work({ state }: { state: WorkspaceState }) {
  const [view, setView] = useState<
    'pipeline' | 'clients' | 'projects' | 'method'
  >('pipeline');

  return (
    <>
      <section className="hero">
        <div>
          <div className="metric-label">CRM + execução</div>
          <h1>Trabalho.</h1>
          <p>
            Cliente, experiência, produção e aprendizado no mesmo
            lugar.
          </p>
        </div>
      </section>

      <div className="toolbar">
        <div className="segmented">
          {[
            ['pipeline', 'Pipeline'],
            ['clients', 'Clientes'],
            ['projects', 'Projetos'],
            ['method', 'Método de vídeo'],
          ].map(([key, label]) => (
            <button
              key={key}
              className={view === key ? 'active' : ''}
              onClick={() =>
                setView(key as typeof view)
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === 'pipeline' && (
        <div className="grid">
          {(
            [
              'new',
              'qualifying',
              'proposal',
              'negotiation',
              'won',
            ] as const
          ).map((stage) => (
            <div
              className="card span-4"
              key={stage}
            >
              <h3>
                {
                  {
                    new: 'Novas',
                    qualifying: 'Qualificando',
                    proposal: 'Proposta',
                    negotiation: 'Negociação',
                    won: 'Fechadas',
                  }[stage]
                }
              </h3>
              <div className="list">
                {state.opportunities
                  .filter((item) => item.stage === stage)
                  .map((item) => (
                    <div
                      className="row"
                      key={item.id}
                    >
                      <div>
                        <div className="row-title">
                          {item.title}
                        </div>
                        <div className="row-sub">
                          {item.estimatedValueCents
                            ? brl(item.estimatedValueCents)
                            : 'Sem valor'}
                          {item.certainty
                            ? ` · ${certaintyLabel[item.certainty] || item.certainty}`
                            : ''}
                          {item.nextAction
                            ? ` · ${item.nextAction}`
                            : ''}
                        </div>
                      </div>
                    </div>
                  ))}

                {!state.opportunities.some(
                  (item) => item.stage === stage,
                ) && <div className="empty">Vazio</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'clients' && (
        <div className="card">
          {state.contacts.length ? (
            <div className="list">
              {state.contacts.map((contact) => {
                const experiences = state.clientExperiences
                  .filter((item) =>
                    item.contactId === contact.id ||
                    (!item.contactId &&
                      item.clientLabel.trim().toLocaleLowerCase('pt-BR') ===
                      contact.name.trim().toLocaleLowerCase('pt-BR')),
                  )
                  .sort((a, b) =>
                    b.occurredOn.localeCompare(a.occurredOn) ||
                    b.updatedAt.localeCompare(a.updatedAt),
                  );
                const last = experiences[0];

                return (
                  <div
                    className="row"
                    key={contact.id}
                  >
                    <div className="row-main">
                      <div className="row-title">
                        {contact.name}
                      </div>
                      <div className="row-sub">
                        {contact.phone ||
                          contact.email ||
                          contact.company ||
                          'Sem contato'}{' '}
                        · {contact.lifecycle}
                      </div>
                      {last?.learnedRule && (
                        <div
                          className="row-sub"
                          style={{ marginTop: 7 }}
                        >
                          Aprendizado recente: {last.learnedRule}
                        </div>
                      )}
                      {experiences.length > 0 && (
                        <details style={{ marginTop: 12 }}>
                          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                            Minha evolução com este cliente ({experiences.length})
                          </summary>
                          <div className="list" style={{ marginTop: 10 }}>
                            {experiences.map((entry) => (
                              <div className="row" key={entry.id}>
                                <div className="row-main">
                                  <div className="row-title">
                                    {entry.occurredOn} · Etapa do relacionamento
                                  </div>
                                  <div className="row-sub">{entry.whatHappened}</div>
                                  {entry.whatWorked && (
                                    <div className="row-sub">
                                      <strong>Acerto:</strong> {entry.whatWorked}
                                    </div>
                                  )}
                                  {entry.whatFailed && (
                                    <div className="row-sub">
                                      <strong>O que melhorar:</strong> {entry.whatFailed}
                                    </div>
                                  )}
                                  {entry.learnedRule && (
                                    <div className="row-sub">
                                      <strong>Regra aprendida:</strong> {entry.learnedRule}
                                    </div>
                                  )}
                                  {entry.nextAction && (
                                    <div className="row-sub">
                                      <strong>Próxima ação:</strong> {entry.nextAction}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span className="badge">
                        {experiences.length} experiência(s)
                      </span>
                      {contact.nextAction && (
                        <div className="row-sub">
                          {contact.nextAction}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty">
              Nenhum cliente ainda.
            </div>
          )}
        </div>
      )}

      {view === 'projects' && (
        <div className="card">
          {state.projects.length ? (
            <div className="list">
              {state.projects.map((project) => {
                const contact = state.contacts.find(
                  (item) => item.id === project.contactId,
                );
                return (
                  <div
                    className="row"
                    key={project.id}
                  >
                    <div>
                      <div className="row-title">
                        {project.name}
                      </div>
                      <div className="row-sub">
                        {contact?.name
                          ? `${contact.name} · `
                          : ''}
                        {project.dueDate
                          ? `Prazo ${dateLabel(project.dueDate)}`
                          : 'Sem prazo'}
                        {' · '}
                        {project.budgetCents
                          ? brl(project.budgetCents)
                          : 'sem orçamento fechado'}
                      </div>
                      {project.nextAction && (
                        <div className="row-sub">
                          Próximo: {project.nextAction}
                        </div>
                      )}
                    </div>
                    <span className="badge">
                      {project.status}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty">
              Projetos aparecerão aqui.
            </div>
          )}
        </div>
      )}

      {view === 'method' && (
        <>
          <div className="card">
            <div className="metric-label">Regra principal</div>
            <div
              className="metric"
              style={{ fontSize: 24, marginTop: 9 }}
            >
              {CINEMA_DECISION_RULE}
            </div>
            <p
              style={{
                color: 'var(--muted)',
                lineHeight: 1.6,
              }}
            >
              Primeiro descubra o que a cena precisa contar. Só
              depois escolha onde a câmera fica e se ela precisa
              mover.
            </p>
          </div>

          <div
            className="grid"
            style={{ marginTop: 16 }}
          >
            {VIDEO_PROFESSIONAL_METHOD.map((section) => (
              <div
                className="card span-6"
                key={section.key}
              >
                <h3>{section.title}</h3>
                <div className="list">
                  {section.questions.map((question) => (
                    <div
                      className="row"
                      key={question}
                    >
                      <div className="row-sub">
                        {question}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div
            className="card"
            style={{ marginTop: 16 }}
          >
            <h3>Padrões que a Jornada aprendeu</h3>
            {state.professionalPatterns.filter(
              (item) => item.status === 'active',
            ).length ? (
              <div className="list">
                {state.professionalPatterns
                  .filter((item) => item.status === 'active')
                  .slice(0, 12)
                  .map((pattern) => (
                    <div
                      className="row"
                      key={pattern.id}
                    >
                      <div className="row-main">
                        <div className="row-title">
                          {pattern.title}
                        </div>
                        <div className="row-sub">
                          {pattern.summary}
                        </div>
                        {pattern.recommendation && (
                          <div
                            className="row-sub"
                            style={{ marginTop: 6 }}
                          >
                            Próxima regra: {pattern.recommendation}
                          </div>
                        )}
                      </div>
                      <span className="badge">
                        {pattern.evidenceCount} evidência(s)
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="empty">
                A Jornada começa a mostrar padrões quando existir
                repetição suficiente no histórico. Um caso isolado
                não vira regra.
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

function Finance({
  state,
  d,
}: {
  state: WorkspaceState;
  d: any;
}) {
  const [view, setView] = useState<
    | 'overview'
    | 'transactions'
    | 'debts'
    | 'receivables'
    | 'obligations'
  >('overview');

  const hasCashBalance = state.financialAccounts.some(
    (account) =>
      account.active && ['cash', 'bank', 'wallet'].includes(account.type),
  );
  const availableBalance = d.bankCash - d.obligations;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const dueSoonThrough = new Date(today);
  dueSoonThrough.setDate(dueSoonThrough.getDate() + 30);
  const upcomingObligations = state.obligations
    .filter((item) => {
      if (item.status !== 'planned' || !item.dueDate) return false;
      const due = new Date(`${item.dueDate.slice(0, 10)}T12:00:00`);
      return due <= dueSoonThrough;
    })
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  const obligationsWithoutDueDate = state.obligations.filter(
    (item) => item.status === 'planned' && !item.dueDate,
  ).length;

  return (
    <>
      <section className="hero">
        <div>
          <div className="metric-label">Dinheiro com contexto</div>
          <h1>Finanças.</h1>
          <p>
            Caixa é caixa. Limite é limite. Promessa não é dinheiro
            recebido.
          </p>
        </div>
      </section>

      <div className="grid">
        <div className="card span-4">
          <div className="metric-label">Saldo disponível após contas</div>
          <div className="metric">
            {hasCashBalance ? brl(availableBalance) : 'Sem saldo cadastrado'}
          </div>
          <div className="metric-sub">
            {hasCashBalance
              ? `${brl(d.bankCash)} em bancos/dinheiro − ${brl(d.obligations)} em contas planejadas`
              : 'Cadastre um saldo para calcular o valor disponível.'}
          </div>
        </div>
        <div className="card span-4">
          <div className="metric-label">Resgatável separado</div>
          <div className="metric">{brl(d.rescuable)}</div>
        </div>
        <div className="card span-4">
          <div className="metric-label">Contas reservadas</div>
          <div className="metric">{brl(d.obligations)}</div>
          {d.obligationsInReview > 0 && (
            <div className="metric-sub">
              {brl(d.obligationsInReview)} separado para revisão
            </div>
          )}
        </div>
        <div className="card span-4">
          <div className="metric-label">Dívida estrutural</div>
          <div className="metric">{brl(d.structuralDebts)}</div>
        </div>
        <div className="card span-4">
          <div className="metric-label">A receber confirmado</div>
          <div className="metric">{brl(d.confirmedReceivables)}</div>
        </div>
        <div className="card span-4">
          <div className="metric-label">Estimativas / previsões</div>
          <div className="metric">{brl(d.estimatedReceivables)}</div>
        </div>
      </div>

      <div
        className="toolbar"
        style={{ marginTop: 18 }}
      >
        <div className="segmented">
          {[
            ['overview', 'Resumo'],
            ['transactions', 'Movimentações'],
            ['debts', 'Dívidas'],
            ['receivables', 'A receber'],
            ['obligations', 'Contas'],
          ].map(([key, label]) => (
            <button
              key={key}
              className={view === key ? 'active' : ''}
              onClick={() =>
                setView(key as typeof view)
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === 'overview' && (
        <>
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Resumo realizado deste mês</h3>
          <div className="grid">
            <div className="span-4">
              <div className="metric-label">Entrou</div>
              <div className="metric">{brl(d.income)}</div>
            </div>
            <div className="span-4">
              <div className="metric-label">Saiu</div>
              <div className="metric">{brl(d.expense)}</div>
            </div>
            <div className="span-4">
              <div className="metric-label">Resultado</div>
              <div className="metric">{brl(d.net)}</div>
            </div>
          </div>
          {!d.hasClearedMonthActivity && (
            <div className="metric-sub">
              Ainda não há movimentações confirmadas neste mês.
            </div>
          )}
          {(d.plannedIncome > 0 || d.plannedExpense > 0) && (
            <div className="metric-sub">
              Em previsão: {brl(d.plannedIncome)} para entrar · {brl(d.plannedExpense)} para sair. Não incluído no resultado realizado.
            </div>
          )}
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Contas próximas — 30 dias</h3>
          {upcomingObligations.length ? (
            <div className="list">
              {upcomingObligations.map((item) => {
                const isOverdue = new Date(`${item.dueDate!.slice(0, 10)}T12:00:00`) < today;
                return (
                  <div className="row" key={item.id}>
                    <div>
                      <div className="row-title">{item.title}</div>
                      <div className="row-sub">
                        {item.kind} · {isOverdue ? 'Vencida' : `Vence ${dateLabel(item.dueDate)}`}
                      </div>
                    </div>
                    <strong>{brl(item.amountCents)}</strong>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty">Nenhuma conta planejada com vencimento nos próximos 30 dias.</div>
          )}
          {obligationsWithoutDueDate > 0 && (
            <div className="metric-sub">
              {obligationsWithoutDueDate} conta(s) planejada(s) sem data de vencimento.
            </div>
          )}
        </div>

        <div className="card">
          <h3>Contas e saldos registrados</h3>
          {state.financialAccounts.length ? (
            <div className="list">
              {state.financialAccounts.map((account) => (
                <div
                  className="row"
                  key={account.id}
                >
                  <div>
                    <div className="row-title">
                      {account.name}
                    </div>
                    <div className="row-sub">
                      {account.type}
                      {account.balanceAsOf
                        ? ` · posição de ${dateLabel(account.balanceAsOf)}`
                        : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong>
                      {brl(
                        account.currentBalanceCents ??
                          account.openingBalanceCents,
                      )}
                    </strong>
                    {!!account.rescuableBalanceCents && (
                      <div className="row-sub">
                        {brl(account.rescuableBalanceCents)} resgatável
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              Os saldos reais serão carregados na migração privada.
            </div>
          )}
        </div>
        </>
      )}

      {view === 'transactions' && (
        <div className="card">
          {state.transactions.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th>Situação</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {state.transactions.slice(0, 50).map((item) => (
                  <tr key={item.id}>
                    <td>{dateLabel(item.occurredOn)}</td>
                    <td>{item.description}</td>
                    <td>{item.category || '—'}</td>
                    <td>
                      {item.status === 'cleared'
                        ? 'Confirmada'
                        : item.status === 'planned'
                          ? 'Prevista'
                          : 'Cancelada'}
                    </td>
                    <td style={{ fontWeight: 800 }}>
                      {item.type === 'expense' ? '- ' : '+ '}
                      {brl(item.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">
              Nenhuma movimentação registrada.
            </div>
          )}
        </div>
      )}

      {view === 'debts' && (
        <div className="card">
          {state.debts.length ? (
            <div className="list">
              {state.debts.map((debt) => (
                <div
                  className="row"
                  key={debt.id}
                >
                  <div>
                    <div className="row-title">
                      {debt.creditorName}
                    </div>
                    <div className="row-sub">
                      Original {brl(debt.originalAmountCents)}
                      {debt.paidAmountCents !== undefined
                        ? ` · pago ${brl(debt.paidAmountCents)}`
                        : ''}
                      {debt.structural === false
                        ? ' · obrigação separada'
                        : ' · dívida estrutural'}
                    </div>
                    {debt.nextAction && (
                      <div className="row-sub">
                        Próximo: {debt.nextAction}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong>{brl(debt.currentBalanceCents)}</strong>
                    <div>
                      <span
                        className={`badge ${
                          debt.status === 'settled'
                            ? 'good'
                            : debt.status === 'active'
                              ? 'warn'
                              : ''
                        }`}
                      >
                        {debt.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              Nenhuma dívida cadastrada.
            </div>
          )}
        </div>
      )}

      {view === 'receivables' && (
        <div className="card">
          {state.receivables.length ? (
            <div className="list">
              {state.receivables.map((item) => (
                <div
                  className="row"
                  key={item.id}
                >
                  <div>
                    <div className="row-title">
                      {item.title}
                    </div>
                    <div className="row-sub">
                      {certaintyLabel[item.certainty]}
                      {item.expectedOn
                        ? ` · esperado ${dateLabel(item.expectedOn)}`
                        : item.expectedWindow
                          ? ` · ${item.expectedWindow}`
                          : ''}
                    </div>
                    {item.nextAction && (
                      <div className="row-sub">
                        Próximo: {item.nextAction}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong>
                      {item.amountCents
                        ? brl(item.amountCents)
                        : 'Valor não fechado'}
                    </strong>
                    <div>
                      <span
                        className={`badge ${
                          item.certainty === 'confirmed'
                            ? 'good'
                            : 'warn'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              Nenhum valor a receber.
            </div>
          )}
        </div>
      )}

      {view === 'obligations' && (
        <div className="card">
          {state.obligations.length ? (
            <div className="list">
              {state.obligations.map((item) => (
                <div
                  className="row"
                  key={item.id}
                >
                  <div>
                    <div className="row-title">
                      {item.title}
                    </div>
                    <div className="row-sub">
                      {item.kind}
                      {item.dueDate
                        ? ` · vence ${dateLabel(item.dueDate)}`
                        : ''}
                      {item.recurring ? ' · recorrente' : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong>{brl(item.amountCents)}</strong>
                    <div>
                      <span className="badge">
                        {item.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              Nenhuma obrigação futura.
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Journey({ state }: { state: WorkspaceState }) {
  const [view, setView] = useState<'goals' | 'study'>('study');

  return (
    <>
      <section className="hero">
        <div>
          <div className="metric-label">Direção + evolução</div>
          <h1>Jornada.</h1>
          <p>
            Vida, objetivos e evolução profissional medidos com fatos.
          </p>
        </div>
      </section>

      <div className="toolbar">
        <div className="segmented">
          <button
            className={view === 'study' ? 'active' : ''}
            onClick={() => setView('study')}
          >
            Audiovisual
          </button>
          <button
            className={view === 'goals' ? 'active' : ''}
            onClick={() => setView('goals')}
          >
            Objetivos
          </button>
        </div>
      </div>

      {view === 'study' ? (
        <StudyPanel
          areas={state.studyAreas}
          events={state.studyEvents}
        />
      ) : (
        <GoalsPanel state={state} />
      )}
    </>
  );
}

function StudyPanel({
  areas,
  events,
}: {
  areas: StudyArea[];
  events: StudyEvent[];
}) {
  const current =
    areas.find((item) => item.status === 'current') ||
    areas.find((item) => item.status === 'training');

  const detailedSkills = areas.filter(
    (item) => item.order >= 100,
  );
  const consolidated = (
    detailedSkills.length ? detailedSkills : areas
  ).filter((item) => item.status === 'consolidated').length;

  const best = events.reduce<StudyEvent | null>((winner, item) => {
    const value = item.scoreAfter ?? item.score;
    if (!winner) return item;
    const bestValue = winner.scoreAfter ?? winner.score;
    return value > bestValue ? item : winner;
  }, null);

  return (
    <>
      <div className="grid">
        <div className="card span-4">
          <div className="metric-label">Nível atual</div>
          <div
            className="metric"
            style={{ fontSize: 22 }}
          >
            Nível 1
          </div>
          <div className="metric-sub">
            Reconstrução do olhar
          </div>
        </div>

        <div className="card span-4">
          <div className="metric-label">Habilidade atual</div>
          <div
            className="metric"
            style={{ fontSize: 22 }}
          >
            {current?.label || 'Headroom + lead room'}
          </div>
          <div className="metric-sub">
            foco do próximo treino
          </div>
        </div>

        <div className="card span-4">
          <div className="metric-label">Consolidadas</div>
          <div className="metric">{consolidated}</div>
          <div className="metric-sub">
            {best
              ? `melhor registro: ${best.take || best.skill} · ${best.scoreAfter ?? best.score}`
              : 'aguardando histórico'}
          </div>
        </div>

        <div className="card span-6">
          <h3>Mapa das habilidades</h3>
          <RadarChart areas={areas} />
        </div>

        <div className="card span-6">
          <h3>Evolução das notas</h3>
          <StudyLineChart events={events} />
        </div>

        <div className="card span-12">
          <h3>Habilidades</h3>
          {areas.length ? (
            <div className="list">
              {[...(detailedSkills.length ? detailedSkills : areas)]
                .sort((a, b) => a.order - b.order)
                .map((area) => (
                  <div
                    className="row"
                    key={area.id}
                  >
                    <div>
                      <div className="row-title">
                        {area.label}
                      </div>
                      <div className="row-sub">
                        Meta {area.targetScore.toFixed(1)}
                        {area.notes ? ` · ${area.notes}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <strong>
                        {area.currentScore.toFixed(1)}
                      </strong>
                      <div>
                        <span
                          className={`badge ${
                            area.status === 'consolidated'
                              ? 'good'
                              : area.status === 'current'
                                ? 'warn'
                                : ''
                          }`}
                        >
                          {area.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="empty">
              O histórico do treinamento será carregado na migração
              privada.
            </div>
          )}
        </div>

        <div className="card span-12">
          <h3>Histórico dos exercícios</h3>
          {events.length ? (
            <div className="list">
              {events.slice(0, 30).map((event) => (
                <div
                  className="row"
                  key={event.id}
                >
                  <div className="row-main">
                    <div className="row-title">
                      {event.skill}
                      {event.take ? ` · ${event.take}` : ''}
                    </div>
                    <div className="row-sub">
                      {dateLabel(event.occurredOn)} ·{' '}
                      {event.exercise}
                    </div>
                    {event.mainError && (
                      <div className="row-sub">
                        Erro: {event.mainError}
                      </div>
                    )}
                    {event.correction && (
                      <div className="row-sub">
                        Correção: {event.correction}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong>{event.score.toFixed(1)}</strong>
                    {event.scoreAfter !== undefined && (
                      <div className="row-sub">
                        → {event.scoreAfter.toFixed(1)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              Nenhum exercício registrado ainda.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function RadarChart({ areas }: { areas: StudyArea[] }) {
  const principalAreas = areas.filter(
    (item) => item.order < 100,
  );
  const items = [...(principalAreas.length ? principalAreas : areas)]
    .sort((a, b) => a.order - b.order)
    .slice(0, 7);

  if (items.length < 3) {
    return (
      <div className="empty">
        O gráfico aparece quando as áreas do treinamento forem
        importadas.
      </div>
    );
  }

  const size = 340;
  const center = size / 2;
  const radius = 105;
  const point = (index: number, scale: number) => {
    const angle =
      -Math.PI / 2 + (Math.PI * 2 * index) / items.length;
    return {
      x: center + Math.cos(angle) * radius * scale,
      y: center + Math.sin(angle) * radius * scale,
      angle,
    };
  };

  const polygon = (scale: number) =>
    items
      .map((_, index) => {
        const p = point(index, scale);
        return `${p.x},${p.y}`;
      })
      .join(' ');

  const dataPoints = items
    .map((item, index) => {
      const p = point(
        index,
        Math.max(0, Math.min(10, item.currentScore)) / 10,
      );
      return `${p.x},${p.y}`;
    })
    .join(' ');

  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Gráfico radar de habilidades"
      >
        {[0.25, 0.5, 0.75, 1].map((scale) => (
          <polygon
            key={scale}
            points={polygon(scale)}
            fill="none"
            stroke="rgba(148,160,173,.23)"
            strokeWidth="1"
          />
        ))}

        {items.map((_, index) => {
          const p = point(index, 1);
          return (
            <line
              key={index}
              x1={center}
              y1={center}
              x2={p.x}
              y2={p.y}
              stroke="rgba(148,160,173,.18)"
            />
          );
        })}

        <polygon
          points={dataPoints}
          fill="rgba(232,255,114,.16)"
          stroke="var(--accent)"
          strokeWidth="2"
        />

        {items.map((item, index) => {
          const p = point(index, 1.2);
          const anchor =
            Math.cos(p.angle) > 0.25
              ? 'start'
              : Math.cos(p.angle) < -0.25
                ? 'end'
                : 'middle';
          return (
            <text
              key={item.id}
              x={p.x}
              y={p.y}
              textAnchor={anchor}
              dominantBaseline="middle"
              fill="var(--muted)"
              fontSize="9"
            >
              {item.label.length > 19
                ? item.label.slice(0, 17) + '…'
                : item.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function StudyLineChart({ events }: { events: StudyEvent[] }) {
  const items = [...events]
    .sort((a, b) =>
      a.occurredOn.localeCompare(b.occurredOn),
    )
    .slice(-24);

  if (items.length < 2) {
    return (
      <div className="empty">
        A linha aparece quando houver pelo menos dois exercícios.
      </div>
    );
  }

  const width = 620;
  const height = 260;
  const left = 36;
  const top = 20;
  const innerWidth = width - 60;
  const innerHeight = height - 55;

  const pts = items.map((item, index) => {
    const score = item.scoreAfter ?? item.score;
    const x =
      left +
      (innerWidth * index) /
        Math.max(1, items.length - 1);
    const y =
      top + innerHeight * (1 - Math.max(0, Math.min(10, score)) / 10);
    return { x, y, item, score };
  });

  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Evolução das notas do treinamento"
      >
        {[0, 2, 4, 6, 8, 10].map((value) => {
          const y =
            top + innerHeight * (1 - value / 10);
          return (
            <g key={value}>
              <line
                x1={left}
                y1={y}
                x2={left + innerWidth}
                y2={y}
                stroke="rgba(148,160,173,.15)"
              />
              <text
                x={left - 9}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fill="var(--muted)"
                fontSize="10"
              >
                {value}
              </text>
            </g>
          );
        })}

        <polyline
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
          points={pts
            .map((point) => `${point.x},${point.y}`)
            .join(' ')}
        />

        {pts.map((point, index) => (
          <g key={point.item.id}>
            <circle
              cx={point.x}
              cy={point.y}
              r="4"
              fill="var(--accent)"
            />
            {(index === 0 ||
              index === pts.length - 1 ||
              point.score >= 9) && (
              <text
                x={point.x}
                y={point.y - 10}
                textAnchor="middle"
                fill="var(--text)"
                fontSize="10"
              >
                {point.score.toFixed(1)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

function GoalsPanel({ state }: { state: WorkspaceState }) {
  return (
    <>
      <div className="grid">
        {state.goals.map((goal) => {
          const progress = goal.targetValue
            ? Math.min(
                100,
                Math.round(
                  ((goal.currentValue || 0) / goal.targetValue) *
                    100,
                ),
              )
            : 0;

          return (
            <div
              className="card span-6"
              key={goal.id}
            >
              <div className="metric-label">
                {goal.ambition || 'Objetivo'}
              </div>
              <h3
                style={{
                  fontSize: 22,
                  marginTop: 8,
                }}
              >
                {goal.title}
              </h3>

              {goal.why && (
                <p
                  style={{
                    color: 'var(--muted)',
                    lineHeight: 1.5,
                  }}
                >
                  {goal.why}
                </p>
              )}

              {goal.targetValue !== undefined && (
                <>
                  <div
                    style={{
                      height: 8,
                      background: '#242b33',
                      borderRadius: 99,
                      overflow: 'hidden',
                      margin: '18px 0 8px',
                    }}
                  >
                    <div
                      style={{
                        width: `${progress}%`,
                        height: '100%',
                        background: 'var(--accent)',
                      }}
                    />
                  </div>
                  <div className="row-sub">
                    {goal.currentValue || 0} / {goal.targetValue} ·{' '}
                    {progress}%
                  </div>
                </>
              )}
            </div>
          );
        })}

        {state.goals.length === 0 && (
          <div className="card span-12">
            <div className="empty">
              Nenhum objetivo ainda.
            </div>
          </div>
        )}
      </div>

      <div
        className="card"
        style={{ marginTop: 16 }}
      >
        <h3>Missões atuais</h3>
        {state.tasks.filter(
          (item) =>
            item.goalId &&
            !['done', 'cancelled'].includes(item.status),
        ).length ? (
          <div className="list">
            {state.tasks
              .filter(
                (item) =>
                  item.goalId &&
                  !['done', 'cancelled'].includes(item.status),
              )
              .map((item) => (
                <div
                  className="row"
                  key={item.id}
                >
                  <div>
                    <div className="row-title">
                      {item.title}
                    </div>
                    <div className="row-sub">
                      {item.dueAt
                        ? `Prazo ${dateLabel(item.dueAt)}`
                        : 'Sem prazo'}
                    </div>
                  </div>
                  <span className="badge">
                    {item.priority}
                  </span>
                </div>
              ))}
          </div>
        ) : (
          <div className="empty">
            Nenhuma missão ligada a objetivo.
          </div>
        )}
      </div>
    </>
  );
}

function Settings({ state }: { state: WorkspaceState }) {
  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    location.href = '/login';
  }

  return (
    <>
      <section className="hero">
        <div>
          <div className="metric-label">Controle</div>
          <h1>Configurações.</h1>
          <p>Saúde, backup e integrações.</p>
        </div>
      </section>

      <div className="grid">
        <div className="card span-6">
          <h3>Dados</h3>
          <div className="row">
            <div>
              <div className="row-title">
                Armazenamento privado
              </div>
              <div className="row-sub">
                Vercel Blob · região Brasil
              </div>
            </div>
            <span className="badge good">Ativo</span>
          </div>

          <div className="row">
            <div>
              <div className="row-title">Backup manual</div>
              <div className="row-sub">
                Exporte todos os seus dados em JSON.
              </div>
            </div>
            <a
              className="btn secondary small"
              href="/api/export"
            >
              Baixar
            </a>
          </div>
        </div>

        <WhatsAppSettingsCard />

        <GroqSettings />

        <AiLearningSettingsCard />

        <PasswordSettings />

        <div className="card span-12">
          <h3>Conta</h3>
          <div className="row">
            <div>
              <div className="row-title">
                {state.profile.displayName}
              </div>
              <div className="row-sub">
                {state.profile.locale} · {state.profile.timezone}
              </div>
            </div>
            <button
              className="btn danger small"
              onClick={logout}
            >
              Sair
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function QuickCapture({
  type,
  setType,
  close,
  save,
  busy,
}: {
  type: QuickType;
  setType: (type: QuickType) => void;
  close: () => void;
  save: (collection: string, record: any) => Promise<void>;
  busy: boolean;
}) {
  const [form, setForm] = useState<Record<string, string>>({});

  function value(key: string) {
    return form[key] || '';
  }

  function set(key: string, next: string) {
    setForm((current) => ({
      ...current,
      [key]: next,
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const now = new Date().toISOString();

    if (type === 'contact') {
      await save('contacts', {
        name: value('name'),
        phone: value('phone'),
        email: value('email'),
        company: value('company'),
        lifecycle: 'prospect',
        source: 'Manual',
      });
    }

    if (type === 'expense' || type === 'income') {
      await save('transactions', {
        type,
        amountCents: moneyToCents(value('amount')),
        occurredOn: value('date') || now.slice(0, 10),
        category: value('category'),
        description: value('description'),
        status: 'cleared',
        certainty: 'confirmed',
      });
    }

    if (type === 'debt') {
      await save('debts', {
        creditorName: value('name'),
        description: value('description'),
        originalAmountCents: moneyToCents(value('amount')),
        currentBalanceCents: moneyToCents(
          value('balance') || value('amount'),
        ),
        dueDate: value('date') || undefined,
        status: 'active',
        structural: true,
      });
    }

    if (type === 'task') {
      await save('tasks', {
        title: value('title'),
        status: 'todo',
        priority: value('priority') || 'medium',
        dueAt: value('date')
          ? `${value('date')}T12:00:00.000Z`
          : undefined,
      });
    }

    if (type === 'goal') {
      await save('goals', {
        title: value('title'),
        ambition: value('ambition'),
        why: value('why'),
        targetValue: value('target')
          ? Number(value('target'))
          : undefined,
        currentValue: 0,
        targetDate: value('date') || undefined,
        status: 'active',
      });
    }

    if (type === 'inbox') {
      await save('inbox', {
        text: value('text'),
        kind: value('kind') || 'other',
        certainty: value('certainty') || 'pending',
        status: 'new',
        occurredOn: value('date') || undefined,
        recordedAt: now,
        nextAction: value('nextAction') || undefined,
        sourceText: value('text'),
      });
    }

    if (type === 'study') {
      await save('studyEvents', {
        occurredOn: value('date') || now.slice(0, 10),
        skill: value('skill'),
        exercise: value('exercise'),
        take: value('take') || undefined,
        score: Number(value('score')),
        mainError: value('mainError') || undefined,
        correction: value('correction') || undefined,
        observation: value('observation') || undefined,
        redone: false,
      });
    }

    if (type === 'experience') {
      await save('clientExperiences', {
        clientLabel: value('client'),
        workLabel: value('work') || undefined,
        occurredOn: value('date') || now.slice(0, 10),
        whatHappened: value('whatHappened'),
        whatWorked: value('whatWorked') || undefined,
        whatFailed: value('whatFailed') || undefined,
        learnedRule: value('learnedRule') || undefined,
        nextAction: value('nextAction') || undefined,
      });
    }
  }

  const labels: Record<QuickType, string> = {
    contact: 'Cliente',
    expense: 'Gasto',
    income: 'Entrada',
    debt: 'Dívida',
    task: 'Tarefa',
    goal: 'Objetivo',
    inbox: 'Anotação',
    study: 'Estudo',
    experience: 'Experiência',
  };

  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={submit}
      >
        <div className="modal-head">
          <div>
            <div className="metric-label">Captura rápida</div>
            <h2>Registrar</h2>
          </div>
          <button
            className="close"
            type="button"
            onClick={close}
          >
            ×
          </button>
        </div>

        <div className="quick-types">
          {(Object.keys(labels) as QuickType[]).map((key) => (
            <button
              type="button"
              key={key}
              className={type === key ? 'active' : ''}
              onClick={() => {
                setType(key);
                setForm({});
              }}
            >
              {labels[key]}
            </button>
          ))}
        </div>

        {type === 'contact' && (
          <div className="form-grid">
            <F
              label="Nome"
              value={value('name')}
              set={(next) => set('name', next)}
              req
            />
            <F
              label="WhatsApp/telefone"
              value={value('phone')}
              set={(next) => set('phone', next)}
            />
            <F
              label="E-mail"
              value={value('email')}
              set={(next) => set('email', next)}
            />
            <F
              label="Empresa"
              value={value('company')}
              set={(next) => set('company', next)}
            />
          </div>
        )}

        {(type === 'expense' || type === 'income') && (
          <div className="form-grid">
            <F
              label="Valor (R$)"
              value={value('amount')}
              set={(next) => set('amount', next)}
              req
            />
            <F
              label="Data"
              type="date"
              value={value('date')}
              set={(next) => set('date', next)}
            />
            <F
              label="Categoria"
              value={value('category')}
              set={(next) => set('category', next)}
            />
            <F
              label="Descrição"
              value={value('description')}
              set={(next) => set('description', next)}
              req
            />
          </div>
        )}

        {type === 'debt' && (
          <div className="form-grid">
            <F
              label="Quem você deve"
              value={value('name')}
              set={(next) => set('name', next)}
              req
            />
            <F
              label="Valor original (R$)"
              value={value('amount')}
              set={(next) => set('amount', next)}
              req
            />
            <F
              label="Saldo atual (R$)"
              value={value('balance')}
              set={(next) => set('balance', next)}
            />
            <F
              label="Vencimento"
              type="date"
              value={value('date')}
              set={(next) => set('date', next)}
            />
            <div className="field full">
              <label>Observação</label>
              <textarea
                className="textarea"
                value={value('description')}
                onChange={(event) =>
                  set('description', event.target.value)
                }
              />
            </div>
          </div>
        )}

        {type === 'task' && (
          <div className="form-grid">
            <F
              label="O que precisa ser feito"
              value={value('title')}
              set={(next) => set('title', next)}
              req
            />
            <F
              label="Prazo"
              type="date"
              value={value('date')}
              set={(next) => set('date', next)}
            />
            <div className="field full">
              <label>Prioridade</label>
              <select
                className="select"
                value={value('priority') || 'medium'}
                onChange={(event) =>
                  set('priority', event.target.value)
                }
              >
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
              </select>
            </div>
          </div>
        )}

        {type === 'goal' && (
          <div className="form-grid">
            <F
              label="Objetivo"
              value={value('title')}
              set={(next) => set('title', next)}
              req
            />
            <F
              label="Ambição maior"
              value={value('ambition')}
              set={(next) => set('ambition', next)}
            />
            <F
              label="Meta numérica"
              type="number"
              value={value('target')}
              set={(next) => set('target', next)}
            />
            <F
              label="Prazo"
              type="date"
              value={value('date')}
              set={(next) => set('date', next)}
            />
            <div className="field full">
              <label>Por que isso importa?</label>
              <textarea
                className="textarea"
                value={value('why')}
                onChange={(event) =>
                  set('why', event.target.value)
                }
              />
            </div>
          </div>
        )}

        {type === 'inbox' && (
          <div className="form-grid">
            <div className="field full">
              <label>O que aconteceu?</label>
              <textarea
                className="textarea"
                value={value('text')}
                onChange={(event) =>
                  set('text', event.target.value)
                }
                required
              />
            </div>
            <div className="field">
              <label>Tipo</label>
              <select
                className="select"
                value={value('kind') || 'other'}
                onChange={(event) =>
                  set('kind', event.target.value)
                }
              >
                <option value="client">Cliente</option>
                <option value="finance">Financeiro</option>
                <option value="study">Estudo</option>
                <option value="project">Projeto</option>
                <option value="task">Tarefa</option>
                <option value="goal">Objetivo</option>
                <option value="personal">Pessoal</option>
                <option value="other">Outro</option>
              </select>
            </div>
            <div className="field">
              <label>Certeza</label>
              <select
                className="select"
                value={value('certainty') || 'pending'}
                onChange={(event) =>
                  set('certainty', event.target.value)
                }
              >
                <option value="confirmed">Confirmado</option>
                <option value="estimate">Estimativa</option>
                <option value="forecast">Previsão</option>
                <option value="pending">Pendente</option>
                <option value="interpretation">
                  Interpretação
                </option>
              </select>
            </div>
            <F
              label="Data do fato"
              type="date"
              value={value('date')}
              set={(next) => set('date', next)}
            />
            <F
              label="Próxima ação"
              value={value('nextAction')}
              set={(next) => set('nextAction', next)}
            />
          </div>
        )}

        {type === 'study' && (
          <div className="form-grid">
            <F
              label="Habilidade"
              value={value('skill')}
              set={(next) => set('skill', next)}
              req
            />
            <F
              label="Exercício"
              value={value('exercise')}
              set={(next) => set('exercise', next)}
              req
            />
            <F
              label="Take"
              value={value('take')}
              set={(next) => set('take', next)}
            />
            <F
              label="Nota 0–10"
              type="number"
              value={value('score')}
              set={(next) => set('score', next)}
              req
            />
            <F
              label="Data"
              type="date"
              value={value('date')}
              set={(next) => set('date', next)}
            />
            <F
              label="Erro principal"
              value={value('mainError')}
              set={(next) => set('mainError', next)}
            />
            <div className="field full">
              <label>Correção</label>
              <textarea
                className="textarea"
                value={value('correction')}
                onChange={(event) =>
                  set('correction', event.target.value)
                }
              />
            </div>
            <div className="field full">
              <label>Observação</label>
              <textarea
                className="textarea"
                value={value('observation')}
                onChange={(event) =>
                  set('observation', event.target.value)
                }
              />
            </div>
          </div>
        )}

        {type === 'experience' && (
          <div className="form-grid">
            <F
              label="Cliente"
              value={value('client')}
              set={(next) => set('client', next)}
              req
            />
            <F
              label="Trabalho"
              value={value('work')}
              set={(next) => set('work', next)}
            />
            <F
              label="Data"
              type="date"
              value={value('date')}
              set={(next) => set('date', next)}
            />
            <div className="field full">
              <label>O que aconteceu?</label>
              <textarea
                className="textarea"
                value={value('whatHappened')}
                onChange={(event) =>
                  set('whatHappened', event.target.value)
                }
                required
              />
            </div>
            <div className="field full">
              <label>O que funcionou?</label>
              <textarea
                className="textarea"
                value={value('whatWorked')}
                onChange={(event) =>
                  set('whatWorked', event.target.value)
                }
              />
            </div>
            <div className="field full">
              <label>O que deu errado?</label>
              <textarea
                className="textarea"
                value={value('whatFailed')}
                onChange={(event) =>
                  set('whatFailed', event.target.value)
                }
              />
            </div>
            <F
              label="Regra aprendida"
              value={value('learnedRule')}
              set={(next) => set('learnedRule', next)}
            />
            <F
              label="Próxima ação"
              value={value('nextAction')}
              set={(next) => set('nextAction', next)}
            />
          </div>
        )}

        <button
          className="btn"
          style={{ width: '100%', marginTop: 18 }}
          disabled={busy}
        >
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
      </form>
    </div>
  );
}

function F({
  label,
  value,
  set,
  type = 'text',
  req = false,
}: {
  label: string;
  value: string;
  set: (value: string) => void;
  type?: string;
  req?: boolean;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        className="input"
        type={type}
        value={value}
        onChange={(event) => set(event.target.value)}
        required={req}
        step={type === 'number' ? '0.1' : undefined}
      />
    </div>
  );
}
