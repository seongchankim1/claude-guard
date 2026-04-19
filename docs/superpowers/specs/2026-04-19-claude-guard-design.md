# claude-guard — 설계 문서

**날짜:** 2026-04-19
**상태:** 설계 확정, 구현 플랜 대기
**런타임:** TypeScript (Node.js 20+)
**배포:** npm 패키지 `claude-guard-mcp`
**라이선스:** MIT

> 작명 주의: `claude-guard`는 Anthropic의 Claude 상표와 혼동될 여지가 있다. 공개 릴리스 직전에 `guard-for-claude`, `claudeguard`, `cguard` 중 하나로 재검토한다. 본 문서는 편의상 `claude-guard`로 기술한다.

---

## 1. 목표와 포지셔닝

**한 줄 정의:** AI 바이브코딩으로 만들어진 코드에 대해 실제 공격자가 쓰는 기법으로 감사하고, 사용자가 체크박스로 고른 항목만 자동 수정해 주는 MCP 서버.

**타겟 유저:** Claude Code / Claude Desktop / MCP 호환 클라이언트를 쓰며 Next.js·Supabase·Firebase·FastAPI 등으로 웹앱을 만드는 개발자.

**바이럴 각도 (README 1st fold에 담을 것):**
- `claude mcp add claude-guard -- npx -y claude-guard-mcp` 한 줄 설치
- API 키 0개, 네트워크 요청 0회, 외부 서비스 의존 0 (기본 모드)
- 60+ 빌트인 체크, 실제 공격자 페이로드 제시, 옵트인 로컬 PoC 실행
- 체크박스 토글로 원하는 취약점만 자동 수정

**비목표:**
- Burp/ZAP 같은 대체 침투테스트 툴 (외부 타겟 공격)
- 런타임 WAF나 프로덕션 게이트키퍼
- 전용 LLM 호출을 요구하는 분석 (호스트 측 Claude가 해석 담당)

---

## 2. 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────┐
│  Claude Code / Claude Desktop / MCP client                  │
└──────────────────────────┬──────────────────────────────────┘
                           │ MCP (stdio)
┌──────────────────────────▼──────────────────────────────────┐
│  claude-guard MCP server (TypeScript)                       │
│                                                             │
│  Tool surface                                               │
│    scan · list_findings · explain · apply_fixes ·           │
│    rollback · redteam_probe · list_checks · init_config     │
│                                                             │
│  Detection engine (3 layers)                                │
│    L1 OSS orchestrator — semgrep, trivy, gitleaks,          │
│                          osv-scanner, npm/pip audit         │
│    L2 LLM-native rules — YAML 패턴 + context_hint           │
│                          (호스트 Claude가 해석)              │
│    L3 Red-team simulator                                    │
│        A: 정적 PoC 출력                                      │
│        B: localhost-only 라이브 프로빙 (옵트인)              │
│                                                             │
│  Plugin system                                              │
│    @claude-guard/core 내장                                   │
│    @claude-guard/iac, @claude-guard/docker 등 플러그인       │
│    커뮤니티 플러그인 규약: YAML 룰만, config.yaml 화이트리스트│
│                                                             │
│  Workflow state (로컬, git-ignored)                          │
│    .claude-guard/                                            │
│      config.yaml                                             │
│      scans/<scan_id>/findings.json                           │
│      findings.md                                             │
│      reports/ (최근 10개)                                    │
│      redteam/<finding_id>.log                                │
│      rollback/<id>.patch (최근 20개)                         │
└──────────────────────────┬──────────────────────────────────┘
                           │ subprocess (optional)
                           ▼
              외부 CLI (semgrep, trivy, gitleaks, ...)
