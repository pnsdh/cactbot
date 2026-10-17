// Load of the raidboss overlays while a real fight plays: a log segment is sent up to its last
// line (the timeline syncs there), then the timeline runs on its own and is measured for a few
// seconds (from when a cast bar shows, with --cast); the alerts-only overlay too.
//
// node perf-replay.mjs <label> [page] --log <Network_*.log> --from <line> --to <line> --zone <id>
//   [--seconds 6] [--cast]
// page: raidboss (dist/, default) or the URL of another build's raidboss.html, to compare.
// Writes out/perf-replay/<label>.json and a trace for DevTools.
import fs from 'node:fs';
import path from 'node:path';

import { parseArgs, readLines, replaySegment } from './lib/log.mjs';
import {
  launch,
  openPage,
  outDir,
  perfMetrics,
  sendLines,
  startFight,
  wait,
} from './lib/overlay.mjs';

const { positional, named } = parseArgs();
const [label = 'run', page = 'raidboss'] = positional;
const segment = replaySegment(named);
const seconds = parseFloat(named.seconds ?? '6');
const out = outDir('perf-replay');
const lines = await readLines(segment.file, segment.from, segment.to);

const browser = await launch();
const replay = async (query) => {
  const opened = await openPage(browser, page, {
    query,
    // Animation frame requests, counted from the start.
    beforeLoad: (p) =>
      p.evaluateOnNewDocument(() => {
        window.__raf = 0;
        const raf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (f) => {
          window.__raf++;
          return raf(f);
        };
      }),
  });
  await startFight(opened.page, segment.zone ?? 0);
  await sendLines(opened.page, lines);
  return opened;
};
const result = { label, page, lines: lines.length };

// Timeline overlay.
{
  const { page: p, errors } = await replay('timeline=1&alerts=0');
  const cdp = await p.target().createCDPSession();
  await cdp.send('Performance.enable');
  if (named.cast !== undefined) {
    let found = false;
    for (let i = 0; i < 240 && !found; i++) {
      found = await p.evaluate(() => !!document.querySelector('#timeline .timer-bar.channeling'));
      if (!found)
        await wait(250);
    }
    result.castBarFound = found;
  }
  // Remaining-time text changes of every bar, to check they keep their 0.1s steps.
  await p.evaluate(() => {
    window.__texts = [];
    const t0 = performance.now();
    const watch = (bar) => {
      const right = bar.shadowRoot.getElementById('righttext');
      new MutationObserver(() =>
        window.__texts.push([bar.lefttext, performance.now() - t0, right.textContent])
      )
        .observe(right, { childList: true, characterData: true, subtree: true });
    };
    document.querySelectorAll('#timeline timer-bar').forEach(watch);
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          const bar = n.querySelector?.('timer-bar');
          if (bar)
            watch(bar);
        }
      }
    }).observe(document.getElementById('timeline'), { childList: true, subtree: true });
    window.__raf = 0;
  });
  const traceFile = path.join(out, `${label}.trace.json`);
  await p.tracing.start({
    path: traceFile,
    categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'],
  });
  const m0 = await perfMetrics(cdp);
  const t0 = Date.now();
  await p.screenshot({ path: path.join(out, `${label}-timeline.png`) });
  await wait(seconds * 1000);
  const m1 = await perfMetrics(cdp);
  const secs = (Date.now() - t0) / 1000;
  await p.tracing.stop();
  const events = JSON.parse(fs.readFileSync(traceFile, 'utf8')).traceEvents;
  const sum = (name) =>
    events.filter((e) => e.name === name && e.dur).reduce((s, e) => s + e.dur, 0) / 1000;
  const count = (name) => events.filter((e) => e.name === name && e.ph !== 'E').length;
  const perSec = (v) => +(v / secs).toFixed(2);
  const d = (k) => m1[k] - m0[k];
  result.timeline = {
    seconds: +secs.toFixed(1),
    rafPerSec: perSec(await p.evaluate(() => window.__raf)),
    styleRecalcsPerSec: perSec(d('RecalcStyleCount')),
    layoutsPerSec: perSec(d('LayoutCount')),
    scriptMsPerSec: perSec(d('ScriptDuration') * 1000),
    styleMsPerSec: perSec(d('RecalcStyleDuration') * 1000),
    taskMsPerSec: perSec(d('TaskDuration') * 1000),
    paintsPerSec: perSec(count('Paint')),
    paintMsPerSec: perSec(sum('Paint')),
    rasterMsPerSec: perSec(sum('RasterTask')),
  };
  const byBar = {};
  for (const [bar, t, text] of await p.evaluate(() => window.__texts))
    (byBar[bar] ??= []).push([t, text]);
  let skipped = 0;
  for (const list of Object.values(byBar)) {
    for (let i = 1; i < list.length; i++) {
      const a = parseFloat(list[i - 1][1]);
      const b = parseFloat(list[i][1]);
      if (!isNaN(a) && !isNaN(b) && Math.round((a - b) * 10) > 1)
        skipped++;
    }
  }
  result.textStepsSkipped = skipped;
  result.timelineErrors = errors;
  await p.close();
}

// Alerts-only overlay (it should draw no bars).
{
  const { page: p, errors } = await replay('timeline=0&alerts=1');
  await wait(3000);
  await p.evaluate(() => window.__raf = 0);
  const t0 = Date.now();
  await wait(4000);
  result.alerts = {
    timerBars: await p.evaluate(() => document.querySelectorAll('timer-bar').length),
    rafPerSec: +((await p.evaluate(() => window.__raf)) / ((Date.now() - t0) / 1000)).toFixed(1),
    errors,
  };
  await p.close();
}
await browser.close();
fs.writeFileSync(path.join(out, `${label}.json`), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
