# Jornada do Brito

Sistema pessoal de vida, trabalho e finanças.

## Estado atual

**Fase: fundação técnica / arquitetura.**

Este repositório foi preparado para receber a aplicação sem antecipar regras de produto ainda não validadas.

### Princípios

- custo inicial: R$ 0;
- projeto totalmente separado do Chefe da Pizza e de outros sistemas;
- nenhuma credencial, banco ou serviço externo nesta fase;
- nenhuma regra de negócio será inventada;
- decisões de arquitetura e produto devem ser registradas antes da implementação;
- produção só será criada quando a base estiver validada.

## Deploy inicial

A raiz contém uma página estática, sem dependências, pronta para um primeiro deploy seguro na Vercel.

Ela serve apenas para validar:

1. GitHub → Vercel;
2. domínio gratuito da Vercel;
3. build/entrega;
4. isolamento da infraestrutura.

Depois dessa validação, a aplicação real poderá ser construída sobre a arquitetura aprovada.

## Estrutura

- `index.html` — página inicial temporária;
- `styles.css` — estilos da página temporária;
- `docs/ARQUITETURA.md` — limites e decisões atuais;
- `docs/PROXIMOS_PASSOS.md` — ordem segura de evolução;
- `.gitignore` — proteção contra arquivos locais e segredos.

## Segurança

Nunca versionar:

- senhas;
- tokens;
- chaves de API;
- arquivos `.env`;
- dados de clientes;
- dados financeiros reais.
