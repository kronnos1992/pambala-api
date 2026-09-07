#!/usr/bin/env bash
# Pambala - processa a fila de comprovativos (AQUEUE) periodicamente.
# Invocado pela crontab do usuário; redireciona logging para ficheiro.
set -u

export PYTHONPATH="/mnt/c/Users/Jaime/Documents/Repos/pambala-api"
LOG="/mnt/c/Users/Jaime/Documents/Repos/pambala-api/receipt_agent/agent.log"

# Garante que a chave do LLM (se existir) fica disponível ao subprocesso.
if [ -n "${OPENAI_API_KEY:-}" ]; then
	export OPENAI_API_KEY
fi

echo "$(date -Is) --- cron run ---" >>"$LOG"
cd "$PYTHONPATH" || exit 1
python3 -m receipt_agent.agent process --limit 50 >>"$LOG" 2>&1