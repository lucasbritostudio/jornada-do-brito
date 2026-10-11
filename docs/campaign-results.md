# Resultados das Campanhas — arquitetura v1 (SEM DEPLOY)

**Estado:** código em branch `feat/resultados-campanhas`. Não foi enviado à main, não foi feito deploy nem ativada qualquer conexão externa. A página /campanhas só passa a existir para usuários de uma versão futura aprovada. Não há dados reais da Arte Print ainda.

## Mesa multidisciplinar de revisão (papéis técnicos, não agentes independentes executados)
- **Produto / mensuração:** funil orientado a contatos, orçamento, venda; metas e decisões comerciais da campanha.
- **UX:** dashboard enxuto, hierarquia resultados reais → Instagram → ações, estados vazios honestos, responsivo.
- **Arquitetura/Back-end:** módulo próprio, em Vercel Blob privado, separado do estado principal, gravações protegidas por ETag e replays idempotentes.
- **Segurança/LGPD:** acesso por sessão autenticada, HMAC do WhatsApp, sem guardar corpo de conversas nem telefone, dados da empresa de terceiro condicionados a consentimento/autorizações dos donos.
- **Growth/filmmaker:** código específico em anúncio e link de WhatsApp, valor comercial validado manualmente, sem atribuição inventada.
Os papéis são perspectivas de auditoria do projeto, não a afirmação de execução simultânea por outros agentes.

## Estrutura técnica
- `lib/campaigns.ts`: modelo e agregação de métricas; event IDs e deduplicação; dinheiro sempre em centavos.
- `lib/campaign-store.ts`: armazenamento independente em `jornada/campaigns-results-v1.json` como Blob privado; ETag + revalidação com prevenção de sobrescrita concorrente.
- `app/api/campaigns/route.ts`: GET e POST autenticados; cadastro, edição, contatos, orçamentos e vendas confirmadas manualmente.
- `app/api/campaigns/webhook/whatsapp/route.ts`: webhook passivo assinado; verifica número da gráfica e palavra-código da campanha ATIVA; deduplica pessoa e mensagem; não responde, não envia nada, não modifica as conversas da Jornada.
- `app/api/campaigns/sync/instagram/route.ts`: leitura explicitamente acionada pelo dono da Jornada; valida o ID do Reels contra mídias da conta profissional autorizada, carrega métricas permitidas; indisponíveis NÃO são zero.
- `app/campanhas/page.tsx` + `dashboard.tsx` + `campaigns.css`: interface acessível após login, responsiva, comparações e estados de conexão, valores reais discriminados.
- `app/ui.tsx`: somente dois links de navegação; abas e componentes anteriores preservados.
- `tests/campaigns.test.ts`: testes de matemática, código-campanha e deduplicação.

## O que o painel pode dizer com responsabilidade
- **Contatos identificados:** mensagens recebidas no WhatsApp com código da campanha (quando a Meta estiver conectada) somadas a registros manuais. NÃO equivale a todas as pessoas influenciadas.
- **Orçamentos:** informados e confirmados manualmente pela Arte Print. A mensagem no WhatsApp não vira orçamento sozinha.
- **Vendas atribuídas:** confirmadas manualmente pela gráfica, com valor de venda. Não equivale ao faturamento total nem ao lucro da gráfica.
- **Instagram:** alcance, visualizações, curtidas, compartilhamentos, salvamentos e comentários disponíveis através da API da Meta. Métrica indisponível deve ficar sem valor. Visualização não equivale a cliente.
- **Limitações de atribuição:** quem vê o Reels e comparece à loja sem código pode não ser identificado. Um cliente de várias campanhas exige decisão de atribuição. Orçamentos e vendas sem identificação podem não compartilhar a mesma base; as taxas são aproximadas.
- **ROI:** NÃO calcular sem custo operacional/produção/CMV e gastos comprovados; exibir receita atribuída separada de gasto de mídia. A diferença não é lucro.

## Arte Print — escopo proposto
- `business`: Arte Print, Alto Alegre do Maranhão
- campanha: Semana da Criança, personalizados em geral até 20% (camisas, canecas e chaveiros serão foco visual)
- `code` ilustrativo: CRIANCA20 — confirmar com os donos antes de publicar
- proprietário da Arte Print precisa aprovar a contratação audiovisual de R$1.000/4 vídeos e disponibilizar acesso limitado aos dados da loja. Alan não é dono nem pode ser presumido como administrador de contas da Meta.
- não publicar automaticamente, não enviar mensagens e não usar conta pessoal de Brito para controlar o WhatsApp empresarial.

