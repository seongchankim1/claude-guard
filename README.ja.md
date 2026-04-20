# claude-guard

[English](README.md) · [한국어](README.ko.md) · **日本語** · [简体中文](README.zh-CN.md) · [Español](README.es.md)

### Vibe コーダーに、盾を。

AI はコードを猛スピードで吐き出す。**claude-guard** はそのすき間にできたセキュリティの穴を、誰かに見つかる前にふさぎます。

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![mcp](https://img.shields.io/badge/MCP-stdio-purple)](https://modelcontextprotocol.io)
[![rules](https://img.shields.io/badge/rules-155-8a2be2)](docs/rules.md)
[![tests](https://img.shields.io/badge/tests-111%20passing-brightgreen)](tests)

```bash
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

API キーは要りません。デフォルトでネットワーク呼び出しもゼロ、外向きのテレメトリもゼロです。

## 何をしてくれるのか

claude-guard は、あなたが Vibe コーディングしているあいだ、背中側でずっと見張ってくれる MCP サーバーです。リポジトリを歩き回って、攻撃者が大好きな失敗を見つけます — `.env` に置き忘れた `NEXT_PUBLIC_OPENAI_KEY`、`req.query` をそのまま差し込んだ `$queryRawUnsafe`、うっかりクライアントバンドルに紛れ込んだ Supabase の `service_role` など。スコアを付けたうえで、**あなたがチェックを入れた項目だけ** を一緒に直していきます。

## デモ

```console
$ npx claude-guard scan ./examples/vulnerable-next-app

  F   0/100   Grade F — 22 件の指摘 (11 CRITICAL, 7 HIGH, 2 MEDIUM, 2 LOW)
  scan_id=747d5448  duration=76ms  layers=l1,l2
  next: claude-guard list
```

`.claude-guard/findings.md` を開いて修正したい項目に `[x]` を入れ、`claude-guard fix` を実行。変更は `claude-guard/fix-<id>` ブランチに staged されますが、コミットはあなたの手で。

## 中身

- **155 のルール** — secrets / SQL・NoSQL / XSS / 認証 / LLM 特有のリスク / 設定ミス / Docker / IaC
- **AST ベースの自動修正が 5 種**(`ts-morph`)。それ以外は「勝手に書き換えたりせず」TODO アノテーションとして残します。
- **チェックボックスで承認する修正** — 専用ブランチに staged、ロールバックパッチ付き
- **エクスポート**: JSON / Markdown / HTML / SARIF 2.1.0 / JUnit XML / CSV / shields.io バッジ
- **ノイズの抑え方が 4 通り**: インラインコメント / `ignore.yml` / `severity_overrides` / `baseline`
- **オプトインのレッドチーム プローブ** — loopback 限定、DNS rebinding 防御、finding ごとのレート制限
- **MCP ネイティブ** — 10 tools + 4 resources。Claude Code / Desktop / その他 MCP クライアントすべてで動作。

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
npx claude-guard scan .              # カレントをスキャン(CRITICAL があれば exit 2 — CI にぴったり)
npx claude-guard fix .               # スキャン + 安全な修正を一括適用
npx claude-guard report --open       # 自己完結 HTML レポートをブラウザで開く
npx claude-guard sarif . > out.sarif # GitHub Code Scanning 用
npx claude-guard install-hooks       # CRITICAL をブロックする pre-commit フックを設置
```

コマンド一覧: `npx claude-guard --help`。

## GitHub Code Scanning にそのまま差し込む

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

検出結果はリポジトリの **Security** タブに表示されます。

## なぜ信頼できるのか

短く書くと:

- デフォルトは **ネットワーク呼び出し 0、LLM 呼び出し 0**。
- ルールは **YAML のみ** — ルールファイルから JavaScript を実行する経路そのものがありません。読み込み時点で JSON Schema と `safe-regex2`(ReDoS ガード)がすべての正規表現を検査します。
- レッドチームモードはデフォルト OFF。ON にしても loopback 限定で、文字列チェック **と** DNS 再解決の両方で強制されます。
- 修正が勝手にコミットされることはありません。毎回ロールバックパッチが残ります。

くわしくは: **[`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md)**。

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

全カタログ: **[`docs/rules.md`](docs/rules.md)**(`claude-guard docs` でいつでも再生成できます)。

## 他のツールと比べて

| | claude-guard | Semgrep | Gitleaks | Snyk Code | SonarQube |
|---|---|---|---|---|---|
| Claude 向け MCP サーバー | ✅ | — | — | — | — |
| AI 特化ルール(NEXT_PUBLIC、LLM SDK 漏洩、プロンプトインジェクション) | ✅ | 部分的 | — | — | — |
| チェックボックス式の自動修正 + Git ブランチ staged | ✅ | — | — | — | — |
| API キー 0 / 標準でネットワーク 0 | ✅ | ✅ | ✅ | — | — |
| SARIF 2.1.0 | ✅ | ✅ | ✅ | ✅ | ✅ |
| ルール数 | 155 | 2000+ | シークレットのみ | 数千 | 数千 |

claude-guard は Semgrep / Sonar / Snyk を **置き換えるものではありません。併用してください。**

## FAQ

**コードが外に出ますか?**
いいえ。ネットワーク呼び出し 0、テレメトリ 0、LLM API キーも不要です。

**ルールファイルからコードが実行されますか?**
いいえ。ルールは YAML で、正規表現はすべて読み込み時点で ReDoS チェックを通ります。

**なぜ全自動ではなくチェックボックス UX なのですか?**
誤検知に対して自動修正を当ててしまうと、検出の間違いが機能リグレッションに変わります。ルールセットを信頼できるなら `apply_fixes --mode=all_safe` で一括適用も可能です。

**Snyk / Semgrep / Sonar の代わりになりますか?**
なりません — 併用するツールです。claude-guard のニッチは「Claude 支援コードが間違えやすい 150 パターン、それぞれに修正手段までセット」。

さらに: [`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md)。

## ライセンス

MIT — [`LICENSE`](LICENSE) を参照。脆弱性の報告は [`SECURITY.md`](SECURITY.md)。
