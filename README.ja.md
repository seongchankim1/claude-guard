# claude-guard

[English](README.md) · [한국어](README.ko.md) · **日本語** · [简体中文](README.zh-CN.md) · [Español](README.es.md)

**実在する攻撃者の視点で AI 生成コードを監査し、チェックした項目だけを修正する MCP サーバー。**

![license](https://img.shields.io/badge/license-MIT-blue)
![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![mcp](https://img.shields.io/badge/MCP-stdio-purple)
![rules](https://img.shields.io/badge/rules-155-8a2be2)
![tests](https://img.shields.io/badge/tests-111%20passing-brightgreen)

```
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

API キー 0。デフォルトでネットワーク呼び出し 0。アウトバウンドテレメトリ 0。

---

## なぜ claude-guard か

Claude や他のモデルでヴァイブコーディングすると、大量のコードを素早く生み出せる反面、同じセキュリティミスも素早く生み出してしまいます。`.env` にハードコードされた `NEXT_PUBLIC_OPENAI_API_KEY`、`req.query` を繋げた `prisma.$queryRawUnsafe`、クライアントコンポーネントに import された Supabase `service_role`、AI 出力に対する `dangerouslySetInnerHTML`、credentials 有効の CORS `"*"`、署名検証なしの webhook ハンドラ ── 毎週同じ 20 の間違いです。

claude-guard は Claude Code / Claude Desktop / 任意の MCP クライアントで動く小さな MCP サーバーです。エージェントにこれらのミスを攻撃者目線で探させ、リポジトリを黙って書き換えるのではなく、一緒に修正を進めます。

---

## コードを守る仕組み

4 つのアイディアを積み上げています。どれも単独ではシンプルですが、組み合わせると **検知 → 採点 → 修正 → 抑制** の全体が人間が常に監査できる形に収まります。

### 1. 3 層検知

```
┌─────────────────────────────────────────────────────────────┐
│  L1  OSS エンジン (任意、自動検出)                           │
│      semgrep · gitleaks · osv-scanner · npm/pip audit       │
├─────────────────────────────────────────────────────────────┤
│  L2  155 個の YAML ビルトインルール                          │
│      secrets · sql · xss · auth · llm · misconfig · docker · iac │
├─────────────────────────────────────────────────────────────┤
│  L3  レッドチームシミュレータ (オプトイン)                   │
│      静的 PoC ペイロード + loopback 限定のライブプローブ     │
└─────────────────────────────────────────────────────────────┘
```

- **L1** はインストール済みの OSS ツールをオーケストレーションします (Semgrep, Gitleaks, OSV)。すべて **任意** で、L2 だけでも動作します。
- **L2** は claude-guard 独自のルールカタログ。AI 生成コードが特に間違いやすいパターンに焦点を当てた YAML 正規表現。すべてのルールに positive / negative フィクスチャがあり、テストスイートが **bad ケースで発火し good ケースで沈黙する** ことを強制します。
- **L3** はオプトインでデフォルト OFF。`redteam_probe` 実行時のみ、loopback URL に **1 回だけ** HTTP GET を送って攻撃経路を示します。外部ターゲットはハード遮断 (下記「[レッドチーム ガードレール](#レッドチーム-モードのガードレール)」参照)。

どのエンジンが検出しても結果は統一された `Finding` (rule_id, severity, file, line, evidence, fix_strategy) に正規化され、`(file, line, rule_id)` で重複排除されます。

### 2. スコアカード + グレード

すべてのスキャンは 0–100 のスコアと A+ … F のグレードを算出します:

| 重大度 | 減点 | 重大度ごとの上限 |
|---|---|---|
| CRITICAL | -20 | -80 |
| HIGH | -8 | -40 |
| MEDIUM | -3 | -20 |
| LOW | -1 | -10 |

グレードは `.claude-guard/findings.md` の先頭、`score` MCP ツール、`claude-guard score` CLI、そして shields.io エンドポイント JSON (`claude-guard badge`) で露出されます。スキャンごとに `.claude-guard/history.json` にエントリが追記され、`claude-guard trend` で推移を確認できます。

### 3. チェックボックス承認式の修正

スキャン後、claude-guard は Markdown チェックリストを書き出します:

```markdown
# claude-guard findings — scan_id: 747d5448-…

> Security scorecard: Grade F — score 0/100 (11 CRITICAL, 7 HIGH, 2 MEDIUM, 2 LOW)

## CRITICAL (11)
- [ ] **CG-SQL-002** `app/api/users/route.ts:7` — Prisma $queryRawUnsafe
  - strategy: parameterize_query
- [ ] **CG-SEC-001** `.env:1` — NEXT_PUBLIC_OPENAI_KEY はシークレットに見える
  - strategy: rename_env_var
...
```

修正したい項目に `[x]` を入れて `apply_fixes` を実行すると:

1. 作業ツリーが dirty な場合、`force=true` 無しでは触りません。
2. `claude-guard/fix-<scan_id>` ブランチを作成します。
3. 選択された finding を **fix strategy** にディスパッチします。5 つは `ts-morph` ベースの AST 書き換え、それ以外は `suggest_only` (曖昧な書き換えではなく `// claude-guard: ...` インラインアノテーションを挿入)。
4. ステージ (`git add -A`) するだけで **コミットはしません**。コミットメッセージと判断はユーザーが持ちます。
5. `.claude-guard/rollback/<scan_id>.patch` にロールバックパッチを保存。`claude-guard rollback <scan_id>` で戻せます。

現在の AST リライト: `rename_env_var`, `set_cookie_flags`, `split_server_only`, `parameterize_query`, `wrap_with_authz_guard`。それ以外は明示的な TODO アノテーションに落ちます。**原則: 曖昧な自動修正より、明示的な手作業 TODO の方がマシ。**

### 4. 4 段階の抑制システム

偽陽性は起こります。claude-guard は 4 つのノブを用意していて、すべてテキストベースで diff 可能です:

| 場所 | スコープ | 使いどころ |
|---|---|---|
| `// claude-guard-disable-next-line CG-XXX-NNN` | 1 行 | 特定の場所の特定 finding が偽陽性のとき |
| `.claude-guard/ignore.yml` (`claude-guard suppress <id>`) | rule_id + file + line で固定 | コミット済みファイルに `reason:` 付きで残したいとき |
| `config.yaml` `severity_overrides` | ルール全体、プロジェクト単位 | チームがデフォルト重大度に同意しないとき |
| `claude-guard baseline` | 現在存在するすべて | 既にノイズのあるリポに導入し、以降は **新規** finding のみ報告 |

どの層もリポジトリ内の平文。隠れたステート DB はありません。

---

## claude-guard 自身を守る仕組み

防御ツール自身がサプライチェーン攻撃の標的になり得ます。claude-guard は、侵害されたルールパッケージ、プロンプトインジェクションされたスキャン、悪意ある入力 URL があっても、監査行為を事故に転換できないように設計されています。

### プライバシーとデータフロー

- **デフォルトでネットワーク呼び出し 0。** デフォルト `layers: [l1, l2]` は 100% ローカル。L1 アダプタは既にインストールされているツール (Semgrep, Gitleaks) のみを subprocess 経由で呼び出します。
- **LLM API キー不要。** claude-guard はモデルを呼び出しません。"LLM-native ルール" は正規表現 + YAML で、文脈の解釈は MCP クライアント側の Claude が担当します。
- **テレメトリ無し。** アナリティクス送信はありません。`grep -R 'https://' src/` で確認可能。
- **Findings はローカル完結。** 初回スキャンで `.claude-guard/` が自動で `.gitignore` に追加され、findings / ロールバックパッチ / レッドチームログがリモートに漏れません。

### プラグイン安全性

コミュニティ貢献を受けつつ **サプライチェーン攻撃ベクターにならない** 設計:

- プラグインは **YAML のみ**。インポート時もルール評価時も JavaScript を一切ロードしません。
- プラグインは **ホワイトリスト式**。`.claude-guard/config.yaml` の `plugins.allowed` に列挙されたパッケージだけが読み込まれます。
- プラグインルールもビルトインと同じ **JSON Schema + ReDoS 検証** を通過します。不正なパターン 1 つでパッケージ全体を拒否。
- カスタム AST fix strategy が必要なプラグインは、それを定義できません。該当ロジックは `src/fix/` にあり、コア PR 経由でのみ追加可能です。意図的な制約 ── プラグインインストールが任意コードを実行できないことを最も単純に証明する手段です。

### レッドチーム モードのガードレール

`redteam_probe` はオプトインでデフォルト OFF。実行時、**ソケットを開く前に** 4 回検証します:

1. **プロトコル許可リスト** — `http:`, `https:` のみ。`file://`, `gopher://`, `ftp://` は拒否。
2. **ホスト名許可リスト (文字列)** — `localhost`, `127.0.0.1`, `::1`, `0.0.0.0` のみ。それ以外は `HOSTNAME` 拒否。
3. **DNS 再解決** — ホスト名を `dns.lookup({ all: true })` で解決し、**すべての** 返却アドレスが loopback IP である必要があります。公開 IP に解決される DNS rebinding レコードは `DNS_REBIND` で拒否。
4. **レート制限** — `finding_id` あたり 1 回、プロセスあたり 1 分 10 回。インメモリで強制。プロンプトインジェクションされたスキャンでバーストリクエストが増幅されません。

加えて: リダイレクト非追従、5 秒タイムアウト、1 MB レスポンスキャップ、すべてのリクエスト + レスポンスは `.claude-guard/redteam/<finding_id>.log` に監査ログとして残ります。

### 正規表現安全性 (ReDoS)

すべてのルール正規表現はロード時に検証:

- `RegExp` としてコンパイルできること。
- [`safe-regex2`](https://github.com/davisjam/safe-regex) を通過すること (最悪ケースのバックトラックがスーパーリニアなパターンを拒否する静的解析)。

安全でないパターン 1 つで **ルールファイル全体** を拒否。悪意ある貢献が、細工された入力でスキャナを止めるパターンを仕込むことはできません。

### Git 安全性

修正は "魔法のように" 起きません:

- `apply_fixes` は明示的に `force=true` を渡さない限り dirty な作業ツリーに触りません。
- 修正は別の `claude-guard/fix-<scan_id>` ブランチで行われ、現在のブランチには影響しません。
- 変更はステージング (`git add -A`) のみで **コミットしません**。コミットメッセージと判断はユーザーが所有します。
- すべての fix バッチは `git apply --reverse` で再適用可能な unified-diff ロールバックパッチを書き出します (`claude-guard rollback <id>` がそのまま実行)。
- `claude-guard install-hooks` が設置する pre-commit フックは CRITICAL finding を持ち込むコミットをブロック。冪等で、既存の pre-commit フックはチェインで保持します。

---

## インストール

### MCP サーバーとして (推奨)

```bash
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

Claude Desktop の場合は `claude_desktop_config.json` に追記:

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

### 単独 CLI として

```bash
npx claude-guard scan               # カレントディレクトリをスキャン
npx claude-guard fix                # スキャン + 安全な修正を一括適用
npx claude-guard score              # 最新スキャンのグレード
npx claude-guard badge              # shields.io エンドポイント JSON
npx claude-guard sarif              # SARIF 2.1.0
npx claude-guard junit              # JUnit XML
npx claude-guard csv                # スプレッドシート向け CSV
npx claude-guard report --open      # 自己完結 HTML レポートをブラウザで開く
npx claude-guard watch              # ファイル保存のたびにライブスコアカード
npx claude-guard install-hooks      # CRITICAL をブロックする pre-commit フック
```

`scan` は clean なら `0`、CRITICAL ありなら `2` で終了 ── CI ゲートに使えます。

---

## デモ

リポジトリ同梱の意図的に脆弱な Next.js デモアプリ:

```bash
$ npx claude-guard scan ./examples/vulnerable-next-app

  F     0/100   Grade F — score 0/100 (11 CRITICAL, 7 HIGH, 2 MEDIUM, 2 LOW)
  scan_id=747d5448  findings=22  duration=76ms  layers=l1,l2
  11 CRITICAL   7 HIGH   2 MEDIUM   2 LOW
  next: claude-guard list   # 修正したい項目に [x]
```

修正したい項目に `[x]` を入れて `findings.md` を保存し:

```
> scan 747d5448 の修正を適用して (mode: checked)
  applied:   CG-SEC-001 · CG-SEC-003 · CG-AUTH-002 · CG-SQL-002
  suggested: CG-CFG-018 · CG-CFG-012 · CG-AUTH-001
  branch:    claude-guard/fix-747d5448
  rollback:  .claude-guard/rollback/747d5448-….patch
```

ステージされた diff を確認してコミット (または `claude-guard rollback 747d5448` で取り消し)。

---

## ルールカタログ

**155 ルール**、8 カテゴリ。詳細な分類は英語版 README の "Rule catalogue" を参照してください。

- **secrets** (16) — NEXT_PUBLIC 秘密鍵、クラウド API キー、PEM、コミット済み `.env`、等
- **sql** (10) — Prisma/Knex/Drizzle/TypeORM/Sequelize/Django/SQLAlchemy のテンプレート注入
- **xss** (10) — dangerouslySetInnerHTML、v-html、{@html}、javascript: URL、等
- **auth** (23) — JWT の誤用、cookie フラグ欠落、セッション保存先、mass-assignment、等
- **llm** (17) — プロンプトインジェクション、クライアント鍵、RAG のシステム混入、等
- **misconfig** (60) — CORS、RLS、Firebase、SSRF、CSRF、shell 実行、XXE、等
- **docker** (2) — `FROM :latest`、`apt-get install` without `--no-install-recommends`
- **iac** (12) — Terraform/K8s/GitHub Actions の典型的ミス、IAM ワイルドカード、等

`claude-guard docs` で全ルールの根拠付きマークダウンカタログを再生成できます。

---

## 他ツールとの比較

| | claude-guard | Semgrep | Gitleaks | Snyk Code | SonarQube |
|---|---|---|---|---|---|
| Claude Code / Desktop 向け MCP サーバー | ✅ | — | — | — | — |
| AI 特化ルール | ✅ | 部分的 | — | — | — |
| チェックボックス承認 + ブランチ作成の自動修正 | ✅ | — | — | — | — |
| API キー 0, 標準でネットワーク 0 | ✅ | ✅ (ローカル) | ✅ | — | — |
| SARIF 2.1.0 | ✅ | ✅ | ✅ | ✅ | ✅ |
| セキュリティグレード | ✅ | — | — | 部分的 | ✅ |
| loopback 限定 PoC プローブ | ✅ | — | — | — | — |
| ルール数 | 155 | 2000+ | 秘密のみ | 数千 | 数千 |

claude-guard は意図的に **小さくて意見の強い** ツールです。**Semgrep / Sonar / Snyk を置き換えるのではなく、併用してください。**

---

## FAQ

**コードを外部に送信しますか?**
しません。デフォルトはネットワーク呼び出し 0、テレメトリ 0、LLM 呼び出しも 0。

**ルールファイルからコードが実行されますか?**
されません。ルールは YAML で、JavaScript 実行経路はありません。正規表現は `safe-regex2` + JSON Schema でロード時に検証されます。

**レッドチームモードは具体的に何をしますか?**
`redteam_probe` 実行時のみ loopback URL に HTTP GET を 1 回送ります。Loopback は文字列チェックと DNS 再解決で強制、公開 IP に解決される rebinding は拒否。

**なぜ全自動でなくチェックボックス UX?**
誤検知を自動修正すると機能リグレッションになります。`[x]` のタップで確信度と交換する設計です。信頼しているルールセットなら `apply_fixes --mode=all_safe` で一括適用できます。

**Snyk / Semgrep / Sonar を置き換えますか?**
いいえ。併用してください。claude-guard のニッチは「Claude 支援コードが間違えやすい 150 のこと、攻撃者視点の根拠と修正付き」です。

---

## ライセンス

MIT。`LICENSE` 参照。責任ある利用ポリシーと脆弱性報告は `SECURITY.md`。
