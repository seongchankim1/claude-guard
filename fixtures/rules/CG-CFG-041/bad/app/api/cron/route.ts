export async function GET() {
  // No secret check — Vercel cron but also the world can hit this.
  return Response.json({ ok: true });
}
