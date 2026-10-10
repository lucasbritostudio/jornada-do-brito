# Arquitetura v1 — Jornada do Brito

## 1. Objetivo do sistema

A Jornada do Brito será o sistema central para organizar vida, trabalho, clientes, atendimento, dinheiro, dívidas, objetivos e ambições de Brito.

A arquitetura foi desenhada para:
- funcionar bem no iPhone e no PC;
- começar simples e crescer sem reconstrução;
- manter dados pessoais e de clientes separados por permissão;
- suportar IA nativa sem permitir ações críticas descontroladas;
- integrar WhatsApp sem depender de Chefe da Pizza ou Pizzaria São Francisco;
- começar com custo muito baixo ou zero;
- manter dados relacionais consistentes e auditáveis.

## 2. Princípios de produto

1. **Uma tela, uma intenção principal.**
2. **Progressive disclosure:** mostrar só o necessário agora; detalhes ficam um nível abaixo.
3. **Sem painel poluído:** a tela inicial mostra o que precisa de atenção hoje, não tudo que existe no banco.
4. **Estados claros:** toda oportunidade, projeto, dívida, cobrança e objetivo tem um estado explícito.
5. **Uma fonte de verdade:** dinheiro, mensagens e clientes não são duplicados em módulos diferentes.
6. **IA como copiloto, não como dona dos dados.**
7. **Mobile-first, desktop poderoso.**
8. **Nada da Jornada depende de infraestrutura do Chefe ou São Francisco.**

## 3. Arquitetura de navegação

### Mobile — navegação principal
Cinco áreas persistentes:
- **Hoje**
- **Conversas**
- **Trabalho**
- **Finanças**
- **Jornada**

A IA fica acessível de qualquer tela por um botão discreto no cabeçalho e por uma caixa de comando contextual. Ela não ocupa uma aba principal para não substituir a navegação normal.

### Desktop
Sidebar com:
- Hoje
- Caixa de entrada
- Clientes
- Oportunidades
- Projetos
- Financeiro
- Dívidas
- Jornada
- Arquivos
- IA
- Configurações

### Tela Hoje
A tela principal terá ordem de prioridade, não uma grade gigante:
1. **Agora** — a próxima ação mais importante.
2. **Pendências** — clientes sem resposta, vencimentos, prazos.
3. **Dinheiro** — resumo curto de caixa, entradas, saídas e vencimentos próximos.
4. **Jornada** — progresso do objetivo mais relevante.
5. **Resumo da IA** — briefing curto e acionável.

### Trabalho
A área Trabalho agrupa o ciclo real:
Contato → oportunidade → orçamento → aceite → projeto → entrega → aprovação → pagamento.

Isso evita criar módulos soltos que obrigariam Brito a repetir informação.

## 4. Stack escolhida

### Frontend / aplicação
- Next.js App Router
- TypeScript
- React
- Tailwind CSS
- shadcn/ui
- Zod para validação
- React Hook Form para formulários complexos
- Lucide para ícones
- Recharts apenas onde gráfico realmente ajuda

### Backend / dados
- Supabase:
  - Postgres
  - Auth
  - Storage
  - Realtime
  - Cron
  - Edge Functions quando necessário
- Migrações SQL versionadas no repositório
- Row Level Security em toda tabela acessível ao app

### IA
- Vercel AI SDK como camada de modelos, streaming e tool calling
- Mastra como camada de agentes, memória e workflows
- Provedor de LLM trocável por configuração
- PostgreSQL como fonte de verdade
- Memória da IA separada dos dados oficiais

### WhatsApp
- Adaptador próprio `WhatsAppProvider`
- Primeira opção técnica: WhatsApp Business Platform / Cloud API oficial
- Coexistência com o número atual só será ativada após confirmar elegibilidade e fluxo de onboarding
- Nenhuma dependência de Evolution usada por outros projetos

## 5. Por que Supabase

O sistema é altamente relacional: cliente se liga a conversa, oportunidade, projeto, cobrança, pagamento e arquivo. Postgres representa isso melhor do que um banco puramente documental.

Supabase foi escolhido porque reúne no mesmo projeto:
- Postgres;
- autenticação;
- autorização via RLS;
- arquivos privados;
- realtime;
- cron;
- funções.

Isso reduz integrações e custo operacional.

O plano Free atual inclui banco Postgres, Auth, MFA básico, Storage, Realtime e Edge Functions, suficiente para iniciar. A limitação importante é que o plano Free não oferece backups automáticos, então a Jornada terá estratégia própria de exportação/backup antes de armazenar dados insubstituíveis.

