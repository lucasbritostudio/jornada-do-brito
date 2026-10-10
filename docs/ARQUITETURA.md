# Arquitetura — estado inicial

## Objetivo

A Jornada do Brito será um sistema pessoal, mobile-first, para organizar vida, trabalho e finanças de forma integrada e gamificada.

## Limites já definidos

- A área pessoal e a futura área de clientes devem ter privacidade separada.
- O fluxo de cliente previsto é: solicitação → orçamento → aceite → contrato → produção → aprovação → pagamento.
- Estados financeiros devem ser distintos e não misturados.
- O sistema deve poder crescer sem ficar preso à infraestrutura do Chefe da Pizza.
- Não haverá domínio pago nesta fase.
- Não haverá banco de produção nesta fase.
- Não haverá autenticação real nesta fase.
- Não haverá integrações pagas nesta fase.

## O que NÃO será decidido por código agora

Antes da implementação funcional, validar:

- mapa principal e navegação;
- missões, níveis e conquistas;
- modelo de projetos;
- clientes e portal externo;
- finanças;
- equipamentos;
- permissões;
- autenticação;
- armazenamento;
- banco de dados;
- notificações.

## Infraestrutura inicial

GitHub:
- conta: `lucasbritostudio`
- repositório: `jornada-do-brito`
- visibilidade: privada
- branch principal: `main`

Vercel:
- ainda não criada;
- será conectada somente a este repositório;
- primeiro deploy será estático e sem efeitos externos.

## Regra de segurança

Nenhuma funcionalidade da Jornada deve depender de contas, bancos, Redis, domínios, serviços ou credenciais do Chefe da Pizza.
