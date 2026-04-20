"use client";
export async function ask(prompt: string) {
  return fetch("/api/chat", {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
}
