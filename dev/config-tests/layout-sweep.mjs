// Layout sweep: every tab and the raidboss editors at several widths.
// Reports elements sticking out of their card / the window, uneven option rows, off-center rows
// and clipped (ellipsized) text.
import { launch, outDir, pageUrl } from '../lib/overlay.mjs';
const out = outDir('config-tests');
const theme = process.argv[2];
const widths = [460, 560, 640, 720, 800, 900, 1100];
const b = await launch();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const zone = {
  entries: { '15.6|The Fixer': { highlight: 'red', text: '아주 긴 이름으로 바꾼 항목의 문구 테스트입니다 정말 길게' } },
  add: [{ time: '33', text: 'm', duration: '' }],
};
const data = {
  general: { DisplayLanguage: 'ko', ConfigTheme: theme ?? 'dark' },
  raidboss: { MasterVolume: 0.5, timeline: { '1327': zone }, triggers: {} },
  oopsyraidsy: {},
};
const open = async (w) => {
  const p = await b.newPage();
  await p.setViewport({ width: w, height: 700 });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.evaluateOnNewDocument((data) => {
    window.OverlayPluginApi = {
      ready: true,
      callHandler: (msgStr, cb) => {
        const m = JSON.parse(msgStr);
        let r = {};
        if (m.call === 'cactbotLoadUser')
          r = {
            detail: {
              userLocation: 'C:\\Program Files (x86)\\Advanced Combat Tracker\\cbkr-user',
              localUserFiles: {},
              parserLanguage: 'ko',
              displayLanguage: 'ko',
              systemLocale: 'ko-KR',
              cactbotVersion: '0',
              overlayPluginVersion: '0',
              ffxivPluginVersion: '0',
              actVersion: '0',
              gameRegion: 'Korean',
            },
          };
        else if (m.call === 'cactbotLoadData') r = { data: data };
        if (cb) setTimeout(() => cb(JSON.stringify(r)), 0);
      },
    };
    try {
      localStorage.clear();
    } catch {}
  }, data);
  await p.goto(pageUrl('config'), { waitUntil: 'load' });
  await wait(2500);
  return { p, errors };
};
const check = (p, tag) =>
  p.evaluate((tag) => {
    const W = document.documentElement.clientWidth;
    const res = {
      tag,
      docScroll: document.documentElement.scrollWidth - W,
      out: [],
      rows: [],
      offCenter: [],
      clipped: [],
    };
    const vis = (e) => e.offsetParent !== null && e.getBoundingClientRect().width > 0;
    const name = (e) =>
      `${e.tagName.toLowerCase()}${
        e.className && typeof e.className === 'string'
          ? '.' + e.className.trim().split(/\s+/).join('.')
          : ''
      }${e.textContent ? ` "${e.textContent.trim().slice(0, 18)}"` : ''}`;
    const root = document.querySelector('.config-active') ?? document.body;
    for (const e of root.querySelectorAll('*')) {
      if (!vis(e)) continue;
      const r = e.getBoundingClientRect();
      if (r.right > W + 1 || r.left < -1) {
        // Only report the outermost offender.
        const par = e.parentElement.getBoundingClientRect();
        if (!(par.right > W + 1 || par.left < -1))
          res.out.push(`${name(e)} [${Math.round(r.left)},${Math.round(r.right)}]`);
      }
      const cs = getComputedStyle(e);
      if (
        cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1 &&
        e.childElementCount === 0
      )
        res.clipped.push(name(e));
    }
    for (const grid of root.querySelectorAll('.overlay-options')) {
      if (!vis(grid))
        continue;
      const kids = [...grid.children].filter(vis);
      for (let i = 0; i + 1 < kids.length; i += 2) {
        const [a, c] = [kids[i], kids[i + 1]];
        const ra = a.getBoundingClientRect();
        if (Math.round(ra.height) !== 54)
          res.rows.push(`${Math.round(ra.height)}px ${a.textContent.trim().slice(0, 20)}`);
        // Label text vs control center.
        const lab = a.querySelector('*') ?? a;
        const ctl = c.querySelector('select, input, button, label, .config-switch') ?? c;
        const lc = (lab.getBoundingClientRect().top + lab.getBoundingClientRect().bottom) / 2;
        const cc = (ctl.getBoundingClientRect().top + ctl.getBoundingClientRect().bottom) / 2;
        if (Math.abs(lc - cc) > 3 && ra.height <= 60)
          res.offCenter.push(`${Math.round(lc - cc)}px ${a.textContent.trim().slice(0, 20)}`);
      }
    }
    res.out = [...new Set(res.out)].slice(0, 6);
    res.rows = [...new Set(res.rows)].slice(0, 6);
    res.offCenter = [...new Set(res.offCenter)].slice(0, 6);
    res.clipped = [...new Set(res.clipped)].slice(0, 8);
    return res;
  }, tag);
