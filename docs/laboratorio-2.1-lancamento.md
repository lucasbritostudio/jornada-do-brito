# Laboratório de Código 2.1 — preparação de lançamento

Estado: **candidato à publicação controlada**, ainda não integrado à `main`.
Escopo único: `lucasbritostudio/jornada-do-brito`, Vercel `prj_nZMJzmOo0jsL9tFqfpT6lqdLm3c6`.
Não altera dados de clientes, pedidos, finanças, permissões nem executa código produzido pela IA.

## Correções incluídas

- Inclui blocos completos de funções citadas antes de outras linhas; fatos positivos são extraídos do arquivo real e vinculados ao caminho e linha da mesma revisão Git.
- Uma verificação estática independente identifica `r.ok` e encerramento de `asking`, `refresh` com `useCallback`, e `copyAnswer` com `catch`. A LLM não pode substituir esses fatos por hipóteses contraditórias.
- A validação da resposta compara citação literal, número de linha e arquivo correto; rejeita sugestões e riscos que mandem adicionar recursos já confirmados.
- Consultas de arquivos complementares limitadas à dupla componente/CSS explicitamente autorizada, usando o mesmo commit SHA. A consulta complementar tem prazo menor e pode ser omitida sem prejudicar a principal.
- Mostra quais arquivos foram consultados, o limite das evidências e a origem das conclusões.
- Nenhum modelo baixado, inferência adicional, serviço externo, integração nova ou biblioteca pesada.

## Critérios obrigatórios antes do único deploy

1. PR #11 atualizada contra `main`, sem conflito, revisão humana e autorização de lançamento.
2. Testes, TypeScript e `next build` da **revisão final** inteiramente aprovados via GitHub Actions; sem reutilizar status de commits anteriores.
3. Benchmark de casos falsos e verdadeiros incluído em `npm test` e aprovado, sem acesso à rede.
4. Verificar diff: nada de secrets, modificações em banco, autenticação, workflows de deploy ou outros repositórios.
5. Se qualquer requisito falhar, **não realizar merge nem deploy**. Corrigir na PR; não usar preview Vercel por padrão.
6. Somente após liberação, executar **um merge em main**, aproveitando exatamente o workflow de publicação já aprovado. Não disparar deploy manual adicional.

## Verificações logo depois de um único deploy (sessão autenticada)

- Conferir workflow de publicação com status de sucesso, Vercel `READY`, alias `jornada-do-brito.vercel.app` e `/desenvolvimento` HTTP 200 no mesmo deployment.
- Testar solicitação real: `ask` **já verifica** `r.ok`; `refresh` **já usa** `useCallback`; `copyAnswer` **já trata** exceções. São fatos de código, não prova de ausência de outros bugs.
- Testar hipótese sobre um erro não observável: resposta deve indicar o limite da fonte em vez de afirmar falha.
- Testar UI/CSS relacionado; conferir arquivo e linha de cada citação; observar custo e latência de uma consulta real.
- A área deve permanecer `Somente leitura`, sem botão para alterar código ou publicar.
- Em falha séria, parar experimentos e voltar ao deployment anterior específico, preservando dados.

## Limites reconhecidos

A checagem semântica cobre padrões selecionados e não substitui execução em navegador, análise de tipos/AST geral, validação independente de todas as hipóteses nem comparação real com modelos de raciocínio avançado.
Os testes automatizados **não validam** uma resposta ao vivo do provedor de IA. Essa etapa só pode acontecer com sessão autenticada depois de uma publicação controlada.
Métricas como acurácia real da LLM, latência e custo por consulta exigem medição; não inventar percentuais nem prometer capacidade equivalente a outro modelo.