## Integração WhatsApp Business (Meta oficial)
Exige autorização EXPRESSA dos proprietários, controle do Meta Business Portfolio e WhatsApp Business Account (WABA), credenciais próprias da empresa e configuração oficial do webhook. Avaliar compatibilidade/coexistência com WhatsApp Business App no telefone já usado na Arte Print. Não desconectar ou migrar número sem aprovação.

Variáveis server-only para **a instância autorizada** da gráfica:
- `CAMPAIGN_WA_PHONE_ID`: ID oficial do número da Arte Print; não confundir com o número da Jornada.
- `CAMPAIGN_WA_VERIFY_TOKEN`: segredo aleatório de verificação do webhook.
- `CAMPAIGN_WA_APP_SECRET`: App Secret da Meta — usado para assinatura `x-hub-signature-256`.
- `CAMPAIGN_HASH_SECRET`: segredo forte independente para HMAC de identificador, nunca exposto no front end.
- Endpoint GET/POST: `/api/campaigns/webhook/whatsapp`
Webhook é *somente leitura de evento de entrada*. Não salva telefone em texto nem mensagem bruta; grava apenas hash e código, evitando replays. Deve-se revisar privacidade, base legal, acesso e retenção antes de produção.
Os eventos só são associados a uma campanha com código e status `active`. Sem código não há atribuição automática, e jamais supor que todas as mensagens vindas da gráfica vieram do vídeo.

## Integração Instagram profissional
A Meta exige acesso autorizado à conta Instagram profissional. Fluxos e permissões variam entre Instagram Login e Facebook Login com Página vinculada. Validar concessões por perfil e revisão da Meta antes do lançamento.

Variáveis server-only:
- `CAMPAIGN_IG_USER_ID`: ID profissional autorizado da Arte Print
- `CAMPAIGN_IG_ACCESS_TOKEN`: token de acesso restrito com escopos de leitura/insights
- `CAMPAIGN_GRAPH_VERSION`: Graph API suportada, exemplo `v25.0`, revisar versão antes de ativar
Nenhuma credencial é gravada em GitHub, no dashboard, no Google Sheets ou em documentos.
A interface associa ID numérico de mídia da Arte Print à campanha e consulta insights por botão autenticado. Sem tokens válidos e IDs corretos, mostra 'não configurado'. Algumas métricas dependem do formato e da permissão.
**Não existem ainda** login OAuth do cliente, renovação automática de token, importação de DMs Instagram, nem sincronização programada. Não alegar integração operacional antes do onboarding e validação ao vivo.

## Fluxo de uso
1. Concluir aprovação comercial e autorizações de dados dos donos da Arte Print.
2. Criar campanha em RASCUNHO no painel, sem dados de teste passando por real.
3. Confirmar código, link e chamada, postar Reels; preencher ID da mídia e marcar campanha ativa.
4. Ativar webhooks de WhatsApp da empresa com número distinto e verificação de assinatura.
5. Usar botão de sincronização Instagram com o token autorizado. Confirmar permissões e datas das métricas.
6. Alan ou responsável registra orçamento e venda somente quando confirmados; idealmente usando um identificador estável por cliente para rastrear a conversão.
7. Apresentar comparação entre vídeos e valor recebido, distinguindo dados confirmados, incompletos e não medidos.
8. Apenas após testes controlados e autorização posterior fazer merge/deploy.

## Segurança / aprovação
- Nenhuma senha, chave, número pessoal do cliente ou token entra no código-fonte.
- Endpoint público assinado e limitado a phone_number_id configurado; não aceitar payload de outro WhatsApp.
- Nenhuma automação de respostas comerciais (não interferir na operação da gráfica).
- O produto guarda indicadores mínimos e pseudônimos; definir responsável pelo tratamento, finalidade, prazo de retenção, direitos e condições de compartilhamento dos dados entre Arte Print e filmmaker antes de acessar conversas de terceiros.
- O uso de mensagens para medir deve respeitar transparência, finalidade e obrigações de LGPD; na opção manual, é possível iniciar sem capturar conversas/telefones de clientes.
- Não alterar dados da Pizzaria São Francisco, Chefe da Pizza nem da conta pessoal da Jornada.

## Pendências de validação antes de entrega a produção
- Testar compilação TypeScript completa, integração entre arquivos, autorização de sessões e casos de falha Vercel Blob.
- Validar testes de unidade `tests/campaigns.test.ts` (ainda não executados no ambiente de GitHub).
- Teste com webhook assinado oficial da Meta e Reels autorizado, utilizando evento real controlado e métricas consentidas.
- Definir manualmente a correspondência de pedidos/vendas às pessoas (sem importar todo o CRM da gráfica).
- Solicitar autorização escrita dos proprietários para leitura restrita das contas e definição de quem pode acessar o relatório.

**Não executar deploy nem juntar à main sem validação e autorização explícita.**
