# Contributing to claude-guard

Thanks for considering a contribution. The project moves fastest when changes are small, tested, and pointed at a specific rule or tool.

## Development

```bash
pnpm install     # or npm/yarn
pnpm test        # vitest
pnpm run build   # tsc
```

## Adding a rule

1. Pick a category directory under `rules/` (or add a new one matching the enum in `schema/rule.schema.json`).
2. Name the file `CG-<CATEGORY>-<NNN>-<slug>.yml`.
3. Include `id`, `title`, `severity`, `category`, `patterns`, and a `context_hint` explaining both the risk and the fix in plain language.
4. Add at least one positive fixture (a snippet the rule should catch) and one negative fixture (a snippet it must not catch) as a test.

## Writing plugins

Plugins are YAML-only in MVP. Ship a `claude-guard-plugin.yml` manifest pointing to your rule files, publish to npm as `@scope/claude-guard-plugin-*`, and document how to enable it via `config.yaml` `plugins.allowed`.

## Submitting a pull request

- Keep commits small and logical.
- Run `pnpm test` and make sure `pnpm exec tsc --noEmit` is clean.
- Do not add code execution to plugins; custom fix strategies go in `src/fix/` with a test.
- If your change adjusts the detection scope, update `README.md` accordingly.
