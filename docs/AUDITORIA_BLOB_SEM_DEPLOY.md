# Auditoria do Blob da Jornada — sem deploy

**Objetivo:** conferir os arquivos já existentes no Vercel Blob privado, sem alterar ou exportar dados pessoais e sem publicar uma nova versão do site.

## Ferramenta escolhida

**Vercel CLI oficial + `vercel env run` + `@vercel/blob`**, executados na pasta local da Jornada. Esta combinação reutiliza a conexão autenticada com o projeto e fornece a variável de ambiente somente ao subprocesso, sem criar `.env`, sem transferir token para a conversa, sem Vercel Sandbox pago e sem GitHub Actions.

Fontes oficiais:
- https://vercel.com/docs/cli/env
- https://vercel.com/docs/cli/link
- https://vercel.com/docs/cli/blob
- https://vercel.com/docs/vercel-blob/private-storage

**Proteção obrigatória:** antes de consultar os blobs, os scripts exigem que `.vercel/project.json` aponte simultaneamente para:
- projeto `prj_nZMJzmOo0jsL9tFqfpT6lqdLm3c6` (Jornada do Brito);
- equipe `team_ZEmFS6erUu5qbXgYyze8PWdm`.

Se apontar para qualquer outro projeto (ChefeBot, São Francisco etc.) ou não existir vínculo, o comando **é bloqueado**. Não há plano de fallback para outro projeto.

## Como executar uma vez, somente se necessário

A partir de um computador com Node.js e a pasta do repositório `lucasbritostudio/jornada-do-brito`, na branch `auditoria-v2-1-sem-deploy`:

1. Executar `npx vercel login` **apenas se ainda não estiver autenticado**.
2. Vincular explicitamente e sem deploy: `npx vercel link --yes --project prj_nZMJzmOo0jsL9tFqfpT6lqdLm3c6 --scope pizzaria-sao-francisco-contingencia`. Isso grava apenas o vínculo na pasta `.vercel/` (já ignorada pelo Git); não altera o projeto de produção.
3. Se faltarem dependências: `npm install --ignore-scripts --no-audit --no-fund`.
4. Rodar **uma única vez**: `npm run audit:blob:safe`.

**Esse comando não faz deploy, não cria previews e não escreve no Blob.** Ele verifica a pasta e chama a CLI oficial para executar `scripts/audit-private-blob.mjs` com o ambiente `production`. **O nome `production` é somente a fonte das credenciais de leitura**; não publica nem modifica a produção.

## O que o resultado mostra

Saída JSON agregada: quantidade e tamanho de objetos, categorias (estado, autenticação, segredos, índice, conversas da IA, arquivos e outros), validade de JSON das memórias, indícios de segredos expostos, conversas ausentes no índice e referências quebradas. Não imprime valores de clientes, conteúdos, senhas, tokens, telefones nem nomes individuais de arquivos.

**Atenção:** uma contagem de 0 suspeitas não prova ausência total de dados sensíveis; são padrões aproximados. Uma leitura negada ou JSON inválido reprova a auditoria.

A auditoria não apaga, não modifica e **não cria backup** dos objetos. Backups e testes de restauração ainda devem ser planejados separadamente, sem migrações nem exclusões.

## Segurança e custo

- Reutiliza o Blob já existente; **não cria outra loja**.
- Sem custos de deploy/preview ou aluguel de sandbox.
- Leituras pontuais do Blob podem consumir uma pequena quantidade de transferência/operações do plano; não são necessariamente gratuitas.
- Não usar `vercel env pull` nem salvar arquivos `.env` para esse procedimento.
- Não colocar token em parâmetro `--rw-token`, prints, logs, GitHub ou nesta conversa.
- A conexão ao Blob exige chave válida; no ChatGPT, a integração atual oferece metadados da loja, mas não leitura dos objetos. Não tentar contornar o bloqueio de transferência de credenciais.

## Resultado atual

O comando foi **construído e protegido**, mas a leitura dos arquivos privados reais **ainda não foi executada**. A integração da Vercel confirmou loja privada `jornada-do-brito-data`, 3 objetos, 1.241 bytes, somente Jornada vinculada (fotografia dos metadados em 10/10/2026). A auditoria real só estará concluída quando `npm run audit:blob:safe` terminar com exit code 0 em um computador autenticado e os resultados forem verificados.

Não promover `main`, não executar `vercel deploy`, não criar uma rota temporária pública para a auditoria e não publicar enquanto as pendências de segurança e privacidade não forem resolvidas.
