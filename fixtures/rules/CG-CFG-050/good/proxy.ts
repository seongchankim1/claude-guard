export async function proxy() {
  const res = await fetch("https://api.example.com/data", { signal: AbortSignal.timeout(5000) });
  return res.json();
}
