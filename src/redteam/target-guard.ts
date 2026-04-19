import dns from "dns/promises";
import net from "net";

const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export type GuardResult =
  | { ok: true; url: URL; resolvedIPs: string[] }
  | { ok: false; reason: string };

export async function validateTarget(raw: string): Promise<GuardResult> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "BAD_URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "PROTOCOL" };
  }
  const host = stripBrackets(url.hostname).toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) return { ok: false, reason: "HOSTNAME" };

  let ips: string[] = [];
  if (net.isIP(host)) {
    ips = [host];
  } else {
    try {
      const rec = await dns.lookup(host, { all: true });
      ips = rec.map((r) => r.address);
    } catch {
      return { ok: false, reason: "DNS_FAIL" };
    }
  }
  for (const ip of ips) {
    if (!isLoopback(ip)) return { ok: false, reason: "DNS_REBIND" };
  }
  return { ok: true, url, resolvedIPs: ips };
}

function stripBrackets(h: string): string {
  return h.startsWith("[") && h.endsWith("]") ? h.slice(1, -1) : h;
}

export function isLoopback(ip: string): boolean {
  if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") return true;
  if (ip === "0.0.0.0") return true;
  const v = net.isIP(ip);
  if (v === 4) return ip.startsWith("127.");
  if (v === 6) return ip === "::1";
  return false;
}
