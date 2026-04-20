# claude-guard

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · **Español**

### Un escudo para los que hacen vibe coding.

La IA escribe código muy rápido. **claude-guard** cierra los huecos de seguridad que va dejando — antes de que los encuentre alguien más.

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![mcp](https://img.shields.io/badge/MCP-stdio-purple)](https://modelcontextprotocol.io)
[![rules](https://img.shields.io/badge/rules-155-8a2be2)](docs/rules.md)
[![tests](https://img.shields.io/badge/tests-111%20passing-brightgreen)](tests)

```bash
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

Sin API keys. Sin llamadas de red por defecto. Sin telemetría saliente.

## Qué hace

claude-guard es el servidor MCP que te cubre las espaldas mientras haces vibe-coding. Recorre el repo, detecta lo que más les gusta a los atacantes — un `NEXT_PUBLIC_OPENAI_KEY` olvidado en el `.env`, un `$queryRawUnsafe` enganchado directo a `req.query`, un `service_role` de Supabase que se coló en el bundle del cliente — te pone una nota, y repasa contigo **sólo las correcciones que marques**.

## Demo

```console
$ npx claude-guard scan ./examples/vulnerable-next-app

  F   0/100   Grade F — 22 hallazgos (11 CRITICAL, 7 HIGH, 2 MEDIUM, 2 LOW)
  scan_id=747d5448  duration=76ms  layers=l1,l2
  next: claude-guard list
```

Abre `.claude-guard/findings.md`, marca `[x]` en lo que quieras corregir, y ejecuta `claude-guard fix`. Los cambios quedan en una rama `claude-guard/fix-<id>`, en staging pero **sin commit** — el commit lo decides tú.

## Lo que trae dentro

- **155 reglas** — secrets, SQL / NoSQL, XSS, auth, riesgos específicos de LLM, misconfig, Docker, IaC
- **5 auto-fixes basados en AST** (`ts-morph`). El resto se queda como TODO anotado — nada de reescrituras silenciosas.
- **Fixes aprobados por casilla**, en una rama dedicada y siempre con un parche de rollback
- **Exportaciones**: JSON, Markdown, HTML, SARIF 2.1.0, JUnit XML, CSV, badge de shields.io
- **Cuatro formas de silenciar ruido**: comentario inline, `ignore.yml`, `severity_overrides`, `baseline`
- **Sonda red-team opt-in** — sólo loopback, defensa DNS-rebinding, rate limit por finding
- **MCP nativo** — 10 tools + 4 resources. Funciona en Claude Code / Desktop / cualquier cliente MCP.

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
npx claude-guard scan .              # escanea cwd (sale con 2 si hay CRITICAL — ideal para CI)
npx claude-guard fix .               # escanea y aplica todos los fixes seguros
npx claude-guard report --open       # informe HTML autocontenido en el navegador
npx claude-guard sarif . > out.sarif # para GitHub Code Scanning
npx claude-guard install-hooks       # hook pre-commit que bloquea CRITICALs
```

Lista completa de comandos: `npx claude-guard --help`.

## Enchúfalo a GitHub Code Scanning

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

Los hallazgos aparecen en la pestaña **Security** del repo.

## Por qué se puede confiar en él

En corto:

- El modo por defecto no hace **ni una** llamada de red ni habla con ningún LLM.
- Las reglas son **sólo YAML** — no hay camino desde un archivo de regla hasta ejecutar código. Al cargarlas, JSON Schema + `safe-regex2` (guardia ReDoS) pasan por cada regex.
- El modo red-team está apagado por defecto. Cuando lo enciendes, sólo pega a loopback — forzado por chequeo de string **y** re-resolución DNS.
- Los fixes no hacen commit por ti. Cada lote deja su parche de rollback.

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

Catálogo completo: **[`docs/rules.md`](docs/rules.md)** (regenerable con `claude-guard docs`).

## Cómo se compara

| | claude-guard | Semgrep | Gitleaks | Snyk Code | SonarQube |
|---|---|---|---|---|---|
| Servidor MCP para Claude | ✅ | — | — | — | — |
| Reglas específicas para código AI (NEXT_PUBLIC, fugas de SDK LLM, prompt injection) | ✅ | parcial | — | — | — |
| Auto-fix por casilla + staging en rama Git | ✅ | — | — | — | — |
| 0 API keys / 0 red por defecto | ✅ | ✅ | ✅ | — | — |
| SARIF 2.1.0 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tamaño del catálogo | 155 | 2000+ | sólo secretos | miles | miles |

Úsalo **junto a** Semgrep / Sonar / Snyk, no en su lugar.

## FAQ

**¿Envía mi código a algún sitio?**
No. Cero red, cero telemetría, no hace falta API key de LLM.

**¿Ejecuta código de los archivos de regla?**
No. Las reglas son YAML; cada regex pasa por ReDoS-check al cargar.

**¿Por qué UX de casillas y no auto-fix total?**
Un auto-fix sobre un falso positivo convierte un error de detección en una regresión funcional. Cuando confías en el catálogo, `apply_fixes --mode=all_safe` aplica todo de una.

**¿Reemplaza a Snyk / Semgrep / Sonar?**
No — se usa en paralelo. Su nicho: "las 150 cosas que el código asistido por Claude suele equivocar, cada una con su fix ya cableado".

Más: [`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md).

## Licencia

MIT — ver [`LICENSE`](LICENSE). Divulgación de vulnerabilidades: [`SECURITY.md`](SECURITY.md).
