# claude-guard

**English** · [한국어](README.ko.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [Español](README.es.md)

**An MCP server that audits AI-generated code the way real attackers would — then fixes only what you check.**

![license](https://img.shields.io/badge/license-MIT-blue)
![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![mcp](https://img.shields.io/badge/MCP-stdio-purple)
![rules](https://img.shields.io/badge/rules-155-8a2be2)
![tests](https://img.shields.io/badge/tests-111%20passing-brightgreen)

```
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

Zero API keys. Zero network calls by default. Zero outbound telemetry.

---

## Table of contents

- [Why claude-guard exists](#why-claude-guard-exists)
- [How it keeps your code secure](#how-it-keeps-your-code-secure)
  - [1. Three-layer detection](#1-three-layer-detection)
  - [2. Scorecard + grade](#2-scorecard--grade)
  - [3. Checkbox-approved fixes](#3-checkbox-approved-fixes)
  - [4. Four suppression layers, all reviewable](#4-four-suppression-layers-all-reviewable)
- [How it keeps itself secure](#how-it-keeps-itself-secure)
  - [Privacy and data flow](#privacy-and-data-flow)
  - [Plugin safety](#plugin-safety)
  - [Red-team mode guardrails](#red-team-mode-guardrails)
  - [Regex safety (ReDoS)](#regex-safety-redos)
  - [Git safety](#git-safety)
- [Install](#install)
- [See it in action](#see-it-in-action)
- [Everyday workflow](#everyday-workflow)
- [Rule catalogue](#rule-catalogue)
- [Auto-fix strategies](#auto-fix-strategies)
- [CI integration](#ci-integration)
- [Configuration](#configuration)
- [Comparison with other tools](#comparison-with-other-tools)
- [FAQ](#faq)
- [Not goals](#not-goals)
- [License](#license)

---

## Why claude-guard exists

Vibe-coding with Claude or any other model ships a lot of code in a hurry — which means it ships a lot of the same security mistakes in a hurry. `NEXT_PUBLIC_OPENAI_API_KEY` in `.env`, `prisma.$queryRawUnsafe` interpolated from `req.query`, Supabase `service_role` imported into a client component, `dangerouslySetInnerHTML` on AI output, CORS `"*"` with credentials, committed `stripe-signature`-less webhook handlers — the same twenty mistakes, every week.

claude-guard is a small MCP server that teaches your agent (Claude Code, Claude Desktop, any MCP-compatible client) to look for these mistakes the way an attacker would and walk through fixes with you, instead of rewriting your repo unchecked.

---

## How it keeps your code secure

The security story is four ideas layered on top of each other. Each one is simple by itself; together they cover find → grade → fix → suppress in a way that a human can always audit.

### 1. Three-layer detection

```
┌─────────────────────────────────────────────────────────────┐
│  L1  OSS engines (optional, auto-detected)                  │
│      semgrep · gitleaks · osv-scanner · npm/pip audit       │
├─────────────────────────────────────────────────────────────┤
│  L2  155 builtin YAML rules                                 │
│      secrets · sql · xss · auth · llm · misconfig · docker · iac │
├─────────────────────────────────────────────────────────────┤
│  L3  Red-team simulator (opt-in)                            │
│      static PoC payloads + loopback-only live probe         │
└─────────────────────────────────────────────────────────────┘
```

- **L1** orchestrates the best existing OSS tools if they're installed — Semgrep's 2000+ ruleset, Gitleaks' git-history secret scan, OSV dependency CVEs. All **optional**; claude-guard works with just L2.
- **L2** is claude-guard's own rule catalog: YAML regex patterns focused on the failure modes AI-generated code gets wrong. Every rule ships with positive + negative fixtures, so the test suite enforces that the rule fires on the bad case and stays silent on the good one.
- **L3** is opt-in and off by default. When you run `redteam_probe` it sends **one** HTTP GET against a loopback URL to demonstrate an attack path. External targets are hard-blocked (see [red-team guardrails](#red-team-mode-guardrails)).

The result is one normalized `Finding` shape (rule_id, severity, file, line, evidence, suggested fix) regardless of which engine produced it, deduplicated by `(file, line, rule_id)` so Semgrep and L2 don't report the same issue twice.

### 2. Scorecard + grade

Every scan produces a 0–100 score and an A+…F grade:

| severity | weight | per-severity cap |
|---|---|---|
| CRITICAL | -20 | -80 |
| HIGH | -8 | -40 |
| MEDIUM | -3 | -20 |
| LOW | -1 | -10 |

The grade is rendered at the top of `.claude-guard/findings.md`, exposed as an MCP tool (`score`), as a CLI command (`claude-guard score`), and as a shields.io-compatible endpoint JSON (`claude-guard badge`). Every scan also appends a one-line entry to `.claude-guard/history.json` so you can watch the grade move over time with `claude-guard trend`.

### 3. Checkbox-approved fixes

Once you've scanned, claude-guard writes a markdown checklist:

```markdown
# claude-guard findings — scan_id: 747d5448-…

> Security scorecard: Grade F — score 0/100 (11 CRITICAL, 7 HIGH, 2 MEDIUM, 2 LOW)

## CRITICAL (11)
- [ ] <!-- finding_id: … --> **CG-SQL-002** `app/api/users/route.ts:7` — Prisma $queryRawUnsafe
  - strategy: parameterize_query
- [ ] <!-- finding_id: … --> **CG-SEC-001** `.env:1` — NEXT_PUBLIC_OPENAI_KEY looks like a secret
  - strategy: rename_env_var
- [ ] <!-- finding_id: … --> **CG-SEC-003** `lib/supabase.ts:5` — service_role on a client-reachable path
  - strategy: split_server_only
...
```

You toggle `[x]` on the items you want fixed. `apply_fixes` then:

1. Refuses to touch a dirty working tree unless you pass `force=true`.
2. Creates a `claude-guard/fix-<scan_id>` branch.
3. Dispatches each selected finding to a **fix strategy** — five of them are AST-based via `ts-morph`, the rest fall back to `suggest_only`, which inserts an inline `// claude-guard: ...` annotation rather than guess at a rewrite.
4. Stages the changes (`git add -A`) but **does not commit**. You review and commit (or discard).
5. Writes a rollback patch to `.claude-guard/rollback/<scan_id>.patch`. Reverse with `claude-guard rollback <scan_id>`.

Full AST rewrites shipped today: `rename_env_var`, `set_cookie_flags`, `split_server_only`, `parameterize_query`, `wrap_with_authz_guard`. Everything else becomes a clearly-marked TODO annotation rather than an ambiguous automatic rewrite. **The rule: a wrong automatic fix is worse than a clearly annotated manual one.**

### 4. Four suppression layers, all reviewable

False positives happen. claude-guard gives you four knobs, each one textual and diffable:

| where | scope | use when |
|---|---|---|
| `// claude-guard-disable-next-line CG-XXX-NNN` | one line | a specific finding is a false positive at a specific place |
| `.claude-guard/ignore.yml` (via `claude-guard suppress <id>`) | pinned by rule_id + file + line | you want the ignore in its own committed file, with an optional `reason:` |
| `config.yaml` `severity_overrides: { CG-CFG-005: LOW }` | the rule, project-wide | your team doesn't care about the rule at its default severity |
| `claude-guard baseline` | everything currently present | adopting claude-guard on a mature codebase without drowning in noise; future scans only report **new** findings |

Every layer is plain text in your repo. No hidden tombstone database.

---

## How it keeps itself secure

Defensive security tools are themselves a supply-chain target. claude-guard is designed so that even a compromised rule package, a prompt-injected scan, or a malicious input URL can't turn your audit into an incident.

### Privacy and data flow

- **No network calls by default.** The default `layers: [l1, l2]` config is 100% local. L1 adapters only shell out to tools you already have installed (Semgrep, Gitleaks); they still send nothing outside your machine.
- **No LLM API key required.** claude-guard does not call any model. The "LLM-native rules" are regex + YAML; the contextual explanation is done by whatever Claude is already in your MCP client.
- **No telemetry.** We don't ship analytics. There is no phone-home; check `grep -R 'https://' src/` — every URL is a documentation link or a loopback target.
- **Findings stay local.** `.claude-guard/` is auto-added to `.gitignore` on the first scan so findings, rollback patches, and red-team logs never leak into a remote.

### Plugin safety

The rule catalog is designed to accept community contributions **without** becoming a supply-chain attack vector:

- Plugins are **YAML only**. claude-guard does not load JavaScript from plugins — neither at import time nor at rule-evaluation time.
- Plugins are **whitelisted**. A package listed in `plugins.allowed` inside `.claude-guard/config.yaml` is loaded; anything else is ignored with a `PLUGIN_UNTRUSTED` warning.
- Plugin rules go through the **same JSON Schema + ReDoS validation** as builtin rules. A single invalid pattern rejects the whole rule package with a clear error, not a partial load.
- A plugin that needs a custom AST-based fix strategy cannot define it; those live in `src/fix/` and must land via a core PR. This is a deliberate choice — it's the simplest way to prove that installing a plugin cannot execute arbitrary code.

### Red-team mode guardrails

`redteam_probe` is opt-in and off by default. When it runs, the request goes through four checks *before* any socket opens:

1. **Protocol allowlist** — only `http:` and `https:` URLs. `file://`, `gopher://`, `ftp://` are rejected.
2. **Hostname allowlist (string)** — only `localhost`, `127.0.0.1`, `::1`, `0.0.0.0`. Anything else → `HOSTNAME` rejection.
3. **DNS re-resolution** — the hostname is resolved with `dns.lookup({ all: true })` and **every** returned address must be a loopback IP. A DNS rebinding record that resolves to a public IP is rejected with `DNS_REBIND`.
4. **Rate limit** — 1 probe per `finding_id`, 10 probes per minute per process. Enforced in-memory; a burst of requests from a prompt-injected scan doesn't get amplified.

On top of that: no redirect following, 5-second timeout, 1 MB response cap, and every request + response is audit-logged under `.claude-guard/redteam/<finding_id>.log`.

### Regex safety (ReDoS)

Every rule regex is validated at load time:

- The pattern must compile as a `RegExp` (`new RegExp(src)` success).
- The pattern must pass [`safe-regex2`](https://github.com/davisjam/safe-regex) — a static analysis that rejects patterns whose worst-case backtracking is super-linear.

An unsafe pattern rejects the **entire rule file** rather than silently degrading. This means a malicious contribution can't ship a pattern that stalls the scanner on a crafted input.

### Git safety

Fixes never happen "magically":

- `apply_fixes` refuses to touch a dirty working tree unless `force=true` is explicitly passed.
- Fixes land on a separate `claude-guard/fix-<scan_id>` branch, not on your current branch.
- Changes are staged (`git add -A`) but **not committed**. You own the commit message and the decision.
- Every fix batch writes a unified-diff rollback patch you can re-apply with `git apply --reverse` (`claude-guard rollback <id>` does exactly that).
- The pre-commit hook installed by `claude-guard install-hooks` blocks commits that would introduce CRITICAL findings; it is idempotent and preserves any existing pre-commit hook by chaining.

---

## Install

### As an MCP server (recommended)

```bash
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

Or for Claude Desktop, add to `claude_desktop_config.json`:

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

### As a standalone CLI

```bash
npx claude-guard scan               # scan cwd
npx claude-guard fix                # one-shot scan + apply all safe fixes
npx claude-guard score              # grade for the latest scan
npx claude-guard badge              # shields.io endpoint JSON
npx claude-guard sarif              # SARIF 2.1.0
npx claude-guard junit              # JUnit XML
npx claude-guard csv                # spreadsheet-friendly CSV
npx claude-guard report --open      # self-contained HTML report, opened in browser
npx claude-guard watch              # live scorecard on every file save
npx claude-guard rules              # active rule catalogue (summary)
npx claude-guard docs                # full rule catalogue as markdown
npx claude-guard validate-rule f.yml  # validate one YAML rule file
npx claude-guard init                # detect stack, write smart config.yaml
npx claude-guard baseline           # snapshot current findings as baseline
npx claude-guard diff-scans a b     # what changed between two scans
npx claude-guard install-hooks      # pre-commit hook that blocks CRITICAL
```

`scan` exits `0` on clean, `2` when CRITICAL findings exist — handy for CI gating.

---

## See it in action

Run claude-guard against the deliberately-broken Next.js demo app included in this repo:

```bash
$ npx claude-guard scan ./examples/vulnerable-next-app

  F     0/100   Grade F — score 0/100 (11 CRITICAL, 7 HIGH, 2 MEDIUM, 2 LOW)
  scan_id=747d5448  findings=22  duration=76ms  layers=l1,l2
  11 CRITICAL   7 HIGH   2 MEDIUM   2 LOW
  next: claude-guard list   # toggle [x] on fixes
```

Look at what was found and what each fix strategy will do:

```bash
$ npx claude-guard list ./examples/vulnerable-next-app | head -20
# claude-guard findings — scan_id: 747d5448-…

> Security scorecard: Grade F — score 0/100 (11 CRITICAL, 7 HIGH, 2 MEDIUM, 2 LOW)

## CRITICAL (11)
- [ ] CG-SQL-002 `app/api/users/route.ts:7` — Prisma $queryRawUnsafe
    strategy: parameterize_query
- [ ] CG-SEC-001 `.env.example:1` — NEXT_PUBLIC_OPENAI_API_KEY looks like a secret
    strategy: rename_env_var
- [ ] CG-SEC-003 `lib/supabase.ts:5` — service_role on a client-reachable path
    strategy: split_server_only
- [ ] CG-CFG-018 `app/api/chat/route.ts:…` — shell exec on request input
    strategy: suggest_only
...
```

Toggle `[x]` on the findings you want fixed, save `findings.md`, then:

```
> Apply the fixes for scan 747d5448-… (mode: checked)
  applied:   CG-SEC-001 · CG-SEC-003 · CG-AUTH-002 · CG-SQL-002
  suggested: CG-CFG-018 · CG-CFG-012 · CG-AUTH-001
  branch:    claude-guard/fix-747d5448
  rollback:  .claude-guard/rollback/747d5448-….patch
```

Review the staged diff, commit (or `claude-guard rollback 747d5448` to undo), and you're done.

---

## Everyday workflow

Inside Claude Code or Claude Desktop, just ask in plain language:

```
> Scan /path/to/my/project with claude-guard.
> What's the grade?
> Explain CG-SEC-003 for this repo.
> Open findings.md — I'll toggle what I want fixed.
> Apply the fixes for scan <scan_id>.
> Show me the staged diff so I can commit.
```

Outside of an MCP client, the CLI does the same thing:

```bash
claude-guard scan .
claude-guard list .         # writes .claude-guard/findings.md
# (open, toggle [x] in your editor, save)
claude-guard fix .          # or: claude-guard apply_fixes via MCP
```

---

## Rule catalogue

**155 rules** across eight categories. Each has positive + negative test fixtures committed under `fixtures/rules/<id>/`; adding a rule means adding fixtures.

| category | count | representative rules |
|---|---|---|
| `secrets` | 16 | `NEXT_PUBLIC_*` secret names, literal OpenAI / Anthropic / AWS / Google / Stripe / GitHub PAT keys, private-key PEM blocks, committed `.env`, Supabase `service_role` on a client-reachable path, GCP service-account JSON, `github_pat_*`, kubeconfig with an embedded token, JWT tokens in source, MongoDB URI with inline `user:password`, `next.config.js` exposing a secret-shaped var |
| `sql` | 10 | SQL string concatenation, Prisma `$queryRawUnsafe` / `$executeRawUnsafe`, Knex `.raw()` interpolation, Python f-string / `.format()` queries, MongoDB `$where`, SQLAlchemy `text()` + f-string, Django `.raw()` + f-string, Sequelize template-literal, TypeORM `.query()` template-literal, Drizzle `sql.raw(var)` |
| `xss` | 10 | React `dangerouslySetInnerHTML` with a dynamic value, Vue `v-html`, Svelte `{@html}`, direct `innerHTML =`, `href="javascript:…"`, `target="_blank"` without `rel=noopener`, `eval` / `new Function` on template literal, `window.open(var)`, JSX `href={expr}` without scheme guard, marked / markdown-it with `html: true` |
| `auth` | 23 | Hardcoded JWT secret, JWT `alg: none`, JWT verified via `decode`, missing cookie flags, low-round bcrypt, MD5/SHA1 for passwords, `Math.random` for tokens, OAuth without `state`, session in `localStorage`, multi-year cookie lifetime, mass-assignment via `req.body.role`, CSRF missing on state-change routes, timing-unsafe secret comparison, password min-length under 8, email enumeration, password in URL query, reset token leaked in response, basicAuth literal users, Next.js middleware matcher bypass, WebAuthn `requireUserVerification=false`, `connect.sid` cookie name |
| `llm` | 17 | User input in a system prompt, `eval` / `new Function` on LLM output, client-side Anthropic/OpenAI SDK with a visible key, tool params into shell/file IO, LLM output rendered as raw HTML, system prompt in client-reachable module, vector-DB SDK with `NEXT_PUBLIC_*` key, secret interpolated into prompt, `fetch` with `apiKey` in the body, prompt template path from request, agent tool handler shells out on LLM input, `stream:true` without abort, RAG retrieved doc in system role, `"use client"` module importing LLM SDK, permissive tool schema (freeform string), LLM output via `dangerouslySetInnerHTML` |
| `misconfig` | 60 | CORS `"*"`, Supabase RLS off, Firebase `if true`, open redirect, Express without `helmet`, Next.js Server Action without auth, S3 public ACL, SSRF from request input, cloud-metadata IP fetch, user-driven iframe `src`, missing CSP, path traversal, Django `DEBUG=True`, shell `exec` on request input, `yaml.load`/`pickle.loads`, XXE-prone XML parsers, `rejectUnauthorized=false`, Mongoose `find(req.query)`, webhook without signature, auth routes without rate limit, GraphQL introspection / cost guard, Redis no-auth, verbose error stack traces, `/admin` without auth, CRLF-injectable `setHeader`, WebSocket `verifyClient=true`, `Math.random` temp files, remote ML model load, Host-header trust, CORS credentials + origin reflection, zip-slip archive extract, `RegExp(req.*)`, logs with `req.body`, CSP `unsafe-inline`, subprocess `shell=True`, body-parser without limit, `@ts-ignore` on auth file, Stripe webhook without `constructEvent`, secret file in `public/`, preflight `Allow-Headers` reflection, debugger statement / `--inspect`, fetch without timeout, Next.js `remotePatterns: "*"`, multer without limits, cookie `secure: false`, SQLite `:memory:`, tRPC `publicProcedure.mutation(…)`, axios with TLS disabled, HSTS max-age < 1 year, `robots.txt Disallow: /`, `node-serialize` imported, lodash template on `req.body`, Electron `nodeIntegration:true`, Next.js `rewrites()` open proxy |
| `docker` | 2 | Dockerfile `FROM :latest`, `apt-get install` without `--no-install-recommends` |
| `iac` | 12 | Terraform SG `0.0.0.0/0`, public S3 ACL, unencrypted storage, RDS `publicly_accessible=true`, Kubernetes `hostPath`, `privileged: true`, Secret with plain `stringData`, GitHub Actions `${{ github.event.* }}` in `run:`, broad workflow permissions, `uses:` pinned to a branch, `permissions: write-all`, IAM `Action/Resource: "*"` |

`claude-guard docs` regenerates the full markdown catalog with rationale for every rule.

---

## Auto-fix strategies

| strategy | what it rewrites | how |
|---|---|---|
| `rename_env_var` | `NEXT_PUBLIC_*` secret-shaped vars in `.env*` **and** every referencing source file | plain rename in one pass |
| `set_cookie_flags` | `cookies().set(...)` calls missing `httpOnly` / `secure` / `sameSite` | `ts-morph` AST — merges into existing options object or injects one |
| `split_server_only` | files using Supabase `service_role` | prepends `import "server-only";` so Next.js refuses to ship them client-side |
| `parameterize_query` | Prisma `$queryRawUnsafe` / `$executeRawUnsafe` | `ts-morph` — rewrites to tagged-template `$queryRaw\`...\``, handling both template-literal and `(string, …params)` forms |
| `wrap_with_authz_guard` | exported async functions in a `"use server"` file | injects `auth()` import (if missing) and `await auth()` + `if (!session) throw` guard |
| `suggest_only` | everything else | inserts an inline `// claude-guard: …` annotation on the offending line |

---

## CI integration

Drop-in GitHub Actions workflow that uploads SARIF to the repo's Security tab:

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

For a PR-only gate, use diff mode so the scan only looks at files that changed:

```yaml
- run: npx claude-guard scan . --diff=${{ github.base_ref }} --severity=CRITICAL
  # exits 2 on any CRITICAL finding — failing the job
```

---

## Configuration

`.claude-guard/config.yaml` (created by `claude-guard init`):

```yaml
version: 1
layers: [l1, l2]                    # l3 is opt-in via redteam
engines:
  semgrep: auto                     # auto | enabled | disabled
  trivy: auto
  gitleaks: auto
plugins:
  allowed: []                       # whitelist for community rule packages
severity_threshold: LOW             # suppress anything below
severity_overrides:                 # per-rule promote/demote without forking
  CG-CFG-005: LOW
fix:
  require_clean_tree: true          # refuse to modify a dirty tree unless forced
  dry_run_default: false
redteam:
  enabled: false                    # loopback-only PoC probe, off by default
  allowed_targets: [localhost]
```

`claude-guard init` detects Next.js / Django / Supabase / Prisma / Dockerfile / Terraform / K8s and auto-demotes rules for stacks you don't use.

---

## Comparison with other tools

| | claude-guard | Semgrep | Gitleaks | Snyk Code | SonarQube |
|---|---|---|---|---|---|
| MCP server for Claude Code / Desktop | ✅ | — | — | — | — |
| AI-specific rules (NEXT_PUBLIC, LLM SDK leaks, prompt injection, RAG) | ✅ | partial | — | — | — |
| Checkbox-approved auto-fix with git branch staging | ✅ | — | — | — | — |
| 0 API keys, 0 network calls by default | ✅ | ✅ (local) | ✅ | — | — |
| SARIF 2.1.0 output | ✅ | ✅ | ✅ | ✅ | ✅ |
| Security grade / scorecard | ✅ | — | — | partial | ✅ |
| Opt-in loopback-only PoC probe | ✅ | — | — | — | — |
| Rule catalogue size | 155 | 2000+ | secrets-only | thousands | thousands |

claude-guard is intentionally small and opinionated for one audience: people shipping AI-generated code who want fast, actionable, fix-oriented feedback inside their agent. **Run it alongside Semgrep / Sonar / Snyk, not instead of them.**

---

## FAQ

**Does claude-guard send my code anywhere?**
No. Default mode makes zero network calls, ships zero telemetry, and never prompts an LLM on your behalf. The "LLM-native rules" are interpreted by whatever Claude is already in your MCP client — claude-guard itself is regex + YAML.

**Does it execute code from rule files?**
No. Rules are YAML; there's no path from a rule file to JavaScript execution. Every regex is screened by `safe-regex2` + JSON Schema at load time.

**What is red-team mode actually doing?**
If (and only if) you run `redteam_probe`, claude-guard sends one HTTP GET to a loopback URL you pass it. Loopback is enforced by string check **and** by DNS re-resolution — a rebinding record that resolves to a public IP is rejected. See [red-team guardrails](#red-team-mode-guardrails) for the full list.

**Why checkbox UX instead of auto-fixing everything?**
Auto-fixing a mis-identified SQL injection turns a false positive into a functional regression. Forcing a `[x]` tick per finding trades a few seconds of keystrokes for real confidence — and a blanket `apply_fixes --mode=all_safe` still works when you trust the rule set.

**Does it replace Snyk / Semgrep / Sonar?**
No. Run it alongside. claude-guard's niche is "the 150 things Claude-assisted code gets wrong most often, each with an attacker-mindset rationale and a fix wired up."

**How do I ignore a rule that's noisy in my codebase?**
Four options, pick the one that matches the *lifetime* of the ignore:
- One line, forever: inline `// claude-guard-disable-next-line CG-XXX-NNN`
- One finding, committed with a reason: `claude-guard suppress <finding_id> --reason="…"`
- Whole rule, project-wide: `severity_overrides` in `config.yaml` demoting it below your threshold
- Everything that exists right now: `claude-guard baseline` — future scans only report new findings

**Can I write my own rules?**
Yes. Drop a YAML file in `rules/<category>/CG-XXX-NNN.yml`, add `bad/` and `good/` fixtures, and the fixture regression test automatically enforces that your rule fires on the bad case and stays silent on the good one. For community packages, publish to npm as `claude-guard-plugin-*`, ship a `claude-guard-plugin.yml` manifest, and list the package in `plugins.allowed`. See [`examples/claude-guard-plugin-example/`](examples/claude-guard-plugin-example/) for a reference.

**What's the biggest limitation?**
Regex-based detection can't see types or data flow, so some rules (path traversal, SSRF, authz coverage) are inherently heuristic. claude-guard is better at high-recall signal for known AI-coding mistakes than at low-false-positive enterprise-wide coverage — that's what Semgrep and friends do.

---

## Not goals

- Attacking external services or third-party APIs.
- Runtime WAF or production gating.
- Competing with Burp / ZAP as a general penetration-testing tool.
- Replacing your regular SAST / SCA tooling.

---

## License

MIT. See `LICENSE`.

See `SECURITY.md` for the responsible-use policy and the private disclosure process.
