// A fight's page laid out as one: the triggers' bar (search, "changed only", open all) as the
// timeline's, what a changed text was, the TTS button and source link on one line, and the
// timeline's bar on one line with its view switch (back on a line of its own by name).
import { launch, mockOverlayPlugin, pageUrl, wait } from '../lib/overlay.mjs';

const b = await launch();
const results = [];
const check = (name, ok, info = '') =>
  results.push(`${ok ? 'OK  ' : 'FAIL'} ${name}${info ? ` (${info})` : ''}`);
const kFight = '절 또 하나의 미래';
const kChanged = 'FRU P1 Cyclonic Break Fire';
const kSaved = {
  raidboss: { triggers: { [kChanged]: { OutputStrings: { clockPairs: '바꾼 문구' } } } },
};

const open = async (storage = {}) => {
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 900 });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await mockOverlayPlugin(p, kSaved);
  await p.evaluateOnNewDocument((storage) => {
    try {
      localStorage.clear();
      for (const [k, v] of Object.entries(storage))
        localStorage.setItem(k, v);
    } catch {}
  }, storage);
  await p.goto(pageUrl('config'), { waitUntil: 'load' });
  await wait(2500);
  await p.evaluate(() => document.querySelectorAll('.config-tab')[1].click());
  await p.evaluate(() =>
    [...document.querySelectorAll('.config-active .config-view-switch button')][1].click()
  );
  await wait(800);
  await p.evaluate((name) => {
    const c = [...document.querySelectorAll('.config-active .trigger-file-container')].find((x) =>
      x.offsetParent !== null &&
      x.querySelector('.trigger-file-header-part')?.textContent.trim().startsWith(name)
    );
    c.querySelector('.trigger-file-header').click();
  }, kFight);
  await wait(600);
  return { p, errors };
};
const tab = (p, n) =>
  p.evaluate((n) => document.querySelectorAll('.config-page .config-page-tab')[n].click(), n);
const shownIds = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll('.config-page .config-compact > .trigger')]
      .filter((r) => r.offsetParent !== null)
      .map((r) => r.querySelector('.trigger-id').textContent)
  );

