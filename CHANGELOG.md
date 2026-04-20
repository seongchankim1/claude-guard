# Changelog

## 2.0.0 — 2026-04-20 — Major release

claude-guard 2.0.0 is the project's first stable line. It ships 155 rules, 5 AST-level auto-fixes, 10 MCP tools + 4 resources, SARIF / JUnit / HTML / CSV / shields.io exports, a GitHub Actions pipeline (CI + code-scanning + publish), a community plugin template, and a 23-finding demo app pinned into CI so we notice drift.

### Added
- **MCP SDK integration test** (`tests/mcp.integration.test.ts`) uses `InMemoryTransport` to stand up the real MCP server and drive it from a real SDK client. Confirms every tool is callable and every resource is reachable end-to-end. **137 tests across 38 test files.**

### Security
- **Shell-injection hardening in `rollback`.** `src/rollback.ts` now uses `execFileSync("git", [...])` with an argv array instead of `execSync(string)` + interpolation. Added a strict `/^[A-Za-z0-9._-]+$/` gate on `rollback_id` so path traversal and shell metachars get rejected up-front. Regression tests for both vectors.
- **Real dirty-tree refusal in `rollback`.** Previously `git apply --check` was the only gate, which can pass on a tree with unrelated dirty edits. Now we also check `git status --porcelain` and refuse unless it's clean (or `--force`).
- **Atomic plugin loading.** `src/rules/plugin-loader.ts` now drops the *entire plugin* if any rule fails validation (schema / ReDoS / collision). This matches the long-standing promise in `docs/SECURITY_MODEL.md` — partial plugin loads can't ship a half-trusted ruleset anymore.
- **`SECURITY.md` points at a real contact.** Private disclosure email + a direct link to the GitHub Security Advisory form, plus a triage-SLA statement.
- **`package.json` has `author`, `bugs`, `homepage`.** No more "maintainers listed in package.json" dead-end.

### UX
- **`engine_warnings` surface on the CLI.** `claude-guard scan` prints both plugin *and* engine warnings on TTY, and includes both arrays in `--json` output.
- **`--diff` now fails loud on a bad base ref.** Previously a typo like `--diff=main` on a `master` repo silently returned zero changed files, producing a "clean" scan that skipped every branch change. Now throws `DIFF_BAD_BASE` / `DIFF_FAILED` with a useful message.
- **MCP resources scope to the last scanned project.** `claude-guard://latest/*` now resolves against the `project_path` of the most recent tool call instead of `process.cwd()`, so clients that launch the server from an arbitrary directory (the common `npx` case) see the right findings.
- **`init_config` refuses to overwrite.** The MCP tool previously stomped on an existing `.claude-guard/config.yaml`, erasing `severity_overrides` and the plugin allowlist. Now it refuses unless `force=true`, and when it does write it delegates to the stack-aware `runInit()` so you get Next.js / Supabase / Prisma-aware severity tuning.
- **Rule-pattern `negate` field**: rules can now encode "flag this family, but not these known-public members" without relying on lookbehind (e.g. `NEXT_PUBLIC_*_KEY` skipping `ANON_KEY` / `PUBLISHABLE_KEY`).
- **Cross-rule precision test**: every rule's "good" fixture is scanned against every *other* rule to catch inter-rule false positives. Legitimate overlaps require an allowlist entry with justification.
- **Plugin warning surfacing**: `scan` now propagates `PLUGIN_UNTRUSTED` / `PLUGIN_SCHEMA_FAIL` warnings into the saved `findings.json` and prints them in CLI output.
- **`claude-guard rollback <scan_id>` CLI command** — the MCP tool's behavior is now reachable from the shell, matching `docs/SECURITY_MODEL.md`.
- **CodeQL + dependency-review** workflows alongside our own scanner in `code-scanning.yml`.

