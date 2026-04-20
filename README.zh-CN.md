# claude-guard

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · **简体中文** · [Español](README.es.md)

> 用真实攻击者的视角审计 AI 生成代码,只修复你勾选的问题。

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![mcp](https://img.shields.io/badge/MCP-stdio-purple)](https://modelcontextprotocol.io)
[![rules](https://img.shields.io/badge/rules-155-8a2be2)](docs/rules.md)
[![tests](https://img.shields.io/badge/tests-111%20passing-brightgreen)](tests)

```bash
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

零 API 密钥。默认零网络调用。零外发遥测。

## 它是什么

claude-guard 是一个 MCP 服务器。它扫描仓库中 AI 生成代码最常犯的安全错误(硬编码的 `NEXT_PUBLIC_*` 密钥、`prisma.$queryRawUnsafe`、泄漏到客户端的 Supabase `service_role`、CORS `"*"` 等),给出评分,并只修复你 **勾选** 的项目。

## 演示

```console
$ npx claude-guard scan ./examples/vulnerable-next-app

  F   0/100   Grade F — score 0/100 (11 CRITICAL, 7 HIGH, 2 MEDIUM, 2 LOW)
  scan_id=747d5448  findings=22  duration=76ms  layers=l1,l2
  11 CRITICAL   7 HIGH   2 MEDIUM   2 LOW
  next: claude-guard list
```

打开 `.claude-guard/findings.md`,勾选 `[x]`,然后 `claude-guard fix`(或通过 MCP 调用 `apply_fixes`)。变更落到 `claude-guard/fix-<id>` 分支上,暂存但不提交。

## 特性

- **155 条规则** — secrets · SQL/NoSQL · XSS · auth · LLM · misconfig · Docker · IaC
- **5 种 AST 自动修复**(`ts-morph`)— 其余一律转为 TODO 注释,绝不悄悄改写
- **勾选式修复** — git 分支 + 回滚补丁
- **导出** — JSON · Markdown · HTML · SARIF 2.1.0 · JUnit XML · CSV · shields.io 徽章
- **四层抑制** — 行内注释 / `ignore.yml` / `severity_overrides` / `baseline`
- **可选红队探测** — 仅 loopback,带 DNS rebinding 防御 + 限频
- **原生 MCP** — 10 tools + 4 resources

## 安装

**作为 MCP 服务器(推荐):**

```bash
claude mcp add claude-guard -- npx -y claude-guard-mcp
```

Claude Desktop 在 `claude_desktop_config.json` 中添加:

```json
{ "mcpServers": { "claude-guard": { "command": "npx", "args": ["-y", "claude-guard-mcp"] } } }
```

**作为 CLI:**

```bash
npx claude-guard scan .           # 扫描当前目录(CRITICAL 时 exit 2)
npx claude-guard fix .            # 扫描 + 应用所有安全修复
npx claude-guard report --open    # 自包含 HTML 报告,浏览器打开
npx claude-guard sarif . > out.sarif       # GitHub Code Scanning
npx claude-guard install-hooks    # 阻断 CRITICAL 的 pre-commit 钩子
```

完整命令: `npx claude-guard --help`。

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

## 如何保持安全

简版:

- 默认零网络调用、零 LLM 调用。
- 规则 **仅 YAML**,加载时用 JSON Schema + `safe-regex2`(ReDoS 保护)校验。
- 红队模式默认关闭,仅 loopback,字符串检查 + DNS 再解析双重强制。
- 修复永不替你提交,并始终写回滚补丁。

完整模型: **[`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md)**。

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

完整目录: **[`docs/rules.md`](docs/rules.md)**(用 `claude-guard docs` 再生成)。

## 对比

| | claude-guard | Semgrep | Gitleaks | Snyk Code | SonarQube |
|---|---|---|---|---|---|
| 面向 Claude 的 MCP 服务器 | ✅ | — | — | — | — |
| AI 专用规则 | ✅ | 部分 | — | — | — |
| 勾选式自动修复 + Git 分支暂存 | ✅ | — | — | — | — |
| 零密钥 / 默认零网络 | ✅ | ✅ | ✅ | — | — |
| SARIF 2.1.0 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 规则数 | 155 | 2000+ | 仅密钥 | 数千 | 数千 |

与 Semgrep / Sonar / Snyk **并用,而非替代**。

## FAQ

**会把代码发到哪里吗?** 不会。零网络调用、零遥测、不需要 LLM API 密钥。

**会从规则文件执行代码吗?** 不会。仅 YAML。每条正则加载时都会过 ReDoS 检查。

**为什么是勾选式而不是全自动?** 对误报自动修复会把检测错误变成功能回归。信任规则集时可用 `apply_fixes --mode=all_safe` 批量适用。

**能替代 Snyk / Semgrep / Sonar 吗?** 不能,并用。claude-guard 的定位是"Claude 助写代码最常错的 150 件事,每件配好修复"。

更多: [`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md)。

## 许可证

MIT — 详见 [`LICENSE`](LICENSE)。漏洞披露: [`SECURITY.md`](SECURITY.md)。
