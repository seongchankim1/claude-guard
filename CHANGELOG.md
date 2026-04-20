# Changelog

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
