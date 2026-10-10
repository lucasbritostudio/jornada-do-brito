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
