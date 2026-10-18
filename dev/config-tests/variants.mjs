// A fight with both the fork's own triggers and upstream's (data/fork/): its card offers the
// choice, the fork's by default; choosing upstream reloads the page with upstream's triggers.
// node variants.mjs
import { launch, pageUrl } from '../lib/overlay.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 980, height: 600 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.evaluateOnNewDocument(() => {
  // What is saved survives the page's reload (as OverlayPlugin keeps it).
  const saved = () => JSON.parse(sessionStorage.getItem('variants-saved') ?? '{}');
  window.OverlayPluginApi = {
    ready: true,
    callHandler: (msgStr, cb) => {
      const m = JSON.parse(msgStr);
      let r = {};
      if (m.call === 'cactbotLoadUser') {
        r = {
          detail: {
            userLocation: 'C:\\x',
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
      } else if (m.call === 'cactbotLoadData') {
        r = { data: saved() };
      } else if (m.call === 'cactbotSaveData') {
        sessionStorage.setItem('variants-saved', JSON.stringify(m.data));
      } else if (m.call === 'say') {
        r = null;
      }
      if (cb)
        setTimeout(() => cb(r === null ? null : JSON.stringify(r)), 0);
    },
  };
});

// The Dancing Mad card: its version select, and the ids of its triggers (built on opening it).
const state = () =>
  page.evaluate(async () => {
    const container = [...document.querySelectorAll('.trigger-file-container')].find((c) =>
      [...c.querySelectorAll('select')].some((s) =>
        [...s.options].some((o) => o.value === 'upstream')
      )
    );
    if (container === undefined)
      return { found: false };
    const select = [...container.querySelectorAll('select')].find((s) =>
      [...s.options].some((o) => o.value === 'upstream')
    );
    if (container.classList.contains('collapsed'))
      container.querySelector('.trigger-file-header')?.click();
    await new Promise((r) => setTimeout(r, 300));
    const ids = [...container.querySelectorAll('.trigger-id')].map((e) => e.textContent ?? '');
    return {
      found: true,
      variant: select.value,
      triggers: ids.length,
      fork: ids.filter((id) => id.startsWith('DancingMad ')).length,
      upstream: ids.filter((id) => id.startsWith('DMU ')).length,
    };
  });

const load = async () => {
  await page.waitForFunction(
    () => document.querySelectorAll('.config-trigger-browser').length >= 2,
    { timeout: 30000 },
  );
  await wait(500);
};
await page.goto(pageUrl('config'), { waitUntil: 'load' });
await page.evaluate(() => sessionStorage.removeItem('variants-saved'));
await page.reload({ waitUntil: 'load' });
await load();
const before = await state();
// Choose upstream: the page reloads.
const navigation = page.waitForNavigation({ waitUntil: 'load', timeout: 30000 });
await page.evaluate(() => {
  const select = [...document.querySelectorAll('select')].find((s) =>
    [...s.options].some((o) => o.value === 'upstream')
  );
  select.value = 'upstream';
  select.dispatchEvent(new Event('change', { bubbles: true }));
});
await navigation;
await load();
const after = await state();
const saved = await page.evaluate(() =>
  JSON.parse(sessionStorage.getItem('variants-saved') ?? '{}').raidboss?.TriggerSetVariant
);
await browser.close();

const ok = before.found && before.variant === 'custom' && before.fork > 0 &&
  before.upstream === 0 &&
  after.variant === 'upstream' && after.upstream > 0 && after.fork === 0 &&
  saved?.DancingMadUltimate === 'upstream' && errors.length === 0;
console.log(`before ${JSON.stringify(before)}`);
console.log(`after  ${JSON.stringify(after)} saved ${JSON.stringify(saved)}`);
console.log(
  `${ok ? 'OK  ' : 'FAIL'} fight versions${errors.length ? ` (errors: ${errors.join('; ')})` : ''}`,
);
process.exit(ok ? 0 : 1);