### Changed
- **L3 removed from the public engine surface.** The type `Layer` and the MCP `scan` schema now only accept `"l1"` and `"l2"`. The redteam probe stays available as an opt-in *tool*, not as a scan layer, matching what the engine actually does.
- **`fix.require_clean_tree` now honored**: `apply_fixes` reads the config flag instead of unconditionally enforcing a clean tree.
- **`fix.dry_run_default` now honored**: `applyFixes` falls back to `mode: "dry_run"` when the project opts in, so teams can adopt on a cautious default.
- **`engines.semgrep` defaults to `disabled`.** Semgrep's `p/default` ruleset is fetched from `semgrep.dev` on first run, so leaving it on would contradict "zero network calls by default". Opt in with `engines.semgrep: auto` or `enabled`. Gitleaks stays on `auto` because it ships with an embedded, fully-local ruleset.
- **`engines.{semgrep,gitleaks} = enabled`** now surfaces a warning when the binary isn't on PATH (the type comment has been promising this for a while).
- **`scan` MCP tool** returns `plugin_warnings` + `engine_warnings` so clients notice config/plugin problems without reading raw JSON.
- **`list_checks` and `export_sarif`** are now plugin-aware when a project path is provided — plugin rule metadata no longer disappears after scan time.
- **Global rule-id collision guard**: builtin + plugin and plugin + plugin duplicate ids are rejected with a warning rather than silently overriding.
- **findings.json ↔ MCP resource ↔ CLI** read from one shared artifact loader (`src/findings-io.ts`) so every surface sees the same payload, including warnings.
- **Dead config removed**: `engines.trivy` and `redteam.allowed_targets` are gone from `Config` — the former was never implemented, the latter was never consulted (loopback enforcement is hard-wired in target-guard).
- **`apply_fixes` refuses to reuse a pre-existing `claude-guard/fix-<id>` branch** unless `force=true` — prevents stale diffs bleeding into the new rollback patch.
- **`rollback` pre-flights with `git apply --check --reverse`** and rejects placeholder patches left by dry-run / no-git artifacts. `--force` skips the pre-flight.
- **publish workflow** extracts the per-tag CHANGELOG section instead of dumping the whole file into the GitHub Release body.

### Stability
- No breaking changes from 1.x at the CLI surface. The MCP schema drops `"l3"` as an accepted layer — clients that passed it will see a validation error instead of a silent no-op.

## 1.8.0 — 2026-04-20

### Added
- **`claude-guard validate-rule <file.yml>`** — validate a single rule against the JSON Schema + ReDoS guard without loading the full catalog. Useful for plugin authors iterating on YAML.
- **+5 rules**, for a total of 155:
  - `CG-CFG-060` — lodash `_.template(req.body.*)` (CVE-prone)
  - `CG-CFG-061` — Electron `BrowserWindow` with `nodeIntegration: true`
  - `CG-CFG-062` — Next.js `rewrites()` with an interpolated external destination (open proxy)
  - `CG-AUTH-023` — `'connect.sid'` cookie name hardcoded (framework fingerprint)
  - `CG-LLM-017` — LLM assistant output rendered via `dangerouslySetInnerHTML`

## 1.7.0 — 2026-04-20 — 150-rule milestone

### Added
- **CSV export**: `claude-guard csv` prints findings as CSV (rule_id, severity, category, file, line, column, message, evidence, fix_strategy, source_engine). Opens cleanly in Excel, Google Sheets, `csvkit`, `duckdb`, etc.
- **+10 rules**, for a total of **150**:
  - `CG-CFG-055` — tRPC `publicProcedure.mutation(…)` (no auth on a state-changing endpoint)
  - `CG-CFG-056` — `axios.create` with TLS verification disabled
  - `CG-AUTH-022` — password-reset handler returns the token in the response body
  - `CG-CFG-057` — HSTS `max-age` under one year
  - `CG-CFG-058` — `public/robots.txt` with `Disallow: /`
  - `CG-LLM-016` — LLM tool input schema with a freeform `type: string` (no enum/pattern)
  - `CG-SEC-019` — committed `.vercel/.env.*.local`
  - `CG-CFG-059` — `node-serialize` imported at all (RCE-prone, CVE-2017-5941)
  - `CG-SQL-010` — Drizzle `sql.raw(var)` with a non-literal argument
  - `CG-IAC-012` — IAM policy with `Action: "*"` or `Resource: "*"`

## 1.6.0 — 2026-04-20

### Added
- **`scan` filter flags**: `--severity=HIGH` sets a floor, `--only=secrets,sql` narrows to the given categories, `--except=llm` drops them. Useful for focused CI gates (e.g. block only on CRITICAL secrets in a PR pipeline).
- **+5 rules**, for a total of 140:
  - `CG-CFG-051` — Next.js `images.remotePatterns` with `hostname: '*'`
  - `CG-CFG-052` — multer / busboy without `limits`
  - `CG-CFG-053` — cookie set with explicit `secure: false`
  - `CG-AUTH-021` — WebAuthn verify with `requireUserVerification: false`
  - `CG-CFG-054` — SQLite opened with `':memory:'` (probably not intentional in prod paths)

