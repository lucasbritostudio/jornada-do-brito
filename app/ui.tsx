Warning: truncated output (original token count: 24915)
Total output lines: 3007

'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  ConversationAutomationMode,
  FinancialAccount,
  StudyArea,
  StudyEvent,
  WorkspaceState,
} from '@/lib/types';
import {
  listUpcomingObligations,
  summarizeAvailableCash,
  summarizeCurrentMonth,
} from '@/lib/finance-period';
import { buildFinancePlan } from '@/lib/finance-plan';
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
  | 'receivable'
  | 'obligation'
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

const accountTypeLabel: Record<FinancialAccount['type'], string> = {
  cash: 'Dinheiro',
  bank: 'Banco',
  wallet: 'Carteira digital',
  credit_card: 'Cartão de crédito',
  own_collateral: 'Aplicação resgatável',
  reserve: 'Reserva financeira',
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

  async function financeAction(action: Record<string, unknown>) {
    setBusy(true);
    const response = await fetch('/api/finance/action', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(action),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) {
      setNotice(result.error || 'Não foi possível salvar.');
      return false;
    }
    setState(result.state);
    setNotice('Salvo.');
    return true;
  }

  const derived = useMemo(() => {
    if (!state) return null;

    const monthFinance = summarizeCurrentMonth(state.transactions);
    const financePlan = buildFinancePlan({ transactions: state.transactions, obligations: state.obligations, debts: state.debts, accounts: state.financialAccounts });
    const cashSummary = summarizeAvailableCash(
      state.financialAccounts,
      state.obligations,
    );

    const structuralDebts = state.debts
      .filter(
        (item) =>
          item.status === 'active' && item.structural !== false,
      )
      .reduce((sum, item) => sum + item.currentBalanceCents, 0);

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
    const reserveAccounts = state.financialAccounts.filter((item) => item.active && item.type === 'reserve');
    const reserveBalance = reserveAccounts.reduce((sum, item) => sum + (item.currentBalanceCents ?? item.openingBalanceCents), 0);
    const reserveTarget = reserveAccounts.reduce((sum, item) => sum + (item.targetBalanceCents || 0), 0);

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
      incomeByCategory: monthFinance.incomeByCategory,
      expenseByCategory: monthFinance.expenseByCategory,
      plannedIncome: monthFinance.plannedIncomeCents,
      plannedExpense: monthFinance.plannedExpenseCents,
      hasClearedMonthActivity: monthFinance.hasClearedTransactions,
      structuralDebts,
      bankCash: cashSummary.bankCashCents,
      availableBalance: cashSummary.availableCents,
      hasCashBalance: cashSummary.hasCashAccount,
      rescuable,
      reserveBalance,
      reserveTarget,
      financePlan,
      obligations: cashSummary.plannedObligationsCents,
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
          <a href="/catalogo/gestao" style={{display:'flex',gap:11,alignItems:'center',width:'100%',padding:'11px 12px',borderRadius:12,background:'#252619',color:'#e8ff72',fontWeight:750,fontSize:13}}>
            <span className="dot-icon" aria-hidden="true" />
            Catálogo e pedidos
          </a>
          <a href="/portfolio/gestao" style={{display:'flex',gap:11,alignItems:'center',width:'100%',padding:'11px 12px',borderRadius:12,background:'#252619',color:'#e8ff72',fontWeight:750,fontSize:13}}>
            <span className="dot-icon" aria-hidden="true" />
            Portfólio de vídeos
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
            <Finance state={state} d={derived} save={mutate} financeAction={financeAction} />
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
        <a href="/catalogo/gestao" style={{padding:'12px 9px',color:'#e8ff72',fontWeight:750,whiteSpace:'nowrap'}}>Catálogo</a>
        <a href="/portfolio/gestao" style={{padding:'12px 9px',color:'#e8ff72',fontWeight:750,whiteSpace:'nowrap'}}>Portfólio</a>
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
                  }[sta…12915 tokens truncated…d: 'var(--accent)',
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
        status: value('status') || 'cleared',
        certainty: 'confirmed',
      });
    }

    if (type === 'receivable') {
      await save('receivables', {
        title: value('title'),
        amountCents: moneyToCents(value('amount')),
        certainty: value('certainty') || 'confirmed',
        status: 'pending',
        expectedOn: value('date') || undefined,
        notes: value('description') || undefined,
      });
    }

    if (type === 'obligation') {
      await save('obligations', {
        title: value('title'),
        amountCents: moneyToCents(value('amount')),
        kind: value('kind') || 'personal',
        status: 'planned',
        dueDate: value('date') || undefined,
        essentiality: value('essentiality') || 'review',
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
    receivable: 'A receber',
    obligation: 'Conta',
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
              label={type === 'income' ? 'Origem da renda' : 'Categoria da saída'}
              value={value('category')}
              set={(next) => set('category', next)}
            />
            <F
              label="Descrição"
              value={value('description')}
              set={(next) => set('description', next)}
              req
            />
            <div className="field full">
              <label>Situação</label>
              <select
                className="select"
                value={value('status') || 'cleared'}
                onChange={(event) => set('status', event.target.value)}
              >
                <option value="cleared">Já aconteceu</option>
                <option value="planned">Prevista</option>
              </select>
            </div>
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

        {type === 'receivable' && (
          <div className="form-grid">
            <F label="Quem vai pagar / descrição" value={value('title')} set={(next) => set('title', next)} req />
            <F label="Valor previsto (R$)" value={value('amount')} set={(next) => set('amount', next)} req />
            <F label="Data esperada" type="date" value={value('date')} set={(next) => set('date', next)} />
            <div className="field">
              <label>Confiança</label>
              <select className="select" value={value('certainty') || 'confirmed'} onChange={(event) => set('certainty', event.target.value)}>
                <option value="confirmed">Combinado</option>
                <option value="estimate">Estimativa</option>
                <option value="forecast">Possibilidade</option>
              </select>
            </div>
            <div className="field full">
              <label>Observação</label>
              <textarea className="textarea" value={value('description')} onChange={(event) => set('description', event.target.value)} />
            </div>
          </div>
        )}

        {type === 'obligation' && (
          <div className="form-grid">
            <F label="Conta / compromisso" value={value('title')} set={(next) => set('title', next)} req />
            <F label="Valor (R$)" value={value('amount')} set={(next) => set('amount', next)} req />
            <F label="Vencimento" type="date" value={value('date')} set={(next) => set('date', next)} />
            <div className="field">
              <label>Tipo</label>
              <select className="select" value={value('kind') || 'personal'} onChange={(event) => set('kind', event.target.value)}>
                <option value="personal">Pessoal</option>
                <option value="subscription">Assinatura</option>
                <option value="card_bill">Fatura do cartão</option>
                <option value="infrastructure">Sistema / infraestrutura</option>
                <option value="debt_payment">Parcela de dívida</option>
                <option value="other">Outro</option>
              </select>
            </div>
            <div className="field">
              <label>Importância</label>
              <select className="select" value={value('essentiality') || 'review'} onChange={(event) => set('essentiality', event.target.value)}>
                <option value="essential">Essencial</option>
                <option value="review">Revisar</option>
                <option value="optional">Opcional</option>
              </select>
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
  inputMode,
  req = false,
}: {
  label: string;
  value: string;
  set: (value: string) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  req?: boolean;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        className="input"
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(event) => set(event.target.value)}
        required={req}
        step={type === 'number' ? '0.1' : undefined}
      />
    </div>
  );
}
