import { spawn } from "child_process";

export function detectBinary(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(bin, ["--version"], { stdio: "ignore", shell: false });
    p.on("error", () => resolve(false));
    p.on("exit", (code) => resolve(code === 0));
  });
}

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export function runBinary(
  bin: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number } = {}
): Promise<RunResult> {
  return new Promise((resolve) => {
    const p = spawn(bin, args, { cwd: opts.cwd, shell: false });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    p.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    const to = setTimeout(() => p.kill("SIGKILL"), opts.timeoutMs ?? 300000);
    p.on("close", (code) => {
      clearTimeout(to);
      resolve({ stdout, stderr, code });
    });
    p.on("error", () => {
      clearTimeout(to);
      resolve({ stdout, stderr, code: -1 });
    });
  });
}
