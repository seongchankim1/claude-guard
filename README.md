# claude-guard

**MCP server that audits AI-generated code the way real attackers would — then fixes only what you check.**

![license](https://img.shields.io/badge/license-MIT-blue)
![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![mcp](https://img.shields.io/badge/MCP-stdio-purple)

- One-line install. **Zero API keys. Zero network calls by default. Zero outbound telemetry.**
- **70 builtin rules** across secrets, SQL/NoSQL injection, XSS, auth, LLM-specific risks, misconfiguration, Docker, and IaC. Detects across **10 languages** via an optional Semgrep adapter.
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

**70 rules** across eight categories, targeting the failure modes we see most often in AI-generated web code:

| category | count | example rules |
|---|---|---|
| `secrets` | 9 | `NEXT_PUBLIC_*` secret names, literal API keys, Supabase `service_role` client-side, AWS access keys, private-key PEM, committed `.env`, Slack webhooks, committed GCP service-account JSON, Stripe live keys |
| `sql` | 5 | SQL string concatenation, Prisma `$queryRawUnsafe` / `$executeRawUnsafe`, Knex `.raw()` interpolation, Python f-string queries, MongoDB `$where` |
| `xss` | 4 | React `dangerouslySetInnerHTML`, Vue `v-html`, direct `innerHTML` assignment, `href="javascript:…"` sinks |
| `auth` | 7 | Hardcoded JWT secret, missing cookie flags, low-round bcrypt, MD5/SHA1 password hashing, `jwt.decode` without verify, `Math.random` for tokens, OAuth without `state` |
| `llm` | 6 | User input in system prompt, `eval` on LLM output, client-side LLM SDK with a visible key, tool params into shell/file IO, LLM output rendered as raw HTML, system prompt in client-reachable module |
| `misconfig` | 13 | CORS `*`, Supabase RLS off, Firebase `if true`, open redirect, Express without `helmet`, Next.js Server Action with no auth, S3 public ACL, SSRF from request input, cloud-metadata IP fetch, user-driven iframe `src`, missing CSP, path traversal via request input, Django `DEBUG = True` |
| `docker` | 2 | Dockerfile `FROM :latest` / untagged, `apt-get install` without `--no-install-recommends` |
| `iac` | 4 | Terraform security group `0.0.0.0/0`, Terraform public S3 ACL, Kubernetes `hostPath`, Kubernetes `privileged: true` |

Call `list_checks` or `claude-guard rules` to see the full active catalogue. Rules are YAML — `rules/<category>/CG-XXX-NNN-slug.yml`. Contributions welcome.

## Auto-fix coverage

Auto-fix strategies shipped today:

- `rename_env_var` — renames `NEXT_PUBLIC_*` secret-like variables in `.env*` **and** all referencing source files in one pass.
- `set_cookie_flags` — AST-based via `ts-morph`. Adds missing `httpOnly` / `secure` / `sameSite` to `cookies().set(...)` calls while preserving your existing options and formatting.
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

## Not goals

- Attacking external services or third-party APIs.
- Runtime WAF or production gating.
- Competing with Burp / ZAP as a general penetration-testing tool.

## License

MIT. See `LICENSE`.
