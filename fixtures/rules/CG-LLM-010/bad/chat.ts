export async function ask(client: any) {
  return client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 256,
    messages: [{ role: "user", content: `My API key is ${process.env.STRIPE_SECRET_KEY}` }],
  });
}
