import type {
  AdminRunDetail,
  AdminRunsListResponse,
} from "@tooldi/agent-contracts";

const baseUrl = process.env.AGENT_API_INTERNAL_URL ?? "http://localhost:3000";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, { ...init, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`admin api ${res.status}: ${path}`);
  }
  return (await res.json()) as T;
}

export const adminApi = {
  listRuns: (q: { limit?: number; before?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (q.limit !== undefined) params.set("limit", String(q.limit));
    if (q.before) params.set("before", q.before);
    if (q.status) params.set("status", q.status);
    const qs = params.toString();
    const suffix = qs.length > 0 ? `?${qs}` : "";
    return fetchJson<AdminRunsListResponse>(`/api/admin/runs${suffix}`);
  },
  getRun: (runId: string) =>
    fetchJson<AdminRunDetail>(
      `/api/admin/runs/${encodeURIComponent(runId)}`,
    ),
};
