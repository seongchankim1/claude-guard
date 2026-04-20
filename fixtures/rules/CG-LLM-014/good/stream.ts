const MAX_BYTES = 32 * 1024;
export async function streamTo(res: any, client: any, prompt: string) {
  let sent = 0;
  const stream = await client.messages.stream({ model: "claude-opus-4-7", max_tokens: 2048, messages: [{ role: "user", content: prompt }] });
  stream.on("text", (chunk: string) => {
    sent += Buffer.byteLength(chunk, "utf8");
    if (sent > MAX_BYTES) { stream.abort?.(); res.end(); return; }
    res.write(chunk);
  });
  stream.on("end", () => res.end());
}
