// INTENTIONALLY VULNERABLE — for claude-guard demos only.
// Stripe webhook with no signature verification (CG-CFG-015)
export async function POST(req: Request) {
  const event = await req.json();
  if (event.type === "checkout.session.completed") {
    // pretend to mark the order paid
  }
  return Response.json({ received: true });
}
