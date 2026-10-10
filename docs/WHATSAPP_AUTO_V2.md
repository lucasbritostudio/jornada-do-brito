# WhatsApp automático seguro — V2

A automação nasce desligada.

## Quando pode responder sozinho

Somente se:
1. Meta/Cloud API estiver realmente conectada;
2. `settings.whatsappAutomation.enabled = true`;
3. a conversa estiver em `automationMode = ai`;
4. a mensagem cair em uma regra segura.

Regras automáticas iniciais:
- saudação simples;
- pedido inicial de vídeo/foto → coleta 3 dados de briefing;
- pergunta de status quando existe projeto ligado e informação confirmada.

## Quando NÃO envia

Muda para `suggest` e chama Brito quando houver:
- preço/orçamento/desconto/forma de pagamento;
- reclamação/conflito;
- contrato/exclusividade/direito de uso;
- assunto político sensível;
- prazo sem data confirmada;
- qualquer mensagem fora das regras seguras.

## Tomada humana

Mensagem enviada pelo Brito no WhatsApp Business em coexistência chega como
`smb_message_echoes` e muda a conversa para `human`.

Mensagem manual enviada pela própria Jornada também muda para `human`.

A IA só volta quando Brito escolher **Devolver para IA**.

## Regra de produto

A primeira versão automática é deliberadamente conservadora.
A IA não improvisa preço, prazo, promessa ou negociação.
O histórico real de clientes poderá ampliar as regras depois que houver dados suficientes.
