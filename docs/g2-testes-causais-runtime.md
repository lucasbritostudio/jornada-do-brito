# G2 — Laboratório de hipóteses, falhas controladas e correções sem regressão

**Estado:** pesquisa isolada na PR #13, sem integração à aplicação em produção. Não se trata de autorreprogramação do sistema nem de uso de modelos pagos.

## Protocolo: hipótese → intervenção → reprodução → correção → proteção

O objetivo é demonstrar experimentalmente se uma mudança proposta corrige a falha que motivou a investigação **sem causar regressões**.

O novo motor `lib/g2-runtime-experiments.ts` recebe callbacks de funções **registradas diretamente pelos testes do repositório**. Nunca carrega nem avalia JavaScript enviado pela IA, pelo usuário ou pelo GitHub; não usa `eval`, shell, tokens ou chamadas externas. Não está conectado a rotas Next.js nem tem acesso ao banco.

Para cada caso rotulado com resultado esperado, o motor executa, no próprio GitHub Actions, uma variante de referência com **defeito induzido apenas no teste** e uma candidata de correção. Compara saídas de execução usando igualdade estrutural, registra exceptions apenas como booleanos e nunca devolve seus textos (proteção contra vazamento). Casos são marcados como:

- `reproducer`: o problema a ser reproduzido;
- `regression`: um comportamento anteriormente correto que deve ser preservado;
- `holdout`: casos adicionais fora dos exemplos principais do defeito, ainda escritos pelo próprio desenvolvedor (não são avaliação independente cega).

A proposta só é considerada elegível **para revisão humana adicional** se ao menos um defeito induzido foi reproduzido, todos os reprodutores passaram depois, **nenhum caso anteriormente correto piorou**, nenhum caso terminou errado, e os holdouts passaram. O módulo retorna sempre `productionDefectConfirmed=false`, `realWorldCauseConfirmed=false`, `automaticallyApplied=false` e `deployAuthorized=false`.

## Três regras reais da Jornada utilizadas

| Regra real testada | Defeito injetado somente no laboratório | Comportamento preservado pela implementação existente |
|---|---|---|
| `deadlineFor` em `lib/production.ts` | Iniciar 48h/72h no instante da gravação, em vez de 00h do dia seguinte (Fortaleza) | Data limite correta, entradas inválidas ou ausentes, virada de dia |
| `transitionAllowed` em `lib/production.ts` | Permitir passagem direta de `captured` para `delivered` | Aprovação, conclusão e transições proibidas |
| `productionUrgency` em `lib/production.ts` | Tratar revisão aguardando cliente como prazo vencido | Revisões, entrega concluída, falta de início, em dia, atenção ao prazo |

A candidata destes testes é o **código real já existente da Jornada**, que passa pelos contratos escolhidos. Não foi identificado defeito confirmado dessas funções em produção e **não houve alteração em `lib/production.ts`**.

## Contraexemplos: a G2 também sabe rejeitar uma “correção”

- Um candidato que retorna `false` para todas as transições bloqueia a entrega irregular, porém quebra transições válidas. Foi **rejeitado por regressão**.
- Um candidato idêntico ao defeito injetado não remove a causa: **rejeitado por não corrigir**.
- Um candidato que lança uma exceção não atinge o resultado esperado: é **rejeitado** e a mensagem da exceção não é incluída na saída.
- Listas insuficientes, casos duplicados ou falta de amostras de regressão/holdout são **recusados**.

## Evidência da CI

Arquivo `tests/g2-runtime-experiments.test.ts`: testes determinísticos de funções reais com dados artificiais, sem qualquer acesso a dados pessoais. Commit inicial de integração `af15a9ac001a30c770d68fe4dbcde5a2198189a1`; GitHub Actions https://github.com/lucasbritostudio/jornada-do-brito/actions/runs/38167840627 **SUCCESS: 200 testes aprovados, zero falhas, TypeScript e build Next.js aprovados.** Nenhum preview, merge ou deploy.

## Limites e próxima avaliação

1. **A intervenção foi construída deliberadamente**. É uma demonstração do protocolo experimental em funções verdadeiras do sistema, não descoberta de incidente real no cliente.
2. `holdout` é um conjunto separado de casos, mas não foi auditado cegamente por especialistas externos. Não permite estimar capacidade geral da IA ou declarar um novo nível.
3. A comparação evidencia que a mudança corrige a **falha induzida** sob as condições controladas; não prova causalidade em toda a aplicação, serviços externos, WhatsApp ou navegador.
4. O motor não propõe nem gera código livremente. A futura IA poderá sugerir correções textuais, mas só **candidatas previamente implementadas e revisadas** poderão entrar num executor de testes isolado, nunca como comando de prompt.
5. Próximo passo antes de promoção: integrar observações de testes HTTP/controladores sob mocks autorizados (com tempo limite e nenhum dado real), construir avaliação inédita de diagnóstico da LLM e comparar tempo, custo e taxa de hipóteses confirmadas/refutadas.

**Proibição explícita:** não implantar G2, não converter uma nota alta em alegação de superinteligência e não permitir autopublicação, alteração de infraestrutura ou acesso adicional a credenciais.
