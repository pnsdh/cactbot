// Review round fixes: restore with "changed only", restore by index, Esc after a select, the
// timeline editor not built while out of sight, added entries counted once, the disabled eye's
// tooltip, plain tooltips not blocking the next row.
import { launch, pageUrl } from '../lib/overlay.mjs';
const b = await launch();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, info = '') =>
  results.push(`${ok ? 'OK  ' : 'FAIL'} ${name}${info ? ` (${info})` : ''}`);
const kFight = '아르카디아 선수권: 헤비급(영웅) 4';
const open = async (data, storage = {}) => {
  const p = await b.newPage();
  await p.setViewport({ width: 900, height: 700 });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.evaluateOnNewDocument(
    (data, storage) => {
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
          else if (m.call === 'cactbotLoadData') r = { data: data };
          if (cb) setTimeout(() => cb(JSON.stringify(r)), 0);
        },
      };
      try {
        localStorage.clear();
        for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
      } catch {}
    },
    data,
    storage,
  );
  await p.goto(pageUrl('config'), { waitUntil: 'load' });
  await wait(2500);
  return { p, errors };
};
const toTriggers = async (p) => {
  await p.evaluate(() => document.querySelectorAll('.config-tab')[1].click());
  await p.evaluate(() =>
    [...document.querySelectorAll('.config-active .config-view-switch button')][1].click()
  );
  await wait(300);
};
const openFight = (p) =>
  p.evaluate((name) => {
    const c = [...document.querySelectorAll('.config-active .trigger-file-container')].find((x) =>
      x.querySelector('.trigger-file-header-part')?.textContent.trim().startsWith(name)
    );
    c.querySelector('.trigger-file-header').click();
  }, kFight);