```

**설계 원칙:**
- 오프라인 우선. 네트워크 요청은 redteam B 모드에서만, 그것도 loopback만.
- 투명성. `list_checks`로 모든 활성 룰을 노출한다 — 블랙박스 금지.
- `.claude-guard/`는 자동으로 `.gitignore`에 추가한다. 취약점 데이터가 repo에 유출되면 안 된다.
- L1 외부 CLI는 optional. 없으면 L2만으로도 의미 있는 결과를 낸다.
- claude-guard는 자체 LLM API 키를 요구하지 않는다. 룰의 `context_hint`는 호스트 쪽 Claude가 읽고 해석한다.

---

## 3. MCP 툴 명세

| 툴 | 입력 | 출력 | 부작용 |
|---|---|---|---|
| `scan` | `project_path`, `layers?`, `plugins?` | `{ scan_id, finding_count, duration_ms, layers_run, summary_by_severity }` | `.claude-guard/scans/<scan_id>/findings.json`, `.gitignore` 자동 갱신 |
| `list_findings` | `project_path`, `severity?`, `category?`, `include_fixed?` | `findings.md` 경로 + 렌더된 마크다운 | `.claude-guard/findings.md` 작성 |
| `explain` | `project_path`, `finding_id` | 취약점 원리 · 공격 시나리오 · 수정 가이드 · OWASP/CWE 링크 | 없음 |
| `apply_fixes` | `project_path`, `mode?` (`checked` · `all_safe` · `dry_run`), `force?: boolean` | `{ applied, skipped, failed, diff_path, rollback_id }` | 파일 수정 · `claude-guard/fix-<scan_id>` 브랜치 생성 + git add (커밋 X) · rollback patch 저장. `force`가 false(기본)이고 working tree가 dirty면 `WORKING_TREE_DIRTY`로 거부 |
| `rollback` | `project_path`, `rollback_id` | 복원 결과 | `apply_fixes` 역패치 적용 |
| `redteam_probe` | `project_path`, `target`, `finding_id` | PoC 실행 결과 | loopback HTTP 1회, 로그 저장 |
| `list_checks` | `project_path?`, `verbose?` | 활성 룰 카테고리별 요약 (또는 전체) | 없음 |
| `init_config` | `project_path` | `.claude-guard/config.yaml` 생성 | 설정 파일 생성 |

**공통 에러 모드:**
`PATH_NOT_FOUND`, `TOOL_MISSING` (warning + 폴백), `PLUGIN_UNTRUSTED`, `REDTEAM_BLOCKED` (하드 차단), `SCAN_TIMEOUT` (기본 5분), `FIX_CONFLICT` (파일이 수정 중 변경되면 skip), `WORKING_TREE_DIRTY` (기본 거부, `force` 옵션 필요).

**동시성:** `scan_id`는 UUID, 서브디렉토리로 격리. 동시 스캔은 허용하지만 `apply_fixes`는 working tree 단일 소유자여야 한다.

**제한치:**
- `redteam_probe` — finding_id당 1회, 분당 10회.
- `list_checks` — 기본은 카테고리별 카운트 요약, `verbose: true`일 때만 전체 나열.
- `rollback` 저장은 최근 20개까지, 이후는 가장 오래된 것부터 삭제.

---

## 4. 검출 엔진

### L1 — OSS orchestrator

```
engines/
  semgrep.ts     JSON 파싱, 심각도 매핑 (OSS 규칙셋만)
  trivy.ts       fs 모드 — 의존성, IaC, 컨테이너
  gitleaks.ts    git history 포함 시크릿
  osv.ts         osv-scanner (언어 불문 CVE)
  npm_audit.ts   package-lock.json
  pip_audit.ts   requirements.txt, pyproject.toml
```

MVP에서 의도적으로 **제외**한 것: `eslint-plugin-security` 등 언어별 린터. Semgrep이 동일 룰을 커버하며, 프로젝트의 ESLint 설정과 충돌할 위험이 있다. v1.1에서 사용자 opt-in으로 검토.

각 엔진은 공통 인터페이스:

```ts
interface Engine {
  id: string;
  detect(): Promise<boolean>;                // CLI 설치 여부
  run(path: string, opts: EngineOpts): Promise<Finding[]>;
}
```

모든 엔진 출력은 정규화된 `Finding`으로 매핑된다:

```ts
interface Finding {
  id: string;              // UUID
  rule_id: string;         // CG-SEC-001 또는 semgrep.p/XXX
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  category: string;        // secrets | sql | xss | auth | llm | misconfig | iac | ...
  file: string;
  range: { startLine: number; startCol: number; endLine: number; endCol: number };
  message: string;
  evidence: string;        // 문제 라인 스니펫
  fix_hint?: string;
  fix_strategy?: string;   // 자동 수정에서 사용
  source_engine: string;
  poc_template?: string;   // L3 Mode A에서 렌더
}
```

L1 ↔ L2 결과는 `(file, startLine, category)` 키로 dedup한다 (Semgrep과 claude-guard 내장 룰이 같은 취약점을 중복 보고하지 않도록).

### L2 — LLM-native rules

YAML 기반 정적 룰. 6개 MVP 카테고리, 카테고리당 5~10개, 총 40~60개 목표.

```yaml
# rules/secrets/next-public-secret.yml
id: CG-SEC-001
title: "NEXT_PUBLIC_* 환경변수에 시크릿 이름이 들어있음"
severity: CRITICAL
category: secrets
languages: [javascript, typescript]
patterns:
  - regex: 'NEXT_PUBLIC_[A-Z_]*(SECRET|KEY|TOKEN|PASSWORD|PRIVATE)'
    files: ['.env*', '*.{js,ts,jsx,tsx}']
  - regex: 'process\.env\.NEXT_PUBLIC_[A-Z_]*(SECRET|KEY|TOKEN)'
