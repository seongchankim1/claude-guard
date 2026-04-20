# claude-guard

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · **Español**

Servidor MCP que audita los fallos de seguridad típicos del código escrito en modo vibe coding. 155 reglas / 5 auto-fixes basados en AST / 137 tests verdes.

> No es un escudo contra todos los ataques. Es un primer filtro local para los errores que la programación asistida por IA repite una y otra vez: secretos expuestos al cliente, SQL crudo, prompt injection, flags de cookie olvidados. Para análisis de dataflow entre ficheros, CVEs de dependencias y ataques en runtime úsalo junto a otras herramientas.

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![rules](https://img.shields.io/badge/rules-155-8a2be2)](docs/rules.md)
[![tests](https://img.shields.io/badge/tests-137%20passing-brightgreen)](tests)

## Instalación

```bash
claude mcp add claude-guard -- npx -y -p claude-guard-mcp claude-guard-mcp
```

## Uso

| Comando | Qué hace |
|---|---|
| `/mcp__claude-guard__scan` | Escanea el proyecto → genera `.claude-guard/findings.md` |
| `/mcp__claude-guard__fix` | Solo corrige con AST los items que hayas marcado con `[x]` |

Los cambios aterrizan staged en una rama `claude-guard/fix-<id>`. El commit lo haces tú.

## Qué detecta

### Secretos (19)
- Secretos filtrados vía `NEXT_PUBLIC_*` (OpenAI / Anthropic / Stripe secret, etc.)
- Clave `service_role` de Supabase llegando al cliente
- API keys, tokens, contraseñas y claves privadas hardcodeadas
- Ficheros `.env` / `.env.local` / `.env.production` commiteados
- Secretos de firma JWT escritos en el código
- Credenciales que quedaron en el historial de git (integración con gitleaks)

### Auth y control de acceso (23)
- Cookies sin `httpOnly` / `secure` / `sameSite`
- JWT `alg: none` y confusión de algoritmos HS256 ↔ RS256
- Tokens o contraseñas en la query string
- Acciones `"use server"` o rutas API sin comprobar authorization
- Supabase RLS desactivado
- Validación CSRF ausente
- Pocas rondas en bcrypt / scrypt / argon2
- URLs de reseteo de contraseña con el token en claro
- Session fixation y IDs de sesión predecibles

### Inyección SQL / NoSQL (10)
- Prisma `$queryRawUnsafe` / `$executeRawUnsafe` con input del usuario
- Knex `.raw()` con interpolación de template strings
- Drizzle `sql.raw(var)`
- Sequelize `literal()` inyectado
- Inyección de operadores de MongoDB (`$where`, filtros `$regex`)
- SQL formateado con f-strings o `%` en Python
- SQLAlchemy `text()` con formateo

### XSS (10)
- React `dangerouslySetInnerHTML` sin sanitizar
- Vue `v-html` bindeando input sin limpiar
- Svelte `{@html}` con input crudo
- Markdown renderizado sin escape previo
- Asignación directa a `innerHTML` / `outerHTML`
- `href={expr}` sin validar el scheme (deja pasar `javascript:`)
- `target="_blank"` sin `rel="noopener noreferrer"` (tabnabbing)

### Seguridad LLM (17)
- Input del usuario concatenado al system prompt (prompt injection)
- Resultados de RAG inyectados como system message
- Salida del LLM renderizada con `dangerouslySetInnerHTML`
- Claves de OpenAI / Anthropic empaquetadas en el bundle cliente
- Schemas de herramientas MCP con `type: string` libre (sin enum ni pattern)
- Historial de conversación guardando secretos o PII
- Resultados de function calls volcados al DOM sin validar

### Misconfiguración (62)
- CORS `origin: '*'` combinado con credentials
- HSTS con `max-age` inferior a un año
- Next.js `rewrites()` hacia destinos externos (open proxy)
- Next.js `images.remotePatterns` con hostname `*`
- Next.js `headers()` sin CSP
- Supabase RLS apagado
- Express / Fastify sin Helmet
- Verificación TLS desactivada (`rejectUnauthorized: false`)
- Subida de ficheros sin `limits` (multer / busboy)
- Endpoints sin rate limit
- `lodash.template(req.body.*)` (con CVE conocido)
- Electron `BrowserWindow` con `nodeIntegration: true`
- Uso de `node-serialize` (CVE-2017-5941)
- tRPC `publicProcedure.mutation` (cambia estado sin auth)

### IaC (12)
- Bucket S3 con ACL public-read / public-write
- Políticas IAM con `Action: "*"` / `Resource: "*"`
- Security groups con inbound 0.0.0.0/0 (SSH, RDP, puertos de DB)
- RDS / Postgres públicos declarados en Terraform
- Firestore rules `allow read, write: if true`
- Bucket GCS público
- Kubernetes `hostNetwork: true` / `privileged: true`

### Docker (2)
- `USER root` o falta del directive `USER`
- Imagen base fijada en `latest`

Catálogo completo de reglas: [`docs/rules.md`](docs/rules.md)

## Auto-fix (5)

- Renombrar secretos en `NEXT_PUBLIC_*` (env y referencias se actualizan a la vez)
- Añadir `httpOnly` / `secure` / `sameSite` a las cookies
- Insertar `import "server-only"` en módulos que tocan `service_role`
- Convertir SQL crudo → forma con tagged template
- Envolver funciones `"use server"` con un auth guard

Las otras 150 reglas son detection-only: informan del hallazgo con una línea de remediación y no emiten patch.

## Limitaciones

- No hay análisis de dataflow / taint entre ficheros → Semgrep Pro o CodeQL
- No escanea CVEs de dependencias → Snyk / osv-scanner / Dependabot
- No defiende en runtime → WAF / RASP
- No mira lógica de negocio, IDOR ni cadenas de permisos complejas → pentest
- Cobertura sólida: JS / TS / JSX / TSX, Next.js, Express, Prisma, Drizzle, Supabase, Firebase, Terraform, Dockerfile
- Cobertura parcial: Python, Java
- Sin cobertura aún: Rust, Go, Swift, Kotlin
- Cuatro vías para silenciar falsos positivos: comentario inline, `ignore.yml`, `severity_overrides`, `baseline`

## Principios de seguridad

- Por defecto corre totalmente offline. Solo si activas Semgrep, este descarga su ruleset desde `semgrep.dev`.
- Sin telemetría, sin clave de LLM, sin cuenta.
- Las reglas son solo YAML. Cada regex se re-valida con `safe-regex2` al cargarse.
- Plugins con allowlist y carga atómica (una regla rota hace que todo el plugin sea rechazado).
- Red-team probe es opt-in, solo loopback, con defensa contra DNS rebinding.
- Los fixes nunca commitean. Árbol sucio → rechazado. Se guarda un patch de rollback automáticamente.

Modelo de amenazas completo: [`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md)

## Export / CI

- SARIF 2.1.0 → GitHub Code Scanning
- JUnit XML · HTML · CSV
- JSON endpoint estilo shields.io (badges)
- pre-commit hook (bloquea CRITICAL)

## Licencia

MIT. Divulgación privada de vulnerabilidades: [`SECURITY.md`](SECURITY.md).
