import { addOverlayListener } from '../../resources/overlay_plugin_api';

// Fork, for development (raidboss.html?devProbe=latency): how late log lines reach this page
// (now - the line's own time) and how late its own timers run, summarized in the console each
// minute.  OverlayPlugin with its probe on (op-probe.enable) writes these lines to
// %TEMP%\op-latency.log next to its own measurements.
const kStamp = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3})\d*([+-]\d\d:\d\d)$/;

export const startLatencyProbe = (which: string): void => {
  const lineDelays: number[] = [];
  const abilityDelays: number[] = [];
  const loopDelays: number[] = [];

  addOverlayListener('LogLine', (e) => {
    const type = e.line[0] ?? '';
    const m = kStamp.exec(e.line[1] ?? '');
    // OverlayPlugin's own lines (256+) are stamped with the server's time.
    if (m === null || parseInt(type) >= 256)
      return;
    const delay = Date.now() - Date.parse(`${m[1] ?? ''}${m[2] ?? ''}`);
    lineDelays.push(delay);
    if (type === '21' || type === '22')
      abilityDelays.push(delay);
  });

  // A 50ms timer: how much later than that it runs (Windows' 15.6ms timer steps included).
  let loopLast = performance.now();
  const loop = () => {
    const now = performance.now();
    loopDelays.push(now - loopLast - 50);
    loopLast = now;
    window.setTimeout(loop, 50);
  };
  window.setTimeout(loop, 50);

  const summary = (name: string, v: number[]) => {
    if (v.length === 0)
      return;
    const s = [...v].sort((a, b) => a - b);
    const q = (p: number) => (s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0).toFixed(1);
    const over = (ms: number) => s.filter((x) => x > ms).length;
    console.log(
      `[latency] ${which} ${name}: n=${s.length} p50=${q(0.5)} p90=${q(0.9)} p99=${q(0.99)} max=${
        q(1)
      } >16ms=${over(16)} >50ms=${over(50)} >100ms=${over(100)} >250ms=${over(250)}`,
    );
    v.length = 0;
  };
  window.setInterval(() => {
    summary('line time -> page (game lines)', lineDelays);
    summary('line time -> page (abilities 21/22)', abilityDelays);
    summary('page timer lateness (50ms timer)', loopDelays);
  }, 60000);
};