const print = (r) => {
  const parts = [];
  if (r.docScroll > 0) parts.push(`docScroll=${r.docScroll}`);
  if (r.out.length) parts.push(`OUT ${r.out.join(' | ')}`);
  if (r.rows.length) parts.push(`ROWS ${r.rows.join(' | ')}`);
  if (r.offCenter.length) parts.push(`OFFC ${r.offCenter.join(' | ')}`);
  if (r.clipped.length) parts.push(`clip ${r.clipped.join(' | ')}`);
  console.log(`${r.tag}: ${parts.length ? parts.join('\n    ') : 'ok'}`);
};
for (const w of widths) {
  const { p, errors } = await open(w);
  const tabs = await p.$$eval('.config-tab', (t) => t.map((x) => x.textContent.trim()));
  for (let i = 0; i < tabs.length; i++) {
    await p.evaluate((i) => document.querySelectorAll('.config-tab')[i].click(), i);
    await wait(250);
    print(await check(p, `${w} ${tabs[i]}`));
    if (w === 640 || w === 900)
      await p.screenshot({ path: `${out}/sweep-${w}-${i}.png`, fullPage: false });
    // The trigger view of tabs that have one.
    const hasView = await p.evaluate(() =>
      document.querySelectorAll('.config-active .config-view-switch button').length > 1
    );
    if (hasView) {
      await p.evaluate(() =>
        [...document.querySelectorAll('.config-active .config-view-switch button')][1].click()
      );
      await wait(250);
      print(await check(p, `${w} ${tabs[i]}/triggers`));
      if (i === 1) {
        // Open the editors of one fight.
        await p.evaluate(async () => {
          const c = [...document.querySelectorAll('.config-active .trigger-file-container')].find((
            x,
          ) =>
            x.offsetParent &&
            x.querySelector('.trigger-file-header-part')?.textContent.trim().startsWith(
              '아르카디아 선수권: 헤비급(영웅) 4',
            )
          );
          c.querySelector('.trigger-file-header').click();
          await new Promise((r) => setTimeout(r, 300));
          [...c.querySelectorAll('.config-page-tab')].find((t) => t.textContent.startsWith('타임라인'))
            .click();
          await new Promise((r) => setTimeout(r, 500));
          c.querySelector('.config-tl-row')?.scrollIntoView({ block: 'start' });
          const trig = c.querySelector(
            '.config-compact > .trigger:not(.config-trigger-plain) .config-trigger-line > .trigger-id',
          );
          trig?.click();
        });
        await wait(300);
        print(await check(p, `${w} ${tabs[i]}/editors`));
        if (w === 640 || w === 460 || w === 900)
          await p.screenshot({ path: `${out}/sweep-${w}-editor.png` });
        // Open an entry's details and the color picker.
        await p.evaluate(() => {
          const row = document.querySelector('.config-active .config-tl-row');
          row.querySelector('.config-tl-more, .config-tl-expand, [aria-expanded]')?.click();
          row.querySelector('.config-tl-color-button')?.click();
        });
        await wait(200);
        print(await check(p, `${w} ${tabs[i]}/picker`));
        if (w === 460 || w === 640)
          await p.screenshot({ path: `${out}/sweep-${w}-picker.png` });
      }
      await p.evaluate(() =>
        [...document.querySelectorAll('.config-active .config-view-switch button')][0].click()
      );
    }
  }
  if (errors.length) console.log(`${w} ERRORS ${errors.join(' | ')}`);
  await p.close();
}
await b.close();
