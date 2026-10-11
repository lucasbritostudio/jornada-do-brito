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


## Rodadas V2, V3 e V4 — resultados preservados

As rodadas seguintes mostraram por que 20/20 na primeira amostra NÃO era prova de compreensão universal. Todos os resultados abaixo são de **um analisador AST determinístico com casos sintéticos**, não de respostas da Groq.

| Rodada | Estado da amostra no momento da medição | Resultado | Erros observados |
|---|---|---:|---|
| V1 original | Primeira avaliação; política anterior | **20/20** | Nenhum sob a convenção de "URL com query não resolvida" |
| V2 original | Casos novos após congelamento da política V1 | **11/16** | 5 falsos negativos: template sem interpolação, URL const, método const, reexportação, query |
| V2 depois de correções | V2 virou regressão CONHECIDA | **16/16** | Nenhum no conjunto de desenvolvimento |
| V3 original | Novos casos após congelar correção de V2 | **15/16** | 1 falso negativo: reexportação com caminho relativo |
| V3 depois de correção | V3 virou regressão CONHECIDA | **16/16** | Nenhum nessa amostra conhecida |
| V4 original | Novos casos depois de congelar correção de V3 | **11/12** | 1 falso negativo: chave computada ["method"] no objeto de opções |

**Atenção — rótulo V1 incorreto para uma conclusão nova:** o registro V1 \`engineering-b09-query-string\` foi inicialmente rotulado como negativo porque a primeira regra só aceitava URL sem query. Na semântica normal de HTTP, \`/api/challenge?token=...\` continua apontando à mesma rota \`/api/challenge\`, e o valor do parâmetro não deve aparecer nos relatórios. A nova regra reconhece essa ligação; **o rótulo histórico foi mantido inalterado**, causando V1 19/20 se avaliado com a regra moderna. Esse 19/20 não demonstra regressão funcional; demonstra a inconsistência conhecida da avaliação antiga. Não ocultar nem reescrever os rótulos para fabricar um 20/20.

### Implementações

- \`lib/g2-static-fetch.ts\` lê AST de chamadas \`fetch\`, métodos GET/POST etc., const locais ou de módulo declaradas antes do uso, strings e templates sem interpolação, removendo a query antes de retornar a rota. Não executa expressão, resolve variáveis mutáveis nem divulga tokens.
- \`lib/g2-function-graph.ts\` reutiliza essa resolução. \`lib/g2-causal-chain.ts\` cruza a chamada com handler exportado e também pode seguir reexportações locais explícitas por alias do projeto ou caminho relativo resolvido **somente dentro das fontes já fornecidas**.
- \`tests/g2-static-fetch.test.ts\` testa sombra de parâmetro, const tardia, URL externa, template dinâmico, query secreta e métodos dinâmicos. \`tests/g2-causal-chain.test.ts\` ganhou testes de reexportação relativa válida, ausente e não exportada.
- \`lib/g2-diagnostic-scoring.ts\` disponibiliza rubrica futura para respostas estruturadas de modelo: vínculo inferido, arquivo/linha, alegação de execução sem prova, necessidade de experimento, citações fabricadas. \`tests/g2-diagnostic-scoring.test.ts\` exercita a rubrica com respostas geradas LOCALMENTE a partir do próprio grafo e respostas falsas artificiais; **isso NÃO mede Groq/G1/G2 LLM**.

### CI e conclusão técnica desta rodada

GitHub Actions no commit de integração \`ca9b7c850f64b581a136f679bd22c8e6a83c548e\`:
https://github.com/lucasbritostudio/jornada-do-brito/actions/runs/38171472980

**SUCCESS — 246 testes aprovados, zero falhas, TypeScript e compilação Next.js aprovados.** Nenhum merge, preview, mudança de token, modelo, banco, autenticação ou produção.

### Critérios NÃO cumpridos para promover de geração

1. A V4 teve 11/12 acertos, não 12/12. A chave computada para \`method\` continua lacuna **sem falsa certeza**, e V4 não pode mais ser reutilizado como conjunto independente após correção futura.
2. Todos os rótulos são criados pelo próprio desenvolvedor em código sintético. Não há auditoria humana independente, distribuição ampla de problemas, nem estimativa confiável de capacidade geral.
3. **Nenhum destes resultados contém resposta real do modelo de linguagem Groq**, apenas parser determinístico e testes de mocks anteriores. Para testar o raciocínio de verdade são necessárias respostas do modelo sob autenticação e fonte aprovada, orçamento de chamadas, avaliações cegas e comparação pareada.
4. Inferir ligação HTTP por AST e convenção de rota não prova causa real de defeito no navegador ou no banco.

**Decisão:** G2 apta a continuar pesquisas na PR DRAFT; NÃO autoriza G3, merge, deploy ou execução de correções propostas pelo modelo sem revisão.
