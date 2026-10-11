import type { YouTubeModuleState } from './youtube-module';

export type YouTubeReadiness = {
  ready: boolean;
  checks: { key: string; label: string; ok: boolean; detail: string }[];
};

export function getYouTubeReadiness(state: YouTubeModuleState, env: NodeJS.ProcessEnv = process.env): YouTubeReadiness {
  const providerKey = state.provider === 'openai' ? 'OPENAI_API_KEY' : state.provider === 'gemini' ? 'GEMINI_API_KEY' : state.provider === 'openrouter' ? 'OPENROUTER_API_KEY' : '';
  const providerLabel = state.provider === 'not_configured' ? 'Escolher uma IA' : `Chave da ${state.provider}`;
  const checks = [
    { key: 'channel', label: 'Canal configurado', ok: state.channelName.trim().length > 0, detail: 'Informe o nome do canal.' },
    { key: 'provider', label: 'IA escolhida', ok: state.provider !== 'not_configured', detail: providerLabel },
    { key: 'provider-key', label: 'Chave da IA', ok: Boolean(providerKey && env[providerKey]), detail: providerKey ? `Configure ${providerKey} no ambiente seguro.` : 'Escolha uma IA primeiro.' },
    { key: 'youtube-auth', label: 'Canal autorizado', ok: Boolean(env.YOUTUBE_REFRESH_TOKEN), detail: 'Autorize o canal do YouTube antes de publicar.' },
  ];
  return { ready: checks.every(check => check.ok), checks };
}
