export async function chat(client: any, prompt: string) {
  return client.messages.create({
    model: "claude-opus-4-7",
    messages: [{ role: "user", content: prompt }],
  });
}
