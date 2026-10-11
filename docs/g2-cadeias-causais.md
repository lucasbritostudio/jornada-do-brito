# G2 — investigação causal com evidências e hipóteses refutáveis

**Situação:** candidato experimental na PR #13 da Jornada do Brito. **Não está em produção**. Nome público da IA continua pendente de aprovação. Nenhum deploy, merge, mudança de dados, credenciais ou novas APIs pagas foi realizado.

## Problema que motivou a etapa

Um mapa de importações e chamadas ajuda a investigar um projeto, mas **não comprova que uma instrução executou, que o efeito ocorreu ou qual foi a causa de um defeito**. A IA vinha propensa a afirmar coisas como "falta tratamento" mesmo quando `r.ok`, `catch` e `finally` existiam. Precisamos separar o que foi visto no código do que um teste real ainda deve provar.

## Novos módulos

- `lib/g2-causal-chain.ts` constrói, exclusivamente em memória, uma investigação a partir de fontes `GraphSource` explicitamente informadas e com o **mesmo SHA**. Reaproveita o grafo AST G2, conecta chamadas diretas e, quando uma URL `fetch('/api/...')` com método literal coincide com um arquivo `app/api/.../route.ts` fornecido e um handler exportado do mesmo método, marca apenas um **possível vínculo de roteamento por convenção Next.js**.
- O relatório separa `verified_static_reference` de `framework_convention_only`. Retorna as funções e linhas examinadas, as fontes que faltam e hipóteses **`hypothesis_not_verified`** com experimento e critério de refutação. Flag permanente: `runtimeOutcomeVerified=false`, `causeConfirmed=false`, `filesModified=false`, `deployAllowed=false`.
- `lib/g2-flow-facts.ts` inspeciona uma função específica via AST, extraindo somente fatos sintáticos: `await fetch`, `if (!r.ok) throw` quando há binding de `await fetch` no **mesmo bloco**, chamada `setError` num `catch` e `setAsking(false)`/equivalente em `finally`. Não extrai informações privadas como literais de URLs ou comentários maliciosos para as assinaturas. Esses fatos **não provam comportamento do navegador**.
- Quatro cenários de investigação: HTTP 500, falha de rede, JSON inesperado e resposta lenta. Cada um inclui teste proposto e condição em que a hipótese deve ser rejeitada. O teste não é executado pelo módulo.

## Exemplos reais auditados no próprio código da Jornada

1. **`ask` na Central:** `app/desenvolvimento/console.tsx` contém `fetch('/api/desenvolvimento/chat')`, checagem `if (!r.ok) throw`, `catch` que chama `setError` e `finally` que chama `setAsking(false)`. A rota `app/api/desenvolvimento/chat/route.ts` possui `POST`, referencia `generateWithFreeLlm` em `lib/llm.ts`, que por sua vez chama o cliente compatível com o provedor. **Comprovação:** sintaxe e relações entre as fontes examinadas. **Não comprovado:** que um HTTP 500, falha de rede ou limite do provedor se comportem corretamente numa sessão real.
2. **`planChange` é outro fluxo:** `fetch('/api/desenvolvimento/plan')` corresponde apenas como candidato à rota `app/api/desenvolvimento/plan/route.ts`. Uma consulta a `ask` não é confundida com a rota de plano. Se a rota de chat não for incluída, o resultado mantém a lacuna; não inventa backend.
3. **Risco de atribuição falsa identificado durante testes:** `reply.json()` estava sendo reportado como possível conflito com namespace importado, apesar de `reply` ser um objeto local. Corrigido em `lib/g2-function-graph.ts` para registrar conflito só se existir namespace importado homônimo.
4. **Escopo de status HTTP:** um `await fetch` num ramo separado não serve de prova para `if (!r.ok)` em outro escopo. O detector passou a exigir a declaração anterior no mesmo bloco.

Estes são **testes do código verdadeiro do repositório**, porém não são testes autenticados de navegador ou incidentes de produção reproduzidos. Não se deve chamar isso de defeito de produção confirmado.

## Medição e segurança

O teste `tests/g2-causal-chain.test.ts` inclui uma cadeia sintética de quatro fontes com UI → rota POST → função interna, rotas ausentes, método GET versus POST, método dinâmico, símbolo não exportado, URLs de outros fluxos, SHA divergente, arquivos proibidos e a cadeia real da Jornada. `tests/g2-flow-facts.test.ts` verifica os fatos de `ask` por linha e contraexemplos de escopo e funções duplicadas. Todos os testes permanecem dentro do pipeline da PR sem custo de Vercel.

**Resultado técnico do commit `d5f333265e2a466ced6ce2c20d21f02d505e85b2`:** GitHub Actions https://github.com/lucasbritostudio/jornada-do-brito/actions/runs/38167057700 — 193 testes aprovados, zero falhas; TypeScript e build Next.js aprovados.

**Limites:** grafo G2 processa no máximo oito arquivos, tamanho de cada fonte e total limitados, sem leitura automática fora de allowlist. Resolução de imports dinâmicos, dispatch em objetos, bancos, efeitos de cache, políticas de autenticação e comportamento temporal permanece parcial. Nenhum parser puramente estático comprova causalidade de execução por si só.

**Próximo portão da G2:** testar o comportamento real em sessão autenticada e ambiente isolado, com falhas HTTP/timeout controladas e observações do frontend, medir precisão em cenários inéditos do repositório e custo/latência. Só depois considerar publicar uma integração pequena e read-only por uma única autorização. Um conjunto de 193 testes sem falhas não mede automaticamente a capacidade da LLM nem autoriza declarar G3.
