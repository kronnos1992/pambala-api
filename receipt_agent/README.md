# Agente de Verificação de Comprovativos do Pambala

Agente Python (mesma arquitetura do `translation_agent`) responsável por
validar a **autenticidade** dos comprovativos de pagamento submetidos pelos
compradores, combatendo comprovativos editados por qualquer software e
fraude tecnológica (reutilização, colagem, screenshots adulterados).

## Problema que resolve

O upload de comprovativos na API faz apenas uma validação rápida por OCR
(texto: valor, referência, entidade). Texto OCR correto **não prova
autenticidade** — uma imagem Photoshopada com os valores certos passa.
Este agente adiciona três linhas de defesa:

1. **Forense de imagem** (`forensics.py`) — deteta indícios de edição:
   - **ELA** (Error Level Analysis): regiões recomprimidas/coladas;
   - **metadata EXIF/XMP**: software de edição (Photoshop, GIMP...),
     EXIF removido (re-salvo), câmara/GPS;
   - **deteção de screenshot**: superfícies planas sem ruído de sensor;
   - **hash SHA-256** e assinatura (magic bytes) — prova de identidade
     do ficheiro e deteção de reclassificação de tipo.
2. **OCR + verificação cruzada** (`ocr.py`, `verifier.py`) — Tesseract
   (português, reutiliza `langdata/` do projeto) e comparação com
   valor/entidade/referência/banco/titular e o código de confirmação.
3. **Visão LLM** (`llm.py`) — modelo de visão (OpenRouter/OpenAI-compatible)
   avalia a imagem semanticamente: inconsistências internas, crop/colagem,
   screenshots suspeitos e falsificação evidente, devolvendo veredicto
   `PASS/REVIEW/FAIL` com confiança.

## Como funciona

1. O comprador envia o comprovativo → a API aceita e marca com um estado
   rápido (OCR básico, `validateReceipt`).
2. O agente rastreia os pedidos com `receiptImage` cujo `validationResult`
   ainda **não tem `agentProcessedAt`** (idempotente).
3. Para cada um: forense → OCR → cruzamento → visão LLM → veredicto.
4. Grava em `Order`: `validationStatus`, `validationResult` (relatório
   completo) e anexa evento `AGENT_REVIEW` em `paymentHistory`.

### Regras de decisão

- Nota base 50 + acertos de cruzamento (valor, entidade, referência...) +
  código de confirmação (+15);
- penalidades de suspeita forense (ex.: `EDITED_REGIONS` −30,
  `EDITOR_METADATA` −35, `MAGIC_MISMATCH` −45);
- ajuste pela visão LLM (PASS +8, FAIL −25);
- `PASS` ≥ 80, `FAIL` ≤ 40, o resto `REVIEW`;
- **PASS nunca é atribuído com flags forenses de suspeita** — escala para
  revisão humana (é daí que vem a garantia).

## Requisitos

- Python 3.10+.
- **OCR**: `tesseract` instalado (`apt install tesseract-ocr tesseract-ocr-por`)
  ou `pip install pytesseract`.
- **Forense**: `pip install pillow` (opcional — sem ele o agente só marca
  `FORENSICS_UNAVAILABLE` e escala para revisão).
- **Visão LLM**: `OPENAI_API_KEY` (opcional — sem ela o agente roda sem o
  passo de visão). Endpoint OpenAI-compatível (default OpenRouter).

## Uso

Executar a partir de `pambala-api/`:

```bash
python3 -m receipt_agent.agent check                     # estado do agente
python3 -m receipt_agent.agent process                   # processa pendentes
python3 -m receipt_agent.agent process --limit 20        # limite
python3 -m receipt_agent.agent process --order pedido_X  # um pedido específico
python3 -m receipt_agent.agent process --skip-llm        # sem visão LLM
python3 -m receipt_agent.agent process --dry-run         # simula sem gravar
python3 -m receipt_agent.agent report pedido_X           # relatório guardado
```

## Variáveis de ambiente

| Variável                | Default                          | Descrição                                   |
| ----------------------- | -------------------------------- | ------------------------------------------- |
| `DATABASE_URL`          | `file:./dev.db`                  | caminho SQLite (`file:` prefix)             |
| `RECEIPTS_DIR`          | `<repo>/pambala-api/uploads`     | pasta com os comprovativos                  |
| `TESSDATA_DIR`          | `<repo>/pambala-api/langdata`    | pasta com `por.traineddata`                 |
| `OPENAI_API_KEY`        | — (só visão LLM)                 | chave OpenRouter/OpenAI                     |
| `OPENAI_BASE_URL`       | `https://openrouter.ai/api/v1`   | endpoint OpenAI-compatível                  |
| `OPENAI_VISION_MODEL`   | `openai/gpt-4o-mini`             | modelo de visão para autenticidade          |
| `RECEIPT_AGENT_PASS`    | `80`                             | score mínimo para PASS                      |
| `RECEIPT_AGENT_FAIL`    | `40`                             | score máximo para FAIL                      |
| `RECEIPT_ELA_RATIO`     | `0.02`                           | fracção de blocos ELA suspeitos             |
| `RECEIPT_SCREENSHOT_RATIO` | `0.35`                        | uniformidade para marcar screenshot         |

## Como agendar

Num servidor (cron):

```bash
*/10 * * * * cd /srv/pambala/pambala-api && python3 -m receipt_agent.agent process --limit 50 >> /var/log/pambala-receipts.log 2>&1
```

Ou integrar na própria arranque da API se preferir processamento síncrono
com fila. O agente é idempotente: pode ser corrido repetidamente sem custo.