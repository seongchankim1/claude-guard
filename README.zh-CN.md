# claude-guard

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · **简体中文** · [Español](README.es.md)

**一个 MCP 服务器,用真实攻击者的视角审计 AI 生成的代码 —— 只修复你勾选的问题。**

![license](https://img.shields.io/badge/license-MIT-blue)
![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![mcp](https://img.shields.io/badge/MCP-stdio-purple)
![rules](https://img.shields.io/badge/rules-155-8a2be2)
![tests](https://img.shields.io/badge/tests-111%20passing-brightgreen)

```
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

零 API 密钥。默认零网络调用。零外发遥测。

---

## 为什么需要 claude-guard

用 Claude 或其他模型做 vibe-coding 会快速生成大量代码,同时也会快速生成相同的安全错误:`.env` 中硬编码的 `NEXT_PUBLIC_OPENAI_API_KEY`、从 `req.query` 拼接的 `prisma.$queryRawUnsafe`、被引入客户端组件的 Supabase `service_role`、对 AI 输出使用 `dangerouslySetInnerHTML`、开启 credentials 的 CORS `"*"`、缺少签名校验的 webhook —— 每周都是同样的二十种错误。

claude-guard 是一个小型 MCP 服务器,让你的 agent(Claude Code、Claude Desktop 或任意 MCP 兼容客户端)以攻击者视角寻找这些问题,并和你一起逐个修复,而不是未经许可直接重写你的仓库。

---

## 它如何保护你的代码

安全叙事由四个想法叠加而成。每一个都很简单,合在一起就覆盖了 **发现 → 评分 → 修复 → 抑制** 的全过程,并且每一步都可由人审计。

### 1. 三层检测

```
┌─────────────────────────────────────────────────────────────┐
│  L1  OSS 引擎(可选,自动检测)                              │
│      semgrep · gitleaks · osv-scanner · npm/pip audit       │
├─────────────────────────────────────────────────────────────┤
│  L2  155 条 YAML 内置规则                                    │
│      secrets · sql · xss · auth · llm · misconfig · docker · iac │
├─────────────────────────────────────────────────────────────┤
│  L3  红队模拟器(可选)                                      │
│      静态 PoC 载荷 + 仅 loopback 的实时探测                  │
└─────────────────────────────────────────────────────────────┘
```

- **L1** 编排已安装的 OSS 工具(Semgrep、Gitleaks、OSV)。全部 **可选**;仅用 L2 也能工作。
- **L2** 是 claude-guard 自己的规则目录。聚焦 AI 生成代码最常出错模式的 YAML 正则。每条规则都有 positive + negative 夹具,测试套件强制 **在 bad 用例中触发,在 good 用例中沉默**。
- **L3** 默认关闭。`redteam_probe` 执行时仅向 loopback URL 发送一次 HTTP GET,以演示攻击路径。外部目标被硬阻断(见下文[红队守护](#红队模式守护))。

所有引擎的结果归一为统一的 `Finding`(rule_id, severity, file, line, evidence, fix_strategy),按 `(file, line, rule_id)` 去重。

### 2. 评分 + 等级

每次扫描产出 0–100 分和 A+…F 等级:

| 严重度 | 扣分 | 每类上限 |
|---|---|---|
| CRITICAL | -20 | -80 |
| HIGH | -8 | -40 |
| MEDIUM | -3 | -20 |
| LOW | -1 | -10 |

等级渲染在 `.claude-guard/findings.md` 顶部,可通过 MCP 工具(`score`)、CLI(`claude-guard score`)、以及 shields.io 端点 JSON(`claude-guard badge`)暴露。每次扫描还会向 `.claude-guard/history.json` 追加一行,`claude-guard trend` 可查看走势。

### 3. 勾选式修复

扫描后 claude-guard 写一份 Markdown 清单:

```markdown
# claude-guard findings — scan_id: 747d5448-…

> Security scorecard: Grade F — score 0/100 (11 CRITICAL, 7 HIGH, 2 MEDIUM, 2 LOW)

## CRITICAL (11)
- [ ] **CG-SQL-002** `app/api/users/route.ts:7` — Prisma $queryRawUnsafe
  - strategy: parameterize_query
- [ ] **CG-SEC-001** `.env:1` — NEXT_PUBLIC_OPENAI_KEY 看起来像密钥
  - strategy: rename_env_var
...
```

你勾选想修的项目。`apply_fixes` 随后:

1. 若工作树 dirty,除非传 `force=true` 否则拒绝动手。
2. 创建 `claude-guard/fix-<scan_id>` 分支。
3. 把每条 finding 分派到一个 **fix strategy**。其中 5 个是基于 `ts-morph` 的 AST 改写,其余落入 `suggest_only`(插入 `// claude-guard: ...` 行内注释,而非臆测重写)。
4. 暂存(`git add -A`)但 **不提交**。提交信息与决定由你掌控。
5. 在 `.claude-guard/rollback/<scan_id>.patch` 写入回滚补丁。`claude-guard rollback <scan_id>` 可还原。

当前 AST 改写:`rename_env_var`、`set_cookie_flags`、`split_server_only`、`parameterize_query`、`wrap_with_authz_guard`。其他一律为醒目的 TODO 注释。**原则:模糊的自动修复比清晰标注的手动 TODO 更糟。**

### 4. 四层抑制

误报会发生。claude-guard 给四个旋钮,全部文本化、可 diff:

| 位置 | 范围 | 何时用 |
|---|---|---|
| `// claude-guard-disable-next-line CG-XXX-NNN` | 一行 | 某位置的某条 finding 是误报 |
| `.claude-guard/ignore.yml`(`claude-guard suppress <id>`) | rule_id + file + line 固定 | 想把忽略提交到仓库、带 `reason:` |
| `config.yaml` `severity_overrides` | 该规则,项目级 | 团队不同意默认严重度 |
| `claude-guard baseline` | 当前所有 | 已有噪音的仓库接入,之后仅报 **新增** finding |

每一层都是仓库内平文。不存在隐藏的 tombstone 数据库。

---

## 它如何保护自己

防御工具本身就是供应链目标。claude-guard 的设计保证:即使被污染的规则包、被提示注入的扫描、恶意的输入 URL 也无法把一次审计变成事故。

### 隐私与数据流

- **默认零网络调用。** 默认 `layers: [l1, l2]` 配置 100% 本地。
- **无需 LLM API 密钥。** claude-guard 不调用任何模型。"LLM-native 规则" 是正则 + YAML;上下文解释由 MCP 客户端中的 Claude 完成。
- **无遥测。** 不上报分析。可用 `grep -R 'https://' src/` 自行核查。
- **Findings 留在本地。** 首次扫描自动把 `.claude-guard/` 加进 `.gitignore`,findings / 回滚补丁 / 红队日志不会泄漏到远程。

### 插件安全

- 插件 **仅 YAML**。无论 import 还是规则求值,都不加载 JavaScript。
- 插件是 **白名单制**。只有列在 `plugins.allowed` 的包才会被加载,其他被 `PLUGIN_UNTRUSTED` 警告忽略。
- 插件规则和内置规则走相同的 **JSON Schema + ReDoS 校验**。一条不合规模式即拒绝整个规则包。
- 需要自定义 AST 修复策略的插件无法自己定义 —— 该逻辑在 `src/fix/`,只能经 core PR 添加。刻意约束,用最简单的方式证明安装插件不会执行任意代码。

### 红队模式守护

`redteam_probe` 默认关闭。执行时在 **打开 socket 前** 进行四次检查:

1. **协议白名单** — 仅 `http:` / `https:`。`file://`、`gopher://`、`ftp://` 被拒。
2. **主机名白名单(字符串)** — 仅 `localhost` / `127.0.0.1` / `::1` / `0.0.0.0`。其他拒绝(`HOSTNAME`)。
3. **DNS 重新解析** — 用 `dns.lookup({ all: true })` 解析主机名,**所有** 返回地址必须是 loopback。解析出公网 IP 的 DNS rebinding 记录被拒绝(`DNS_REBIND`)。
4. **限频** — 每个 `finding_id` 1 次,每个进程每分钟 10 次。内存强制。

再加上:不跟随重定向、5 秒超时、1 MB 响应上限、所有请求/响应记入 `.claude-guard/redteam/<finding_id>.log`。

### 正则安全(ReDoS)

- 模式必须能编译为 `RegExp`。
- 模式必须通过 [`safe-regex2`](https://github.com/davisjam/safe-regex) 的静态分析(拒绝最坏情况回溯超线性的模式)。

不安全的模式会拒绝 **整个规则文件**,不会悄悄降级加载。

### Git 安全

- `apply_fixes` 未显式 `force=true` 时拒绝修改 dirty 的工作树。
- 修复发生在独立的 `claude-guard/fix-<scan_id>` 分支,不影响当前分支。
- 变更仅 `git add -A` **不 commit**。提交信息和决定归你。
- 每批修复写回滚补丁,`claude-guard rollback <id>` 直接反向应用。
- `claude-guard install-hooks` 安装的 pre-commit 钩子阻断引入 CRITICAL 的提交,幂等,并通过链式调用保留已有的 pre-commit 钩子。

---

## 安装

```bash
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

Claude Desktop 在 `claude_desktop_config.json` 中添加:

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

独立 CLI:

```bash
npx claude-guard scan             # 扫描当前目录
npx claude-guard fix              # 扫描 + 应用所有安全修复
npx claude-guard score            # 最新扫描等级
npx claude-guard sarif            # SARIF 2.1.0(用于 GitHub Code Scanning)
npx claude-guard report --open    # 自包含 HTML 报告,浏览器打开
npx claude-guard install-hooks    # 阻断 CRITICAL 的 pre-commit 钩子
```

`scan` 在 clean 时 `0` 退出,有 CRITICAL 时 `2` 退出 —— 便于 CI 门控。

---

## 规则目录

**155 条规则**,分八类。完整分类与每条规则理由可用 `claude-guard docs` 生成。

- **secrets** (16) — NEXT_PUBLIC 秘密、云 API 密钥、PEM、提交的 `.env` 等
- **sql** (10) — Prisma / Knex / Drizzle / TypeORM / Sequelize / Django / SQLAlchemy 的模板注入
- **xss** (10) — dangerouslySetInnerHTML、v-html、{@html}、javascript: URL 等
- **auth** (23) — JWT 滥用、cookie 标志缺失、会话存储位置、mass-assignment 等
- **llm** (17) — prompt injection、客户端密钥、RAG 文档混入 system 角色等
- **misconfig** (60) — CORS、RLS、Firebase、SSRF、CSRF、shell exec、XXE 等
- **docker** (2) — `FROM :latest`、`apt-get install` 无 `--no-install-recommends`
- **iac** (12) — Terraform / K8s / GitHub Actions 典型错误、IAM 通配等

---

## 与其他工具对比

| | claude-guard | Semgrep | Gitleaks | Snyk Code | SonarQube |
|---|---|---|---|---|---|
| 面向 Claude Code / Desktop 的 MCP 服务器 | ✅ | — | — | — | — |
| AI 专用规则 | ✅ | 部分 | — | — | — |
| 勾选式自动修复 + Git 分支暂存 | ✅ | — | — | — | — |
| 零 API 密钥、默认零网络 | ✅ | ✅(本地) | ✅ | — | — |
| SARIF 2.1.0 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 安全评分 | ✅ | — | — | 部分 | ✅ |
| Loopback-only PoC 探测 | ✅ | — | — | — | — |
| 规则数 | 155 | 2000+ | 仅密钥 | 数千 | 数千 |

claude-guard 是刻意 **小而有主张** 的工具。**与 Semgrep / Sonar / Snyk 互补使用,而非替代。**

---

## 常见问题

**claude-guard 会把代码发送到哪里吗?**
不会。默认模式零网络、零遥测、不替你调用 LLM。

**规则文件会执行代码吗?**
不会。规则是 YAML,没有到 JavaScript 的执行路径。正则在加载时走 `safe-regex2` + JSON Schema。

**红队模式实际在做什么?**
仅当你运行 `redteam_probe` 时,对 loopback URL 发送一次 HTTP GET。loopback 由字符串检查 **和** DNS 再解析共同强制;解析到公网 IP 的 rebinding 记录会被拒绝。

**为何勾选式而不是全自动?**
自动修复误报等于把误报变成功能回归。勾选 `[x]` 用几秒键入换取可信度。若你信任规则集,`apply_fixes --mode=all_safe` 可批量应用。

---

## 许可证

MIT。详见 `LICENSE`。负责任使用政策与漏洞披露流程见 `SECURITY.md`。
