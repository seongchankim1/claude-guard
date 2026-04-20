"use client";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: "sk-ant-placeholder" });

export function Chat() {
  return <div>chat {String(!!client)}</div>;
}
