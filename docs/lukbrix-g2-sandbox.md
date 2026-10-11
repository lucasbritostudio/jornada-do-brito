# LUKBRIX G2 — Laboratório isolado de experimentos

## Objetivo e escopo

A G1 (produção) só observa e **propõe hipóteses testáveis**. A G2, preparada nesta branch, acrescenta um experimento **executado exclusivamente nos testes do GitHub Actions**, sem usar credenciais, dados pessoais, banco, Vercel, prompts enviados à Groq ou arquivos de produção.

A G2 neste marco **não modifica o próprio código automaticamente**. Ela gera configurações candidatas para um **verificador sintético em memória**, calcula resultados de casos rotulados e descarta soluções regressivas. Isso é uma primeira experiência real de seleção automática de melhorias numa política de verificação — não autoconsciência, autotreinamento, reengenharia irrestrita ou criação de novos modelos.

## Como testa

1. Define uma política de base já existente, sem rejeição de contradições de implementações previamente verificadas.
2. Prepara candidatos de parâmetros pré-aprovados: exigir citação literal, bloquear alegações de ausência e bloquear certas recomendações contraditórias.
3. Executa cada política num conjunto fixo de casos sintéticos identificados, com rótulos verdadeiros/falsos.
4. Avalia resultados com contagem explícita de **falsos rejeitados** e **verdadeiros aceitos**, usando a porta de não regressão da G1.
5. Só considera candidatos que não pioram treino **nem** validação separada (*holdout*). Classifica candidatos pelo treino; o holdout é apenas veto, para não escolhê-los por memorizar a validação.
6. A saída é um **relatório de candidato**, nunca executável, sem alteração em produção e com revisão humana obrigatória.

## Proteções

- Motor puro e determinístico em `lib/lukbrix-g2-sandbox.ts`, sem `eval`, `new Function`, shell, rede, acesso a arquivos ou segredos.
- Textos adversariais são dados; nenhum trecho vira comando.
- Candidatos são combinações fixas de políticas de verificação, não código arbitrário gerado pelo LLM.
- Recusa amostras inválidas, vazias, desequilibradas, duplicadas e com vazamento por ID entre treino e holdout.
- A execução de experimentos fica dentro da CI do **pull request**, sem preview Vercel.
- Não cria infraestrutura nova, GPU, tokens de API ou agendamento recorrente.

## Como avaliar a evolução

O percentual sobre **quatro gerações arquiteturais** é só um indicador de etapas construídas e não mede proximidade de uma “superinteligência” (objetivo sem escala científica de 100%).

Separar rigorosamente:
- *Completude do produto:* quais funções foram implementadas, documentadas e testadas.
- *Qualidade do filtro:* proporção de casos rotulados classificados corretamente.
- *Capacidade do modelo real:* análise de problemas inéditos, evidência, tempo, custo e erros; **ainda não medida pela G2 offline**.

Os exemplos atuais de treino/holdout são pequenos e sintéticos: não comprovam generalização nem descobertas inéditas. Para subir níveis futuros: conjuntos maiores, cenários não vistos, avaliações cegas e revisão de especialistas.

## Publicação

**Não realizar merge nem deploy desta G2 sem autorização nova e avaliação controlada.** A G1 permanece na `main`. O G2 pode ser testado e evoluído por PRs isoladas até a avaliação final.

## Indicador de roteiro

G1 está disponível em produção e G2 está na fase experimental. Isso representa **1/4 (25%) das quatro etapas arquiteturais publicadas**, não 25% de inteligência superior. A G2 só conta como concluída depois de avaliação e publicação separadas; G3 e G4 são propostas futuras. Não existe uma porcentagem científica para chegar a uma suposta 'super IA suprema'.

## Avaliação de generalização com 16 problemas inéditos

Há um terceiro conjunto **separado da seleção de política** em `tests/lukbrix-g2-unseen.test.ts`, com casos de validação de permissão, fila de rede, manipulação de estado, comentário adversarial, citação inventada e também fatos verdadeiros de operações simples. O processo seleciona candidatos usando somente treino e holdout anteriores, e o conjunto inédito é usado **apenas para auditar**. A auditoria compara a política original e a candidata e nunca muda a seleção baseado nesse conjunto.

**Resultado do benchmark offline (16 casos rotulados):** 10/16 julgados corretamente (62,5%); **2/8 falsos rejeitados (25%)** e **8/8 verdadeiros aceitos (100%)**. A política candidata também atingiu 10/16: **nenhuma melhoria nesse conjunto**. O gate de generalização a reprovou. Por exemplo, uma citação literal de `if (user) return profile` não prova que somente administradores têm acesso — e a política ainda pode aceitar essa conclusão errada.

Esses números medem **apenas nosso filtro local neste pequeno conjunto sintético criado manualmente**, não precisão de IA, segurança global, descoberta de tecnologia ou capacidade de raciocínio do modelo. Nem o treino nem o holdout anteriores foram suficientes para prever essa limitação. Antes de promover mudanças, ampliar o conjunto com problemas realmente inéditos e avaliações independentes, e avaliar separadamente as respostas do modelo real durante uma sessão autenticada. A G2 não pode ser lançada como sistema autocorretivo pleno enquanto o gate reprovar.
