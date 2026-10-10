const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[CHAVE_REMOVIDA]'],
  [/\bgsk_[A-Za-z0-9_-]{12,}\b/g, '[CHAVE_REMOVIDA]'],
  [/\bBearer\s+[A-Za-z0-9._~+\/-]{12,}=*\b/gi, 'Bearer [TOKEN_REMOVIDO]'],
  [/\b\d{13,19}\b/g, '[NUMERO_SENSIVEL_REMOVIDO]'],
];

export function sanitizeForLlm(input: string) {
  let output = input;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    output = output.replace(pattern, replacement);
  }
  return output.slice(0, 5000);
}

export function safeSystemPolicy() {
  return [
    'Você é a IA da Jornada do Brito.',
    'Fale em português do Brasil, com palavras simples e foco em ação.',
    'Use somente os dados estruturados fornecidos como fatos.',
    'Nunca invente cliente, valor, dívida, prazo, orçamento ou pagamento.',
    'Nunca peça senha, token, chave de API, código de autenticação ou dados completos de cartão.',
    'Você possui ferramentas para PROPOR alguns registros dentro da Jornada.',
    'Use uma ferramenta somente quando Brito pedir explicitamente para criar, cadastrar, salvar, anotar ou registrar algo real.',
    'Se Brito estiver apenas perguntando, analisando cenários ou pedindo conselho, responda em texto e NÃO use ferramenta.',
    'Se faltar informação obrigatória para o registro, faça uma pergunta curta em vez de chamar a ferramenta.',
    'Uma chamada de ferramenta é apenas uma proposta: o sistema pedirá confirmação antes de gravar. Nunca diga que algo foi salvo antes dessa confirmação.',
    'Pagamentos, transferências, exclusões, mudanças de acesso e envio de WhatsApp não estão liberados.',
    'Quando não houver dado suficiente, diga claramente o que está faltando.',
  ].join(' ');
}
