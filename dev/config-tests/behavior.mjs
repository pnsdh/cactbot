// Config page behavior checks: node cfgfunc.mjs <chrome>
import { launch, pageUrl } from '../lib/overlay.mjs';
const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 980, height: 446 });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console ${m.text()}`);
});
await page.evaluateOnNewDocument(() => {
  window.__saved = null;
  window.__saves = 0;
  window.OverlayPluginApi = {
    ready: true,
    callHandler: (msgStr, cb) => {
      const m = JSON.parse(msgStr);
      let r = {};
      if (m.call === 'cactbotLoadUser')
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
      else if (m.call === 'cactbotLoadData')
        r = {
          data: {
            raidboss: {
              MaxNumberOfTimerBars: '8',
              triggers: { 'R4N Clone Cleave Collector': { Output: 'disabled' } },
            },
          },
        };
      else if (m.call === 'cactbotSaveData') {
        window.__saves++;
        window.__saved = m.data;
        (window.__calls ??= []).push('save');
      } else if (m.call === 'cactbotReloadOverlays') (window.__calls ??= []).push('reload');
      if (cb) setTimeout(() => cb(JSON.stringify(r)), 0);
    },
  };
  try {
    localStorage.clear();
  } catch {}
});
const t0 = Date.now();
await page.goto(pageUrl('config'), { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelectorAll('.config-trigger-browser').length >= 2, {
  timeout: 30000,
});
const ready = Date.now() - t0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, info = '') =>
  results.push(`${ok ? 'OK  ' : 'FAIL'} ${name}${info ? ` (${info})` : ''}`);
const ev = (fn, ...args) => page.evaluate(fn, ...args);
const tab = (i) => ev((i) => document.querySelectorAll('.config-tab')[i].click(), i);

check(
  'load',
  true,
  `${ready}ms, ${await ev(() => document.getElementsByTagName('*').length)} nodes`,
);

// Undoing a change takes the reload prompt away: a toggle twice, a box typed and set back, a trigger's output.
const pill = () => ev(() => !document.getElementById('butter-margin').classList.contains('hidden'));
await tab(1);
await wait(100);
const toggle = () =>
  ev(() => {
    const c = document.querySelector(
      '.option-input-container[data-option-id="TimelineEnabled"] input',
    );
    c.checked = !c.checked;
    c.dispatchEvent(new Event('change', { bubbles: true }));
  });
await toggle();
await wait(500);
const shownAfterOne = await pill();
await toggle();
await wait(500);
const hiddenAfterTwo = !await pill();
const box2 = await page.$(
  '.option-input-container[data-option-id="KeepExpiredTimerBarsForSeconds"] input',
);
const orig = await box2.evaluate((i) => i.value);
await box2.click({ clickCount: 3 });
await box2.type('5');
await wait(500);
const shownTyped = await pill();
await box2.click({ clickCount: 3 });
await box2.type(orig);
await wait(500);
const hiddenTypedBack = !await pill();
check(
  'undo hides prompt',
  shownAfterOne && hiddenAfterTwo && shownTyped && hiddenTypedBack,
  `one=${shownAfterOne} two=${hiddenAfterTwo} typed=${shownTyped} back=${hiddenTypedBack}`,
);

// Same for a trigger's output and a fight's own option.
await ev(() =>
  [...document.querySelectorAll('.config-active .config-view-switch button')][1].click()
);
await wait(100);
await ev(() => {
  const c = [...document.querySelectorAll('.config-active .trigger-file-container')].find((x) =>
    x.textContent.includes('라이트헤비급 3')
  );
  if (c.classList.contains('collapsed')) c.querySelector('.trigger-file-header').click();
});
await wait(200);
const setSel = (sel, v) =>
  ev(
    (sel, v) => {
      const c = [...document.querySelectorAll('.config-active .trigger-file-container')].find((x) =>
        x.textContent.includes('라이트헤비급 3')
      );
      const s = c.querySelector(sel);
      const old = s.value;
      s.value = v ?? old;
      s.dispatchEvent(new Event('change', { bubbles: true }));
      return old;
    },
    sel,
    v,
  );
const oldOut = await setSel('.trigger-options select', 'disabled');
await wait(500);
const trigShown = await pill();
await setSel('.trigger-options select', oldOut);
await wait(500);
const trigBack = !await pill();
const oldSet = await setSel(':scope > .overlay-options select', 'disabled');
await wait(500);
const setShown = await pill();
await setSel(':scope > .overlay-options select', oldSet);
await wait(500);
const setBack = !await pill();
check(
  'undo trigger and fight options',
  trigShown && trigBack && setShown && setBack,
  `trig=${trigShown}/${trigBack} set=${setShown}/${setBack} (${oldOut}, ${oldSet})`,
);
await ev(() =>
  [...document.querySelectorAll('.config-active .config-view-switch button')][0].click()
);
// Theme applies right away.
await tab(0);
await wait(200);
await ev(() => {
  const s = [...document.querySelectorAll('select')].find((x) =>
    x.closest('[data-option-id="ConfigTheme"]')
  );
  s.value = 'light';
  s.dispatchEvent(new Event('change'));
});
await wait(100);
check('theme applies', await ev(() => document.documentElement.dataset.theme) === 'light');
await ev(() => {
  const s = [...document.querySelectorAll('select')].find((x) =>
    x.closest('[data-option-id="ConfigTheme"]')
  );
  s.value = 'dark';
  s.dispatchEvent(new Event('change'));
});

// Reset to default.
await tab(1);
await wait(200);
const modified = await ev(() =>
  document.querySelector(
    '.option-input-container[data-option-id="MaxNumberOfTimerBars"] .config-reset:not(.config-hidden)',
  ) !== null
);
await ev(() =>
  document.querySelector(
    '.option-input-container[data-option-id="MaxNumberOfTimerBars"] .config-reset',
  ).click()
);
await wait(500);
const resetSaved = await ev(() => window.__saved?.raidboss?.MaxNumberOfTimerBars);
const shown = await ev(() =>
  document.querySelector('.option-input-container[data-option-id="MaxNumberOfTimerBars"] input')
    .value
);
check(
  'reset',
  modified && resetSaved === '' && shown === '6' &&
    await ev(() =>
      document.querySelector(
        '.option-input-container[data-option-id="MaxNumberOfTimerBars"] .config-reset',
      ).classList.contains('config-hidden')
    ),
  `modified=${modified} saved=${resetSaved}`,
);

// Percents and seconds are shown scaled and saved as before.
const sel = (id) => `.option-input-container[data-option-id="${id}"]`;
const pct = await ev(
  (s) => document.querySelector(`${s} .config-num-shown`).value,
  sel('AlarmSoundVolume'),
);
const rumble = await ev(
  (s) =>
    document.querySelector(`${s} .config-num-shown`).placeholder ||
    document.querySelector(`${s} .config-num-shown`).value,
  sel('AlarmRumbleDuration'),
);
await ev((s) => {
  const i = document.querySelector(`${s} .config-num-shown`);
  i.value = '35';
  i.dispatchEvent(new Event('input', { bubbles: true }));
}, sel('AlarmSoundVolume'));
await wait(500);
const savedPct = await ev(() => window.__saved?.raidboss?.AlarmSoundVolume);
const slider = await ev(
  (s) => document.querySelector(`${s} .config-range`).value,
  sel('AlarmSoundVolume'),
);
check(
  'percent and seconds',
  pct === '100' && rumble === '0.75' && savedPct === '0.35' && slider === '35',
  `shown=${pct} rumble=${rumble} saved=${savedPct} slider=${slider}`,
);
const resetText = await ev(
  (s) => document.querySelector(`${s} .config-reset`).getAttribute('data-config-tip'),
  sel('AlarmSoundVolume'),
);
check('reset says default', resetText.includes('기본값') && resetText.includes('100%'), resetText);
check('tooltips', await ev(() => document.querySelectorAll('.config-help').length) > 20);

// Invalid numbers are marked (integer gets 6.5, float gets text).
await ev(() => {
  const i = document.querySelector(
    '.option-input-container[data-option-id="BarExpiresSoonSeconds"] input',
  );
  i.value = '6.5';
  i.dispatchEvent(new Event('input'));
});
const intInvalid = await ev(() =>
  document.querySelector(
    '.option-input-container[data-option-id="BarExpiresSoonSeconds"] .config-num',
  ).classList.contains('config-invalid')
);
await ev(() => {
  const i = document.querySelector(
    '.option-input-container[data-option-id="BarExpiresSoonSeconds"] input',
  );
  i.value = '6';
  i.dispatchEvent(new Event('input'));
});
const intValid = !await ev(() =>
  document.querySelector(
    '.option-input-container[data-option-id="BarExpiresSoonSeconds"] .config-num',
  ).classList.contains('config-invalid')
);
check('invalid number', intInvalid && intValid);

// Saves are combined.
const before = await ev(() => window.__saves);
const box = await page.$('.option-input-container[data-option-id="ShowTimerBarsAtSeconds"] input');
await box.click({ clickCount: 3 });
await box.type('45', { delay: 30 });
await wait(600);
check(
  'saves combined',
  await ev(() => window.__saves) - before === 1,
  `${await ev(() => window.__saves) - before} saves`,
);

// Scroll is kept per tab.
await ev(() => document.querySelector('.config-scroll').scrollTop = 600);
await wait(50);
await tab(2);
await wait(100);
await tab(1);
await wait(100);
check('scroll per tab', await ev(() => document.querySelector('.config-scroll').scrollTop) === 600);

// Trigger view, changed-only filter, keyboard open.
await ev(() =>
  [...document.querySelectorAll('.config-active .config-view-switch button')][1].click()
);
await wait(200);
await ev(() =>
  document.querySelector('.config-active .config-page-open .config-page-back')?.click()
);
await wait(100);
await ev(() => [...document.querySelectorAll('.config-active .config-changed-toggle')][0].click());
await wait(100);
const changedFiles = await ev(() =>
  [...document.querySelectorAll(
    '.config-active .config-trigger-browser .trigger-expansion-container.config-active > .trigger-file-container',
  )].filter((c) => c.offsetParent).map((c) =>
    c.querySelector('.trigger-file-header-part').textContent
  )
);
check(
  'changed only',
  changedFiles.length === 1 && changedFiles[0].includes('라이트헤비급 4'),
  changedFiles.join(', '),
);
await ev(() => [...document.querySelectorAll('.config-active .config-changed-toggle')][0].click());
await ev(() =>
  [...document.querySelectorAll('.config-active .trigger-file-header')].find((h) => h.offsetParent)
    .focus()
);
await page.keyboard.press('Enter');
await wait(200);
check(
  'keyboard open',
  await ev(() =>
    document.activeElement.closest('.trigger-file-container')?.classList.contains('collapsed') ===
      false
  ),
);
await page.keyboard.press('Enter');
await wait(100);

// Search: "/" focuses, results, reveal, Escape.
await ev(() => document.activeElement.blur());
await page.keyboard.press('/');
await page.keyboard.type('clone cleave', { delay: 10 });
await wait(300);
const hits = await ev(() => document.querySelectorAll('.config-hit').length);
await ev(() => document.querySelector('.config-hit')?.click());
await wait(400);
const revealed = await ev(() => {
  const f = document.querySelector('.config-flash');
  if (!f) return false;
  const r = f.getBoundingClientRect();
  return r.top >= 0 && r.top < innerHeight;
});
check('search reveal', hits > 0 && revealed, `${hits} hits`);
await page.keyboard.press('/');
await page.keyboard.type('abc');
await page.keyboard.press('Escape');
await wait(100);
check(
  'escape clears',
  await ev(() =>
    document.querySelector('.config-search-input').value === '' &&
    !document.documentElement.classList.contains('config-searching')
  ),
);

// A change right before Reload is saved before overlays reload.
await tab(1);
await wait(100);
await ev(() => {
  window.__calls = [];
  const i = document.querySelector(
    '.option-input-container[data-option-id="ShowTimerBarsAtSeconds"] input',
  );
  i.value = '33';
  i.dispatchEvent(new Event('input'));
});
await ev(() => document.querySelector('.reload-button').click());
await wait(200);
check(
  'save before reload',
  await ev(() => window.__calls.join(',')) === 'save,reload' &&
    await ev(() => window.__saved.raidboss.ShowTimerBarsAtSeconds) === '33',
  await ev(() => window.__calls.join(',')),
);
await ev(() => {
  const i = document.querySelector(
    '.option-input-container[data-option-id="ShowTimerBarsAtSeconds"] input',
  );
  i.value = '34';
  i.dispatchEvent(new Event('input'));
});
await wait(400);

// A trigger set's own option counts as a change of its file.
await ev(() =>
  [...document.querySelectorAll('.config-active .config-view-switch button')][1].click()
);
await wait(100);
await ev(() => {
  const c = [...document.querySelectorAll('.config-active .trigger-file-container')].find((x) =>
    x.textContent.includes('라이트헤비급 3')
  );
  if (c.classList.contains('collapsed')) c.querySelector('.trigger-file-header').click();
  const s = c.querySelector(':scope > .overlay-options select');
  s.value = 'disabled';
  s.dispatchEvent(new Event('change', { bubbles: true }));
});
await wait(100);
check(
  'set option counted',
  await ev(() =>
    [...document.querySelectorAll('.config-active .trigger-file-container')].find((x) =>
      x.textContent.includes('라이트헤비급 3')
    ).querySelector('.config-file-changed') !== null
  ),
);

// The scale option zooms the page and keeps the narrow layouts right.
await tab(0);
await wait(100);
await ev(() => {
  const s = document.querySelector('.option-input-container[data-option-id="ConfigZoom"] select');
  s.value = '1.25';
  s.dispatchEvent(new Event('change', { bubbles: true }));
});
await wait(100);
const z = await ev(() => getComputedStyle(document.documentElement).getPropertyValue('zoom'));
await ev(() => {
  const s = document.querySelector('.option-input-container[data-option-id="ConfigZoom"] select');
  s.value = '1';
  s.dispatchEvent(new Event('change', { bubbles: true }));
});
check('scale', z === '1.25', z);

// Editing an output string starts from its default text; left unchanged it stays the default.
await tab(1);
await wait(100);
await ev(() =>
  [...document.querySelectorAll('.config-active .config-view-switch button')][1].click()
);
await wait(100);
await ev(() => {
  const c = [...document.querySelectorAll('.config-active .trigger-file-container')].find((x) =>
    x.textContent.includes('라이트헤비급 4')
  );
  if (c.classList.contains('collapsed')) c.querySelector('.trigger-file-header').click();
});
await ev(() =>
  [...document.querySelectorAll('.config-active .config-page .config-page-tab')].find((t) =>
    t.textContent.startsWith('트리거')
  )?.click()
);
await wait(100);
await wait(200);
const os = await page.evaluateHandle(() =>
  [...document.querySelectorAll('.config-active .trigger-outputstring > input')].find((i) =>
    i.offsetParent && i.value === '' && i.placeholder !== ''
  )
);
const ph = await os.evaluate((i) => i.placeholder);
await os.focus();
const pre = await os.evaluate((i) => i.value);
await page.keyboard.type('!');
await wait(50);
await os.evaluate((i) => i.blur());
await wait(500);
const kept = await os.evaluate((i) => i.value);
await os.focus();
await os.evaluate((i) => i.blur());
await wait(50);
const os2 = await page.evaluateHandle(() =>
  [...document.querySelectorAll('.config-active .trigger-outputstring > input')].filter((i) =>
    i.offsetParent && i.value === '' && i.placeholder !== ''
  )[1]
);
await os2.focus();
await os2.evaluate((i) => i.blur());
const untouched = await os2.evaluate((i) => i.value);
check(
  'output string prefill',
  pre === ph && kept === ph + '!' && untouched === '',
  `pre=${pre === ph} kept=${kept} untouched='${untouched}'`,
);

// Reload pill hides on reload.
await ev(() => document.querySelector('.reload-button').click());
await wait(100);
check(
  'reload hides pill',
  await ev(() => document.getElementById('butter-margin').classList.contains('hidden')),
);

check('no errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(results.join('\n'));
await browser.close();
