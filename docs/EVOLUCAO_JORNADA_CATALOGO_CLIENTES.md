# Evolução da Jornada — catálogo, clientes e financeiro

**Estado:** portfólio de vídeos e monitoramento integrados ao `main` atual e compilados para publicação.

## Fluxo entregue

1. Brito cadastra serviços, preços, formato e prazo em `/catalogo/gestao`.
2. O portfólio de vídeos fica separado: envio e organização em `/portfolio/gestao`, visualização pública em `/portfolio`.
3. Visitantes consultam os serviços e preços em `/` ou `/servicos`.
4. O cliente escolhe um serviço, informa e-mail ou telefone e autoriza o uso dos dados para retorno. O sistema registra o contato como prospecto e cria uma oportunidade pendente.
5. Um link pessoal permite acompanhar o pedido. O token não é guardado em texto aberto.
6. Ao aceitar, a Jornada converte o prospecto em cliente e cria projeto e valor a receber. Serviço de vídeo também cria trabalho na Produção; outros serviços criam tarefa no projeto.
7. Pagamentos de vídeo são registrados com a conta de entrada e conciliados no Financeiro com chave idempotente. A receita só é lançada quando o pagamento real for confirmado.

## Regras para não inventar fatos

- Serviço publicado precisa ter nome, descrição e preço configurados pelo proprietário.
- Pedido do cliente não é contrato aceito nem dinheiro recebido.
- Aceitação gera recebível confirmado, sem criar transação financeira.
- Valores e detalhes são preservados no pedido, mesmo que o catálogo seja alterado depois.
- O relógio de 72 horas aplica-se somente aos serviços marcados como vídeo.

## Portfólio de vídeos

- Os arquivos usam a Blob Store privada já ligada ao projeto, sem criar outro armazenamento.
- Aceita MP4, WebM e MOV, com limite de 1 GB por vídeo. O envio mostra o progresso; cada trabalho começa oculto e pode ser publicado, editado ou excluído.
- A página pública mostra apenas trabalhos publicados. Os vídeos continuam privados no armazenamento e são entregues por links temporários assinados.
- O player usa `preload=none`; a página não solicita o arquivo até a pessoa iniciar a reprodução. Os links assinados são reaproveitados no mesmo navegador por até 6 dias, e cada vídeo é enviado com cache de até 30 dias. Isso ajuda o cache local, mas não garante que o navegador retenha o arquivo nem elimina o tráfego da primeira reprodução.
- A área `/portfolio/gestao` mostra reproduções com pelo menos 5 segundos e uma estimativa de tráfego dos últimos 30 dias. A estimativa supõe que cada reprodução transfere o vídeo inteiro, não mede bytes reais nem substitui o painel de faturamento da Vercel. Os contadores usam o Blob existente, guardam até 180 dias de histórico e cada reprodução registrada grava uma pequena atualização. Os links assinados vencem em até 7 dias; o sistema renova o link antes de reaproveitar o cache local.
- A área de preços não exibe nem edita vídeos de portfólio; os dois conteúdos têm páginas e telas de gestão separadas.
- Uploads e reprodução consomem armazenamento e tráfego da Blob Store quando forem usados. Nenhum vídeo foi enviado durante esta implementação.

## Limites atuais

- O catálogo e o portfólio começam vazios; os serviços, preços e vídeos reais precisam ser cadastrados antes da publicação.
- O fluxo registra pedidos e confirmações internas. Não há gateway de pagamento, assinatura de contrato ou envio automático de e-mail/WhatsApp neste bloco.
- O acompanhamento do cliente usa um link pessoal sem senha; o cliente deve guardar e não compartilhar esse link.
- O painel não depende de planilha nem de integração bancária.

## Validação local

- `npm test`: 196 testes aprovados, incluindo os fluxos de catálogo e contratação.
- `npm run build`: aprovado; as rotas de catálogo, pedidos, acompanhamento, portfólio e monitoramento apareceram no build.
- `npx tsc --noEmit`: aprovado após integração com o `main` atual. A suíte de testes não foi executada nesta etapa.
- Testes específicos da jornada de clientes cobrem exposição pública, consentimento, aprovação, idempotência, proteção de vídeo e ausência de dados pessoais no acompanhamento.

**Próxima ação operacional:** cadastrar os serviços reais em `/catalogo/gestao` e enviar os vídeos em `/portfolio/gestao`.


## 28/10/2026 — Correção do cadastro de vídeos

O vídeo de 125,4 MB chegou ao Blob. A falha comprovada nos logs era `Precondition failed: ETag mismatch` ao gravar state.json. A rotina de conflito comparava apenas error.name, mas a classe real do SDK mantém o nome Error. A correção reconhece a classe real e usa versões da API de metadados, verificadas antes e depois da leitura sem cache, para as gravações condicionais. As proteções contra sobrescrita continuam ativas.

A mensagem antiga de salvamento é limpa quando ocorre erro. Foram aprovados 46 testes direcionados, incluindo cadastro de 125 MB, idempotência, concorrência durante leitura e gravação, autenticação e limite de 1 GB. Build aprovado.
