# UX v1 — Jornada do Brito

## Objetivo

O app precisa parecer simples mesmo tendo muitos recursos.

A regra é: complexidade fica na arquitetura, não na tela.

## Hierarquia móvel

### Hoje
Primeira tela.
Mostra apenas:
- próxima ação;
- mensagens que exigem resposta;
- vencimentos/próximos pagamentos;
- prazo mais urgente;
- objetivo atual;
- briefing curto da IA.

### Conversas
Lista em estilo inbox:
- avatar/nome;
- última mensagem;
- horário;
- estado;
- badge de não lida;
- marcador "precisa de você" quando a IA detecta necessidade.

Dentro da conversa:
- histórico;
- contexto do cliente;
- resposta sugerida;
- campo de resposta;
- ações rápidas: criar oportunidade, projeto, cobrança, follow-up.

### Trabalho
Segmentos:
- Pipeline
- Clientes
- Projetos

O usuário não precisa decidir onde cadastrar primeiro.
Um novo contato pode entrar pela conversa e depois virar oportunidade/cliente.

### Finanças
Topo:
- saldo disponível;
- previsto a receber;
- contas a vencer;
- dívidas.

Abaixo:
- atividade recente;
- receber;
- pagar;
- contas;
- dívidas.

Gráficos entram apenas quando ajudam a responder uma pergunta.

### Jornada
- ambição ativa;
- objetivos;
- missões;
- progresso;
- conquistas.

Não transformar a vida inteira em competição.
Gamificação serve para mostrar avanço.

## IA na interface

A IA não vira uma tela obrigatória.

Acesso:
- botão no cabeçalho;
- comando contextual;
- cards de sugestão quando relevante.

Exemplos:
- numa conversa: "sugerir resposta";
- num cliente: "resumir histórico";
- no financeiro: "explicar meu mês";
- numa dívida: "mostrar impacto das parcelas";
- na Jornada: "qual próximo passo?".

## Quick Capture

Ação global "+" abre um sheet com:
- nota rápida;
- gasto;
- entrada;
- dívida;
- cliente;
- tarefa;
- objetivo.

A IA pode classificar depois.
Isso reduz a fricção de escolher o módulo antes de registrar algo.

## Formulários

- poucos campos inicialmente;
- campos avançados em "Mais detalhes";
- autosave apenas para rascunhos seguros;
- confirmação clara para ações irreversíveis;
- valores monetários com máscara BRL;
- datas em linguagem simples;
- erros junto ao campo.

## Estados visuais

Status sempre combina:
- texto;
- ícone;
- cor.

Nunca depender só de cor.

## Desktop

Desktop adiciona:
- sidebar;
- atalhos de teclado;
- tabelas maiores;
- painel lateral contextual;
- drag and drop no pipeline quando seguro.

A lógica e os dados são os mesmos do mobile.

## Padrões de design

Base:
- shadcn/ui;
- componentes acessíveis;
- tipografia forte;
- espaçamento generoso;
- poucos cards por tela;
- sem aparência genérica de dashboard de IA.

## Busca

Busca global por:
- cliente;
- telefone;
- projeto;
- mensagem;
- dívida;
- transação;
- objetivo.

Command palette no desktop.

## Empty states

Toda tela vazia precisa ensinar o próximo passo.

Exemplo:
"Você ainda não tem clientes. Quando alguém chamar no WhatsApp, o contato aparecerá aqui automaticamente."

## Princípio de confiança

Antes de executar uma sugestão da IA, o usuário deve saber:
- o que vai mudar;
- onde;
- por quê;
- se pode desfazer.
