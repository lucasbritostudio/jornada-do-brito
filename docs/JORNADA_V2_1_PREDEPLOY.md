# Jornada V2.1 — Preparação técnica, sem publicação

Data: 2026-10-10. Repositório: lucasbritostudio/jornada-do-brito.
Base: a9c150547fe544bf75b8ace3a5c24d7fecbb2753.
Branch isolada: auditoria-v2-1-sem-deploy.
Este documento registra apenas verificações e alterações efetivamente executadas.

## Correções implementadas na branch

- lib/store.ts: leitura sem cache de blobs privados mutáveis e atualização do estado por ETag / ifMatch. Um estado antigo não pode sobrescrever mudanças recentes; conflitos falham em vez de apagar dados. A criação inicial usa proteção contra sobrescrita. Ativação existente também é protegida.
- lib/ai-memory.ts: ETag e controle de concorrência nos threads e no índice, novas tentativas limitadas quando há conflito e atualização de metadados sem recuo de versão; feedback e memória permanecem redigidos.
- lib/secrets.ts: cofre Groq com leitura consistente e escrita condicional para evitar sobrescrita.
- lib/blob-conflict.ts: identificação de conflitos; rotas de estado, importação, ações e undo retornam HTTP 409 sem tentar repetir operações com efeitos colaterais.
- lib/memory-retention.ts: plano de revisão SOMENTE LEITURA. Sem política aprovada, nenhuma retenção automática é presumida. Casos não resolvidos não entram no descarte automático.
- tests/v2-regression.test.ts: mocks com ETag e casos para estado obsoleto, memória concorrente e segredo cifrado.
- tests/retention-plan.test.ts: plano de revisão, proteção de casos abertos e datas inválidas.
- package.json: Node 24 e script com o novo teste.

A escrita condicional é respaldada pela documentação oficial do Vercel Blob; também exige leitura com useCache:false para evitar versão antiga no CDN, o que pode aumentar Fast Origin Transfer.
Fontes: https://vercel.com/docs/vercel-blob e https://vercel.com/changelog/vercel-blob-now-supports-consistent-reads-on-private-storage

## Estado de validação (não confundir implementação com teste)

- Verificada a existência do projeto Vercel jornada-do-brito, equipe team_ZEmFS6erUu5qbXgYyze8PWdm, com variável BLOB_READ_WRITE_TOKEN cadastrada em modo criptografado, sem revelar seu valor.
- NÃO houve acesso direto de leitura aos objetos reais do Blob, logo nenhum inventário histórico real foi concluído.
- NÃO foram realizados login autenticado, Groq, Meta, WhatsApp ou transações reais. Não há credenciais de teste isolado acessíveis neste executor.
- NÃO foram executados npm test, tsc ou npm run build neste executor porque o clone autenticado/dependências não estão disponíveis para execução local. Os novos testes constam no repositório mas ainda não possuem resultado real nesta rodada.
- Projeto não possui package-lock.json; instalar versões sem lockfile reduz reprodutibilidade. Gerar e revisar lockfile em ambiente Node 24 com conectividade antes da publicação.
- A consulta somente leitura da Vercel mostrou o deployment de produção anterior dpl_2LwDVwg29GWxDbdUxJU1R9vtHfz5, associado ao SHA 31047ea17e0a18ec7e4457b94e929dc76c155a75. Não é o código da branch; não se assume paridade com main.

## Riscos técnicos residuais

1. Gravar thread e atualizar índice envolve DOIS blobs, sem transação atômica. Uma falha entre as gravações pode deixar thread órfão. Reconciliar índice/threads antes de publicação e testar falhas parciais.
2. Estado principal compartilhado é protegido contra perda silenciosa, mas requests concorrentes podem receber 409 e requerem reenvio seguro. Não repetir automaticamente WhatsApp ou efeitos financeiros sem idempotência no provedor.
3. Criptografia das chaves e filtro de texto não provam segurança de objetos históricos anteriores à proteção.
4. Exclusão operacional, prazo de retenção e política LGPD ainda exigem autorização específica; lib/memory-retention.ts apenas planeja, NÃO apaga.
5. Validar a configuração da conta Groq em Data Controls. Segundo a documentação oficial, requisições de inferência não são retidas por padrão; logs temporários de confiabilidade/abuso podem existir por até 30 dias; Zero Data Retention é opção configurável. A configuração desta conta não foi verificada. https://console.groq.com/docs/your-data
6. Ainda não existe evidência de testes autenticados em ambiente isolado nem teste de concorrência com Vercel Blob real.
7. As sete alterações locais não publicadas do Codex, mencionadas em conversa, não estão incorporadas porque não existem na origem GitHub. Não foram descartadas pelo trabalho nesta branch.

