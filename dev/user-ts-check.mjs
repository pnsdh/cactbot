// TypeScript user files (resources/user_ts.ts) in the built raidboss overlay: a cactbot trigger
// file copied as it is (and edited), a .js-style file with types, and files that must fail
// alone (bad syntax, an import user files cannot have) or be skipped (.d.ts).  Then a second
// page, which must use the cached output instead of loading the transpiler again.
//
// node user-ts-check.mjs [--chrome95]   (after `npm run build`; --chrome95 needs CHROME95)
import fs from 'node:fs';
import path from 'node:path';

import {
  chrome95Path,
  launch,
  openPage,
  repoRoot,
  send,
  sendLines,
  startFight,
  wait,
} from './lib/overlay.mjs';

const copied = fs.readFileSync(
  path.join(repoRoot, 'ui/raidboss/data/07-dt/dungeon/the_underkeep.ts'),
  'utf8',
).replace('response: Responses.aoe(),', 'infoText: \'copied ts ok\',');

const userFiles = {
  'raidboss/a-underkeep.ts': copied,
  'raidboss/b-plain.ts': `
const text: string = 'plain ts ok';
Options.Triggers.push({
  zoneId: ZoneId.MatchAll,
  triggers: [{ id: 'User TS Plain', type: 'GameLog', netRegex: { line: 'usertstest.*?' }, infoText: text }],
});`,
  'raidboss/c-bad.ts': 'const x: = ;',
  'raidboss/d-import.ts': `import helper from './helper';
export default { zoneId: 0, triggers: [{ id: helper }] };`,
  'raidboss/e-types.d.ts': 'this is not read',
  // Throws on line 6 of the .ts (type-only lines and imports move lines in the JavaScript).
  'raidboss/f-throw.ts': [
    'interface A { x: number }',
    'type B = string;',
    'import ZoneId from \'../resources/zone_id\';',
    'const a: A = { x: ZoneId.MatchAll as number };',
    'const b: B = String(a.x);',
    'null!.boom(b);',
  ].join('\n'),
  // The same with the sourceURL the plugin adds.
  'raidboss/g-throw.ts': [
    'interface A { x: number }',
    'type B = string;',
    'import ZoneId from \'../resources/zone_id\';',
    'const a: A = { x: ZoneId.MatchAll as number };',
    'const b: B = String(a.x);',
    'null!.boom(b);',
    '//# sourceURL=C:/dev/raidboss/g-throw.ts',
  ].join('\n'),
  'raidboss/zz-check.js':
    `window.__userSets = Options.Triggers.map((s) => s.id ?? s.triggers?.[0]?.id);
window.__userFilesAt = performance.now();`,
};

const chrome95 = process.argv.includes('--chrome95');
const browser = await launch(chrome95 ? { chrome: chrome95Path() } : {});
let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok)
    failed++;
};

const open = async () => {
  const logs = [];
  const transpilerLoads = [];
  const { page, errors } = await openPage(browser, 'raidboss', {
    query: 'timeline=0&alerts=1',
    userFiles: userFiles,
    beforeLoad: (p) => {
      // Errors as their messages (text() of an Error is only 'JSHandle@error').
      p.on('console', (m) => {
        logs.push(
          Promise.all(
            m.args().map((a) => a.evaluate((v) => v instanceof Error ? v.message : String(v))),
          ).then((parts) => parts.join(' ')).catch(() => m.text()),
        );
      });
      p.on('request', (r) => {
        if (r.url().includes('typescript_lib'))
          transpilerLoads.push(r.url());
      });
    },
  });
  return { page, errors, logs: await Promise.all(logs), transpilerLoads };
};

