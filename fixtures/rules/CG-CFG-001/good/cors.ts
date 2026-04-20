const ALLOW = new Set(["https://app.example.com"]);
export function headers(origin: string) {
  return { "Access-Control-Allow-Origin": ALLOW.has(origin) ? origin : "" };
}
