# claude-guard

**English** · [한국어](README.ko.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [Español](README.es.md)

### A shield for vibe coders.

AI writes code fast. **claude-guard** finds the security gaps it leaves behind — and helps you close them before anyone else does.

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![mcp](https://img.shields.io/badge/MCP-stdio-purple)](https://modelcontextprotocol.io)
[![rules](https://img.shields.io/badge/rules-155-8a2be2)](docs/rules.md)
[![tests](https://img.shields.io/badge/tests-121%20passing-brightgreen)](tests)

```bash
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

No API keys. No network calls by default. No outbound telemetry.

## What it does

claude-guard is the MCP server that watches your back while you vibe-code. It walks through your repo, catches the mistakes attackers love — a forgotten `NEXT_PUBLIC_OPENAI_KEY` in `.env`, a `$queryRawUnsafe` wired straight to `req.query`, a stray Supabase `service_role` that slipped into the client bundle — puts a grade on the result, and fixes **only the items you tick**.

## Demo

```console
$ npx claude-guard scan ./examples/vulnerable-next-app

  F   0/100   Grade F — 23 findings (12 CRITICAL, 7 HIGH, 2 MEDIUM, 2 LOW)
  scan_id=747d5448  duration=76ms  layers=l1,l2
  next: claude-guard list
```

Open `.claude-guard/findings.md`, tick `[x]` on whatever you want fixed, run `claude-guard fix`. The changes land on a `claude-guard/fix-<id>` branch, staged but not committed — you still own the commit.

## What's inside

- **155 rules** across secrets, SQL / NoSQL, XSS, auth, LLM-specific risks, misconfig, Docker, and IaC
- **5 AST-based auto-fixes** via `ts-morph`. Everything else becomes an annotated TODO — never a silent rewrite.
- **Checkbox-approved fixes** on a dedicated branch, always with a rollback patch
- **Exports**: JSON, Markdown, HTML, SARIF 2.1.0, JUnit XML, CSV, shields.io badge
- **Four ways to silence noise**: inline comment, `ignore.yml`, `severity_overrides`, `baseline`
- **Opt-in red-team probe** — loopback only, DNS-rebinding defense, per-finding rate limit
- **MCP native** — 10 tools + 4 resources. Works in Claude Code / Desktop / any MCP client.

## Install

**As an MCP server (recommended):**

```bash
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

For Claude Desktop, in `claude_desktop_config.json`:

```json
{ "mcpServers": { "claude-guard": { "command": "npx", "args": ["-y", "claude-guard-mcp"] } } }
```

**As a CLI:**

```bash
npx claude-guard scan .              # scan cwd (exits 2 on CRITICAL — perfect for CI)
npx claude-guard fix .               # scan, then apply every safe fix
npx claude-guard report --open       # standalone HTML report in your browser
npx claude-guard sarif . > out.sarif # for GitHub Code Scanning
npx claude-guard install-hooks       # pre-commit hook that blocks CRITICALs
```

Full command list: `npx claude-guard --help`.

## Drop into GitHub Code Scanning

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

Findings show up under your repo's **Security** tab.

## How it earns your trust

The short list:

- Default mode makes **zero network calls** and never talks to an LLM.
- Rules are **YAML only** — no code execution path from a rule file. JSON Schema + `safe-regex2` (ReDoS guard) validate every regex at load time.
- Red-team mode is off by default. When turned on, it only hits loopback — enforced by string check **and** DNS re-resolution.
- Fixes never commit for you. Every fix batch writes a rollback patch.

Full story: **[`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md)**.

## Rules

| category | count |
|---|---|
| secrets | 19 |
| sql | 10 |
| xss | 10 |
| auth | 23 |
| llm | 17 |
| misconfig | 62 |
| docker | 2 |
| iac | 12 |

Full catalogue: **[`docs/rules.md`](docs/rules.md)** (regenerate any time with `claude-guard docs`).

## How it compares

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

**Does it send my code anywhere?**
No. Zero network calls, no telemetry, no LLM API key required.

**Does it execute code from rule files?**
No. Rules are YAML; every regex is ReDoS-screened at load time.

**Why checkbox UX instead of full auto-fix?**
A wrong auto-fix on a false positive turns a detection mistake into a functional regression. When you do trust the rule set, `apply_fixes --mode=all_safe` still applies everything in one go.

**Does it replace Snyk / Semgrep / Sonar?**
No — run it alongside. Its niche is the 150 things Claude-assisted code gets wrong most often, each with a fix already wired up.

More answers: [`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md).

## License

MIT — see [`LICENSE`](LICENSE). Vulnerability disclosure: [`SECURITY.md`](SECURITY.md).
