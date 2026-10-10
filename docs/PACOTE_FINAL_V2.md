# Pacote final v2 — Jornada do Brito

Este arquivo descreve o pacote em construção antes do próximo deploy.

## Regra de publicação

Não publicar parcialmente. O código pode evoluir no repositório, mas a produção só será atualizada após:
1. schema e migração fechados;
2. IA de baixo risco com desfazer;
3. estudo audiovisual e gráfico;
4. memória de clientes;
5. controle IA/Brito do WhatsApp;
6. build e testes fora de produção;
7. validação da migração privada.

## Privacidade da migração

Dados pessoais, clientes e finanças não ficam versionados no GitHub. O repositório contém apenas:
- schema;
- regras;
- telas;
- endpoint autenticado e idempotente de importação.

O lote real será montado fora do código e enviado à Jornada somente após o deploy único autorizado.

## Modelo mental

A Jornada separa:
- fato confirmado;
- estimativa;
- previsão/promessa;
- pendência;
- interpretação.

Promessa não vira receita. Limite não vira caixa. Interpretação não vira fato.

## Audiovisual

Regra central:
**intenção → posição da câmera → lente → composição → movimento**

O método profissional fica em `lib/professional-method.ts` e serve como base para briefing, captação, revisão e orientação da IA.
