# claude-guard

[English](README.md) · [한국어](README.ko.md) · **日本語** · [简体中文](README.zh-CN.md) · [Español](README.es.md)

Vibe coding で書いたコードにありがちなセキュリティ欠陥をローカルで拾う MCP server。ルール 155 個 / AST auto-fix 5 個 / テスト 137 通過。

> あらゆる攻撃を防ぐ道具ではありません。AI と一緒にコードを書いていると何度も同じ形で事故るパターン(client 側に出た secret、raw SQL、prompt injection、抜けた cookie flag など)を、ローカルで先に弾く一次フィルターです。ファイル間の dataflow 解析、依存 CVE、runtime 攻撃は別の道具と組み合わせて使ってください。

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![rules](https://img.shields.io/badge/rules-155-8a2be2)](docs/rules.md)
[![tests](https://img.shields.io/badge/tests-137%20passing-brightgreen)](tests)

## インストール

```bash
claude mcp add claude-guard -- npx -y -p claude-guard-mcp claude-guard-mcp
```

## 使い方

| コマンド | 動作 |
|---|---|
| `/mcp__claude-guard__scan` | スキャンして `.claude-guard/findings.md` を書き出し |
| `/mcp__claude-guard__fix` | `[x]` を付けた項目だけ AST で auto-fix |

修正は `claude-guard/fix-<id>` branch に staged まで。commit するかは自分で決めます。

## 検出項目

### Secrets (19)
- `NEXT_PUBLIC_*` から漏れる secret(OpenAI / Anthropic / Stripe secret など)
- Supabase `service_role` key の client 流出
- ハードコードされた API key / token / password / private key
- `.env` / `.env.local` / `.env.production` の commit
- JWT signing secret が source に embed
- git history に残った credential(gitleaks 連携)

### Auth & Access Control (23)
- cookie の `httpOnly` / `secure` / `sameSite` 抜け
- JWT `alg: none`、HS256 ↔ RS256 algorithm confusion
- URL query string に入った token / password
- `"use server"` action / API route の authorization 欠落
- Supabase RLS 無効
- CSRF token 検証抜け
- bcrypt / scrypt / argon2 の round 不足
- password reset URL に raw token をそのまま載せる
- session fixation、session ID 予測可能

### SQL / NoSQL Injection (10)
- Prisma `$queryRawUnsafe` / `$executeRawUnsafe` にユーザー入力直結
- Knex `.raw()` template string interpolation
- Drizzle `sql.raw(var)`
- Sequelize `literal()` injection
- MongoDB operator injection(`$where`、`$regex` filter)
- Python f-string / `%`-formatted SQL
- SQLAlchemy `text()` での formatting

### XSS (10)
- React `dangerouslySetInnerHTML` に sanitize 抜きで渡す
- Vue `v-html` に未 sanitize 値を bind
- Svelte `{@html}` にユーザー入力を生で渡す
- markdown render 前の escape 抜け
- `innerHTML` / `outerHTML` 直代入
- `href={expr}` の scheme 検証抜け(`javascript:` 許容)
- `target="_blank"` で `rel="noopener noreferrer"` 抜け(tabnabbing)

### LLM Security (17)
- system prompt にユーザー入力を直 concat(prompt injection)
- RAG 検索結果を system message に注入
- LLM output を `dangerouslySetInnerHTML` で render
- OpenAI / Anthropic key が client bundle に混入
- MCP tool input schema が freeform `type: string`(enum / pattern なし)
- 対話履歴に secret / PII を保存
- function call 結果を検証なしで DOM に反映

### Misconfiguration (62)
- CORS `origin: '*'` と credentials を同時使用
- HSTS `max-age` が 1 年未満
- Next.js `rewrites()` の外部 destination(open proxy)
- Next.js `images.remotePatterns` hostname `*`
- Next.js `headers()` に CSP なし
- Supabase RLS off
- Express / Fastify で Helmet 未使用
- TLS 検証無効化(`rejectUnauthorized: false`)
- file upload の `limits` 抜け(multer / busboy)
- rate limit なし endpoint
- `lodash.template(req.body.*)`(CVE-prone)
- Electron `BrowserWindow` `nodeIntegration: true`
- `node-serialize` 使用(CVE-2017-5941)
- tRPC `publicProcedure.mutation`(auth なしで state change)

### IaC (12)
- S3 bucket の public-read / public-write ACL
- IAM policy `Action: "*"` / `Resource: "*"`
- Security group の 0.0.0.0/0 inbound(SSH、RDP、DB port)
- Terraform で定義した public RDS / Postgres
- Firestore rules `allow read, write: if true`
- GCS public bucket
- Kubernetes `hostNetwork: true` / `privileged: true`

### Docker (2)
- `USER root` または `USER` 未指定
- base image の `latest` tag 固定

全ルール一覧: [`docs/rules.md`](docs/rules.md)

## Auto-fix(5 つ)

- `NEXT_PUBLIC_*` の secret rename(env ファイルと参照箇所を同時更新)
- cookie に `httpOnly` / `secure` / `sameSite` を追加
- `service_role` を触る module に `import "server-only"` を挿入
- raw SQL → tagged template 変換
- `"use server"` 関数を auth guard で wrap

残り 150 ルールは detection-only。検出と 1 行の remediation hint のみで、patch は出しません。

## 制限

- ファイル間 dataflow / taint 解析なし → Semgrep Pro / CodeQL
- 依存 CVE スキャンなし → Snyk / osv-scanner / Dependabot
- runtime 防御なし → WAF / RASP
- ビジネスロジック / IDOR / 複雑な権限 chain なし → pentest
- しっかり対応: JS / TS / JSX / TSX, Next.js, Express, Prisma, Drizzle, Supabase, Firebase, Terraform, Dockerfile
- 部分対応: Python, Java
- 未対応: Rust, Go, Swift, Kotlin
- False positive 抑制は 4 経路: inline comment / `ignore.yml` / `severity_overrides` / `baseline`

## セキュリティ原則

- default は完全 offline。Semgrep を opt-in したときだけ `semgrep.dev` から ruleset を取得
- telemetry / LLM API key / account なし
- rule は YAML のみ。regex は load 時に `safe-regex2` で再検証
- plugin allowlist と atomic loading(rule 1 つ壊れたら plugin 全体 reject)
- red-team probe は opt-in、loopback のみ、DNS rebinding 対策つき
- fix は commit しない。dirty tree は refuse、rollback patch を自動保存

詳細な threat model: [`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md)

## Export / CI

- SARIF 2.1.0 → GitHub Code Scanning
- JUnit XML · HTML · CSV
- shields.io endpoint JSON(バッジ用)
- pre-commit hook(CRITICAL block)

## License

MIT。脆弱性報告は [`SECURITY.md`](SECURITY.md)。
