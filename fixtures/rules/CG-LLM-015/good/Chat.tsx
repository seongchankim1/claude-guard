"use client";
import { useState } from "react";

export function Chat() {
  const [v, setV] = useState("");
  return (
    <form action="/api/chat">
      <input value={v} onChange={(e) => setV(e.target.value)} />
    </form>
  );
}
