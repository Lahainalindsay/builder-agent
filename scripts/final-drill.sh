#!/usr/bin/env bash
set -euo pipefail

cd /home/lahainalindsay9111/seedstr-builder-agent

if [[ ! -f .env ]]; then
  echo "[drill] missing .env"
  exit 1
fi

echo "[drill] checking required env vars"
required=(SEEDSTR_API_KEY SEEDSTR_AGENT_ID)
for key in "${required[@]}"; do
  if ! grep -q "^${key}=" .env; then
    echo "[drill] missing ${key} in .env"
    exit 1
  fi
done

echo "[drill] build"
npm run build

echo "[drill] one-shot listener startup check (15s timeout)"
mkdir -p .runs
set +e
timeout 15s npm run listen > .runs/final_drill_listener.log 2>&1
status=$?
set -e

if grep -q "Seedstr runner starting" .runs/final_drill_listener.log; then
  echo "[drill] listener start OK"
else
  echo "[drill] listener did not start cleanly, see .runs/final_drill_listener.log"
  exit 1
fi

if [[ $status -ne 124 && $status -ne 0 ]]; then
  echo "[drill] listener exited with status $status, see .runs/final_drill_listener.log"
  exit 1
fi

echo "[drill] PASS"
