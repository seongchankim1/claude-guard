import { describe, it, expect, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.js";
import { resetRateLimitForTests } from "../src/redteam/rate-limit.js";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
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

describe("redteam_probe opt-in gate", () => {
  beforeEach(() => resetRateLimitForTests());

  it("refuses to run when redteam.enabled is false (default)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-rt-"));
    const { client, cleanup } = await connect();
    try {
      const res = (await client.callTool({
        name: "redteam_probe",
        arguments: {
          project_path: dir,
          target: "http://localhost:9",
          finding_id: "gate-test",
        },
      })) as { content: { text: string }[] };
      const body = JSON.parse(res.content[0].text);
      expect(body.ok).toBe(false);
      expect(body.reason).toBe("REDTEAM_DISABLED");
    } finally {
      await cleanup();
    }
  });

  it("runs the probe when redteam.enabled is true (still refuses non-loopback)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-rt-"));
    mkdirSync(join(dir, ".claude-guard"), { recursive: true });
    writeFileSync(
      join(dir, ".claude-guard/config.yaml"),
      "version: 1\nredteam:\n  enabled: true\n"
    );
    const { client, cleanup } = await connect();
    try {
      const res = (await client.callTool({
        name: "redteam_probe",
        arguments: {
          project_path: dir,
          target: "http://example.com",
          finding_id: "gate-enabled-but-external",
        },
      })) as { content: { text: string }[] };
      const body = JSON.parse(res.content[0].text);
      // Opt-in was honored (not REDTEAM_DISABLED), and the URL guard
      // then rejected the external target.
      expect(body.ok).toBe(false);
      expect(body.reason).not.toBe("REDTEAM_DISABLED");
    } finally {
      await cleanup();
    }
  });
});
