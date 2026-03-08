#!/usr/bin/env bash
set -euo pipefail

cd /home/lahainalindsay9111/seedstr-builder-agent

if [[ ! -f .env ]]; then
  echo "[health] .env missing"
  exit 1
fi

echo "[health] required env keys"
required=(SEEDSTR_API_KEY SEEDSTR_AGENT_ID)
for key in "${required[@]}"; do
  if grep -q "^${key}=" .env; then
    echo "  - ${key}: present"
  else
    echo "  - ${key}: missing"
    exit 1
  fi
done

echo "[health] last listener drill log (if available)"
if [[ -f .runs/final_drill_listener.log ]]; then
  tail -n 20 .runs/final_drill_listener.log
else
  echo "  - no .runs/final_drill_listener.log yet"
fi

echo "[health] suggested 24/7 command:"
echo "  npm run listen"
