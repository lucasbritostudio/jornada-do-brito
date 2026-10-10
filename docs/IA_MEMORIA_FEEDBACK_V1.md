# Memória de melhoria da Jornada IA

A Jornada guarda conversas da IA em arquivos privados separados do estado principal.

## Objetivo

Guardar:
- o que Brito pediu;
- o que a IA respondeu;
- se houve ação, fallback ou erro;
- feedback **Resolveu / Não resolveu**;
- casos em que houve falha e depois uma solução realmente aprovada.

## Aprendizado

Não há treinamento ou fine-tuning automático do modelo externo.

Quando um turno marcado **Não resolveu** é seguido por uma resposta marcada
**Resolveu**, a Jornada cria uma lição privada com:

`problema → resposta que resolveu`

Lições são recuperadas por semelhança simples de palavras e entram somente
como contexto em pedidos relacionados.

## Privacidade

- arquivos: `jornada/ai-memory/...`;
- acesso privado no Vercel Blob;
- conteúdo não é versionado no GitHub;
- segredos já removidos pelo sanitizador não entram na memória;
- esta memória não é enviada para treinamento da Groq/OpenAI;
- somente lições relevantes são reenviadas como contexto para o provedor de IA.

## Segurança contra aprendizado errado

A Jornada não transforma toda resposta em regra.

Só cria lição de resolução quando Brito confirma **Resolveu** depois de ter
marcado uma tentativa anterior como **Não resolveu**.
