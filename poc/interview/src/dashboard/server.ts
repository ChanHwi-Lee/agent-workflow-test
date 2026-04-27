import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT ?? 4173);

function pocRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/dashboard -> poc/interview
  return resolve(here, "../..");
}

const PUBLIC_DIR = resolve(pocRoot(), "public");
const RUNS_DIR = resolve(pocRoot(), "runs");

const SAFE_ID = /^[A-Za-z0-9_.:-]+$/;
function safe(s: string | null | undefined): string | null {
  if (!s) return null;
  return SAFE_ID.test(s) ? s : null;
}

function send(
  res: ServerResponse,
  status: number,
  body: string | Buffer,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, { "cache-control": "no-store", ...headers });
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, obj: unknown): void {
  send(res, status, JSON.stringify(obj), {
    "content-type": "application/json; charset=utf-8",
  });
}

const CONTENT_TYPE: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
};

async function serveStatic(res: ServerResponse, absPath: string): Promise<void> {
  try {
    const buf = await readFile(absPath);
    const ct =
      CONTENT_TYPE[extname(absPath).toLowerCase()] ?? "application/octet-stream";
    send(res, 200, buf, { "content-type": ct });
  } catch {
    send(res, 404, "not-found");
  }
}

interface RunSetInfo {
  timestamp: string;
  paths: Array<"a" | "b">;
  seeds: string[];
}

async function collectRunsInfo(): Promise<RunSetInfo[]> {
  const out: RunSetInfo[] = [];
  let entries: string[];
  try {
    entries = await readdir(RUNS_DIR);
  } catch {
    return out;
  }
  for (const ts of entries) {
    if (!SAFE_ID.test(ts)) continue;
    const tsPath = resolve(RUNS_DIR, ts);
    try {
      const s = await stat(tsPath);
      if (!s.isDirectory()) continue;
    } catch {
      continue;
    }
    let seedDirs: string[] = [];
    try {
      seedDirs = await readdir(tsPath);
    } catch {
      // skip
    }
    const seeds: string[] = [];
    const paths = new Set<"a" | "b">();
    for (const seed of seedDirs) {
      if (!SAFE_ID.test(seed)) continue;
      const seedAbs = resolve(tsPath, seed);
      let seedStat;
      try {
        seedStat = await stat(seedAbs);
      } catch {
        continue;
      }
      if (!seedStat.isDirectory()) continue;
      let has = false;
      for (const p of ["a", "b"] as const) {
        try {
          const st = await stat(resolve(seedAbs, p));
          if (st.isDirectory()) {
            paths.add(p);
            has = true;
          }
        } catch {
          // ignore
        }
      }
      if (has) seeds.push(seed);
    }
    if (paths.size > 0)
      out.push({
        timestamp: ts,
        paths: Array.from(paths).sort() as Array<"a" | "b">,
        seeds,
      });
  }
  out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return out;
}

async function readRunFile(
  ts: string,
  seed: string,
  path: "a" | "b",
  idx: string,
  file: string,
): Promise<Buffer | null> {
  if (
    !safe(ts) ||
    !safe(seed) ||
    (path !== "a" && path !== "b") ||
    !safe(idx) ||
    !safe(file)
  )
    return null;
  const p = resolve(RUNS_DIR, ts, seed, path, idx, file);
  try {
    return await readFile(p);
  } catch {
    return null;
  }
}

