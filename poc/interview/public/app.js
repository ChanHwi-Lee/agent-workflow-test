const state = {
  manifests: [],
  tsA: null,
  tsB: null,
  seeds: [],
  currentSeedIdx: 0,
  currentRunIdx: 0,
  scores: [],
};

const REPEATS = 3;
const AXES = [
  { id: "intent", label: "의도 반영도" },
  { id: "specificity", label: "구체성" },
  { id: "consistency", label: "일관성" },
  { id: "editEase", label: "편집 거의 불필요 (5=손 안 대도 됨)" },
];

const $ = (id) => document.getElementById(id);

async function api(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

async function postJson(path, body) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

function fillSelect(el, vals) {
  el.innerHTML = vals.map((v) => `<option value="${v}">${v}</option>`).join("");
}

function escapeHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}

async function init() {
  buildAxes();
  state.manifests = await api("/api/manifests");
  const aCandidates = state.manifests.filter((m) => m.paths.includes("a"));
  const bCandidates = state.manifests.filter((m) => m.paths.includes("b"));
  fillSelect($("sel-a"), aCandidates.map((x) => x.timestamp));
  fillSelect($("sel-b"), bCandidates.map((x) => x.timestamp));
  state.tsA = aCandidates[0]?.timestamp ?? null;
  state.tsB = bCandidates[0]?.timestamp ?? null;
  if (state.tsA) $("sel-a").value = state.tsA;
  if (state.tsB) $("sel-b").value = state.tsB;

  $("sel-a").addEventListener("change", (e) => {
    state.tsA = e.target.value;
    onTsChange();
  });
  $("sel-b").addEventListener("change", (e) => {
    state.tsB = e.target.value;
    onTsChange();
  });
  $("sel-seed").addEventListener("change", (e) => {
    const i = state.seeds.indexOf(e.target.value);
    if (i >= 0) state.currentSeedIdx = i;
    render();
  });
  $("sel-idx").addEventListener("change", (e) => {
    state.currentRunIdx = Number(e.target.value);
    render();
  });
  $("btn-prev").addEventListener("click", navPrev);
  $("btn-next").addEventListener("click", navNext);
  $("btn-save").addEventListener("click", saveScore);
  $("html-a").addEventListener("click", () => openHtml("a"));
  $("html-b").addEventListener("click", () => openHtml("b"));

  await onTsChange();
}

function buildAxes() {
  $("comment").value = "";
  const wrap = document.querySelector(".axes");
  wrap.innerHTML = AXES.map(
    (a) => `
    <div class="axis-row">
      <div class="axis-label">${a.label}</div>
      <div class="axis-inputs">
        <span class="axis-group">A ${radiosHtml(a.id, "a")}</span>
        <span class="axis-group">B ${radiosHtml(a.id, "b")}</span>
      </div>
    </div>`,
  ).join("");
}

function radiosHtml(axis, side) {
  return [1, 2, 3, 4, 5]
    .map(
      (v) =>
        `<label class="radio"><input type="radio" name="${side}-${axis}" value="${v}"> ${v}</label>`,
    )
    .join("");
}

async function onTsChange() {
  if (!state.tsA || !state.tsB) {
    clearPanes();
    return;
  }
  const bMan = state.manifests.find((m) => m.timestamp === state.tsB);
  state.seeds = bMan ? bMan.seeds.slice() : [];
  fillSelect($("sel-seed"), state.seeds);
  fillSelect(
    $("sel-idx"),
    Array.from({ length: REPEATS }, (_, i) => String(i)),
  );
  state.currentSeedIdx = 0;
  state.currentRunIdx = 0;
  state.scores = await api(`/api/scores?tsB=${encodeURIComponent(state.tsB)}`);
  await render();
}

function clearPanes() {
  $("img-a").removeAttribute("src");
  $("img-b").removeAttribute("src");
  $("meta-a").textContent = "";
  $("meta-b").textContent = "";
  $("interview-b").innerHTML = "";
}

function currentSeed() {
  return state.seeds[state.currentSeedIdx];
}