## 6. Arquitetura multiusuário preparada

Mesmo começando com Brito como único usuário interno, todas as entidades principais terão `workspace_id`.

Papéis previstos:
- owner
- admin
- member
- client

O papel `client` nunca terá acesso às áreas pessoais, financeiras internas ou conversas que não sejam explicitamente compartilhadas.

## 7. Arquitetura por domínios

### Atendimento
- contatos
- conversas
- mensagens
- anexos
- estados do atendimento
- sugestões da IA
- follow-ups

### CRM / Comercial
- clientes e prospects
- oportunidades
- orçamento
- aceite
- notas
- atividades
- próximos passos

### Projetos
- projeto
- etapas
- tarefas
- entregáveis
- aprovações
- arquivos
- cronograma
- valores e recebimentos relacionados

### Financeiro
- contas
- transações
- categorias
- transferências
- recebíveis
- pagamentos
- dívidas
- parcelas

### Jornada
- áreas da vida
- ambições
- objetivos
- marcos
- missões
- check-ins
- conquistas
- XP

### IA
- threads
- memória auxiliar
- sugestões
- chamadas de ferramenta
- aprovações
- avaliações
- auditoria

## 8. Regras de consistência

### Dinheiro
- valores monetários armazenados em centavos inteiros, nunca float;
- marcar um recebível como pago cria/vincula uma transação, não duplica receita;
- pagar parcela de dívida cria/vincula uma saída;
- transferências entre contas não contam como receita ou despesa;
- totais do painel são derivados dos registros, não salvos manualmente.

### Clientes
- um contato pode virar prospect, cliente ou parceiro sem duplicar cadastro;
- WhatsApp identifica o contato pelo canal/telefone normalizado;
- conversa é vinculada ao contato e pode se ligar a oportunidade/projeto.

### Objetivos
- ambição = direção de longo prazo;
- objetivo = resultado mensurável;
- marco = checkpoint;
- missão = ação concreta;
- XP recompensa execução de ações planejadas, não gasto de dinheiro.

## 9. Eventos e automações

A aplicação terá uma tabela de eventos de domínio e uma outbox para automações.

Exemplos:
- mensagem recebida;
- cliente criado;
- orçamento aceito;
- vencimento próximo;
- dívida paga;
- objetivo atualizado.

A mudança de estado é salva primeiro. Depois automações/IA reagem ao evento.

Isso evita que uma falha da IA ou do WhatsApp impeça o dado principal de ser salvo.

## 10. Estratégia de busca

Fase 1:
- busca SQL;
- texto completo;
- filtros por cliente, projeto, data e estado.

Fase 2:
- pgvector para busca semântica em documentos, resumos e conversas longas.

Não usar embeddings para dados estruturados que podem ser consultados com SQL.

## 11. PWA e dispositivos

A interface será responsiva e instalável como PWA.

No início:
- cache apenas de shell e recursos estáticos;
- dados sensíveis não ficam disponíveis offline por padrão;
- rascunhos locais podem ser persistidos quando seguro.

## 12. Observabilidade

Sem serviço pago obrigatório na primeira versão:
- logs Vercel;
- logs Supabase;
- tabela de audit_log;
- tabela de system_events;
- página interna de saúde para integrações.

Erros críticos devem mostrar:
- integração afetada;
- última execução;
- causa conhecida;
- ação recomendada.

## 13. Estratégia de backup

Como o Supabase Free não oferece backup automático:
- botão de exportação completa;
- exportação JSON/CSV por domínio;
- exportação criptografada geral;
- posteriormente backup automático para uma conta externa controlada por Brito;
- nenhum backup sensível em repositório Git.

## 14. Critério de arquitetura concluída

Arquitetura v1 está pronta quando:
- navegação;
- domínios;
- modelo de dados;
- segurança;
- IA;
- WhatsApp;
- finanças;
- estratégia de backup;
- tecnologia;
- permissões;
estiverem definidos sem depender de decisões técnicas críticas em aberto.

## 15. Fontes técnicas usadas

- Supabase Auth / RLS / Storage / Realtime / Cron: documentação oficial Supabase.
- Vercel AI SDK: documentação oficial Vercel.
- Mastra: documentação oficial Mastra.
- WhatsApp Business Platform: documentação/coleção oficial Meta.
- shadcn/ui: documentação oficial e componentes acessíveis.
- Referências de produto estudadas: sistemas open-source de CRM, projetos e finanças para observar padrões, sem copiar sua arquitetura integral.
