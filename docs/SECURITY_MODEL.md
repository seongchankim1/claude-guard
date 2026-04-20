# Security model

This doc explains, in detail, how claude-guard protects your code and how it protects itself. The main [README](../README.md) is a short overview; this is the full story.

## Detection

`scan` runs two layers:

```
┌──────────────────────────────────────────────────────────────┐
│  L1  OSS engines (optional, auto-detected at scan time)      │
│      semgrep · gitleaks   (others planned; see below)        │
├──────────────────────────────────────────────────────────────┤
│  L2  builtin YAML rules (default, always on)                 │
│      secrets · sql · xss · auth · llm · misconfig · docker · iac │
└──────────────────────────────────────────────────────────────┘
```

- **L1** shells out to OSS tools you already have installed. Currently wired: Semgrep (if `semgrep` is on `PATH`, uses its `p/default` ruleset) and Gitleaks (if `gitleaks` is on `PATH` and the project has a `.git` directory). Absent binaries are skipped silently. `osv-scanner`, `trivy`, and `npm/pip audit` adapters are on the roadmap but not yet implemented.
- **L2** is claude-guard's own catalog: YAML regex patterns focused on the failure modes AI-generated code gets wrong. Every rule ships with positive + negative fixtures, and the test suite enforces that the rule fires on the bad case and stays silent on the good one.

`redteam_probe` is a **separate, opt-in MCP tool** — not part of the `scan` pipeline. It sends one HTTP GET against a loopback URL to demonstrate the attack path for a specific finding. External targets are hard-blocked (see [Red-team guardrails](#red-team-guardrails) below), and the tool refuses to run unless `redteam.enabled: true` in `.claude-guard/config.yaml`.

Every engine produces the same normalized `Finding` (rule_id, severity, file, line, evidence, fix_strategy), deduped by `(file, line, rule_id)`.

## Scorecard

Each scan produces a 0–100 score and an A+…F grade:

| severity | per finding | per-severity cap |
|---|---|---|
| CRITICAL | -20 | -80 |
| HIGH | -8 | -40 |
| MEDIUM | -3 | -20 |
| LOW | -1 | -10 |

Rendered at the top of `.claude-guard/findings.md`, surfaced by the `score` MCP tool and `claude-guard score`/`badge` CLI. Every scan appends to `.claude-guard/history.json`; `claude-guard trend` shows the curve.

## Fix pipeline

1. `apply_fixes` refuses to touch a dirty working tree unless `force=true`.
2. Creates a `claude-guard/fix-<scan_id>` branch.
3. Each checked finding is dispatched to a fix strategy. Five strategies are AST-based via `ts-morph`; anything without an AST strategy lands as `suggest_only` — an inline `// claude-guard: ...` annotation rather than a guessed rewrite.
4. Changes are staged (`git add -A`) but **not committed**. You own the commit.
5. A unified-diff rollback patch is written to `.claude-guard/rollback/<scan_id>.patch`. `claude-guard rollback <scan_id>` reverse-applies it.

**The rule**: a wrong automatic fix is worse than a clearly annotated manual one.

### Available AST strategies

| strategy | rewrites |
|---|---|
| `rename_env_var` | `NEXT_PUBLIC_*` secret-shaped vars in `.env*` **and** every referencing source file |
| `set_cookie_flags` | `cookies().set(...)` calls missing `httpOnly` / `secure` / `sameSite` |
| `split_server_only` | files using Supabase `service_role` — prepends `import "server-only";` |
| `parameterize_query` | Prisma `$queryRawUnsafe` / `$executeRawUnsafe` → tagged-template form |
| `wrap_with_authz_guard` | exported async functions in a `"use server"` file — injects auth guard |

## Suppression — four reviewable layers

| where | scope | use when |
|---|---|---|
| `// claude-guard-disable-next-line CG-XXX-NNN` | one line | a specific false positive |
| `.claude-guard/ignore.yml` via `claude-guard suppress <id>` | rule_id + file + line | want a committed `reason:` |
| `config.yaml` `severity_overrides` | project-wide | demote/promote a rule across the codebase |
| `claude-guard baseline` | everything currently present | adopt on a noisy repo; future scans report only new findings |

Every layer is plain text in the repo.

---

## How claude-guard keeps itself safe

### Privacy and data flow

- Zero network calls in the default `layers: [l1, l2]`.
- No LLM API key required. "LLM-native rules" are regex + YAML; contextual explanation is done by the Claude already in your MCP client.
- No telemetry. `grep -R 'https://' src/` — every URL is a doc link or a loopback target.
- `.claude-guard/` is auto-added to `.gitignore` on the first scan; findings / rollback patches / red-team logs stay local.

### Plugin safety

- Plugins are **YAML only**. claude-guard never loads JavaScript from a plugin.
- Plugins are **whitelisted**: a package listed in `plugins.allowed` in `config.yaml` is loaded; anything else is ignored with a `PLUGIN_UNTRUSTED` warning.
- Plugin rules go through the **same JSON Schema + ReDoS validation** as builtin rules. A single bad pattern rejects the whole rule package.
- Custom AST fix strategies cannot live in a plugin — they must land in `src/fix/` via a core PR. This is deliberate: the simplest way to prove that installing a plugin cannot execute arbitrary code.

### Red-team guardrails

`redteam_probe` is opt-in and off by default. Before any socket opens:

1. **Protocol allowlist** — only `http:` and `https:`.
2. **Hostname allowlist (string)** — only `localhost`, `127.0.0.1`, `::1`, `0.0.0.0`.
3. **DNS re-resolution** — hostname resolved with `dns.lookup({ all: true })` and **every** returned address must be loopback. A DNS rebinding record that resolves to a public IP is rejected with `DNS_REBIND`.
4. **Rate limit** — 1 probe per `finding_id`, 10 probes per minute per process.

Plus: no redirects, 5s timeout, 1 MB response cap, every request+response logged to `.claude-guard/redteam/<finding_id>.log`.

### Regex safety (ReDoS)

Every rule regex is validated at load time:

- Must compile as `RegExp`.
- Must pass [`safe-regex2`](https://github.com/davisjam/safe-regex), which rejects patterns whose worst-case backtracking is super-linear.

An unsafe pattern rejects the **entire rule file**, not silently partial-loads.

### Git safety

- Dirty working tree → refused by default. Override per-run with `force=true`, or project-wide via `fix.require_clean_tree: false` in `.claude-guard/config.yaml`.
- Fixes land on a `claude-guard/fix-<scan_id>` branch, not your current branch.
- Changes are staged but **not committed**. You own the commit.
- Unified-diff rollback patch saved for every fix batch, reverse-applied by `claude-guard rollback <scan_id>` (CLI) or the `rollback` MCP tool.
- `claude-guard install-hooks` installs an idempotent pre-commit hook that blocks commits introducing CRITICAL findings, chaining any existing hook.

---

## Reporting vulnerabilities

See [`SECURITY.md`](../SECURITY.md) for the private disclosure process.