## Plano do único deploy futuro (NÃO AUTORIZADO NESTA MISSÃO)

PRÉ: recuperar eventual trabalho local ainda relevante, gerar lockfile e executar npm ci, npm test, npx tsc --noEmit, npm run build; inventariar Blob histórico real somente leitura; testar concorrência com dados sintéticos em store separado; confirmar acesso autenticado por conta de teste; revisar controles Groq e WhatsApp; verificar que a branch não cria preview; obter backup consistente do Blob e testar procedimento de restauração.

REVISÃO: revisor independente inspeciona os arquivos e potenciais efeitos colaterais, especialmente envio externo seguido de gravação do estado, e confirma zero falhas críticas.

DEPLOY: somente com autorização específica, identificar SHA exato, fazer uma publicação controlada, validar login/AI/memória/feedback/import/undo em ambiente autenticado e verificar logs sem PII.

PARADA: bloquear publicação se inventário real, restore, smoke tests, concurrency ou segurança falharem.

ROLLBACK: reverter somente o deployment do projeto Jornada pelo painel Vercel ao deployment previamente validado; nunca assumir que rollback de código restaura estado. Restauração de dados precisa backup específico do Blob e autorização destrutiva própria.

## Veredito atual

NÃO PRONTO PARA DEPLOY.
Produção não alterada deliberadamente, nenhuma limpeza nem mensagem real executada.


## Continuação autorizada em 10/10/2026 — sem deploy

Verificações documentais adicionais:
- SDK Vercel Blob documenta ifMatch com erro BlobPreconditionFailedError e a opção useCache:false para leituras consistentes: https://vercel.com/docs/vercel-blob e https://vercel.com/changelog/vercel-blob-now-supports-consistent-reads-on-private-storage.
- Groq documenta que inferência normalmente não é retida, mas existem exceções para confiabilidade/abuso de até 30 dias, mitigadas por Zero Data Retention ativável na conta. A configuração da conta da Jornada NÃO foi acessada: https://console.groq.com/docs/your-data.
- Limites Groq Free de openai/gpt-oss-20b descritos pela Groq: 30 RPM, 1000 RPD, 8000 TPM, 200000 TPD; limites da organização podem variar: https://console.groq.com/docs/rate-limits.

Correções adicionais preservadas nesta branch:
- lib/state-mutation.ts: tentativas limitadas exclusivamente para alterações locais determinísticas. Chamadas externas jamais repetidas pelo utilitário.
- app/api/whatsapp/send/route.ts: depois de aceitação pela Meta, reabre o estado e registra a mensagem com repetição segura de persistência. Se persistência continuar falhando, responde HTTP 202 com aviso explícito para NÃO reenviar e ID do provedor, evitando reenvio a partir dessa falha.
- app/api/webhooks/whatsapp/route.ts: evento inbound e identificador do provedor agora são persistidos antes da resposta automática. Webhooks duplicados são deduplicados pelo providerMessageId. Uma resposta já enviada pela Meta jamais é repetida na rotina de reconciliação do estado.
- lib/store.ts: inicialização segura do estado vazio foi preservada, com escrita uma única vez e ETag correspondente.
- tests/v2-regression.test.ts: teste adicional de resolução de conflito por reconsulta do estado.
- tests/whatsapp-contract.test.ts: contratos sintéticos para mensagem aceita pela Meta com falha de registro e webhook inbound gravado antes da automação, sem repetição no replay.

Riscos residuais de WhatsApp: duas requisições manuais independentes ainda podem solicitar a mesma mensagem; não há chave idempotente de requisição durável antes do envio Meta. Se o processo cair após a Meta aceitar, mas antes de salvar, a mensagem poderá não aparecer imediatamente no histórico até reconciliação. A V2.1 permanece dependente de smoke test real isolado e de plano de recuperação. A solução reduz duplicações, mas não garante entrega exatamente uma vez.

Os testes adicionais estão ESCRITOS no GitHub; nenhuma execução integral da suíte, TypeScript ou build foi comprovada nesta rodada. NÃO DECLARAR APROVADO. Não foi feito deploy/preview, nem acesso/destruição do Blob real.


