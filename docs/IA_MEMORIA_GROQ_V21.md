# Jornada V2.1 — Memória da IA + Groq, sem deploy

Data: 10/10/2026. Projeto único: `lucasbritostudio/jornada-do-brito`.
Branch de segurança: `auditoria-v2-1-sem-deploy`.

## Correções feitas

**Memória da IA**
- Mantida escrita condicional de threads e índice com ETag/CAS: duas requisições concorrentes não podem sobrescrever silenciosamente uma à outra.
- Removido corte automático de metadados do índice em 500 conversas/300 lições; antes os blobs não eram apagados, mas conversas antigas deixavam de aparecer nas listagens. Agora o índice rejeita gravações acima de 3 MB em vez de descartar silenciosamente dados. Ao atingir limite será necessária paginação/partição (não desenvolvida aqui).
- Se a conversa é salva, mas a atualização do índice falha, `recordAiTurn` informa `indexPending: true` e a API retorna `memorySaved: true`, `memoryIndexPending: true`, evitando dizer incorretamente que a resposta não foi guardada.
- Criada reconciliação manual de metadados em `reconcileAiMemoryIndex` e rota autenticada `POST /api/ai/maintenance/reindex`, com origem igual ao aplicativo e confirmação explícita `RECONCILE_AI_MEMORY_INDEX`. Não é executada automaticamente nem durante esta etapa; só mexerá no índice quando acionada após publicação autorizada. **Não altera ou apaga threads.**
- A reconciliação recompõe metadados das conversas; não reconstrói automaticamente lições que eventualmente não foram registradas durante uma falha de feedback. Não prometer transação entre blobs.

**Groq e economia**
- O contexto compartilhado com a IA agora é limitado por assunto: conversas gerais não incluem saldos, credores, cobranças, estudo ou nomes de clientes. Perguntas financeiras usam agregados sem nomes de credores; dados de clientes só entram quando o nome for explicitamente mencionado ou houver pedido de listagem.
- Chamadas sem pedido explícito de registro não enviam os esquemas das ferramentas da IA, economizando tokens e reduzindo risco de ações sugeridas indevidamente.
- Proteção de segredos no texto do usuário já ocorre na borda do transporte; respostas de erro do provedor agora são genéricas para não devolver texto sensível vindo do serviço externo.
- `getGroqSecretStatus` confere se uma chave armazenada é realmente descriptografável antes de chamá-la de configurada; nenhuma credencial é impressa.
- Provedor não é acionado em testes automáticos: utilizam `fetch` simulado e mensagens fictícias. A Groq real, o consumo da conta e Data Controls/ZDR **ainda não foram autenticados**.

## Evidências de testes desta etapa

- `tests/llm-redaction.test.ts`: 4 cenários mockados de transporte, incluindo isolamento da senha no prompt corrente, retirada de ferramentas desnecessárias e erro 429 sem eco de segredo: **4/4 aprovados** em sandbox isolado.
- `tests/v2-regression.test.ts`, filtro apenas do cenário novo `memory keeps durable turn`: **1/1 aprovado**, simulando falha após gravar conversa e recuperação do índice.
- `tests/ai-context.test.ts`: em uma primeira execução, 3/4 passaram; um teste encontrou compartilhamento excessivo de cliente em pedido genérico. **A causa foi corrigida no código**, exigindo confirmação pós-correção antes de afirmar a suíte 4/4 aprovada.
- `npx tsc --noEmit` aplicado aos módulos da biblioteca de IA/memória/contexto armazenados no sandbox: **aprovado (exit 0)** antes da última mudança de filtragem de contexto e chat. A compilação completa do projeto, com as últimas mudanças, **ainda não foi executada**.
- Testes históricos (16/16, compilação Next.js do estado anterior) não foram repetidos de forma desnecessária e não são evidência da compilação desta versão.

## Dados e restrições reais

- O Blob privado existente foi inventariado em produção por ferramenta autorizada no computador do proprietário: 3 arquivos JSON válidos (state, auth, secrets), 1.241 bytes, **sem índice nem threads da IA** no momento. Portanto não havia memória histórica nessa store a migrar; não significa perda comprovada.
- Backup real criptografado desses 3 objetos foi confirmado pelo proprietário (`ENCRYPTED_BACKUP_VERIFIED`), sem restaurar nem modificar originais.
- A Vercel tem a configuração `GROQ_MODEL`; a presença e capacidade de descriptografar uma chave Groq em `secrets.json` não foram comprovadas pela auditoria agregada, e testar a API de forma autenticada ainda depende do ambiente que tem o segredo.
- A integração WhatsApp é outra missão, sem variáveis Meta cadastradas no projeto na última verificação.
- O projeto está em branch isolada. **Proibido deploy, preview e escrita em produção** durante esta etapa.

## Critério de liberação futura

Antes de qualquer publicação: executar `npm test`, `npx tsc --noEmit` e `npm run build` com a versão final; confirmar a configuração da chave Groq sem expô-la, testar uma chamada sintética autenticada com limite baixo de tokens e conferir configurações de privacidade Groq; manter backup; corrigir qualquer bloqueio real. Não confundir testes mockados com uma integração autenticada.

**Situação: melhorias implementadas na branch e parcialmente validadas, sem deploy.**