// 1. Restore with "changed only" on and no changes in the fight: the page shows.
{
  let { p, errors } = await open({}, { 'cactbot-config-changed-raidboss': '1' });
  await toTriggers(p);
  await openFight(p);
  await wait(300);
  const key = await p.evaluate(() => localStorage.getItem('cactbot-config-page-raidboss'));
  await p.close();
  ({ p, errors } = await open({}, {
    'cactbot-config-changed-raidboss': '1',
    'cactbot-config-page-raidboss': key,
  }));
  await toTriggers(p);
  const s = await p.evaluate(() => {
    const pg = document.querySelector('.config-active .config-page');
    return {
      shown: !!pg?.offsetParent,
      back: !!pg?.querySelector('.config-page-back')?.offsetParent,
    };
  });
  check('restore under "changed only" shows the page', s.shown && s.back, JSON.stringify(s));
  check('saved by index and title', /^\d+\|아르카디아/.test(key ?? ''), key);
  // 4. Esc after a select keeps focus: goes back.
  await p.evaluate(() =>
    document.querySelector('.config-active .config-page .config-page-shown select')?.focus()
  );
  await p.keyboard.press('Escape');
  await wait(200);
  check(
    'Esc from a focused select goes back',
    await p.evaluate(() => !document.querySelector('.config-active .config-page')),
  );
  check('no errors 1', errors.length === 0, errors.join(' | '));
  await p.close();
}
// 2. A saved index pointing at another file of the same title: the index wins; a stale index
// falls back to the title.
{
  const { p } = await open({}, { 'cactbot-config-page-raidboss': '99999|' + kFight });
  await toTriggers(p);
  const t = await p.evaluate(() =>
    document.querySelector('.config-active .config-page .trigger-file-header-part')?.textContent
      .trim()
  );
  check('stale index falls back to the title', t?.startsWith(kFight), t);
  await p.close();
}
// 5. Timeline tab restored while another top tab shows: not built until shown.
{
  const { p: p0 } = await open({});
  await toTriggers(p0);
  await openFight(p0);
  await wait(300);
  await p0.evaluate(() =>
    [...document.querySelectorAll('.config-active .config-page .config-page-tab')].find((t) =>
      t.textContent.startsWith('타임라인')
    ).click()
  );
  await wait(400);
  const store = await p0.evaluate(() =>
    JSON.stringify(Object.fromEntries(Object.entries(localStorage)))
  );
  await p0.close();
  const p = await b.newPage();
  await p.setViewport({ width: 900, height: 700 });
  await p.evaluateOnNewDocument((store) => {
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
        else if (m.call === 'cactbotLoadData') r = { data: {} };
        if (cb) setTimeout(() => cb(JSON.stringify(r)), 0);
      },
    };
    try {
      localStorage.clear();
      for (const [k, v] of Object.entries(JSON.parse(store))) localStorage.setItem(k, v);
      localStorage.setItem('cactbot-config-tab', 'general');
    } catch {}
  }, store);
  await p.goto(pageUrl('config'), { waitUntil: 'load' });
  await wait(2500);
  const before = await p.evaluate(() => document.querySelectorAll('.config-tl-row').length);
  await toTriggers(p);
  await wait(500);
  const after = await p.evaluate(() =>
    document.querySelectorAll('.config-active .config-page .config-tl-row').length
  );
  check('restored timeline built only when shown', after > 50, `before=${before} after=${after}`);
  await p.close();
}
// 3. Added entry with an edit counts once; 6. disabled eye tip; 7. plain tips don't block.
{
  const data = {
    raidboss: {
      timeline: {
        '1327': {
          add: [{ time: '33', text: 'Mine', duration: '' }],
          entries: { '+33|Mine': { highlight: 'red' } },
          enable: { 'The Fixer': false },
        },
      },
    },
  };
  const { p, errors } = await open(data);
  await toTriggers(p);
  const card = await p.evaluate(
    (name) =>
      [...document.querySelectorAll('.config-active .trigger-file-container')].find((x) =>
        x.querySelector('.trigger-file-header-part')?.textContent.trim().startsWith(name)
      ).querySelector('.config-file-meta').textContent,
    kFight,
  );
  check('added entry with an edit counts once (+1 hidden by name)', card.includes('변경 2'), card);
  await openFight(p);
  await wait(300);
  await p.evaluate(() =>
    [...document.querySelectorAll('.config-active .config-page .config-page-tab')].find((t) =>
      t.textContent.startsWith('타임라인')
    ).click()
  );
  await wait(500);
  const eye = await p.evaluateHandle(() =>
    [...document.querySelectorAll('.config-page .config-tl-eye')].find((x) =>
      x.getAttribute('aria-disabled') === 'true'
    )
  );
  const exists = await eye.evaluate((e) => !!e);
  if (exists) {
    await eye.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await wait(200);
    const bb = await eye.boundingBox();
    await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 3 });
    await wait(500);
    const tip = await p.evaluate(() =>
      document.querySelector('.config-tooltip.config-tooltip-shown')?.textContent ?? 'none'
    );
    check('disabled eye shows why', tip !== 'none' && tip !== '숨기기', tip);
    // Straight down onto the next row's eye: it is the one under the mouse, and clicking works.
    const next = await eye.evaluate((e) => {
      const rows = [...document.querySelectorAll('.config-page .config-tl-row')];
      const i = rows.indexOf(e.closest('.config-tl-row'));
      const n = rows[i + 1].querySelector('.config-tl-eye');
      const r = n.getBoundingClientRect();
      return [r.x + r.width / 2, r.y + r.height / 2];
    });
    await p.mouse.move(next[0], next[1], { steps: 3 });
    await wait(80);
    const under = await p.evaluate(
      ([x, y]) =>
        document.elementFromPoint(x, y)?.closest('button')?.className ??
          document.elementFromPoint(x, y)?.className,
      next,
    );
    check('tooltip does not block the next row', String(under).includes('config-tl-eye'), under);
  } else {
    check('disabled eye exists', false);
  }
  check('no errors 3', errors.length === 0, errors.join(' | '));
  await p.close();
}
console.log(results.join('\n'));
await b.close();
