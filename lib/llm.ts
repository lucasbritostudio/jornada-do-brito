export type LlmMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type LlmResult = {
  text: string;
  provider: 'groq' | 'openrouter' | 'local';
  model: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
};

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function callOpenAICompatible(
  url: string,
  apiKey: string,
  model: string,
  messages: LlmMessage[],
  extraHeaders: Record<string,string> = {},
): Promise<{text:string; usage?: any}> {
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
        temperature: 0.3,
        max_tokens: 1200,
      }),
      signal: controller.signal,
      cache: 'no-store',
    });

    const json = await response.json();
    if (!response.ok) {
      const message = json?.error?.message || `LLM respondeu HTTP ${response.status}`;
      throw new Error(message);
    }

    const text = json?.choices?.[0]?.message?.content;
    if (!text) throw new Error('LLM retornou resposta vazia.');
    return { text, usage: json.usage };
  } finally {
    clearTimeout(timeout);
  }
}

export function llmStatus() {
  return {
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    openRouterConfigured: Boolean(process.env.OPENROUTER_API_KEY),
    openRouterPrivateDataEnabled: process.env.OPENROUTER_ALLOW_PRIVATE_DATA === 'true',
    primary: process.env.GROQ_API_KEY ? 'groq' : 'local',
  };
}

export async function generateWithFreeLlm(messages: LlmMessage[]): Promise<LlmResult> {
  if (process.env.GROQ_API_KEY) {
    const model = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
    const result = await callOpenAICompatible(GROQ_URL, process.env.GROQ_API_KEY, model, messages);
    return {
      text: result.text,
      provider: 'groq',
      model,
      usage: result.usage ? {
        promptTokens: result.usage.prompt_tokens,
        completionTokens: result.usage.completion_tokens,
        totalTokens: result.usage.total_tokens,
      } : undefined,
    };
  }

  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_ALLOW_PRIVATE_DATA === 'true') {
    const model = process.env.OPENROUTER_MODEL || 'openrouter/free';
    const result = await callOpenAICompatible(
      OPENROUTER_URL,
      process.env.OPENROUTER_API_KEY,
      model,
      messages,
      {
        'HTTP-Referer': 'https://jornada-do-brito.vercel.app',
        'X-Title': 'Jornada do Brito',
      },
    );
    return {
      text: result.text,
      provider: 'openrouter',
      model,
      usage: result.usage ? {
        promptTokens: result.usage.prompt_tokens,
        completionTokens: result.usage.completion_tokens,
        totalTokens: result.usage.total_tokens,
      } : undefined,
    };
  }

  throw new Error('FREE_LLM_NOT_CONFIGURED');
}
