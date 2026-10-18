// Timeline entry edits end to end: the real raidboss overlay (dist/) plays a real fight with
// renamed, hidden and highlighted entries, a job's own edit and added entries (common and one
// job's), as each of a few jobs; checks what the timeline shows.
//
// node timeline-edits-e2e.mjs --log <Network_*.log> --from <line> --to <line> --zone <id>
//   --edits <file.json>
// --edits: the zone's saved timeline edits, as the config page stores them under
// raidboss.timeline[<zone>] ({ entries, jobEntries, add, enable }), plus "expect": per job, entry
// texts that must ("+text") or must not ("-text") show, e.g. { "WAR": ["+[전사] 메모"] }.
// Screenshots go to out/timeline-edits-e2e/.
import fs from 'node:fs';
import path from 'node:path';

import { parseArgs, readLines, replaySegment } from './lib/log.mjs';
import { launch, openPage, outDir, send, sendLines, startFight, wait } from './lib/overlay.mjs';

const { named } = parseArgs();
const segment = replaySegment(named);
if (named.edits === undefined || segment.zone === undefined)
  throw new Error('--edits <file.json> and --zone <id> are needed');
const { expect = {}, ...zoneEdits } = JSON.parse(fs.readFileSync(named.edits, 'utf8'));
const out = outDir('timeline-edits-e2e');
const lines = await readLines(segment.file, segment.from, segment.to);

const browser = await launch();
const { page, errors } = await openPage(browser, 'raidboss', {
  query: 'timeline=1&alerts=0',
  viewport: { width: 420, height: 360 },
  data: { raidboss: { Skin: 'cbkr', timeline: { [segment.zone]: zoneEdits } } },
});
let failed = 0;
for (const job of Object.keys(expect).length > 0 ? Object.keys(expect) : ['WAR']) {
  process.env.CACTBOT_JOB = job;
  await startFight(page, segment.zone);
  await sendLines(page, lines);
  await wait(6500);
  const bars = await page.evaluate(() =>
    [...document.querySelectorAll('#timeline .timer-bar')].map((d) => ({
      text: d.querySelector('timer-bar')?.lefttext ?? '',
      highlight: d.dataset.highlight ?? '',
    }))
  );
  console.log(
    job,
    JSON.stringify(bars.map((b) => `${b.text}${b.highlight ? ` [${b.highlight}]` : ''}`)),
  );
  for (const rule of expect[job] ?? []) {
    const shown = bars.some((b) => b.text === rule.slice(1));
    const ok = rule.startsWith('+') ? shown : !shown;
    if (!ok)
      failed++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${job} ${rule}`);
  }
  await page.screenshot({ path: path.join(out, `${job}.png`) });
  await send(page, {
    type: 'onInCombatChangedEvent',
    detail: { inACTCombat: false, inGameCombat: false },
  });
  await wait(500);
}
if (errors.length > 0) {
  failed++;
  console.log('FAIL page errors:', errors.slice(0, 3).join(' | '));
}
await browser.close();
process.exitCode = failed > 0 ? 1 : 0;
