# Security Policy

## Reporting a vulnerability

Please report privately — do **not** open public issues for suspected vulnerabilities.

- **Preferred:** [open a private GitHub Security Advisory](https://github.com/seongchankim1/claude-guard/security/advisories/new) on this repo.
- **Alternative:** email the maintainer at `minielec7@gmail.com` with the subject `[claude-guard security]`.

We aim to acknowledge within 72 hours and triage within 7 days. Please share:

1. A description of the issue and its impact.
2. Minimal steps to reproduce.
3. The claude-guard version and platform you tested on.

## Intended use

`claude-guard` is a defensive-security tool for auditing code you own, or code you have explicit written authorization to test. Using the red-team mode against third-party systems without authorization is prohibited and may be illegal in your jurisdiction.

## Red-team mode guardrails

- Targets are restricted to `localhost`, `127.0.0.1`, `::1`, `0.0.0.0`.
- DNS responses are re-validated so that DNS rebinding cannot smuggle a public IP past the hostname check.
- Per-finding rate limiting: 1 probe per finding per scan, 10 probes per minute per process.
- HTTP redirects are not followed, so the probe cannot be bounced to an external service.
- All probe requests and responses are logged under `.claude-guard/redteam/`.

## Supply-chain posture

- Builtin rules are shipped as YAML. Community plugins must also be YAML-only; we do not load arbitrary JavaScript from plugins in core.
- Rule regex patterns are validated with a ReDoS check (`safe-regex2`) at load time and reject the entire rule set if a pattern is unsafe.
- JSON Schema validation on every rule prevents malformed or partially-typed rules from reaching the scanner.

## Known limitations

- L1 adapters (Semgrep, Gitleaks) shell out to user-provided binaries. Make sure those binaries come from trusted sources.
- Automatic fixes can rewrite files. Always run on a clean working tree; `claude-guard` refuses to modify a dirty tree by default.
