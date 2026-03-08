#!/usr/bin/env bash
set -euo pipefail

cd /home/lahainalindsay9111/seedstr-builder-agent

BASE=".runs/mixed10_real_$(date +%s)"
mkdir -p "$BASE"

prompts=(
"Build a landing page for \"PulsePay\", a modern invoicing tool for freelancers. Include hero, 3 feature cards, pricing tiers, testimonials, and a working email capture form."
"Build an operations dashboard for a small property management team with pages: Overview, Work Orders, Reports, Settings. Include mock KPIs and a simple activity feed."
"Create an admin panel to manage \"Vendors\" (name, phone, specialty, status). Must support add/edit/delete, search, and persist data locally."
"Visualize weekly gym attendance and membership churn for the last 12 weeks. Include filters (last 4/8/12 weeks) and export to CSV."
"Build a searchable help center for \"ShipFast Support\" with categories, an article page, and a search input that filters articles instantly."
"Build a simple browser game where you dodge falling objects, track score, and allow restart. Keyboard controls required."
"Create a short interactive story with at least 6 choice nodes and 3 endings. Must support restart and show a \"path taken\" summary."
"Write a partnership outreach email from a Web3 analytics startup to a major crypto exchange proposing a data-sharing collaboration. Include subject line, pitch angle, and a follow-up message."
"Generate 20 newsletter topic ideas for a weekly \"AI + DevTools\" newsletter targeting startup engineers. Include 3 recurring sections."
"Given a basic ERC-20 token contract, write a security audit report highlighting potential vulnerabilities and suggested fixes. Include a risk matrix and remediation checklist."
)

for i in "${!prompts[@]}"; do
  n=$((i+1))
  outdir="$BASE/p$n"
  mkdir -p "$outdir"
  prompt="${prompts[$i]}"

  node dist/index.js --prompt "$prompt" --output-dir "$outdir" > "$outdir/run_log.json"

  project_dir=$(node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(p.outputDir);' "$outdir/run_log.json")

  if [ -f "$project_dir/deliverables/01_main.md" ]; then
    cp "$project_dir/deliverables/01_main.md" "$outdir/output_main.md"
  elif [ -f "$project_dir/deliverables/audit_report.md" ]; then
    cp "$project_dir/deliverables/audit_report.md" "$outdir/output_main.md"
  elif [ -f "$project_dir/README.md" ]; then
    cp "$project_dir/README.md" "$outdir/output_main.md"
  else
    echo "No primary output file found" > "$outdir/output_main.md"
  fi

  printf "%s\n" "$prompt" > "$outdir/prompt.txt"

  node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const failed=p.verification.filter(v=>!v.ok);const summary={templateId:p.templateId,outputDir:p.outputDir,zipPath:p.zipPath,verificationOk:failed.length===0,failedSteps:failed.map(f=>({step:f.step,detail:f.detail})),repairApplied:p.repairApplied};fs.writeFileSync(process.argv[2],JSON.stringify(summary,null,2));' "$outdir/run_log.json" "$outdir/summary.json"
done

echo "Done. Results in: $BASE"
echo
for f in "$BASE"/p*/summary.json; do
  p=$(basename "$(dirname "$f")")
  t=$(node -e 'const fs=require("fs");const s=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(s.templateId);' "$f")
  ok=$(node -e 'const fs=require("fs");const s=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(String(s.verificationOk));' "$f")
  echo "$p: $t | verificationOk=$ok"
done
