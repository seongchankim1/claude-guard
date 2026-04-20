export async function proxy(req: Request) {
  const url = new URL(req.url);
  return fetch(url.searchParams.get("target")!);
}