context_hint: |
  NEXT_PUBLIC_ 접두사 변수는 클라이언트 번들에 포함된다.
  이 이름이 시크릿을 담고 있을 가능성이 크다.
fix_strategy: rename_env_var
poc_template: |
  # 노출 확인
  curl -s <APP_URL> | grep -i '<ENV_NAME>'
```

**MVP 카테고리:**

| ID 접두사 | 카테고리 | 대표 탐지 | 기본 심각도 |
|---|---|---|---|
| CG-SEC | Secrets | NEXT_PUBLIC 시크릿, .env 커밋, service_role 클라이언트 유출, 하드코딩 API 키 | CRITICAL |
| CG-SQL | Injection | 문자열 연결 쿼리, Prisma `$queryRawUnsafe`, 검증 없는 ORM 동적 where | CRITICAL |
| CG-XSS | XSS | `dangerouslySetInnerHTML` 미검증, `v-html`, `innerHTML` 연결 | HIGH |
| CG-AUTH | Auth/session | 서버 액션 인증 누락, JWT 시크릿 하드코딩, 세션 만료 없음, 쿠키 `httpOnly`/`Secure` 누락 | HIGH |
| CG-LLM | AI-specific | Prompt injection 미방어, system prompt 클라이언트 노출, 사용자 입력이 툴 파라미터로 직결, `eval`된 LLM 출력 | HIGH |
| CG-CFG | Misconfig | CORS `*`, CSP 없음, Supabase RLS off, Firebase `allow read: if true` | HIGH |

**룰 로더 안전성:**
- 모든 YAML은 JSON Schema로 검증.
- `safe-regex` 또는 동등 라이브러리로 ReDoS 검사, 타임아웃 100ms 강제.
- 플러그인은 YAML만 제공 가능 (JS 코드 실행 금지) — 공급망 공격 벡터 축소.

### L3 — Red-team simulator

**Mode A — 정적 PoC (기본)**

각 finding의 `poc_template`을 렌더해 마크다운으로 출력한다. 파일 쓰기나 네트워크 호출 없음. 교육·리포팅용.

**Mode B — localhost 라이브 프로빙 (옵트인)**

`redteam_probe(target, finding_id)` 호출 시:

1. `target` URL 파싱. `http`/`https` 외 거부.
2. hostname 화이트리스트 (문자열): `localhost`, `127.0.0.1`, `::1`, `0.0.0.0` 외 거부.
3. DNS lookup 실행, 모든 응답 IP가 loopback인지 재검증 (DNS rebinding 방어).
4. 추가로 RFC1918, link-local (`169.254.0.0/16`), multicast, IPv6 ULA/link-local을 하드 차단 (defense-in-depth).
5. HTTP 클라이언트 설정: 5초 타임아웃, 1MB 응답 제한, redirect 비활성.
6. Per-finding 1회, 분당 10회 rate limit. (프로세스 메모리 기반. MVP 충분.)
7. 모든 요청·응답을 `.claude-guard/redteam/<finding_id>.log`에 감사 기록.

README와 `init_config` 출력에 다음 고지를 포함한다: "이 도구는 사용자가 소유·운영 권한을 가진 코드 감사 전용이다. 타 시스템 공격 금지."

---

## 5. 승인 UX 및 수정 파이프라인

### findings.md 포맷

```markdown
# claude-guard findings — 2026-04-19 (scan_id: 7f3a...)

> 체크박스에 `x` 표시한 항목만 `apply_fixes`로 수정된다.
> 각 항목 HTML 주석의 finding_id는 매칭에 사용되니 수정하지 말 것.

