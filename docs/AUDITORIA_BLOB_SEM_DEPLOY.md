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


## Verificação do mecanismo de segurança

O novo teste isolado `node --test tests/blob-audit-guard.test.mjs` foi executado em ambiente local Node 22, **3/3 aprovados**, cobrindo (1) vínculo correto, (2) projeto diferente, (3) equipe diferente ou falta de vínculo. O teste não necessita de rede, chaves, Blob nem Vercel.

Além de conferir o arquivo `.vercel/project.json`, o executor seguro agora fixa `VERCEL_PROJECT_ID`, `VERCEL_ORG_ID` e `--scope` na chamada oficial da Vercel, para evitar que variáveis antigas de outro projeto desviem o comando. Não há `vercel deploy`, `put` ou `del` neste fluxo.

**Estado desta entrega:** scripts e documentação publicados somente na branch. A execução do inventário dos três objetos reais permanece não realizada porque a sessão local autenticada do titular não está disponível ao executor atual. Nenhum dado de produção foi lido além dos metadados já confirmados pela integração oficial. A ferramenta é econômica e pronta para essa execução autorizada; não declarar que a auditoria histórica acabou antes de obter o relatório JSON.


## Revisão 10/10/2026 — leitura dos três arquivos privados

O auditor foi ampliado para tentar abrir **cada objeto JSON** existente em `jornada/`, incluindo `jornada/state.json`, `jornada/auth.json` e `jornada/secrets.json`, caso existam. Também examina índice e threads sem imprimir seus conteúdos. O resultado mostra apenas contagens agregadas, indicadores de integridade e número de possíveis exposições; arquivos binários não são abertos. Isso não concede acesso direto ao ChatGPT ao conteúdo; somente a sessão Vercel CLI **do titular** realiza a leitura e informa dados resumidos para revisão. Nenhuma variável/credencial é copiada para o chat, arquivo `.env` ou outro projeto. É necessário obter `npm run audit:blob:safe` concluído com código 0 na pasta `jornada-do-brito` corretamente vinculada para considerar o inventário finalizado.


## ✅ Auditoria REAL do Blob privado — concluída em 10/10/2026 (via máquina autenticada do proprietário)

O proprietário executou a ferramenta `npm run audit:blob:safe` em `C:\\Users\\Usuario\\jornada-auditoria-blob`, após `npx vercel login` e vínculo explícito com `pizzaria-sao-francisco-contingencia/jornada-do-brito`. A evidência foi uma captura do terminal compartilhada na conversa; o relatório agregado produzido pelo script mostrou:

```json
{
  "mode": "read-only",
  "exhaustive": true,
  "objectCount": 3,
  "totalBytes": 1241,
  "categories": {
    "state": 1,
    "auth": 1,
    "secrets": 1,
    "index": 0,
    "threads": 0,
    "files": 0,
    "other": 0
  },
  "checkedJson": 3,
  "suspectedSecretObjects": 0,
  "unreadableObjects": 0,
  "oversizedObjectsSkipped": 0,
  "jsonParseFailures": 0,
  "unseenThreadMetadata": null,
  "staleThreadMetadata": null
}
```

**Conclusão comprovada desta etapa:** os 3 objetos privados foram listados, lidos e analisados como JSON válido, sem erros de leitura, em modo somente leitura. Nenhuma mudança, exclusão, backup, publicação ou mensagem externa foi realizada durante a auditoria. A contagem é consistente com os metadados de store lidos anteriormente da Vercel.

**Ressalvas importantes:** não há `jornada/ai-memory/index.json` nem blobs de threads no armazenamento inspecionado; portanto não havia histórico de memória de IA ali para validar. Isto não prova perda de histórico: pode significar que nenhuma conversa foi persistida. A saída `suspectedSecretObjects: 0` se refere a padrões heurísticos e exclui intencionalmente o cofre criptografado e o registro de autenticação; não constitui prova de ausência completa de dados pessoais. O relatório não revela os conteúdos dos três arquivos ao assistente e não valida o significado de cada campo.

O Vercel CLI exibiu o aviso `2 Secret values cannot be pulled from the production Environment`, mas o comando de auditoria foi executado e acessou os objetos sem erro. As duas variáveis não foram identificadas no relatório; este aviso deve ser tratado separadamente da integridade do Blob, sem pedir ao proprietário que divulgue seus valores ou edite `.env.local`.

**Status desta etapa: FECHADA / leitura de Blob privado validada.** Ainda NÃO equivale à aprovação de deploy, teste de recuperação/backup ou validação do WhatsApp. Não repetir a mesma auditoria sem novo motivo.
