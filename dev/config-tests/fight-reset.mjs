// A fight's own options (a raidboss trigger set's config, its alert output) have the reset button
// other options have: shown when changed, putting the default back and saving it.
// node fight-reset.mjs
import { launch, pageUrl } from '../lib/overlay.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 980, height: 600 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.evaluateOnNewDocument(() => {
  window.__saved = null;
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
        r = {
          data: {
            raidboss: {
              TriggerSetConfig: { DancingMadUltimate: { dmStarMethod: 'absolute' } },
              triggerSets: { DancingMadUltimate: { Output: 'ttsOnly' } },
            },
          },
        };
      } else if (m.call === 'cactbotSaveData') {
        window.__saved = m.data;
      } else if (m.call === 'say') {
        r = null;
      }
      if (cb)
        setTimeout(() => cb(r === null ? null : JSON.stringify(r)), 0);
    },
  };
  try {
    localStorage.clear();
  } catch {}
});
await page.goto(pageUrl('config'), { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelectorAll('.config-trigger-browser').length >= 2, {
  timeout: 30000,
});
await wait(500);

// The fight's options: the star method select (only it has "absolute"), the set's output before it.
const state = () =>
  page.evaluate(() => {
    const star = [...document.querySelectorAll('select')].find((s) =>
      [...s.options].some((o) => o.value === 'absolute')
    );
    const options = star?.closest('.overlay-options');
    const output = options?.querySelector('select');
    const reset = (s) => {
      const button = s?.closest('.option-input-container')?.querySelector('.config-reset');
      return button === null || button === undefined
        ? 'none'
        : button.classList.contains('config-hidden')
        ? 'hidden'
        : 'shown';
    };
    return {
      star: star?.value,
      starReset: reset(star),
      output: output?.value,
      outputReset: reset(output),
      saved: JSON.stringify(window.__saved?.raidboss ?? null),
    };
  });
const before = await state();
await page.evaluate(() => {
  for (const s of document.querySelectorAll('select')) {
    const options = [...s.options].map((o) => o.value);
    if (options.includes('absolute') || options.includes('ttsOnly') && s.value === 'ttsOnly')
      s.closest('.option-input-container')?.querySelector('.config-reset')?.click();
  }
});
await wait(800);
const after = await state();
await browser.close();

const ok = before.star === 'absolute' && before.starReset === 'shown' &&
  before.output === 'ttsOnly' &&
  before.outputReset === 'shown' && after.star === 'relative' && after.starReset === 'hidden' &&
  after.output === 'textAndSound' && after.outputReset === 'hidden' && errors.length === 0;
console.log(`before ${JSON.stringify(before)}`);
console.log(`after  ${JSON.stringify(after)}`);
console.log(
  `${ok ? 'OK  ' : 'FAIL'} fight options reset${
    errors.length ? ` (errors: ${errors.join('; ')})` : ''
  }`,
);
process.exit(ok ? 0 : 1);
