// Fight pages: open from a card, tabs, previous/next, back (button, Esc), the last page coming
// back after a reload, and search results opening the page.
import { launch, outDir, pageUrl } from '../lib/overlay.mjs';
const out = outDir('config-tests');
const b = await launch();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, info = '') =>
  results.push(`${ok ? 'OK  ' : 'FAIL'} ${name}${info ? ` (${info})` : ''}`);
const p = await b.newPage();
await p.setViewport({ width: 900, height: 700 });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.evaluateOnNewDocument(() => {
  window.__saved = window.__saved ?? {};
  window.OverlayPluginApi = {
    ready: true,
    callHandler: (msgStr, cb) => {
      const m = JSON.parse(msgStr);
      let r = {};
      if (m.call === 'cactbotLoadUser')
        r = {
          detail: {
            userLocation: 'C:/x',
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
      else if (m.call === 'cactbotLoadData')
        r = {
          data: {
            raidboss: {
              timeline: { '1327': { entries: { '15.6|The Fixer': { highlight: 'red' } } } },
            },
          },
        };
      if (cb) setTimeout(() => cb(JSON.stringify(r)), 0);
    },
  };
});
const load = async () => {
  await p.goto(pageUrl('config'), { waitUntil: 'load' });
  await wait(2500);
  await p.evaluate(() => document.querySelectorAll('.config-tab')[1].click());
  await p.evaluate(() =>
    [...document.querySelectorAll('.config-active .config-view-switch button')][1].click()
  );
  await wait(300);
};
await p.evaluateOnNewDocument(() => {
  if (!sessionStorage.getItem('kept')) {
    try {
      localStorage.clear();
    } catch {}
    sessionStorage.setItem('kept', '1');
  }
});
await load();
const state = () =>
  p.evaluate(() => {
    const browser = document.querySelector('.config-active .config-trigger-browser');
    const pageEl = browser.querySelector('.config-page');
    const visibleCards = [...browser.querySelectorAll('.trigger-file-container')].filter((c) =>
      c.offsetParent
    ).length;
    const tabs = pageEl
      ? [...pageEl.querySelectorAll('.config-page-tab')].map((t) =>
        `${t.classList.contains('config-active') ? '*' : ''}${t.textContent}`
      )
      : [];
    const shown = pageEl
      ? [...pageEl.children].filter((c) =>
        c.offsetParent && !c.classList.contains('trigger-file-header')
      ).map((c) => c.className)
      : [];
    return {
      open: browser.classList.contains('config-page-open'),
      title: pageEl?.querySelector('.trigger-file-header-part')?.textContent.trim(),
      visibleCards,
      tabs,
      shown,
      toolbar: !!browser.querySelector('.config-trigger-toolbar').offsetParent,
    };
  });
// Open from a card.
await p.evaluate(() => {
  const c = [...document.querySelectorAll('.config-active .trigger-file-container')].find((x) =>
    x.offsetParent &&
    x.querySelector('.trigger-file-header-part')?.textContent.trim().startsWith(
      '아르카디아 선수권: 헤비급(영웅) 4',
    )
  );
  c.querySelector('.trigger-file-header').click();
});
await wait(300);
let s = await state();
check(
  'card opens page',
  s.open && s.visibleCards === 1 && !s.toolbar && s.title.startsWith('아르카디아 선수권: 헤비급(영웅) 4'),
  JSON.stringify(s),
);
check(
  'three tabs, options first and shown',
  s.tabs.length === 3 && s.tabs[0].startsWith('*전투 옵션') && s.tabs[1].startsWith('트리거') &&
    s.tabs[2].startsWith('타임라인') && s.shown.length === 1 && s.shown[0].includes('overlay-options'),
  JSON.stringify(s.tabs) + JSON.stringify(s.shown),
);
check(
  'no fight steps; one header line',
  await p.evaluate(() => {
    const h = document.querySelector('.config-page > .trigger-file-header');
    const t = h.querySelector('.trigger-file-header-part').getBoundingClientRect();
    const m = h.querySelector('.config-file-meta').getBoundingClientRect();
    const b = h.querySelector('.config-page-back').getBoundingClientRect();
    return !h.querySelector('.config-page-step') &&
      Math.abs(t.top + t.height / 2 - (m.top + m.height / 2)) < 4 &&
      Math.abs(b.top + b.height / 2 - (t.top + t.height / 2)) < 4 && m.right > t.right;
  }),
);
await p.screenshot({ path: `${out}/page-triggers.png` });
// Header click on the page does nothing.
await p.evaluate(() =>
  document.querySelector('.config-page > .trigger-file-header .trigger-file-header-part').click()
);
await wait(150);
s = await state();
check('header click keeps page', s.open && s.visibleCards === 1);
// Timeline tab (builds the editor).
await p.evaluate(() => [...document.querySelectorAll('.config-page .config-page-tab')][2].click());
await wait(500);
s = await state();
const rows = await p.evaluate(() =>
  document.querySelectorAll('.config-page .config-tl-row').length
);
check(
  'timeline tab',
  s.tabs[2].startsWith('*타임라인') && /타임라인\d+변경 1$/.test(s.tabs[2].replace(/,/g, '')) && rows > 50 &&
    s.shown.length === 1,
  `${JSON.stringify(s.tabs)} rows=${rows} ${JSON.stringify(s.shown)}`,
);
await p.screenshot({ path: `${out}/page-timeline.png` });
await p.evaluate(() => [...document.querySelectorAll('.config-page .config-page-tab')][0].click());
await wait(200);
s = await state();
check(
  'options tab',
  s.tabs[0].startsWith('*전투 옵션') && s.shown.length === 1 && s.shown[0].includes('overlay-options'),
  JSON.stringify(s.shown),
);
await p.screenshot({ path: `${out}/page-options.png` });
// The timeline tab is remembered for the page coming back.
await p.evaluate(() => [...document.querySelectorAll('.config-page .config-page-tab')][2].click());
await wait(300);
// Reload: the same page and tab.
await load();
s = await state();
check(
  'page comes back',
  s.open && s.title.startsWith('아르카디아 선수권: 헤비급(영웅) 4') &&
    (s.tabs.find((t) => t.startsWith('*')) ?? '').startsWith('*타임라인'),
  JSON.stringify(s),
);
// Esc goes back; not from a text box.
await p.evaluate(() =>
  [...document.querySelectorAll('.config-page input[type="text"]')].find((x) => x.offsetParent)
    ?.focus()
);
await p.keyboard.press('Escape');
await wait(150);
const stillOpen = (await state()).open;
await p.evaluate(() => document.activeElement?.blur());
await p.keyboard.press('Escape');
await wait(200);
s = await state();
check(
  'Esc goes back (not from a box)',
  stillOpen && !s.open && s.visibleCards > 5 && s.toolbar,
  JSON.stringify({ stillOpen, ...s }),
);
const fresh = await p.evaluate(async () => {
  const c = [...document.querySelectorAll('.config-active .trigger-file-container')].filter((x) =>
    x.offsetParent
  )[3];
  c.querySelector('.trigger-file-header').click();
  await new Promise((r) =>
    setTimeout(r, 300)
  );
  const t = [...document.querySelectorAll('.config-page .config-page-tab')].find((x) =>
    x.classList.contains('config-active')
  );
  const name = t?.textContent;
  document.querySelector('.config-page .config-page-back').click();
  return name ?? 'no tabs';
});
check(
  'another fight opens on its options',
  fresh.startsWith('전투 옵션') || fresh === 'no tabs',
  fresh,
);
// After going back, a reload shows the list.
await load();
s = await state();
check('list after back', !s.open && s.visibleCards > 5);
// Search a trigger: opens its page on the triggers tab with the row open.
await p.evaluate(() => {
  const c = [...document.querySelectorAll('.config-active .trigger-file-container')].find((x) =>
    x.offsetParent &&
    x.querySelector('.trigger-file-header-part')?.textContent.trim().startsWith(
      '아르카디아 선수권: 헤비급(영웅) 4',
    )
  );
  c.querySelector('.trigger-file-header').click();
});
await wait(300);
await p.evaluate(() => document.querySelector('.config-page .config-page-back').click());
await wait(200);
const tid = await p.evaluate(() => {
  const c = [...document.querySelectorAll('.config-active .trigger-file-container')].find((x) =>
    x.querySelector('.trigger-file-header-part')?.textContent.trim().startsWith(
      '아르카디아 선수권: 헤비급(영웅) 4',
    )
  );
  return [...c.querySelectorAll('.trigger:not(.config-trigger-plain) .trigger-id')][5]?.textContent;
});
await p.evaluate((q) => {
  const i = document.querySelector('.config-search-input');
  i.focus();
  i.value = q;
  i.dispatchEvent(new Event('input', { bubbles: true }));
}, tid);
await wait(600);
console.log(
  'DBG',
  tid,
  await p.evaluate(() => {
    const r = document.querySelector('.config-trigger-results');
    return r
      ? `${r.className} vis=${!!r.offsetParent} n=${r.querySelectorAll('button').length} html=${
        r.innerHTML.slice(0, 200)
      }`
      : 'no results el';
  }),
);
const hit = await p.evaluate(() => {
  const r = [
    ...document.querySelectorAll(
      '.config-trigger-results button, .config-trigger-results [role="button"], .config-trigger-results a',
    ),
  ].find((x) => x.offsetParent);
  if (!r) return 'none';
  const t = r.textContent;
  r.click();
  return t;
});
await wait(600);
s = await state();
const openRow = await p.evaluate(
  (tid) =>
    [...document.querySelectorAll('.config-page .config-trigger-open .trigger-id')].some((x) =>
      x.textContent === tid
    ),
  tid,
);
await p.screenshot({ path: `${out}/page-search.png` });
check(
  'search opens page',
  s.open && (s.tabs[1] ?? '').startsWith('*트리거') && openRow,
  `${hit} ${JSON.stringify(s)} openRow=${openRow}`,
);
// Oopsy: one part only, no tabs.
await p.evaluate(() => document.querySelectorAll('.config-tab')[4].click());
await p.evaluate(() =>
  [...document.querySelectorAll('.config-active .config-view-switch button')][1]?.click()
);
await wait(300);
await p.evaluate(() => {
  const c = [...document.querySelectorAll('.config-active .trigger-file-container')].find((x) =>
    x.offsetParent
  );
  c.querySelector('.trigger-file-header').click();
});
await wait(300);
const oopsy = await p.evaluate(() => {
  const pg = document.querySelector('.config-active .config-page');
  return {
    page: !!pg,
    tabsShown: !!pg?.querySelector('.config-page-tabs')?.offsetParent,
    rows: pg?.querySelectorAll('.trigger').length,
  };
});
check(
  'oopsy page without tabs',
  oopsy.page && !oopsy.tabsShown && oopsy.rows > 0,
  JSON.stringify(oopsy),
);
await p.screenshot({ path: `${out}/page-oopsy.png` });
check('no errors', errors.length === 0, errors.join(' | '));
console.log(results.join('\n'));
await b.close();
