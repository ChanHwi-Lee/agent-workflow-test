#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const aDir = resolve(root, "outputs/method-a");
const bDir = resolve(root, "outputs/method-b");

async function loadDir(dir) {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const map = {};
  for (const f of files) {
    const raw = JSON.parse(await readFile(resolve(dir, f), "utf8"));
    map[raw.id] = raw;
  }
  return map;
}

const [a, b] = await Promise.all([loadDir(aDir), loadDir(bDir)]);

for (const id of Object.keys(a)) {
  try {
    a[id].parsed = JSON.parse(a[id].outputText);
  } catch (e) {
    a[id].parsed = null;
    a[id].parseError = String(e);
  }
}

const ids = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();

const payload = ids.map((id) => ({
  id,
  prompt: a[id]?.prompt ?? b[id]?.prompt ?? "",
  domain: a[id]?.domain ?? b[id]?.domain ?? "",
  a: {
    latency: a[id]?.latencyMs ?? null,
    ok: !!a[id]?.ok,
    parsed: a[id]?.parsed ?? null,
    outputBytes: a[id]?.outputBytes ?? null,
  },
  b: {
    latency: b[id]?.latencyMs ?? null,
    ok: !!b[id]?.ok,
    html: b[id]?.outputText ?? "",
    outputBytes: b[id]?.outputBytes ?? null,
  },
}));

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>Method A vs B — Visual QA (Phase-1 Bench)</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@100;300;400;500;700;900&family=Nanum+Gothic:wght@400;700;800&family=Black+Han+Sans&family=Jua&family=Do+Hyeon&family=Gaegu:wght@300;400;700&family=Gugi&family=Hi+Melody&family=Poor+Story&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/fabric@5.3.0/dist/fabric.min.js"></script>
<style>
  :root { --bg:#0e1116; --panel:#161a22; --text:#e6edf3; --muted:#8b949e; --accent:#58a6ff; --ok:#3fb950; --warn:#d29922; }
  * { box-sizing: border-box; }
  body { font-family: 'Pretendard Variable','Noto Sans KR',sans-serif; background:var(--bg); color:var(--text); margin:0; padding:24px 16px 64px; }
  header { max-width:1380px; margin:0 auto 24px; padding-bottom:16px; border-bottom:1px solid #22272f; }
  header h1 { margin:0 0 4px; font-size:22px; font-weight:700; }
  header .sub { color:var(--muted); font-size:13px; }
  header .hint { color:var(--warn); font-size:12px; margin-top:6px; }
  .row { max-width:1380px; margin:0 auto 20px; background:var(--panel); border-radius:10px; padding:14px; display:grid; grid-template-columns: 240px 1fr 1fr; gap:14px; }
  .meta .id { font-size:12px; color:var(--accent); font-weight:700; letter-spacing:.05em; }
  .meta .prompt { color:var(--text); margin-top:6px; font-size:14px; font-weight:500; line-height:1.45; }
  .meta .domain { color:var(--muted); font-size:11px; margin-top:8px; text-transform:uppercase; letter-spacing:.08em; }
  .meta .latencies { color:var(--muted); font-size:11px; margin-top:14px; line-height:1.6; }
  .meta .latencies span { color:var(--accent); font-variant-numeric: tabular-nums; }
  .pane { background:#0a0d12; border-radius:8px; padding:10px; }
  .pane .label { font-size:11px; color:var(--muted); margin-bottom:6px; display:flex; justify-content:space-between; }
  .pane .label b { color:var(--text); }
  .stage { width:540px; height:283px; background:#fff; overflow:hidden; position:relative; border-radius:4px; }
  .stage canvas { transform: scale(.45); transform-origin: top left; display:block; }
  .stage iframe { width:1200px; height:628px; border:0; transform: scale(.45); transform-origin: top left; display:block; }
  .badge { display:inline-block; padding:2px 6px; border-radius:3px; font-size:10px; margin-left:4px; }
  .badge.ok { background:rgba(63,185,80,.15); color:var(--ok); }
  .badge.fail { background:rgba(248,81,73,.15); color:#f85149; }
  .toolbar { max-width:1380px; margin:0 auto 16px; display:flex; gap:8px; align-items:center; color:var(--muted); font-size:12px; }
  .toolbar label { display:inline-flex; align-items:center; gap:6px; cursor:pointer; }
  .legend { color:var(--muted); font-size:11px; margin-top:10px; }
</style>
</head>
<body>
<header>
  <h1>Method A (native JSON) vs Method B (constrained HTML) — Visual QA</h1>
  <div class="sub">Gemini 2.5 Pro · 20 Korean banner prompts · 1200×628 @ 0.45 scale</div>
  <div class="hint">※ Method A 의 이미지는 placeholder rect로만 표시 (실제 에셋 RAG 전 단계). Method B 의 img placeholder는 깨진 이미지 아이콘.</div>
</header>

<div id="rows"></div>

<script>
const DATA = ${JSON.stringify(payload)};

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderA(canvasEl, parsed) {
  const stage = new fabric.StaticCanvas(canvasEl, { width: 1200, height: 628, backgroundColor: "#ffffff" });
  if (!parsed || !Array.isArray(parsed.objects)) {
    stage.add(new fabric.Text("parse failed", { left: 10, top: 10, fontSize: 24, fill: "#d00" }));
    stage.renderAll();
    return;
  }
  for (const o of parsed.objects) {
    try {
      if (o.type === "rect") {
        stage.add(new fabric.Rect({
          left: o.left, top: o.top, width: o.width, height: o.height,
          fill: o.fill || "#ddd", rx: o.rx || 0, ry: o.rx || 0, opacity: o.opacity ?? 1,
          selectable: false,
        }));
      } else if (o.type === "text") {
        stage.add(new fabric.Textbox(String(o.text || ""), {
          left: o.left, top: o.top, width: o.width, height: o.height,
          fontSize: o.fontSize || 24, fontFamily: o.fontFamily || "Noto Sans KR",
          fontWeight: o.fontWeight || 400, fill: o.fill || "#000",
          textAlign: o.textAlign || "left", lineHeight: 1.2, selectable: false,
          splitByGrapheme: true,
        }));
      } else if (o.type === "image") {
        stage.add(new fabric.Rect({
          left: o.left, top: o.top, width: o.width, height: o.height,
          fill: "#eaeef2", stroke: "#9aa5b1", strokeDashArray: [6, 4], selectable: false,
        }));
        stage.add(new fabric.Text("🖼 " + (o.assetId || "image"), {
          left: o.left + 12, top: o.top + 12, fontSize: 20, fill: "#5b6b7c", selectable: false,
        }));
      } else if (o.type === "group") {
        // shallow group: render children inline (bench schema kept simple)
        for (const c of o.children || []) {
          stage.add(new fabric.Rect({ left: c.left, top: c.top, width: c.width, height: c.height, fill: c.fill || "#ccc", rx: c.rx || 0, ry: c.rx || 0, selectable: false }));
        }
      }
    } catch (err) {
      console.warn("render-err", o, err);
    }
  }
  stage.renderAll();
}

function iframeSrcdoc(innerHtml) {
  const head = \`<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@100;300;400;500;700;900&family=Nanum+Gothic:wght@400;700;800&family=Black+Han+Sans&family=Jua&family=Do+Hyeon&family=Gaegu:wght@300;400;700&family=Gugi&display=swap" rel="stylesheet">
<style>
html,body{margin:0;padding:0;background:#fff;font-family:'Pretendard Variable','Noto Sans KR',sans-serif;}
img[src^="placeholder:"]{background:#eaeef2 url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect width=%22100%22 height=%22100%22 fill=%22%23eaeef2%22/><text x=%2250%22 y=%2255%22 font-size=%2220%22 text-anchor=%22middle%22 fill=%22%235b6b7c%22>IMG</text></svg>') center/contain no-repeat !important;}
</style></head><body>\`;
  return head + innerHtml + "</body></html>";
}

function render() {
  const host = document.getElementById("rows");
  for (const item of DATA) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = \`
      <div class="meta">
        <div class="id">\${esc(item.id)}</div>
        <div class="prompt">\${esc(item.prompt)}</div>
        <div class="domain">\${esc(item.domain)}</div>
        <div class="latencies">
          A: <span>\${item.a.latency ?? "—"}</span>ms · \${item.a.outputBytes ?? "—"} B<br>
          B: <span>\${item.b.latency ?? "—"}</span>ms · \${item.b.outputBytes ?? "—"} B
        </div>
      </div>
      <div class="pane">
        <div class="label"><b>A — native JSON → Fabric</b><span>\${item.a.parsed ? '<span class="badge ok">parsed</span>' : '<span class="badge fail">parse-fail</span>'}</span></div>
        <div class="stage"><canvas id="c-\${item.id}"></canvas></div>
      </div>
      <div class="pane">
        <div class="label"><b>B — constrained HTML (iframe)</b><span>\${item.b.html ? '<span class="badge ok">html</span>' : '<span class="badge fail">empty</span>'}</span></div>
        <div class="stage"><iframe id="f-\${item.id}" sandbox="allow-same-origin"></iframe></div>
      </div>
    \`;
    host.appendChild(row);
    renderA(document.getElementById("c-" + item.id), item.a.parsed);
    const iframe = document.getElementById("f-" + item.id);
    iframe.srcdoc = iframeSrcdoc(item.b.html || "");
  }
}

document.fonts && document.fonts.ready.then(render).catch(render);
if (!document.fonts) render();
</script>
</body>
</html>
`;

await writeFile(resolve(root, "viewer.html"), html, "utf8");
console.log("[viewer] wrote viewer.html (" + html.length + " bytes, " + payload.length + " prompts)");
