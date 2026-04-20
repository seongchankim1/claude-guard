export async function chat(client: any, prompt: string) {
  return client.messages.create({
    model: "claude-opus-4-7",
    stream: true,
    messages: [{ role: "user", content: prompt }],
  });
}
