## Lookup Triggers (Best-Effort)
Only run if prompt explicitly requests current/latest or includes market size + today/current.

Per-request timeout: 8s
Total time budget: 12s

If fail: write note to deliverables/05_sources.md and proceed.

## Decision Table
| Condition | Action | Reason |
|---|---|---|
| prompt contains "current" | ACCEPT | allow lookup |
| prompt contains "latest" | ACCEPT | allow lookup |
| prompt contains "today" | ACCEPT | allow lookup |
| prompt contains "market size" | ACCEPT | allow lookup |
