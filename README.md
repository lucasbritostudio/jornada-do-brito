# Jornada do Brito

Sistema pessoal e profissional para organizar atendimento, clientes, trabalho, finanças, dívidas, objetivos e evolução.

## Estado atual

A v1 utilizável está implementada com:

- autenticação própria de primeiro acesso;
- armazenamento privado;
- painel Hoje;
- CRM básico;
- pipeline e projetos preparados;
- entradas e saídas;
- dívidas;
- objetivos e missões;
- caixa de entrada do WhatsApp preparada para Cloud API;
- assistente inteligente local, sem envio de dados a modelo externo;
- exportação de backup JSON;
- PWA responsiva para iPhone e PC.

## Isolamento

Este projeto não usa infraestrutura, números, credenciais, bancos ou integrações da Pizzaria São Francisco nem do Chefe da Pizza.

## Persistência

A arquitetura de longo prazo continua preparada para Postgres/Supabase. A v1 operacional usa um repositório de dados abstrato implementado sobre **Vercel Private Blob**, permitindo uso imediato sem depender da criação de outra conta agora.

Esse modo é adequado para o uso inicial de uma única pessoa. A camada de dados foi isolada para permitir migração posterior para Postgres sem refazer a interface.

## Segurança

- dados em Blob privado;
- senha armazenada com scrypt + salt;
- sessão assinada e guardada em cookie HttpOnly/Secure;
- código de ativação separado do repositório;
- backup manual completo;
- nenhuma chave secreta versionada no Git.

## Integrações externas

### WhatsApp Business
O webhook, normalização de contatos/mensagens e rota de envio estão preparados. A conexão real depende do onboarding oficial da Meta do número atual, com coexistência obrigatória com o app WhatsApp Business no iPhone.

### IA
A Jornada possui análise local e integração com **Groq Free** usando o modelo `openai/gpt-oss-20b`.

A conexão da Groq pode ser feita dentro de **Configurações → Jornada IA**:
- a chave é validada diretamente com a Groq;
- é criptografada no servidor com AES-256-GCM;
- fica em Blob privado;
- o valor completo nunca volta para a interface;
- contexto enviado ao LLM é reduzido ao necessário;
- quando a Groq cair ou atingir o limite grátis, a Jornada usa análise local como fallback.

OpenRouter permanece desabilitado para dados privados por padrão.

## Documentação

Veja a pasta `docs/` para arquitetura, dados, UX, IA, WhatsApp, segurança e decisões técnicas.

## Regra permanente

**Não tocar nem depender da infraestrutura da Pizzaria São Francisco ou do Chefe da Pizza.**
