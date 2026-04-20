export async function stripeWebhook(req: any, res: any) {
  const event = req.body;
  if (event.type === "checkout.session.completed") {
    await req.body; // process raw payload — no signature verification
  }
  res.json({ received: true });
}
