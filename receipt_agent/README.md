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

### Regras de decisão e proteção anti-burla (PaymentRiskScore & Fingerprint)

O pipeline implementa o modelo **Payment Proof + Transaction Fingerprint + Reconciliation**:

1. **Transaction Fingerprint (Desduplicação Lógica)**:
   - Extrai as entidades canónicas da transação: ID/referência (FT, Doc N.º, etc.), montante, data, beneficiário, IBAN e banco.
   - Gera um fingerprint SHA-256 canónico (`TX:<id>|AMT:<amt>|CUR:AOA|DT:<date>|BEN:<ben>|BANK:<bank>`).
   - Bloqueia fraudes por reutilização de transações mesmo que a imagem seja recortada, redimensionada ou capturada por screenshot.
2. **Deteção de Replay Físico (`DUPLICATE_RECEIPT`)**:
   - Hash SHA-256 exato do ficheiro submetido.
3. **Limite de Tentativas**:
   - Limite estrito de 3 tentativas de envio de comprovativo por pedido (`receiptAttempts`), bloqueando a 4ª tentativa para revisão manual.
4. **Matriz de Pontuação (`PaymentRiskScore` 0–100)**:
   - **Pontuação base**: 10
   - `+20` Referência / Código de confirmação (`paymentCode`) corresponde
   - `+20` Montante corresponde
   - `+15` Beneficiário corresponde (titular ou IBAN)
   - `+10` Data da transação dentro da janela do pedido
   - `+10` Novo ID de transação bancária (não duplicado)
   - `+10` Layout e estrutura de comprovativo bancário reconhecida
   - `+05` Banco esperado corresponde
   - `-40` Comprovativo ou transação já utilizado noutro pedido (`DUPLICATE_RECEIPT` / `DUPLICATE_FINGERPRINT`)
   - `-30` Referência/código pertence a outro pedido ou não confere (`CODE_MISMATCH` / `MISMATCH_REFERENCE`)
   - `-30` Valor diferente (`AMOUNT_MISMATCH`)
   - `-20` Beneficiário diferente (`BENEFICIARY_MISMATCH`)
   - `-20` Documento suspeito / sinais de edição gráfica (`SUSPICIOUS_DOCUMENT`)
   - Ajuste visão LLM (opcional com consentimento): PASS +0, REVIEW −10, FAIL −30
5. **Classificação de Risco**:
   - `90 - 100`: **Baixo Risco** $\rightarrow$ `PROOF_ACCEPTED` (Comprovativo Aceite)
   - `70 - 89`: **Revisão Manual** $\rightarrow$ `MANUAL_REVIEW` (Revisão pelo operador)
   - `< 70`: **Rejeitado** $\rightarrow$ `PROOF_REJECTED` (Comprovativo Rejeitado)
6. **Regras Absolutas de Segurança**:
   - Duplicado comprovado (físico ou lógico) $\rightarrow$ reprovação imediata (`PROOF_REJECTED`, score $\le 15$).
   - Múltiplas incongruências críticas (valor + código/data) $\rightarrow$ `PROOF_REJECTED`.
   - `PROOF_ACCEPTED` é bloqueado na presença de qualquer flag forense suspeita (`EDITOR_METADATA`, `EDITED_REGIONS`, `MAGIC_MISMATCH`), rebaixando sempre para `MANUAL_REVIEW`.
   - Comprovativos remotos (Cloudinary) contam com fallback transparente de PDF para JPG rasterizado.

## Requisitos

- Python 3.10+.
- **OCR**: `tesseract` instalado (`apt install tesseract-ocr tesseract-ocr-por`)
  ou `pip install pytesseract`. Para comprovativos em **PDF** (a partir da UI
  também podem ser PDF), o texto é extraído com `pdftotext` (poppler-utils:
  `apt install poppler-utils`) — sem ele, o PDF não é reprovado por
  "conteúdo em falta"; escala para `REVIEW`.
- **Forense**: `pip install pillow` (opcional — sem ele o agente só marca
  `FORENSICS_UNAVAILABLE` e escala para revisão). As heurísticas de imagem
  (EXIF/ELA/screenshot) não se aplicam a PDFs: para PDFs a forense verifica
  versão/produtor do cabeçalho e não marca `EXIF_STRIPPED`.
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