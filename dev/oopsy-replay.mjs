// An ACT network log through oopsy's real DamageTracker (with PlayerStateTracker), as the live
// overlay would see it: the mistakes it reports, counted by type (and listed with --print).
// Runs the TypeScript sources directly, so no build is needed:
//
// node --loader=ts-node/esm dev/oopsy-replay.mjs <Network_*.log> [options]   (from the repo root)
//   --sets <files>   trigger files under ui/oopsyraidsy/data, comma separated
//                    (e.g. 07-dt/raid/r12s.ts); none: only the general mistakes
//   --grep <regex>   only mistakes whose "type name: text" matches
//   --print          list each mistake with its time
//   --encounters     print encounter starts
//   --me <name>      the player (CACTBOT_PLAYER)
//   --no-dd          without the "damage down" mistakes; --dd-max <n> their player limit
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseArgs } from './lib/log.mjs';

globalThis.window = globalThis;
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = async (file) => (await import(pathToFileURL(path.join(repo, file)).href)).default;
const { DamageTracker } = await import(
  pathToFileURL(path.join(repo, 'ui/oopsyraidsy/damage_tracker.ts')).href
);
const Options = await load('ui/oopsyraidsy/oopsy_options.ts');
const PartyTracker = await load('resources/party.ts');

const { positional, named } = parseArgs();
const [logFile] = positional;
if (logFile === undefined)
  throw new Error('node --loader=ts-node/esm dev/oopsy-replay.mjs <Network_*.log> [options]');

const files = {};
for (const set of String(named.sets ?? '').split(',').filter((x) => x !== '' && x !== 'true'))
  files[set] = await load(`ui/oopsyraidsy/data/${set}`);

const options = {
  ...Options,
  ParserLanguage: 'ko',
  DisplayLanguage: 'ko',
  DamageDownMistakes: named['no-dd'] === undefined,
  DamageDownMaxPlayers: parseInt(named['dd-max'] ?? '0'),
};
const grep = new RegExp(named.grep ?? '.');
const stamp = (ms) =>
  new Date(ms - new Date().getTimezoneOffset() * 60000).toISOString().slice(11, 23);
const counts = {};
const collector = new Proxy({}, {
  get: (_target, prop) => {
    if (prop === 'StartEncounter') {
      return (ts) => {
        if (named.encounters !== undefined)
          console.log(`ENCOUNTER ${stamp(ts)}`);
      };
    }
    if (prop !== 'OnMistakeObj')
      return () => undefined;
    return (ts, m) => {
      const text = typeof m.text === 'object' ? m.text.ko ?? m.text.en : m.text;
      const line = `${m.type} ${m.name ?? m.blame ?? '-'}: ${String(text)}`;
      if (!grep.test(line))
        return;
      counts[m.type] = (counts[m.type] ?? 0) + 1;
      if (named.print !== undefined)
        console.log(`  ${stamp(ts)} ${line}`);
    };
  },
});

const tracker = new DamageTracker(options, collector, new PartyTracker(options), files);
const me = named.me ?? process.env.CACTBOT_PLAYER;
if (me !== undefined) {
  tracker.OnPlayerChange({
    type: 'onPlayerChangedEvent',
    detail: { name: me, job: process.env.CACTBOT_JOB ?? 'WAR', level: 100 },
  });
}
// Streamed: some logs are too big for one string.
for await (const line of readline.createInterface({ input: fs.createReadStream(logFile) })) {
  if (line !== '')
    tracker.OnNetLog({ type: 'LogLine', line: line.split('|'), rawLine: line });
}
console.log('counts', JSON.stringify(counts));
