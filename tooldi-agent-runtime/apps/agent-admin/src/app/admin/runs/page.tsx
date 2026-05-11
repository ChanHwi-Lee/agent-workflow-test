import { RunsList } from "@/components/RunsList";
import { adminApi } from "@/lib/adminApi";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const initial = await adminApi.listRuns({ limit: 50 });
  return (
    <main className="p-6 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">AGW Runs</h1>
        <span className="text-xs text-zinc-500">5s 자동 갱신</span>
      </header>
      <RunsList initial={initial} />
    </main>
  );
}
