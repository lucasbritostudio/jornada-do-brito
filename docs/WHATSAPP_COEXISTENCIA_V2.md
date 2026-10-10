# WhatsApp Coexistence — regra de tomada humana

A Jornada foi preparada para o modo oficial de coexistência entre:
- WhatsApp Business no celular;
- WhatsApp Cloud API.

## Regra principal

Quando uma mensagem enviada pelo próprio Brito chega pelo webhook
`smb_message_echoes`, a conversa muda para:

`automationMode = human`

A IA fica impedida de enviar novas respostas nessa conversa.

Para devolver:
`POST /api/whatsapp/conversation-mode`

com modo `ai`.

## Segurança

A automação geral nasce desligada:
`settings.whatsappAutomation.enabled = false`

Ela só poderá enviar mensagens automáticas após conexão real da Meta,
validação do número em coexistência e ativação explícita dentro da Jornada.

## Sincronização preparada

O webhook também entende:
- `history` — histórico inicial compartilhado;
- `smb_app_state_sync` — contatos do app;
- `smb_message_echoes` — mensagens enviadas pelo Brito;
- `messages` — mensagens recebidas de clientes.
