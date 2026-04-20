#!/usr/bin/env node
// Build viewer-multi.html: 20 prompts × (Method A / Method B) × 5 models grid.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const root = dirname(fileURLToPath(import.meta.url));

const MODELS = [
  { alias: "2.5-pro", modelId: "gemini-2.5-pro", subdir: "outputs", price: { inPerM: 1.25, outPerM: 10.0 } },
  { alias: "3-pro", modelId: "gemini-3-pro-preview", subdir: "outputs-3-pro", price: { inPerM: 1.25, outPerM: 10.0 } },
  { alias: "3.1-pro", modelId: "gemini-3.1-pro-preview", subdir: "outputs-3.1-pro", price: { inPerM: 2.5, outPerM: 15.0 } },
  { alias: "3-flash", modelId: "gemini-3-flash-preview", subdir: "outputs-3-flash", price: { inPerM: 0.3, outPerM: 2.5 } },
  { alias: "3.1-flash-lite", modelId: "gemini-3.1-flash-lite-preview", subdir: "outputs-3.1-flash-lite", price: { inPerM: 0.1, outPerM: 0.4 } },
];

async function loadMethod(subdir, method) {
  const dir = resolve(root, subdir, method);
  if (!existsSync(dir)) return {};
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const map = {};
  for (const f of files) {
    const raw = JSON.parse(await readFile(resolve(dir, f), "utf8"));
    map[raw.id] = raw;
  }
  return map;
}

const modelData = [];
for (const m of MODELS) {
  const a = await loadMethod(m.subdir, "method-a");
  const b = await loadMethod(m.subdir, "method-b");
  // parse method-A JSON once
  for (const id of Object.keys(a)) {
    try {
      a[id].parsed = JSON.parse(a[id].outputText ?? "");
    } catch (_) {
      a[id].parsed = null;
    }
  }
  modelData.push({ ...m, a, b });
}

// collect all ids
const idSet = new Set();
for (const md of modelData) {
  for (const id of Object.keys(md.a)) idSet.add(id);
  for (const id of Object.keys(md.b)) idSet.add(id);
}
const ids = Array.from(idSet).sort();

function costOf(rec, price) {
  if (!rec || !rec.usage) return null;
  const inTok = rec.usage.promptTokenCount ?? 0;
  let thought = rec.usage.thoughtsTokenCount;
  if (thought == null && rec.usage.totalTokenCount != null) {
    thought = Math.max(
      0,
      (rec.usage.totalTokenCount ?? 0) -
        (rec.usage.promptTokenCount ?? 0) -
        (rec.usage.candidatesTokenCount ?? 0)
    );
  }
  const out = (rec.usage.candidatesTokenCount ?? 0) + (thought ?? 0);
  return (inTok / 1e6) * price.inPerM + (out / 1e6) * price.outPerM;
}

