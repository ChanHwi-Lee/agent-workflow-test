// Automated, format-only grader for method-compare phase-1.
// Reads <outputSubdir>/method-{a,b}/*.json, computes pass/fail metrics, writes
// <gradesSubdir>/method-{a,b}/*.json plus a combined <gradesSubdir>/summary.json.
//
// Usage:
//   node grade.mjs                                       (default: outputs / grades)
//   node grade.mjs --outputSubdir=outputs-3-pro          (grades auto-derived)
//   node grade.mjs --outputSubdir=outputs-3-pro --gradesSubdir=grades-3-pro

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFragment } from "parse5";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function parseArgs(argv) {
  const out = {};
  for (const tok of argv) {
    if (tok.startsWith("--")) {
      const [k, v] = tok.slice(2).split("=");
      out[k] = v ?? true;
    }
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
const OUTPUT_SUBDIR = args.outputSubdir ?? "outputs";
const GRADES_SUBDIR =
  args.gradesSubdir ??
  (OUTPUT_SUBDIR === "outputs" ? "grades" : OUTPUT_SUBDIR.replace(/^outputs/, "grades"));

const CANVAS_W = 1200;
const CANVAS_H = 628;
const MIN_COUNT = 3;
const MAX_COUNT = 12;

const FONT_WHITELIST = new Set([
  "Pretendard",
  "NotoSansKR",
  "NanumSquare",
  "SpoqaHanSans",
  "GmarketSans",
  "BlackHanSans",
  "Cafe24Ssurround",
]);
const ASSET_WHITELIST = new Set([
  "photo:1001",
  "photo:1002",
  "graphic:2001",
  "graphic:2002",
]);
const ALLOWED_TYPES_A = new Set(["rect", "text", "image"]);

const ALLOWED_TAGS_B = new Set([
  "div",
  "span",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "img",
  "svg",
]);
const ALLOWED_CSS_PROPS_B = new Set([
  "position",
  "left",
  "top",
  "width",
  "height",
  "font-family",
  "font-size",
  "font-weight",
  "color",
  "text-align",
  "line-height",
  "background-color",
  "background-image",
  "border-radius",
  "opacity",
  "transform",
  "box-shadow",
  "z-index",
  "overflow",
  "display",
]);
const FORBIDDEN_CSS_TOKENS_B = [
  /\bflex\b/i,
  /\bgrid\b/i,
  /\bmargin\b/i,
  /\bpadding\b/i,
  /\bcalc\(/i,
  /\btranslate\s*\(/i,
  /\btranslateX\s*\(/i,
  /\btranslateY\s*\(/i,
  /\bfixed\b/i,
  /\bsticky\b/i,
];

const IMG_ROLE_WHITELIST = new Set([
  "background",
  "hero",
  "product",
  "decoration",
  "logo",
  "icon",
]);

// ---------- helpers ----------

function stripCodeFences(text) {
  if (!text) return text;
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    const withoutOpen = trimmed.replace(/^```[a-zA-Z0-9]*\s*/, "");
    const closed = withoutOpen.replace(/```\s*$/, "");
    return closed;
  }
  return trimmed;
}

function extractJsonBlob(text) {
  const stripped = stripCodeFences(text);
  try {
    return { ok: true, value: JSON.parse(stripped) };
  } catch (_) {}
  // Fallback: find first "{" and last "}"
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return { ok: true, value: JSON.parse(stripped.slice(start, end + 1)) };
    } catch (_) {}
  }
  return { ok: false, value: null };
}

function overlapIoU(a, b) {
  const x1 = Math.max(a.left, b.left);
  const y1 = Math.max(a.top, b.top);
  const x2 = Math.min(a.left + a.width, b.left + b.width);
  const y2 = Math.min(a.top + a.height, b.top + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (inter <= 0) return 0;
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const union = areaA + areaB - inter;
  if (union <= 0) return 0;
  return inter / union;
}

function checksToScorecard(checks) {
  const entries = Object.entries(checks);
  const passed = entries.filter(([, v]) => v === true).length;
  const total = entries.length;
  return { passed, total, ratio: total > 0 ? passed / total : 0 };
}

// ---------- Method A grader ----------

function gradeMethodA(record) {
  const checks = {
    json_parse_ok: false,
    schema_valid: false,
    bounds_ok: false,
    no_overlap_critical: false,
    font_enum_ok: false,
    asset_id_ok: false,
    element_count_ok: false,
  };
  const failureReasons = [];

  if (!record.ok || typeof record.outputText !== "string") {
    failureReasons.push("no_output_text");
    return { checks, failureReasons, parsed: null, elementCount: 0 };
  }

  const parsed = extractJsonBlob(record.outputText);
  if (!parsed.ok) {
    failureReasons.push("json_parse_failed");
    return { checks, failureReasons, parsed: null, elementCount: 0 };
  }
  checks.json_parse_ok = true;

  const doc = parsed.value;
  if (
    !doc ||
    typeof doc !== "object" ||
    !Array.isArray(doc.objects) ||
    !doc.canvas ||
    typeof doc.canvas !== "object"
  ) {
    failureReasons.push("schema_shape_missing");
    return { checks, failureReasons, parsed: doc, elementCount: 0 };
  }
  const objs = doc.objects;
  const elementCount = objs.length;

  // schema_valid
  let schemaOk = true;
  for (const [i, o] of objs.entries()) {
    if (!o || typeof o !== "object") {
      schemaOk = false;
      failureReasons.push(`schema:obj_${i}_not_object`);
      break;
    }
    if (!ALLOWED_TYPES_A.has(o.type)) {
      schemaOk = false;
      failureReasons.push(`schema:obj_${i}_bad_type:${o.type}`);
      break;
    }
    const commonNumericKeys = ["left", "top", "width", "height"];
    for (const k of commonNumericKeys) {
      if (!Number.isFinite(o[k])) {
        schemaOk = false;
        failureReasons.push(`schema:obj_${i}_missing_${k}`);
        break;
      }
    }
    if (!schemaOk) break;

    if (o.type === "text") {
      if (typeof o.text !== "string" || typeof o.fontFamily !== "string" || !Number.isFinite(o.fontSize)) {
        schemaOk = false;
        failureReasons.push(`schema:obj_${i}_text_fields`);
        break;
      }
    } else if (o.type === "rect") {
      if (typeof o.fill !== "string") {
        schemaOk = false;
        failureReasons.push(`schema:obj_${i}_rect_fill`);
        break;
      }
    } else if (o.type === "image") {
      if (typeof o.assetId !== "string") {
        schemaOk = false;
        failureReasons.push(`schema:obj_${i}_image_assetId`);
        break;
      }
    }
  }
  checks.schema_valid = schemaOk;

  // bounds_ok
  let boundsOk = schemaOk;
  if (schemaOk) {
    for (const [i, o] of objs.entries()) {
      if (
        o.left < 0 ||
        o.top < 0 ||
        o.left + o.width > CANVAS_W ||
        o.top + o.height > CANVAS_H ||
        o.width <= 0 ||
        o.height <= 0
      ) {
        boundsOk = false;
        failureReasons.push(
          `bounds:obj_${i}_oob(${o.left},${o.top},${o.width},${o.height})`
        );
        break;
      }
    }
  }
  checks.bounds_ok = boundsOk;

  // no_overlap_critical (IoU > 0.8) - legitimate stacks are allowed:
  //   * full-canvas background rect
  //   * rect with opacity < 1 (overlay scrim)
  //   * rect behind text (CTA pattern)
  //   * rect behind image (frame/scrim pattern)
  let overlapOk = schemaOk;
  if (schemaOk) {
    for (let i = 0; i < objs.length; i++) {
      for (let j = i + 1; j < objs.length; j++) {
        const a = objs[i];
        const b = objs[j];
        const isFullCanvasBg = (o) =>
          o.type === "rect" &&
          o.left === 0 &&
          o.top === 0 &&
          o.width === CANVAS_W &&
          o.height === CANVAS_H;
        if (isFullCanvasBg(a) || isFullCanvasBg(b)) continue;
        const isOverlayRect = (o) =>
          o.type === "rect" &&
          typeof o.opacity === "number" &&
          o.opacity > 0 &&
          o.opacity < 1;
        if (isOverlayRect(a) || isOverlayRect(b)) continue;
        const iou = overlapIoU(a, b);
        if (iou > 0.8) {
          const pairTypes = [a.type, b.type].sort().join("+");
          // Permit common banner stack patterns.
          if (pairTypes === "rect+text") continue;
          if (pairTypes === "image+rect") continue;
          overlapOk = false;
          failureReasons.push(
            `overlap:${i}<>${j} iou=${iou.toFixed(2)} types=${pairTypes}`
          );
          break;
        }
      }
      if (!overlapOk) break;
    }
  }
  checks.no_overlap_critical = overlapOk;

  // font_enum_ok
  let fontOk = schemaOk;
  if (schemaOk) {
    for (const [i, o] of objs.entries()) {
      if (o.type === "text" && !FONT_WHITELIST.has(o.fontFamily)) {
        fontOk = false;
        failureReasons.push(`font:obj_${i}_bad:${o.fontFamily}`);
        break;
      }
    }
  }
  checks.font_enum_ok = fontOk;

  // asset_id_ok
  let assetOk = schemaOk;
  if (schemaOk) {
    for (const [i, o] of objs.entries()) {
      if (o.type === "image" && !ASSET_WHITELIST.has(o.assetId)) {
        assetOk = false;
        failureReasons.push(`asset:obj_${i}_bad:${o.assetId}`);
        break;
      }
    }
  }
  checks.asset_id_ok = assetOk;

  // element_count
  const countOk = elementCount >= MIN_COUNT && elementCount <= MAX_COUNT;
  checks.element_count_ok = countOk;
  if (!countOk) failureReasons.push(`count:${elementCount}_out_of_range`);

  return { checks, failureReasons, parsed: doc, elementCount };
}

// ---------- Method B grader ----------

function parseInlineStyle(styleAttr) {
  if (!styleAttr) return [];
  return styleAttr
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((decl) => {
      const idx = decl.indexOf(":");
      if (idx < 0) return { prop: decl.toLowerCase(), value: "" };
      return {
        prop: decl.slice(0, idx).trim().toLowerCase(),
        value: decl.slice(idx + 1).trim(),
      };
    });
}

function collectElements(node, acc) {
  if (!node) return;
  if (node.tagName) {
    acc.push(node);
  }
  if (node.childNodes) {
    for (const c of node.childNodes) collectElements(c, acc);
  }
}

function attrsToObject(attrs) {
  const o = {};
  if (!attrs) return o;
  for (const { name, value } of attrs) o[name] = value;
  return o;
}

function parsePxInt(value) {
  if (value == null) return null;
  const m = String(value).match(/^(-?\d+)(?:\.\d+)?px$/);
  if (m) return parseInt(m[1], 10);
  return null;
}

function gradeMethodB(record) {
  const checks = {
    html_parse_ok: false,
    dom_grammar_ok: false,
    css_whitelist_ok: false,
    root_structure_ok: false,
    positioning_ok: false,
    no_forbidden: false,
    placeholder_annotated_ok: false,
    bounds_ok: false,
    element_count_ok: false,
  };
  const failureReasons = [];

  if (!record.ok || typeof record.outputText !== "string") {
    failureReasons.push("no_output_text");
    return { checks, failureReasons, parsed: null, elementCount: 0 };
  }

  const stripped = stripCodeFences(record.outputText);

  let fragment;
  try {
    fragment = parseFragment(stripped);
  } catch (err) {
    failureReasons.push(`html_parse_failed:${err?.message}`);
    return { checks, failureReasons, parsed: null, elementCount: 0 };
  }
  checks.html_parse_ok = true;

  // Locate root div
  const topElements = (fragment.childNodes || []).filter((n) => n.tagName);
  const root = topElements.find((n) => n.tagName === "div");
  if (!root || topElements.length !== 1) {
    failureReasons.push(`root_missing_or_siblings:${topElements.length}`);
    return { checks, failureReasons, parsed: null, elementCount: 0 };
  }

  const rootAttrs = attrsToObject(root.attrs);
  const rootStyleDecls = parseInlineStyle(rootAttrs.style);
  const rootStyleMap = Object.fromEntries(rootStyleDecls.map((d) => [d.prop, d.value]));
  const rootOk =
    rootStyleMap["position"] === "relative" &&
    parsePxInt(rootStyleMap["width"]) === CANVAS_W &&
    parsePxInt(rootStyleMap["height"]) === CANVAS_H &&
    (rootStyleMap["overflow"] === "hidden" || rootStyleMap["overflow"] === undefined);
  checks.root_structure_ok = rootOk;
  if (!rootOk) {
    failureReasons.push(
      `root_structure:style=${JSON.stringify(rootStyleMap)}`
    );
  }

  // Collect children
  const childElements = [];
  for (const c of root.childNodes || []) {
    if (c.tagName) childElements.push(c);
  }
  const deepElements = [];
  for (const c of childElements) {
    collectElements(c, deepElements);
  }

  const elementCount = childElements.length;
  checks.element_count_ok = elementCount >= MIN_COUNT && elementCount <= MAX_COUNT;
  if (!checks.element_count_ok) failureReasons.push(`count:${elementCount}_out_of_range`);

  // dom_grammar_ok: all elements (root included) must be allowed tags
  const allTags = [root, ...deepElements].map((e) => e.tagName);
  const badTags = allTags.filter((t) => !ALLOWED_TAGS_B.has(t));
  checks.dom_grammar_ok = badTags.length === 0;
  if (badTags.length > 0) failureReasons.push(`bad_tags:${badTags.join(",")}`);

  // positioning_ok: every DIRECT child of root has position:absolute and px integer geometry.
  // Nested/inline elements (e.g. <br> inside <p>, <span> inside <p>) are not required to be
  // absolutely positioned as long as the parent child is.
  let positioningOk = true;
  const directChildStylesPerEl = [];
  for (const el of childElements) {
    const a = attrsToObject(el.attrs);
    const decls = parseInlineStyle(a.style);
    const styleMap = Object.fromEntries(decls.map((d) => [d.prop, d.value]));
    directChildStylesPerEl.push({ el, styleMap, decls });

    if (styleMap["position"] !== "absolute") {
      positioningOk = false;
      failureReasons.push(`pos_not_absolute:${el.tagName}`);
      continue;
    }
    for (const k of ["left", "top", "width", "height"]) {
      const v = parsePxInt(styleMap[k]);
      if (v === null) {
        positioningOk = false;
        failureReasons.push(`${k}_not_px_int:${el.tagName}:${styleMap[k]}`);
      }
    }
  }
  checks.positioning_ok = positioningOk;

  // Collect inline style decls for nested elements too — for css_whitelist check only.
  const nestedStyleDecls = [];
  for (const el of deepElements) {
    if (childElements.includes(el)) continue; // already counted as direct child
    const a = attrsToObject(el.attrs);
    const decls = parseInlineStyle(a.style);
    nestedStyleDecls.push({ el, decls });
  }

  // css_whitelist_ok: all inline props across all elements (root + direct children + nested) in whitelist
  let cssOk = true;
  const allElementsForCss = [{ el: root, decls: rootStyleDecls }]
    .concat(directChildStylesPerEl.map((x) => ({ el: x.el, decls: x.decls })))
    .concat(nestedStyleDecls);
  for (const { el, decls } of allElementsForCss) {
    for (const d of decls) {
      if (!ALLOWED_CSS_PROPS_B.has(d.prop)) {
        cssOk = false;
        failureReasons.push(`css_prop_forbidden:${el.tagName}:${d.prop}`);
      }
    }
  }
  checks.css_whitelist_ok = cssOk;

  // no_forbidden: scan raw stripped output for forbidden tokens
  let forbiddenHit = null;
  for (const rx of FORBIDDEN_CSS_TOKENS_B) {
    if (rx.test(stripped)) {
      forbiddenHit = rx.source;
      break;
    }
  }
  // also check for class="" and <style>
  if (!forbiddenHit && /class\s*=\s*"/.test(stripped)) forbiddenHit = "class_attr";
  if (!forbiddenHit && /<style\b/i.test(stripped)) forbiddenHit = "style_block";
  if (!forbiddenHit && /<link\b/i.test(stripped)) forbiddenHit = "link_tag";
  if (!forbiddenHit && /<script\b/i.test(stripped)) forbiddenHit = "script_tag";
  checks.no_forbidden = forbiddenHit === null;
  if (forbiddenHit) failureReasons.push(`forbidden:${forbiddenHit}`);

  // placeholder_annotated_ok: every <img> must have data-tooldi-role (valid), data-hint, data-aspect, src placeholder://
  let placeholderOk = true;
  const imgs = deepElements.filter((e) => e.tagName === "img");
  for (const img of imgs) {
    const a = attrsToObject(img.attrs);
    if (!a["data-tooldi-role"] || !IMG_ROLE_WHITELIST.has(a["data-tooldi-role"])) {
      placeholderOk = false;
      failureReasons.push(`img_role_missing_or_bad:${a["data-tooldi-role"] ?? "null"}`);
    }
    if (!a["data-hint"]) {
      placeholderOk = false;
      failureReasons.push(`img_hint_missing`);
    }
    if (!a["data-aspect"]) {
      placeholderOk = false;
      failureReasons.push(`img_aspect_missing`);
    }
    if (!a.src || !a.src.startsWith("placeholder://")) {
      placeholderOk = false;
      failureReasons.push(`img_src_bad:${a.src ?? "null"}`);
    }
  }
  checks.placeholder_annotated_ok = placeholderOk;

  // bounds_ok: every DIRECT child of root must fit within 1200x628
  let boundsOk = true;
  for (const { el, styleMap } of directChildStylesPerEl) {
    const left = parsePxInt(styleMap["left"]);
    const top = parsePxInt(styleMap["top"]);
    const width = parsePxInt(styleMap["width"]);
    const height = parsePxInt(styleMap["height"]);
    if ([left, top, width, height].some((v) => v === null)) {
      boundsOk = false;
      failureReasons.push(`bounds_unparseable:${el.tagName}`);
      break;
    }
    if (
      left < 0 ||
      top < 0 ||
      left + width > CANVAS_W ||
      top + height > CANVAS_H ||
      width <= 0 ||
      height <= 0
    ) {
      boundsOk = false;
      failureReasons.push(
        `bounds_oob:${el.tagName}(${left},${top},${width},${height})`
      );
      break;
    }
  }
  checks.bounds_ok = boundsOk;

  return { checks, failureReasons, parsed: { elementCount }, elementCount };
}

// ---------- driver ----------

async function loadOutputs(method) {
  const dir = resolve(__dirname, OUTPUT_SUBDIR, method);
  let files = [];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  } catch (_) {
    return [];
  }
  const records = [];
  for (const f of files) {
    const raw = await readFile(resolve(dir, f), "utf8");
    records.push(JSON.parse(raw));
  }
  return records;
}

async function gradeMethod(method) {
  const records = await loadOutputs(method);
  const grader = method === "method-a" ? gradeMethodA : gradeMethodB;
  const gradesDir = resolve(__dirname, GRADES_SUBDIR, method);
  await mkdir(gradesDir, { recursive: true });

  const perPromptGrades = [];
  for (const rec of records) {
    const grade = grader(rec);
    const entry = {
      id: rec.id,
      domain: rec.domain,
      method,
      callOk: rec.ok === true,
      latencyMs: rec.latencyMs ?? null,
      outputBytes: rec.outputBytes ?? null,
      promptTokenCount: rec.usage?.promptTokenCount ?? null,
      candidatesTokenCount: rec.usage?.candidatesTokenCount ?? null,
      totalTokenCount: rec.usage?.totalTokenCount ?? null,
      thoughtsTokenCount:
        rec.usage?.thoughtsTokenCount ??
        // Back-fill for records captured before we logged the field explicitly.
        (rec.usage?.totalTokenCount != null &&
        rec.usage?.promptTokenCount != null &&
        rec.usage?.candidatesTokenCount != null
          ? Math.max(
              0,
              rec.usage.totalTokenCount -
                rec.usage.promptTokenCount -
                rec.usage.candidatesTokenCount
            )
          : null),
      model: rec.model ?? null,
      elementCount: grade.elementCount,
      checks: grade.checks,
      scorecard: checksToScorecard(grade.checks),
      failureReasons: grade.failureReasons,
    };
    perPromptGrades.push(entry);
    await writeFile(
      resolve(gradesDir, `${rec.id}.json`),
      JSON.stringify(entry, null, 2),
      "utf8"
    );
  }
  return perPromptGrades;
}

const aGrades = await gradeMethod("method-a");
const bGrades = await gradeMethod("method-b");

const summary = {
  generatedAt: new Date().toISOString(),
  methods: {
    "method-a": aGrades,
    "method-b": bGrades,
  },
};

const summaryPath = resolve(__dirname, GRADES_SUBDIR, "summary.json");
await mkdir(dirname(summaryPath), { recursive: true });
await writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");

console.log(
  `[grade] subdir=${OUTPUT_SUBDIR} method-a graded=${aGrades.length} method-b graded=${bGrades.length} summary=${summaryPath}`
);
