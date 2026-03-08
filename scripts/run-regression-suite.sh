#!/usr/bin/env bash
set -euo pipefail

cd /home/lahainalindsay9111/seedstr-builder-agent

echo "[regression] build"
npm run build

echo "[regression] typo-check"
npm run typo-check

echo "[regression] quick eval"
npm run eval:quick

echo "[regression] mixed 10 prompt suite"
bash scripts/run-mixed10.sh

echo "[regression] complete"
