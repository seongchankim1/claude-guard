import { NextResponse } from "next/server";
export async function GET() {
  return new NextResponse("<html>body</html>", { status: 200 });
}