// 1. The triggers' bar, its count, and "changed only" (kept for the next time).
{
  const { p, errors } = await open();
  await tab(p, 1);
  await wait(300);
  const bar = await p.evaluate(() => {
    const bar = document.querySelector('.config-page .config-trigger-bar');
    return bar === null ? null : {
      search: bar.querySelector('.config-tl-search') !== null,
      toggle: bar.querySelector('.config-changed-toggle') !== null,
      all: bar.querySelector('.config-tl-all') !== null,
      count: bar.querySelector('.config-tl-count')?.textContent,
      sticky: getComputedStyle(bar).position,
      rows: Math.round(bar.getBoundingClientRect().height),
    };
  });
  check(
    'triggers bar: search, changed only (1), open all, one sticky line',
    bar?.search && bar.toggle && bar.all && bar.count === '1' && bar.sticky === 'sticky' &&
      bar.rows < 60,
    JSON.stringify(bar),
  );
  const all = (await shownIds(p)).length;
  await p.evaluate(() =>
    document.querySelector('.config-page .config-trigger-bar .config-changed-toggle').click()
  );
  await wait(200);
  let ids = await shownIds(p);
  check('changed only: only the changed one', ids.length === 1 && ids[0] === kChanged, ids.join());
  const stored = await p.evaluate(() => localStorage.getItem('cactbot-config-trigger-changed'));
  check('changed only stored', stored === '1', stored);

  // Search within it: nothing, and a message.
  await p.evaluate(() => {
    const i = document.querySelector('.config-page .config-trigger-bar .config-tl-search');
    i.value = 'Lightning';
    i.dispatchEvent(new Event('input'));
  });
  await wait(200);
  const empty = await p.evaluate(() => {
    const e = document.querySelector('.config-page .config-trigger-group .config-tl-empty');
    return e?.offsetParent !== null ? e.textContent : null;
  });
  ids = await shownIds(p);
  check('search with changed only: none, said', ids.length === 0 && empty !== null, `${empty}`);

  // Off: the search alone, by name and by a changed text.
  await p.evaluate(() =>
    document.querySelector('.config-page .config-trigger-bar .config-changed-toggle').click()
  );
  await wait(200);
  ids = await shownIds(p);
  check(
    'search by name',
    ids.length > 0 && ids.length < all && ids.every((x) => /lightning/i.test(x)),
    `${ids.length}/${all}`,
  );
  await p.evaluate(() => {
    const i = document.querySelector('.config-page .config-trigger-bar .config-tl-search');
    i.value = '바꾼 문구';
    i.dispatchEvent(new Event('input'));
  });
  await wait(200);
  ids = await shownIds(p);
  check('search by a changed text', ids.length === 1 && ids[0] === kChanged, ids.join());

  // Open all opens the ones shown only.
  await p.evaluate(() =>
    document.querySelector('.config-page .config-trigger-bar .config-tl-all').click()
  );
  await wait(200);
  const opened = await p.evaluate(() =>
    document.querySelectorAll('.config-page .config-compact > .trigger.config-trigger-open').length
  );
  check('open all: the shown ones', opened === 1, `${opened}`);

  // 2. What it was; the TTS button and the source on one line.
  const details = await p.evaluate((id) => {
    const row = [...document.querySelectorAll('.config-page .config-compact > .trigger')].find((
      r,
    ) => r.querySelector('.trigger-id').textContent === id);
    const d = row.nextElementSibling;
    const was = d.querySelector('.config-trigger-was');
    const input = d.querySelector('.trigger-outputstring:not(.trigger-ttsstring) > input');
    const foot = d.querySelector('.config-trigger-foot');
    const tts = foot?.querySelector('.trigger-tts-toggle')?.getBoundingClientRect();
    const link = foot?.querySelector('.trigger-source a');
    const box = link?.getBoundingClientRect();
    return {
      was: was?.offsetParent !== null ? was.textContent : null,
      placeholder: input.placeholder,
      wasRight: was.getBoundingClientRect().left > input.getBoundingClientRect().right,
      oneLine: tts !== undefined && box !== undefined && Math.abs(tts.top - box.top) < 8,
      help: foot?.querySelector('.config-trigger-tts .config-help') !== null,
      note: d.querySelector('.trigger-tts-toggle-note') !== null,
      link: link?.textContent,
    };
  }, kChanged);
  check(
    'was: the default text, right of its box',
    details.was === `원래: ${details.placeholder}` && details.wasRight,
    JSON.stringify(details),
  );
  check(
    'foot: TTS button with an icon, source link on its line, no note',
    details.oneLine && details.help && !details.note && !/^\(/.test(details.link ?? '('),
    JSON.stringify(details),
  );
  // Back to the default: nothing said.
  const cleared = await p.evaluate((id) => {
    const row = [...document.querySelectorAll('.config-page .config-compact > .trigger')].find((
      r,
    ) => r.querySelector('.trigger-id').textContent === id);
    const input = row.nextElementSibling.querySelector('.trigger-outputstring > input');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const was = row.nextElementSibling.querySelector('.config-trigger-was');
    return {
      was: was.offsetParent !== null,
      count:
        document.querySelector('.config-page .config-trigger-bar .config-tl-count').textContent,
    };
  }, kChanged);
  check('cleared: no was, no count', !cleared.was && cleared.count === '', JSON.stringify(cleared));
  check('no page errors (triggers)', errors.length === 0, errors.join('; '));
  await p.close();
}

// 3. Changed only, kept: on when the page comes back.
{
  const { p } = await open({ 'cactbot-config-trigger-changed': '1' });
  await tab(p, 1);
  await wait(300);
  const ids = await shownIds(p);
  check('changed only kept', ids.length === 1 && ids[0] === kChanged, ids.join());
  await p.close();
}

// 4. The timeline's bar: one line with the view switch; by name, the switch on its own.
{
  const { p, errors } = await open({ 'cactbot-config-timeline-layer': 'WAR' });
  await tab(p, 2);
  await wait(800);
  const bar = await p.evaluate(() => {
    const sticky = document.querySelector('.config-page .config-tl-sticky');
    return {
      tabs: sticky?.querySelector('.config-tl-tabs') !== null,
      head: document.querySelector('.config-page .config-tl-head') !== null,
      height: Math.round(sticky?.getBoundingClientRect().height ?? 0),
      job: sticky?.querySelector('.config-tl-layer')?.classList.contains('config-tl-layer-job'),
    };
  });
  check(
    'timeline bar: one line with the view switch, a job layer marked',
    bar.tabs && !bar.head && bar.height < 60 && bar.job === true,
    JSON.stringify(bar),
  );
  await p.evaluate(() =>
    document.querySelector('.config-page .config-tl-tabs button:nth-child(2)').click()
  );
  await wait(500);
  const byName = await p.evaluate(() => {
    const tabs = document.querySelector('.config-page .config-tl-tabs');
    return { shown: tabs.offsetParent !== null, inBar: tabs.closest('.config-tl-sticky') !== null };
  });
  check(
    'by name: the switch shown, on its own',
    byName.shown && !byName.inBar,
    JSON.stringify(byName),
  );
  await p.evaluate(() =>
    document.querySelector('.config-page .config-tl-tabs button:nth-child(1)').click()
  );
  await wait(500);
  const back = await p.evaluate(() => {
    const tabs = document.querySelectorAll('.config-page .config-tl-tabs');
    return { n: tabs.length, inBar: tabs[0]?.closest('.config-tl-sticky') !== null };
  });
  check(
    'entries again: the switch back in the bar',
    back.n === 1 && back.inBar,
    JSON.stringify(back),
  );
  check('no page errors (timeline)', errors.length === 0, errors.join('; '));
  await p.close();
}

// 5. Oopsy's triggers (only their output, nothing to open): the bar without "open all".
{
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 900 });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await mockOverlayPlugin(p, {});
  // Not raidboss's page as left above (its timeline's view switch is one more in the way).
  await p.evaluateOnNewDocument(() => {
    try {
      localStorage.clear();
    } catch {}
  });
  await p.goto(pageUrl('config'), { waitUntil: 'load' });
  await wait(2500);
  await p.evaluate(() => document.querySelectorAll('.config-tab')[4].click());
  await wait(300);
  await p.evaluate(() =>
    [...document.querySelectorAll('.config-active .config-view-switch button')][1]?.click()
  );
  await wait(800);
  const bar = await p.evaluate((name) => {
    const c = [...document.querySelectorAll('.config-active .trigger-file-container')].find((x) =>
      x.offsetParent !== null &&
      x.querySelector('.trigger-file-header-part')?.textContent.trim().startsWith(name)
    );
    c?.querySelector('.trigger-file-header').click();
    const bar = c?.querySelector('.config-trigger-bar');
    return {
      found: c !== undefined,
      bar: bar !== null && bar !== undefined,
      all: bar?.querySelector('.config-tl-all') !== null,
    };
  }, kFight);
  check('oopsy: the bar, no open all', bar.found && bar.bar && !bar.all, JSON.stringify(bar));
  check('no page errors (oopsy)', errors.length === 0, errors.join('; '));
  await p.close();
}

await b.close();
for (const r of results)
  console.log(r);
process.exitCode = results.some((r) => r.startsWith('FAIL')) ? 1 : 0;
