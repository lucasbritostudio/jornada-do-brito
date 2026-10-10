import { getGroqApiKey, getGroqSecretStatus } from './secrets';
import { sanitizeForLlm } from './ai-policy';

export type LlmMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type LlmResult = {
  text: string;
  provider: 'groq' | 'openrouter';
  model: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  limits?: {
    remainingRequests?: string | null;
    remainingTokens?: string | null;
    resetRequests?: string | null;
    resetTokens?: string | null;
  };
};

export class LlmProviderError extends Error {
  status?: number;
  provider: 'groq' | 'openrouter';
  retryAfter?: string | null;

  constructor(
    message: string,
    status?: number,
    provider: 'groq' | 'openrouter' = 'groq',
    retryAfter?: string | null,
  ) {
    super(message);
    this.status = status;
    this.provider = provider;
    this.retryAfter = retryAfter;
  }
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function callOpenAICompatible(
  url: string,
  apiKey: string,
  model: string,
  messages: LlmMessage[],
  provider: 'groq' | 'openrouter',
  extraHeaders: Record<string, string> = {},
): Promise<{ text: string; usage?: any; headers: Headers }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify({
        model,
        messages: messages.map((entry) => entry.role === 'user'
          ? { ...entry, content: sanitizeForLlm(entry.content) }
          : entry),
        temperature: 0.25,
        max_completion_tokens: 1200,
      }),
      signal: controller.signal,
      cache: 'no-store',
    });

    let json: any = null;
    try {
      json = await response.json();
    } catch {
      // Mantém erro simples sem copiar corpo potencialmente sensível.
    }

    if (!response.ok) {
      // Provider error bodies are untrusted and can contain private input;
      // expose a stable, generic status instead of echoing upstream text.
      const message = response.status === 429
        ? 'Limite gratuito temporariamente atingido.'
        : `Provedor de IA indisponível (HTTP ${response.status}).`;
      throw new LlmProviderError(
        message,
        response.status,
        provider,
        response.headers.get('retry-after'),
      );
    }

    const text = json?.choices?.[0]?.message?.content;
    if (!text || typeof text !== 'string') {
      throw new LlmProviderError('LLM retornou resposta vazia.', 502, provider);
    }

    return { text, usage: json.usage, headers: response.headers };
  } catch (error) {
    if (error instanceof LlmProviderError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new LlmProviderError('A IA demorou demais para responder.', 504, provider);
    }
    throw new LlmProviderError('Falha de comunicação com a IA.', 502, provider);
  } finally {
    clearTimeout(timeout);
  }
}

export async function llmStatus() {
  const groq = await getGroqSecretStatus();
  const openRouterConfigured = Boolean(process.env.OPENROUTER_API_KEY);
  const openRouterPrivateDataEnabled =
    process.env.OPENROUTER_ALLOW_PRIVATE_DATA === 'true';

  return {
    configured:
      groq.configured ||
      (openRouterConfigured && openRouterPrivateDataEnabled),
    groqConfigured: groq.configured,
    groqSource: groq.source,
    groqLast4: groq.last4,
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
    openRouterConfigured,
    openRouterPrivateDataEnabled,
    primary: groq.configured ? 'groq' : 'local',
    privacyMode: 'minimum-context',
  };
}

