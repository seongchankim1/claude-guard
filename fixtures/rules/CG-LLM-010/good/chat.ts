export async function ask(client: any) {
  return client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 256,
    messages: [{ role: "user", content: "Summarize the invoice in three bullets." }],
  });
}
