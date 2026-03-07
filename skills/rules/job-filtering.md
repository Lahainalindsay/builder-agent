## Job Filtering Rules
- Decline if prompt requests illegal hacking, malware, credential theft, or personal data exfiltration.
- Decline if prompt length > 10,000 chars (likely unbounded).
- Decline if budget < MIN_BUDGET.

## Decision Table
| Condition | Action | Reason |
|---|---|---|
| budget < $2.00 | DECLINE | below floor |
| prompt.length > 10000 | DECLINE | unbounded scope |
| prompt contains "malware" | DECLINE | unsafe request |
| prompt contains "credential theft" | DECLINE | unsafe request |
| prompt contains "phishing" | DECLINE | unsafe request |
| prompt contains "backdoor" | DECLINE | unsafe request |
| prompt contains "illegal" | DECLINE | policy violation |

## Accept
- Frontend app requests -> generate Vite+React+Tailwind project zip.
- Writing/content requests -> generate content-pack deliverables zip.
- Smart contract security audit request -> audit-pack (if no code, assumption-based).
