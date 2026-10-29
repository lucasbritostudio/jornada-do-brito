# Jornada do Brito — três caminhos concluídos no código

Data: 28/10/2026. Estado: preparado e validado localmente, sem deploy ou preview na Vercel e sem alteração dos dados de produção.

## Decisões confirmadas por Brito

- 1 vídeo: R$ 397.
- 3 vídeos: R$ 987 no total, R$ 329 por vídeo.
- 4 vídeos: R$ 1.000 no total, R$ 250 por vídeo.
- Prazo: até 72 horas por vídeo após a gravação e o recebimento dos materiais necessários. O envio para avaliação fica separado da aprovação e da entrega final.
- Preparar os três caminhos juntos antes de uma nova publicação.

## 1. Apresentação dos trabalhos

Foram preparados títulos diferentes e descrições curtas para os seis trabalhos existentes: pizzaria, aniversário de 15 anos, apresentação de inauguração, registro de inauguração, aniversário infantil e Max iPhone. As capas e os arquivos de vídeo são preservados.

A atualização só se aplica aos seis IDs já conferidos, quando o título ainda é o original e a descrição continua vazia. Texto já escrito pelo proprietário é preservado. Nenhum resultado de vendas, nome adicional de cliente ou promessa de desempenho foi inventado.

## 2. Serviços e contratação

O catálogo vazio receberá os três pacotes aprovados quando esta versão for publicada. A preparação ocorre uma única vez, com marcador no estado. Um catálogo já preenchido não é substituído e futuras edições do proprietário são preservadas.

A página do cliente mostra valor total, quantidade, valor por vídeo, prazo e os passos da contratação. O portfólio tem link e espaço separados. O formulário solicita nome, e-mail ou telefone, autorização de contato e uma explicação opcional.

O pedido guarda o preço, a quantidade e o prazo escolhidos. Alterações posteriores no catálogo não mudam o que o cliente solicitou. O envio não cobra nem presume pagamento. O cliente recebe um link pessoal de acompanhamento.

O mesmo envio pode ser repetido sem duplicação. Reutilização do identificador com dados diferentes é bloqueada. Um formulário público não modifica os dados já conferidos de um contato existente.

## 3. Pedido, produção, prazo e financeiro

A aprovação cria um cliente/projeto, um recebível do pacote e um trabalho por vídeo. Um pacote de quatro gera quatro trabalhos, não uma única entrega. Os valores distribuídos entre os vídeos somam exatamente o total aprovado.

A aprovação é salva antes da preparação da produção. Se o segundo arquivo estiver indisponível, o pedido continua aprovado; atualizar os pedidos conclui os trabalhos ausentes sem recriar registros já existentes.

Cada novo vídeo contratado pelo site possui prazo próprio. A gravação sozinha não inicia as 72 horas se ainda faltarem materiais. A gestão permite confirmar os dois fatos juntos ou marcar os materiais depois. A data mais recente inicia a contagem. Trabalhos antigos mantêm a regra de prazo já existente.

Cada recebimento exige confirmação, valor e conta de entrada. Pagamentos parciais reduzem o saldo a receber. A quitação encerra esse saldo. O caixa só muda com um recebimento confirmado. Repetir a operação não soma o dinheiro outra vez. Se a Produção salvar e o Financeiro falhar, a atualização repara a conciliação sem duplicar o pagamento.

O recebível ligado ao pedido não pode ser baixado por um segundo caminho da IA: a pessoa é orientada a usar a Produção e escolher a conta, mantendo a conciliação única.

O acompanhamento do cliente mostra a etapa de cada vídeo, o prazo confirmado, o total combinado, o que foi recebido e o saldo. Não expõe contatos, contas bancárias, tokens internos ou os demais clientes.

## Validação

- `npm test`: 205 testes aprovados, incluindo nove cenários completos novos.
- `npm run test:portfolio`: 12 testes aprovados.
- Total: 217 testes aprovados, sem falhas.
- `npm run build`: aprovado, com verificação de TypeScript.
- `git diff --check`: aprovado.
- Servidor local: `/servicos` e `/acompanhar` responderam HTTP 200 com o HTML da aplicação compilada.
- Nos cenários completos, foram usadas as rotas reais e armazenamento simulado em memória, sem credenciais ou movimentação de dinheiro real.
- Foram cobertos concorrência, preços preservados, pagamentos parciais, quitação, repetição, falha entre arquivos, recuperação e prazo dependente de gravação e materiais.
- A regra antiga de prazo foi mantida e seus testes continuam aprovados.
- A gravação da Produção agora usa o ETag de armazenamento validado antes e depois da leitura. Os testes simulam ETags HTTP diferentes, reproduzindo a causa corrigida anteriormente no portfólio.
- Não houve teste visual interativo das telas novas neste ambiente. A validação desta etapa foi funcional, de tipos, compilação e resposta HTTP local.

## Publicação

Nada foi enviado à branch principal nem a uma branch que pudesse criar preview. Não foi acionado fluxo de deploy, promoção ou publicação. A aplicação online permanece na versão já publicada anteriormente.

A preparação dos serviços e dos textos do portfólio faz parte desta versão e será aplicada somente na futura publicação aprovada. As decisões e o comportamento estão registrados também no documento de evolução do repositório.
