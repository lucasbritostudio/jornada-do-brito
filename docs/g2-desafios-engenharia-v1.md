# Desafios de engenharia G2 — avaliação V1 e rubrica de diagnósticos

**Status:** iniciados e executados na PR #13 DRAFT, SOMENTE código experimental de CI. Nenhuma integração da G2 em produção, nenhum deploy e nenhuma chamada adicional à Groq ou a outro serviço pago.

## Pergunta testada

Um analisador consegue dizer, com base em fontes reais de código **em memória**, se uma função inicial possui um vínculo de rota HTTP verificável por estrutura estática, **sem inventar rota, método ou backend**? A pergunta NÃO é: "a LLM consegue diagnosticar e corrigir qualquer bug"?

## Amostra e critérios ANTES do resultado

- Arquivo de casos `tests/fixtures/g2-engineering-v1.ts`: **20 programas sintéticos** independentes entre si, com 10 casos em que é possível vincular a função da interface à rota e 10 nos quais o vínculo **não está demonstrado**.
- Conjunto criado depois de a política G2 ter sido congelada no commit `ecb4391e620a2c2e173a2ad510ccb5abe57a6617`; a lógica de ligação não foi reescrita depois de ver os resultados V1.
- Casos: métodos POST/GET/PUT/PATCH/DELETE/HEAD/OPTIONS, importações com apelidos, encadeamento local, método em minúsculas, método errado, método dinâmico, rota ausente, rota não exportada, URL dinâmica, query string, código presente apenas em função desconectada, dependência não chamada.
- Métricas: acertos da candidata, precisão de ligações, cobertura de ligações positivas, falsos vínculos e casos omitidos.
- Referência **ingênua ilustrativa**, não é uma medida da G1: política de afirmar que toda interface tem a ligação desejada. Ela acerta somente os dez exemplos positivos neste conjunto balanceado.
- Regras de segurança: nenhuma correção, execução de trecho de código testado, rede externa, diagnóstico de runtime ou promoção da geração a partir desse resultado.

## Resultado medido pela CI

Na primeira bateria executada, `G2_ENGINEERING_V1_RESULTS` registrou: **20/20 acertos**, **precisão 10/10 = 100% nas ligações afirmadas**, **recall 10/10 = 100%**, **zero falsas ligações** e **zero ligações verdadeiras perdidas**. Referência ingênua: **10/20**. A suíte completa do commit `c374443eaf7c16ec28ad87a4ff324fbff04a0a1c` passou com **227 testes, zero falhas, TypeScript e Next.js build aprovados**; log em https://github.com/lucasbritostudio/jornada-do-brito/actions/runs/38170216305.

Essa amostra é PEQUENA, ARTIFICIAL e rotulada pelo próprio desenvolvedor. Não comprova generalização a projetos novos, taxa real de alucinação do modelo, qualidade causal, correções automáticas ou superioridade sobre outros modelos. A avaliação não foi conduzida por avaliadores independentes e os exemplos V1 passam agora a ser regressões CONHECIDAS.

## Nova rubrica preparada para diagnosticar RESPOSTAS da IA

`lib/g2-diagnostic-scoring.ts` disponibiliza:
1. leitura controlada de JSON de diagnóstico, com decisão `static_candidate` ou `not_established`, referência de arquivo/linha, indicador explícito de alegação de causa confirmada e proposta de experimento;
2. comparação da decisão com o rótulo independente do texto da resposta;
3. verificação de que a citação de arquivo/linha corresponde realmente à ligação no grafo de código;
4. registro de ligações inventadas, citações não sustentadas, afirmações de execução sem prova e diagnósticos incompletos;
5. retorno sempre `readyToPromote=false` — a rubrica não decide merge/deploy.

`tests/g2-diagnostic-scoring.test.ts` comprova que uma política conservadora gerada do próprio grafo pode ser avaliada com 20 respostas coerentes, enquanto um candidato artificial que sempre afirma haver ligação e já ter comprovado causalidade perde segurança. **Essas respostas são geradas nos testes e NÃO são respostas do modelo Groq.** Não declarar que medimos raciocínio da LLM.

## Restrições necessárias antes de avaliar o modelo de linguagem de verdade

Uma avaliação de IA em produção exige uma sessão autenticada da Jornada, fontes permitidas do mesmo commit, respostas reais da LLM, observações de execução independentes e um orçamento/limite de chamadas autorizado. O conector disponível nesta etapa não tinha sessão autenticada de navegador e nenhum teste da Groq ao vivo foi executado. É incorreto declarar uma pontuação G1 × G2 da LLM com o benchmark do parser.

**Regra:** continuar a preparação experimental, mas não alterar ambiente produtivo, autenticação, dados ou provedores; não renomear automaticamente a IA. Nome anterior LUKBRIX foi rejeitado como marca, restam identificadores legados até nome final.

## Resultado decisório

O motor estrutural passou **nesses 20 desafios**; a rubrica de diagnóstico está preparada para avaliações posteriores. A G2 continua no laboratório experimental, sem condições para declarar G3 ou compreensão universal de software.
