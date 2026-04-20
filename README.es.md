# claude-guard

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · **Español**

**Servidor MCP que audita código generado por IA como lo haría un atacante real, y sólo aplica las correcciones que marques.**

![license](https://img.shields.io/badge/license-MIT-blue)
![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![mcp](https://img.shields.io/badge/MCP-stdio-purple)
![rules](https://img.shields.io/badge/rules-155-8a2be2)
![tests](https://img.shields.io/badge/tests-111%20passing-brightgreen)

```
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

Cero API keys. Cero llamadas de red por defecto. Cero telemetría saliente.

---

## Por qué existe claude-guard

Hacer *vibe-coding* con Claude u otro modelo produce mucho código en poco tiempo — y, por lo tanto, los mismos fallos de seguridad se repiten también rápido: `NEXT_PUBLIC_OPENAI_API_KEY` incrustado en `.env`, `prisma.$queryRawUnsafe` interpolando `req.query`, el `service_role` de Supabase importado en un componente cliente, `dangerouslySetInnerHTML` sobre salidas del modelo, CORS `"*"` con credenciales, webhooks sin verificación de firma — los mismos veinte errores cada semana.

claude-guard es un pequeño servidor MCP que enseña a tu agente (Claude Code, Claude Desktop o cualquier cliente MCP) a detectar estos errores con mentalidad de atacante, y a recorrer contigo las correcciones en lugar de reescribir el repo sin preguntar.

---

## Cómo protege tu código

Cuatro ideas apiladas. Cada una es simple; combinadas cubren **detectar → puntuar → corregir → silenciar** de forma auditable.

### 1. Detección en tres capas

```
┌─────────────────────────────────────────────────────────────┐
│  L1  Motores OSS (opcionales, autodetectados)               │
│      semgrep · gitleaks · osv-scanner · npm/pip audit       │
├─────────────────────────────────────────────────────────────┤
│  L2  155 reglas YAML integradas                             │
│      secrets · sql · xss · auth · llm · misconfig · docker · iac │
├─────────────────────────────────────────────────────────────┤
│  L3  Simulador red-team (opt-in)                            │
│      payloads PoC estáticos + sonda viva sólo loopback      │
└─────────────────────────────────────────────────────────────┘
```

- **L1** orquesta las mejores herramientas OSS instaladas (Semgrep, Gitleaks, OSV). Todas son **opcionales**; L2 solo basta.
- **L2** es el catálogo propio de claude-guard: regex YAML centradas en los fallos que el código generado por IA suele cometer. Cada regla viene con *fixtures* positivas y negativas; la suite de tests garantiza que la regla **se active en el caso malo y calle en el bueno**.
- **L3** es opt-in, apagada por defecto. `redteam_probe` envía **una sola** petición HTTP GET a una URL de loopback para demostrar una ruta de ataque. Los objetivos externos se bloquean duramente (ver [guardias red-team](#guardias-del-modo-red-team) abajo).

Todos los hallazgos se normalizan a la misma forma `Finding` (rule_id, severity, file, line, evidence, fix_strategy), deduplicados por `(file, line, rule_id)`.

### 2. Scorecard + nota

Cada escaneo produce una puntuación 0–100 y una nota A+…F:

| severidad | resta | tope por severidad |
|---|---|---|
| CRITICAL | -20 | -80 |
| HIGH | -8 | -40 |
| MEDIUM | -3 | -20 |
| LOW | -1 | -10 |

La nota aparece arriba en `.claude-guard/findings.md`, como herramienta MCP (`score`), como comando CLI (`claude-guard score`) y como JSON de endpoint shields.io (`claude-guard badge`). Cada escaneo añade una línea a `.claude-guard/history.json`; `claude-guard trend` muestra la evolución.

### 3. Correcciones con casillas de verificación

Tras escanear, claude-guard escribe una checklist markdown:

```markdown
# claude-guard findings — scan_id: 747d5448-…

> Security scorecard: Grade F — score 0/100 (11 CRITICAL, 7 HIGH, 2 MEDIUM, 2 LOW)

## CRITICAL (11)
- [ ] **CG-SQL-002** `app/api/users/route.ts:7` — Prisma $queryRawUnsafe
  - strategy: parameterize_query
- [ ] **CG-SEC-001** `.env:1` — NEXT_PUBLIC_OPENAI_KEY parece un secreto
  - strategy: rename_env_var
...
```

Marca `[x]` en lo que quieres corregir. `apply_fixes` entonces:

1. Rechaza tocar un árbol de trabajo sucio salvo que pases `force=true`.
2. Crea una rama `claude-guard/fix-<scan_id>`.
3. Despacha cada hallazgo a una **estrategia de fix** — cinco son AST-based con `ts-morph`, el resto cae en `suggest_only` (anotación en línea `// claude-guard: ...` en lugar de una reescritura ambigua).
4. Hace `git add -A` pero **no hace commit**. El mensaje y la decisión son tuyos.
5. Guarda un parche de rollback en `.claude-guard/rollback/<scan_id>.patch`. `claude-guard rollback <scan_id>` lo revierte.

Reescrituras AST actuales: `rename_env_var`, `set_cookie_flags`, `split_server_only`, `parameterize_query`, `wrap_with_authz_guard`. **Regla: una corrección automática equivocada es peor que un TODO claramente anotado.**

### 4. Cuatro capas de supresión

Los falsos positivos existen. claude-guard ofrece cuatro mandos, todos en texto plano y diffables:

| Dónde | Alcance | Cuándo |
|---|---|---|
| `// claude-guard-disable-next-line CG-XXX-NNN` | una línea | un hallazgo puntual es falso positivo |
| `.claude-guard/ignore.yml` (`claude-guard suppress <id>`) | fijado por rule_id + file + line | quieres el ignore commiteado con un `reason:` |
| `config.yaml` `severity_overrides` | la regla, a nivel proyecto | tu equipo no está de acuerdo con la severidad por defecto |
| `claude-guard baseline` | todo lo que ya existe | al adoptar claude-guard en un repo ruidoso; desde ya, sólo se reportan hallazgos **nuevos** |

Todas las capas son texto plano dentro del repo. Sin base de datos oculta.

---

## Cómo se protege a sí mismo

Las herramientas defensivas son en sí mismas un objetivo de cadena de suministro. claude-guard está diseñado para que ni un paquete de reglas comprometido, ni un escaneo con prompt injection, ni una URL maliciosa puedan convertir tu auditoría en un incidente.

### Privacidad y flujo de datos

- **Cero llamadas de red por defecto.** El config por defecto `layers: [l1, l2]` es 100% local.
- **No requiere API key de LLM.** claude-guard no llama a ningún modelo.
- **Sin telemetría.** Nada de *analytics*. Puedes comprobarlo con `grep -R 'https://' src/`.
- **Los findings se quedan locales.** En el primer escaneo, `.claude-guard/` se añade automáticamente a `.gitignore`.

### Seguridad de plugins

- Los plugins son **sólo YAML**. Nunca se carga JavaScript desde un plugin.
- Los plugins están en **lista blanca** (`plugins.allowed` en `config.yaml`).
- Las reglas de plugin pasan la misma validación **JSON Schema + ReDoS** que las reglas nativas. Una regex insegura rechaza todo el paquete.
- Un plugin que necesite una estrategia AST nueva **no puede definirla**; esa lógica vive en `src/fix/` y entra sólo por PR al core. Restricción deliberada: es la forma más simple de probar que instalar un plugin no ejecuta código arbitrario.

### Guardias del modo red-team

`redteam_probe` es opt-in y está apagado por defecto. Al ejecutarse, **antes de abrir un socket**, aplica cuatro chequeos:

1. **Lista blanca de protocolo** — sólo `http:` y `https:`. `file://`, `gopher://`, `ftp://` se rechazan.
2. **Lista blanca de hostname (string)** — sólo `localhost`, `127.0.0.1`, `::1`, `0.0.0.0`. Cualquier otro → `HOSTNAME`.
3. **Re-resolución DNS** — con `dns.lookup({ all: true })`; **todas** las direcciones devueltas deben ser loopback. Un registro DNS-rebinding que resuelva a IP pública se rechaza con `DNS_REBIND`.
4. **Rate limit** — 1 sonda por `finding_id`, 10 sondas por minuto por proceso. En memoria.

Además: no se siguen redirecciones, timeout 5 s, respuesta máx 1 MB, y cada petición/respuesta queda en `.claude-guard/redteam/<finding_id>.log`.

### Seguridad de regex (ReDoS)

Cada regex de regla se valida en tiempo de carga:

- Debe compilar como `RegExp`.
- Debe pasar [`safe-regex2`](https://github.com/davisjam/safe-regex) (rechaza patrones con backtracking superlineal en el peor caso).

Un patrón inseguro rechaza **todo el archivo** de reglas, no una carga parcial silenciosa.

### Seguridad Git

- `apply_fixes` rechaza tocar un árbol de trabajo sucio sin `force=true`.
- Las correcciones viven en una rama separada `claude-guard/fix-<scan_id>`.
- Los cambios se *staging* (`git add -A`) pero **no se commitean**. Tú eliges el commit.
- Cada lote de fixes escribe un parche de rollback en diff unificado; `claude-guard rollback <id>` lo aplica en reverso.
- El hook pre-commit que instala `claude-guard install-hooks` bloquea commits que introduzcan CRITICALs, es idempotente y preserva por encadenamiento cualquier hook pre-commit existente.

---

## Instalación

```bash
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

Para Claude Desktop, añadir a `claude_desktop_config.json`:

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

CLI independiente:

```bash
npx claude-guard scan             # escanear el directorio actual
npx claude-guard fix              # escanear + aplicar correcciones seguras
npx claude-guard score            # nota del último escaneo
npx claude-guard sarif            # SARIF 2.1.0 para GitHub Code Scanning
npx claude-guard report --open    # informe HTML autocontenido en el navegador
npx claude-guard install-hooks    # hook pre-commit que bloquea CRITICALs
```

`scan` sale con `0` si está limpio y con `2` si hay CRITICAL — útil para *gating* en CI.

---

## Catálogo de reglas

**155 reglas** en ocho categorías. `claude-guard docs` regenera el catálogo completo en markdown con la justificación de cada regla.

- **secrets** (16) — secretos NEXT_PUBLIC, claves de APIs cloud, PEM, `.env` commiteado, etc.
- **sql** (10) — inyección por plantilla en Prisma / Knex / Drizzle / TypeORM / Sequelize / Django / SQLAlchemy
- **xss** (10) — dangerouslySetInnerHTML, v-html, {@html}, javascript: URL, etc.
- **auth** (23) — uso indebido de JWT, flags de cookie faltantes, sesión en localStorage, mass-assignment, etc.
- **llm** (17) — prompt injection, clave cliente, documentos RAG en rol system, etc.
- **misconfig** (60) — CORS, RLS, Firebase, SSRF, CSRF, shell exec, XXE, etc.
- **docker** (2) — `FROM :latest`, `apt-get install` sin `--no-install-recommends`
- **iac** (12) — errores típicos en Terraform / K8s / GitHub Actions, wildcards IAM, etc.

---

## Comparación con otras herramientas

| | claude-guard | Semgrep | Gitleaks | Snyk Code | SonarQube |
|---|---|---|---|---|---|
| Servidor MCP para Claude Code / Desktop | ✅ | — | — | — | — |
| Reglas específicas para código AI | ✅ | parcial | — | — | — |
| Fix automático con aprobación por casilla y rama Git | ✅ | — | — | — | — |
| 0 API keys, 0 red por defecto | ✅ | ✅ (local) | ✅ | — | — |
| SARIF 2.1.0 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Nota de seguridad | ✅ | — | — | parcial | ✅ |
| Sonda PoC sólo loopback | ✅ | — | — | — | — |
| Tamaño del catálogo | 155 | 2000+ | sólo secretos | miles | miles |

claude-guard es intencionadamente **pequeño y con opinión**. **Úsalo junto a Semgrep / Sonar / Snyk, no en lugar de ellos.**

---

## FAQ

**¿Envía claude-guard mi código a algún sitio?**
No. Por defecto no hace llamadas de red, no manda telemetría y no llama a ningún LLM por ti.

**¿Ejecuta código desde archivos de regla?**
No. Las reglas son YAML; no hay camino a JavaScript. Cada regex pasa por `safe-regex2` + JSON Schema en tiempo de carga.

**¿Qué hace exactamente el modo red-team?**
Sólo si ejecutas `redteam_probe`, envía un HTTP GET a una URL de loopback que tú le das. Loopback se fuerza por string **y** por re-resolución DNS; un registro rebinding que resuelva a IP pública se rechaza.

**¿Por qué el UX de checklist y no auto-fix total?**
Auto-corregir un falso positivo convierte un error de clasificación en una regresión funcional. Marcar `[x]` intercambia unos segundos de tipeo por confianza. Si confías en el catálogo, `apply_fixes --mode=all_safe` sigue funcionando.

**¿Sustituye a Snyk / Semgrep / Sonar?**
No. Úsalo en paralelo. El nicho de claude-guard es "las 150 cosas que el código asistido por Claude suele equivocar, con arreglos ya cableados".

---

## Licencia

MIT. Ver `LICENSE`. Política de uso responsable y divulgación privada en `SECURITY.md`.
