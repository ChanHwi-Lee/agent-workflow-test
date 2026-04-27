import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export interface SeedPrompt {
  readonly id: string;
  readonly label: string;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly prompt: string;
}

export async function loadSeeds(): Promise<SeedPrompt[]> {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/lib/ -> poc/interview/seeds/seeds.json
  const path = resolve(here, "../../seeds/seeds.json");
  const text = await readFile(path, "utf-8");
  const parsed = JSON.parse(text) as { seeds: SeedPrompt[] };
  return parsed.seeds;
}
