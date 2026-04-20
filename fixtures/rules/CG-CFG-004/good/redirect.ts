import { NextResponse } from "next/server";
const ALLOW = new Set(["/dashboard", "/home"]);
export function GET(req: Request) {
  const to = new URL(req.url).searchParams.get("to") ?? "/home";
  return NextResponse.redirect(ALLOW.has(to) ? to : "/home");
}
