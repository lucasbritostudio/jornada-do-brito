# Módulo Jornada YouTube

Este módulo é independente da Jornada principal. Ele usa uma área própria de dados:

`jornada/youtube/state.json`

Ele não lê nem altera clientes, finanças, WhatsApp, produção ou o laboratório de engenharia.

## O que já está pronto

- página própria em `/youtube`;
- configuração do canal, público, temas e frequência;
- escolha do provedor de IA;
- modo pausado e modo automático;
- fila de execuções com etapas separadas;
- publicação inicial protegida como privada;
- login obrigatório na API;
- testes para impedir execução sem ativação e garantir isolamento.

## O que ainda precisa ser conectado

Para transformar a fila em automação real, faltam as conexões externas:

1. autorização do canal do YouTube pelo Google;
2. chave do provedor de IA escolhido;
3. motor de pesquisa, roteiro, mídia, revisão e publicação;
4. agendamento no servidor.

Essas conexões não devem usar a chave da produção da Jornada nem publicar vídeos automaticamente sem uma configuração explícita do canal.

## Decisão de integração

O AgentTube foi usado como referência de arquitetura: etapas separadas, retomada por checkpoints e publicação com falha segura. O aplicativo Jornada não incorpora o servidor Express/SQLite dele; mantém Next.js, autenticação e Blob já usados pelo projeto. Isso reduz o risco de misturar dados e evita criar um segundo sistema dentro do mesmo produto.
