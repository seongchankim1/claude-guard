import { validateTarget } from "./target-guard.js";
import { checkRate } from "./rate-limit.js";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

export interface ProbeResult {
  ok: boolean;
  status?: number;
  reason?: string;
  bodyExcerpt?: string;
  logPath: string;
}

export async function probe(
  projectPath: string,
  target: string,
  findingId: string
): Promise<ProbeResult> {
  const logDir = join(projectPath, ".claude-guard", "redteam");
  await mkdir(logDir, { recursive: true });
  const logPath = join(logDir, `${findingId}.log`);

  const rate = checkRate(findingId);
  if (!rate.ok) {
    await writeFile(logPath, `blocked: ${rate.reason}\n`);
    return { ok: false, reason: rate.reason, logPath };
  }

  const guard = await validateTarget(target);
  if (!guard.ok) {
    await writeFile(logPath, `blocked: ${guard.reason}\n`);
    return { ok: false, reason: guard.reason, logPath };
  }

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(guard.url, {
      method: "GET",
      redirect: "manual",
      signal: ctrl.signal,
    });
    const reader = res.body?.getReader();
    let received = 0;
    let body = "";
    const decoder = new TextDecoder();
    if (reader) {
      while (received < 1_000_000) {
        const { value, done } = await reader.read();
        if (done) break;
        received += value.byteLength;
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    }
    await writeFile(
      logPath,
      `GET ${target}\nstatus: ${res.status}\n---\n${body.slice(0, 2000)}\n`
    );
    return {
      ok: true,
      status: res.status,
      bodyExcerpt: body.slice(0, 500),
      logPath,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await writeFile(logPath, `error: ${msg}\n`);
    return { ok: false, reason: "NETWORK", logPath };
  } finally {
    clearTimeout(to);
  }
}
