# Changelog

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
