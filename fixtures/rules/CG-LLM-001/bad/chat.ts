export async function call(userInput: string, client: any) {
  return client.messages.create({
    model: "claude-opus-4-7",
    messages: [
      { role: "system", content: `You are helpful. ${userInput}` },
    ],
  });
}
