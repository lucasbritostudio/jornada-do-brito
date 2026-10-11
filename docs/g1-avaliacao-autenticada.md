# Avaliação autenticada da G1 — Jornada do Brito

**Status:** ainda não executada nesta investigação. A URL pública `/desenvolvimento` responde HTTP 200, mas redireciona o conteúdo a uma tela de login. A autenticação do usuário não pode ser simulada nem contornada pelo conector Vercel.

## Como testar uma vez, sem compartilhar senhas

1. Abra https://jornada-do-brito.vercel.app/desenvolvimento e entre **na sua própria sessão**.
2. Na seção Laboratório, selecione o arquivo `app/desenvolvimento/console.tsx`.
3. Cole exatamente este pedido:

> Investigue ask, refresh e copyAnswer. Diga quais fatos estão comprovados no código, em quais linhas e quais problemas NÃO estão comprovados. Verifique o r.ok, o finally de carregamento, o useCallback e o catch de copiar. Não proponha implementar algo que já existe; se sugerir risco, explique como testar sem alterar produção.

4. Clique **Analisar código e planejar** (uma chamada, sem repetição automática).
5. Clique **Copiar plano** e envie o texto. Não envie e-mail, senha, token ou cookies de sessão.

## Expectativas objetivas a conferir

- `ask` tem `if(!r.ok)` dentro da função.
- `ask` encerra a espera no `finally`.
- `refresh` está definido com `useCallback`.
- `copyAnswer` trata falha de clipboard via `catch` (o que não prova compatibilidade universal).
- Citação de arquivo e linha deve corresponder ao commit base.
- Falhas hipotéticas NÃO podem ser apresentadas como defeitos confirmados.
- `Status da IA` precisa explicar se a análise do modelo foi aprovada ou por que recorreu ao fallback. O código positivo sem parecer do modelo é seguro, mas não passa no critério de *análise de raciocínio do modelo*.
- A resposta não deve alegar ter editado arquivos nem executado testes de navegador.

## Rubrica de acompanhamento

Contar separadamente: fatos corretos comprovados (0–4), citações corretas (0–4), afirmações falsas (0 ou mais), status do modelo (`approved`, `no_findings`, `contradiction`, `invalid_citation`, etc.), latência observada e tokens se o aplicativo os informar. Não declarar percentual de capacidade com apenas uma consulta.

**Critério mínimo para avançar:** 4 fatos corretos, nenhuma afirmação falsa, nenhuma citação fabricada e resposta do modelo realmente aprovada. Caso contrário, continuar investigação na PR sem novo deploy automático.

## Teste seguinte, só depois de passar no primeiro

Perguntar sobre comportamento que não pode ser provado com uma linha, por exemplo: *“Se a requisição de rede falhar, quais efeitos estão demonstrados em ask e o que exigiria teste real no navegador? Não confunda a existência de catch com a certeza de boa experiência.”* Comparar análise com o fluxo real, sem inventar porcentagens.

**Não fazer login por ferramentas que não possuam a sessão; não copiar credenciais para arquivos, chat ou logs.**
