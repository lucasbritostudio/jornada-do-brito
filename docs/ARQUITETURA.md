# Arquitetura — Jornada do Brito

Status: **v1 concluída**

A arquitetura funcional e técnica da Jornada foi fechada em 09/10/2026.

## Documentos oficiais

- [Arquitetura v1](./ARQUITETURA_V1.md)
- [Modelo de dados v1](./MODELO_DADOS_V1.md)
- [UX v1](./UX_V1.md)
- [IA e agentes v1](./IA_AGENTES_V1.md)
- [WhatsApp v1](./WHATSAPP_V1.md)
- [Segurança v1](./SEGURANCA_V1.md)
- [ADR-001 — Stack](./ADR-001-STACK.md)
- [Próximos passos](./PROXIMOS_PASSOS.md)

## Stack

- Next.js + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase: Postgres, Auth, Storage, Realtime, Cron
- Vercel AI SDK
- Mastra
- WhatsApp Business Platform / Cloud API atrás de adaptador próprio

## Escopo

A Jornada organizará:
- atendimento;
- clientes e oportunidades;
- projetos;
- financeiro;
- dívidas;
- objetivos e ambições;
- arquivos;
- IA;
- automações.

## Regra de isolamento

Nenhuma funcionalidade da Jornada pode depender de infraestrutura, credenciais, banco, Redis, WhatsApp, Evolution ou serviços da Pizzaria São Francisco ou do Chefe da Pizza.

## Estado

A próxima fase é implementação.
As decisões que exigem informação pessoal/operacional de Brito serão perguntadas uma por vez.