## 1.5.0 — 2026-04-20

### Added
- **Enriched `examples/vulnerable-next-app`**. It now has 15+ files covering a realistic Next.js stack: `middleware.ts`, API routes for `/session`, `/upload`, `/chat`, `/search`, `/webhook`, a `next.config.js` that leaks a secret, a broken `firestore.rules`, a Terraform file with an open S3 + SG, and a bad Dockerfile. A clean scan of the demo now reports **23 findings, Grade F, 0/100** (pinned in CI so drift is caught).
- **`examples/claude-guard-plugin-example/`** — a reference community plugin package. Demonstrates the manifest (`claude-guard-plugin.yml`), the rule-file layout under `rules/`, and a plugin-scoped rule id (`ACME-INT-001`). Ready to fork into a `claude-guard-plugin-*` npm package.
- **+5 rules**, for a total of 135:
  - `CG-CFG-049` — leftover `debugger` statement / Node `--inspect` port
  - `CG-CFG-050` — `fetch()` to external URL without an AbortSignal timeout
  - `CG-AUTH-020` — password-reset token generated with `Math.random().toString(36)`
  - `CG-LLM-015` — `"use client"` module that imports an LLM SDK (bundles to the browser)
  - `CG-IAC-011` — GitHub Actions workflow with `permissions: write-all`

## 1.4.0 — 2026-04-20

### Added
- **Color terminal output** for `claude-guard scan`. On a TTY it prints a color-coded grade badge, the scorecard headline, and a one-line severity breakdown. Respects `NO_COLOR=1` and `TERM=dumb`. `--json` forces machine output even on a TTY.
- **`claude-guard fix`** — one-shot shortcut that runs `scan` then `apply_fixes --mode=all_safe` in the same invocation. Great for `claude-guard fix && git diff` workflows.
- **+10 rules**, for a total of 130:
  - `CG-CFG-043` — CSP with `unsafe-inline` / `unsafe-eval`
  - `CG-CFG-044` — Python `subprocess.run(..., shell=True)`
  - `CG-CFG-045` — Express `body-parser` / `express.json()` without a size limit
  - `CG-SEC-018` — committed `.npmrc` with a real `_authToken`
  - `CG-AUTH-019` — Next.js middleware matcher with a negative group that excludes a protected route
  - `CG-XSS-010` — marked / markdown-it with `html: true` or `sanitize: false`
  - `CG-CFG-046` — `@ts-ignore` / `@ts-nocheck` on auth/session/middleware files
  - `CG-CFG-047` — `.env` or private-key file under `public/` or `static/`
  - `CG-CFG-048` — preflight `Allow-Headers` reflecting the request-headers header
  - `CG-LLM-014` — streaming LLM response without a per-request char cap

## 1.3.0 — 2026-04-20

### Added
- **README demo section** with the actual `scan` + `list` output from running claude-guard against `examples/vulnerable-next-app` — Grade F, 4 CRITICAL, 2 HIGH, real strategies (`parameterize_query`, `rename_env_var`, `split_server_only`).
- **Comparison table** against Semgrep / Gitleaks / Snyk Code / SonarQube, positioning claude-guard as the specialist for "AI-generated-code mistakes with fix-oriented feedback inside your agent".
- **FAQ section** answering the six most-asked questions: data handling, rule execution model, red-team guardrails, checkbox UX rationale, tool-replacement question, and rule-authoring workflow.
- **+10 rules**, bringing the total to 120:
  - `CG-CFG-039` — cookie `Domain` set to a bare apex
  - `CG-CFG-040` — Express `trust proxy: true`
  - `CG-AUTH-018` — `basicAuth({ users: { user: password } })` literal pair
  - `CG-CFG-041` — cron handler under `app/api/cron` (flagged for manual Bearer check)
  - `CG-LLM-013` — RAG retrieved doc interpolated into a system-role prompt
  - `CG-SQL-009` — TypeORM `manager.query()` with template-literal interpolation
  - `CG-CFG-042` — `sendFile(req.params.*)` without `nosniff`
  - `CG-SEC-017` — Twilio Account SID + Auth Token literal pair
  - `CG-XSS-009` — JSX `<a href={expr}>` without a scheme guard
  - `CG-IAC-010` — Terraform RDS `publicly_accessible = true`

