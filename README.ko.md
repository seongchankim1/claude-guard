# claude-guard

[English](README.md) · **한국어** · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [Español](README.es.md)

**실제 공격자 관점으로 AI 생성 코드를 감사하고, 사용자가 체크한 항목만 수정하는 MCP 서버.**

![license](https://img.shields.io/badge/license-MIT-blue)
![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![mcp](https://img.shields.io/badge/MCP-stdio-purple)
![rules](https://img.shields.io/badge/rules-155-8a2be2)
![tests](https://img.shields.io/badge/tests-111%20passing-brightgreen)

```
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

API 키 0개. 기본 네트워크 호출 0회. 아웃바운드 텔레메트리 0.

---

## 목차

- [왜 claude-guard인가](#왜-claude-guard인가)
- [코드를 안전하게 지키는 방법](#코드를-안전하게-지키는-방법)
  - [1. 3-레이어 탐지](#1-3-레이어-탐지)
  - [2. 스코어카드와 등급](#2-스코어카드와-등급)
  - [3. 체크박스 승인 수정](#3-체크박스-승인-수정)
  - [4. 4단계 억제 시스템](#4-4단계-억제-시스템)
- [claude-guard 자체의 보안](#claude-guard-자체의-보안)
  - [프라이버시와 데이터 흐름](#프라이버시와-데이터-흐름)
  - [플러그인 안전](#플러그인-안전)
  - [레드팀 모드 가드레일](#레드팀-모드-가드레일)
  - [정규식 안전 (ReDoS)](#정규식-안전-redos)
  - [Git 안전](#git-안전)
- [설치](#설치)
- [데모](#데모)
- [일상 워크플로](#일상-워크플로)
- [룰 카탈로그](#룰-카탈로그)
- [자동 수정 전략](#자동-수정-전략)
- [CI 통합](#ci-통합)
- [설정](#설정)
- [다른 도구들과의 비교](#다른-도구들과의-비교)
- [자주 묻는 질문](#자주-묻는-질문)
- [비목표](#비목표)
- [라이선스](#라이선스)

---

## 왜 claude-guard인가

Claude나 다른 모델로 바이브코딩을 하면 많은 코드를 빠르게 만들 수 있고, 그만큼 같은 보안 실수도 빠르게 만들게 됩니다. `.env`에 박힌 `NEXT_PUBLIC_OPENAI_API_KEY`, `req.query`를 그대로 꽂은 `prisma.$queryRawUnsafe`, 클라이언트 컴포넌트로 임포트된 Supabase `service_role`, AI 출력에 적용된 `dangerouslySetInnerHTML`, credentials 활성화된 CORS `"*"`, 서명 검증 없는 웹훅 핸들러 — 매주 반복되는 스무 가지 실수입니다.

claude-guard는 Claude Code, Claude Desktop, 또는 MCP 호환 클라이언트에서 에이전트가 공격자 관점으로 이런 실수를 찾아낸 뒤, 사용자와 함께 하나씩 검토하며 고칠 수 있도록 도와주는 작은 MCP 서버입니다.

---

## 코드를 안전하게 지키는 방법

보안 스토리는 네 가지 아이디어를 쌓아 올린 것입니다. 각각은 단순하지만 합쳐지면 **탐지 → 등급 → 수정 → 억제** 전 과정을 사람이 언제든 감사할 수 있는 형태로 커버합니다.

### 1. 3-레이어 탐지

```
┌─────────────────────────────────────────────────────────────┐
│  L1  OSS 엔진 (선택, 자동 감지)                              │
│      semgrep · gitleaks · osv-scanner · npm/pip audit       │
├─────────────────────────────────────────────────────────────┤
│  L2  155개 YAML 빌트인 룰                                   │
│      secrets · sql · xss · auth · llm · misconfig · docker · iac │
├─────────────────────────────────────────────────────────────┤
│  L3  레드팀 시뮬레이터 (옵트인)                              │
│      정적 PoC 페이로드 + loopback 전용 라이브 프로브         │
└─────────────────────────────────────────────────────────────┘
```

- **L1**은 외부 OSS 도구가 설치되어 있으면 오케스트레이션합니다. Semgrep의 2000+ 룰셋, Gitleaks의 git 히스토리 시크릿 스캔, OSV 의존성 CVE. 모두 **선택사항**이며 L2만으로도 동작합니다.
- **L2**는 claude-guard 자체 룰 카탈로그입니다. AI 생성 코드가 자주 틀리는 패턴에 집중한 YAML 정규식. 모든 룰이 positive + negative 픽스처와 함께 배포되어, 테스트 스위트가 **bad 케이스에서는 룰이 트리거되고 good 케이스에서는 조용한지**를 항상 검증합니다.
- **L3**는 옵트인이고 기본 OFF입니다. `redteam_probe`를 실행하면 **loopback URL에 단 1회** HTTP GET을 보내 공격 경로를 시연합니다. 외부 타겟은 하드 차단됩니다 ([레드팀 가드레일](#레드팀-모드-가드레일) 참조).

어떤 엔진이 탐지했든 결과는 정규화된 `Finding` (rule_id, severity, file, line, evidence, fix_strategy)로 통일되고, `(file, line, rule_id)` 키로 dedup되어 Semgrep과 L2가 동일 이슈를 중복 보고하지 않습니다.

### 2. 스코어카드와 등급

모든 스캔은 0–100 점수와 A+…F 등급을 산출합니다:

| 심각도 | 감점 | 심각도별 상한 |
|---|---|---|
| CRITICAL | -20 | -80 |
| HIGH | -8 | -40 |
| MEDIUM | -3 | -20 |
| LOW | -1 | -10 |

등급은 `.claude-guard/findings.md` 최상단에 렌더링되고, MCP 툴 (`score`), CLI 명령 (`claude-guard score`), 그리고 shields.io 엔드포인트 JSON (`claude-guard badge`)으로도 노출됩니다. 모든 스캔은 `.claude-guard/history.json`에 한 줄을 append해서, `claude-guard trend`로 시간별 추이를 볼 수 있습니다.

### 3. 체크박스 승인 수정

스캔 후 claude-guard는 마크다운 체크리스트를 씁니다:

```markdown
# claude-guard findings — scan_id: 747d5448-…

> Security scorecard: Grade F — score 0/100 (11 CRITICAL, 7 HIGH, 2 MEDIUM, 2 LOW)

## CRITICAL (11)
- [ ] <!-- finding_id: … --> **CG-SQL-002** `app/api/users/route.ts:7` — Prisma $queryRawUnsafe
  - strategy: parameterize_query
- [ ] <!-- finding_id: … --> **CG-SEC-001** `.env:1` — NEXT_PUBLIC_OPENAI_KEY 시크릿 의심
  - strategy: rename_env_var
- [ ] <!-- finding_id: … --> **CG-SEC-003** `lib/supabase.ts:5` — service_role 클라이언트 노출
  - strategy: split_server_only
...
```

사용자가 고치고 싶은 항목에 `[x]`를 토글하면, `apply_fixes`가:

1. Working tree가 dirty면 `force=true` 없이는 건드리지 않습니다.
2. `claude-guard/fix-<scan_id>` 브랜치를 생성합니다.
3. 각 finding을 **fix strategy**로 디스패치합니다. 5개는 `ts-morph` AST 기반, 나머지는 `suggest_only` (부정확한 자동 변경 대신 인라인 `// claude-guard: ...` 주석 삽입).
4. 변경사항을 스테이징 (`git add -A`)만 하고 **커밋은 하지 않습니다**. 커밋 메시지와 의사결정은 사용자 몫입니다.
5. `.claude-guard/rollback/<scan_id>.patch`에 롤백 패치를 저장합니다. `claude-guard rollback <scan_id>`로 되돌릴 수 있습니다.

현재 제공되는 AST 재작성: `rename_env_var`, `set_cookie_flags`, `split_server_only`, `parameterize_query`, `wrap_with_authz_guard`. 그 외 모든 것은 명확히 표시된 TODO 주석으로 처리됩니다. **원칙: 모호한 자동 수정보다 명확히 표시된 수동 TODO가 낫습니다.**

### 4. 4단계 억제 시스템

거짓양성은 발생합니다. claude-guard는 네 가지 노브를 제공하며, 전부 텍스트 기반에 diff 가능합니다:

| 위치 | 범위 | 사용 시점 |
|---|---|---|
| `// claude-guard-disable-next-line CG-XXX-NNN` | 한 줄 | 특정 위치의 특정 finding이 거짓양성일 때 |
| `.claude-guard/ignore.yml` (`claude-guard suppress <id>`) | rule_id + file + line으로 고정 | 커밋된 파일에 `reason:`과 함께 남기고 싶을 때 |
| `config.yaml` `severity_overrides: { CG-CFG-005: LOW }` | 룰 전체, 프로젝트 단위 | 팀이 기본 심각도에 동의하지 않을 때 |
| `claude-guard baseline` | 현재 존재하는 모든 것 | 이미 노이즈가 있는 리포지토리에 도입하고, 이후 스캔은 **새** finding만 보고 |

모든 레이어가 리포지토리 내 평문입니다. 숨겨진 상태 DB 없음.

---

## claude-guard 자체의 보안

방어 도구 자체가 공급망 공격 타깃이 되기 쉽습니다. claude-guard는 손상된 룰 패키지, 프롬프트 인젝션된 스캔, 악성 입력 URL조차도 감사 행위를 사고로 전환할 수 없도록 설계되었습니다.

### 프라이버시와 데이터 흐름

- **기본 네트워크 호출 0회.** 기본 `layers: [l1, l2]` 설정은 100% 로컬입니다. L1 어댑터는 이미 설치된 도구(Semgrep, Gitleaks)에만 subprocess로 접근하며, 그 도구들 역시 로컬 실행입니다.
- **LLM API 키 불필요.** claude-guard는 어떤 모델도 호출하지 않습니다. "LLM-native 룰"은 정규식 + YAML이고, 문맥 해석은 MCP 클라이언트의 Claude가 담당합니다.
- **텔레메트리 없음.** 분석 전송 없음. `grep -R 'https://' src/`로 직접 확인 가능 — 모든 URL은 문서 링크이거나 loopback입니다.
- **Findings는 로컬에 머뭅니다.** 첫 스캔 시 `.claude-guard/`가 자동으로 `.gitignore`에 추가되어, findings / 롤백 패치 / 레드팀 로그가 원격으로 유출되지 않습니다.

### 플러그인 안전

룰 카탈로그는 커뮤니티 기여를 받되 **공급망 공격 벡터가 되지 않도록** 설계되었습니다:

- 플러그인은 **YAML만** 허용. 임포트 시점이든 룰 평가 시점이든 JavaScript를 로드하지 않습니다.
- 플러그인은 **화이트리스트 방식**입니다. `.claude-guard/config.yaml`의 `plugins.allowed`에 명시된 패키지만 로드되고, 나머지는 `PLUGIN_UNTRUSTED` 경고와 함께 무시됩니다.
- 플러그인 룰도 빌트인 룰과 동일한 **JSON Schema + ReDoS 검증**을 거칩니다. 잘못된 패턴 하나가 전체 룰 패키지를 거부시키는 명확한 에러로 이어집니다 (부분 로드 없음).
- 커스텀 AST fix strategy가 필요한 플러그인은 그것을 정의할 수 없습니다. 해당 로직은 `src/fix/`에 존재하며 core PR로만 추가 가능합니다. 의도적 제약입니다 — 플러그인 설치가 임의 코드를 실행할 수 없다는 것을 가장 단순하게 증명하는 방법입니다.

### 레드팀 모드 가드레일

`redteam_probe`는 옵트인이고 기본 OFF입니다. 실행 시 **소켓을 열기 전에** 네 번 검증합니다:

1. **프로토콜 화이트리스트** — `http:`, `https:`만. `file://`, `gopher://`, `ftp://` 거부.
2. **호스트네임 화이트리스트 (문자열)** — `localhost`, `127.0.0.1`, `::1`, `0.0.0.0`만. 그 외는 `HOSTNAME` 거부.
3. **DNS 재해상도** — 호스트네임을 `dns.lookup({ all: true })`으로 resolve하고, 반환된 **모든** 주소가 loopback IP여야 합니다. 공개 IP로 resolve되는 DNS rebinding 레코드는 `DNS_REBIND`로 거부.
4. **Rate limit** — `finding_id`당 1회, 프로세스당 분당 10회. 인메모리 강제. 프롬프트 인젝션된 스캔에서 폭주 요청이 증폭되지 않습니다.

추가로: redirect 따라가지 않음, 5초 타임아웃, 1MB 응답 상한, 모든 요청+응답이 `.claude-guard/redteam/<finding_id>.log`에 감사 기록.

### 정규식 안전 (ReDoS)

모든 룰 정규식은 로드 시점에 검증됩니다:

- 패턴이 `RegExp` (`new RegExp(src)`)로 컴파일되어야 합니다.
- 패턴이 [`safe-regex2`](https://github.com/davisjam/safe-regex)를 통과해야 합니다. 최악의 경우 백트래킹이 super-linear인 패턴을 거부하는 정적 분석입니다.

안전하지 않은 패턴 하나가 **전체 룰 파일**을 거부합니다. 조용한 부분 로딩 없음. 악의적 기여가 조작된 입력에서 스캐너를 멈추는 패턴을 넣을 수 없습니다.

### Git 안전

수정은 "마법처럼" 일어나지 않습니다:

- `apply_fixes`는 `force=true`를 명시하지 않으면 dirty working tree에 손대지 않습니다.
- 수정은 별도의 `claude-guard/fix-<scan_id>` 브랜치에서 일어나고, 현재 브랜치에는 영향 없습니다.
- 변경사항은 스테이징만 (`git add -A`)하고 **커밋하지 않습니다**. 커밋 메시지와 의사결정은 사용자가 소유합니다.
- 모든 수정 배치는 `git apply --reverse`로 재적용 가능한 unified-diff 롤백 패치를 작성합니다 (`claude-guard rollback <id>`가 정확히 그 동작).
- `claude-guard install-hooks`로 설치되는 pre-commit 훅은 CRITICAL finding을 유입시키는 커밋을 차단합니다. Idempotent하며 기존 pre-commit 훅을 체이닝으로 보존합니다.

---

## 설치

### MCP 서버로 (권장)

```bash
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

Claude Desktop은 `claude_desktop_config.json`에 추가:

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

### 독립 CLI로

```bash
npx claude-guard scan               # 현재 디렉토리 스캔
npx claude-guard fix                # 스캔 + 안전한 수정 일괄 적용
npx claude-guard score              # 최신 스캔 등급
npx claude-guard badge              # shields.io 엔드포인트 JSON
npx claude-guard sarif              # SARIF 2.1.0
npx claude-guard junit              # JUnit XML
npx claude-guard csv                # 스프레드시트용 CSV
npx claude-guard report --open      # 자체 포함된 HTML 리포트, 브라우저에서 열기
npx claude-guard watch              # 파일 저장 시마다 실시간 스코어카드
npx claude-guard rules              # 활성 룰 카탈로그 (요약)
npx claude-guard docs                # 전체 룰 카탈로그를 마크다운으로
npx claude-guard validate-rule f.yml  # 단일 YAML 룰 검증
npx claude-guard init                # 스택 감지, 스마트 config.yaml 생성
npx claude-guard baseline           # 현재 findings를 baseline으로 스냅샷
npx claude-guard diff-scans a b     # 두 스캔 간 변화
npx claude-guard install-hooks      # CRITICAL 차단 pre-commit 훅 설치
```

`scan`은 clean일 때 `0`, CRITICAL 발견 시 `2`로 종료 — CI 게이팅에 유용.

---

## 데모

이 리포지토리의 의도적으로 취약한 Next.js 데모 앱에 대해 실행:

```bash
$ npx claude-guard scan ./examples/vulnerable-next-app

  F     0/100   Grade F — score 0/100 (11 CRITICAL, 7 HIGH, 2 MEDIUM, 2 LOW)
  scan_id=747d5448  findings=22  duration=76ms  layers=l1,l2
  11 CRITICAL   7 HIGH   2 MEDIUM   2 LOW
  next: claude-guard list   # 수정할 항목에 [x] 체크
```

무엇이 발견됐고 어떤 fix strategy를 쓸지 확인:

```bash
$ npx claude-guard list ./examples/vulnerable-next-app | head -20
# claude-guard findings — scan_id: 747d5448-…

> Security scorecard: Grade F — score 0/100 (11 CRITICAL, 7 HIGH, 2 MEDIUM, 2 LOW)

## CRITICAL (11)
- [ ] CG-SQL-002 `app/api/users/route.ts:7` — Prisma $queryRawUnsafe
    strategy: parameterize_query
- [ ] CG-SEC-001 `.env.example:1` — NEXT_PUBLIC_OPENAI_API_KEY 시크릿 의심
    strategy: rename_env_var
- [ ] CG-SEC-003 `lib/supabase.ts:5` — service_role 클라이언트 노출
    strategy: split_server_only
- [ ] CG-CFG-018 `app/api/chat/route.ts:…` — 요청 입력으로 shell exec
    strategy: suggest_only
...
```

고칠 finding에 `[x]`를 토글하고 `findings.md`를 저장한 뒤:

```
> scan 747d5448-…의 수정을 적용해줘 (mode: checked)
  applied:   CG-SEC-001 · CG-SEC-003 · CG-AUTH-002 · CG-SQL-002
  suggested: CG-CFG-018 · CG-CFG-012 · CG-AUTH-001
  branch:    claude-guard/fix-747d5448
  rollback:  .claude-guard/rollback/747d5448-….patch
```

스테이징된 diff를 검토하고 커밋 (또는 `claude-guard rollback 747d5448`로 취소).

---

## 일상 워크플로

Claude Code / Desktop 내부에서 평문으로:

```
> claude-guard로 /path/to/my/project를 스캔해줘.
> 등급 얼마야?
> 이 리포에 대해 CG-SEC-003을 설명해줘.
> findings.md 열어줘 — 고칠 항목 토글할게.
> scan <scan_id>의 수정을 적용해줘.
> 스테이징된 diff 보여줘, 내가 커밋할게.
```

MCP 클라이언트 외부에서는 CLI가 같은 작업을 합니다:

```bash
claude-guard scan .
claude-guard list .         # .claude-guard/findings.md 생성
# (에디터에서 [x] 토글, 저장)
claude-guard fix .          # 또는 MCP apply_fixes
```

---

## 룰 카탈로그

**155개 룰**, 8개 카테고리. 각각 `fixtures/rules/<id>/` 아래에 positive + negative 테스트 픽스처가 커밋되어 있습니다. 룰을 추가한다는 것은 픽스처를 추가한다는 뜻입니다.

| 카테고리 | 개수 | 대표 룰 |
|---|---|---|
| `secrets` | 16 | `NEXT_PUBLIC_*` 시크릿 이름, OpenAI / Anthropic / AWS / Google / Stripe / GitHub PAT 리터럴 키, private-key PEM, `.env` 커밋, Supabase `service_role` 클라이언트 노출, GCP SA JSON, `github_pat_*`, 토큰 박힌 kubeconfig, 소스 내 JWT, 인라인 `user:password`가 있는 Mongo URI, 시크릿 노출 `next.config.js` |
| `sql` | 10 | SQL 문자열 concat, Prisma `$queryRawUnsafe`, Knex `.raw()`, Python f-string / `.format()` 쿼리, MongoDB `$where`, SQLAlchemy `text()` + f-string, Django `.raw()` + f-string, Sequelize 템플릿 리터럴, TypeORM `.query()` 템플릿, Drizzle `sql.raw(var)` |
| `xss` | 10 | React `dangerouslySetInnerHTML` 동적, Vue `v-html`, Svelte `{@html}`, `innerHTML =`, `href="javascript:…"`, `target="_blank"` noopener 누락, 템플릿 리터럴에 `eval`, `window.open(var)`, JSX `href={expr}` 스킴 가드 없음, marked/markdown-it `html: true` |
| `auth` | 23 | JWT 시크릿 하드코딩 / `alg: none` / `decode`로 검증, 쿠키 플래그 누락, 낮은 bcrypt rounds, MD5/SHA1 비밀번호, `Math.random` 토큰, OAuth `state` 누락, localStorage 세션, 장기 쿠키, `req.body.role` mass-assign, 상태 변경 루트의 CSRF 누락, timing-unsafe 비교, 비밀번호 길이 < 8, 이메일 열거, URL 쿼리 비밀번호, 리셋 토큰 응답 노출, basicAuth 리터럴 사용자, Next.js middleware bypass, WebAuthn `requireUserVerification=false`, `connect.sid` 쿠키 이름 |
| `llm` | 17 | 시스템 프롬프트에 사용자 입력, LLM 출력에 `eval`, 클라이언트 Anthropic/OpenAI SDK + 노출 키, 도구 파라미터를 shell/FS로, LLM 출력을 raw HTML로 렌더, 클라이언트 노출 파일의 시스템 프롬프트, `NEXT_PUBLIC_*` 키로 벡터 DB SDK, 프롬프트에 시크릿 삽입, body에 `apiKey` fetch, 요청으로 프롬프트 템플릿 경로, LLM 입력으로 에이전트 툴 shell out, abort 없는 `stream:true`, system role에 RAG 문서, `"use client"`에서 LLM SDK 임포트, 허용적 툴 스키마, LLM 출력 `dangerouslySetInnerHTML` |
| `misconfig` | 60 | CORS `"*"`, Supabase RLS off, Firebase `if true`, open redirect, `helmet` 없는 Express, auth 없는 Next.js Server Action, 공개 S3 ACL, 요청 입력 SSRF, 클라우드 메타데이터 IP, 사용자 iframe `src`, CSP 누락, path traversal, Django `DEBUG=True`, 요청으로 shell exec, Python `yaml.load`/`pickle.loads`, XXE XML 파서, `rejectUnauthorized=false`, `Mongoose.find(req.query)`, 서명 없는 webhook, rate limit 없는 auth 루트, GraphQL introspection / cost guard, Redis no-auth, stack trace 노출, auth 없는 `/admin`, CRLF `setHeader`, `verifyClient=true`, `Math.random` 임시 파일, 원격 ML 모델 load, Host 헤더 신뢰, CORS credentials + origin reflection, zip-slip, `RegExp(req.*)`, `req.body` 로그, CSP `unsafe-inline`, `shell=True`, body-parser 상한 없음, auth 파일에 `@ts-ignore`, `constructEvent` 없는 Stripe webhook, `public/`의 시크릿, preflight `Allow-Headers` reflection, `debugger` / `--inspect`, 타임아웃 없는 fetch, Next.js `remotePatterns: "*"`, multer limits 없음, 쿠키 `secure: false`, SQLite `:memory:`, tRPC `publicProcedure.mutation(…)`, TLS 비활성 axios, HSTS max-age < 1년, `robots.txt Disallow: /`, `node-serialize` 임포트, lodash 템플릿 on `req.body`, Electron `nodeIntegration:true`, Next.js `rewrites()` open proxy |
| `docker` | 2 | Dockerfile `FROM :latest`, `--no-install-recommends` 없는 `apt-get install` |
| `iac` | 12 | Terraform SG `0.0.0.0/0`, 공개 S3 ACL, 비암호화 storage, RDS `publicly_accessible=true`, K8s `hostPath`, `privileged: true`, 평문 `stringData` Secret, GH Actions `${{ github.event.* }}` `run:`, 넓은 권한, `uses:@main`, `permissions: write-all`, IAM `Action/Resource: "*"` |

`claude-guard docs`로 이유/근거까지 포함된 전체 마크다운 카탈로그를 재생성할 수 있습니다.

---

## 자동 수정 전략

| 전략 | 무엇을 재작성 | 어떻게 |
|---|---|---|
| `rename_env_var` | `.env*`의 `NEXT_PUBLIC_*` 시크릿 변수와 **모든 참조 파일** | 일괄 리네임 |
| `set_cookie_flags` | `httpOnly` / `secure` / `sameSite` 누락된 `cookies().set(...)` | `ts-morph` AST — 기존 옵션 객체에 병합하거나 주입 |
| `split_server_only` | Supabase `service_role` 사용 파일 | `import "server-only";` 프리펜드 — Next.js가 클라이언트 번들로 내보내지 않도록 |
| `parameterize_query` | Prisma `$queryRawUnsafe` / `$executeRawUnsafe` | `ts-morph` — tagged template `$queryRaw\`...\``로 재작성 |
| `wrap_with_authz_guard` | `"use server"` 파일의 export된 async 함수 | `auth()` 임포트 주입 + `await auth()` + `if (!session) throw` 가드 |
| `suggest_only` | 그 외 모든 것 | 인라인 `// claude-guard: …` 주석 삽입 |

---

## CI 통합

SARIF를 리포 Security 탭에 업로드하는 GitHub Actions 워크플로:

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
      - run: npx -y claude-guard-mcp --version
      - run: npx claude-guard scan . || true
      - run: npx claude-guard sarif . > claude-guard.sarif
      - uses: github/codeql-action/upload-sarif@v3
        with: { sarif_file: claude-guard.sarif, category: claude-guard }
```

PR 게이트 전용이라면 diff 모드로 변경된 파일만:

```yaml
- run: npx claude-guard scan . --diff=${{ github.base_ref }} --severity=CRITICAL
  # CRITICAL 발견 시 exit 2로 job fail
```

---

## 설정

`.claude-guard/config.yaml` (`claude-guard init`이 생성):

```yaml
version: 1
layers: [l1, l2]                    # l3는 redteam으로 옵트인
engines:
  semgrep: auto                     # auto | enabled | disabled
  trivy: auto
  gitleaks: auto
plugins:
  allowed: []                       # 커뮤니티 룰 패키지 화이트리스트
severity_threshold: LOW             # 이 미만은 억제
severity_overrides:                 # 포크 없이 룰별 승격/강등
  CG-CFG-005: LOW
fix:
  require_clean_tree: true          # force 없이는 dirty tree 수정 거부
  dry_run_default: false
redteam:
  enabled: false                    # loopback 전용 PoC 프로브, 기본 OFF
  allowed_targets: [localhost]
```

`claude-guard init`은 Next.js / Django / Supabase / Prisma / Dockerfile / Terraform / K8s를 감지해 사용하지 않는 스택의 룰을 자동 강등합니다.

---

## 다른 도구들과의 비교

| | claude-guard | Semgrep | Gitleaks | Snyk Code | SonarQube |
|---|---|---|---|---|---|
| Claude Code / Desktop MCP 서버 | ✅ | — | — | — | — |
| AI 특화 룰 (NEXT_PUBLIC, LLM SDK 유출, prompt injection, RAG) | ✅ | 부분 | — | — | — |
| 체크박스 승인 + git 브랜치 스테이징 자동 수정 | ✅ | — | — | — | — |
| API 키 0, 기본 네트워크 0 | ✅ | ✅ (로컬) | ✅ | — | — |
| SARIF 2.1.0 출력 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 보안 등급 / 스코어카드 | ✅ | — | — | 부분 | ✅ |
| 옵트인 loopback PoC 프로브 | ✅ | — | — | — | — |
| 룰 카탈로그 크기 | 155 | 2000+ | secrets only | 수천 | 수천 |

claude-guard는 의도적으로 **작고 의견이 강한** 도구입니다. 타깃은 AI 생성 코드를 출시하면서 에이전트 내부에서 빠르고 실행 가능한 fix 중심 피드백이 필요한 사람. **Semgrep / Sonar / Snyk를 대체하는 게 아니라 함께 사용하세요.**

---

## 자주 묻는 질문

**claude-guard가 코드를 어디로 전송하나요?**
아니요. 기본 모드는 네트워크 호출 0, 텔레메트리 0, 그리고 LLM을 대신 호출하지도 않습니다. "LLM-native 룰"은 MCP 클라이언트의 Claude가 해석합니다. claude-guard 자체는 정규식 + YAML입니다.

**룰 파일에서 코드를 실행하나요?**
아니요. 룰은 YAML이고, 룰 파일에서 JavaScript로 가는 경로가 없습니다. 모든 정규식은 로드 시점에 `safe-regex2` + JSON Schema로 스크리닝됩니다.

**레드팀 모드는 정확히 무엇을 하나요?**
`redteam_probe`를 **실행할 때만** loopback URL에 HTTP GET 1회를 보냅니다. Loopback은 문자열 체크 **와** DNS 재해상도로 강제되며, 공개 IP로 resolve되는 rebinding 레코드는 거부됩니다. [레드팀 가드레일](#레드팀-모드-가드레일) 참조.

**왜 전부 자동 수정 안 하고 체크박스 UX인가요?**
잘못 식별된 SQL injection을 자동 수정하면 거짓양성이 기능 회귀로 바뀝니다. `[x]` 체크는 몇 초의 키스트로크를 신뢰와 교환합니다 — 룰셋을 신뢰하면 `apply_fixes --mode=all_safe`로 일괄 적용도 가능합니다.

**Snyk / Semgrep / Sonar를 대체하나요?**
아니요. 함께 사용하세요. claude-guard의 틈새는 "Claude로 짠 코드가 자주 틀리는 150가지, 각각에 공격자 관점 근거와 수정까지 제공".

**우리 코드베이스에서 시끄러운 룰은 어떻게 무시하나요?**
네 가지 옵션, 억제의 *수명*에 맞춰 선택:
- 한 줄, 영구: 인라인 `// claude-guard-disable-next-line CG-XXX-NNN`
- 한 finding, 이유와 함께 커밋: `claude-guard suppress <finding_id> --reason="…"`
- 룰 전체, 프로젝트 단위: `config.yaml`의 `severity_overrides`로 임계치 아래로 강등
- 지금 존재하는 모든 것: `claude-guard baseline` — 이후 스캔은 새 finding만 보고

**커스텀 룰을 작성할 수 있나요?**
네. `rules/<category>/CG-XXX-NNN.yml`에 YAML 파일을 놓고 `bad/`, `good/` 픽스처를 추가하면 픽스처 회귀 테스트가 자동으로 bad에서 fire, good에서 silent임을 강제합니다. 커뮤니티 패키지는 npm에 `claude-guard-plugin-*`으로 배포하고, `claude-guard-plugin.yml` 매니페스트를 포함해, `plugins.allowed`에 등록하세요. [`examples/claude-guard-plugin-example/`](examples/claude-guard-plugin-example/) 참조.

**가장 큰 한계는?**
정규식 기반 탐지는 타입이나 데이터 흐름을 보지 못하므로, 일부 룰(path traversal, SSRF, authz 커버리지)은 본질적으로 휴리스틱입니다. claude-guard는 "알려진 AI 코딩 실수에 대한 고-recall 시그널"에서 강하고, "기업 전반 저-거짓양성 커버리지"에서는 Semgrep류가 더 나은 선택입니다.

---

## 비목표

- 외부 서비스나 제3자 API 공격.
- 런타임 WAF 또는 프로덕션 게이팅.
- Burp / ZAP 같은 범용 침투 테스트 도구 경쟁.
- 기존 SAST / SCA 도구 대체.

---

## 라이선스

MIT. `LICENSE` 참조.

책임 있는 사용 정책과 비공개 제보 절차는 `SECURITY.md` 참조.
