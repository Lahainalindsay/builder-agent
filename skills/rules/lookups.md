## Lookup Triggers (Best-Effort)
Only run lookups when a prompt explicitly requests fresh/current data or references external systems.

Per-request timeout: 8s
Total time budget: 12s

If fail: continue with deterministic output and record warnings in sources/checklist.

## Constraint Handlers
IF prompt contains "current price" OR "market value" OR "market cap":
  - Call: `GET https://api.coingecko.com/api/v3/simple/price`
  - Inject: live price snapshot into response context

IF prompt contains "github" OR "repository" OR "repo":
  - Call: `GET https://api.github.com/repos/{owner}/{repo}`
  - Fetch: repository metadata + recent commits
  - Include: summary in response context

IF prompt contains "documentation" OR "docs" OR "how to":
  - Call: npm/github docs sources based on package names
  - Include: package metadata + links

IF prompt contains "weather" OR "forecast":
  - Call: geocoding + weather endpoints
  - Include: location-aware weather summary

IF prompt contains "exchange rate" OR "fx" OR "usd to":
  - Call: FX endpoint for latest conversion rates
  - Include: conversion snapshot

## Decision Table
| Condition | Action | Reason |
|---|---|---|
| prompt contains "current" | ACCEPT + LOOKUP | allow fresh context |
| prompt contains "latest" | ACCEPT + LOOKUP | allow fresh context |
| prompt contains "today" | ACCEPT + LOOKUP | allow fresh context |
| prompt contains "market size" | ACCEPT + LOOKUP | enrich analysis |
