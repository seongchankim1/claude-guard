import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.js";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  utimesSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Regression test for the UUID-string-sort bug in latestScanId.
// UUIDs are not time-ordered — if we sorted lexicographically, a scan
// whose UUID sorts *last* would always win even if it was written first.
describe("latestScanId picks by mtime, not UUID lex order", () => {
  it("uses findings.json mtime to pick the newest scan", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-latest-"));
    const scans = join(dir, ".claude-guard/scans");

    // Write two scans in reverse UUID-lex order.
    // - "ffff..." has the lexicographically LATEST UUID and is written FIRST
    // - "0000..." has the lexicographically EARLIEST UUID and is written SECOND (= actually newest)
    const oldUuidButLexHigh = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    const newUuidButLexLow = "00000000-0000-0000-0000-000000000001";

    for (const id of [oldUuidButLexHigh, newUuidButLexLow]) {
      mkdirSync(join(scans, id), { recursive: true });
      writeFileSync(
        join(scans, id, "findings.json"),
        JSON.stringify({ scan_id: id, findings: [] })
      );
    }

    const now = Date.now() / 1000;
    utimesSync(join(scans, oldUuidButLexHigh, "findings.json"), now - 60, now - 60);
    utimesSync(join(scans, newUuidButLexLow, "findings.json"), now, now);

    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const server = buildServer();
    await server.connect(serverT);
    const client = new Client({ name: "t", version: "0" }, { capabilities: {} });
    await client.connect(clientT);
    try {
      const res = (await client.callTool({
        name: "list_findings",
        arguments: { project_path: dir },
      })) as { content: { text: string }[] };
      // The rendered findings.md header contains the chosen scan_id.
      // With the bug, we'd pick oldUuidButLexHigh. With the fix, we pick the newer one.
      expect(res.content[0].text).toContain(newUuidButLexLow);
      expect(res.content[0].text).not.toContain(oldUuidButLexHigh);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