const first = await open();
const sets = await first.page.evaluate(() => window.__userSets);
check(
  'copied file adds its trigger set (export default)',
  sets?.includes('TheUnderkeep'),
  `${sets}`,
);
check('.js-style file with types runs', sets?.includes('User TS Plain'));
check(
  'transpiler loaded once',
  first.transpilerLoads.length === 1,
  `${first.transpilerLoads.length}`,
);
const logText = first.logs.join('\n');
check('bad syntax reported', /c-bad\.ts:1:\d+/.test(logText));
check('unavailable import reported', logText.includes('\'./helper\' is not available'));
check(
  'copied file without its timeline file gets the built-in one',
  logText.includes(
    'no \'the_underkeep.txt\' in the user folder, using 07-dt/dungeon/the_underkeep.txt',
  ),
);
check('load error at the .ts line', logText.includes('(raidboss/f-throw.ts:6)'));
check('load error at the .ts line (sourceURL)', logText.includes('(raidboss/g-throw.ts:6)'));
check('.d.ts skipped', !logText.includes('e-types'));
check('no page errors', first.errors.length === 0, first.errors.join('; '));

await startFight(first.page, 1266, 'The Underkeep');
await sendLines(first.page, [
  '20|2026-10-21T00:00:00.0000000+09:00|40001234|가르간트|A633|Chilling Chirp|40001234|가르간트|4.700|0|0|0|0|hash',
  '00|2026-10-21T00:00:01.0000000+09:00|0038||usertstest|hash',
]);
await wait(800);
const shown = await first.page.evaluate(() => document.body.innerText);
check('copied (edited) trigger fires', shown.includes('copied ts ok'));
check('.js-style trigger fires', shown.includes('plain ts ok'));

const second = await open();
const sets2 = await second.page.evaluate(() => window.__userSets);
const at = (p) => p.evaluate(() => Math.round(window.__userFilesAt));
console.log(
  `user files done at ${await at(first.page)} ms (transpiled), ${await at(
    second.page,
  )} ms (cached)`,
);
check('second page: same sets', JSON.stringify(sets2) === JSON.stringify(sets));
check('second page: bad syntax still reported', /c-bad\.ts:1:\d+/.test(second.logs.join('\n')));
check(
  'second page: cached, no transpiler',
  second.transpilerLoads.length === 0,
  `${second.transpilerLoads.length}`,
);

// Oopsy files import ../../../oopsy_common as well.
const oopsy = await openPage(browser, 'oopsy', {
  userFiles: {
    'oopsyraidsy/a-byakko.ts': fs.readFileSync(
      path.join(repoRoot, 'ui/oopsyraidsy/data/07-dt/trial/byakko-un.ts'),
      'utf8',
    ),
    'oopsyraidsy/zz-check.js':
      `window.__byakko = Options.Triggers.some((s) => s.damageWarn?.['ByakkoUn Aratama'] === '9C16');`,
  },
});
check(
  'oopsy file (oopsy_common import) adds its set',
  await oopsy.page.evaluate(() => window.__byakko),
);
check('oopsy: no page errors', oopsy.errors.length === 0, oopsy.errors.join('; '));

// The examples shipped in user/, copied as their header says.
const example = (name) => fs.readFileSync(path.join(repoRoot, 'user', name), 'utf8');
const examples = await openPage(browser, 'raidboss', {
  query: 'timeline=0&alerts=1',
  userFiles: {
    'raidboss.ts': example('raidboss-typescript-example.ts'),
    'raidboss.js': example('raidboss-example.js'),
    'test-override.txt': example('test-override.txt'),
  },
});
check('examples: no page errors', examples.errors.length === 0, examples.errors.join('; '));
await startFight(examples.page, 134, 'Middle La Noscea');
await sendLines(examples.page, [
  '00|2026-10-21T00:00:01.0000000+09:00|001D|Tester|Tester은 나무인형을 쿡쿡 찌릅니다.|hash',
]);
await wait(800);
const exampleText = await examples.page.evaluate(() => document.body.innerText);
check(
  'examples: .js poke override fires',
  exampleText.toUpperCase().includes('POKE (USER FILE OVERRIDE)'),
);
check('examples: .ts poke count fires', exampleText.includes('1번째 찌르기'));
const oopsyExample = await openPage(browser, 'oopsy', {
  userFiles: {
    // Files in the folder run before the top one, in name order.
    'oopsyraidsy/a-example.js': example('oopsyraidsy-example.js'),
    'oopsyraidsy/zz-check.js':
      `window.__adlo = Options.Triggers.some((s) => s.triggers?.some((t) => t.id === 'Test Self Crit Adlo'));`,
  },
});
check('examples: oopsy example runs', await oopsyExample.page.evaluate(() => window.__adlo));