## Validação real da branch em sandbox isolado — 10/10/2026

Ambiente: Vercel Sandbox `jornada-v21-qa-isolada`, sessão `sbx_ADWZVn4dwD5XdX63r90daIepUw4P`, Node 24, 2 vCPU, 4 GB RAM, sem secrets injetados, com arquivos obtidos da branch no GitHub. Sandbox sem portas externas e não persistente (parada automaticamente ao atingir tempo-limite). Sandbox NÃO equivale a deploy, preview ou alteração de produção.

Foi executado `npm install --no-audit --no-fund --ignore-scripts` para dependências locais, em seguida:
- `npm test`: **APROVADO — 16/16 testes** (10 em `tests/v2-regression.test.ts`, 1 import, 3 retenção e 2 contratos WhatsApp). Resultados lidos do log `/tmp/jornada-test.log`, com todos os casos marcados como aprovados. Nenhuma integração real foi acionada.
- `npx tsc --noEmit`: **APROVADO**, exit code 0.
- `npm run build`: **APROVADO**, exit code 0. Next.js 16.4.0, compilação em 7s, TypeScript concluído, 25/25 páginas estáticas geradas. Rotas `/api/ai/retention`, `/api/webhooks/whatsapp` e `/api/whatsapp/send` incluídas no build.
- Os testes usam mocks locais e não comprovam isolamento/autorização/consistência da instalação real do Blob nem autenticação ponta a ponta.
- `package-lock.json` foi gerado pelo npm no sandbox (46.852 bytes, SHA-256 adca55d7a28d7a8a3e7e394709df19d012481a1a6aaf85a41f4db4d6fc288f9a), mas **não foi incorporado ao repositório** antes do ambiente efêmero parar. É pendência antes da publicação.
- Inventário real dos objetos Blob não realizado. A operação de encaminhamento da credencial cifrada para o ambiente isolado foi bloqueada pelo controle de segurança do acesso disponível. **O bloqueio foi respeitado; nenhuma tentativa de contorno foi realizada.** Sem credencial autorizada viável não há prova de conteúdo histórico, retenção/segurança efetiva ou de smoke test autenticado.
- A configuração Groq Data Controls/ZDR da conta não foi acessada e continua pendente.

Após essa validação, o veredito de publicação permanece **NÃO PRONTO PARA DEPLOY** exclusivamente pelas verificações reais pendentes, lockfile e revisão operacional de efeitos externos. Código da branch compilou e testes sintéticos passaram. Produção intocada.


## Auditoria nativa segura de metadados do Blob (10/10/2026)

Foi encontrado um meio de verificar o Blob diretamente pela integração autenticada oficial da Vercel, **sem acessar/transferir o valor do BLOB_READ_WRITE_TOKEN**. O identificador da loja foi obtido pelo campo `contentHint.storeId` da variável configurada no projeto e utilizado na leitura nativa `get_storage_stores_by_id` (somente leitura).

- Store: `store_wyYywwTi8yczS3z1`, nome `jornada-do-brito-data`.
- Tipo Blob com acesso **private**, status `available`, região `gru1`, cobrança `active`, quota não excedida.
- Contagem reportada pela Vercel: **3 objetos**, tamanho total **1.241 bytes** (metadados agregados; não presumir exatidão transacional).
- **Somente 1 projeto conectado**, `jornada-do-brito`, e nos ambientes production/preview/development. Não há indício nessa vinculação de conexão de outro projeto.
- Não foram devolvidos nem expostos valores de chaves ou conteúdos de dados de clientes.
- Logs agrupados e erros da Vercel: nenhum erro de runtime no intervalo consultado de 7 dias; a ausência de erros registrados **não comprova** todos os caminhos exercitados.

**Limite da integração nativa**: permite inspecionar metadados da store, mas **não** listar os nomes individuais dos objetos nem ler o conteúdo de seus blobs. Portanto 3 objetos/1.241 bytes NÃO significam ausência de segredos em histórico, não provam exportação/recuperação de backup e não substituem auditoria real do conteúdo. A ferramenta `npm run audit:blob` foi preparada para ambiente que já possua a credencial de forma segura, porém não foi executada. Não houve deploy, preview, limpeza, escrita ou migração de dados. Veredito de prontidão permanece **NÃO PRONTO PARA DEPLOY**.


## Segurança do envio à IA — ajuste e comprovação sem rede

