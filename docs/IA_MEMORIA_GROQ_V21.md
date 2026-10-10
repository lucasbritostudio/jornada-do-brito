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
- `tests/ai-context.test.ts`: na bateria inicial havia 1 falha de privacidade. A lógica foi corrigida, acrescentados dois cenários de proteção e **6/6 passaram** na execução final com Node 24, rede externa limitada, sem dados reais.
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


## Fechamento técnico da etapa AI+Groq — evidência posterior, 10/10/2026

Correções finais:
- Nomes de clientes exigem correspondência explícita com fronteiras de palavra e comparação sem diferença de acento. Exemplos: `Ana` é reconhecido, mas `banana` não revela a cliente Ana.
- Para perguntas sobre clientes, `compactContext` não envia automaticamente 12 nomes. Em perguntas de atendimento genéricas, nenhuma ficha individual é enviada; só há dados de até 6 clientes em pesquisa específica/listagem pedida.
- Perguntas sobre um cliente não incluem aprendizados globais de terceiros nem listas de tarefas e metas sem relação com a pergunta. A intenção de planejamento é necessária para enviar tarefas.
- A interface da IA informa quando a resposta foi exibida, mas a memória falhou, ou quando a conversa foi persistida e só falta reconciliar o índice. Feedback não salvo também é sinalizado.
- Em modo de manutenção, a reconciliação reconstitui **metadados E lições** do feedback já persistido, sem duplicar lições previamente indexadas. Nenhuma manutenção foi executada nos dados reais.

**Testes finais adicionais executados isoladamente, sem rede para Groq e sem contato com dados reais:**
- 6/6 — `tests/ai-context.test.ts`, incluindo regras de privacidade para finanças, clientes, nomes com/sem acento, e perguntas genéricas.
- 2/2 — dois casos novos da `tests/v2-regression.test.ts`: índice de memória com falha após gravação, recuperação de metadados, recuperação de lição após falha no feedback e não duplicação na repetição.
- 4/4 — `tests/llm-redaction.test.ts` em execução prévia desta etapa: sigilos ocultados, ausência de ferramentas em conversas informativas e erro 429 seguro.
- `tsc --noEmit` com Node24 e módulos `app/ai-drawer.tsx` e `lib/ai-context.ts`: exit code 0; módulos de memória/segredos/Groq da rodada anterior também obtiveram exit 0.
- Essas evidências verificam os componentes alterados. **Build completo Next.js desta versão, ligação autenticada real da conta Groq e salvamento de um novo turno real ainda não foram executados**. Portanto a etapa de desenvolvimento está implementada e tem testes direcionados, mas **não está liberada para deploy**.

Sandboxes de testes foram encerrados após a execução. Não houve atualização da `main`, preview, publicação ou alteração de clientes/projetos externos.


## Diagnóstico Windows — Groq não retornou resultado (10/10/2026)

O proprietário apresentou captura do PowerShell mostrando que a Vercel CLI carregou `.env.local`, avisou que **2 variáveis secretas não puderam ser recuperadas** e devolveu o prompt do terminal **sem emitir `SYNTHETIC_REQUEST_OK` nem `KEY_UNAVAILABLE`**. Portanto **a API Groq real NÃO está validada**; ausência de erro não prova sucesso. Não repetir a suíte completa ou os testes mockados já aprovados.

Correção preventiva registrada:
- `scripts/run-safe-groq-probe.mjs` agora executa diretamente o Node.js 24 com `--env-file-if-exists=.env.local`, reutilizando o arquivo da Jornada já vinculado/autenticado; **não consulta novamente nem exporta secrets da Vercel**, não faz deploy e verifica o ID do projeto/equipe antes.
- Exibe marcadores `GROQ_DIAGNOSTIC_START` e `GROQ_DIAGNOSTIC_EXIT=<código>` para impedir um resultado silencioso.
- `scripts/probe-groq.mjs` retorna exit code 2 quando uma variável indispensável não está disponível, em vez de fingir exit 0. Em caso de credenciais disponíveis, usa **somente uma frase fictícia** com no máximo 128 tokens de saída, sem alterar Blob.
- Execução do novo diagnóstico **depende do Windows autenticado do proprietário**. Comandos únicos: `git pull --ff-only` e `npm run probe:groq:safe`, sem compartilhar chaves nem conteúdo de `.env.local`.

Se a mensagem final for `KEY_UNAVAILABLE`, a próxima solução exige verificar a configuração de chave Groq pelos recursos próprios da Jornada; não criar um token alternativo nem contornar a proteção de duas variáveis secretas.


## Resultado comprovado do diagnóstico local — 10/10/2026

O proprietário executou `npm run probe:groq:safe` após `git pull --ff-only` em Windows, na pasta vinculada exclusivamente à Jornada. O relatório final foi:

```json
{"status":"KEY_UNAVAILABLE","reason":"BLOB_ENV_NOT_AVAILABLE"}
```

O script informou `GROQ_DIAGNOSTIC_EXIT=2`. Portanto, a tentativa **não chegou à API da Groq**. Isso não significa que a Groq ou a chave estejam inválidas: significa apenas que `BLOB_READ_WRITE_TOKEN` não está disponível para o processo Node local que carrega `.env.local`. O aviso anterior da Vercel informou 2 valores secretos não recuperáveis para a máquina local. **Não repetir essa mesma verificação nem solicitar a transferência de segredos.**

**Caminho autorizado alternativo, sem deploy:** abrir o sistema Jornada já hospedado em `https://jornada-do-brito.vercel.app`, entrar na conta e consultar em **Configurações → Jornada IA · Groq Free** o status de conexão. Essa tela e a rota autenticada `GET /api/settings/groq` já existem na `main` publicada, e podem consultar o cofre com as credenciais no próprio runtime Vercel sem expô-las ao computador ou ao chat. Se o cartão disser "Ativa", um teste sintético pelo chat do próprio sistema validará conectividade (não confundir a versão publicada com a nova branch); se disser "Pendente", será necessário configurar uma chave legítima pelo painel oficial da Jornada/Groq. Não digitar chaves no chat nem abrir arquivos locais de credenciais.

**Ainda sem teste real de Groq aprovado; sem deploy, preview ou alteração de dados.**
