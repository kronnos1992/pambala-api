# Agente de Tradução do Pambala

Agente Python (apenas biblioteca padrão — **sem dependências externas**) que
é "auto-treinado" nas 6 línguas do marketplace (`pt` base, `en`, `es`, `fr`,
`zh`, `ar`) e é responsável por **todas as traduções do sistema**:

1. **Conteúdo da base** — produtos, categorias e lojas → tabelas `*Translation`
   (lê SQLite via `sqlite3`, escreve no formato de datas ISO do Prisma).
2. **Mensagens de UI** — sincroniza `messages/*.json` (next-intl) a partir de
   `pt.json`, traduzindo apenas chaves em falta/iguais ao português.

## Como funciona

- **Motor**: um LLM OpenAI-compatível (`POST {base_url}/chat/completions` via
  `urllib`, stdlib). Controlado por `OPENAI_API_KEY`, `OPENAI_BASE_URL`,
  `OPENAI_MODEL` (lidas do ambiente ou do ficheiro `.env` do `pambala-api`).
- **Auto-treinamento**: a memória de tradução / glossário (`glossary.json`)
  é semeada com o corpus já traduzido dos `messages/*.json` e vai crescendo a
  cada execução (não re-traduz o que já ficou corretamente memorizado).
- **Consistência**: glossário com termos obrigatórios (marcas, categorias,
  unidades) é injetado no prompt; placeholders `{...}`, números, URLs e preços
  (`Kz`/`AKZ`) são preservados.
- **Segurança**: cada lote pede saída JSON validada; se o LLM devolve JSON
  inválido, aborta o lote **sem gravar nada** (nunca grava traduções parciais).

## Requisitos

- Python 3.10+ (sem `pip install`).
- Para traduzir de facto: definir `OPENAI_API_KEY` (e opcionalmente
  `OPENAI_BASE_URL`/`OPENAI_MODEL`) no ambiente ou no `.env` do `pambala-api`.

## Uso

Executar a partir de `pambala-api/`:

```bash
python3 -m translation_agent.agent check      # estado (sem LLM)
python3 -m translation_agent.agent train      # re-treina glossário a partir de messages
python3 -m translation_agent.agent db         # traduz conteúdo da base em falta
python3 -m translation_agent.agent messages   # sincroniza mensagens de UI
python3 -m translation_agent.agent            # tudo: check + train + db + messages
```

Opções comuns:

```bash
# locales/entidades específicos
--locale en,es    --entity category,product,store

# simulação (não grava, não chama o LLM)
--dry-run

# forçar (messages) re-tradução de chaves já preenchidas
--force

# limites
--limit 50
```

## Variables de ambiente

| Variável            | Default                         | Descrição                        |
| ------------------- | ------------------------------- | -------------------------------- |
| `OPENAI_API_KEY`    | — (obrigatória para traduzir)   | chave da API (ex.: OpenRouter)   |
| `OPENAI_BASE_URL`   | `https://openrouter.ai/api/v1`  | endpoint OpenAI-compatível       |
| `OPENAI_MODEL`      | `openai/gpt-4.1-nano`           | modelo a usar (qualquer OpenRouter) |
| `DATABASE_URL`      | `file:./dev.db`                 | caminho SQLite (`file:` prefix) |
| `PAMBALA_MESSAGES_DIR` | `<repo>/pambala-ui/src/messages` | onde estão os `*.json`        |
| `PAMBALA_GLOSSARY_FILE` | `translation_agent/glossary.json` | memória de tradução           |

Qualquer endpoint OpenAI-compatível serve; por omissão usa **OpenRouter**
(catálogo de modelos e fallback automático). Define a chave em
`https://openrouter.ai/settings/keys` e escolhe o modelo que preferires.

## Modo "auto-treinado"

O `glossary.json` guarda:

- `terms` — glossário obrigatório (ex.: `Samsung Galaxy` → por idioma);
- `memory` — frases completas já traduzidas.

O comando `train` re-semeia a memória a partir do corpus existente
(`messages/*.json`), de modo a que o agente aprenda/refina o estilo das
traduções já aceites e as reutilize em conteúdo novo (idempotente, sem custos
desnecessários de LLM).