// Convenience wrapper: extract → map → verify.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function run(script) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [join(__dirname, script)], { stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`))));
  });
}

await run('extract.mjs');
await run('mapper.mjs');
await run('verify.mjs');