## 1.2.0 — 2026-04-20

### Added
- **Scan trend history**. Every `scan` appends to `.claude-guard/history.json` (capped at 100 entries). `claude-guard trend` renders a markdown table with grade, score, finding count, and duration per scan, plus the delta from first to latest.
- **+10 rules**, for a total of 110:
  - `CG-CFG-034` — CRLF injection via `setHeader(value from req.*)`
  - `CG-CFG-035` — WebSocket `verifyClient` that always returns true
  - `CG-CFG-036` — temp file path built from `Math.random`
  - `CG-AUTH-016` — cookie `maxAge` longer than one year
  - `CG-CFG-037` — Python model `load()` piped through `urlopen` / `requests`
  - `CG-LLM-012` — prompt template path chosen by request input
  - `CG-CFG-038` — Apollo Server without persisted queries / cost guard
  - `CG-SEC-016` — MongoDB URI with inline `user:password`
  - `CG-AUTH-017` — login response that distinguishes "no such email"
  - `CG-IAC-009` — Kubernetes Secret with inline `stringData` credentials

## 1.1.0 — 2026-04-20

### Added
- **MCP resources**. The server now exposes:
  - `claude-guard://latest/findings.md` — the checkbox markdown for the latest scan
  - `claude-guard://latest/findings.json` — the raw findings
  - `claude-guard://latest/scorecard.json` — grade, score, deductions
  - `claude-guard://rules/catalog.md` — full catalogue of active rules
  MCP clients that render resources (e.g. Claude Desktop) now show findings inline without re-invoking `scan`. Set `CLAUDE_GUARD_PROJECT` to pin the active project when the MCP stdio session's cwd is not the right one.
- **+10 rules**, bringing the total to 100:
  - `CG-SEC-015` — Google / Firebase `AIza…` key in source
  - `CG-AUTH-015` — signup taking `role` / `isAdmin` from `req.body`
  - `CG-CFG-030` — `RegExp` constructed from request input (ReDoS)
  - `CG-CFG-031` — `Host` / `X-Forwarded-Host` used to build URLs or email links
  - `CG-CFG-032` — CORS reflecting `req.headers.origin` while credentials are enabled
  - `CG-CFG-033` — archive extract without zip-slip base-path check
  - `CG-LLM-011` — vector DB SDK (Pinecone/Weaviate/Chroma/Qdrant) with a `NEXT_PUBLIC_*` key
  - `CG-XSS-008` — `window.open(var)` with an identifier target
  - `CG-IAC-008` — Terraform storage/encryption disabled
  - `CG-SQL-008` — Sequelize `query()` with template-literal interpolation

## 1.0.0 — 2026-04-20

First stable release. Over nine iterations claude-guard has grown from a 10-rule MVP into a full audit tool with 90 rules across eight categories, four AST-based auto-fixes, SARIF/JUnit/HTML export, community plugin loading, a baseline system, and first-class CI integration.

### Added (since 0.9.0)
- **+10 final rules**, for a total of 90:
  - `CG-AUTH-013` — password min length under 8
  - `CG-CFG-026` — public admin/debug/metrics routes with no auth middleware
  - `CG-CFG-027` — error responses that leak stack traces
  - `CG-CFG-028` — express-session with a placeholder secret ("keyboard cat")
  - `CG-SEC-013` — `next.config.js` `env:` bloc exposing a secret-shaped variable
  - `CG-AUTH-014` — secret comparison via `===` (timing-unsafe)
  - `CG-CFG-029` — `console.log(req.body)` style logs of arbitrary request bodies
  - `CG-SEC-014` — fully-formed JWT committed to source
  - `CG-LLM-010` — secret interpolated directly into a prompt
  - `CG-IAC-007` — GitHub Actions `uses:` pinned to a mutable branch

### Summary of the 1.0 surface

