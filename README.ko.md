# claude-guard

[English](README.md) · **한국어** · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [Español](README.es.md)

바이브코딩으로 짠 코드의 흔한 보안 취약점을 검수하는 MCP 서버. 룰 155개 / AST 자동 수정 5개 / 테스트 137개.

> 모든 해킹을 막아주는 도구는 아닙니다. AI와 빠르게 작업하다 보면 반복해서 나오는 전형적인 취약점(클라이언트에 노출된 시크릿, raw SQL, prompt injection, 빠진 cookie 플래그 같은 것들)을 로컬에서 먼저 걸러내는 1차 필터입니다. 파일 간 dataflow 분석, 의존성 CVE, 런타임 공격은 다른 도구와 같이 쓰세요.

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![rules](https://img.shields.io/badge/rules-155-8a2be2)](docs/rules.md)
[![tests](https://img.shields.io/badge/tests-137%20passing-brightgreen)](tests)

## 설치

```bash
claude mcp add claude-guard -- npx -y -p claude-guard-mcp claude-guard-mcp
```

## 사용

| 명령 | 동작 |
|---|---|
| `/mcp__claude-guard__scan` | 스캔 → `.claude-guard/findings.md` 생성 |
| `/mcp__claude-guard__fix` | `[x]` 체크한 항목만 AST 자동 수정 |

수정은 `claude-guard/fix-<id>` branch에 staged 상태로만 올라가고, commit은 직접 하면 됩니다.

## 검사 항목

### Secrets (19)
- `NEXT_PUBLIC_*`에 비밀값 노출 (OpenAI / Anthropic / Stripe secret 등)
- Supabase `service_role` 키가 클라이언트로 유출
- 하드코딩된 API key · 토큰 · 비밀번호 · private key
- `.env` / `.env.local` / `.env.production` 커밋
- JWT secret을 코드에 노출
- git history에 남은 credential (gitleaks 연동)

### Auth & Access Control (23)
- cookie에 `httpOnly` / `secure` / `sameSite` 누락
- JWT `alg: none` · HS256 ↔ RS256 algorithm confusion
- URL query string에 token / password 노출
- `"use server"` action / API route에서 authorization 체크 누락
- Supabase RLS 비활성화
- CSRF 토큰 검증 누락
- bcrypt / scrypt / argon2 round 수 부족
- password reset URL에 원본 token 그대로 포함
- session fixation · session ID 예측 가능

### SQL / NoSQL Injection (10)
- Prisma `$queryRawUnsafe` · `$executeRawUnsafe`에 사용자 입력 직결
- Knex `.raw()` 템플릿 문자열 삽입
- Drizzle `sql.raw(var)` 사용
- Sequelize `literal()` 삽입
- MongoDB operator injection (`$where`, `$regex` 필터)
- Python f-string / `%`-포매팅 SQL
- SQLAlchemy `text()` 포매팅

### XSS (10)
- React `dangerouslySetInnerHTML`에 sanitize 안 된 값 전달
- Vue `v-html`에 sanitize 안 된 값 바인딩
- Svelte `{@html}`에 raw 사용자 입력
- markdown 렌더 전 escape 누락
- `innerHTML` · `outerHTML` 직접 할당
- `href={expr}` 스킴 검증 누락 (`javascript:` 방지)
- `target="_blank"` + `rel="noopener noreferrer"` 누락 (tabnabbing)

### LLM Security (17)
- 시스템 프롬프트에 사용자 입력 직접 concat (prompt injection)
- RAG 검색 결과를 시스템 메시지로 주입
- LLM 응답을 `dangerouslySetInnerHTML`로 렌더
- OpenAI / Anthropic API 키가 클라이언트 번들에 포함
- MCP tool 입력 schema에 freeform `type: string` (enum · pattern 없음)
- 대화 이력에 secret · PII 저장
- function call 결과를 검증 없이 DOM에 반영

### Misconfiguration (62)
- CORS `origin: '*'` + credentials 동시 사용
- HSTS `max-age` 1년 미만
- Next.js `rewrites()` 외부 destination (open proxy)
- Next.js `images.remotePatterns: hostname '*'`
- Next.js `headers()`에 CSP 없음
- Supabase RLS off
- Express · Fastify Helmet 미사용
- SSL/TLS 검증 비활성화 (`rejectUnauthorized: false`)
- file upload `limits` 누락 (multer / busboy)
- rate limit 없는 엔드포인트
- lodash `_.template(req.body.*)` (CVE-prone)
- Electron `BrowserWindow` `nodeIntegration: true`
- `node-serialize` 사용 (CVE-2017-5941)
- tRPC `publicProcedure.mutation` (auth 없이 상태 변경)

### IaC (12)
- S3 bucket public-read / public-write ACL
- IAM policy `Action: "*"` · `Resource: "*"`
- Security group 0.0.0.0/0 inbound (SSH, RDP, DB 포트 등)
- Terraform으로 정의된 public RDS / Postgres
- Firestore rules `allow read, write: if true`
- GCS public bucket
- Kubernetes `hostNetwork: true` · `privileged: true`

### Docker (2)
- `USER root` 또는 `USER` 지정 누락
- base image `latest` tag 사용

전체 룰 카탈로그: [`docs/rules.md`](docs/rules.md)

## 자동 수정 (5개)

- `NEXT_PUBLIC_*` 비밀값 rename (env와 참조 파일 모두 동시 처리)
- cookie에 `httpOnly` / `secure` / `sameSite` 플래그 추가
- `service_role` 사용 모듈에 `import "server-only"` 삽입
- raw SQL → tagged template 변환
- `"use server"` 함수에 auth guard 래핑

나머지 150개 룰: 탐지 + 한 줄 수정 힌트만 제공.

## 제한

- 파일 간 dataflow · taint 분석 ✕ → Semgrep Pro / CodeQL
- 의존성 CVE 스캔 ✕ → Snyk / osv-scanner / Dependabot
- 런타임 방어 ✕ → WAF / RASP
- 비즈니스 로직 · IDOR · 복잡한 권한 체인 ✕ → 펜테스트
- 지원 언어: JS / TS / JSX / TSX, Next.js, Express, Prisma, Drizzle, Supabase, Firebase, Terraform, Dockerfile
- 부분 지원: Python, Java
- 미지원: Rust, Go, Swift, Kotlin
- 오탐 억제 4가지: inline 주석, `ignore.yml`, `severity_overrides`, `baseline`

## 보안 원칙

- 기본 동작 완전 오프라인. Semgrep opt-in 시에만 `semgrep.dev`에서 ruleset 다운로드
- 텔레메트리 · LLM API key · 계정 모두 없음
- 룰은 YAML 전용. `safe-regex2`로 ReDoS 재검증
- 플러그인 allowlist + atomic 로딩 (룰 하나 깨지면 플러그인 전체 거부)
- red-team probe opt-in, loopback만, DNS rebinding 방어
- fix는 commit 안 함. dirty tree 거부 + rollback patch 자동 저장

위협 모델 상세: [`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md)

## Export / CI

- SARIF 2.1.0 → GitHub Code Scanning
- JUnit XML · HTML · CSV
- shields.io 엔드포인트 JSON (배지)
- pre-commit hook (CRITICAL 차단)

## 라이선스

MIT. 취약점 제보: [`SECURITY.md`](SECURITY.md)
