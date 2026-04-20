"use client";
export async function ask(prompt: string) {
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    body: JSON.stringify({
      model: "claude-opus-4-7",
      apiKey: "sk-ant-FAKE-FOR-DEMO-ONLY-12345",
      messages: [{ role: "user", content: prompt }],
    }),
  });
}