## CRITICAL (3)

- [ ] <!-- finding_id: CG-SEC-001-a3f2 --> **CG-SEC-001** `app/env.ts:12` — NEXT_PUBLIC_OPENAI_KEY 노출
  - 전략: `rename_env_var` → `OPENAI_API_KEY`로 변경, 서버 라우트로 이동
- [ ] <!-- finding_id: CG-SEC-003-b8d1 --> **CG-SEC-003** `lib/supabase.ts:4` — service_role 키 클라이언트 번들 포함
  - 전략: 서버 전용 클라이언트로 분리
- [ ] <!-- finding_id: CG-SQL-002-c4e0 --> **CG-SQL-002** `app/api/users/route.ts:21` — Prisma raw 쿼리 문자열 연결
  - 전략: `$queryRaw` tagged template로 변환

## HIGH (5) / MEDIUM (12) / LOW (8) ...
```

HTML 주석의 `finding_id`가 파싱 키다. 마크다운 구조가 깨져도 매칭이 유지된다.

### apply_fixes 파이프라인

```
1. findings.md 읽고 [x] 라인 + finding_id 파싱
2. findings.json에서 해당 finding 로드
3. git working tree clean 검증 — dirty면 거부 (force 옵션 있음)
4. 각 finding에 대해 fix_strategy 디스패치:
     rename_env_var          .env* + grep된 소스 파일 일괄 리네임
     split_server_only       server 전용 wrapper 파일 생성, import 재배선
     parameterize_query      ts-morph / LibCST AST 변환
     add_rls_migration       supabase/migrations/*.sql 스니펫 추가
     wrap_with_authz_guard   서버 액션 상단에 auth 체크 삽입
     set_cookie_flags        httpOnly, Secure, SameSite=Lax 추가
     suggest_only            자동 수정 불가, 주석 + TODO 삽입
5. rollback patch (unified diff) 저장
6. 파일 쓰기
7. git checkout -b claude-guard/fix-<scan_id> (없으면 생성)
8. git add (스테이징만, 커밋은 사용자가)
9. 요약 반환: applied, skipped, failed, diff_path, rollback_id
```

**핵심 원칙:**
- 모든 수정은 `rollback` 가능해야 한다.
- AST 우선, regex 최후. JS/TS는 ts-morph, Python은 LibCST.
- 자동 수정 불가 시 과감히 `suggest_only` → 잘못된 자동 수정보다 안전하다.
- 커밋은 사용자 몫. 자동 커밋은 pre-commit hook/CI 우회 문제를 만든다.

**MVP 자동 수정 언어 범위:** JS/TS, Python. 나머지 언어는 감지만 하고 `suggest_only` + 수동 패치 가이드를 제공한다. README에 "detects 10 languages, auto-fixes 2"로 솔직히 명시.

---

## 6. 설정, 플러그인, 테스트/배포

### .claude-guard/config.yaml

```yaml
version: 1
layers: [l1, l2]              # l3는 명시해야 활성
engines:
  semgrep: auto               # auto | enabled | disabled
  trivy: auto
  gitleaks: enabled
plugins:
  allowed: []                 # 예: ["@claude-guard/iac", "@myorg/custom"]
severity_threshold: LOW       # 이 미만은 무시
fix:
  dry_run_default: false
  require_clean_tree: true
redteam:
  enabled: false
  allowed_targets: [localhost]
```

### 플러그인 규약

- 플러그인은 YAML 룰만 제공한다. JS 코드 금지. AST 기반 커스텀 fix_strategy가 필요하면 core에 PR을 보내야 한다.
- `config.yaml`의 `plugins.allowed`에 명시된 패키지만 로드된다.
- 신규 플러그인 신뢰 승인은 **`init_config` 실행 시점**에 받는다. `scan` 중에는 `PLUGIN_UNTRUSTED` 에러만 반환하고, 사용자가 `init_config`로 다시 돌아와 승인하는 흐름을 강제한다. (스캔 도중 프롬프트로 끊기는 UX를 피함.)
- 플러그인 매니페스트 파일명: `claude-guard-plugin.yml`. `name`, `version`, `rules` (글롭), `checks.categories`, 선택적 `signature` 필드.
- 모든 룰 YAML은 JSON Schema 검증을 통과해야 하며, regex는 ReDoS 검사·타임아웃이 강제된다.

### 테스트 전략

| 층 | 방법 | 목표 |
|---|---|---|
| 룰셋 | YAML 룰마다 positive/negative fixture | 룰당 최소 2 케이스 |
| 엔진 어댑터 | OSS CLI mock + CI에서 실 CLI 통합 | 80% 라인 커버리지 |
| MCP 툴 | `@modelcontextprotocol/sdk` 테스트 클라이언트 | 툴별 happy + error path |
| Fix 파이프라인 | 샘플 리포지토리 before/after 스냅샷 | 전략별 최소 1개 |
| Redteam 가드 | URL validator fuzz, DNS rebinding 시나리오 | 100% |
| E2E | 의도적 취약점 심은 데모 앱 → scan → apply_fixes → rescan | 전체 사이클 |

### 배포 및 바이럴 계획

**패키지:**
- `claude-guard-mcp` — MCP 서버 엔트리 (`npx -y claude-guard-mcp`)
- `claude-guard` — (선택) 부가 CLI
- `@claude-guard/core` — 룰셋 + 엔진 어댑터
- `@claude-guard/iac`, `@claude-guard/docker` — 플러그인 (v1.1)

**설치 원라이너:**
```bash
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

**리포 구성:**
- `README.md` — 데모 GIF (Next.js 취약점 앱 1분 감사 → 토글 → 수정), "0 keys, 0 network, 0 deps" 배지, 설치 원라이너, 6개 카테고리 설명
- `examples/vulnerable-next-app/` — 의도적 취약점 데모 앱 (데모 영상·E2E용)
- `docs/rules/` — 룰 카탈로그 페이지 (SEO 자산)
- `docs/writing-plugins.md` — 커뮤니티 기여 가이드
- `CONTRIBUTING.md`, `SECURITY.md`, MIT `LICENSE`

**출시 채널:**
HN Show HN, X/Twitter 데모 클립, r/ClaudeAI, r/LocalLLaMA, r/cybersecurity, MCP awesome list PR.

---

## 7. 비목표 / 아직 하지 않을 것

- 외부 URL 공격, 인증된 블랙박스 침투 — 영구 비목표.
- 런타임 WAF, 프로덕션 게이트 — 영구 비목표.
- AST 기반 자동 수정의 JS/TS·Python 외 언어 지원 — v1.1+.
- IaC·Docker·Kubernetes 플러그인 — v1.1+.
- 전용 LLM 호출로 정교한 분석 — v2에서 옵트인 기능으로 검토.
- 서명된 JS 플러그인 — v1.2+.
- VS Code 확장 — v2+.

---

## 8. 공개 전 리스크 리뷰 체크리스트

릴리스 직전에 이 목록을 수동 점검한다:

- [ ] 이름 `claude-guard`가 Anthropic 상표 가이드라인과 어긋나지 않는가, 대안 네이밍 결정
- [ ] redteam URL validator fuzz 테스트 100% 통과
- [ ] 모든 샘플 데이터에서 실제 시크릿이 포함되지 않음
- [ ] `examples/vulnerable-next-app` README에 "일부러 취약함" 경고 명시
- [ ] `SECURITY.md`에 책임 공개 프로세스 명시
- [ ] 라이선스 호환성 재확인 (Semgrep OSS 규칙만 번들)
- [ ] npm 패키지에 민감 정보가 섞여 발행되지 않는지 `.npmignore` 감사

---

## 9. 고정 결정 사항 (초기 열린 질문의 해소본)

- **첫 출시 룰 개수:** 60개. 6개 카테고리 × 평균 10개. README 카피 "60+ checks"와 일치.
- **redteam 로그 보존:** `.claude-guard/redteam/` 전체 `finding_id`당 최근 1개 실행 기록만 유지. 프로젝트 단위로 합계 100개 초과 시 오래된 것부터 정리.
- **다중 프로젝트:** 한 MCP 서버 프로세스가 `project_path` 파라미터로 여러 프로젝트를 처리하는 것을 허용. 상태는 각 프로젝트의 `.claude-guard/` 하위에 격리.
- **CI 모드:** v1은 대화형·로컬 전용. CI 통합(JSON 출력, exit code, GitHub Action)은 v1.1.
- **상표 재검토:** 공개 릴리스 직전 네이밍 확정 (섹션 8 체크리스트 참조).
