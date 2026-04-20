# claude-guard

**English** · [한국어](README.ko.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [Español](README.es.md)

A local MCP server that audits common security mistakes in vibe-coded projects. 155 rules / 5 AST-backed auto-fixes / 137 tests.

> Not a replacement for a full security program. It's a first-pass local filter for the boring-but-common mistakes AI-assisted coding keeps producing: client-exposed secrets, raw SQL, prompt injection, missing cookie flags. For cross-file dataflow, CVE scanning, and runtime attacks, pair it with other tools.

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![rules](https://img.shields.io/badge/rules-155-8a2be2)](docs/rules.md)
[![tests](https://img.shields.io/badge/tests-137%20passing-brightgreen)](tests)

## Install

```bash
claude mcp add claude-guard -- npx -y -p claude-guard-mcp claude-guard-mcp
```

## Usage

| Command | What it does |
|---|---|
| `/mcp__claude-guard__scan` | Scan the project → write `.claude-guard/findings.md` |
| `/mcp__claude-guard__fix` | AST-rewrite only the items you've ticked `[x]` |

Fixes land staged on a `claude-guard/fix-<id>` branch. You own the commit.

## What it catches

### Secrets (19)
- Secret values leaking through `NEXT_PUBLIC_*` (OpenAI / Anthropic / Stripe secrets, etc.)
- Supabase `service_role` key reaching the client bundle
- Hardcoded API keys, tokens, passwords, private keys
- Committed `.env` / `.env.local` / `.env.production` files
- JWT signing secrets embedded in source
- Credentials left in git history (gitleaks integration)

### Auth & Access Control (23)
- Cookies missing `httpOnly` / `secure` / `sameSite`
- JWT `alg: none` and HS256 ↔ RS256 algorithm confusion
- Tokens / passwords in URL query strings
- `"use server"` actions and API routes with no authorization check
- Supabase RLS disabled
- Missing CSRF token validation
- Low bcrypt / scrypt / argon2 rounds
- Password reset URLs containing the raw token
- Session fixation and predictable session IDs

### SQL / NoSQL Injection (10)
- Prisma `$queryRawUnsafe` / `$executeRawUnsafe` with user input
- Knex `.raw()` with template-string interpolation
- Drizzle `sql.raw(var)`
- Sequelize `literal()` injection
- MongoDB operator injection (`$where`, `$regex` filters)
- Python f-string / `%`-formatted SQL
- SQLAlchemy `text()` with formatting

### XSS (10)
- React `dangerouslySetInnerHTML` with unsanitized values
- Vue `v-html` binding unsanitized input
- Svelte `{@html}` on raw user input
- Markdown rendered without escaping
- Direct `innerHTML` / `outerHTML` assignment
- `href={expr}` without scheme validation (allows `javascript:`)
- `target="_blank"` missing `rel="noopener noreferrer"` (tabnabbing)

### LLM Security (17)
- User input concatenated directly into the system prompt (prompt injection)
- RAG retrieval results injected as system messages
- LLM output rendered through `dangerouslySetInnerHTML`
- OpenAI / Anthropic keys bundled into the client
- MCP tool input schemas with freeform `type: string` (no enum, no pattern)
- Conversation history persisting secrets / PII
- Function-call results written to the DOM without validation

### Misconfiguration (62)
- CORS `origin: '*'` combined with credentials
- HSTS `max-age` under one year
- Next.js `rewrites()` with external destinations (open proxy)
- Next.js `images.remotePatterns` with hostname `*`
- Next.js `headers()` with no CSP
- Supabase RLS off
- Express / Fastify without Helmet
- TLS verification disabled (`rejectUnauthorized: false`)
- File upload without `limits` (multer / busboy)
- Endpoints without rate limiting
- `lodash.template(req.body.*)` (CVE-prone)
- Electron `BrowserWindow` with `nodeIntegration: true`
- `node-serialize` usage (CVE-2017-5941)
- tRPC `publicProcedure.mutation` (state change without auth)

### IaC (12)
- S3 bucket public-read / public-write ACL
- IAM policy with `Action: "*"` / `Resource: "*"`
- Security group inbound `0.0.0.0/0` (SSH, RDP, DB ports)
- Terraform-declared public RDS / Postgres
- Firestore rules `allow read, write: if true`
- GCS public bucket
- Kubernetes `hostNetwork: true` / `privileged: true`

### Docker (2)
- `USER root` or no `USER` directive
- Base image pinned to `latest`

Full rule catalogue: [`docs/rules.md`](docs/rules.md)

## Auto-fix (5)

- Rename `NEXT_PUBLIC_*` secrets (updates the env file and every reference atomically)
- Add `httpOnly` / `secure` / `sameSite` to cookies
- Insert `import "server-only"` into modules that touch `service_role`
- Convert raw SQL → tagged template form
- Wrap `"use server"` functions with an auth guard

The other 150 rules are detection-only — a finding plus a one-line remediation note, no patch.

## Limits

- No cross-file dataflow / taint analysis → use Semgrep Pro or CodeQL
- No dependency CVE scanning → use Snyk / osv-scanner / Dependabot
- No runtime defence → WAF / RASP
- No business logic, IDOR, or complex authorization chains → pentest
- Strong coverage: JS / TS / JSX / TSX, Next.js, Express, Prisma, Drizzle, Supabase, Firebase, Terraform, Dockerfile
- Partial coverage: Python, Java
- Not yet covered: Rust, Go, Swift, Kotlin
- Four suppression paths: inline comment, `ignore.yml`, `severity_overrides`, `baseline`

## Security principles

- Default run is fully offline. Semgrep is opt-in; only then does `semgrep.dev` fetch a ruleset.
- No telemetry, no LLM API key, no account.
- Rules are YAML-only; every regex is re-validated with `safe-regex2` at load time.
- Plugin allowlist + atomic loading (one broken rule rejects the whole plugin).
- Red-team probe is opt-in, loopback-only, with DNS rebinding defence.
- Fixes never commit. Dirty tree is refused; a rollback patch is saved automatically.

Full threat model: [`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md)

## Export / CI

- SARIF 2.1.0 → GitHub Code Scanning
- JUnit XML · HTML · CSV
- shields.io endpoint JSON (badges)
- pre-commit hook (blocks CRITICAL)

## License

MIT. Vulnerability disclosure: [`SECURITY.md`](SECURITY.md)
