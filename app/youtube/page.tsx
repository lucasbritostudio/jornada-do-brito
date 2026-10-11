'use client';

import { useEffect, useState } from 'react';

type State = { enabled: boolean; mode: 'autonomous' | 'paused'; channelName: string; audience: string; contentPillars: string[]; cadence: 'daily' | 'weekly' | 'manual'; publishMode: 'private' | 'unlisted' | 'public'; provider: 'not_configured' | 'openai' | 'gemini' | 'openrouter'; runs: { id: string; status: string; stage: string; createdAt: string }[]; readiness?: { ready: boolean; checks: { key: string; label: string; ok: boolean; detail: string }[] } };
const initial: State = { enabled: false, mode: 'paused', channelName: '', audience: '', contentPillars: [], cadence: 'weekly', publishMode: 'private', provider: 'not_configured', runs: [] };
const input = { display: 'block', width: '100%', marginTop: 8, padding: '12px 14px', borderRadius: 10, border: '1px solid #36514e', background: '#0b1515', color: '#eef7f5', boxSizing: 'border-box' as const };
const button = { border: 0, borderRadius: 10, padding: '12px 16px', color: 'white', background: '#315d58', cursor: 'pointer', fontWeight: 700 };

export default function YouTubePage() {
  const [state, setState] = useState<State>(initial);
  const [pillars, setPillars] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  async function load() { const response = await fetch('/api/youtube', { cache: 'no-store' }); if (response.ok) { const value = await response.json(); setState(value); setPillars(value.contentPillars.join(', ')); } setLoading(false); }
  useEffect(() => { void load(); }, []);
  async function call(action: string, patch: Partial<State> = {}) { const response = await fetch('/api/youtube', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, state: patch }) }); const value = await response.json(); if (response.ok) { setState(value.state); setMessage(action === 'queue_run' ? 'Execução preparada para o motor YouTube.' : 'Atualizado.'); } else { if (value.readiness) setState(current => ({ ...current, readiness: value.readiness })); setMessage(value.error || 'Não foi possível atualizar.'); } }
  async function save() { await call('save_settings', { ...state, contentPillars: pillars.split(',').map(item => item.trim()).filter(Boolean) }); }
  if (loading) return <main style={{ padding: 32 }}>Carregando YouTube…</main>;
  return <main style={{ maxWidth: 920, margin: '0 auto', padding: '42px 24px 80px' }}>
    <a href="/" style={{ color: '#9dc6c0' }}>← Voltar para a Jornada</a>
    <p style={{ color: '#9dc6c0', marginTop: 34, letterSpacing: 1 }}>MÓDULO INDEPENDENTE</p>
    <h1 style={{ fontSize: 42, margin: '8px 0' }}>Jornada YouTube</h1>
    <p style={{ maxWidth: 680, color: '#a7b4b3', lineHeight: 1.6 }}>Automação de conteúdo para o seu canal, separada da IA de engenharia e dos dados principais da Jornada.</p>
    <section style={{ display: 'grid', gap: 16, marginTop: 32, padding: 24, border: '1px solid #2d4442', borderRadius: 18, background: '#101d1d' }}>
      <h2 style={{ margin: 0 }}>Configuração do canal</h2>
      <label>Nome do canal<input value={state.channelName} onChange={e => setState({ ...state, channelName: e.target.value })} style={input} /></label>
      <label>Público principal<textarea value={state.audience} onChange={e => setState({ ...state, audience: e.target.value })} style={{ ...input, minHeight: 80 }} /></label>
      <label>Pilares de conteúdo, separados por vírgula<input value={pillars} onChange={e => setPillars(e.target.value)} style={input} /></label>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label>Frequência<select value={state.cadence} onChange={e => setState({ ...state, cadence: e.target.value as State['cadence'] })} style={input}><option value="daily">Diária</option><option value="weekly">Semanal</option><option value="manual">Manual</option></select></label>
        <label>IA<select value={state.provider} onChange={e => setState({ ...state, provider: e.target.value as State['provider'] })} style={input}><option value="not_configured">Ainda não configurada</option><option value="openai">OpenAI</option><option value="gemini">Gemini</option><option value="openrouter">OpenRouter</option></select></label>
        <label>Publicação inicial<select value={state.publishMode} onChange={e => setState({ ...state, publishMode: e.target.value as State['publishMode'] })} style={input}><option value="private">Privada</option><option value="unlisted">Não listada</option><option value="public">Pública</option></select></label>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}><button onClick={save} style={button}>Salvar configuração</button><button onClick={() => call('set_mode', { mode: state.mode === 'autonomous' ? 'paused' : 'autonomous' })} style={{ ...button, background: state.enabled ? '#5a3030' : '#2f6c59' }}>{state.enabled ? 'Pausar automação' : 'Ativar automação'}</button><button onClick={() => call('queue_run')} style={{ ...button, background: '#29445a' }}>Preparar próxima execução</button></div>
      {message && <p style={{ color: '#d4eb99', margin: 0 }}>{message}</p>}
    </section>
    <section style={{ marginTop: 24, padding: 24, border: '1px solid #2d4442', borderRadius: 18 }}><h2>Estado</h2><p>Automação: <strong>{state.enabled ? 'ativa' : 'pausada'}</strong></p><p>Execuções preparadas: <strong>{state.runs.length}</strong></p><h3>Prontidão</h3>{state.readiness?.checks.map(check => <p key={check.key} style={{ color: check.ok ? '#b8e2a6' : '#f0c0a0', margin: '8px 0' }}>{check.ok ? '✓' : '•'} {check.label} — {check.ok ? 'OK' : check.detail}</p>)}<p style={{ color: '#a7b4b3' }}>O módulo está isolado. Nenhuma chave aparece nesta tela.</p></section>
  </main>;
}
