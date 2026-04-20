import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.js";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

async function connectedClient(): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const server = buildServer();
  await server.connect(serverT);
  const client = new Client(
    { name: "integration-test", version: "0.0.0" },
    { capabilities: {} }
  );
  await client.connect(clientT);
  return {
    client,
    cleanup: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe("MCP server integration (real SDK client)", () => {
  it("listTools returns every documented tool", async () => {
    const { client, cleanup } = await connectedClient();
    try {
      const result = await client.listTools();
      const names = result.tools.map((t) => t.name).sort();
      expect(names).toEqual(
        [
          "apply_fixes",
          "explain",
          "export_sarif",
          "init_config",
          "list_checks",
          "list_findings",
          "redteam_probe",
          "rollback",
          "scan",
          "score",
        ].sort()
      );
    } finally {
      await cleanup();
    }
  });

  it("listResources returns the four findings / catalog resources", async () => {
    const { client, cleanup } = await connectedClient();
    try {
      const result = await client.listResources();
      const uris = result.resources.map((r) => r.uri).sort();
      expect(uris).toEqual(
        [
          "claude-guard://latest/findings.json",
          "claude-guard://latest/findings.md",
          "claude-guard://latest/scorecard.json",
          "claude-guard://rules/catalog.md",
        ].sort()
      );
    } finally {
      await cleanup();
    }
  });

  it("scan → list_findings → score happy path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-mcp-"));
    writeFileSync(
      join(dir, ".env"),
      "NEXT_PUBLIC_OPENAI_KEY=sk-test1234567890abcdef\n"
    );
    const { client, cleanup } = await connectedClient();
    try {
      const scan = (await client.callTool({
        name: "scan",
        arguments: { project_path: dir, layers: ["l2"] },
      })) as { content: { type: string; text: string }[] };
      const scanBody = JSON.parse(scan.content[0].text);
      expect(scanBody.finding_count).toBeGreaterThan(0);

      const list = (await client.callTool({
        name: "list_findings",
        arguments: { project_path: dir },
      })) as { content: { type: string; text: string }[] };
      expect(list.content[0].text).toContain("CG-SEC-001");
      expect(list.content[0].text).toContain("Security scorecard");

      const score = (await client.callTool({
        name: "score",
        arguments: { project_path: dir },
      })) as { content: { type: string; text: string }[] };
      const scoreBody = JSON.parse(score.content[0].text);
      expect(scoreBody.grade).toMatch(/^[A-F]\+?$/);
      expect(scoreBody.score).toBeLessThanOrEqual(100);
    } finally {
      await cleanup();
    }
  });

  it("rules catalog resource returns markdown with rule ids", async () => {
    const { client, cleanup } = await connectedClient();
    try {
      const res = (await client.readResource({
        uri: "claude-guard://rules/catalog.md",
      })) as { contents: { uri: string; text: string; mimeType?: string }[] };
      expect(res.contents[0].mimeType).toBe("text/markdown");
      expect(res.contents[0].text).toContain("CG-SEC-001");
      expect(res.contents[0].text).toContain("claude-guard rule catalogue");
    } finally {
      await cleanup();
    }
  });
});
