export async function streamTo(res: any, client: any, prompt: string) {
  for await (const chunk of client.messages.stream({ model: "claude-opus-4-7", max_tokens: 8192, messages: [{ role: "user", content: prompt }] })) {
    res.write(chunk.text ?? "");
  }
  res.end();
}
