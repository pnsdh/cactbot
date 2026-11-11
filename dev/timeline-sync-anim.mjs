// cbkr timeline bars around syncs, recorded with the screencast: an early sync (the ability comes
// before its bar reaches 0), a late one (after), a jump, and a phase pushed early (a sync far
// ahead).  Checks that the bars of the entry an early sync (or the jump's sync) matched land like
// ones that run out instead of vanishing, while bars a sync skipped go at once, and writes
// contact sheets of frames around each event and the bar log to out/sync-anim/.
//
// node timeline-sync-anim.mjs [page]
import fs from 'node:fs';
import path from 'node:path';

import { launch, openPage, outDir, sendLines, startFight, wait } from './lib/overlay.mjs';

const out = outDir('sync-anim');
for (const f of fs.readdirSync(out))
  fs.rmSync(path.join(out, f), { recursive: true });

const timeline = `
hideall "--sync--"
0.0 "--sync--" InCombat { inGameCombat: "1" } window 0,1
8.0 "알파" Ability { id: "AAA1" } window 8,8
12.0 "베타" Ability { id: "AAA2" } window 8,8
16.0 "감마"
20.0 "델타" Ability { id: "AAA3" } window 20,20 jump 100
24.0 "엡실론"
28.0 "제타"
32.0 "에타"
100.0 "델타"
104.0 "카파"
108.0 "람다"
112.0 "뮤"
116.0 "뉴"
120.0 "크시"
200.0 "--sync--" Ability { id: "AAA4" } window 100,5
204.0 "오미크론"
208.0 "파이"
`;
const userFile = `Options.Triggers.push({
  id: 'SyncAnimProbe',
  zoneId: ZoneId.Mist,
  timeline: ${JSON.stringify(timeline)},
  triggers: [],
});`;

const b = await launch();
const { page, errors } = await openPage(b, process.argv[2] ?? 'raidboss', {
  query: 'timeline=1&alerts=0',
  viewport: { width: 420, height: 250 },
  data: { raidboss: { Skin: 'cbkr' } },
  userFiles: { 'raidboss/sync-anim.js': userFile },
});

// The bars every frame they change: text, classes, shown seconds.
await page.evaluate(() => {
  window.__log = [];
  let last = '';
  const tick = () => {
    const s = [...document.querySelectorAll('#timeline .timer-bar')].map((d) => {
      const bar = d.querySelector('timer-bar');
      const cls = [...d.classList].filter((c) => c !== 'timer-bar').join('.');
      return `${bar?.lefttext}${cls ? `.${cls}` : ''}`;
    }).join(' | ');
    if (s !== last)
      window.__log.push(`${Date.now()} ${s}`);
    last = s;
    requestAnimationFrame(tick);
  };
  tick();
});

const cdp = await page.createCDPSession();
const frames = [];
cdp.on('Page.screencastFrame', (f) => {
  frames.push({ t: f.metadata.timestamp * 1000, data: f.data });
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
});

const iso = () => page.evaluate(() => new Date().toISOString().replace('Z', '0000+00:00'));
const ability = async (id, name) => {
  const l = ['21', await iso(), '40001000', '보스', id, name, '10001000', '나', ''];
  while (l.length < 55)
    l.push('0');
  return l.join('|');
};

await startFight(page, 136, '안개 마을');
await wait(800);
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, everyNthFrame: 1 });
const t0 = Date.now();
await sendLines(page, [`260|${await iso()}|1|1|1|1|0`]);
const at = async (ms) => {
  const left = t0 + ms - Date.now();
  if (left > 0)
    await wait(left);
};
const events = [];
const fire = async (label, ms, id, name) => {
  await at(ms);
  const t = Date.now();
  await sendLines(page, [await ability(id, name)]);
  events.push({ label, t });
};
await fire('early', 7600, 'AAA1', '알파');
await fire('late', 12200, 'AAA2', '베타');
await fire('jump', 19900, 'AAA3', '델타');
// A phase pushed early: a sync far ahead while 뮤 (112) is about to come.
await fire('push', 31500, 'AAA4', '푸시');
await at(34000);
await cdp.send('Page.stopScreencast');
const log = await page.evaluate(() => window.__log);
fs.writeFileSync(
  path.join(out, 'log.txt'),
  [
    ...events.map((e) => `EVENT ${e.label} ${e.t}`),
    ...log.map((l) => {
      const [t, ...rest] = l.split(' ');
      return `${(Number(t) - t0).toString().padStart(6)} ${rest.join(' ')}`;
    }),
  ].join('\n'),
);

// Contact sheets: frames at set moments around each event (and before the late one, the bar
// reaching 0 on its own).
const moments = [-300, -100, 0, 33, 66, 100, 150, 200, 260, 330, 420, 520, 650, 800, 1000, 1300];
const sheet = async (name, center) => {
  const picks = moments.map((m) => {
    let best = frames[0];
    for (const f of frames) {
      if (Math.abs(f.t - (center + m)) < Math.abs(best.t - (center + m)))
        best = f;
    }
    return { m, real: Math.round(best.t - center), data: best.data };
  });
  const p = await b.newPage();
  await p.setViewport({ width: 4 * 420, height: 4 * 270 });
  await p.setContent('<body style="margin:0;background:#000"><canvas id=c></canvas></body>');
  await p.evaluate(async (picks) => {
    const c = document.getElementById('c');
    c.width = 4 * 420;
    c.height = 4 * 270;
    const g = c.getContext('2d');
    for (const [i, pick] of picks.entries()) {
      const img = new Image();
      img.src = `data:image/jpeg;base64,${pick.data}`;
      await img.decode();
      const x = (i % 4) * 420;
      const y = Math.floor(i / 4) * 270;
      g.drawImage(img, x, y + 20, 420, 250);
      g.fillStyle = '#ff0';
      g.font = '14px sans-serif';
      g.fillText(`${pick.m >= 0 ? '+' : ''}${pick.m}ms (${pick.real})`, x + 6, y + 15);
    }
  }, picks);
  await (await p.$('#c')).screenshot({ path: path.join(out, `${name}.png`) });
  await p.close();
};
for (const e of events)
  await sheet(e.label, e.t);
// Beta reaching 0 on its own, 0.6s before its late sync.
await sheet('late-expire', events[1].t - 600);
await b.close();

// The bar log after an event: does a bar with this name show as expired (landing) first?
const landed = (event, name) => {
  const after = log.filter((l) => Number(l.split(' ')[0]) >= event.t);
  return after.length > 0 &&
    after[0].split(' | ').some((b) => b.includes(`${name}.`) && b.includes('.expired'));
};
const checks = [
  ['early sync: its bar lands (shown expired) instead of vanishing', landed(events[0], '알파')],
  ['jump: the bar of the jump sync lands', landed(events[2], '델타')],
  [
    'jump: the skipped bars go at once',
    !log.some((l) => Number(l.split(' ')[0]) >= events[2].t && /엡실론|제타|에타/.test(l)),
  ],
  [
    'push: a bar the sync skipped goes at once, even about to come',
    !log.some((l) => Number(l.split(' ')[0]) >= events[3].t && l.includes('뮤')),
  ],
  ['no page errors', errors.length === 0],
];
let failed = 0;
for (const [name, ok] of checks) {
  if (!ok)
    failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`);
}
console.log(`${frames.length} frames; sheets in ${out}`);
process.exit(failed ? 1 : 0);
