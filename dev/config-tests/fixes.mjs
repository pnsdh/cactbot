import { launch, pageUrl } from '../lib/overlay.mjs';
const browser = await launch();
const results = [];
const check = (name, ok, info = '') =>
  results.push(`${ok ? 'OK  ' : 'FAIL'} ${name}${info ? ` (${info})` : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const open = async (data, baseline) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 700 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluateOnNewDocument(
    (data, baseline) => {
      window.__saved = null;
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
          else if (m.call === 'cactbotSaveData') window.__saved = m.data;
          if (cb) setTimeout(() => cb(JSON.stringify(r)), 0);
        },
      };
      try {
        localStorage.clear();
        sessionStorage.clear();
        if (baseline !== undefined)
          sessionStorage.setItem(
            'cactbot-config-baseline',
            JSON.stringify(baseline),
          );
      } catch {}
    },
    data,
    baseline,
  );
  await page.goto(pageUrl('config'), { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelectorAll('.config-trigger-browser').length >= 2,
    { timeout: 30000 },
  );
  await wait(300);
  return { page, errors };
};
const showTriggers = async (page, tab) => {
  await page.evaluate((tab) => document.querySelectorAll('.config-tab')[tab].click(), tab);
  await wait(150);
  await page.evaluate(() =>
    [...document.querySelectorAll('.config-active .config-view-switch button')][1].click()
  );
  await wait(150);
};
const openFile = (page, title) =>
  page.evaluate((title) => {
    const c = [...document.querySelectorAll('.config-active .trigger-file-container')].find((x) =>
      x.offsetParent &&
      x.querySelector('.trigger-file-header-part')?.textContent.trim().startsWith(title)
    );
    c.querySelector('.trigger-file-header').click();
    return c !== undefined;
  }, title);

// 1. Oopsy rows: output select in the line and visible.
{
  const { page, errors } = await open({});
  await showTriggers(page, 4);
  const titles = await page.evaluate(() =>
    [...document.querySelectorAll('.config-active .trigger-file-container')].filter((x) =>
      x.offsetParent
    ).slice(0, 3).map((x) => x.querySelector('.trigger-file-header-part')?.textContent.trim())
  );
  await openFile(page, titles[0]);
  await wait(300);
  const o = await page.evaluate(() => {
    const c = document.querySelector('.config-active .trigger-file-container:not(.collapsed)');
    const rows = [...c.querySelectorAll('.trigger-file-options > .trigger')];
    const sel = c.querySelector('.config-trigger-line select');
    return {
      rows: rows.length,
      lines: c.querySelectorAll('.config-trigger-line').length,
      selVisible: sel !== null && sel.offsetParent !== null,
      plain: c.querySelectorAll('.config-trigger-plain').length,
      ids: c.querySelectorAll('.config-trigger-line > .trigger-id').length,
    };
  });
  check(
    'oopsy rows compact with visible output',
    o.rows > 0 && o.lines === o.rows && o.selVisible && o.ids === o.rows,
    JSON.stringify(o),
  );
  // 2. A card's header: Enter opens its page (once), Esc goes back.
  const k = await page.evaluate(async (title) => {
    document.querySelector('.config-active .config-page-back').click();
    await new Promise((r) => setTimeout(r, 100));
    const c = [...document.querySelectorAll('.config-active .trigger-file-container')].find((x) =>
      x.offsetParent && x.querySelector('.trigger-file-header-part')?.textContent.trim() === title
    );
    const h = c.querySelector('.trigger-file-header');
    h.focus();
    h.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
    const opened = c.classList.contains('config-page') && !c.classList.contains('collapsed');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
    return opened && !c.classList.contains('config-page') && c.classList.contains('collapsed');
  }, titles[0]);
  check('card header Enter opens page, Esc back', k);
  check('oopsy no errors', errors.length === 0, errors.join('|'));
  await page.close();
}

// 3. Hidden timeline entries count as a change; 8. reload pill from a stored baseline, not for page options.
{
  const data = {
    raidboss: { timeline: { '1327': { entries: { '15.6|The Fixer': { hide: true } } } } },
  };
  const { page, errors } = await open(data, { general: { ConfigTheme: 'light' } });
  const pill = await page.evaluate(() =>
    !document.getElementById('butter-margin')?.classList.contains('hidden')
  );
  check('pill shows for changes the overlays lack', pill);
  await showTriggers(page, 1);
  const meta = await page.evaluate(() =>
    [...document.querySelectorAll('.config-active .trigger-file-container')].find((x) =>
      x.querySelector('.trigger-file-header-part')?.textContent.trim().startsWith(
        '아르카디아 선수권: 헤비급(영웅) 4',
      )
    )?.querySelector('.config-file-meta')?.textContent
  );
  check('hidden entry counts as changed', /변경/.test(meta ?? ''), meta);
  check('no errors 3', errors.length === 0, errors.join('|'));
  await page.close();
}
{
  const { page } = await open({ general: { ConfigTheme: 'light' } }, {});
  const pill = await page.evaluate(() =>
    !document.getElementById('butter-margin')?.classList.contains('hidden')
  );
  check('page options alone: no pill', !pill);
  await page.close();
}

// 4-7, 9: timeline editor.
{
  const data = {
    raidboss: {
      timelineColors: { cx: { color: '#123456' } },
      timeline: {
        '1327': {
          add: [{ time: '33', text: 'Mine', duration: '', job: 'WAR' }, {
            time: '40',
            text: 'Common',
            duration: '',
          }],
          entries: { '': '', '15.6|The Fixer': '' },
        },
      },
    },
  };
  const { page, errors } = await open(data);
  await showTriggers(page, 1);
  await openFile(page, '아르카디아 선수권: 헤비급(영웅) 4');
  await wait(300);
  await page.evaluate(() =>
    [...document.querySelectorAll('.config-active .config-page .config-page-tab')].find((t) =>
      t.textContent.startsWith('타임라인')
    ).click()
  );
  await wait(500);
  let s = await page.evaluate(() => window.__saved?.raidboss?.timeline?.['1327']?.entries);
  check(
    'emptied edits pruned on open',
    s !== undefined && Object.keys(s).length === 0,
    JSON.stringify(s),
  );
  // 4. Clearing an added entry's text is not saved.
  await page.evaluate(() => {
    const i = [...document.querySelectorAll('.config-tl-inline')].find((x) => x.value === 'Common');
    i.focus();
    i.value = '   ';
    i.dispatchEvent(new Event('input'));
    i.blur();
  });
  await wait(500);
  s = await page.evaluate(() => ({
    add: window.__saved?.raidboss?.timeline?.['1327']?.add,
    shown: [...document.querySelectorAll('.config-tl-inline')].some((x) => x.value === 'Common'),
  }));
  check(
    'blank added text not saved',
    s.shown && JSON.stringify(s.add ?? []).includes('"Common"'),
    JSON.stringify(s),
  );
  // 9. Two new entries get different texts.
  await page.evaluate(() =>
    document.querySelector('.config-tl-sticky .config-tl-tool:not(.config-tl-step)').click()
  );
  await wait(300);
  await page.keyboard.press('Escape');
  await page.evaluate(() =>
    document.querySelector('.config-tl-sticky .config-tl-tool:not(.config-tl-step)').click()
  );
  await wait(300);
  await wait(400);
  s = await page.evaluate(() =>
    (window.__saved?.raidboss?.timeline?.['1327']?.add ?? []).map((x) => x.text)
  );
  check('new entries unique', s.includes('새 항목') && s.includes('새 항목 2'), JSON.stringify(s));
  // 6. Custom color: invalid hex then a name keeps the color.
  await page.evaluate(() => document.querySelector('.config-tl-head .config-tl-tool').click());
  await wait(200);
  await page.evaluate(() => {
    const line = [...document.querySelectorAll('.config-tl-color-line')].pop();
    const hex = line.querySelector('.config-tl-hex');
    hex.value = '#12';
    hex.dispatchEvent(new Event('input'));
    const n = line.querySelector('.config-tl-color-name');
    n.value = '산개';
    n.dispatchEvent(new Event('input'));
  });
  await wait(500);
  s = await page.evaluate(() => window.__saved?.raidboss?.timelineColors?.cx);
  check(
    'custom color kept with invalid hex',
    s?.color === '#123456' && s?.name === '산개',
    JSON.stringify(s),
  );
  // 7. Parts with a filter: next skips hidden parts.
  await page.evaluate(() => {
    const i = document.querySelector('.config-tl-search');
    i.value = 'Raptor Knuckles Right';
    i.dispatchEvent(new Event('input'));
  });
  await wait(200);
  const parts = await page.evaluate(() => {
    const o = [...document.querySelectorAll('.config-tl-part-select option')];
    return [o.filter((x) => !x.disabled).length, o.length];
  });
  await page.evaluate(() => document.querySelectorAll('.config-tl-step')[1].click());
  await wait(200);
  console.log(
    'DBG',
    await page.evaluate(() => {
      const st = document.querySelector('.config-tl-sticky').getBoundingClientRect();
      const hs = [...document.querySelectorAll('.config-tl-section')].filter((x) =>
        !x.classList.contains('config-hidden')
      ).map((x) => `${x.textContent.slice(0, 12)}@${Math.round(x.getBoundingClientRect().top)}`);
      const sc = document.querySelector('.config-scroll');
      return `sticky ${Math.round(st.top)}-${Math.round(st.bottom)} hs=${
        hs.join(',')
      } scroll=${sc.scrollTop}/${sc.scrollHeight - sc.clientHeight} vh=${innerHeight}`;
    }),
  );
  const vis = await page.evaluate(() => {
    const h = [...document.querySelectorAll('.config-tl-section')].filter((x) =>
      !x.classList.contains('config-hidden')
    );
    const st = document.querySelector('.config-tl-sticky').getBoundingClientRect().bottom;
    return h.some((x) => {
      const t = x.getBoundingClientRect().top;
      return t >= st - 2 && t < innerHeight - 20;
    });
  });
  check(
    'filtered parts disabled; next goes to a shown part',
    parts[0] > 0 && parts[0] < parts[1] && vis,
    `${parts[0]}/${parts[1]} vis=${vis}`,
  );
  // 5. Copy WAR into common converts its added entries.
  await page.evaluate(() => {
    const i = document.querySelector('.config-tl-search');
    i.value = '';
    i.dispatchEvent(new Event('input'));
  });
  await page.evaluate(() => {
    const c = document.querySelector('.config-tl-copy');
    const o = [...c.options].find((x) => x.value === 'WAR');
    c.value = o.value;
    c.dispatchEvent(new Event('change'));
  });
  await wait(500);
  s = await page.evaluate(() =>
    (window.__saved?.raidboss?.timeline?.['1327']?.add ?? []).filter((x) => x.text === 'Mine')
  );
  check(
    'copy job to common converts added rows',
    s.length === 1 && s[0].job === undefined,
    JSON.stringify(s),
  );
  check('editor no errors', errors.length === 0, errors.join('|'));
  await page.close();
}
console.log(results.join('\n'));
await browser.close();
