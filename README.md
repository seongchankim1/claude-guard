# claude-guard

**MCP server that audits AI-generated code the way real attackers would — then fixes only what you check.**

![license](https://img.shields.io/badge/license-MIT-blue)
![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![mcp](https://img.shields.io/badge/MCP-stdio-purple)

- One-line install. **Zero API keys. Zero network calls by default. Zero outbound telemetry.**
- Detects across **10 languages** via an optional Semgrep adapter, plus builtin rules for the failure modes that keep showing up in AI-generated web apps.
- **Checkbox-based approval.** `claude-guard` writes a `findings.md` grouped by severity. You toggle `[x]` on the items you want fixed, then run `apply_fixes`. Nothing else is touched.
- Opt-in red-team mode runs a proof-of-concept probe against **localhost only**, with DNS-rebinding defense and per-finding rate limiting.

## Why

Vibe-coding with Claude or any other model produces a lot of code in a hurry — which means it also produces a lot of the same security mistakes in a hurry. Hardcoded `NEXT_PUBLIC_*` secrets, `$queryRawUnsafe` with string interpolation, Supabase `service_role` imported into a client file, `dangerouslySetInnerHTML` on user input, CORS `*`, and so on.

`claude-guard` is a tiny MCP server that teaches your agent (Claude Code, Claude Desktop, or any MCP-compatible client) to look for these classes of issues the way an attacker would, then walk through the fixes with you instead of rewriting your whole repo without asking.

## Install

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
| `list_findings` | Render `.claude-guard/findings.md` with checkboxes grouped by severity. |
| `explain` | Rule rationale, attack scenario, PoC payload, fix guidance. |
| `apply_fixes` | Apply fixes for checked items on a dedicated branch; git-staged, not committed. |
| `rollback` | Revert a previous fix batch via saved patch. |
| `redteam_probe` | Loopback-only live probe (opt-in). External targets are hard-blocked. |
| `list_checks` | Show active rule catalogue by category. |
| `init_config` | Create `.claude-guard/config.yaml` with defaults. |

## Builtin rules

MVP ships with **10 rules** across six categories, targeting the issues we see most often in AI-generated web code:

| category | example rules |
|---|---|
| `secrets` | `NEXT_PUBLIC_*` names that look like credentials, literal API keys in source, Supabase `service_role` in client-reachable files |
| `sql` | SQL string concatenation with a variable, Prisma `$queryRawUnsafe` / `$executeRawUnsafe` |
| `xss` | `dangerouslySetInnerHTML` with a dynamic expression |
| `auth` | Hardcoded JWT signing secret, session `cookies().set(...)` worth reviewing for flags |
| `llm` | User input interpolated into a `role: system` / `role: "system"` prompt |
| `misconfig` | CORS `Access-Control-Allow-Origin: *` |

Call `list_checks` from your MCP client to see the full active catalogue at any time. Rules are YAML — `rules/<category>/CG-XXX-NNN-slug.yml`. Contributions welcome.

## Auto-fix coverage

Auto-fix strategies shipped with MVP:

- `rename_env_var` — renames `NEXT_PUBLIC_*` secret-like variables in `.env*` **and** all referencing source files in one pass.
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
