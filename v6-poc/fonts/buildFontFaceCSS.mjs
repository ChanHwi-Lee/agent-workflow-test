// AGW v6 Phase 2.5 — @font-face CSS generator.
//
// Reads agent-workflow-test/fonts/registry.json and emits a <style> block
// suitable for injection into Playwright's extraction HTML template. Uses
// Toolditor's {serial}_{weight} naming convention as CSS family name so no
// downstream name→ID mapping is needed.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = join(__dirname, '..', '..', 'fonts', 'registry.json');

export function loadRegistry() {
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
}

export function buildFontFaceCSS(registry = loadRegistry()) {
  const base = registry.cdnBase.replace(/\/$/, '');
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
    ].join('\n');
  });
  return rules.join('\n\n');
}

export function buildFontFaceStyleBlock(registry = loadRegistry()) {
  return `<style>\n${buildFontFaceCSS(registry)}\n</style>`;
}

// CLI: node buildFontFaceCSS.mjs [--verify]
// --verify: fetch each URL to confirm HTTP 200.
async function main() {
  const registry = loadRegistry();
  const args = process.argv.slice(2);

  if (args.includes('--verify')) {
    const base = registry.cdnBase.replace(/\/$/, '');
    const results = await Promise.all(
      registry.fonts.map(async (f) => {
        const url = `${base}/${f.savedFilename}`;
        try {
          const res = await fetch(url, { method: 'HEAD' });
          return { ...f, url, status: res.status, ok: res.ok };
        } catch (err) {
          return { ...f, url, status: 0, ok: false, error: err.message };
        }
      })
    );
    let allOk = true;
    for (const r of results) {
      console.log(`${r.ok ? '✓' : '✗'} ${r.toolditorId.padEnd(10)} HTTP=${r.status} ${r.url}`);
      if (!r.ok) allOk = false;
    }
    process.exit(allOk ? 0 : 1);
  }

  console.log(buildFontFaceStyleBlock(registry));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
