# claude-guard

**MCP server that audits AI-generated code the way real attackers would — then fixes only what you check.**

![license](https://img.shields.io/badge/license-MIT-blue)
![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![mcp](https://img.shields.io/badge/MCP-stdio-purple)

- One-line install. **Zero API keys. Zero network calls by default. Zero outbound telemetry.**
- **155 builtin rules** across secrets, SQL/NoSQL injection, XSS, auth, LLM-specific risks, misconfiguration, Docker, and IaC. Detects across **10 languages** via an optional Semgrep adapter.
- **SARIF 2.1.0 export** — drop findings straight into the GitHub Security tab via `github/codeql-action/upload-sarif`.
- **Security scorecard.** Every scan produces a 0–100 score and an A+…F grade, rendered at the top of `findings.md` and available as its own MCP tool, CLI command, and shields.io-compatible endpoint badge.
- **Checkbox-based approval.** `claude-guard` writes a `findings.md` grouped by severity. You toggle `[x]` on the items you want fixed, then run `apply_fixes`. Nothing else is touched.
- **Four AST-based auto-fixes** via `ts-morph`: `set_cookie_flags` (inject missing `httpOnly`/`Secure`/`SameSite`), `split_server_only` (prepend `import "server-only"` to files with leaked service-role clients), `parameterize_query` (rewrite Prisma `$queryRawUnsafe` to the tagged-template safe form), `wrap_with_authz_guard` (inject an `await auth()` / `throw if !session` guard into every exported async Server Action). Everything else lands as an inline annotation for human review.
- **Diff mode**: `scan --diff=main` scans only files changed vs a base ref, so PR gates stay fast even on large repos.
- **Ignore system**: commit a `.claude-guard/ignore.yml` to suppress specific findings by `rule_id`, `file`, or `line` — wildcards and directory prefixes supported. Or drop in an inline `// claude-guard-disable-next-line CG-XXX-NNN` comment right where the finding lives — same shape as `eslint-disable-next-line`.
- **Severity overrides**: `config.yaml` `severity_overrides` lets a team demote or promote individual rules without forking.
- **HTML report** (`claude-guard report`): self-contained, grade-colored, collapsible. Attach to a PR comment and you have an instant artifact reviewers can read.
- **Community plugins.** `config.yaml` `plugins.allowed` loads rule packages from `node_modules`. Plugins are YAML-only by design — no code execution on the plugin surface.
- **Watch mode** (`claude-guard watch`) — live scorecard line on every file save.
- Opt-in red-team mode runs a proof-of-concept probe against **localhost only**, with DNS-rebinding defense and per-finding rate limiting.

## Why

Vibe-coding with Claude or any other model produces a lot of code in a hurry — which means it also produces a lot of the same security mistakes in a hurry. Hardcoded `NEXT_PUBLIC_*` secrets, `$queryRawUnsafe` with string interpolation, Supabase `service_role` imported into a client file, `dangerouslySetInnerHTML` on user input, CORS `*`, and so on.

`claude-guard` is a tiny MCP server that teaches your agent (Claude Code, Claude Desktop, or any MCP-compatible client) to look for these classes of issues the way an attacker would, then walk through the fixes with you instead of rewriting your whole repo without asking.

## Install

### As an MCP server (recommended)

```bash
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

Or, for Claude Desktop, add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "claude-guard": {
      "command": "npx",
      "args": ["-y", "claude-guard-mcp"]
    }
  }
}
```

### As a standalone CLI (optional)

```bash
npx -y claude-guard-mcp   # starts the MCP server
npx claude-guard scan     # one-shot CLI scan of the current directory
npx claude-guard score    # grade for the latest scan
npx claude-guard badge    # shields.io endpoint JSON (for a README badge)
npx claude-guard sarif    # SARIF 2.1.0 for GitHub Code Scanning
npx claude-guard rules    # list active builtin rules by category
npx claude-guard docs     # print the full rule catalogue as markdown
npx claude-guard watch    # continuous rescan on file change (debounced)
```

The `scan` command exits `0` on clean, `2` when CRITICAL findings exist — handy for CI.

### GitHub Code Scanning (drop-in)

Add this workflow and findings appear in your repo's Security tab:

```yaml
# .github/workflows/claude-guard.yml
name: claude-guard
on: [push, pull_request]
permissions: { contents: read, security-events: write }
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npx -y claude-guard-mcp --version  # warms the package
      - run: npx claude-guard scan . || true
      - run: npx claude-guard sarif . > claude-guard.sarif
      - uses: github/codeql-action/upload-sarif@v3
        with: { sarif_file: claude-guard.sarif, category: claude-guard }
```

## See it in action

Run claude-guard against the deliberately-broken Next.js demo app included in this repo:

```bash
$ npx claude-guard scan ./examples/vulnerable-next-app
{
  "scan_id": "747d5448-…",
  "finding_count": 22,
  "duration_ms": 76,
  "layers_run": ["l1", "l2"],
  "summary_by_severity": { "CRITICAL": 11, "HIGH": 7, "MEDIUM": 2, "LOW": 2 },
  "scorecard": {
    "score": 0, "grade": "F",
    "headline": "Grade F — score 0/100 (11 CRITICAL, 7 HIGH, 2 MEDIUM, 2 LOW)"
  }
}
```

```bash
$ npx claude-guard list ./examples/vulnerable-next-app | head -20
# claude-guard findings — scan_id: 8e4c8731-…

> Security scorecard: Grade F — score 4/100 (4 CRITICAL, 2 HIGH)

## CRITICAL (4)

- [ ] CG-SQL-002 `app/api/users/route.ts:7` — Prisma $queryRawUnsafe
  strategy: parameterize_query

- [ ] CG-SEC-001 `.env.example:1` — NEXT_PUBLIC_* appears to hold a secret
  strategy: rename_env_var

- [ ] CG-SEC-001 `.env.example:2` — NEXT_PUBLIC_* appears to hold a secret
  strategy: rename_env_var

- [ ] CG-SEC-003 `lib/supabase.ts:5` — service_role on a client-reachable path
  strategy: split_server_only
```

Toggle `[x]` on the findings you want fixed, then run `apply_fixes`:

```
> Apply the fixes for scan 8e4c8731-… (mode: checked)
  applied:   ["...CG-SEC-001...", "...CG-SEC-003..."]  # AST rewrites
  suggested: ["...CG-SQL-002...", "...CG-AUTH-001..."] # inline TODO annotations
  branch:    claude-guard/fix-8e4c8731
  diff_path: .claude-guard/rollback/8e4c8731-....patch
```

claude-guard creates a `claude-guard/fix-<scan_id>` branch, stages the changes, and writes a rollback patch under `.claude-guard/rollback/`. You review, commit (or revert with `claude-guard rollback <id>`), and keep moving.

## Usage

In any MCP client, in plain language:

```
> Scan /path/to/my/project with claude-guard.
> List the findings.
# Open .claude-guard/findings.md in your editor, toggle [x] on what you want fixed.
> Apply the fixes for scan <scan_id>.
> Show me the diff — I'll commit it.
```

## Tools

| tool | purpose |
|---|---|
| `scan` | Run detection (L1 Semgrep/Gitleaks if present, L2 builtin rules). Writes `findings.json`. |
| `score` | Compute the security grade (A+/A/B/C/D/F) for the latest scan. |
| `list_findings` | Render `.claude-guard/findings.md` with a scorecard banner and checkboxes grouped by severity. |
| `explain` | Rule rationale, attack scenario, PoC payload, fix guidance. |
| `apply_fixes` | Apply fixes for checked items on a dedicated branch; git-staged, not committed. |
| `rollback` | Revert a previous fix batch via saved patch. |
| `redteam_probe` | Loopback-only live probe (opt-in). External targets are hard-blocked. |
| `list_checks` | Show active rule catalogue by category. |
| `init_config` | Create `.claude-guard/config.yaml` with defaults. |

## Builtin rules

**155 rules** across eight categories, targeting the failure modes we see most often in AI-generated web code:

| category | count | representative rules |
|---|---|---|
| `secrets` | 16 | `NEXT_PUBLIC_*` secret names, literal OpenAI / Anthropic / AWS / Google / Stripe / GitHub PAT keys, private-key PEM blocks, committed `.env`, Supabase `service_role` on a client-reachable path, GCP service-account JSON, `github_pat_*`, kubeconfig with an embedded token, JWT tokens in source, Mongo URI with inline `user:password`, `next.config.js` exposing a secret-shaped var |
| `sql` | 8 | SQL string concatenation, Prisma `$queryRawUnsafe` / `$executeRawUnsafe`, Knex `.raw()` interpolation, Python f-string / `.format()` queries, MongoDB `$where`, SQLAlchemy `text()` + f-string, Django `.raw()` + f-string, Sequelize `query()` template-literal |
| `xss` | 8 | React `dangerouslySetInnerHTML` with a dynamic value, Vue `v-html`, Svelte `{@html}`, direct `innerHTML =`, `href="javascript:…"`, `target="_blank"` without `rel=noopener`, `eval` / `new Function` on template literal, `window.open(var)` |
| `auth` | 17 | Hardcoded JWT secret / JWT `alg: none` / JWT verified via `decode`, missing cookie flags, low-round bcrypt, MD5/SHA1 for passwords, `Math.random` for tokens, OAuth without `state`, session in `localStorage`, multi-year cookie lifetime, mass-assignment via `req.body.role`, CSRF middleware missing on state-change routes, timing-unsafe secret comparison, password min-length under 8, email-enumeration in login, password in URL query |
| `llm` | 12 | User input in a system prompt, `eval` / `new Function` on LLM output, client-side Anthropic/OpenAI SDK with a visible key, tool params into shell/file IO, LLM output rendered as raw HTML, system prompt in client-reachable module, vector-DB SDK with `NEXT_PUBLIC_*` key, secret interpolated into prompt, fetch with `apiKey` in the body, prompt template path chosen by request input, agent tool handler shells out on LLM input, `stream:true` without abort |
| `misconfig` | 38 | CORS `*`, Supabase RLS off, Firebase `if true`, open redirect, Express without `helmet`, Next.js Server Action with no auth, S3 public ACL, SSRF from request input, cloud-metadata IP fetch, iframe `src` from user input, missing CSP, path traversal via request input, Django `DEBUG = True`, shell `exec` on request input, Python `yaml.load` / `pickle.loads` / remote-loaded model, XXE-prone XML parsers, `rejectUnauthorized=false`, Mongoose `find(req.query)`, webhook without signature check, auth-facing routes without rate limit, GraphQL introspection / cost guard, Redis no-auth, verbose error stack traces, `/admin` /`/debug` routes without auth, CRLF-injectable `setHeader`, `verifyClient` returning true on WebSocket, temp files built with `Math.random`, remote ML model load, Host-header trust, CORS credentials + origin reflection, zip-slip archive extract, RegExp from user input, logs containing `req.body` |
| `docker` | 2 | Dockerfile `FROM :latest` / untagged, `apt-get install` without `--no-install-recommends` |
| `iac` | 9 | Terraform security group `0.0.0.0/0`, Terraform public S3 ACL, Terraform unencrypted storage, Kubernetes `hostPath`, Kubernetes `privileged: true`, Kubernetes Secret with plain `stringData`, GitHub Actions `run:` with `${{ github.event.* }}`, GitHub Actions with broad write permissions, GitHub Actions `uses:` pinned to a mutable branch |

Call `list_checks` or `claude-guard rules` to see the full active catalogue. Rules are YAML — `rules/<category>/CG-XXX-NNN-slug.yml`. Contributions welcome.

## Auto-fix coverage

Auto-fix strategies shipped today:

- `rename_env_var` — renames `NEXT_PUBLIC_*` secret-like variables in `.env*` **and** every referencing source file in one pass.
- `set_cookie_flags` — AST-based via `ts-morph`. Adds missing `httpOnly` / `secure` / `sameSite` to `cookies().set(...)` calls while preserving your existing options and formatting.
- `split_server_only` — prepends `import "server-only";` to files that use Supabase `service_role`, so Next.js refuses to ship them to the client bundle.
- `parameterize_query` — rewrites Prisma `$queryRawUnsafe` / `$executeRawUnsafe` calls to the tagged-template form, handling both template-literal inputs and `(string, ...params)` placeholders.
- `wrap_with_authz_guard` — adds an `auth()` import (if missing) and prepends an `await auth()` + `if (!session) throw` guard to every exported async Server Action.
- `suggest_only` — inserts an inline `// claude-guard: ...` annotation on the vulnerable line with the rule id and a short explanation. Used for issues where an automatic rewrite would be unsafe without human judgement.

Everything else is surfaced as an annotated suggestion. The project's position is: **a wrong automatic fix is worse than a clearly annotated manual one**.

## Red-team mode (opt-in)

When enabled, `redteam_probe` will issue a single GET against a loopback URL to demonstrate a concrete attack path for a finding. Guardrails:

- Allowed hosts: `localhost`, `127.0.0.1`, `::1`, `0.0.0.0` (string check).
- DNS resolve of the hostname must resolve only to loopback IPs (DNS rebinding defense).
- RFC1918, link-local, IPv6 ULA/link-local, and multicast addresses are hard-blocked.
- 1 probe per finding per scan, 10 probes per minute per process.
- Redirects are not followed. 5s request timeout. 1MB response cap.
- Every request is logged under `.claude-guard/redteam/`.

See `SECURITY.md` for the responsible-use policy.

## Configuration

`.claude-guard/config.yaml`:

```yaml
version: 1
layers: [l1, l2]
engines:
  semgrep: auto
  trivy: auto
  gitleaks: auto
plugins:
  allowed: []
severity_threshold: LOW
fix:
  dry_run_default: false
  require_clean_tree: true
redteam:
  enabled: false
  allowed_targets: [localhost]
```

Run `init_config` to create this file with defaults.

## How claude-guard compares

| | claude-guard | Semgrep | Gitleaks | Snyk Code | SonarQube |
|---|---|---|---|---|---|
| MCP server for Claude Code / Desktop | ✅ | — | — | — | — |
| AI-vibe-coding-specific rules (NEXT_PUBLIC secrets, LLM SDK client leaks, prompt injection, service_role) | ✅ | partial | — | — | — |
| Checkbox-approved auto-fix with git branch staging | ✅ | — | — | — | — |
| 0 API keys, 0 network calls by default | ✅ | ✅ (local) | ✅ | — | — |
| SARIF 2.1.0 output | ✅ | ✅ | ✅ | ✅ | ✅ |
| Security grade / scorecard | ✅ | — | — | partial | ✅ |
| Opt-in loopback-only PoC probe | ✅ | — | — | — | — |
| Rule catalogue size | 155 | 2000+ | secrets-only | thousands | thousands |

claude-guard is intentionally small and opinionated for one audience: people shipping AI-generated code who need fast, actionable, fix-oriented feedback inside their agent. It is complementary to Semgrep / Sonar / Snyk, not a replacement — run it alongside.

## FAQ

**Does claude-guard send my code anywhere?**
No. Default mode does no network calls, no telemetry, and never prompts an LLM on your behalf. The "LLM-native rules" are interpreted by whatever Claude is already in your MCP client — claude-guard itself is just regex + YAML.

**Does it run arbitrary code from rule files?**
No. Rules are YAML; we don't load JavaScript from rules. Every regex is screened by `safe-regex2` at load time and wrapped in the platform's normal regex engine with no `eval` path.

**What's the red-team mode actually doing?**
If (and only if) you run `redteam_probe`, claude-guard sends one HTTP GET to a loopback URL you pass it. Loopback is enforced by string check **and** DNS lookup — a rebinding record that resolves to a public IP is rejected. There's a rate limiter on top. See `SECURITY.md` for the full list of guardrails.

**Why the checkbox UX instead of auto-fix-everything?**
Auto-fixing a mis-identified SQL injection turns a false positive into a functional regression. Forcing you to tick `[x]` on each finding trades a bit of keystroke time for confidence — and bulk-applying still works via `apply_fixes --mode=all_safe`.

**Does it replace Snyk / Semgrep / Sonar?**
No. Run it alongside. claude-guard's niche is "the 100 things Claude-assisted code gets wrong most often, with fixes wired up."

**How do I ignore a noisy rule?**
Three knobs, pick the one that matches your lifetime: inline `// claude-guard-disable-next-line CG-XXX-NNN`, a `.claude-guard/ignore.yml` entry via `claude-guard suppress <finding_id>`, or a config-level `severity_overrides` entry that demotes the rule to `LOW` so it falls below the threshold.

**Can I write my own rules?**
Yes — drop a YAML file in `rules/<category>/CG-XXX-NNN.yml`, add `bad/` and `good/` fixture files, and the fixture regression test will enforce that your rule fires on the bad case and is silent on the good case. For community packages, publish to npm as `claude-guard-plugin-*`, include a `claude-guard-plugin.yml` manifest, and list the package in `config.yaml` `plugins.allowed`.

## Not goals

- Attacking external services or third-party APIs.
- Runtime WAF or production gating.
- Competing with Burp / ZAP as a general penetration-testing tool.

## License

MIT. See `LICENSE`.
