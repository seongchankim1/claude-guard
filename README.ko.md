# claude-guard

[English](README.md) · **한국어** · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [Español](README.es.md)

### 바이브 코더를 위한 방패.

AI는 코드를 빠르게 쏟아냅니다. **claude-guard**가 그 사이에 생긴 보안 구멍을, 누가 찾기 전에 먼저 메워줍니다.

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![mcp](https://img.shields.io/badge/MCP-stdio-purple)](https://modelcontextprotocol.io)
[![rules](https://img.shields.io/badge/rules-155-8a2be2)](docs/rules.md)
[![tests](https://img.shields.io/badge/tests-111%20passing-brightgreen)](tests)

```bash
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

API 키도, 기본 네트워크 호출도, 텔레메트리도 없습니다.

## 뭘 해주는가

claude-guard는 당신이 바이브 코딩을 하는 동안 뒤에서 지켜봐 주는 MCP 서버입니다. 리포지토리를 훑으며 공격자들이 가장 좋아할 만한 실수들을 찾아냅니다 — `.env`에 깜빡 남긴 `NEXT_PUBLIC_OPENAI_KEY`, `req.query`에 그대로 꽂은 `$queryRawUnsafe`, 어쩌다 클라이언트 번들에 섞여 들어간 Supabase `service_role` 같은 것들. 점수를 매기고, **체크박스로 고른 항목만** 하나씩 함께 고쳐 나갑니다.

## 데모

```console
$ npx claude-guard scan ./examples/vulnerable-next-app

  F   0/100   Grade F — 22개 이슈 (11 CRITICAL, 7 HIGH, 2 MEDIUM, 2 LOW)
  scan_id=747d5448  duration=76ms  layers=l1,l2
  next: claude-guard list
```

`.claude-guard/findings.md`를 열고 고칠 항목에 `[x]` 체크, 그리고 `claude-guard fix`. 변경은 `claude-guard/fix-<id>` 브랜치에 스테이징만 되어 있어요 — 커밋은 여러분 몫입니다.

## 무엇이 들어있나

- **155개 룰** — secrets, SQL / NoSQL, XSS, 인증, LLM 특화 위험, 설정 실수, Docker, IaC
- **5종의 AST 기반 자동 수정** (`ts-morph`). 나머지는 모호한 자동 변경 대신 주석 TODO로 남깁니다.
- **체크박스로 승인하는 수정** — 전용 브랜치, 롤백 패치까지 세트
- **Export**: JSON, Markdown, HTML, SARIF 2.1.0, JUnit XML, CSV, shields.io 배지
- **노이즈 잠재우는 네 가지 방법**: 인라인 주석, `ignore.yml`, `severity_overrides`, `baseline`
- **옵트인 레드팀 프로브** — loopback 전용, DNS rebinding 방어, 이슈당 rate limit
- **MCP 네이티브** — 10 tools + 4 resources. Claude Code / Desktop / 다른 MCP 클라이언트 전부 호환.

## 설치

**MCP 서버로 (권장):**

```bash
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

Claude Desktop이라면 `claude_desktop_config.json`에:

```json
{ "mcpServers": { "claude-guard": { "command": "npx", "args": ["-y", "claude-guard-mcp"] } } }
```

**CLI로:**

```bash
npx claude-guard scan .              # 현재 디렉토리 스캔 (CRITICAL 있으면 exit 2 — CI에 딱)
npx claude-guard fix .               # 스캔 + 안전한 수정 일괄 적용
npx claude-guard report --open       # 자체 포함 HTML 리포트를 브라우저에서 바로 열기
npx claude-guard sarif . > out.sarif # GitHub Code Scanning용
npx claude-guard install-hooks       # CRITICAL 막는 pre-commit 훅 설치
```

전체 명령어: `npx claude-guard --help`.

## GitHub Code Scanning에 바로 붙이기

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

발견된 이슈는 리포의 **Security** 탭에 뜹니다.

## 어떻게 믿을 수 있나

짧게 말하면:

- 기본 모드는 **네트워크 호출 0, LLM 호출 0.**
- 룰은 **YAML 전용** — 룰 파일에서 코드가 실행될 경로 자체가 없어요. 로드 시점에 JSON Schema + `safe-regex2` (ReDoS 가드)가 모든 정규식을 검사합니다.
- 레드팀 모드는 기본 OFF. 켜도 loopback만, 문자열 체크 **와** DNS 재해상도로 이중 강제.
- 수정은 대신 커밋하지 않아요. 매번 롤백 패치를 남깁니다.

더 자세한 이야기: **[`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md)**.

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

전체 카탈로그: **[`docs/rules.md`](docs/rules.md)** (언제든 `claude-guard docs`로 재생성).

## 다른 도구들과 비교

| | claude-guard | Semgrep | Gitleaks | Snyk Code | SonarQube |
|---|---|---|---|---|---|
| Claude용 MCP 서버 | ✅ | — | — | — | — |
| AI 특화 룰 (NEXT_PUBLIC, LLM SDK 유출, 프롬프트 인젝션) | ✅ | 일부 | — | — | — |
| 체크박스 자동 수정 + git 브랜치 스테이징 | ✅ | — | — | — | — |
| API 키 0 / 기본 네트워크 0 | ✅ | ✅ | ✅ | — | — |
| SARIF 2.1.0 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 룰 수 | 155 | 2000+ | secrets 전용 | 수천 | 수천 |

claude-guard는 Semgrep / Sonar / Snyk를 **대체하지 않습니다. 같이 쓰세요.**

## FAQ

**코드가 밖으로 나가나요?**
아니요. 네트워크 호출 0, 텔레메트리 0, LLM API 키도 필요 없습니다.

**룰 파일에서 코드가 실행되나요?**
아니요. 룰은 YAML이고, 모든 정규식은 로드 시점에 ReDoS 검사를 거칩니다.

**왜 전부 자동이 아니라 체크박스인가요?**
거짓 양성에 자동 수정을 걸면 감지 오류가 기능 회귀로 바뀝니다. 룰셋을 신뢰한다면 `apply_fixes --mode=all_safe`로 한 방에 적용할 수도 있어요.

**Snyk / Semgrep / Sonar를 대체하나요?**
아니요 — 같이 쓰는 도구입니다. 틈새는 "Claude가 자주 틀리는 150가지, 각각에 해결책까지 딸려 있음".

더 많은 답변: [`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md).

## 라이선스

MIT — [`LICENSE`](LICENSE). 취약점 제보: [`SECURITY.md`](SECURITY.md).
