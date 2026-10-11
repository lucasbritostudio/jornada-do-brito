# G2 — Primeiro piloto com a IA real em laboratório separado

**Situação atual:** infraestrutura construída e validada em CI, mas **SEM RESPOSTAS REAIS DA GROQ NESTA ETAPA**. Não chamar testes simulados de teste da IA real. PR #13 em DRAFT, sem merge ou deploy.

## Objetivo e desenho

Validar se o modelo realmente utilizado pela Jornada (Groq / `openai/gpt-oss-20b`) consegue ler pequenos problemas de engenharia inéditos para ele, identificar ou negar uma ligação UI → rota Next.js, classificar a causa estrutural, escolher uma ação segura, citar o arquivo e a linha e propor uma verificação futura sem afirmar que executou código.

A amostra `tests/fixtures/g2-live-blind-v1.ts` contém 12 cenários **sintéticos**, seis com vínculo demonstrável e seis em que a relação não pode ser afirmada. Não há dados de clientes, pedidos, chaves, URLs privadas nem arquivos de produção. Os rótulos ficam no avaliador; `buildG2LivePrompt` entrega somente cenário e trechos com linha.

**Cuidado:** ausência de um arquivo na amostra **não prova** ausência da rota no repositório real. Nesse cenário, a resposta correta exige solicitar a fonte ausente, não afirmar que o sistema está quebrado ou propor criar uma rota sem confirmação.

`lib/g2-live-benchmark.ts` classifica:
- JSON válido e caso identificado;
- ligação correta e erros de falso positivo/falso negativo;
- classificação de causa e escolha de correção dentre opções explícitas;
- citação em linha existente **e pré-validada no rótulo**;
- nenhuma afirmação de que houve execução ou causalidade real;
- `experiment` proposto, que **não é executado por esse teste**.

O critério de "completamente correto" exige acerto em todos esses campos; `mayDeploy=false` e `needsHumanReview=true` em qualquer caso. Esses 12 cenários são pequenos e rotulados internamente: resultados futuros não estimarão competência universal.

## Segurança e limite de recursos

`scripts/g2-real-ai-evaluation.mts` e `scripts/run-safe-g2-real-evaluation.mjs` executam um piloto via **conta e chave Groq EXCLUSIVAS de testes**, sem acessar o cofre privado, a quota ou as credenciais de produção. Não é permitido reutilizar a chave usada por clientes da Jornada.

O executador:
1. Verifica o vínculo local da pasta com o projeto e a equipe exatos da Jornada.
2. Só lê `.env.g2.local` **local e ignorado pelo Git**, com `G2_TEST_GROQ_API_KEY` dedicada e `G2_TEST_SANDBOX_ACK=isolated`. Não herda variáveis GROQ/BLOB/JORNADA produtivas.
3. Bloqueia execução em GitHub Actions/CI.
4. Usa modelo fixo `openai/gpt-oss-20b`, no máximo **12 chamadas**, **425 tokens máximos de saída por chamada**, **15 segundos por chamada**, sem retry e sem deploy. O total efetivo de tokens é registrado quando o provedor o informa.
5. Só recebe exemplos sintéticos. Não salva prompts nem respostas brutas, não imprime segredo nem mensagens detalhadas de erro do provedor.
6. Em HTTP 429, falha de rede ou timeout, interrompe e informa piloto incompleto; não inventa acertos nos casos não executados.
7. Emite apenas um relatório JSON agregado marcado `G2_LIVE_REAL_REPORT`. Não grava nada no GitHub ou Drive automaticamente durante o teste.
8. Não escolhe ou aplica patches, não modifica dados, não publica código nem considera um benchmark autorização para geração nova.

**Custos:** planejar uma conta gratuita de testes separada; antes de executar, confirmar que a conta não possui cobrança automática ou quota compartilhada com produção. A frequência e limites do plano Groq são definidos pelo provedor, não são garantidos pelo código.

## Execução futura no PC autenticado (após provisionar chave EXCLUSIVA de testes)

Na pasta exata da Jornada e na branch G2 validada, inserir **somente no PC local**, nunca no chat, Drive ou GitHub, estas duas variáveis num arquivo `.env.g2.local`:

    G2_TEST_GROQ_API_KEY=<chave_exclusiva_da_conta_de_testes>
    G2_TEST_SANDBOX_ACK=isolated

Executar:

    npm run benchmark:g2:live

O programa não faz login, criação de chave ou configuração de cobrança; esses atos exigem o titular. Compartilhar depois **somente o relatório agregado sem segredos**, se for necessário análise nesta conversa.

## O que foi comprovado até aqui

Os testes automáticos `tests/g2-live-benchmark.test.ts` verificam que o prompt não contém respostas rotuladas, que o julgamento reprova JSON inválido, alegações de execução, citação fabricada e proposta errada. As respostas usadas nessas provas são **artificiais do próprio teste**, não mensagens Groq.

`tests/g2-live-security.test.mjs` verifica a ausência de acesso ao cofre, o bloqueio da CI e o limite de chamadas.

**NÃO EXECUTADO AINDA:** nenhuma chamada Groq com chave dedicada estava disponível no ambiente atual. Portanto **não existe nota do modelo real, tempo de resposta, uso de tokens ou comparação legítima G1 versus G2 de modelos**. Isso fica como condição explícita antes de promover geração.

## Próxima validação após primeiro relatório REAL

Analisar taxa de respostas válidas, erro de diagnóstico, citações, causas, planos de correção, abstenções, tokens e latência. Reavaliar manualmente os rótulos, incluindo causas com evidência incompleta, antes de escolher novos desafios. O modelo G2 só pode avançar após testes de generalização em novos casos independentes, comparando protocolos sob o mesmo custo, com correções executadas em sandbox estrito e sem regressão.

**Jamais** conectar este executor à rota produtiva, ao cofre do cliente ou ao pipeline de deploy. A PR permanece DRAFT até haver aprovação explícita.
