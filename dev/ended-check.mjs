// A cbkr bar's remaining-time text and `ended` against its real end: every 0.1s step shown, how
// far off the shown time is, and how late `ended` (where the landing starts) comes.
//
// node ended-check.mjs [page]
// page: raidboss (dist/, default) or the URL of another build's raidboss.html.
import { launch, openPage } from './lib/overlay.mjs';

const [page = 'raidboss'] = process.argv.slice(2);
const browser = await launch();
const { page: p } = await openPage(browser, page, { query: 'timeline=1&alerts=0' });
const runs = await p.evaluate(async () => {
  const runs = [];
  for (const dur of [1.23, 2.07, 0.55, 3.31]) {
    const div = document.createElement('div');
    div.className = 'timer-bar';
    const bar = document.createElement('timer-bar');
    div.appendChild(bar);
    bar.righttext = 'remain';
    bar.lefttext = 'test';
    document.getElementById('timeline').appendChild(div);
    const start = Date.now();
    bar.duration = dur;
    bar.value = dur;
    const right = bar.shadowRoot.getElementById('righttext');
    const seen = [];
    let endedAt;
    await new Promise((resolve) => {
      new MutationObserver(() => seen.push([Date.now() - start, right.textContent]))
        .observe(right, { childList: true, characterData: true, subtree: true });
      new MutationObserver(() => {
        if (bar.hasAttribute('ended')) {
          endedAt = Date.now() - start;
          resolve();
        }
      }).observe(bar, { attributes: true, attributeFilter: ['ended'] });
      setTimeout(resolve, dur * 1000 + 2000);
    });
    let worst = 0;
    for (const [t, text] of seen) {
      if (text !== '')
        worst = Math.max(worst, Math.abs(parseFloat(text) - (dur - t / 1000)));
    }
    runs.push({
      dur,
      shown: seen.map((s) => s[1] || '_').join(' '),
      endedLateMs: endedAt === undefined ? 'never' : endedAt - dur * 1000,
      worstTextErrorSec: +worst.toFixed(3),
    });
    div.remove();
  }
  return runs;
});
await browser.close();
for (const r of runs)
  console.log(JSON.stringify(r));
