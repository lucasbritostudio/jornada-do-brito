# Evolução da Jornada — catálogo, clientes e financeiro

**Estado do código:** implementado localmente e validado; não publicado.

## Fluxo entregue

1. Brito cadastra serviços, preço, formato, prazo e links do portfólio em `/catalogo/gestao`.
2. Visitantes veem apenas itens publicados em `/` ou `/servicos`.
3. O cliente escolhe um serviço, informa e-mail ou telefone e autoriza o uso dos dados para retorno. O sistema registra o contato como prospecto e cria uma oportunidade pendente.
4. Um link pessoal permite acompanhar o pedido. O token não é guardado em texto aberto.
5. Ao aceitar, a Jornada converte o prospecto em cliente e cria projeto e valor a receber. Serviço de vídeo também cria trabalho na Produção; outros serviços criam tarefa no projeto.
6. Pagamentos de vídeo são registrados com a conta de entrada e conciliados no Financeiro com chave idempotente. A receita só é lançada quando o pagamento real for confirmado.

## Regras para não inventar fatos

- Serviço publicado precisa ter nome, descrição e preço configurados pelo proprietário.
- Pedido do cliente não é contrato aceito nem dinheiro recebido.
- Aceitação gera recebível confirmado, sem criar transação financeira.
- Valores e detalhes são preservados no pedido, mesmo que o catálogo seja alterado depois.
- O relógio de 72 horas aplica-se somente aos serviços marcados como vídeo.

## Limites atuais

- O catálogo inicia vazio; serviços, preços e links reais do portfólio precisam ser cadastrados antes da publicação.
- O fluxo registra pedidos e confirmações internas. Não há gateway de pagamento, assinatura de contrato ou envio automático de e-mail/WhatsApp neste bloco.
- O acompanhamento do cliente usa um link pessoal sem senha; o cliente deve guardar e não compartilhar esse link.
- O painel não depende de planilha nem de integração bancária.
- Nenhum deploy, preview ou publicação foi executado.

## Validação local

- `npm test`: 196 testes aprovados, incluindo os fluxos de catálogo e contratação.
- `npx tsc --noEmit`: aprovado.
- `npm run build`: aprovado; as rotas de catálogo, pedidos, acompanhamento e área de gestão apareceram no build.
- Testes específicos da jornada de clientes cobrem exposição pública, consentimento, aprovação, idempotência, proteção de vídeo e ausência de dados pessoais no acompanhamento.

**Próxima ação operacional:** cadastrar os serviços e portfólio reais em `/catalogo/gestao`; publicar só quando o catálogo estiver revisado.
