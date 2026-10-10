# Segurança v1 — Jornada do Brito

## Modelo de ameaça principal

A Jornada guardará:
- dados financeiros;
- dívidas;
- contatos;
- mensagens;
- arquivos;
- dados de clientes.

Portanto, "funciona" não é suficiente: acesso precisa ser restrito e auditável.

## Autenticação

Supabase Auth.

Primeira versão:
- login por e-mail;
- TOTP MFA disponível e recomendado;
- sessão server-side no Next.js.

Para áreas de maior risco, políticas podem exigir nível de autenticação forte (AAL2).

## RLS

Todas as tabelas expostas recebem RLS.

Regra padrão:
usuário só acessa linha quando é membro do `workspace_id`.

Clientes:
papel `client` usa políticas específicas e só vê dados explicitamente compartilhados.

## Service role

A chave service role:
- nunca vai para browser;
- fica apenas no servidor;
- não é usada em rotas comuns quando o JWT do usuário é suficiente.

## Arquivos

Buckets privados.
Downloads via usuário autenticado ou signed URL curta.

## Segredos

Apenas env vars.
Nunca:
- Git;
- banco como texto sem criptografia quando for segredo;
- localStorage;
- logs.

## Financeiro

- valores em centavos;
- histórico auditável;
- alterações em registros conciliados geram correção/estorno, não edição silenciosa;
- deleções críticas são arquivadas/soft delete.

## IA

- ferramentas com schemas;
- aprovação por risco;
- logs de tool runs;
- dados mínimos no prompt;
- nenhuma credencial exposta ao modelo;
- resultados da IA tratados como não confiáveis até validação.

## WhatsApp

- validar assinatura do webhook;
- deduplicar eventos;
- processar assíncrono;
- não confiar na ordem;
- armazenar apenas o necessário;
- mídia privada.

## Auditoria

audit_logs é append-only no app.
Registra mudanças importantes com before/after e origem.

## LGPD / privacidade operacional

Arquitetura prepara:
- exportar dados de um contato;
- remover/anomizar quando legalmente aplicável;
- separar dado interno de dado compartilhado;
- registrar origem do contato;
- minimizar coleta.

## Backups

Supabase Free não tem backup automático.
Antes de considerar o sistema pronto para ser a única cópia de dados importantes:
- exportação geral precisa funcionar;
- procedimento de backup externo precisa estar documentado;
- teste de restauração deve existir.

## Testes mínimos

- unitários de regras financeiras;
- testes RLS;
- E2E de autenticação;
- E2E de criação/edição;
- webhook idempotente;
- permissões client vs owner;
- acessibilidade com axe;
- teste de restauração/exportação.
