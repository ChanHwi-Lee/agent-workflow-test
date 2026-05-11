import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const upstream =
  process.env.AGENT_API_INTERNAL_URL ?? "http://localhost:3000";

export async function GET(
  req: NextRequest,
  { params }: { params: { runId: string } },
) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) {
    return new Response("missing key", { status: 400 });
  }
  // Forward to public agent-api artifact endpoint (NOT under /api/admin/*);
  // it enforces `runs/<runId>/` prefix scoping server-side.
  const res = await fetch(
    `${upstream}/api/agent-workflow/runs/${encodeURIComponent(params.runId)}/artifacts?key=${encodeURIComponent(key)}`,
    { cache: "no-store" },
  );
  return new Response(res.body, {
    status: res.status,
    headers: {
      "Content-Type":
        res.headers.get("Content-Type") ?? "application/octet-stream",
    },
  });
}
