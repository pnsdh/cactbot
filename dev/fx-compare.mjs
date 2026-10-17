// The cbkr skin's effects frame by frame, for checking a change keeps their look: a bar landing,
// one promoted to next, a cast fading in.  The animations each effect starts are paused and set to
// fixed moments (slowing them down instead would not slow the compositor's).
//
// node fx-compare.mjs capture <label> [page] [--chrome95]
// node fx-compare.mjs diff <labelA> <labelB>
// page: raidboss (dist/, default) or the URL of another build's raidboss.html.
// Frames go to out/fx-compare/<label>/, sheets (A | B | difference x4) to out/fx-compare/.
import fs from 'node:fs';
import path from 'node:path';

import { compareImages } from './lib/compare.mjs';
import { parseArgs } from './lib/log.mjs';
import { chrome95Path, launch, nextFrames, openPage, outDir } from './lib/overlay.mjs';

const kMoments = {
  land: [0, 40, 100, 180, 300, 450, 650],
  promote: [0, 60, 150, 200, 300, 460, 650],
  cast: [0, 60, 130, 260],
};

const { positional, named } = parseArgs();
const [mode, labelA = 'a', arg2] = positional;
const out = outDir('fx-compare');

// Records the animations present now, so that freezeNew() can pause the ones started after.
const helpers = (p) =>
  p.evaluateOnNewDocument(() => {
    const all = () => [
      ...document.getAnimations(),
      ...[...document.querySelectorAll('timer-bar')].flatMap((bar) =>
        bar.shadowRoot.getAnimations()
      ),
    ];
    window.__mark = () => window.__known = new Set(all());
    window.__freezeNew = () => {
      window.__frozen = all().filter((a) => !window.__known.has(a));
      for (const a of all())
        a.pause();
      return window.__frozen.map((a) => a.animationName ?? a.transitionProperty ?? 'script');
    };
    window.__seek = (t) => {
      for (const a of window.__frozen)
        a.currentTime = t;
    };
  });

const addBar = (p, classes, duration, text) =>
  p.evaluate(
    (classes, duration, text) => {
      const div = document.createElement('div');
      div.className = ['timer-bar', ...classes].join(' ');
      div.style.setProperty('--timeline-bar-height', classes.includes('next') ? '54px' : '32px');
      const bar = document.createElement('timer-bar');
      div.appendChild(bar);
      bar.righttext = 'remain';
      bar.lefttext = text;
      bar.toward = 'right';
      bar.stylefill = classes.includes('channeling') ? 'empty' : 'fill';
      document.getElementById('timeline').appendChild(div);
      bar.duration = duration;
      bar.value = duration;
      window.__div = div;
      window.__bar = bar;
    },
    classes,
    duration,
    text,
  );

const capture = async (label, page) => {
  const dir = path.join(out, label);
  fs.mkdirSync(dir, { recursive: true });
  const browser = await launch(named.chrome95 !== undefined ? { chrome: chrome95Path() } : {});
  const open = async () =>
    (await openPage(browser, page, {
      query: 'timeline=1&alerts=0',
      viewport: { width: 490, height: 130 },
      beforeLoad: helpers,
    })).page;
  const shoot = async (p, effect) => {
    for (const t of kMoments[effect]) {
      await p.evaluate((t) => window.__seek(t), t);
      await nextFrames(p);
      const file = path.join(dir, `${effect}-${String(t).padStart(3, '0')}.png`);
      await p.screenshot({ path: file, clip: { x: 0, y: 0, width: 490, height: 70 } });
    }
  };

  // Landing: the first bar (next, soon) reaching 0.
  let p = await open();
  await addBar(p, ['next', 'soon'], 2.0, '배니시 IV (산개)');
  await new Promise((r) => setTimeout(r, 1000));
  const landed = await p.evaluate(() =>
    new Promise((resolve) => {
      window.__mark();
      new MutationObserver(() => {
        if (window.__bar.hasAttribute('ended'))
          resolve(window.__freezeNew());
      }).observe(window.__bar, { attributes: true, attributeFilter: ['ended'] });
    })
  );
  console.log(label, 'land:', landed.join(', '));
  await shoot(p, 'land');
  await p.close();

  // Promotion: a bar becoming next.
  p = await open();
  await addBar(p, [], 20, '성스러운 화살 1 (안/바깥 고리)');
  await new Promise((r) => setTimeout(r, 800));
  const promoted = await p.evaluate(() => {
    window.__mark();
    window.__div.classList.add('next');
    window.__div.style.setProperty('--timeline-bar-height', '54px');
    return window.__freezeNew();
  });
  console.log(label, 'promote:', promoted.join(', '));
  await shoot(p, 'promote');
  await p.close();

  // A cast fading in.
  p = await open();
  await p.evaluate(() => window.__mark());
  await addBar(p, ['channeling', 'soon'], 12, '시전중: 성스러운 화살 (부채꼴)');
  const cast = await p.evaluate(() => window.__freezeNew());
  console.log(label, 'cast:', cast.join(', '));
  await shoot(p, 'cast');
  await p.close();
  await browser.close();
};

const diff = async (a, b) => {
  const browser = await launch();
  for (const effect of Object.keys(kMoments)) {
    const rows = kMoments[effect].map((t) => {
      const name = `${effect}-${String(t).padStart(3, '0')}.png`;
      return { label: `${effect} ${t}ms`, a: path.join(out, a, name), b: path.join(out, b, name) };
    });
    const stats = await compareImages(browser, rows, path.join(out, `${a}-vs-${b}-${effect}.png`));
    for (const s of stats)
      console.log(`${s.label}: mean=${s.mean} max=${s.max}`);
  }
  await browser.close();
};

if (mode === 'capture')
  await capture(labelA, arg2 ?? 'raidboss');
else if (mode === 'diff')
  await diff(labelA, arg2 ?? 'b');
else
  console.log('node fx-compare.mjs capture <label> [page] [--chrome95] | diff <labelA> <labelB>');
