# claude-guard

**English** · [한국어](README.ko.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [Español](README.es.md)

> Audit AI-generated code the way real attackers would — then fix only what you check.

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![mcp](https://img.shields.io/badge/MCP-stdio-purple)](https://modelcontextprotocol.io)
[![rules](https://img.shields.io/badge/rules-155-8a2be2)](docs/rules.md)
[![tests](https://img.shields.io/badge/tests-111%20passing-brightgreen)](tests)

```bash
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

Zero API keys. Zero network calls by default. Zero outbound telemetry.

## What it is

claude-guard is an MCP server. It scans your repo for the security mistakes AI-assisted code most often ships with — hardcoded `NEXT_PUBLIC_*` secrets, Prisma `$queryRawUnsafe`, Supabase `service_role` in client code, CORS `"*"`, and so on — grades the result, and walks you through **only the fixes you tick**.

## Demo

```console
$ npx claude-guard scan ./examples/vulnerable-next-app

  F   0/100   Grade F — score 0/100 (11 CRITICAL, 7 HIGH, 2 MEDIUM, 2 LOW)
  scan_id=747d5448  findings=22  duration=76ms  layers=l1,l2
  11 CRITICAL   7 HIGH   2 MEDIUM   2 LOW
  next: claude-guard list   # toggle [x] on fixes
```

Open `.claude-guard/findings.md`, tick `[x]` on what you want fixed, then `claude-guard fix` or `apply_fixes` through MCP. Changes land on a `claude-guard/fix-<id>` branch, staged but not committed.

## Features

- **155 rules** across secrets · SQL / NoSQL · XSS · auth · LLM-specific · misconfig · Docker · IaC
- **5 AST auto-fixes** (`ts-morph`) — everything else is an annotated TODO, never a silent rewrite
- **Checkbox-approved fixes** with a git branch + rollback patch
- **Exports** — JSON · markdown · HTML · SARIF 2.1.0 · JUnit XML · CSV · shields.io badge
- **Four suppression layers** — inline comment, `ignore.yml`, `severity_overrides`, `baseline`
- **Opt-in red-team probe** — loopback only, with DNS-rebinding defense + rate limit
- **MCP native** — 10 tools + 4 resources; works in Claude Code / Desktop / any MCP client

## Install

**As an MCP server (recommended):**

```bash
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

Or for Claude Desktop, in `claude_desktop_config.json`:

```json
{ "mcpServers": { "claude-guard": { "command": "npx", "args": ["-y", "claude-guard-mcp"] } } }
```

**As a CLI:**

```bash
npx claude-guard scan .           # scan cwd (exits 2 on CRITICAL)
npx claude-guard fix .            # scan + apply all safe fixes
npx claude-guard report --open    # standalone HTML in browser
npx claude-guard sarif . > out.sarif      # for GitHub Code Scanning
npx claude-guard install-hooks    # pre-commit hook blocking CRITICALs
```

Full CLI: `npx claude-guard --help`.

## GitHub Code Scanning

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
      - run: npx claude-guard scan . || true
      - run: npx claude-guard sarif . > claude-guard.sarif
      - uses: github/codeql-action/upload-sarif@v3
        with: { sarif_file: claude-guard.sarif, category: claude-guard }
```

## How it keeps things safe

Short version:

- Default mode makes **zero network calls** and calls **zero LLMs**.
- Rules are **YAML only**, validated by JSON Schema + `safe-regex2` (ReDoS guard) at load time.
- Red-team mode is opt-in, loopback-only, enforced by string check **and** DNS re-resolution.
- Fixes never commit on your behalf and always write a rollback patch.

Full model: **[`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md)**.

## Rules

| category | count |
|---|---|
| secrets | 16 |
| sql | 10 |
| xss | 10 |
| auth | 23 |
| llm | 17 |
| misconfig | 60 |
| docker | 2 |
| iac | 12 |

Full catalogue: **[`docs/rules.md`](docs/rules.md)** (regenerate with `claude-guard docs`).

## Comparison

| | claude-guard | Semgrep | Gitleaks | Snyk Code | SonarQube |
|---|---|---|---|---|---|
| MCP server for Claude | ✅ | — | — | — | — |
| AI-specific rules (NEXT_PUBLIC, LLM SDK leaks, prompt injection) | ✅ | partial | — | — | — |
| Checkbox auto-fix + git branch staging | ✅ | — | — | — | — |
| 0 API keys / 0 network by default | ✅ | ✅ | ✅ | — | — |
| SARIF 2.1.0 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Rule catalogue | 155 | 2000+ | secrets-only | thousands | thousands |

Run claude-guard **alongside** the general-purpose tools, not instead of them.

## FAQ

**Does it send my code anywhere?** No. Zero network calls, zero telemetry, no LLM API key required.

**Does it execute code from rule files?** No. YAML only. Every regex is ReDoS-screened at load.

**Why checkbox UX instead of full auto-fix?** A wrong auto-fix on a false positive turns a detection error into a functional regression. `apply_fixes --mode=all_safe` is still there when you trust the set.

**Does it replace Snyk / Semgrep / Sonar?** No — run it alongside. Its niche is "the 150 things Claude-assisted code gets wrong most often, each with a fix wired up."

More answers: [`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md).

## License

MIT — see [`LICENSE`](LICENSE). Disclosure: [`SECURITY.md`](SECURITY.md).
