# Arquitetura de IA e agentes v1 — Jornada do Brito

## Objetivo

A IA deve ajudar Brito a perceber, decidir e agir melhor.
Ela não substitui a base de dados nem executa ações críticas sem controle.

## Camadas

### 1. AI SDK
Responsável por:
- streaming;
- modelos;
- structured output;
- tool calling;
- fallback entre provedores.

### 2. Mastra
Responsável por:
- agentes especializados;
- workflows;
- memória;
- orquestração;
- observabilidade/evals.

### 3. Ferramentas da Jornada
Ferramentas tipadas e validadas:
- buscar cliente;
- listar mensagens;
- criar sugestão;
- registrar follow-up;
- consultar financeiro;
- criar rascunho de transação;
- consultar objetivos;
- criar missão proposta.

A IA nunca escreve diretamente no banco fora dessas ferramentas.

## Conselho de agentes

### Orquestrador Jornada
Entende a intenção e chama o especialista adequado.
Não precisa ser o agente mais caro.

### Agente de Atendimento
- resume conversa;
- classifica intenção;
- detecta urgência;
- sugere resposta;
- propõe follow-up;
- sugere transformar contato em oportunidade.

### Agente Comercial
- qualifica oportunidade;
- prepara perguntas;
- resume necessidade;
- sugere próximo passo;
- acompanha proposta sem linguagem de cobrança agressiva.

### Agente de Projetos
- monitora prazo;
- detecta bloqueios;
- resume o que falta;
- transforma briefing aprovado em plano de execução.

### Agente Financeiro
- explica fluxo de caixa;
- categoriza sugestões;
- detecta vencimentos;
- mostra impacto de dívidas;
- faz projeções.

Nunca:
- movimenta dinheiro;
- paga conta;
- altera saldo arbitrariamente.

### Agente de Jornada
- transforma ambição em objetivo;
- propõe marcos e missões;
- analisa progresso;
- evita criar uma lista excessiva de tarefas.

### Agente de Memória
Não é fonte de verdade.
Mantém resumos de contexto, preferências e histórico de trabalho para reduzir repetição.

## Política de ferramentas

### Risco baixo — pode executar automaticamente
- leitura;
- busca;
- resumo;
- classificação;
- criar sugestão;
- gerar rascunho.

### Risco médio — exige aprovação inicialmente
- criar/editar cliente;
- criar follow-up;
- criar tarefa;
- mudar etapa de oportunidade;
- registrar transação sugerida pela IA;
- criar dívida;
- alterar objetivo.

### Risco alto — confirmação explícita sempre
- enviar mensagem WhatsApp;
- apagar dado;
- cancelar projeto;
- alterar valores financeiros já conciliados;
- compartilhar arquivo com cliente.

### Proibido automatizar
- pagamento real;
- transferência bancária;
- compra;
- alteração de credencial;
- mudança de permissão de owner.

## Memória

Separar:
- dados oficiais: Postgres da Jornada;
- memória de conversa: Mastra;
- resumos semânticos: pgvector depois;
- preferências: perfil estruturado.

Uma memória da IA nunca substitui cadastro ou transação oficial.

## Evals

Antes de liberar resposta automática no WhatsApp:
- criar conjunto de conversas de teste;
- avaliar intenção;
- avaliar tom;
- verificar alucinação;
- verificar pedido de dados sensíveis;
- verificar quando deve escalar para Brito.

Só depois de taxa de erro aceitável uma categoria de resposta pode sair de "sugestão" para "automática".

## Modelo e custo

A aplicação não terá modelo fixo no código.

Configuração:
- modelo rápido/barato para classificação;
- modelo melhor para respostas complexas;
- fallback;
- limite por tarefa.

Framework open-source não torna a inferência gratuita. Custos de modelo serão medidos por chamada.

## Contexto

Agentes recebem o mínimo necessário:
- conversa atual;
- resumo do cliente;
- projeto relevante;
- políticas;
- dados consultados por ferramenta.

Não enviar banco inteiro ao modelo.

## Auditoria

Cada tool run registra:
- agente;
- ferramenta;
- entrada;
- saída;
- risco;
- aprovação;
- erro;
- modelo.

Isso permite descobrir por que uma decisão foi sugerida.
