// AGW v6 Phase 2.5 — font registry loader and @font-face CSS generator.
//
// Reads agent-workflow-test/fonts/registry.json (shared SSOT with v6-poc) and
// emits a <style> block for Playwright's extraction HTML template. The CSS
// family name uses Toolditor's {serial}_{weight} convention so the adapter does
// not have to perform any name→ID mapping downstream.
//
// Logic is a TypeScript port of v6-poc/fonts/buildFontFaceCSS.mjs. Both paths
// read the same registry file; no duplicate JSON.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface V6FontEntry {
  readonly toolditorId: string;
  readonly weight: number;
  readonly style: string;
  readonly fontName: string;
  readonly fontFace: string;
  readonly category: string;
  readonly languages: ReadonlyArray<string>;
  readonly savedFilename: string;
  readonly format: string;
  readonly isDefault?: boolean;
}

export interface V6FontRegistry {
  readonly schemaVersion: number;
  readonly description?: string;
  readonly cdnBase: string;
  readonly fonts: ReadonlyArray<V6FontEntry>;
  readonly default: { readonly toolditorId: string };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
// Resolve agent-workflow-test/fonts/registry.json. Run-time layout:
//   tooldi-agent-runtime/apps/agent-worker/dist/phases/v6FontRegistry.js  (built)
//   → ../../../../fonts/registry.json  (up 4: phases → dist → agent-worker →
//                                       apps → tooldi-agent-runtime → .. →
//                                       agent-workflow-test/fonts)
// Source-time layout matches because both src/ and dist/ share the same depth.
const DEFAULT_REGISTRY_PATH = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "..",
  "fonts",
  "registry.json",
);

export function loadV6FontRegistry(
  path: string = DEFAULT_REGISTRY_PATH,
): V6FontRegistry {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as V6FontRegistry;
}

export function buildFontFaceCSS(
  registry: V6FontRegistry = loadV6FontRegistry(),
): string {
  const base = registry.cdnBase.replace(/\/$/, "");
  const rules = registry.fonts.map((f) => {
    const url = `${base}/${f.savedFilename}`;
    return [
      `@font-face {`,
      `  font-family: "${f.toolditorId}";`,
      `  src: url("${url}") format("${f.format}");`,
      `  font-weight: ${f.weight};`,
      `  font-style: ${f.style};`,
      `  font-display: block;`,
      `}`,
    ].join("\n");
  });
  return rules.join("\n\n");
}

export function buildFontFaceStyleBlock(
  registry: V6FontRegistry = loadV6FontRegistry(),
): string {
  return `<style>\n${buildFontFaceCSS(registry)}\n</style>`;
}

/**
 * Inject the @font-face <style> block immediately before </head> if present,
 * otherwise before <body>. Mirrors v6-poc/extract.mjs injection strategy so
 * Playwright and prod extraction see identical font metrics.
 */
export function injectFontFaceStyle(html: string, styleBlock: string): string {
  if (html.includes("</head>")) {
    return html.replace("</head>", `${styleBlock}\n</head>`);
  }
  if (html.includes("<body")) {
    return html.replace("<body", `${styleBlock}\n<body`);
  }
  // No <head> and no <body> (bare fragment): prepend so the style still applies
  // once the browser wraps the fragment in an implicit html/body.
  return `${styleBlock}\n${html}`;
}

/**
 * Extract the first font-family token from a CSS cascade string (what
 * `getComputedStyle().fontFamily` returns). Strips surrounding quotes. Returns
 * the raw input if no comma is present. Used by the adapter to pick the
 * Toolditor ID that was set inline vs. the full browser-resolved cascade.
 */
export function parseFirstFontFamily(fontFamily: string): string {
  const first = fontFamily.split(",")[0]?.trim() ?? fontFamily;
  return first.replace(/^['"]|['"]$/g, "");
}
