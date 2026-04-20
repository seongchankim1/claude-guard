# claude-guard

[English](README.md) · [한국어](README.ko.md) · **日本語** · [简体中文](README.zh-CN.md) · [Español](README.es.md)

> 実在する攻撃者の視点で AI 生成コードを監査し、チェックした項目だけを修正します。

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![mcp](https://img.shields.io/badge/MCP-stdio-purple)](https://modelcontextprotocol.io)
[![rules](https://img.shields.io/badge/rules-155-8a2be2)](docs/rules.md)
[![tests](https://img.shields.io/badge/tests-111%20passing-brightgreen)](tests)

```bash
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

API キー 0。デフォルトでネットワーク呼び出し 0。アウトバウンドテレメトリ 0。

## これは何か

claude-guard は MCP サーバーです。AI 生成コードが最もよく持ち込むセキュリティミス(`.env` の `NEXT_PUBLIC_*` シークレット、`prisma.$queryRawUnsafe`、クライアントに漏れた Supabase `service_role`、CORS `"*"` など)をスキャンし、採点し、**チェックを入れた項目だけ** を一緒に直します。

## デモ

```console
$ npx claude-guard scan ./examples/vulnerable-next-app

  F   0/100   Grade F — score 0/100 (11 CRITICAL, 7 HIGH, 2 MEDIUM, 2 LOW)
  scan_id=747d5448  findings=22  duration=76ms  layers=l1,l2
  11 CRITICAL   7 HIGH   2 MEDIUM   2 LOW
  next: claude-guard list
```

`.claude-guard/findings.md` を開いて修正したい項目に `[x]` を入れ、`claude-guard fix`(または MCP の `apply_fixes`)。変更は `claude-guard/fix-<id>` ブランチに staged、コミットは利用者の責任。

## 特徴

- **155 ルール** — secrets · SQL/NoSQL · XSS · auth · LLM · misconfig · Docker · IaC
- **5 種の AST 自動修正**(`ts-morph`)。それ以外は TODO アノテーションに落ちる(黙って書き換えない)
- **チェックボックス承認式の修正** — git ブランチ + ロールバックパッチ
- **エクスポート** — JSON · Markdown · HTML · SARIF 2.1.0 · JUnit XML · CSV · shields.io バッジ
- **4 層の抑制** — インラインコメント / `ignore.yml` / `severity_overrides` / `baseline`
- **オプトインのレッドチーム** — loopback 限定、DNS rebinding 防御 + レート制限
- **MCP ネイティブ** — 10 tools + 4 resources

## インストール

**MCP サーバーとして(推奨):**

```bash
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

Claude Desktop の場合は `claude_desktop_config.json` に追記:

```json
{ "mcpServers": { "claude-guard": { "command": "npx", "args": ["-y", "claude-guard-mcp"] } } }
```

**CLI として:**

```bash
npx claude-guard scan .           # カレントをスキャン(CRITICAL で exit 2)
npx claude-guard fix .            # スキャン + 安全な修正を一括適用
npx claude-guard report --open    # 自己完結 HTML レポートをブラウザで開く
npx claude-guard sarif . > out.sarif      # GitHub Code Scanning 用
npx claude-guard install-hooks    # CRITICAL をブロックする pre-commit フック
```

全コマンド: `npx claude-guard --help`。

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

## 安全性

要約:

- デフォルトはネットワーク呼び出し 0、LLM 呼び出し 0。
- ルールは **YAML のみ**。ロード時に JSON Schema + `safe-regex2`(ReDoS ガード)で検証。
- レッドチームモードはオプトイン、loopback 限定、文字列チェックと DNS 再解決の二重強制。
- 修正は代わりにコミットせず、必ずロールバックパッチを残します。

詳細モデル: **[`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md)**。

## ルール

| カテゴリ | 件数 |
|---|---|
| secrets | 16 |
| sql | 10 |
| xss | 10 |
| auth | 23 |
| llm | 17 |
| misconfig | 60 |
| docker | 2 |
| iac | 12 |

全カタログ: **[`docs/rules.md`](docs/rules.md)**(`claude-guard docs` で再生成)。

## 比較

| | claude-guard | Semgrep | Gitleaks | Snyk Code | SonarQube |
|---|---|---|---|---|---|
| Claude 向け MCP サーバー | ✅ | — | — | — | — |
| AI 特化ルール | ✅ | 部分的 | — | — | — |
| チェックボックス自動修正 + ブランチステージング | ✅ | — | — | — | — |
| API キー 0 / 標準でネットワーク 0 | ✅ | ✅ | ✅ | — | — |
| SARIF 2.1.0 | ✅ | ✅ | ✅ | ✅ | ✅ |
| ルール数 | 155 | 2000+ | シークレットのみ | 数千 | 数千 |

Semgrep / Sonar / Snyk の **代替ではなく併用** を推奨。

## FAQ

**コードを外に送りますか?** いいえ。ネットワーク呼び出し 0、テレメトリ 0、LLM API キー不要。

**ルールファイルからコードを実行しますか?** いいえ。YAML のみ。すべての正規表現はロード時に ReDoS チェック。

**なぜ全自動ではなくチェックボックス?** 誤検知に対する自動修正は機能リグレッションになります。信頼できる場合は `apply_fixes --mode=all_safe` で一括適用。

**Snyk / Semgrep / Sonar を置き換えますか?** いいえ、併用してください。claude-guard のニッチは「Claude 支援コードが間違いやすい 150 件、それぞれに修正付き」。

さらに: [`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md)。

## ライセンス

MIT — [`LICENSE`](LICENSE)。脆弱性報告: [`SECURITY.md`](SECURITY.md)。
