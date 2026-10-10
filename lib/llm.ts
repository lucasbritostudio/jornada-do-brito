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
  constructor(
    message: string,
    public status?: number,
    public provider: 'groq' | 'openrouter' = 'groq',
    public retryAfter?: string | null,
  ) {
    super(message);
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
        messages,
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
      const message =
        json?.error?.message ||
        (response.status === 429
          ? 'Limite gratuito temporariamente atingido.'
          : `LLM respondeu HTTP ${response.status}`);
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

export function llmStatus() {
  const groqConfigured = Boolean(process.env.GROQ_API_KEY);
  const openRouterConfigured = Boolean(process.env.OPENROUTER_API_KEY);
  const openRouterPrivateDataEnabled = process.env.OPENROUTER_ALLOW_PRIVATE_DATA === 'true';

  return {
    configured: groqConfigured || (openRouterConfigured && openRouterPrivateDataEnabled),
    groqConfigured,
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
    openRouterConfigured,
    openRouterPrivateDataEnabled,
    primary: groqConfigured ? 'groq' : 'local',
    privacyMode: 'minimum-context',
  };
}

export async function generateWithFreeLlm(messages: LlmMessage[]): Promise<LlmResult> {
  if (process.env.GROQ_API_KEY) {
    const model = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
    const result = await callOpenAICompatible(
      GROQ_URL,
      process.env.GROQ_API_KEY,
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
