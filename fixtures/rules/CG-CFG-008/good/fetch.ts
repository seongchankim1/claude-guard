const ALLOW = new Set(["https://api.example.com"]);
export async function proxy(req: Request) {
  const target = new URL(req.url).searchParams.get("target") ?? "";
  if (!ALLOW.has(target)) throw new Error("denied");
  return fetch(target);
}
