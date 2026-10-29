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

## 28/10/2026 — Vídeos verticais e capas

- Os vídeos são apresentados em quadros 9:16, com a imagem inteira preservada.
- Novos envios geram uma capa JPEG no navegador a partir do arquivo local, durante o envio. A capa é pequena (540 × 960), sem enviar o vídeo para outro serviço.
- Ao abrir a gestão, vídeos antigos sem capa recebem uma automaticamente, um por vez, com uma segunda tentativa em caso de falha. O navegador lê o trecho necessário do vídeo; isso pode consumir tráfego. Se um arquivo não puder ser lido, a gestão informa e permite tentar em “Escolher capa”.
- “Escolher capa” abre o vídeo com barra de tempo, reprodução/pausa e ajuste em segundos. A imagem exibida ao salvar vira a capa. O proprietário pode trocar depois, inclusive em trabalhos já publicados.
- As capas ficam no Blob privado em `jornada/portfolio-covers/{id}/`. A página pública recebe somente links assinados das capas de trabalhos publicados e continua sem carregar o vídeo antes da reprodução.
- A troca salva a nova referência antes de remover a capa antiga. Um trabalho automático nunca substitui uma capa já escolhida pelo proprietário. Falha na capa não desfaz o cadastro do vídeo.
- Validação local: build e 12 testes direcionados aprovados (capas e cadastro de vídeos), incluindo autenticação, validação de imagem, concorrência, limpeza de upload sem referência e exposição pública.
- Validação em produção: capas geradas para os seis trabalhos existentes; troca manual de capa salva em 5,25 segundos. O portfólio exibe as imagens sem iniciar o carregamento dos vídeos (`readyState=0`, reprodução pausada).

## 28/10/2026 — Fechamento de três caminhos, sem deploy

Estado desta etapa: somente código e validação local. Não publicar, criar preview, enviar à main ou alterar os dados online sem nova instrução de Brito.

Brito confirmou 1 vídeo por R$397, 3 por R$987 e 4 por R$1.000. Confirmou o início das 72 horas depois da gravação e do recebimento dos materiais. Foram preparados os três serviços e a apresentação dos seis trabalhos existentes, preservando os textos já personalizados. A preparação do catálogo vazio é única e só entra em uso quando esta versão for publicada.

A contratação agora preserva quantidade/preço/prazo e prepara um trabalho por vídeo do pacote. Aprovação, projeto e recebível não duplicam; interrupção entre os arquivos é reparada ao atualizar. Cada vídeo recebe prazo próprio, condicionado aos dois fatos confirmados. Trabalhos antigos preservam a contagem anterior.

Pagamentos parciais atualizam o saldo pendente, e a quitação encerra o recebível. Transação, saldo da conta e recebível são gravados juntos no estado financeiro, com proteção de versão e identificador único. A Produção usa ETags de armazenamento verificados, evitando o mesmo tipo de conflito que afetou o cadastro de vídeos.

O cliente acompanha cada vídeo e os recebimentos confirmados em seu link pessoal. O portfólio continua separado dos serviços e preços. Nenhum gateway, Pix, débito automático ou mensagem externa foi ativado.

Validação final: 205 testes gerais + 12 do portfólio (217 aprovados), build/TypeScript e checagem do diff aprovados. As páginas públicas responderam HTTP 200 no servidor local. Os testes completos exercitaram as rotas reais com armazenamento sintético, incluindo concorrência e recuperação de falhas. Não foi realizada validação visual interativa das telas novas nesta etapa.

Detalhes: `FECHAMENTO_TRES_CAMINHOS_SEM_DEPLOY_2026-10-28.md`.

## 28/10/2026 — Briefing, data sugerida e materiais

Estado desta etapa: implementada no código local, compilada, sem deploy, preview ou alteração dos dados online.

- O pedido de vídeo agora pergunta o que o cliente quer mostrar e alcançar. O campo é obrigatório para vídeo; os detalhes extras continuam opcionais.
- O cliente pode sugerir uma data e informar cidade/bairro. A data aparece como sugestão a confirmar e não reserva horário nem inicia o prazo de entrega.
- Depois que o pedido for aprovado, o cliente pode anexar até quatro imagens JPG/PNG/WebP ou PDFs, com até 20 MB por arquivo e 50 MB somados, pelo link pessoal.
- Os arquivos usam a Blob privada já existente. O link do cliente autoriza somente o envio ao próprio pedido; o download exige a sessão do proprietário. Não há links públicos para os anexos.
- A área de pedidos mostra objetivo, data sugerida, local e links para baixar os anexos. Ao aprovar, o resumo do pedido também acompanha o projeto.
- Enviar arquivos não confirma que todos os materiais necessários foram recebidos. Brito ainda confirma isso na Produção; só então começa o prazo de 72 horas junto com a gravação.
- `npm run build` e `npx tsc --noEmit` passaram. O envio real e o retorno do callback do Blob precisam da aplicação hospedada; não foram executados por respeito à instrução de não publicar.

