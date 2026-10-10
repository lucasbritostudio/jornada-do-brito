# ADR-001 — Stack principal

Status: ACEITO

## Contexto

A Jornada precisa reunir CRM, atendimento, projetos, finanças, objetivos e IA, com custo inicial mínimo e poucos serviços.

## Opções avaliadas

### Supabase
Vantagens:
- Postgres relacional;
- Auth;
- RLS;
- Storage;
- Realtime;
- Cron;
- Edge Functions;
- plano gratuito suficiente para início.

Limitação:
- Free não inclui backup automático.

### Firebase
Bom realtime e ecossistema, mas o modelo documental aumenta a complexidade para relações financeiras/CRM e integridade entre entidades.

### Neon + Auth + Storage separados
Excelente banco, mas exigiria mais fornecedores para autenticação e arquivos.

Decisão: Supabase.

## Frontend

Next.js + TypeScript + shadcn/ui.

Motivo:
- server/client no mesmo projeto;
- integração forte com Vercel;
- componentes acessíveis e customizáveis;
- boa base para PWA.

## IA

AI SDK + Mastra.

AI SDK:
- streaming;
- multi-model;
- provider-agnostic;
- tool calling.

Mastra:
- agentes;
- workflows;
- memória;
- human-in-the-loop;
- evals.

LangGraph permanece alternativa futura para fluxos que realmente precisem de controle de grafo de baixo nível.

## WhatsApp

Cloud API oficial atrás de adaptador próprio.
Assim, trocar de provedor não reescreve CRM/IA.

## Evidências

- Supabase docs: Auth + RLS + Storage + Realtime + Cron.
- Supabase pricing: Free inclui Postgres, Auth, MFA básico, Storage, Realtime e Edge Functions; Free não inclui backup automático.
- Vercel AI SDK docs: API unificada, streaming, multi-provider e tools.
- Mastra docs: agentes, memória, workflows, autenticação, eval loop e tool approvals.
- Meta official WhatsApp Business Platform/Postman: Cloud API e webhooks.
- shadcn/ui: componentes acessíveis e open-code.
