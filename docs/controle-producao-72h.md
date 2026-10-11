# Controle de Produção — relógio de 72 horas / Jornada do Brito

## Estado de entrega
Implementação isolada em `feat/controle-producao-72h`; **não mesclar na main e não fazer deploy** antes de validação. Não depende do produto "Resultados das Campanhas", que está em outra branch. Não altera registros existentes do `jornada/state.json`, nem financeiros, nem planilha.

## Regra decidida pelo filmmaker
- **Dia da gravação:** relógio NÃO começa. Registrar hora real em que terminou a captação.
- **Dia seguinte:** relógio começa às **00:00, horário de Alto Alegre do Maranhão (America/Fortaleza)**. Se gravou em 13/10, começa 14/10 00:00.
- **Meta interna de primeira versão enviada à avaliação:** início +48 horas. No exemplo, **16/10 00:00**; procurar enviar até fim do dia 15.
- **Prazo externo de 72 horas:** início +72 horas. No exemplo, **17/10 00:00**; enviar até fim do dia 16.
- **Atenção:** prazo calculado para ENVIAR primeira versão do vídeo para avaliação, não depende de quantos dias o cliente demora para aprovar; quando houver ajustes, registrar e acompanhar nova rodada separadamente.
- Registrar estágio `review` preserva `firstReviewSentAt` da PRIMEIRA apresentação, e `reviewSentAt` da última versão. Assim uma rodada de ajustes não reescreve o histórico da meta original.
- Se gravou após as 23:59, vale a data local real da conclusão da captação. Se ainda não gravou, não há relógio, nem prazo fabricado.
- Horários `datetime-local` são tratados na interface como `America/Fortaleza`; servidor usa horários ISO UTC e exibe como Fortaleza. Ajustar se o filmmaker passar a trabalhar em outro fuso.

## Produto e UX
`/producao` acessível mediante a sessão existente, e link **Minha produção** na navegação desktop/mobile.

Cada vídeo possui registro independente mesmo em um pacote com quatro entregas.
**Etapas:** planejamento → gravação agendada (com data) → gravado → edição → enviado à avaliação → ajustes do cliente (se houver) → aprovado → entregue. Pode cancelar trabalho ativo; o cancelamento não apaga recebimentos.

Os cartões separam **meta de 48h**, **prazo de 72h**, estado de espera pelo cliente e **recebimentos manuais confirmados**; a UI sinaliza meta alcançada, prazo excedido e sobreposição de edições de vídeos gravados no mesmo dia. Alertas são **dentro do painel, ao consultar**; nenhuma notificação push, e-mail ou WhatsApp é enviada automaticamente.

Antes de criar contrato ou agendar, usuário deve conferir capacidade efetiva; não se fixa uma capacidade máxima artificial por semana porque duração da edição varia por trabalho.

## Persistência e segurança
- `lib/production.ts`: relógio determinístico e funções puras de funil/etapas/alertas/pagamentos.
- `lib/production-store.ts`: `@vercel/blob` privado no caminho independente `jornada/production-v1.json`; GET sem gravação; persistência CAS `ifMatch` para evitar perder edições simultâneas.
- `app/api/production/route.ts`: GET/POST com `requireAuthenticated`, operações create/stage/update/payment; validação de campos, valores, transições e horários; UUID da operação permite idempotência de pagamento e criação.
- `app/producao/page.tsx`, `dashboard.tsx`, `production.css`: UX responsivo.
- `tests/production.test.ts`: limites exatos de 48/72h, mudança de data em Fortaleza, sem relógio antes de gravar, etapas, aprovação, sobrecarga e pagamentos.

## Dinheiro sem duplicidade
Pagamento lançado em `/producao` significa **confirmação operacional** associada à entrega; **não cria transações no Financeiro**. Ao efetivamente receber, deve-se conciliar a entrada uma única vez no financeiro oficial para não somar duas vezes. Não confundir faturamento contratado, valor pendente, saldo bancário e cofre de 01/11. Valor de proposta não aceita não deve constar como receita confirmada; preço do vídeo pode ficar em branco.

## Checklist antes de merge/deploy (PENDENTE)
1. Executar `npx tsc --noEmit --incremental false` e `npm test` em ambiente autorizado isolado.
2. Teste controlado: gravar 13/10 às 18h Fortaleza, ver início 14/10 00h, 48h 16/10 00h, 72h 17/10 00h.
3. Testar passagem por todas as etapas, correções e recebimento parcial com dupla submissão.
4. Testar atualização simultânea (409/CAS), registro com data passada, fuso Fortaleza e tela do iPhone.
5. Verificar que o financeiro e o estado de clientes anteriores permanecem intactos.
6. Revisar se alertas apenas em tela são suficientes ou se o usuário quer notificações depois.
7. Obter autorização explícita antes de fazer merge, ativar integração e qualquer deploy.

**Nunca atribuir datas reais de gravação ou dinheiro recebido com base só em uma proposta.**
