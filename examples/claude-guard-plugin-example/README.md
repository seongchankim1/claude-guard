# claude-guard-plugin-example

Reference plugin for [claude-guard](https://github.com/your-org/claude-guard).

## What's in here

- `claude-guard-plugin.yml` — the manifest claude-guard looks for when your package is listed in `.claude-guard/config.yaml` `plugins.allowed`.
- `rules/` — YAML rule files. claude-guard requires the `CATEGORY-CATEGORY-NNN` id shape (e.g. `ACME-INT-001`).

## Enabling this plugin in a project

```yaml
# .claude-guard/config.yaml
version: 1
plugins:
  allowed:
    - claude-guard-plugin-example
```

## Safety posture

Plugins are **YAML only** — claude-guard does not load JavaScript from plugins. Regex patterns are screened with `safe-regex2` and validated against the core JSON schema at load time; an unsafe pattern rejects the whole plugin, not just the one rule.

If you need an AST-based fix strategy, send a PR to claude-guard core.
