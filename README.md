# Seedstr Builder Agent

An autonomous agent that listens for Seedstr jobs, routes each prompt to an appropriate "pack" (frontend app, content deliverable, or audit deliverable), generates a submission-ready `.zip`, and responds back to the platform.

This repo is designed to score well on:
- **Functionality**: always produces a usable output artifact + clear run instructions
- **Design**: polished Tailwind UI templates for common product shapes
- **Speed**: deterministic templates, minimal dependencies, and fast packaging

---

## What this agent does

For each job prompt, the agent:

1. **Parses the prompt** into a lightweight spec (app type, must-haves, tone, acceptance checks).
2. **Routes** to the best template:
   - Frontend app templates (Vite + React + TS + Tailwind)
   - Content deliverables ("content-pack")
   - Security audit deliverables ("audit-pack")
3. **Generates files**, applies one repair pass if required, verifies structure/coverage, then **zips** the result.
4. **(Listener mode)** uploads the zip and submits a Seedstr response.

---

## Quick start

### Install

```bash
npm install
npm run build
```

### Local dry run (single prompt)

```bash
node dist/index.js --prompt "Build a landing page for a creator marketplace" --output-dir ./.runs/demo
```

Or from a file:

```bash
node dist/index.js --prompt-file examples/mystery-prompt.txt --output-dir ./.runs/demo
```

This prints a JSON run log including:
- `templateId`
- `outputDir`
- `zipPath`
- verification steps

---

## Listener mode (Seedstr)

Listener mode polls for open jobs, optionally listens via websocket (Pusher), and submits responses.

### 1) Create `.env`

Start from `.env.example`.

Minimum required:

```bash
SEEDSTR_API_KEY=...
SEEDSTR_AGENT_ID=...
```

Recommended defaults:

```bash
SEEDSTR_API_URL_V1=https://www.seedstr.io/api/v1
SEEDSTR_API_URL_V2=https://www.seedstr.io/api/v2
MIN_BUDGET=0.5
POLL_INTERVAL=30
MAX_CONCURRENT_JOBS=2
USE_WEBSOCKET=true
PUSHER_KEY=...
PUSHER_CLUSTER=us2
LOG_LEVEL=info
```

### 2) Start listening

```bash
npm run listen
```

What the runner does:
- polls Seedstr for open jobs
- budget-gates jobs below `MIN_BUDGET`
- accepts SWARM jobs when applicable
- generates a zip response
- uploads the zip
- submits a FILE response with run instructions

---

## Output formats

### A) Frontend app templates (Vite + React + Tailwind)

Generated project contains:
- `package.json`, `vite.config.ts`, `tailwind.config.ts`, `postcss.config.cjs`
- `src/main.tsx`, `src/App.tsx`, `src/index.css`
- `README.md` with exact run steps

Run:

```bash
npm install
npm run dev
npm run build
```

### B) content-pack (non-code deliverables)

Used for prompts like: emails, marketing copy, strategy docs, market analysis, tweet threads, newsletter ideas.

Outputs:
- `deliverables/01_main.md` (primary deliverable)
- `deliverables/02_variants.md` (alternates)
- `deliverables/03_checklist.md` (QA checklist)
- `deliverables/04_summary.txt` (submission blurb)
- `README.md` + `SPEC.md`

### C) audit-pack (security deliverables)

Used for prompts like: audits, ERC-20 review, vulnerability analysis.

Outputs:
- `deliverables/audit_report.md`
- `deliverables/risk_matrix.md`
- `deliverables/remediation_checklist.md`
- `README.md` + `SPEC.md`

---

## Verification gates

The agent runs a lightweight verification pass before zipping:
- required files exist for the selected template
- scripts exist (`dev`, `build`) for frontend projects
- acceptance checks validate prompt coverage (keyword/anchor gate for content packs)
- zip integrity check ensures the zip includes required artifacts

Notes:
- In network-restricted environments, `npm install` may be skipped safely.
- The zip must still contain a complete, runnable project structure.

---

## Templates (current)

### Frontend
- `landing-vite-tailwind`
- `dashboard-vite-tailwind`
- `crud-vite-tailwind`
- `viz-vite-tailwind`
- `docs-vite-tailwind`
- `auth-settings-vite-tailwind`
- `game-vite-tailwind`
- `story-vite-tailwind`
- `fallback-minimal` (safe UI shell when prompt is ambiguous)

### Non-frontend
- `content-pack`
- `audit-pack`

---

## Useful scripts

```bash
npm run build      # compile TypeScript to dist/
npm run dry-run    # runs a sample prompt file
npm run listen     # start Seedstr polling/websocket runner
npm run typo-check # prompt normalization regression suite
```

---

## Repo structure (high level)

- `src/planner/` prompt -> spec
- `src/router/` spec -> template selection
- `src/templates/` file generators
- `src/verifier/` static + acceptance checks
- `src/builder/` assemble output + repair + zip
- `src/runner/` Seedstr polling + websocket + dedupe
- `src/integrations/` Seedstr REST client + upload/respond

---

## Hackathon submission checklist

- ✅ Agent can run in listener mode with real Seedstr credentials
- ✅ Produces `.zip` reliably per job
- ✅ Generates either:
  - a runnable Vite+React+Tailwind app, or
  - a structured deliverable pack (content/audit)
- ✅ Includes `README.md` + `SPEC.md` for clarity and auditability
- ✅ Fast, deterministic output to optimize score on Speed

Good luck — this is set up to be judged by a bot, so reproducibility and artifact correctness matter.
