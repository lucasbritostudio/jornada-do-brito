# Jornada do Brito — auditoria e fechamento local da contratação

Data: 29/10/2026. Escopo: contratação e entrega de vídeos de filmmaker. Este trabalho foi feito somente no código local. Não houve deploy, preview, envio ao Git nem mudança nos dados online.

## O que o cliente consegue fazer

1. Ver os serviços, preços e portfólio em áreas separadas.
2. Escolher um serviço e enviar um pedido com contato e objetivo do vídeo. Pode sugerir data, local e detalhes. O texto avisa que o pedido ainda será revisado e não gera cobrança.
3. Guardar um link pessoal para acompanhar a resposta, a gravação e cada vídeo.
4. Depois da aprovação, enviar imagens ou PDFs de referência pelo link. Limite: quatro arquivos, 20 MB por arquivo e 50 MB por pedido.
5. Receber uma proposta e escolher o horário ou pedir outra data. A escolha ainda não reserva a agenda.
6. Ver o valor do sinal de 50%. A data só aparece como reservada depois que Brito registra o recebimento desse valor no sistema.
7. Ver a prévia privada de cada vídeo, aprovar ou pedir ajustes com uma explicação.
8. Assistir ou baixar o vídeo final pelo link pessoal.

## O que Brito consegue fazer

- Revisar e aceitar ou recusar pedidos.
- Propor e remarcar a gravação; propostas não bloqueiam a agenda. Depois que o cliente escolhe e os pagamentos registrados somam pelo menos 50% do pedido, o sistema reserva o horário e impede conflito no mesmo horário. Datas iguais no mesmo dia também geram alerta para conferência de deslocamento e capacidade.
- Baixar materiais de referência com sessão autenticada.
- Acompanhar cada vídeo, registrar captação e materiais recebidos, ver metas de 48/72 horas, enviar prévias e entregar o arquivo final.
- Ver pedidos de ajuste do cliente e registrar recebimentos no fluxo existente de Produção e Financeiro.

## Fluxo implementado

`Escolha do serviço → pedido e briefing → revisão do Brito → horário escolhido → pagamento de 50% confirmado → data reservada → materiais de referência → gravação e edição → prévia → aprovação ou pedido de ajuste → vídeo final`

O prazo de 72 horas continua seguindo a regra existente: começa após a gravação e, nos novos pedidos, quando os materiais necessários também estiverem prontos. A aprovação do cliente não é tratada como entrega final. Cada vídeo de um pacote pode avançar e ser avaliado separadamente.

## Privacidade e arquivos

- Os vídeos de prévia e finais usam upload direto para Blob privada; MP4, WebM e MOV, até 1 GB por arquivo. O link de reprodução é temporário e renovado ao atualizar o acompanhamento.
- Os materiais enviados pelo cliente ficam privados, limitados a JPG, PNG, WebP e PDF. O cliente não recebe caminho interno de arquivo; downloads de referência exigem sessão do proprietário.
- A Blob privada pode gerar custos de armazenamento, tráfego e operações. Não foi feita estimativa de custo por vídeo.

## Cancelamento e reembolso

- O cliente pode pedir o cancelamento pelo mesmo link que usa para acompanhar o pedido.
- Para contratações online, o sistema considera os primeiros 7 dias após a reserva paga como prazo de arrependimento: sem taxa e com devolução integral. A lei prevê o direito de arrependimento em contratos feitos fora do estabelecimento e a devolução imediata dos valores pagos. Como o pagamento é manual, Brito precisa fazer a transferência e registrá-la no sistema.
- Depois desse prazo, se a gravação ainda não começou e o cliente aceitou a condição antes de confirmar o horário, o sistema calcula uma taxa comercial de 10% do valor total, limitada ao que já foi pago. O restante fica como valor previsto para devolução.
- Se a gravação já começou, o sistema exige análise manual. Não inventa uma taxa nem calcula um reembolso sem a decisão de Brito.
- Ao registrar a transferência, o sistema lança o reembolso no Financeiro e encerra a cobrança pendente do pedido. Nenhuma transferência é enviada pelo sistema.

Os 10% foram escolhidos por Brito; não são um percentual definido pela lei. A validade e o valor de uma penalidade podem depender do contrato e do caso concreto, e o Código Civil permite reduzir uma penalidade excessiva. A regra precisa ser apresentada com clareza e revisada por profissional jurídico antes de ser usada como cláusula definitiva. O sistema não cria nem substitui um contrato jurídico. Ainda não há checkout, integração bancária, assinatura eletrônica ou envio externo por e-mail/WhatsApp.

## Validação local

- `npx tsc --noEmit`: passou.
- `npm run test:journey`: 34 testes passaram; cobre reserva após 50%, devolução integral no prazo de arrependimento, cálculo da taxa comercial após 7 dias, registro do reembolso e cancelamento da produção.
- `npm run build`: passou; inclui as rotas de agendamento, pagamento e acompanhamento.
- `git diff --check`: passou.
- Não testamos o upload real na Blob hospedada, reprodução dos vídeos hospedados, envio de mensagem externa ou jornada no navegador de produção. Isso exigiria ambiente online, que não foi publicado por instrução do proprietário.

## Próximo uso

O código está pronto para revisão visual e, quando Brito decidir publicar, validação real do upload privado e da reprodução. As condições comerciais listadas acima podem ser adicionadas como política de contratação antes da publicação, se ele quiser que o pedido aprovado funcione também como aceite de termos.
