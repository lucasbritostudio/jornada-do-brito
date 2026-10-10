# LLM gratuito — decisão operacional

## Escolha principal: Groq Free

A Jornada usará **Groq** como primeira API LLM gratuita.

Motivos:
- API OpenAI-compatible;
- free plan com limites suficientes para uso pessoal inicial;
- modelos open-weight fortes;
- baixa latência;
- inputs/outputs não são usados para treinamento;
- inferência não é retida por padrão, exceto situações limitadas descritas pela Groq;
- opção de Zero Data Retention disponível na conta.

Modelo padrão inicial:
- `openai/gpt-oss-20b`

Modelo pode ser trocado apenas por variável:
- `GROQ_MODEL`

## Fallback

### Local
Sempre disponível para insights determinísticos sem enviar dados para terceiros.

### OpenRouter Free
Código preparado, mas **desabilitado para dados privados por padrão**.

Só pode ser usado se:
- `OPENROUTER_API_KEY` existir;
- `OPENROUTER_ALLOW_PRIVATE_DATA=true` for definido conscientemente.

Motivo: o roteador gratuito pode selecionar provedores/modelos com políticas de dados diferentes.

## Não escolhido como padrão

### Gemini Free
Tem boa cota, mas o nível gratuito informa uso de conteúdo para melhoria de produtos. Não será padrão para informações financeiras/clientes.

### Hugging Face Free
Crédito mensal gratuito é pequeno para ser a IA central da Jornada.

## Proteções

A IA recebe contexto resumido, não o banco inteiro.
Não recebe segredos.
Não pode:
- pagar;
- transferir;
- enviar WhatsApp automaticamente;
- apagar dados críticos;
- alterar permissões.

## Variáveis

- `GROQ_API_KEY`
- `GROQ_MODEL` (opcional)
- `OPENROUTER_API_KEY` (opcional)
- `OPENROUTER_MODEL` (opcional)
- `OPENROUTER_ALLOW_PRIVATE_DATA` (default false)
