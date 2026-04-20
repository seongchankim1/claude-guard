# claude-guard

[English](README.md) · **한국어** · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [Español](README.es.md)

> 실제 공격자 관점으로 AI 생성 코드를 감사하고, 체크한 항목만 수정합니다.

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![mcp](https://img.shields.io/badge/MCP-stdio-purple)](https://modelcontextprotocol.io)
[![rules](https://img.shields.io/badge/rules-155-8a2be2)](docs/rules.md)
[![tests](https://img.shields.io/badge/tests-111%20passing-brightgreen)](tests)

```bash
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

API 키 0개. 기본 네트워크 호출 0회. 아웃바운드 텔레메트리 0.

## 무엇인가

claude-guard는 MCP 서버입니다. AI가 자주 놓치는 보안 실수 — `.env`에 박힌 `NEXT_PUBLIC_*` 시크릿, `prisma.$queryRawUnsafe`, 클라이언트에 노출된 Supabase `service_role`, CORS `"*"` 등 — 를 스캔하고, 등급을 매긴 뒤, **사용자가 체크한 항목만** 함께 고칩니다.

## 데모

```console
$ npx claude-guard scan ./examples/vulnerable-next-app

  F   0/100   Grade F — score 0/100 (11 CRITICAL, 7 HIGH, 2 MEDIUM, 2 LOW)
  scan_id=747d5448  findings=22  duration=76ms  layers=l1,l2
  11 CRITICAL   7 HIGH   2 MEDIUM   2 LOW
  next: claude-guard list
```

`.claude-guard/findings.md`를 열어 고칠 항목에 `[x]`를 체크하고 `claude-guard fix` (또는 MCP `apply_fixes`) 실행. 변경은 `claude-guard/fix-<id>` 브랜치에 스테이징되며, 커밋은 사용자가 합니다.

## 특징

- **155개 룰** — secrets · SQL/NoSQL · XSS · auth · LLM · misconfig · Docker · IaC
- **5개 AST 자동 수정** (`ts-morph`) — 나머지는 모호한 자동 변경 대신 주석 TODO
- **체크박스 승인 수정** — git 브랜치 + 롤백 패치
- **Export** — JSON · Markdown · HTML · SARIF 2.1.0 · JUnit XML · CSV · shields.io 배지
- **4단계 억제** — 인라인 주석, `ignore.yml`, `severity_overrides`, `baseline`
- **옵트인 레드팀** — loopback 전용, DNS-rebinding 방어 + rate limit
- **MCP 네이티브** — 10 tools + 4 resources

## 설치

**MCP 서버로 (권장):**

```bash
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

Claude Desktop은 `claude_desktop_config.json`에 추가:

```json
{ "mcpServers": { "claude-guard": { "command": "npx", "args": ["-y", "claude-guard-mcp"] } } }
```

**CLI로:**

```bash
npx claude-guard scan .           # 현재 디렉토리 스캔 (CRITICAL 발견 시 exit 2)
npx claude-guard fix .            # 스캔 + 안전한 수정 일괄 적용
npx claude-guard report --open    # 자체 포함 HTML 리포트 브라우저로
npx claude-guard sarif . > out.sarif       # GitHub Code Scanning용
npx claude-guard install-hooks    # CRITICAL 차단 pre-commit 훅
```

전체 명령어: `npx claude-guard --help`.

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

## 어떻게 안전을 지키는가

요약:

- 기본 모드는 네트워크 호출 0, LLM 호출 0.
- 룰은 **YAML 전용**. 로드 시점에 JSON Schema + `safe-regex2` (ReDoS 가드) 검증.
- 레드팀 모드는 옵트인, loopback 전용, 문자열 체크와 DNS 재해상도 이중 강제.
- 수정은 대신 커밋하지 않으며 항상 롤백 패치를 남깁니다.

전체 모델: **[`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md)**.

## 룰

| 카테고리 | 개수 |
|---|---|
| secrets | 16 |
| sql | 10 |
| xss | 10 |
| auth | 23 |
| llm | 17 |
| misconfig | 60 |
| docker | 2 |
| iac | 12 |

전체 카탈로그: **[`docs/rules.md`](docs/rules.md)** (`claude-guard docs`로 재생성).

## 비교

| | claude-guard | Semgrep | Gitleaks | Snyk Code | SonarQube |
|---|---|---|---|---|---|
| Claude용 MCP 서버 | ✅ | — | — | — | — |
| AI 특화 룰 | ✅ | 부분 | — | — | — |
| 체크박스 자동 수정 + git 브랜치 | ✅ | — | — | — | — |
| API 키 0 / 기본 네트워크 0 | ✅ | ✅ | ✅ | — | — |
| SARIF 2.1.0 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 룰 수 | 155 | 2000+ | secrets only | 수천 | 수천 |

Semgrep / Sonar / Snyk를 **대체하지 말고 함께** 사용하세요.

## FAQ

**코드를 어디로 보내나요?** 아니요. 네트워크 호출 0, 텔레메트리 0, LLM API 키 불필요.

**룰 파일에서 코드를 실행하나요?** 아니요. YAML 전용. 모든 정규식은 로드 시점에 ReDoS 스크리닝.

**왜 전부 자동이 아닌 체크박스인가요?** 거짓양성에 자동 수정을 적용하면 감지 오류가 기능 회귀로 변합니다. 룰을 신뢰하면 `apply_fixes --mode=all_safe`로 일괄 가능.

**Snyk / Semgrep / Sonar를 대체하나요?** 아니요. 병행 사용. 틈새는 "Claude가 자주 틀리는 150가지, 각각 수정 포함".

더 많은 답변: [`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md).

## 라이선스

MIT — [`LICENSE`](LICENSE) 참조. 취약점 제보: [`SECURITY.md`](SECURITY.md).
