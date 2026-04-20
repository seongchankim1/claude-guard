# claude-guard

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · **简体中文** · [Español](README.es.md)

### 给 vibe coder 的那面盾。

AI 写代码很快。**claude-guard** 替你把它留下的安全缝隙,在别人发现之前先补上。

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![mcp](https://img.shields.io/badge/MCP-stdio-purple)](https://modelcontextprotocol.io)
[![rules](https://img.shields.io/badge/rules-155-8a2be2)](docs/rules.md)
[![tests](https://img.shields.io/badge/tests-111%20passing-brightgreen)](tests)

```bash
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

不用 API key,默认不联网,不往外发任何遥测。

## 它是干什么的

claude-guard 是一个在你 vibe-coding 时在背后帮你盯着的 MCP 服务器。它把整个仓库走一遍,挑出攻击者最爱的那几种毛病 —— `.env` 里忘了清的 `NEXT_PUBLIC_OPENAI_KEY`、直接把 `req.query` 拼进来的 `$queryRawUnsafe`、一不小心混进客户端 bundle 的 Supabase `service_role`。打个分,然后 **只修你勾选的那些**,一条一条地跟你一起走完。

## 演示

```console
$ npx claude-guard scan ./examples/vulnerable-next-app

  F   0/100   Grade F — 22 条问题 (11 CRITICAL, 7 HIGH, 2 MEDIUM, 2 LOW)
  scan_id=747d5448  duration=76ms  layers=l1,l2
  next: claude-guard list
```

打开 `.claude-guard/findings.md`,在想修的条目上打 `[x]`,跑 `claude-guard fix`。改动会放在 `claude-guard/fix-<id>` 分支上,stage 好但**不替你 commit** —— 提交的主动权一直在你手里。

## 里面有什么

- **155 条规则** —— secrets、SQL / NoSQL、XSS、auth、LLM 专属风险、配置错误、Docker、IaC
- **5 种基于 AST 的自动修复**(`ts-morph`)。其他的一律转成 TODO 注释 —— 绝不悄悄改写。
- **勾选式修复** —— 专门的分支 + 回滚补丁全套
- **导出**: JSON / Markdown / HTML / SARIF 2.1.0 / JUnit XML / CSV / shields.io 徽章
- **压噪音有四种手段**: 行内注释、`ignore.yml`、`severity_overrides`、`baseline`
- **可选的红队探测** —— 仅 loopback,带 DNS rebinding 防御、每条 finding 限速
- **MCP 原生** —— 10 tools + 4 resources,在 Claude Code / Desktop / 任意 MCP 客户端里都能跑

## 安装

**当 MCP 服务器用(推荐):**

```bash
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

用 Claude Desktop 就在 `claude_desktop_config.json` 里加:

```json
{ "mcpServers": { "claude-guard": { "command": "npx", "args": ["-y", "claude-guard-mcp"] } } }
```

**当 CLI 用:**

```bash
npx claude-guard scan .              # 扫当前目录(遇到 CRITICAL 会以 exit 2 退出 —— CI 正好卡这里)
npx claude-guard fix .               # 扫 + 一次性应用所有安全修复
npx claude-guard report --open       # 自包含 HTML 报告直接在浏览器打开
npx claude-guard sarif . > out.sarif # 给 GitHub Code Scanning 用
npx claude-guard install-hooks       # 装一个挡 CRITICAL 的 pre-commit 钩子
```

完整命令: `npx claude-guard --help`。

## 直接接进 GitHub Code Scanning

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

发现会出现在仓库的 **Security** 标签下。

## 为什么可以信它

简短版:

- 默认模式 **零网络调用,零 LLM 调用**。
- 规则 **只吃 YAML** —— 从规则文件到执行代码根本没路子。加载时就用 JSON Schema + `safe-regex2`(ReDoS 保护)把每条正则都过一遍。
- 红队模式默认是关的。打开了也只打 loopback,字符串检查 **和** DNS 再解析双重强制。
- 修复永远不替你 commit,每一批都带回滚补丁。

详情: **[`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md)**。

## 规则

| 类别 | 数量 |
|---|---|
| secrets | 16 |
| sql | 10 |
| xss | 10 |
| auth | 23 |
| llm | 17 |
| misconfig | 60 |
| docker | 2 |
| iac | 12 |

完整目录: **[`docs/rules.md`](docs/rules.md)**(随时用 `claude-guard docs` 重新生成)。

## 和别的工具比

| | claude-guard | Semgrep | Gitleaks | Snyk Code | SonarQube |
|---|---|---|---|---|---|
| 面向 Claude 的 MCP 服务器 | ✅ | — | — | — | — |
| AI 专属规则(NEXT_PUBLIC、LLM SDK 泄漏、prompt injection) | ✅ | 部分 | — | — | — |
| 勾选式自动修复 + Git 分支暂存 | ✅ | — | — | — | — |
| 零 API key / 默认不联网 | ✅ | ✅ | ✅ | — | — |
| SARIF 2.1.0 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 规则数 | 155 | 2000+ | 仅密钥 | 数千 | 数千 |

claude-guard **不是** Semgrep / Sonar / Snyk 的替代品 —— 并用就对了。

## FAQ

**会把代码发出去吗?**
不会。零网络调用、零遥测、不用 LLM API key。

**规则文件里会不会执行代码?**
不会。规则只吃 YAML,每条正则加载时都过 ReDoS 检查。

**为啥是勾选而不是一键全自动?**
对误报做自动修复,等于把一次检测错误变成一次功能回归。如果你信任这份规则集,`apply_fixes --mode=all_safe` 也能一次应用全部。

**能替代 Snyk / Semgrep / Sonar 吗?**
不能 —— 这是并用的工具。它的定位是"Claude 帮你写的代码最常出的 150 个错,每个都配好修法"。

更多回答: [`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md)。

## 许可证

MIT —— 详见 [`LICENSE`](LICENSE)。漏洞披露: [`SECURITY.md`](SECURITY.md)。
