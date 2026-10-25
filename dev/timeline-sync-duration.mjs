// A sync jumping past an upcoming duration entry leaves no bar behind: TEA with phase 1 ended
// early (Living Liquid pushed at ~64s, the Liquid Hand left alive), then the first Hawk Blaster
// resyncs the timeline to 200s past "Splash x6" (81.1s, duration 5.6).  The fork's bar reuse
// once kept that bar on screen for good.  Uses the built page (dist/), Korean as the parser
// language; the page clock is moved ahead for phase 1 (the timeline runs on Date.now).
//
// node timeline-sync-duration.mjs
import { launch, openPage, sendLines, startFight, wait } from './lib/overlay.mjs';

const b = await launch();
const { page, errors } = await openPage(b, 'raidboss', {
  query: 'timeline=1&alerts=0',
  viewport: { width: 420, height: 360 },
  data: { raidboss: { Skin: 'cbkr' } },
});
await page.evaluate(() => {
  const real = Date.now.bind(Date);
  window.__offset = 0;
  Date.now = () => real() + window.__offset;
});
const bars = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('#timeline .timer-bar')].map((d) =>
      d.querySelector('timer-bar')?.lefttext ?? ''
    )
  );
const now = () =>
  page.evaluate(() => new Date(Date.now()).toISOString().replace('Z', '0000+00:00'));

await startFight(page, 887, '절 알렉산더 토벌전');
await sendLines(page, [`260|${await now()}|1|1|1|1|0`]);
await wait(500);
await page.evaluate(() => window.__offset = 64000);
await wait(1500);
const before = await bars();
// The first Hawk Blaster (no target), as the game logs it.
const hawk = ['21', await now(), '40005062', '순항추격기', '4830', '호크 블래스터', 'E0000000', ''];
while (hawk.length < 55)
  hawk.push('0');
await sendLines(page, [hawk.join('|')]);
await wait(1500);
const after = await bars();
await b.close();

const splash = (list) => list.some((t) => t.startsWith('물장구'));
const checks = [
  ['Splash x6 is coming before the sync', splash(before)],
  ['the sync reached the transition (Hawk Blaster bars)', after.some((t) => t.startsWith('호크'))],
  ['no Splash x6 bar after the sync', !splash(after)],
  ['no page errors', errors.length === 0],
];
let failed = 0;
for (const [name, ok] of checks) {
  if (!ok)
    failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`);
}
if (failed)
  console.log('before:', JSON.stringify(before), '\nafter:', JSON.stringify(after), errors);
process.exit(failed ? 1 : 0);
