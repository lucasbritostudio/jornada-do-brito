# G2 — protocolo de autocorreção com evidências

**Escopo:** somente a branch de pesquisa da Jornada. Sem acesso a banco, chaves, Vercel, execução de código fornecido pela IA, deploy automático ou novos modelos pagos. Nome de marca permanece **pendente**; o nome LUKBRIX no código anterior é provisório e foi rejeitado pelo usuário.

## Objetivo

Uma tecnologia autoadaptativa só pode ser chamada de melhoria quando:

1. Encontra uma alegação específica errada e registra a fonte do problema.
2. Consegue formular uma hipótese de correção falsificável.
3. Mantém a versão antiga como referência e compara as duas em exemplos rotulados.
4. Usa exemplos separados dos que motivaram a correção para testar generalização.
5. **Não perde nenhum acerto anterior** e não libera mudanças por causa apenas de uma média maior.
6. Continua exigindo revisão e autorização antes de mudar código, modelo, permissões ou infraestrutura.

## Núcleo de prova

`lib/g2-semantic-proof.ts` verifica somente operações sintáticas delimitadas (booleanos, soma, multiplicação, length, negação lógica, showError no catch, setLoading, router.push, toFixed, guarda de null, r.ok, useCallback). Qualquer afirmação sobre autorização, persistência, retries, rede, resultado global ou código fora do trecho pode ser marcada como **prova insuficiente**, o que não equivale a afirmar que ela seja falsa. Nenhum texto da IA é executado.

`lib/g2-proof-evaluation.ts` mede separadamente quantas afirmações verdadeiras a candidata sustenta e quantas falsas ela deixa de aprovar. Registra os **casos corrigidos e os regressivos** e calcula uma comparação pareada com cauda exata binomial apenas como evidência adicional. Esse p-valor não é licença de produção, sobretudo com rótulos humanos e escolha repetida de hipóteses.

`lib/g2-remediation-plan.ts` transforma as falhas em planos de correção rastreáveis: hipótese, experimento, critério de refutação e condições de segurança. **Não edita nem corrige automaticamente o código**; isso exige uma etapa separada com testes isolados e revisão.

## Resultados — a diferença entre treinar e testar

| Conjunto | Referência | Candidata | Falsas retidas | Verdadeiras aceitas | Estado |
|---|---:|---:|---:|---:|---|
| 16 casos históricos | 10/16 | 16/16 | 8/8 | 8/8 | Somente regressão conhecida |
| 24 casos V1, depois usados na correção | 12/24 | 12→24/24 ao final | 12/12 | 12/12 | **Não é mais prova independente** |
| 24 casos V2 independentes | **13/24 (54,2%)** | **19/24 (79,2%)** | **8/12** | **11/12** | **BLOQUEADA** |

O V2 registrou **7 casos antes errados que a candidata acertou**, **1 regressão** e **4 afirmações falsas ainda aprovadas**. O teste pareado dos casos diferentes gerou p unilateral de **0,03515625**; isso não prova ausência de regressões, e a porta exige **zero regressões individuais** além da melhoria. A conclusão é **G2 ainda não aprovada**. Os 24 exemplos V2 agora também passam a ser conhecidos: não reutilizar como prova cega de uma candidata ajustada com eles.

Este experimento mede **o verificador determinístico de afirmações**, e não a precisão de um modelo de linguagem, criatividade, superinteligência, percentagem de AGI ou capacidade de encontrar bugs em todo o repositório. A qualidade do modelo Groq precisa de avaliações distintas em sessões autorizadas.

## Oportunidades encontradas pela própria avaliação

