export async function answer(client: any, docs: string, question: string) {
  return client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 512,
    messages: [
      { role: "system", content: `Answer using the retrieved docs: ${docs}` },
      { role: "user", content: question },
    ],
  });
}
