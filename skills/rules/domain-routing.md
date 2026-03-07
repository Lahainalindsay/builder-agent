## Routing Heuristics
- If prompt includes: email, cold email, outreach, tweet thread, newsletter, pitch deck, landing page copy -> content-pack
- If prompt includes: audit, security audit, vulnerabilities, ERC-20/ERC20 -> audit-pack
- If prompt includes: dashboard, admin, analytics -> dashboard template
- If prompt includes: CRUD, inventory, tracker, manage -> crud template
- If prompt includes: docs, knowledge base, help center -> docs template
- If prompt includes: game, spaceship, asteroids -> game template
- Else -> fallback minimal (prefer landing/dashboard over fallback when possible)

## Decision Table
| Condition | Action | Reason |
|---|---|---|
| prompt contains "cold email" | ACCEPT | route content-pack |
| prompt contains "newsletter" | ACCEPT | route content-pack |
| prompt contains "tweet thread" | ACCEPT | route content-pack |
| prompt contains "pitch deck" | ACCEPT | route content-pack |
| prompt contains "landing page copy" | ACCEPT | route content-pack |
| prompt contains "audit" | ACCEPT | route audit-pack |
| prompt contains "security audit" | ACCEPT | route audit-pack |
| prompt contains "erc-20" | ACCEPT | route audit-pack |
| prompt contains "dashboard" | ACCEPT | route dashboard template |
| prompt contains "crud" | ACCEPT | route crud template |
| prompt contains "docs" | ACCEPT | route docs template |
| prompt contains "game" | ACCEPT | route game template |
