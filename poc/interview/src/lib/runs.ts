import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export interface RunMeta {
  readonly runId: string;
  readonly timestamp: string;
  readonly seedId: string;
  readonly seedLabel: string;
  readonly path: "a" | "b";
  readonly runIdx: number;
  readonly canvas: { width: number; height: number };
  readonly prompt: string;
  readonly model: string;
  readonly latencyMs: number;
  readonly usage: unknown | null;
  readonly htmlBytes: number;
  readonly extractionElementCount: number;
  readonly error?: string;
}

export interface SaveRunArgs {
  readonly timestamp: string;
  readonly seedId: string;
  readonly path: "a" | "b";
  readonly runIdx: number;
  readonly html: string;
  readonly screenshot: Buffer;
  readonly meta: RunMeta;
  readonly interview?: unknown;
}

function pocRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/lib/ -> poc/interview
  return resolve(here, "../..");
}

export function runsRoot(): string {
  return resolve(pocRoot(), "runs");
}

export function makeTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export async function saveRun(args: SaveRunArgs): Promise<string> {
  const dir = resolve(
    runsRoot(),
    args.timestamp,
    args.seedId,
    args.path,
    String(args.runIdx),
  );
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, "html.html"), args.html, "utf-8");
  await writeFile(resolve(dir, "screenshot.png"), args.screenshot);
  await writeFile(
    resolve(dir, "meta.json"),
    JSON.stringify(args.meta, null, 2),
    "utf-8",
  );
  if (args.interview !== undefined) {
    await writeFile(
      resolve(dir, "interview.json"),
      JSON.stringify(args.interview, null, 2),
      "utf-8",
    );
  }
  return dir;
}

export async function writeManifest(
  timestamp: string,
  runs: readonly RunMeta[],
): Promise<string> {
  const dir = resolve(runsRoot(), timestamp);
  await mkdir(dir, { recursive: true });
  const path = resolve(dir, "manifest.json");
  await writeFile(
    path,
    JSON.stringify({ timestamp, runs }, null, 2),
    "utf-8",
  );
  return path;
}