export async function generateWithFreeLlm(messages: LlmMessage[]): Promise<LlmResult> {
  const groqApiKey = await getGroqApiKey();
  if (groqApiKey) {
    const model = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
    const result = await callOpenAICompatible(
      GROQ_URL,
      groqApiKey,
      model,
      messages,
      'groq',
    );

    return {
      text: result.text,
      provider: 'groq',
      model,
      usage: result.usage
        ? {
            promptTokens: result.usage.prompt_tokens,
            completionTokens: result.usage.completion_tokens,
            totalTokens: result.usage.total_tokens,
          }
        : undefined,
      limits: {
        remainingRequests: result.headers.get('x-ratelimit-remaining-requests'),
        remainingTokens: result.headers.get('x-ratelimit-remaining-tokens'),
        resetRequests: result.headers.get('x-ratelimit-reset-requests'),
        resetTokens: result.headers.get('x-ratelimit-reset-tokens'),
      },
    };
  }

  if (
    process.env.OPENROUTER_API_KEY &&
    process.env.OPENROUTER_ALLOW_PRIVATE_DATA === 'true'
  ) {
    const model = process.env.OPENROUTER_MODEL || 'openrouter/free';
    const result = await callOpenAICompatible(
      OPENROUTER_URL,
      process.env.OPENROUTER_API_KEY,
      model,
      messages,
      'openrouter',
      {
        'HTTP-Referer': 'https://jornada-do-brito.vercel.app',
        'X-Title': 'Jornada do Brito',
      },
    );

    return {
      text: result.text,
      provider: 'openrouter',
      model,
      usage: result.usage
        ? {
            promptTokens: result.usage.prompt_tokens,
            completionTokens: result.usage.completion_tokens,
            totalTokens: result.usage.total_tokens,
          }
        : undefined,
    };
  }

  throw new Error('FREE_LLM_NOT_CONFIGURED');
}


export type ToolCallResult = LlmResult & {
  action?: { name: string; args: Record<string, unknown> };
};

export async function generateWithJornadaTools(
  messages: LlmMessage[],
  tools: readonly unknown[],
): Promise<ToolCallResult> {
  const apiKey = await getGroqApiKey();
  if (!apiKey) return generateWithFreeLlm(messages);

  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: messages.map((entry) => entry.role === 'user'
          ? { ...entry, content: sanitizeForLlm(entry.content) }
          : entry),
        ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
        temperature: 0.2,
        max_completion_tokens: 1000,
      }),
      signal: controller.signal,
      cache: 'no-store',
    });

    let json: any = null;
    try {
      json = await response.json();
    } catch {
      // Upstream response may be non-JSON. Never expose raw body.
    }
    if (!response.ok) {
      throw new LlmProviderError(
        response.status === 429
          ? 'Limite gratuito temporariamente atingido.'
          : `Provedor de IA indisponível (HTTP ${response.status}).`,
        response.status,
        'groq',
        response.headers.get('retry-after'),
      );
    }

    const message = json?.choices?.[0]?.message;
    const toolCall = message?.tool_calls?.[0];
    let action: ToolCallResult['action'];

    if (toolCall?.type === 'function' && toolCall.function?.name) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(toolCall.function.arguments || '{}');
      } catch {
        throw new LlmProviderError('A IA preparou uma ação inválida.', 502, 'groq');
      }
      action = { name: toolCall.function.name, args };
    }

    const content =
      typeof message?.content === 'string' && message.content.trim()
        ? message.content.trim()
        : action
          ? 'Preparei essa ação para sua confirmação.'
          : 'Não consegui montar uma resposta.';

    return {
      text: content,
      provider: 'groq',
      model,
      action,
      usage: json.usage
        ? {
            promptTokens: json.usage.prompt_tokens,
            completionTokens: json.usage.completion_tokens,
            totalTokens: json.usage.total_tokens,
          }
        : undefined,
      limits: {
        remainingRequests: response.headers.get('x-ratelimit-remaining-requests'),
        remainingTokens: response.headers.get('x-ratelimit-remaining-tokens'),
        resetRequests: response.headers.get('x-ratelimit-reset-requests'),
        resetTokens: response.headers.get('x-ratelimit-reset-tokens'),
      },
    };
  } catch (error) {
    if (error instanceof LlmProviderError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new LlmProviderError('A IA demorou demais para responder.', 504, 'groq');
    }
    throw new LlmProviderError('Falha de comunicação com a IA.', 502, 'groq');
  } finally {
    clearTimeout(timeout);
  }
}