- **90 builtin rules** across `secrets`, `sql`, `xss`, `auth`, `llm`, `misconfig`, `docker`, `iac` — every rule has positive and negative fixture tests.
- **Four AST-based auto-fixes**: `rename_env_var`, `set_cookie_flags`, `split_server_only`, `parameterize_query`, `wrap_with_authz_guard`. Everything else is `suggest_only` (inline annotation).
- **MCP tools**: `scan`, `list_findings`, `explain`, `apply_fixes`, `rollback`, `redteam_probe`, `list_checks`, `init_config`, `score`, `export_sarif`.
- **CLI**: `scan` (with `--diff=BASE`), `list`, `score`, `badge`, `sarif`, `junit`, `report --open`, `watch`, `rules`, `docs`, `explain`, `install-hooks`, `baseline`, `diff-scans`, `stats`, `init`, `suppress`.
- **Export formats**: JSON (native), markdown checklist (`findings.md`), HTML (self-contained), SARIF 2.1.0, JUnit XML, shields.io endpoint JSON.
- **Suppression**: `.claude-guard/ignore.yml`, inline `// claude-guard-disable-*` comments, config-level `severity_overrides`, project baseline.
- **Safety**: loopback-only red-team probe with DNS rebinding defense + per-finding rate limiting; YAML-only plugin surface (no JS execution); JSON Schema + ReDoS check on every rule at load time.
- **CI**: GitHub Actions for tests, code scanning (SARIF upload), and tag-triggered npm publish with provenance.

## 0.9.0 — 2026-04-20

### Added
- **`claude-guard init`** — detects your stack from `package.json` / `requirements.txt` / `Dockerfile` / Terraform / Kubernetes manifests, then writes `.claude-guard/config.yaml` with severity overrides that demote rules for stacks you do not use (e.g. Terraform rules go `LOW` if there are no `.tf` files). Does not overwrite an existing config. `--dry` to preview without writing.
- **`claude-guard suppress <finding_id>`** — writes the finding into `.claude-guard/ignore.yml` with an optional `--reason="…"`. No-op on duplicates.
- **+10 rules**, for a total of 80: JWT verify accepts `alg: "none"`, GraphQL introspection on in prod, Redis URL without password, mass-assignment (ORM `create({ data: req.body })`), session/token in `localStorage` / `sessionStorage`, `eval` / `new Function` on a template literal, secret-shaped tokens in test fixtures, agent tool handlers that shell out on model-supplied input, GitHub Actions `run:` with `${{ github.event.* }}` interpolation, GitHub Actions workflow with broad write permissions.

## 0.8.0 — 2026-04-20

### Added
- **Baseline system**. `claude-guard baseline` captures the current scan as a known-good set; subsequent scans filter matching findings and only report *new* ones. Perfect for adopting claude-guard on a mature codebase without being blocked by pre-existing noise. Set `ignore_baseline: true` on scan options to bypass.
- **Scan diffing**. `claude-guard diff-scans <old> <new>` reports what was introduced, resolved, and unchanged between two scans by content fingerprint. CI-friendly — exits 2 when new findings were introduced.
- **`claude-guard stats`**. Rule hit frequency (top 10), severity breakdown, category breakdown, top files per rule. Great for understanding where to invest cleanup time.
- **+10 rules**, for a total of 70: shell exec/spawn with request input, Python `yaml.load` without SafeLoader, Python `pickle.loads`, XXE-prone XML parsers (Java, DOMParser), password/token passed as URL query, kubeconfig with embedded certificate or token, client-side fetch that ships an API key in the body, Svelte `{@html}` with a dynamic expression, Django `.raw()` composed with f-string or `.format()`, TLS certificate verification disabled (`rejectUnauthorized: false` / `NODE_TLS_REJECT_UNAUTHORIZED=0`).

### Changed
- Scan results now include `baseline_suppressed` — the count of findings filtered by the active baseline.

## 0.7.0 — 2026-04-20

### Added
- **Parallel L2 scanner**: globs are cached per unique glob set, file reads are cached (so a file is read at most once across all rules), and per-rule I/O runs in batches of 16. Full-suite scan is ~25% faster on the bench repo.
- **`claude-guard install-hooks`**: installs a `pre-commit` hook that runs `scan --diff=HEAD` and blocks the commit if any CRITICAL finding appears on staged files. Idempotent, and preserves any existing pre-commit hook by chaining.
- **+10 rules**, for a total of 60: Express state-change routes without CSRF middleware, Mongoose `.find(req.query)` / NoSQL injection, webhook handlers processing `req.body` with no signature check, auth-facing routes (login/signup/forgot/reset) without rate-limit middleware in scope, `target="_blank"` links without `rel="noopener"`, LLM `stream:true` without abort plumbing, secret-like env vars printed via `console.log` / `print`, JWT `expiresIn` over one day, SQLAlchemy `text()` composed via f-string or `.format()`, `github_pat_*` fine-grained PATs in source.

