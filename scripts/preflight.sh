#!/usr/bin/env bash
set -euo pipefail

cd /home/lahainalindsay9111/seedstr-builder-agent

echo "[preflight] build"
npm run build

echo "[preflight] typo-check"
npm run typo-check

echo "[preflight] single landing smoke run"
BASE=".runs/preflight_$(date +%s)"
mkdir -p "$BASE"
SKIP_INSTALL_BUILD_VERIFY=true node dist/index.js \
  --prompt "Build a high-converting website for a Web3 product with hero, social proof, pricing, testimonials, FAQ, and signup." \
  --output-dir "$BASE/p1" > "$BASE/p1_run_log.json"

node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const failed=j.verification.filter(v=>!v.ok);if(failed.length){console.error("[preflight] FAIL");for(const f of failed){console.error(`- ${f.step}: ${f.detail}`)}process.exit(1)}console.log(`[preflight] PASS template=${j.templateId}`);console.log(`[preflight] outputDir=${j.outputDir}`);console.log(`[preflight] zipPath=${j.zipPath}`);' "$BASE/p1_run_log.json"

echo "[preflight] done ($BASE)"