- **Alegações compostas:** uma afirmação parcialmente comprovada pode esconder promessa falsa na segunda oração. Próxima hipótese: decompor alegações materiais e exigir evidência para todas, sem aceitar apenas uma parte verdadeira.
- **Cobertura da gramática:** a expressão verdadeira de coerção booleana `!!value` foi abster-se; próximo experimento precisa ampliar operações suportadas sem aceitar inferências globais.
- **Validação:** repetir em conjuntos mais amplos com rótulos revisados, separar treino, validação e desafio final; nunca alterar a política em função do resultado final e depois anunciá-lo como inédito.
- **Custos e governança:** executar só nos testes do GitHub, sem novas chamadas LLM e sem preview Vercel. Candidatos permanecem na PR até evidência suficiente e autorização explícita.

**Estado atual:** branch experimental G2, sem merge na `main` nem deploy. O resultado numérico melhora, mas a candidata falhou no gate; autocorreção de código/infraestrutura continua bloqueada.


## Etapa concluída — validação composicional e operadores (11/10/2026)

**Problema atacado:** uma linha de código pode comprovar a primeira oração, mas não comprovar uma promessa adicional sobre banco de dados, permissões, publicação, sincronização, sucesso no navegador ou outros efeitos. Um verificador que apenas identifica o operador podia aceitar afirmações falsas com operandos diferentes ou esconder uma segunda alegação falsa.

**Solução implementada na branch (sem produção):** `lib/g2-claim-guards.ts` atua antes do verificador existente. Reconhece conectivos e efeitos adicionais como indicação de **evidência insuficiente**, em vez de aprovar toda a frase pela sua primeira metade. Reconhece um subconjunto de operações matemáticas e lógicas explícitas: soma, subtração, multiplicação, divisão, resto, potência, conjunção/disjunção, coalescência nula, comparações e igualdade estrita, negação `!` e conversão booleana `!!`. Confere operadores e números ou identificadores apresentados na afirmação; respeita a comutatividade onde existe. Não executa código nem comprova comportamento de sistema completo. Textos adversariais não viram comandos.

**Evidência histórica:** os 16 casos revelados e os dois conjuntos anteriores de 24 casos permanecem em regressão. As correções foram desenvolvidas usando limitações previamente reveladas — tais resultados não podem ser vendidos como prova cega.

**Nova auditoria V3, regras congeladas antes de preparar os casos:** arquivo `tests/fixtures/g2-frozen-v3.ts` (30 exemplos rotulados manualmente, 15 falsos e 15 verdadeiros). A política ficou congelada no commit `f77e01f5df19d4179b090756ffb88cc993af7c4a`. Após criar os exemplos V3, nenhuma regra de prova foi alterada; somente foi corrigida a tipagem do teste. Resultado no conjunto sintético:

| Métrica | Referência | Candidata |
|---|---:|---:|
| Casos corretamente avaliados | 15/30 (50%) | **30/30 (100%)** |
| Afirmações falsas retidas | 0/15 | **15/15** |
| Afirmações verdadeiras aceitas | 15/15 | **15/15** |
| Regressões entre acertos prévios | — | **0** |

Vitórias pareadas: 15; perdas: zero. Valor *p* unilateral exato no conjunto rotulado: **0,000030517578125**. A porta matemática do conjunto V3 passou **para avaliação humana adicional**. Esses resultados refletem um verificador determinístico num conjunto pequeno, sintético e escolhido manualmente por quem desenvolveu o sistema; não demonstram 100% de generalização, 100% de verdade em novos projetos, desempenho de LLM real ou superioridade sobre especialistas. O teste não é avaliação independente conduzida por terceiro.

**Verificação técnica final:** CI do GitHub Actions https://github.com/lucasbritostudio/jornada-do-brito/actions/runs/38164485740 — **166 testes aprovados, zero falhas, TypeScript e Next.js build aprovados**.

**G2 não foi mesclada, implantada nem autorizada a corrigir infraestrutura automaticamente.** A PR #13 segue como rascunho, e a produção continua na versão G1/Laboratório 2.2. Próxima melhoria recomendada: parser AST real para múltiplos arquivos, avaliação humana dos rótulos, testes com programas executáveis em sandbox confiável e comparação do modelo online; tudo separado da lógica de implantação.
