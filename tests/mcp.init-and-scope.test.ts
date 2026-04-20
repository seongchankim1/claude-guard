import { describe, it, expect, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.js";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

async function connect(): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const server = buildServer();
  await server.connect(serverT);
  const client = new Client({ name: "t", version: "0" }, { capabilities: {} });
  await client.connect(clientT);
  return {
    client,
    cleanup: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe("init_config is non-destructive", () => {
  it("refuses to overwrite an existing config without force=true", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-init-"));
    mkdirSync(join(dir, ".claude-guard"), { recursive: true });
    writeFileSync(
      join(dir, ".claude-guard/config.yaml"),
      "version: 1\nseverity_overrides:\n  CG-SEC-001: LOW\n"
    );
    const { client, cleanup } = await connect();
    try {
      const res = (await client.callTool({
        name: "init_config",
        arguments: { project_path: dir },
      })) as { content: { text: string }[] };
      const body = JSON.parse(res.content[0].text);
      expect(body.ok).toBe(false);
      expect(body.reason).toBe("CONFIG_EXISTS");
      // Existing severity override preserved.
      const preserved = readFileSync(
        join(dir, ".claude-guard/config.yaml"),
        "utf8"
      );
      expect(preserved).toContain("CG-SEC-001: LOW");
    } finally {
      await cleanup();
    }
  });

  it("writes a config when one does not exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-init-fresh-"));
    const { client, cleanup } = await connect();
    try {
      const res = (await client.callTool({
        name: "init_config",
        arguments: { project_path: dir },
      })) as { content: { text: string }[] };
      const body = JSON.parse(res.content[0].text);
      expect(body.ok).toBe(true);
      expect(body.wrote_config).toBe(true);
    } finally {
      await cleanup();
    }
  });
});

describe("MCP resources scope to the last-scanned project", () => {
  beforeEach(() => {
    // Previous tests may have touched lastProject by calling scan —
    // the server module is process-global across this process, but
    // each `buildServer()` still shares the closure, so we isolate
    // by using a fresh tmpdir per test and relying on the last scan
    // to overwrite lastProject.
  });

  it("reading claude-guard://latest/findings.json after a scan uses the scanned project", async () => {
    const scannedProject = mkdtempSync(join(tmpdir(), "cg-scope-scanned-"));
    writeFileSync(
      join(scannedProject, ".env"),
      "NEXT_PUBLIC_OPENAI_KEY=sk-test1234567890abcdef\n"
    );

    const { client, cleanup } = await connect();
    try {
      // Run a scan against a project that is NOT process.cwd().
      await client.callTool({
        name: "scan",
        arguments: { project_path: scannedProject, layers: ["l2"] },
      });
      // Now read the "latest" resource. With the bug, this would resolve
      // against process.cwd() and say "No scans yet". With the fix, the
      // resource uses the last project_path.
      const res = (await client.readResource({
        uri: "claude-guard://latest/findings.json",
      })) as { contents: { text: string }[] };
      const body = JSON.parse(res.contents[0].text);
      expect(body.findings, "should see findings from the scanned project").toBeDefined();
      expect(Array.isArray(body.findings)).toBe(true);
      expect(body.findings.length).toBeGreaterThan(0);
    } finally {
      await cleanup();
    }
  });
});
