# Jornada do Brito — Importação privada de clientes e evolução, sem deploy

**Situação:** pacote privado pronto no Google Drive; teste de mesclagem 5/5 aprovado em Node 24 com dados sintéticos e rede bloqueada. Nenhum dado de clientes foi enviado ao GitHub. **O arquivo real ainda não foi importado ao Blob.**

## Material conferido
- Pacote de importação apenas de clientes: https://docs.google.com/document/d/1phLiS-35BgoYz_isQq0-MgFOMUlb_2J2R8wf1TFE_kI/edit
- Resumo de evolução por cliente: https://docs.google.com/document/d/1gfIs7DydAfH3byEFPP4Nx0hylN6tRz1Cub4ddBb4XmQ/edit
- Fontes: migração privada V1; Manual Comercial; projeto Garreto; projeto Berg; evolução profissional; cliente novo de 09/10.
- Conteúdo: 5 contatos nomeados, 4 oportunidades, 3 projetos, 1 briefing, 9 experiências datadas e 1 registro de contato sem nome confirmado.
- **Não importa transações, dívidas, contas, recebíveis ou outros projetos.**

## Uma execução no computador com Vercel já autenticada

1. Abra o pacote privado no Drive e escolha **Arquivo → Fazer download → Texto simples (.txt)**. O conteúdo foi criado como JSON em texto simples; não copie e cole para um chat público nem o envie à Groq.
2. Deixe **apenas uma cópia** desse arquivo na pasta **Downloads**. O nome inclui `CLIENTES E EVOLUÇÃO V2`.
3. Na pasta `jornada-auditoria-blob`, branch `auditoria-v2-1-sem-deploy`, execute:

```powershell
cd "$HOME\jornada-auditoria-blob"
git pull --ff-only
npm run import:clients:safe
```

O script confere automaticamente o vínculo exato com **Jornada do Brito**, o backup local pré-existente `Jornada-Backups/*.jbackup`, o lote `jornada-clientes-evolucao-2026-10-10-v2` e as relações entre clientes, projetos e experiências. Faz leitura do Blob, mostra contagens e escreve **uma única atualização condicional de estado (ETag)** somente se tudo estiver consistente; não faz deploy nem preview.

A saída esperada é `"status":"JORNADA_CLIENTS_IMPORTED"`. Se a importação já tiver acontecido antes, retorna `JORNADA_CLIENTS_ALREADY_IMPORTED`, sem duplicar. Qualquer colisão de nome sem chave de importação, alteração simultânea do estado ou ausência do token aborta **sem gravar**.

**É uma importação real de dados da Jornada**, portanto não execute no projeto errado; o bloqueio por ID de projeto existe justamente para impedir isso. Não repita em caso de erro sem mostrar o código de erro para diagnóstico. O comando não envia WhatsApp, não mexe em credenciais e não publica código.

## Onde visualizar

No site da Jornada já publicado: **Trabalho → Clientes**. As fichas mostrarão cliente, situação, próximo passo, contagem de experiências e aprendizado recente. A versão ampliada do painel, com histórico cronológico expansível `Minha evolução com este cliente`, foi codificada apenas na **branch de segurança** e **não aparece na produção antes de um deploy futuro autorizado**.

O histórico é factual. Por exemplo: o acordo de Garreto não autoriza presumir um contrato futuro; a desistência de uma festa por Berg não cancela todas; o contrato anterior de Tarcísio encerrado não gera renda mensal; recebível da Juliany não é dinheiro recebido. Qualquer nova informação deve ser confirmada antes de atualizar o CRM.

## Segurança e limites

- É um pacote **privado**. Nunca incorporar seu conteúdo em `package.json`, testes, código do repositório ou GitHub Actions.
- Os documentos originais permanecem no Google Drive, com fontes/datas preservadas nos registros migrados.
- As informações de WhatsApp foram resumidas no Drive, sem transcrição de áudios nem acesso automático às conversas.
- A importação não treina os pesos da Groq. O estado da Jornada usa essas experiências como contexto relevante quando o nome do cliente é explicitamente mencionado.
- Como qualquer alteração de estado, requer backup prévio; o backup real já foi confirmado.
- A importação **não executa deploy**; a interface de evolução completa permanece para publicação posterior.


## Privacidade no sistema atualmente publicado — reforço final

A versão publicada da Jornada ainda pode enviar à Groq até cinco regras recentes, mesmo em perguntas gerais. Por isso o importador trata os dados destinados a `clientExperiences` da seguinte maneira, sem alterar o documento original guardado no Drive:
- conserva `contactId` e os fatos históricos privados, para relacionar corretamente a experiência ao cliente;
- no campo `clientLabel` que a IA antiga utiliza em perguntas gerais, armazena apenas `Cliente atendido`, sem o nome;
- não inclui `nextAction` nas experiências importadas, para não divulgar passos individuais de atendimento em perguntas sem relação;
- exige que `learnedRule` não contenha links, e-mails ou sequências de 9+ números;
- permite que o usuário veja o nome **na ficha do contato** e a cronologia por `contactId`, sem exposição genérica de nomes de terceiros ao provedor externo.

**6/6 testes da mesclagem aprovados em Node24 com rede desligada**, mais 8 verificações adicionais em memória sobre o lote real (sem escrever dados), incluindo relacionamentos, privacidade e rejeição de informações pessoais. Os testes anteriores não foram repetidos à toa; somente os novos cenários foram reavaliados.

O pacote fonte do Drive preserva os nomes completos para uso humano. A importação acima é deliberadamente conservadora enquanto o código de contexto seletivo aguarda futura publicação autorizada.

**A importação real ainda exige execução única em PowerShell**. Não confundir teste de mesclagem com escrita no Blob de produção.


## Entrega pronta para download em conversa — sem exportar manualmente o Drive

O mesmo lote validado foi exportado em JSON, com o nome curto `jornada-clientes-v2.json`, como arquivo privado da conversa. O programa local encontra automaticamente este nome em `Downloads`. O JSON preserva os registros do Drive sem alterar conteúdo. Além das validações anteriores, o importador agora **compara o SHA-256 da representação JSON canônica** (`e7e7d46b7dc33f50bcb80d6a736a664a51cf90c19bb3b704aa77ac122115239f`) com o lote revisado. Se o arquivo for diferente ou adulterado, aborta **antes de ler/escrever o Blob**.

Passo simplificado: baixar `jornada-clientes-v2.json` a partir do arquivo entregue na conversa para `Downloads`; depois `git pull --ff-only` e `npm run import:clients:safe` na pasta Jornada autenticada. A importação é uma **gravação efetiva apenas dos dados de clientes da Jornada**; nenhuma mudança de código em produção ou deploy.

Se não aparecer `JORNADA_CLIENTS_IMPORTED` ou `JORNADA_CLIENTS_ALREADY_IMPORTED`, não afirmar que o lote foi carregado. Esse resultado de importação ainda está pendente.
