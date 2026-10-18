// What raidboss asks OverlayPlugin to say, end to end: the alert's kind (severity) and language
// go with the text, and a TTS text set for an output string in the config replaces what the
// screen shows (with the same params).  Uses the built page (dist/) and the test triggers
// (Middle La Noscea, /echo lines in Korean, as the parser language is).
//
// node tts-e2e.mjs
import { launch, openPage, sendLines, startFight, wait } from './lib/overlay.mjs';

const echo = (text) => `00|2026-10-18T00:00:00.0000000+09:00|0038||${text}|0000000000000000`;

const run = async (data) => {
  const browser = await launch();
  const { page, errors } = await openPage(browser, 'raidboss', {
    query: 'alerts=1&timeline=0',
    data,
  });
  await startFight(page, 134, 'Middle La Noscea');
  await page.evaluate(() => window.__overlayCalls.length = 0);
  await sendLines(page, [echo('cactbot 언어')]);
  await wait(500);
  await sendLines(page, [echo('cactbot 응답 테스트')]);
  await wait(500);
  const said = await page.evaluate(() =>
    window.__overlayCalls.filter((c) => c.call === 'say' || c.call === 'cactbotSay')
  );
  await browser.close();
  return { said, errors };
};

const ttsOnly = { DefaultAlertOutput: 'ttsOnly' };
const cases = [
  ['default text', { raidboss: { ...ttsOnly } }],
  ['TTS text for Test Lang', {
    raidboss: {
      ...ttsOnly,
      triggers: { 'Test Lang': { TtsStrings: { text: '지금 언어는 ${lang}입니다' } } },
    },
  }],
];

let failed = 0;
for (const [name, data] of cases) {
  const { said, errors } = await run(data);
  console.log(`== ${name}`);
  for (const s of said)
    console.log(`  ${s.call} severity=${s.severity} lang=${s.lang} source=${s.source}: ${s.text}`);
  for (const e of errors)
    console.log(`  page error: ${e}`);
  const lang = said.find((s) => /언어|language/i.test(s.text));
  const expect = name === 'default text' ? '언어: ko' : '지금 언어는 ko입니다';
  if (
    lang?.text !== expect || lang?.severity !== 'info' ||
    said.find((s) => s.text === '4')?.severity !== 'alarm'
  ) {
    failed++;
    console.log(`  FAIL: expected "${expect}" (info) and "4" (alarm)`);
  }
}
console.log(failed === 0 ? 'ok' : `${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
