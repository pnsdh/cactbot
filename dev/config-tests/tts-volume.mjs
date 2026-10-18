// The TTS master volume on the config page is the pnsdh OverlayPlugin's own setting: shown from
// it, set in it as it changes (without the reload prompt), and locked with other OverlayPlugins.
// node tts-volume.mjs
import { launch, pageUrl } from '../lib/overlay.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const open = async (browser, plugin) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 980, height: 600 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluateOnNewDocument((plugin) => {
    window.__ttsVolume = plugin ? 70 : undefined;
    window.__volumeSets = [];
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
          r = { data: { raidboss: {} } };
        } else if (m.call === 'say' && m.query === 'volume') {
          // As the pnsdh OverlayPlugin answers; others answer nothing.
          if (window.__ttsVolume === undefined) {
            r = null;
          } else {
            if (typeof m.volume === 'number') {
              window.__ttsVolume = m.volume;
              window.__volumeSets.push(m.volume);
            }
            r = { volume: window.__ttsVolume, enabled: true };
          }
        }
        if (cb)
          setTimeout(() => cb(r === null ? null : JSON.stringify(r)), 0);
      },
    };
    try {
      localStorage.clear();
    } catch {}
  }, plugin);
  await page.goto(pageUrl('config'), { waitUntil: 'load' });
  await page.waitForSelector('.option-input-container[data-option-id="TtsVolume"]', {
    timeout: 30000,
  });
  await wait(500);
  return { page, errors };
};

const shown = (page) =>
  page.evaluate(() => {
    const box = document.querySelector(
      '.option-input-container[data-option-id="TtsVolume"] .config-num-shown',
    );
    return { value: box?.value, disabled: box?.disabled };
  });

const browser = await launch();
const results = [];
const check = (name, ok, info) => results.push(`${ok ? 'OK  ' : 'FAIL'} ${name} (${info})`);

{
  const { page, errors } = await open(browser, true);
  // The config page's tabs: raidboss is the second.
  await page.evaluate(() => document.querySelectorAll('.config-tab')[1]?.click());
  await wait(200);
  if (process.env.TTSVOL_SHOT) {
    const card = await page.evaluateHandle(() =>
      document.querySelector('.option-input-container[data-option-id="TtsVolume"]')
        ?.closest('.config-card')
    );
    await card.asElement()?.screenshot({ path: process.env.TTSVOL_SHOT });
  }
  const first = await shown(page);
  check(
    'shows the plugin\'s volume',
    first.value === '70' && !first.disabled,
    JSON.stringify(first),
  );
  const box = await page.$('.option-input-container[data-option-id="TtsVolume"] .config-num-shown');
  await box.click({ clickCount: 3 });
  await box.type('40');
  await wait(600);
  const sets = await page.evaluate(() => window.__volumeSets);
  check('sets it in the plugin', sets.at(-1) === 40, JSON.stringify(sets));
  const prompt = await page.evaluate(() =>
    !document.getElementById('butter-margin').classList.contains('hidden')
  );
  check('no reload prompt', !prompt, `prompt=${prompt}`);
  // Changed in the plugin's settings: shown here within a few seconds.
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.__ttsVolume = 55;
  });
  await wait(3000);
  const followed = await shown(page);
  check('follows the plugin', followed.value === '55', JSON.stringify(followed));
  // Alerts output as text and sound (the default): said in the TTS card, with a button to switch.
  const note = () =>
    page.evaluate(() => {
      const n = document.querySelector('.config-tts-note');
      const select = document.querySelector(
        '.option-input-container[data-option-id="DefaultAlertOutput"] select',
      );
      return { shown: n !== null && n.offsetParent !== null, output: select?.value };
    });
  const before = await note();
  await page.evaluate(() => document.querySelector('.config-tts-note button').click());
  await wait(400);
  const after = await note();
  const promptAfter = await page.evaluate(() =>
    !document.getElementById('butter-margin').classList.contains('hidden')
  );
  check(
    'TTS output note and button',
    before.shown && before.output === 'textAndSound' && !after.shown &&
      after.output === 'ttsAndText' &&
      promptAfter,
    `${JSON.stringify(before)} -> ${JSON.stringify(after)}, reload prompt ${promptAfter}`,
  );
  check('no page errors', errors.length === 0, errors.join('; '));
  await page.close();
}
{
  const { page } = await open(browser, false);
  const state = await shown(page);
  check('locked without the plugin\'s TTS', state.disabled === true, JSON.stringify(state));
  await page.close();
}
await browser.close();
for (const r of results)
  console.log(r);
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
