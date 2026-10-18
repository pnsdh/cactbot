import { launch, pageUrl } from '../lib/overlay.mjs';
const browser = await launch();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, info = '') =>
  results.push(`${ok ? 'OK  ' : 'FAIL'} ${name}${info ? ` (${info})` : ''}`);
const open = async (data) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 700 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluateOnNewDocument((data) => {
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
      sessionStorage.clear();
    } catch {}
  }, data);
  await page.goto(pageUrl('config'), { waitUntil: 'load' });
  await wait(2500);
  return { page, errors };
};
const zone = {
  entries: { '15.6|The Fixer': { highlight: 'red' } },
  jobEntries: { WAR: { '15.6|The Fixer': { text: 'x' } } },
  add: [{ time: '33', text: 'm', duration: '', job: 'WAR' }],
};
// Classic: the note.
{
  const { page, errors } = await open({
    general: { ConfigStyle: 'classic' },
    raidboss: { timeline: { '1327': zone } },
  });
  const note = await page.evaluate(() => {
    const c = [...document.querySelectorAll('.trigger-file-container')].find((x) =>
      x.querySelector('.trigger-file-header')?.textContent.includes('헤비급(영웅) 4') &&
      !x.textContent.includes('라이트')
    );
    c.querySelector('.trigger-file-header').click();
    c.querySelector('.timeline-edit-header').click();
    return [...c.querySelectorAll('.timeline-edit-container div')].map((d) => d.innerText).find((
      t,
    ) => t.includes('새 디자인')) ?? null;
  });
  check('classic note', note !== null && note.includes('3개'), note);
  check('classic no errors', errors.length === 0, errors.join('|'));
  await page.close();
}
// Modern: trigger name opens the row by keyboard; the row has no button role.
{
  const { page, errors } = await open({ raidboss: {} });
  await page.evaluate(() => document.querySelectorAll('.config-tab')[1].click());
  await wait(150);
  await page.evaluate(() =>
    [...document.querySelectorAll('.config-active .config-view-switch button')][1].click()
  );
  await wait(150);
  const r = await page.evaluate(async () => {
    const c = [...document.querySelectorAll('.config-active .trigger-file-container')].find((x) =>
      x.offsetParent &&
      x.querySelector('.trigger-file-header-part')?.textContent.trim().startsWith(
        '아르카디아 선수권: 헤비급(영웅) 4',
      )
    );
    c.querySelector('.trigger-file-header').click();
    await new Promise((r) => setTimeout(r, 300));

    const row = c.querySelector('.config-compact > .trigger:not(.config-trigger-plain)');
    const name = row.querySelector('.config-trigger-line > .trigger-id');
    name.focus();
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return {
      role: row.getAttribute('role'),
      nameRole: name.getAttribute('role'),
      expanded: name.getAttribute('aria-expanded'),
      open: row.classList.contains('config-trigger-open'),
    };
  });
  check(
    'trigger name opens row',
    r.role === null && r.nameRole === 'button' && r.expanded === 'true' && r.open,
    JSON.stringify(r),
  );
  check('modern no errors', errors.length === 0, errors.join('|'));
  await page.close();
}
console.log(results.join('\n'));
await browser.close();