async function readScoresFile(tsB: string): Promise<unknown[]> {
  const path = resolve(RUNS_DIR, tsB, "scores.json");
  try {
    const text = (await readFile(path)).toString("utf-8");
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface ScoreEntry {
  readonly tsA: string;
  readonly tsB: string;
  readonly seedId: string;
  readonly runIdx: string;
  readonly axesA: Record<string, number>;
  readonly axesB: Record<string, number>;
  readonly comment: string;
  readonly savedAt: string;
}

async function appendScore(tsB: string, entry: ScoreEntry): Promise<void> {
  const path = resolve(RUNS_DIR, tsB, "scores.json");
  const existing = (await readScoresFile(tsB)) as ScoreEntry[];
  const filtered = existing.filter(
    (x) =>
      !(
        x.tsA === entry.tsA &&
        x.seedId === entry.seedId &&
        String(x.runIdx) === String(entry.runIdx)
      ),
  );
  filtered.push(entry);
  await writeFile(path, JSON.stringify(filtered, null, 2), "utf-8");
}

async function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const m = req.method ?? "GET";

    if (
      m === "GET" &&
      (url.pathname === "/" || url.pathname === "/index.html")
    ) {
      await serveStatic(res, resolve(PUBLIC_DIR, "index.html"));
      return;
    }
    if (
      m === "GET" &&
      (url.pathname === "/app.js" || url.pathname === "/style.css")
    ) {
      await serveStatic(res, resolve(PUBLIC_DIR, url.pathname.slice(1)));
      return;
    }

    if (m === "GET" && url.pathname === "/api/manifests") {
      const info = await collectRunsInfo();
      sendJson(res, 200, info);
      return;
    }
    if (m === "GET" && url.pathname === "/api/pair") {
      const tsA = safe(url.searchParams.get("tsA"));
      const tsB = safe(url.searchParams.get("tsB"));
      const seedId = safe(url.searchParams.get("seed"));
      const runIdx = safe(url.searchParams.get("idx"));
      if (!tsA || !tsB || !seedId || !runIdx) {
        send(res, 400, "bad-request");
        return;
      }
      const metaA = await readRunFile(tsA, seedId, "a", runIdx, "meta.json");
      const metaB = await readRunFile(tsB, seedId, "b", runIdx, "meta.json");
      const interview = await readRunFile(
        tsB,
        seedId,
        "b",
        runIdx,
        "interview.json",
      );
      sendJson(res, 200, {
        tsA,
        tsB,
        seedId,
        runIdx,
        metaA: metaA ? JSON.parse(metaA.toString()) : null,
        metaB: metaB ? JSON.parse(metaB.toString()) : null,
        interview: interview ? JSON.parse(interview.toString()) : null,
      });
      return;
    }
    if (
      m === "GET" &&
      (url.pathname === "/api/screenshot" || url.pathname === "/api/html")
    ) {
      const ts = safe(url.searchParams.get("ts"));
      const seed = safe(url.searchParams.get("seed"));
      const path = url.searchParams.get("path");
      const idx = safe(url.searchParams.get("idx"));
      if (!ts || !seed || (path !== "a" && path !== "b") || !idx) {
        send(res, 400, "bad-request");
        return;
      }
      const file =
        url.pathname === "/api/screenshot" ? "screenshot.png" : "html.html";
      const buf = await readRunFile(ts, seed, path, idx, file);
      if (!buf) {
        send(res, 404, "not-found");
        return;
      }
      const ct =
        url.pathname === "/api/screenshot" ? "image/png" : "text/html; charset=utf-8";
      send(res, 200, buf, { "content-type": ct });
      return;
    }
    if (m === "GET" && url.pathname === "/api/scores") {
      const tsB = safe(url.searchParams.get("tsB"));
      if (!tsB) {
        send(res, 400, "bad-request");
        return;
      }
      const scores = await readScoresFile(tsB);
      sendJson(res, 200, scores);
      return;
    }
    if (m === "POST" && url.pathname === "/api/score") {
      let body: unknown;
      try {
        body = await parseJsonBody(req);
      } catch {
        send(res, 400, "bad-json");
        return;
      }
      const b = body as Partial<ScoreEntry> & { runIdx?: string | number };
      if (
        !safe(b.tsA ?? null) ||
        !safe(b.tsB ?? null) ||
        !safe(b.seedId ?? null) ||
        !safe(String(b.runIdx ?? "")) ||
        typeof b.axesA !== "object" ||
        typeof b.axesB !== "object" ||
        b.axesA === null ||
        b.axesB === null
      ) {
        send(res, 400, "bad-shape");
        return;
      }
      const entry: ScoreEntry = {
        tsA: b.tsA as string,
        tsB: b.tsB as string,
        seedId: b.seedId as string,
        runIdx: String(b.runIdx),
        axesA: b.axesA as Record<string, number>,
        axesB: b.axesB as Record<string, number>,
        comment: typeof b.comment === "string" ? b.comment : "",
        savedAt: new Date().toISOString(),
      };
      await appendScore(entry.tsB, entry);
      sendJson(res, 200, { ok: true });
      return;
    }

    send(res, 404, "not-found");
  } catch (e) {
    console.error("[dashboard] error", e);
    send(res, 500, "server-error");
  }
});

server.listen(PORT, () => {
  console.log(`[dashboard] listening http://localhost:${PORT}`);
  console.log(`[dashboard] runs dir: ${RUNS_DIR}`);
});