### Changed
- Rule fixtures now accepted in nested directories under `bad/` and `good/`. The fixture test walks recursively.

## 0.6.0 — 2026-04-20

### Added
- **Inline disable comments** (like ESLint). Supported forms:
  - `// claude-guard-disable-next-line CG-SEC-001` — suppress one rule on the next line
  - `// claude-guard-disable-next-line` — suppress every rule on the next line
  - `// claude-guard-disable-line CG-SEC-001 CG-AUTH-002` — suppress on the same line
  - `// claude-guard-disable-file CG-SEC-001` — suppress a rule across the whole file
  - `// claude-guard-disable-file` — suppress everything in that file

  Accepts either `//` or `#` comment syntax, so the same markers work in JS/TS, Python, Ruby, YAML, Dockerfile.
- **Rule severity overrides** in `.claude-guard/config.yaml` (`severity_overrides: { CG-CFG-005: LOW }`). Lets teams demote or promote individual rules without forking the YAML rule files.
- **JUnit XML export** (`claude-guard junit` CLI) — consumable by Jenkins, GitLab, and most CI dashboards that already ingest test results.
- **`claude-guard report --open`** — writes the HTML and launches the default browser (macOS `open`, Linux `xdg-open`, Windows `start`).
- **+8 rules**, bringing the total to 50: Kubernetes `hostPath`, Kubernetes `privileged: true`, missing CSP header on Next.js responses, OAuth authorize URL without `state`, path traversal via `path.join` + request input, Django `DEBUG = True`, committed Stripe live key, `SYSTEM_PROMPT` defined in a client-reachable module.

## 0.5.0 — 2026-04-20

### Added
- **Diff mode**: `claude-guard scan --diff=main` scans only files changed vs the given base ref (triple-dot range + working tree + untracked). Perfect for PR gates where a full-repo scan would be noise. Works via the same `scan()` API — passing `diff_base` to the MCP tool works too.
- **HTML report** (`claude-guard report`) — self-contained, grade-colored, collapsible per-finding. Drop it into a PR comment or Slack with one attachment.
- **Ignore system** — `.claude-guard/ignore.yml` supports `rule_id`, `file`, `line` filters with wildcards on rule IDs and directory prefixes on file paths. Applies before the severity threshold.
- **Fourth AST-based fix**: `wrap_with_authz_guard` — for Next.js Server Action files flagged by `CG-CFG-006`, injects an `auth()` import (if missing) and prepends an `await auth()` + `if (!session) throw` guard to every exported async action. Skips files that already have a visible auth reference.
- **10 more rules**, bringing the total to 42: cloud-metadata SSRF (AWS/GCP/Azure), user-driven iframe src, Dockerfile apt-get without `--no-install-recommends`, Dockerfile `:latest`, Terraform `0.0.0.0/0` security groups, Terraform public S3 ACL, LLM output rendered as raw HTML, insecure RNG for tokens/secrets/passwords, GCP service-account JSON committed, `href="javascript:…"` sinks.

### Changed
- `CG-CFG-006` (Next.js Server Action without auth) default fix strategy is now `wrap_with_authz_guard` (was `suggest_only`).

## 0.4.0 — 2026-04-20

### Added
- **SARIF 2.1.0 export** (`claude-guard sarif` CLI + `export_sarif` MCP tool). Upload to GitHub Code Scanning, Sonar, or any SARIF consumer. Includes per-rule metadata and line fingerprints.
- **GitHub Code Scanning workflow** (`.github/workflows/code-scanning.yml`). Runs on push, PR, and a weekly schedule; uploads SARIF via `github/codeql-action/upload-sarif@v3` so findings appear in the repo Security tab.
- **Community plugin loader**. `config.yaml` `plugins.allowed` now actually loads rule packages from `node_modules`. Plugins are YAML-only: we read a `claude-guard-plugin.yml` manifest, walk the listed rule directories, and run every rule through JSON Schema + ReDoS validation before accepting it.
- **Third AST-based fix**: `parameterize_query` rewrites Prisma `$queryRawUnsafe` / `$executeRawUnsafe` calls into the tagged-template safe form. Handles both template-string arguments and `(string, ...params)` calls (converting `$1`/`?` placeholders to `${...}` interpolations).
- **Watch mode**: `claude-guard watch [path]` rescans on any file change (debounced 250 ms, ignores `node_modules` / `.git` / build output / `.claude-guard`). Outputs a one-line scorecard per iteration — perfect for a second terminal while vibe-coding.
- **Auto-publish workflow** (`.github/workflows/publish.yml`). On `v*.*.*` tags: runs tests, verifies the tag matches `package.json`, publishes to npm with provenance, and opens a GitHub release with `CHANGELOG.md` body.

