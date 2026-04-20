# claude-guard

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · **Español**

> Audita el código generado por IA como lo haría un atacante real — y sólo aplica las correcciones que marques.

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![mcp](https://img.shields.io/badge/MCP-stdio-purple)](https://modelcontextprotocol.io)
[![rules](https://img.shields.io/badge/rules-155-8a2be2)](docs/rules.md)
[![tests](https://img.shields.io/badge/tests-111%20passing-brightgreen)](tests)

```bash
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

Cero API keys. Cero llamadas de red por defecto. Cero telemetría saliente.

## Qué es

claude-guard es un servidor MCP. Escanea tu repo en busca de los fallos de seguridad más comunes en el código asistido por IA (`NEXT_PUBLIC_*` con secretos, `prisma.$queryRawUnsafe`, Supabase `service_role` en el bundle cliente, CORS `"*"`, etc.), asigna una nota y te acompaña a aplicar **sólo las correcciones que marques**.

## Demo

```console
$ npx claude-guard scan ./examples/vulnerable-next-app

  F   0/100   Grade F — score 0/100 (11 CRITICAL, 7 HIGH, 2 MEDIUM, 2 LOW)
  scan_id=747d5448  findings=22  duration=76ms  layers=l1,l2
  11 CRITICAL   7 HIGH   2 MEDIUM   2 LOW
  next: claude-guard list
```

Abre `.claude-guard/findings.md`, marca `[x]` en lo que quieras corregir, y ejecuta `claude-guard fix` (o `apply_fixes` por MCP). Los cambios quedan en una rama `claude-guard/fix-<id>`, en staging pero sin commit.

## Características

- **155 reglas** — secrets · SQL/NoSQL · XSS · auth · LLM · misconfig · Docker · IaC
- **5 fixes AST** (`ts-morph`) — el resto queda como TODO anotado, nunca reescritura silenciosa
- **Correcciones por casilla** con rama Git + parche de rollback
- **Exportaciones** — JSON · Markdown · HTML · SARIF 2.1.0 · JUnit XML · CSV · shields.io badge
- **Cuatro capas de supresión** — comentario inline, `ignore.yml`, `severity_overrides`, `baseline`
- **Sonda red-team opt-in** — sólo loopback, con defensa DNS-rebinding + rate limit
- **MCP nativo** — 10 tools + 4 resources

## Instalación

**Como servidor MCP (recomendado):**

```bash
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

Para Claude Desktop, en `claude_desktop_config.json`:

```json
{ "mcpServers": { "claude-guard": { "command": "npx", "args": ["-y", "claude-guard-mcp"] } } }
```

**Como CLI:**

```bash
npx claude-guard scan .           # escanear el directorio actual (exit 2 si hay CRITICAL)
npx claude-guard fix .            # escanear + aplicar correcciones seguras
npx claude-guard report --open    # informe HTML autocontenido en el navegador
npx claude-guard sarif . > out.sarif       # para GitHub Code Scanning
npx claude-guard install-hooks    # hook pre-commit que bloquea CRITICALs
```

CLI completo: `npx claude-guard --help`.

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

## Cómo mantiene la seguridad

En corto:

- El modo por defecto hace **cero** llamadas de red y **cero** llamadas a LLMs.
- Las reglas son **sólo YAML**, validadas con JSON Schema + `safe-regex2` (guardia ReDoS) al cargar.
- El modo red-team es opt-in, sólo loopback, forzado por chequeo de string **y** re-resolución DNS.
- Los fixes nunca hacen commit por ti y siempre dejan un parche de rollback.

Modelo completo: **[`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md)**.

## Reglas

| categoría | cantidad |
|---|---|
| secrets | 16 |
| sql | 10 |
| xss | 10 |
| auth | 23 |
| llm | 17 |
| misconfig | 60 |
| docker | 2 |
| iac | 12 |

Catálogo completo: **[`docs/rules.md`](docs/rules.md)** (regenerar con `claude-guard docs`).

## Comparación

| | claude-guard | Semgrep | Gitleaks | Snyk Code | SonarQube |
|---|---|---|---|---|---|
| Servidor MCP para Claude | ✅ | — | — | — | — |
| Reglas específicas para código AI | ✅ | parcial | — | — | — |
| Auto-fix por casilla + rama Git | ✅ | — | — | — | — |
| 0 API keys / 0 red por defecto | ✅ | ✅ | ✅ | — | — |
| SARIF 2.1.0 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tamaño del catálogo | 155 | 2000+ | sólo secretos | miles | miles |

Úsalo **junto a** Semgrep / Sonar / Snyk, no en lugar de ellos.

## FAQ

**¿Envía mi código a algún sitio?** No. Cero red, cero telemetría, no requiere API key de LLM.

**¿Ejecuta código desde archivos de regla?** No. Sólo YAML. Cada regex pasa por ReDoS-check al cargar.

**¿Por qué casillas y no auto-fix total?** Un fix automático sobre un falso positivo convierte un error de detección en una regresión funcional. Para bulk puedes usar `apply_fixes --mode=all_safe`.

**¿Sustituye a Snyk / Semgrep / Sonar?** No — úsalos en paralelo. Su nicho: "las 150 cosas que el código asistido por Claude suele equivocar, cada una con su fix".

Más: [`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md).

## Licencia

MIT — ver [`LICENSE`](LICENSE). Divulgación: [`SECURITY.md`](SECURITY.md).
