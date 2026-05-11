import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const upstream =
  process.env.AGENT_API_INTERNAL_URL ?? "http://localhost:3000";

export async function GET(
  _req: NextRequest,
  { params }: { params: { runId: string } },
) {
  const res = await fetch(
    `${upstream}/api/admin/runs/${encodeURIComponent(params.runId)}`,
    { cache: "no-store" },
  );
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
