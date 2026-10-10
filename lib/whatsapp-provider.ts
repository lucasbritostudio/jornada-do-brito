export class WhatsAppProviderError extends Error {
  status?: number;
  details?: unknown;

  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = 'WhatsAppProviderError';
    this.status = status;
    this.details = details;
  }
}

export function whatsappConfigured() {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID,
  );
}

export async function sendWhatsAppText(to: string, text: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneId) {
    throw new WhatsAppProviderError(
      'WhatsApp oficial ainda não conectado.',
      409,
    );
  }

  const graphVersion =
    process.env.WHATSAPP_GRAPH_VERSION || 'v25.0';

  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${phoneId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
      cache: 'no-store',
    },
  );

  const json = await response.json();

  if (!response.ok) {
    throw new WhatsAppProviderError(
      'Falha ao enviar pela Meta.',
      response.status,
      json,
    );
  }

  return {
    providerMessageId: json.messages?.[0]?.id as string | undefined,
  };
}
