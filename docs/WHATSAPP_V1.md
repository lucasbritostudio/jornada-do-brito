# WhatsApp v1 — Jornada do Brito

## Objetivo

Usar o número que os clientes já utilizam hoje e permitir:
- receber mensagens na Jornada;
- responder pela Jornada;
- manter histórico ligado ao cliente;
- receber ajuda da IA;
- preservar o uso normal do número sempre que a modalidade oficial permitir.

## Estratégia

Criar uma interface interna:

```ts
interface WhatsAppProvider {
  verifyWebhook(request): Promise<boolean>
  parseWebhook(request): Promise<NormalizedWhatsAppEvent[]>
  sendMessage(input): Promise<SendResult>
  getMedia(mediaId): Promise<MediaResult>
}
```

O restante do sistema depende dessa interface, não de Meta/Evolution diretamente.

## Provedor preferencial

WhatsApp Business Platform / Cloud API oficial da Meta.

Motivos:
- API oficial;
- webhooks;
- envio e recebimento programático;
- integração com CRM/backend;
- evolução da arquitetura Meta para compartilhamento de números/integrações.

Antes de conectar o número real:
1. identificar se o número atual está no WhatsApp ou WhatsApp Business;
2. confirmar elegibilidade para coexistência/onboarding;
3. confirmar que o app móvel continuará utilizável;
4. fazer teste com ambiente/número de teste;
5. validar envio, recebimento e status;
6. somente então migrar/conectar o número real.

## Webhook

Endpoint:
`/api/webhooks/whatsapp/meta`

### GET
Validação do webhook.

### POST
1. validar assinatura;
2. responder rápido;
3. deduplicar evento;
4. persistir payload técnico mínimo;
5. normalizar contato/conversa/mensagem;
6. colocar processamento secundário na outbox;
7. atualizar UI via Realtime;
8. pedir sugestão da IA se política permitir.

Nunca esperar a IA responder para retornar 200 ao webhook.

## Idempotência

Chaves únicas:
- provider_event_id;
- provider_message_id.

Webhooks podem repetir e chegar fora de ordem.
O estado final é reconstruído pelos identificadores e timestamps.

## Fluxo de entrada

Cliente → Meta → webhook → validação → persistência → contato/conversa → UI → IA sugere → Brito aprova → envio.

## Fluxo de saída

Brito escreve/aprova → fila de envio → provider → status enviado → webhook de status → atualização da mensagem.

## IA no atendimento

Fase inicial:
- nunca envia sozinha;
- gera rascunho;
- explica por que sugeriu;
- pode usar tom e histórico do cliente;
- não promete preço/prazo que não existe no sistema.

Evolução:
categorias simples e comprovadas podem ganhar automação após evals.

## Privacidade

- anexos privados;
- mensagens acessíveis apenas ao workspace autorizado;
- cliente externo não acessa inbox interno;
- dados pessoais internos nunca são enviados ao WhatsApp.

## Sem dependência externa indevida

Não utilizar:
- número do Chefe;
- número da São Francisco;
- Evolution desses projetos;
- tokens;
- webhooks;
- Redis;
- banco;
- serviços de qualquer projeto anterior.
