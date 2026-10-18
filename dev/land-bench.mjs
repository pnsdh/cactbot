// Load while timeline bars land one after another and the next ones are promoted: six bars ending
// a second apart, each kept 0.7s after its end like cactbot does, then removed.
//
// node land-bench.mjs <label> [page]
// page: raidboss (dist/, default) or the URL of another build's raidboss.html.
import fs from 'node:fs';
import path from 'node:path';

import { launch, openPage, outDir, perfMetrics, wait } from './lib/overlay.mjs';

const [label = 'run', page = 'raidboss'] = process.argv.slice(2);
const out = outDir('land-bench');
const browser = await launch();
const { page: p } = await openPage(browser, page, {
  query: 'timeline=1&alerts=0',
  background: null,
});
const cdp = await p.target().createCDPSession();
await cdp.send('Performance.enable');
await p.evaluate(() => {
  const rows = [];
  for (let i = 0; i < 6; i++) {
    const div = document.createElement('div');
    div.className = `timer-bar soon${i === 0 ? ' next' : ''}`;
    const bar = document.createElement('timer-bar');
    div.appendChild(bar);
    bar.righttext = 'remain';
    bar.lefttext = `기술 ${i + 1}`;
    bar.toward = 'right';
    bar.stylefill = 'fill';
    document.getElementById('timeline').appendChild(div);
    bar.duration = 30;
    bar.value = 1 + i;
    rows.push(div);
    setTimeout(() => {
      div.remove();
      rows[i + 1]?.classList.add('next');
    }, (1 + i) * 1000 + 700);
  }
});
const traceFile = path.join(out, `${label}.trace.json`);
const m0 = await perfMetrics(cdp);
await p.tracing.start({
  path: traceFile,
  categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'],
});
const t0 = Date.now();
await wait(7000);
await p.tracing.stop();
const m1 = await perfMetrics(cdp);
const secs = (Date.now() - t0) / 1000;
await browser.close();
const events = JSON.parse(fs.readFileSync(traceFile, 'utf8')).traceEvents;
const sum = (name) =>
  events.filter((e) => e.name === name && e.dur).reduce((s, e) => s + e.dur, 0) / 1000;
const count = (name) => events.filter((e) => e.name === name && e.ph !== 'E').length;
const perSec = (v) => +(v / secs).toFixed(2);
const d = (k) => m1[k] - m0[k];
const result = {
  label,
  styleRecalcsPerSec: perSec(d('RecalcStyleCount')),
  styleMsPerSec: perSec(d('RecalcStyleDuration') * 1000),
  layoutMsPerSec: perSec(d('LayoutDuration') * 1000),
  taskMsPerSec: perSec(d('TaskDuration') * 1000),
  paintsPerSec: perSec(count('Paint')),
  paintMsPerSec: perSec(sum('Paint')),
  rasterMsPerSec: perSec(sum('RasterTask')),
};
fs.writeFileSync(path.join(out, `${label}.json`), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
