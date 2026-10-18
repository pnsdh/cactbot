// What raidboss asks OverlayPlugin to say, end to end: the alert's kind (severity), language and
// volume (set by kind in the config) go with the text, and a TTS text set for an output string in the config replaces what the
// screen shows (with the same params).  Uses the built page (dist/) and the test triggers
// (Middle La Noscea, /echo lines in Korean, as the parser language is).
//
// node tts-e2e.mjs
import { launch, openPage, send, sendLines, startFight, wait } from './lib/overlay.mjs';

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
  ['volumes by kind', { raidboss: { ...ttsOnly, AlarmTtsVolume: 0.3, InfoTtsVolume: 0.6 } }],
];

let failed = 0;
for (const [name, data] of cases) {
  const { said, errors } = await run(data);
  console.log(`== ${name}`);
  for (const s of said)
    console.log(
      `  ${s.call} severity=${s.severity} lang=${s.lang} volume=${s.volume} source=${s.source}: ${s.text}`,
    );
  for (const e of errors)
    console.log(`  page error: ${e}`);
  const lang = said.find((s) => /언어|language/i.test(s.text));
  const expect = name === 'TTS text for Test Lang' ? '지금 언어는 ko입니다' : '언어: ko';
  const [infoVolume, alarmVolume] = name === 'volumes by kind' ? [0.6, 0.3] : [1, 1];
  const four = said.find((s) => s.text === '4');
  if (
    lang?.text !== expect || lang?.severity !== 'info' || lang?.volume !== infoVolume ||
    four?.severity !== 'alarm' || four?.volume !== alarmVolume
  ) {
    failed++;
    console.log(
      `  FAIL: expected "${expect}" (info, ${infoVolume}) and "4" (alarm, ${alarmVolume})`,
    );
  }
}
// A plugin that fetches ahead gets the zone's alerts as they will be said, once loaded.
{
  const browser = await launch();
  const { page } = await openPage(browser, 'raidboss', {
    query: 'alerts=1&timeline=0',
    data: {
      raidboss: { ...ttsOnly, triggers: { 'Test Laugh': { TtsStrings: { text: '크하하' } } } },
    },
    beforeLoad: (p) => p.evaluateOnNewDocument(() => window.__ttsCapabilities = { prepare: true }),
  });
  await startFight(page, 134, 'Middle La Noscea');
  await wait(500);
  const prepared = await page.evaluate(() =>
    window.__overlayCalls.filter((c) => c.call === 'ttsPrepare').map((c) => c.texts)
  );
  // The plugin is told how alerts are output (its TTS tab warns when none is read aloud).
  const outputs = await page.evaluate(() =>
    window.__overlayCalls.filter((c) => c.call === 'say' && c.query === 'capabilities').map((c) =>
      c.output
    )
  );
  await browser.close();
  const last = prepared.at(-1) ?? [];
  console.log(`== fetched ahead (${prepared.length} lists, last ${last.length} texts)`);
  console.log(`  ${last.slice(0, 8).join(' | ')}`);
  if (!last.includes('크하하') || last.some((t) => t.includes('${'))) {
    failed++;
    console.log('  FAIL: expected the TTS text "크하하" and no texts with params');
  }
  console.log(`  output told to the plugin: ${outputs.join(', ')}`);
  if (outputs.length === 0 || outputs.some((o) => o !== 'ttsOnly')) {
    failed++;
    console.log('  FAIL: expected the capabilities query to carry the output (ttsOnly)');
  }
}

// Players: TTS reads them as set (jobs by default) while the screen keeps its label, and with
// TtsPreparePlayers an alert naming one player is made ahead for each party member.
const party = {
  type: 'PartyChanged',
  party: [
    { id: '10000001', name: 'Tester', worldId: 0, job: 21, level: 100, inParty: true },
    { id: '10000002', name: 'Healer Friend', worldId: 0, job: 24, level: 100, inParty: true },
  ],
};
for (
  const [name, raidboss, expect] of [
    ['players read as jobs (default)', {}, 'player = 전사'],
    ['players read as on screen', { TtsPlayerLabel: 'screen' }, 'player = Tester'],
  ]
) {
  const browser = await launch();
  const { page } = await openPage(browser, 'raidboss', {
    query: 'alerts=1&timeline=0',
    data: { raidboss: { ...ttsOnly, ...raidboss } },
  });
  await startFight(page, 134, 'Middle La Noscea');
  await send(page, party);
  await page.evaluate(() => window.__overlayCalls.length = 0);
  await sendLines(page, [echo('cactbot outputStrings 테스트')]);
  await wait(500);
  const said = await page.evaluate(() =>
    window.__overlayCalls.filter((c) => c.call === 'say').map((c) => c.text)
  );
  await browser.close();
  console.log(`== ${name}`);
  console.log(`  ${said.join(' | ')}`);
  if (!said.some((t) => t.startsWith(expect))) {
    failed++;
    console.log(`  FAIL: expected "${expect}..."`);
  }
}
{
  const browser = await launch();
  const { page } = await openPage(browser, 'raidboss', {
    query: 'alerts=1&timeline=0',
    data: { raidboss: { ...ttsOnly, TtsPreparePlayers: true } },
    beforeLoad: (p) => p.evaluateOnNewDocument(() => window.__ttsCapabilities = { prepare: true }),
  });
  await startFight(page, 134, 'Middle La Noscea');
  await send(page, party);
  // Made ahead again once the party settles.
  await wait(3800);
  const prepared = await page.evaluate(() =>
    window.__overlayCalls.filter((c) => c.call === 'ttsPrepare').map((c) => c.texts)
  );
  await browser.close();
  const last = prepared.at(-1) ?? [];
  const withPlayers = last.filter((t) => /전사|백마/.test(t));
  console.log(`== players made ahead (${prepared.length} lists, last ${last.length} texts)`);
  console.log(`  ${withPlayers.join(' | ')}`);
  if (!last.includes('전사 초읽기를 취소했습니다') || !last.includes('백마 초읽기를 취소했습니다')) {
    failed++;
    console.log('  FAIL: expected "전사 초읽기를 취소했습니다" and "백마 초읽기를 취소했습니다"');
  }
}

console.log(failed === 0 ? 'ok' : `${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
