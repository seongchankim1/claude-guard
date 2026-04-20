// INTENTIONALLY VULNERABLE — for claude-guard demos only.
import Anthropic from "@anthropic-ai/sdk";

// Client-side-visible API key (CG-LLM-003) — NEXT_PUBLIC is a client-readable prefix.
const client = new Anthropic({ apiKey: process.env.NEXT_PUBLIC_ANTHROPIC_KEY! });

export async function POST(req: Request) {
  const { prompt } = await req.json();
  return Response.json(
    await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 512,
      // User input interpolated into system prompt (CG-LLM-001)
      messages: [
        { role: "system", content: `You are a helpful assistant. ${prompt}` },
      ],
    })
  );
}
