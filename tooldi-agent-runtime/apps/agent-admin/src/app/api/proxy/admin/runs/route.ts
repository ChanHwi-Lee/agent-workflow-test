import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const upstream =
  process.env.AGENT_API_INTERNAL_URL ?? "http://localhost:3000";

export async function GET(req: NextRequest) {
  const res = await fetch(
    `${upstream}/api/admin/runs${req.nextUrl.search}`,
    { cache: "no-store" },
  );
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