- A camada `lib/llm.ts` agora sanitiza mensagens com role=`user` na fronteira de transporte, tanto no envio simples à Groq/OpenRouter quanto no envio com ferramentas. Isso protege o prompt corrente mesmo quando a rota `/api/ai/chat` esquece de aplicar a sanitização. Mensagens de sistema e contexto mantêm a preparação original, evitando truncar involuntariamente o contexto maior.
- `LlmProviderError` foi ajustado para não depender do TypeScript parameter-property syntax, que o runtime `node --experimental-strip-types` não suporta; a API pública da classe não foi alterada.
- **2/2 testes novos de privacidade passaram no Node 24** em sandbox isolado, sem qualquer chamada externa. Os testes substituem o `fetch` e capturam apenas dados fictícios. Evidência: `tests/llm-redaction.test.ts` comprova remoção de uma senha falsa e uma chave falsa nos dois transportes.
- Duas tentativas iniciais desse teste no sandbox isolado não passaram por configuração incompleta do fixture e sintaxe TypeScript sem transformação. O fixture foi corrigido e a sintaxe do código da biblioteca tornou-se compatível, com aprovação 2/2 na execução corrigida; não interpretar falhas anteriores como instabilidade real da integração.
- O novo teste está no `npm test`, mas **a suíte completa não foi repetida** nesta etapa, em respeito à economia e à orientação de não refazer testes que já passaram. O último build completo aprovado continua anterior às últimas alterações de código, exigindo verificação final apenas antes de qualquer publicação.

## Reprodutibilidade e impedimentos reais

Foi gerado um package-lock em ambiente efêmero Node 24 com `npm install --package-lock-only`, mas a captura automatizada do arquivo através da integração falhou porque o sandbox encerrou antes da transferência. **Nenhum package-lock foi incluído no repositório.** Não repetir o mesmo procedimento ineficiente. O caminho mais econômico é concluir esse artefato diretamente em um clone autorizado com `npm install --package-lock-only`, revisar e salvar o lockfile na branch.

O inventário completo dos 3 objetos do Blob real não pode ser executado deste executor sem uma sessão Vercel CLI autenticada pertencente à Jornada, e não deve receber o token da produção por transferência entre conectores. O procedimento `npm run audit:blob:safe` já foi implementado e isolado por projectId/teamId, sem deploy nem exportação de segredos. A integração oficial disponível confirmou somente os metadados da loja. Essa é uma limitação efetiva, não uma validação concluída.

**Não pronto para publicação** até obter evidência de auditoria dos conteúdos, confirmar restauração e executar smoke tests reais em ambiente isolado sem mensagens ou gravações de clientes. Nenhum deploy realizado.


## Inventário de credenciais existentes na Vercel (nomes, não valores) — 10/10/2026

A integração oficial Vercel `filter_project_envs(decrypt=false)` confirmou: 8 variáveis cadastradas, dentre elas `BLOB_READ_WRITE_TOKEN`, `JORNADA_SESSION_SECRET`, `JORNADA_BOOTSTRAP_TOKEN`, `GROQ_MODEL`, `AI_PROVIDER` e as configurações de localidade. **Não existem variáveis `WHATSAPP_*` cadastradas neste projeto**. Particularmente faltam `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` e `WHATSAPP_APP_SECRET`. Esta é uma limitação confirmada da integração externa atual, e a publicação por si só não a resolve.

Foi criado o script `scripts/preflight-environment.mjs` que valida presença dessas variáveis sem imprimir seus valores; requer vínculo do diretório exatamente com a Jornada antes de ler o ambiente. Comando disponível: `npm run preflight:env` (rodar sob `vercel env run -e production -- npm run preflight:env`, no projeto corretamente vinculado). A ausência de WHATSAPP não bloqueia recursos independentes, mas bloqueia concluir testes de envio e recebimento com a API oficial da Meta.

O inventário somente leitura do Blob real e os testes autenticados estão bloqueados pela ausência de uma sessão CLI local já autenticada no projeto, uma vez que o conector atual disponibiliza apenas metadados do armazenamento e não permite transportar segredos ao executor. É proibido contornar a restrição de segurança. Não foi conectado um WhatsApp Business, não foram criados tokens nem enviados contatos/mensagens reais.

Os sandboxes temporários de validação usados nesta fase estão parados e são não persistentes. Nenhuma alteração na produção e nenhum deploy/preview.
