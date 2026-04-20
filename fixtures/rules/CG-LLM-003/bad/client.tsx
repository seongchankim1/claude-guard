import Anthropic from "@anthropic-ai/sdk";
export const client = new Anthropic({ apiKey: process.env.NEXT_PUBLIC_ANTHROPIC_KEY! });
