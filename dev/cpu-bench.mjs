// JS time per log line in the raidboss overlay (alerts and timeline), as fast as it takes them,
// and the hottest functions of a CPU profile (function names show in a dev build:
// npx cross-env TS_NODE_PROJECT=tsconfig.webpack.json webpack --config webpack/webpack.dev.ts).
// With --heap, the JS heap after the replay instead of the profile.
//
// node cpu-bench.mjs [page] --log <Network_*.log> [--from <line>] [--to <line>] [--zone <id>]
//   [--top 30] [--heap]
import { parseArgs, readLines, replaySegment } from './lib/log.mjs';
import { launch, openPage, perfMetrics, startFight, wait } from './lib/overlay.mjs';

const { positional, named } = parseArgs();
const [page = 'raidboss'] = positional;
const segment = replaySegment(named);
const lines = await readLines(segment.file, segment.from, segment.to);

const browser = await launch();
const { page: p, errors } = await openPage(browser, page, {
  query: 'alerts=1&timeline=1',
  viewport: { width: 1200, height: 800 },
  data: {},
  settleMs: 3000,
});
await startFight(p, segment.zone ?? 0);
await wait(2000);

const cdp = await p.target().createCDPSession();
const profile = named.heap === undefined;
if (profile) {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
}
await cdp.send('Performance.enable');
const m0 = await perfMetrics(cdp);

// In chunks of 200 lines per task, like bursts of events.
const chunk = 200;
const t0 = Date.now();
let jsMs = 0;
for (let i = 0; i < lines.length; i += chunk) {
  jsMs += await p.evaluate((part) => {
    const s = performance.now();
    for (const raw of part)
      window.__OverlayCallback({ type: 'LogLine', line: raw.split('|'), rawLine: raw });
    return performance.now() - s;
  }, lines.slice(i, i + chunk));
}
const wall = Date.now() - t0;
const m1 = await perfMetrics(cdp);
const ms = (k) => ((m1[k] - m0[k]) * 1000).toFixed(0);
console.log(
  `lines=${lines.length} js=${jsMs.toFixed(0)}ms (${
    (jsMs * 1000 / lines.length).toFixed(1)
  }us/line) wall=${wall}ms`,
);
console.log(
  `Script=${ms('ScriptDuration')}ms Layout=${ms('LayoutDuration')}ms Style=${
    ms('RecalcStyleDuration')
  }ms Task=${ms('TaskDuration')}ms`,
);

if (profile) {
  const { profile: prof } = await cdp.send('Profiler.stop');
  const byId = new Map(prof.nodes.map((n) => [n.id, n]));
  const self = new Map();
  for (let i = 0; i < prof.samples.length; i++) {
    const f = byId.get(prof.samples[i]).callFrame;
    const key = `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/')}:${
      f.lineNumber + 1
    }`;
    self.set(key, (self.get(key) ?? 0) + (prof.timeDeltas[i] ?? 0));
  }
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  console.log(`--- top self time (total ${(total / 1000).toFixed(0)}ms)`);
  for (
    const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(
      0,
      parseInt(named.top ?? '30'),
    )
  )
    console.log(
      `${(v / 1000).toFixed(0).padStart(6)}ms ${(v * 100 / total).toFixed(1).padStart(5)}%  ${k}`,
    );
} else {
  await cdp.send('HeapProfiler.collectGarbage');
  const heap = await cdp.send('Runtime.getHeapUsage');
  console.log(
    `heap used=${(heap.usedSize / 1048576).toFixed(1)}MB total=${
      (heap.totalSize / 1048576).toFixed(1)
    }MB`,
  );
}
if (errors.length > 0)
  console.log('page errors:', errors.slice(0, 3).join(' | '));
await browser.close();