// A changed user file reloads the overlay, after the fight if it is in one.
const reload = await openPage(browser, 'raidboss', { query: 'timeline=0&alerts=1' });
const mark = () => reload.page.evaluate(() => window.__mark = true);
const marked = () => reload.page.evaluate(() => window.__mark === true);
await mark();
await send(reload.page, { type: 'onUserFileChanged', file: 'C:/dev/raidboss.js' });
await wait(1500);
check('file change out of combat reloads', !(await marked()));
await mark();
await send(reload.page, {
  type: 'onInCombatChangedEvent',
  detail: { inACTCombat: true, inGameCombat: true },
});
await send(reload.page, { type: 'onUserFileChanged', file: 'C:/dev/raidboss.js' });
await wait(1500);
check('file change in combat waits', await marked());
await send(reload.page, {
  type: 'onInCombatChangedEvent',
  detail: { inACTCombat: true, inGameCombat: false },
});
await wait(1500);
check('reloads once the fight ends', !(await marked()));

// The config page lists what went wrong, for raidboss (which it loads for its trigger list) and
// oopsy (loaded for this).
const configPage = await openPage(browser, 'config', {
  viewport: { width: 1000, height: 700 },
  userDetail: { missingUserLocation: 'C:/gone' },
  userFiles: {
    'raidboss/a-syntax.js':
      'Options.Triggers.push({\n  zoneId: 1,\n  triggers: [ { id: x y } ],\n});',
    'raidboss/b-throw.js': 'const a = 1;\n\nnull.boom(a);',
    'raidboss/c-bad.ts': 'const x: = ;',
    'raidboss/d-timeline.js':
      'Options.Triggers.push({ zoneId: ZoneId.MiddleLaNoscea, timelineFile: \'nope.txt\' });',
    'raidboss/e-reset.js': 'Options.Triggers = [];',
    'oopsyraidsy/a-throw.js': '\nnull.oops();',
  },
  settleMs: 4000,
});
const noticeText = await configPage.page.evaluate(() =>
  document.querySelector('.config-user-file-notice:not([hidden])')?.textContent ?? ''
);
check('config: notice shown', noticeText !== '', noticeText);
check('config: js syntax error with its line', noticeText.includes('raidboss/a-syntax.js:3:'));
check('config: js runtime error with its line', noticeText.includes('raidboss/b-throw.js:3'));
check('config: ts syntax error', noticeText.includes('raidboss/c-bad.ts:1:'));
check('config: missing timeline', noticeText.includes('raidboss/nope.txt'));
check('config: Options.Triggers replaced', noticeText.includes('Options.Triggers'));
check('config: oopsy file error', noticeText.includes('oopsyraidsy/a-throw.js:2'));
check('config: missing user directory', noticeText.includes('C:/gone'));
check('config: no page errors', configPage.errors.length === 0, configPage.errors.join('; '));
// A changed user file: the config page stays (no reload) and checks the files again.
await configPage.page.evaluate(() => window.__mark = true);
await send(configPage.page, { type: 'onUserFileChanged', file: 'C:/dev/raidboss/b-throw.js' });
await wait(3000);
const refreshed = await configPage.page.evaluate(() => ({
  mark: window.__mark === true,
  text: document.querySelector('.config-user-file-notice:not([hidden])')?.textContent ?? '',
}));
check('config: file change does not reload the page', refreshed.mark);
check(
  'config: file change checks again',
  refreshed.text.includes('raidboss/b-throw.js:3') &&
    refreshed.text.includes('oopsyraidsy/a-throw.js:2') &&
    refreshed.text.includes('raidboss/a-syntax.js:3:'),
  refreshed.text,
);

await browser.close();
console.log(failed === 0 ? 'all ok' : `${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
