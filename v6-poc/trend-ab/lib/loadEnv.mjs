// Lightweight env loader — reads GOOGLE_API_KEY from
// tooldi-agent-runtime/.env.local without pulling in a dep.
// Mirrors the minimal-parser pattern in v6-poc/v6-e2e-smoke.mjs.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadGoogleApiKey() {
  if (process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY;
  const envPath = resolve(__dirname, '../../../tooldi-agent-runtime/.env.local');
  const data = readFileSync(envPath, 'utf8');
  const m = data.match(/^GOOGLE_API_KEY=(.+)$/m);
  if (!m) throw new Error(`GOOGLE_API_KEY not found in ${envPath}`);
  return m[1].trim().replace(/^['"]|['"]$/g, '');
}