async function render() {
  const seed = currentSeed();
  if (!seed) {
    clearPanes();
    return;
  }
  const idx = state.currentRunIdx;
  $("sel-seed").value = seed;
  $("sel-idx").value = String(idx);
  const qs = (ts, path) =>
    `ts=${encodeURIComponent(ts)}&seed=${encodeURIComponent(seed)}&path=${path}&idx=${idx}`;
  $("img-a").src = `/api/screenshot?${qs(state.tsA, "a")}&_=${Date.now()}`;
  $("img-b").src = `/api/screenshot?${qs(state.tsB, "b")}&_=${Date.now()}`;
  try {
    const pair = await api(
      `/api/pair?tsA=${encodeURIComponent(state.tsA)}&tsB=${encodeURIComponent(state.tsB)}&seed=${encodeURIComponent(seed)}&idx=${idx}`,
    );
    $("meta-a").textContent = pair.metaA
      ? JSON.stringify(pair.metaA, null, 2)
      : "(no A)";
    $("meta-b").textContent = pair.metaB
      ? JSON.stringify(pair.metaB, null, 2)
      : "(no B)";
    renderInterview(pair.interview);
  } catch (e) {
    console.error(e);
  }
  clearAxes();
  const existing = state.scores.find(
    (s) =>
      s.seedId === seed &&
      String(s.runIdx) === String(idx) &&
      s.tsA === state.tsA,
  );
  if (existing) {
    fillAxes(existing.axesA, "a");
    fillAxes(existing.axesB, "b");
    $("comment").value = existing.comment ?? "";
  } else {
    $("comment").value = "";
  }
  updateProgress();
  $("status").textContent = existing ? "(이 페어는 이미 저장됨 — 덮어쓸 수 있음)" : "";
}

function renderInterview(interview) {
  const target = $("interview-b");
  if (!interview) {
    target.textContent = "(no interview)";
    return;
  }
  const ctx = interview.context ?? {};
  const pairs = ctx.interview ?? [];
  const brief = ctx.derived_brief ?? "";
  const qa = pairs
    .map((p) => {
      const ans = Array.isArray(p.answer) ? p.answer.join(", ") : p.answer;
      return `<li><div class="q">${escapeHtml(p.title)} <span class="qtype">[${p.type}]</span></div><div class="a">→ ${escapeHtml(ans)}${p.is_other ? ' <span class="tag">기타</span>' : ""}</div></li>`;
    })
    .join("");
  target.innerHTML = `
    <div class="brief"><strong>Derived brief:</strong> ${escapeHtml(brief)}</div>
    <ol class="qa">${qa}</ol>`;
}

function clearAxes() {
  document
    .querySelectorAll('input[type="radio"]')
    .forEach((el) => (el.checked = false));
}

function fillAxes(axes, side) {
  for (const a of AXES) {
    const v = axes?.[a.id];
    if (v == null) continue;
    const el = document.querySelector(
      `input[name="${side}-${a.id}"][value="${v}"]`,
    );
    if (el) el.checked = true;
  }
}

function readAxes(side) {
  const r = {};
  for (const a of AXES) {
    const el = document.querySelector(`input[name="${side}-${a.id}"]:checked`);
    r[a.id] = el ? Number(el.value) : null;
  }
  return r;
}

async function saveScore() {
  const seed = currentSeed();
  const idx = state.currentRunIdx;
  const axesA = readAxes("a");
  const axesB = readAxes("b");
  const missing = [];
  for (const a of AXES) {
    if (axesA[a.id] == null) missing.push(`A.${a.id}`);
    if (axesB[a.id] == null) missing.push(`B.${a.id}`);
  }
  if (missing.length > 0) {
    $("status").textContent = `누락: ${missing.join(", ")}`;
    return;
  }
  const body = {
    tsA: state.tsA,
    tsB: state.tsB,
    seedId: seed,
    runIdx: String(idx),
    axesA,
    axesB,
    comment: $("comment").value ?? "",
  };
  try {
    await postJson("/api/score", body);
    state.scores = await api(
      `/api/scores?tsB=${encodeURIComponent(state.tsB)}`,
    );
    $("status").textContent = "✓ saved";
    navNext();
  } catch (e) {
    $("status").textContent = `save 실패: ${e.message}`;
  }
}

function navPrev() {
  const linear = state.currentSeedIdx * REPEATS + state.currentRunIdx;
  if (linear === 0) return;
  const next = linear - 1;
  state.currentSeedIdx = Math.floor(next / REPEATS);
  state.currentRunIdx = next % REPEATS;
  render();
}

function navNext() {
  const total = state.seeds.length * REPEATS;
  const linear = state.currentSeedIdx * REPEATS + state.currentRunIdx;
  if (linear >= total - 1) {
    $("status").textContent = "✓ 전부 평가 완료";
    return;
  }
  const next = linear + 1;
  state.currentSeedIdx = Math.floor(next / REPEATS);
  state.currentRunIdx = next % REPEATS;
  render();
}

function openHtml(side) {
  const seed = currentSeed();
  const idx = state.currentRunIdx;
  const ts = side === "a" ? state.tsA : state.tsB;
  window.open(
    `/api/html?ts=${encodeURIComponent(ts)}&seed=${encodeURIComponent(seed)}&path=${side}&idx=${idx}`,
    "_blank",
  );
}

function updateProgress() {
  const total = state.seeds.length * REPEATS;
  const done = state.scores.filter((s) => s.tsA === state.tsA).length;
  $("progress").textContent = `${done}/${total} 평가 완료`;
}

init().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<pre style="color:red">init failed: ${escapeHtml(e.message)}</pre>`,
  );
});
