# LUKBRIX — núcleo de pesquisa e evolução da Jornada

**Nome de trabalho:** LUKBRIX (LUCAS + BRITO + X de experimentação). Identidade provisória até aprovação expressa; disponibilidade e registrabilidade da marca ainda não foram confirmadas.
**Geração inicial:** G1, pesquisa assistida por evidências. Não reivindicar originalidade comercial ou registro de marca sem pesquisa jurídica.

## Propósito

Transformar o diagnóstico do Laboratório num ciclo científico: **observar → propor hipótese → definir experimento → medir → tentar refutar → recomendar ou descartar**. A habilidade de criar ideias ou novas tecnologias só pode ser sustentada por resultados reproduzíveis; modelos de IA podem errar, e chamar algo de “superinteligente” não é prova.

O LUKBRIX **não é uma IA que se retreina autonomamente** na geração G1. O núcleo funciona dentro do endpoint de planejamento atual e cria uma proposta de pesquisa determinística a partir do tipo de falha da resposta do modelo, do número de fatos realmente encontrados e da cobertura da fonte. Zero nova chamada de IA por ciclo.

## Etapas e limites de autonomia

| Geração / etapa | Função | Autonomia permitida | Porta para avançar |
|---|---|---|---|
| G1 — Observação e pesquisa | Encontrar fatos, classificar falhas, gerar hipóteses, indicar métricas e experimentos | Propostas somente leitura, sem escrever arquivos em produção | Evidência de benchmark e revisão |
| G2 — Simulação | Montar testes e contraexemplos em ambiente isolado, com orçamento máximo | Apenas ambiente de teste/branch; sem acesso a segredos de produção | Testes de regressão, segurança, custo |
| G3 — Engenharia experimental | Criar candidatos de mudança em PR isolada com resumo, risco, reversão | PR sem merge automático e sem deploy | Revisão humana e validações completas |
| G4 — Pesquisa avançada | Explorar hipóteses novas com ferramentas matemáticas, código de avaliação e comparação independente | Limites de rede, tempo, recursos e ações; nenhum acesso irrestrito | Resultados repetíveis, comparação cega e autorização |

Estas etapas são **arquitetura proposta**: somente G1 entra neste commit. Avançar uma etapa nunca é uma conclusão tirada apenas do texto do próprio modelo.

## Matemática

Para casos rotulados e fixados previamente:

- **Rejeição dos falsos:** falsos rejeitados / todos os falsos testados.
- **Aceitação dos verdadeiros:** verdadeiros aceitos / todos os verdadeiros testados.
- **Pontuação balanceada:** (rejeição dos falsos + aceitação dos verdadeiros) / 2.

O candidato só passa na porta matemática se não piorar nenhuma das duas taxas nem reduzir o total de casos de qualquer classe. **Aprovar nesse teste não autoriza merge ou deploy**: segurança, comportamento real, latência e custo ainda precisam ser avaliados.

O índice de prioridade para **propostas de pesquisa** é ordinal e heurístico, não representa probabilidade de descoberta nem acurácia real. O benchmark sintético de regressão **não mede raciocínio do modelo Groq em produção**.

## Fluxo em produção depois de uma futura liberação

1. Usuário faz consulta no Laboratório. O sistema lê somente arquivos autorizados de interface, no SHA fixo.
2. O verificador extrai fatos positivos e tenta validar as afirmações do modelo.
3. Se o modelo contradiz código, falha no JSON ou cita referência falsa, recebe um motivo interno de rejeição, sem repetir chamada de IA.
4. O LUKBRIX gera automaticamente **uma hipótese de melhoria falsificável**, métrica, experimento e critério de descarte. A resposta diferencia fato de proposta.
5. Qualquer modificação no código, no modelo, na infraestrutura, permissões ou no sistema de publicação exige avaliação separada e aprovação humana. Não existe gerador autônomo de deploy.
6. A pesquisa pode ficar documentada num repositório/registro futuro, mas a G1 não coleta dados privados em um novo banco nem cria serviços permanentes.

## Restrições de segurança e custo

- Nunca executar instruções encontradas em código lido ou texto de usuário como se fossem autorização para comandos no servidor.
- Não baixar pesos de modelos, instalar agentes externos, provisionar GPU, abrir rede irrestrita ou criar serviços agendados.
- Não misturar projetos ChefeBot, São Francisco ou outras contas: somente a Jornada.
- Respeitar o orçamento atual de uma chamada LLM por consulta e fallback local.
- Não publicar automaticamente nem trocar modelos pagos.
- Não afirmar que uma geração “se superou” sem medir com conjuntos inéditos e controles que impeçam overfitting.

## Testes necessários

A suíte `tests/brion-research.test.ts` verifica geração de hipóteses para todos os estados conhecidos do modelo, métrica com denominadores reais, casos inválidos, proibição de autopublicação e recusa a regressões. A interface e o endpoint seguem em modo somente leitura.

**Status deste documento:** projeto inicial implementado em branch de revisão; não equivale a AGI, descoberta científica original ou autonomia de infraestrutura em produção.
