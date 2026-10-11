# G2 — relações entre arquivos e funções com AST

**Estado:** experimento G2 na PR #13, somente leitura, sem publicação ou reescrita automática.

## Por que avançar

Um trecho isolado não revela toda a cadeia de um erro. Para investigar com precisão, é necessário distinguir o que o código **referencia**, quais arquivos foram **efetivamente examinados**, e o que exigiria **execução de testes**. Antes desta etapa, o laboratório enviava um trecho e, em perguntas sobre CSS, eventualmente um segundo arquivo. Isso não constituía um grafo de chamadas.

## Tecnologia construída

- `lib/g2-function-graph.ts`: usa a API de **parser AST do TypeScript**, já instalada como dependência de desenvolvimento, para analisar um conjunto explícito e limitado de até oito arquivos. Trabalha somente com `GraphSource` fornecido pelo chamador, do **mesmo commit SHA**, respeitando os caminhos permitidos; não acessa GitHub ou Internet.
- Extrai definições de funções e seus intervalos reais de linha. Identifica importações locais, imports com apelido, imports por namespace, exports nomeados e exports default e algumas funções aninhadas ou atribuídas via `useCallback`.
- Cria arestas estáticas de **importação** e **chamada direta**, com caminho de origem e linha correspondente. Respeita nomes do escopo e trata parâmetros locais que ocultam imports; não supõe que `obj.action()` aponte para função de um arquivo só porque os nomes coincidem.
- `traceG2Function(...)` rastreia a cadeia a partir de uma função identificada, limitada a cinco saltos e com proteção contra ciclos; nenhum código analisado é executado.
- Fronteiras HTTP como `fetch('/api/desenvolvimento/chat')` são registradas como **implementação da rota não examinada**. O motor não lê nem inventa a segurança e o comportamento do backend. URL com query ou token não é divulgada.
- `lib/g2-import-cycles.ts` detecta um ciclo estrutural de importações, **sem afirmar bug de inicialização ou falha em runtime**.
- `lib/g2-investigation-plan.ts` converte o grafo em um roteiro: funções examinadas, evidências de chamadas/imports, lacunas, ciclos e próximo teste recomendado. Nenhuma correção ou publicação é executada.

## Barreiras de custo e segurança

1. Nenhuma nova biblioteca adicionada ao package.json; utiliza `typescript` já presente **apenas na suíte de pesquisa/CI**. Não importar este módulo na rota Next.js de produção sem dimensionar e autorizar a infraestrutura.
2. Os arquivos são fornecidos explicitamente; o grafo **não baixa outros arquivos por conta própria**, nem aumenta os privilégios existentes.
3. No máximo oito fontes, tamanho individual máximo 22 mil caracteres e orçamento total máximo 90 mil caracteres.
4. Um único SHA obrigatório para todas as fontes; caminhos inválidos, duplicados, não autorizados ou erros de sintaxe são recusados.
5. Fontes externas, rotas HTTP não examinadas, import não exportado, escopo ambíguo e chamadas dinâmicas permanecem **lacunas**, não defeitos confirmados.
6. **Não** executar texto de código, comandos, instruções de comentários, modelos externos ou scripts encontrados nas fontes.
7. Nenhuma alteração nas áreas de finanças, dados de clientes, autenticação, deploy, ChefeBot ou São Francisco.

## Evidência e testes

O teste de contrato `tests/g2-function-graph.test.ts` comprova em casos sintéticos uma cadeia de **três arquivos TypeScript/TSX**, um CSS e funções com import alias, export default, namespace, nomes aninhados, shadowing, ciclos e fontes não fornecidas. Também examina o arquivo real `app/desenvolvimento/console.tsx`: localiza `ask`, `refresh` e `copyAnswer` e reconhece que as rotas HTTP da Central não foram examinadas, em vez de afirmar que conheceu o backend. Os testes rodam sem rede e sem credenciais.

Esses resultados medem **precisão de relações AST nos casos de teste**, não a taxa de acertos de modelos de linguagem em projetos inéditos. O compilador TypeScript consegue identificar estrutura sintática; não comprova por si só comportamento assíncrono, tipos em runtime, permissões, efeitos no banco ou verdade de todas as afirmações do LLM.

## Próximo portão de evolução

Para usar essas relações na própria IA em uma publicação futura será necessário: definir orçamento/latência de leitura entre arquivos da UI, inspecionar permissões/privacidade, vincular citações da resposta ao caminho e linha do mesmo commit e medir desempenho do modelo em novos cenários reais; o modo produção atual permanece **uma única chamada de IA, read-only e limitado à allowlist**. Fazer tudo em uma única publicação controlada somente quando aprovado.

**Nome do sistema:** o apelido antigo LUKBRIX aparece em módulos legados da G2, mas foi rejeitado pelo proprietário; nenhum novo nome foi imposto nesta etapa.