// Build per-prompt payload
const payload = ids.map((id) => {
  const row = {
    id,
    prompt: "",
    domain: "",
    cells: [],
  };
  for (const m of modelData) {
    const rA = m.a[id];
    const rB = m.b[id];
    if (!row.prompt) row.prompt = rA?.prompt ?? rB?.prompt ?? "";
    if (!row.domain) row.domain = rA?.domain ?? rB?.domain ?? "";
    row.cells.push({
      alias: m.alias,
      modelId: m.modelId,
      a: {
        ok: !!rA?.ok,
        latency: rA?.latencyMs ?? null,
        parsed: rA?.parsed ?? null,
        bytes: rA?.outputBytes ?? null,
        in: rA?.usage?.promptTokenCount ?? null,
        out: rA?.usage?.candidatesTokenCount ?? null,
        thought: rA?.usage?.thoughtsTokenCount ?? null,
        cost: costOf(rA, m.price),
      },
      b: {
        ok: !!rB?.ok,
        latency: rB?.latencyMs ?? null,
        html: rB?.outputText ?? "",
        bytes: rB?.outputBytes ?? null,
        in: rB?.usage?.promptTokenCount ?? null,
        out: rB?.usage?.candidatesTokenCount ?? null,
        thought: rB?.usage?.thoughtsTokenCount ?? null,
        cost: costOf(rB, m.price),
      },
    });
  }
  return row;
});

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>Gemini Multi-Model Method A/B Viewer</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@100;300;400;500;700;900&family=Nanum+Gothic:wght@400;700;800&family=Black+Han+Sans&family=Jua&family=Do+Hyeon&family=Gaegu:wght@300;400;700&family=Gugi&family=Hi+Melody&family=Poor+Story&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/fabric@5.3.0/dist/fabric.min.js"></script>
<style>
  :root { --bg:#0e1116; --panel:#161a22; --subpanel:#0a0d12; --text:#e6edf3; --muted:#8b949e; --accent:#58a6ff; --ok:#3fb950; --warn:#d29922; --fail:#f85149; }
  * { box-sizing: border-box; }
  body { font-family:'Pretendard Variable','Noto Sans KR',sans-serif; background:var(--bg); color:var(--text); margin:0; padding:24px 16px 64px; }
  header { max-width: 2000px; margin:0 auto 20px; padding-bottom:14px; border-bottom:1px solid #22272f; }
  header h1 { margin:0 0 4px; font-size:20px; font-weight:700; }
  header .sub { color:var(--muted); font-size:12px; }
  header .legend { margin-top:10px; display:flex; gap:14px; flex-wrap:wrap; font-size:11px; color:var(--muted); }
  header .legend b { color:var(--accent); margin-right:4px; }
  .summary { max-width:2000px; margin:12px auto 0; font-size:11px; color:var(--muted); }
  .summary table { border-collapse:collapse; font-variant-numeric:tabular-nums; }
  .summary th,.summary td { padding:3px 8px; border:1px solid #22272f; }
  .summary th { background:#0a0d12; color:var(--text); font-weight:600; }
  .row { max-width:2000px; margin:0 auto 18px; background:var(--panel); border-radius:10px; padding:12px; }
  .row .head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:10px; }
  .row .head .id { font-size:12px; color:var(--accent); font-weight:700; letter-spacing:.05em; }
  .row .head .prompt { font-size:14px; font-weight:500; margin-top:4px; }
  .row .head .domain { font-size:10px; color:var(--muted); margin-top:4px; text-transform:uppercase; letter-spacing:.08em; }
  .mini { font-size:10px; color:var(--muted); font-variant-numeric:tabular-nums; }
  .mini table { border-collapse:collapse; }
  .mini th,.mini td { padding:2px 6px; border:1px solid #22272f; text-align:right; }
  .mini th { color:var(--text); background:#0a0d12; font-weight:600; }
  .mini td.a { color:#e6edf3; }
  .grid { display:grid; grid-template-columns: 70px repeat(5, 1fr); gap:6px; }
  .grid .ax { font-size:11px; color:var(--muted); display:flex; align-items:center; justify-content:center; font-weight:600; }
  .grid .col-head { font-size:11px; color:var(--accent); text-align:center; padding:4px 0; font-weight:700; }
  .cell { background:var(--subpanel); border-radius:6px; padding:6px; }
  .cell .hd { display:flex; justify-content:space-between; align-items:center; font-size:10px; color:var(--muted); margin-bottom:4px; }
  .cell .hd b { color:var(--text); }
  .cell .stage { width:360px; height:188px; background:#fff; overflow:hidden; position:relative; border-radius:3px; }
  .cell.a .stage canvas { transform: scale(.3); transform-origin: top left; display:block; }
  .cell.b .stage iframe { width:1200px; height:628px; border:0; transform: scale(.3); transform-origin: top left; display:block; }
  .badge { display:inline-block; padding:1px 4px; border-radius:3px; font-size:9px; margin-left:3px; }
  .badge.ok { background:rgba(63,185,80,.15); color:var(--ok); }
  .badge.fail { background:rgba(248,81,73,.15); color:var(--fail); }
</style>
</head>
<body>
<header>
  <h1>Gemini Multi-Model A/B Viewer — Phase-1 Extended</h1>
  <div class="sub">5 models × 2 methods × 20 Korean banner prompts · 1200×628 @ 0.3 scale</div>
  <div class="legend">
    ${MODELS.map((m) => `<span><b>${m.alias}</b> <code>${m.modelId}</code></span>`).join("")}
  </div>
</header>

<div id="summary" class="summary"></div>
<div id="rows"></div>

<script>
const DATA = ${JSON.stringify(payload)};
const MODELS = ${JSON.stringify(MODELS.map(({ alias, modelId }) => ({ alias, modelId })))};

function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c])); }
function fmtMs(v) { return v == null ? "—" : (v/1000).toFixed(2) + "s"; }
function fmtCost(v) { return v == null ? "—" : "$" + v.toFixed(5); }

function renderA(canvasEl, parsed) {
  const stage = new fabric.StaticCanvas(canvasEl, { width: 1200, height: 628, backgroundColor: "#fff" });
  if (!parsed || !Array.isArray(parsed.objects)) {
    stage.add(new fabric.Text("parse failed", { left: 10, top: 10, fontSize: 36, fill: "#d00" }));
    stage.renderAll();
    return;
  }
  for (const o of parsed.objects) {
    try {
      if (o.type === "rect") {
        stage.add(new fabric.Rect({ left:o.left, top:o.top, width:o.width, height:o.height, fill:o.fill||"#ddd", rx:o.rx||0, ry:o.rx||0, opacity:o.opacity??1, selectable:false }));
      } else if (o.type === "text") {
        stage.add(new fabric.Textbox(String(o.text ?? ""), { left:o.left, top:o.top, width:o.width, height:o.height, fontSize:o.fontSize||24, fontFamily:o.fontFamily||"Noto Sans KR", fontWeight:o.fontWeight||400, fill:o.fill||"#000", textAlign:o.textAlign||"left", lineHeight:1.2, selectable:false, splitByGrapheme:true }));
      } else if (o.type === "image") {
        stage.add(new fabric.Rect({ left:o.left, top:o.top, width:o.width, height:o.height, fill:"#eaeef2", stroke:"#9aa5b1", strokeDashArray:[6,4], selectable:false }));
        stage.add(new fabric.Text("🖼 " + (o.assetId||"image"), { left:o.left+10, top:o.top+10, fontSize:24, fill:"#5b6b7c", selectable:false }));
      }
    } catch (_) {}
  }
  stage.renderAll();
}

function iframeSrcdoc(inner) {
  const head = \`<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@100;300;400;500;700;900&family=Nanum+Gothic:wght@400;700;800&family=Black+Han+Sans&family=Jua&family=Do+Hyeon&family=Gaegu:wght@300;400;700&family=Gugi&display=swap" rel="stylesheet">
<style>
html,body{margin:0;padding:0;background:#fff;font-family:'Pretendard Variable','Noto Sans KR',sans-serif;}
img[src^="placeholder:"]{background:#eaeef2 url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect width=%22100%22 height=%22100%22 fill=%22%23eaeef2%22/><text x=%2250%22 y=%2255%22 font-size=%2220%22 text-anchor=%22middle%22 fill=%22%235b6b7c%22>IMG</text></svg>') center/contain no-repeat !important;}
</style></head><body>\`;
  return head + inner + "</body></html>";
}

function stripFence(s) {
  if (!s) return s;
  const t = s.trim();
  if (t.startsWith("\`\`\`")) {
    return t.replace(/^\`\`\`[a-zA-Z0-9]*\s*/, "").replace(/\`\`\`\s*$/, "");
  }
  return t;
}

function render() {
  // --- summary table ---
  const aliases = MODELS.map((m) => m.alias);
  const sumHost = document.getElementById("summary");
  const totals = aliases.map((a) => {
    const found = DATA.flatMap((r) => r.cells.filter((c) => c.alias === a));
    const mean = (arr) => { const ns = arr.filter((v) => v != null); return ns.length ? ns.reduce((s,v)=>s+v,0)/ns.length : null; };
    const sum = (arr) => arr.filter((v)=>v!=null).reduce((s,v)=>s+v,0);
    return {
      alias: a,
      aCost: sum(found.map((c) => c.a.cost)),
      bCost: sum(found.map((c) => c.b.cost)),
      aLat: mean(found.map((c) => c.a.latency)),
      bLat: mean(found.map((c) => c.b.latency)),
    };
  });
  sumHost.innerHTML = \`<table><thead><tr><th>model</th>\${aliases.map((a)=>"<th>"+esc(a)+"</th>").join("")}</tr></thead>
    <tbody>
      <tr><td>A cost ∑ (20 prompts)</td>\${totals.map((t)=>"<td>"+(t.aCost==null?"—":"$"+t.aCost.toFixed(4))+"</td>").join("")}</tr>
      <tr><td>B cost ∑ (20 prompts)</td>\${totals.map((t)=>"<td>"+(t.bCost==null?"—":"$"+t.bCost.toFixed(4))+"</td>").join("")}</tr>
      <tr><td>A mean latency</td>\${totals.map((t)=>"<td>"+(t.aLat==null?"—":(t.aLat/1000).toFixed(2)+"s")+"</td>").join("")}</tr>
      <tr><td>B mean latency</td>\${totals.map((t)=>"<td>"+(t.bLat==null?"—":(t.bLat/1000).toFixed(2)+"s")+"</td>").join("")}</tr>
    </tbody></table>\`;

  // --- per-prompt rows ---
  const host = document.getElementById("rows");
  for (const item of DATA) {
    const row = document.createElement("div");
    row.className = "row";

    const miniRows = item.cells.map((c) => \`
      <tr>
        <th>\${esc(c.alias)}</th>
        <td>\${fmtMs(c.a.latency)}</td><td>\${fmtCost(c.a.cost)}</td>
        <td>\${fmtMs(c.b.latency)}</td><td>\${fmtCost(c.b.cost)}</td>
      </tr>\`).join("");

    const colHeads = item.cells.map((c) => \`<div class="col-head">\${esc(c.alias)}</div>\`).join("");
    const aRow = item.cells.map((c) => \`
      <div class="cell a">
        <div class="hd"><b>\${esc(c.alias)}</b>\${c.a.parsed ? '<span class="badge ok">json</span>' : '<span class="badge fail">parse</span>'}</div>
        <div class="stage"><canvas id="c-\${esc(item.id)}-\${esc(c.alias)}"></canvas></div>
      </div>\`).join("");
    const bRow = item.cells.map((c) => \`
      <div class="cell b">
        <div class="hd"><b>\${esc(c.alias)}</b>\${c.b.html ? '<span class="badge ok">html</span>' : '<span class="badge fail">empty</span>'}</div>
        <div class="stage"><iframe id="f-\${esc(item.id)}-\${esc(c.alias)}" sandbox="allow-same-origin"></iframe></div>
      </div>\`).join("");

    row.innerHTML = \`
      <div class="head">
        <div>
          <div class="id">\${esc(item.id)}</div>
          <div class="prompt">\${esc(item.prompt)}</div>
          <div class="domain">\${esc(item.domain)}</div>
        </div>
        <div class="mini">
          <table>
            <thead><tr><th>model</th><th>A lat</th><th>A $</th><th>B lat</th><th>B $</th></tr></thead>
            <tbody>\${miniRows}</tbody>
          </table>
        </div>
      </div>
      <div class="grid">
        <div class="ax">method</div>
        \${colHeads}
        <div class="ax">A</div>
        \${aRow}
        <div class="ax">B</div>
        \${bRow}
      </div>
    \`;
    host.appendChild(row);

    for (const c of item.cells) {
      renderA(document.getElementById("c-" + item.id + "-" + c.alias), c.a.parsed);
      const iframe = document.getElementById("f-" + item.id + "-" + c.alias);
      iframe.srcdoc = iframeSrcdoc(stripFence(c.b.html || ""));
    }
  }
}

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(render).catch(render);
} else {
  render();
}
</script>
</body>
</html>
`;

await writeFile(resolve(root, "viewer-multi.html"), html, "utf8");
console.log(`[viewer-multi] wrote viewer-multi.html (${html.length} bytes, ${payload.length} prompts, ${modelData.length} models)`);