Regras de custo e segurança: upload direto do navegador para a Blob privada, sem encaminhar os arquivos pela função da aplicação; formatos limitados, no máximo quatro arquivos, 20 MB por arquivo e 50 MB no total; download privado apenas pelo proprietário. O uso da Blob ainda pode gerar armazenamento e operações.

## 28/10/2026 — Agendamento, avaliação e entrega privada

Estado: etapas implementadas e verificadas localmente. Sem deploy, preview ou alteração dos dados online.

- Brito pode propor ou remarcar data e horário no pedido aprovado. O cliente confirma pelo link pessoal ou pede outra data e explica o motivo.
- O sistema bloqueia horário exatamente igual já proposto ou reservado. O painel também avisa quando há várias gravações na mesma data; esse aviso pede conferência manual de deslocamento e capacidade.
- Brito envia uma prévia privada para cada vídeo. O cliente assiste pelo acompanhamento e pode aprovar ou descrever os ajustes necessários.
- Após a aprovação, Brito envia o vídeo final privado. O cliente pode assistir ou abrir/baixar. O link temporário renova ao atualizar a página.
- Pacotes seguem separados por vídeo. Pedido de ajuste retorna o trabalho à etapa de edição, sem perder a data do primeiro envio nem criar cobrança financeira.
- O código valida tipo, tamanho, etapa e caminho dos arquivos; somente a sessão do proprietário envia vídeos. Arquivos de referência continuam privados, com limites menores.
- `npx tsc --noEmit`, `npm run test:journey` (32 testes) e `npm run build` passaram. A validação do Blob real exige o projeto hospedado e permanece pendente.
- Condições de contratação (ajustes incluídos, cancelamento, parcelas/vencimentos, direitos de uso) não foram inventadas. Não há contrato assinado, checkout, integração bancária ou envio externo de mensagens.

Auditoria de fechamento: `FECHAMENTO_ORGANIZAR_CONTRATACAO_SEM_DEPLOY_2026-10-28.md`.

## 29/10/2026 — Sinal de 50% para reservar gravação

- Confirmar uma proposta no link pessoal registra a escolha do cliente, mas não bloqueia a agenda.
- O sinal é metade do valor total do pedido. Recebimentos parciais são somados entre os vídeos do pacote.
- Só depois que Brito registra pelo menos 50% como recebido o horário escolhido é salvo como reservado e enviado para a Produção.
- A tela do cliente explica quanto falta e informa que o site não cobra automaticamente. A tela de pedidos mostra sinal, valor recebido e saldo para reservar.
- Propostas sem sinal não bloqueiam outra gravação. Se o horário já estiver ocupado quando o sinal for registrado, o pedido pede uma nova data.
- Teste automatizado cobre pagamento abaixo de 50% e conclusão do sinal; deploy continua não realizado.

## 29/10/2026 — Cancelamento e registro de reembolso

- O cliente pede cancelamento pelo próprio link de acompanhamento.
- Nos primeiros 7 dias após a reserva paga, o cálculo não aplica taxa e prevê devolução integral. O reembolso continua manual e deve ser feito imediatamente quando se tratar do direito legal de arrependimento.
- Depois dos 7 dias, antes do início da gravação e após aceite da condição, o sistema calcula 10% do preço total, limitado ao valor pago. Se a produção já começou, exige análise manual.
- Depois que Brito confirma a transferência manual, o sistema registra a saída no Financeiro, fecha o valor a receber e cancela a produção associada.
- Os 10% são uma condição comercial escolhida por Brito, não um percentual fixado em lei. Uma penalidade pode ser revista conforme o contrato e o caso concreto; precisa de revisão jurídica antes de ser usada como cláusula definitiva.
- Teste automatizado cobre as duas regras e o lançamento financeiro. Nenhum deploy foi feito.