### Changed
- Rule ID schema broadened from `^CG-[A-Z]{2,5}-[0-9]{3}$` to `^[A-Z][A-Z0-9]{1,15}-[A-Z][A-Z0-9]{1,15}-[0-9]{3,4}$` so community plugins can namespace their own rules (e.g. `ACME-NEXT-001`) without forking the schema.
- `CG-SQL-002` default fix strategy is now `parameterize_query` (was `suggest_only`).

## 0.3.0 — 2026-04-20

### Added
- **Per-rule fixtures** under `fixtures/rules/<rule-id>/{bad,good}/`. Three new tests enforce that every active rule has at least one `bad` fixture, that the rule fires on its own bad fixture, and that the `good` fixture does not produce a finding for that rule. Regressions in detection now fail CI immediately.
- **Second AST-based fix**: `split_server_only` prepends `import "server-only";` to files detected by `CG-SEC-003` (Supabase service_role in client-reachable code). Uses `ts-morph`, is idempotent, and preserves existing imports.
- **Shields.io endpoint badge**: `claude-guard badge` emits a JSON object compatible with https://img.shields.io/endpoint so a live grade badge can be embedded in a README.
- **Rule catalogue doc generator**: `claude-guard docs` prints every active rule (id, severity, languages, fix strategy, and rationale) as markdown. `docs/rules.md` is regenerable from the CLI.

### Changed
- `CG-SQL-001` (SQL string concatenation), `CG-AUTH-004` (MD5/SHA1 for passwords), and `CG-CFG-008` (SSRF from request input) have wider regex patterns that now catch realistic examples in production code, verified against the new fixtures.
- `CG-SEC-003` default fix strategy is now `split_server_only` (was `suggest_only`).

## 0.2.0 — 2026-04-20

### Added
- **22 new rules** (total grew from 10 to 32) across every category:
  - `secrets`: AWS access keys, private-key PEM blocks, committed `.env`, Slack webhooks.
  - `sql`: MongoDB `$where`, Knex `.raw()` interpolation, Python f-string queries.
  - `xss`: Vue `v-html`, direct `innerHTML =` assignment.
  - `auth`: low-round bcrypt, MD5/SHA1 for passwords, `jwt.decode` without verify.
  - `llm`: `eval` on LLM output, Anthropic/OpenAI client-side SDK misuse, tool params into `exec`/`readFile`.
  - `misconfig`: Supabase RLS off / `using(true)`, Firebase `if true`, open redirect, Express without `helmet()`, Next.js Server Action without auth, S3 public ACL, SSRF from request input.
- **Security scorecard** (`score` MCP tool, `claude-guard score` CLI). Produces a 0-100 score and an A+ … F grade with per-severity deductions. Rendered into the top of `findings.md`.
- **First AST-based auto-fix**: `set_cookie_flags` uses `ts-morph` to inject or merge missing `httpOnly` / `secure` / `sameSite` options on `cookies().set(...)` calls, preserving surrounding code.
- **Standalone CLI**: `claude-guard scan | list | score | explain | rules`. Useful for CI, debugging, and scripting.
- **CI workflow**: GitHub Actions running typecheck, build, tests, and an end-to-end scan of `examples/vulnerable-next-app` on every PR, matrix over Node 20 and 22. Publishes a rule-inventory summary to the job page.
- **Issue templates** (bug report, rule request), **PR template**, **Dependabot** for npm + GitHub Actions, **FUNDING.yml** stub.

### Changed
- L2 scanner now matches against full file content (`gms` flags) and derives line/column from the match offset. Previously it went line-by-line, which missed rules whose regex spanned multiple lines (e.g. the Supabase `service_role` check).
- `findings.md` now starts with a scorecard banner.

### Fixed
- `apply.test.ts` now seeds `.gitignore` before the initial commit so the test suite is not dirtied by `scan()`'s `ensureGitignore` behavior.

## 0.1.0 — 2026-04-19

Initial release.
