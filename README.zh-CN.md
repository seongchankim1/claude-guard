# claude-guard

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · **简体中文** · [Español](README.es.md)

用来审查 vibe coding 写出的代码里那些常见安全漏洞的 MCP server。155 条规则 / 5 种 AST 自动修复 / 137 个通过的测试。

> 不是一把能挡住所有攻击的锁。AI 辅助写代码时反复出现的那几类老毛病(客户端暴露的 secret、raw SQL、prompt injection、漏掉的 cookie flag 之类)—— 它做的是在本地先过一道筛。跨文件 dataflow 分析、依赖 CVE、运行时攻击,请配合其他工具一起用。

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![rules](https://img.shields.io/badge/rules-155-8a2be2)](docs/rules.md)
[![tests](https://img.shields.io/badge/tests-137%20passing-brightgreen)](tests)

## 安装

```bash
claude mcp add claude-guard -- npx -y -p claude-guard-mcp claude-guard-mcp
```

## 使用

| 命令 | 作用 |
|---|---|
| `/mcp__claude-guard__scan` | 扫描项目 → 生成 `.claude-guard/findings.md` |
| `/mcp__claude-guard__fix` | 只对勾选了 `[x]` 的条目做 AST 自动修复 |

修改只会以 staged 状态落在 `claude-guard/fix-<id>` 分支上。commit 由你自己掌握。

## 检查项

### Secrets (19)
- `NEXT_PUBLIC_*` 中混入的 secret(OpenAI / Anthropic / Stripe secret 等)
- Supabase `service_role` 密钥泄到客户端
- 源码里硬编码的 API key、token、密码、私钥
- 被 commit 上去的 `.env` / `.env.local` / `.env.production`
- JWT 签名密钥写死在代码里
- 留在 git history 的 credential(gitleaks 联动)

### Auth & Access Control (23)
- cookie 缺 `httpOnly` / `secure` / `sameSite`
- JWT `alg: none`,以及 HS256 ↔ RS256 algorithm confusion
- URL query string 里带 token / password
- `"use server"` action 或 API route 没做 authorization
- Supabase RLS 关着
- CSRF token 校验缺失
- bcrypt / scrypt / argon2 迭代轮数不够
- 密码重置 URL 直接带 raw token
- session fixation,session ID 可预测

### SQL / NoSQL 注入 (10)
- Prisma `$queryRawUnsafe` / `$executeRawUnsafe` 直接拼用户输入
- Knex `.raw()` 模板字符串拼接
- Drizzle `sql.raw(var)`
- Sequelize `literal()` 注入
- MongoDB operator 注入(`$where`、`$regex` 过滤器)
- Python f-string / `%`-格式化 SQL
- SQLAlchemy `text()` 的 formatting

### XSS (10)
- React `dangerouslySetInnerHTML` 不经 sanitize
- Vue `v-html` 绑定未净化值
- Svelte `{@html}` 直接塞用户输入
- markdown 渲染前没 escape
- 直接赋值 `innerHTML` / `outerHTML`
- `href={expr}` 不校验 scheme(放过 `javascript:`)
- `target="_blank"` 没带 `rel="noopener noreferrer"`(tabnabbing)

### LLM 安全 (17)
- system prompt 直接拼用户输入(prompt injection)
- 把 RAG 检索结果当 system message 注入
- 用 `dangerouslySetInnerHTML` 渲染 LLM 输出
- OpenAI / Anthropic key 被打包进客户端 bundle
- MCP tool 输入 schema 写成 freeform `type: string`(没有 enum、pattern)
- 把对话历史连同 secret / PII 一起存
- function call 的结果未经校验就写回 DOM

### Misconfiguration (62)
- CORS `origin: '*'` 配合 credentials 一起用
- HSTS `max-age` 不到一年
- Next.js `rewrites()` 外部 destination(open proxy)
- Next.js `images.remotePatterns` 里 hostname `*`
- Next.js `headers()` 没配 CSP
- Supabase RLS 关着
- Express / Fastify 不用 Helmet
- TLS 校验关掉(`rejectUnauthorized: false`)
- 文件上传没加 `limits`(multer / busboy)
- 没做速率限制的接口
- `lodash.template(req.body.*)`(CVE 风险)
- Electron `BrowserWindow` `nodeIntegration: true`
- 用 `node-serialize`(CVE-2017-5941)
- tRPC `publicProcedure.mutation`(无 auth 改状态)

### IaC (12)
- S3 bucket 被设成 public-read / public-write
- IAM 策略 `Action: "*"` / `Resource: "*"`
- Security group 开着 0.0.0.0/0 的 inbound(SSH、RDP、DB 端口)
- Terraform 里定义的 public RDS / Postgres
- Firestore rules `allow read, write: if true`
- GCS public bucket
- Kubernetes `hostNetwork: true` / `privileged: true`

### Docker (2)
- `USER root` 或压根没写 `USER`
- base image 锁在 `latest` tag

完整规则清单: [`docs/rules.md`](docs/rules.md)

## 自动修复(5 种)

- 把 `NEXT_PUBLIC_*` 的 secret 改名(env 和所有引用同步更新)
- 给 cookie 加上 `httpOnly` / `secure` / `sameSite`
- 给用到 `service_role` 的模块插入 `import "server-only"`
- raw SQL 改成 tagged template
- 给 `"use server"` 函数套一层 auth guard

其余 150 条规则是 detection-only,只出检测结果和一行提示,不产出 patch。

## 已知限制

- 不做跨文件 dataflow / taint 分析 → 找 Semgrep Pro / CodeQL
- 不扫依赖 CVE → 用 Snyk / osv-scanner / Dependabot
- 不做运行时防御 → WAF / RASP
- 不查业务逻辑 / IDOR / 复杂权限链 → pentest
- 覆盖比较强: JS / TS / JSX / TSX, Next.js, Express, Prisma, Drizzle, Supabase, Firebase, Terraform, Dockerfile
- 只覆盖一部分: Python, Java
- 暂未支持: Rust, Go, Swift, Kotlin
- 误报有 4 条抑制路径: inline 注释 / `ignore.yml` / `severity_overrides` / `baseline`

## 安全原则

- 默认完全离线。只有你在配置里 opt-in Semgrep 时,才会去 `semgrep.dev` 拉 ruleset
- 没有 telemetry、不需要 LLM API key、不需要账号
- 规则全部是 YAML,每条 regex 在加载时用 `safe-regex2` 再过一次 ReDoS 校验
- 插件用 allowlist + atomic 加载(任一规则失败,整个 plugin 被拒)
- red-team probe 需要显式 opt-in,只能打 loopback,带 DNS rebinding 防护
- fix 不会自己 commit。dirty tree 直接拒,rollback patch 自动保存

威胁模型细节: [`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md)

## Export / CI

- SARIF 2.1.0 → GitHub Code Scanning
- JUnit XML · HTML · CSV
- shields.io endpoint JSON(徽章用)
- pre-commit hook(CRITICAL 直接拦)

## 许可证

MIT。漏洞私报: [`SECURITY.md`](SECURITY.md)。
