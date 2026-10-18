// Every config page check in turn (against dist/): node config-tests/run.mjs
// Each prints OK/FAIL lines; this exits with 1 if any failed or crashed.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const kTests = ['behavior', 'fixes', 'small', 'fight-pages', 'fight-pages-2'];
let failed = 0;
for (const test of kTests) {
  const run = spawnSync(process.execPath, [path.join(here, `${test}.mjs`)], { encoding: 'utf8' });
  const lines = `${run.stdout}${run.stderr}`.split(/\r?\n/).filter((l) => l.trim() !== '');
  const fails = lines.filter((l) => l.startsWith('FAIL'));
  const ok = run.status === 0 && fails.length === 0;
  console.log(
    `${ok ? 'OK  ' : 'FAIL'} ${test} (${lines.filter((l) => l.startsWith('OK')).length} ok)`,
  );
  if (!ok) {
    failed++;
    for (const line of fails.length > 0 ? fails : lines.slice(-5))
      console.log(`     ${line}`);
  }
}
process.exitCode = failed > 0 ? 1 : 0;
