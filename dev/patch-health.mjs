// After a game patch: whether the lines OverlayPlugin adds to the log (257-274) still come, with
// sane values, from the first play's ACT log.  A wrong opcode makes a line stop (or come from
// another packet with garbage values); a changed packet or memory layout keeps it coming with
// wrong values.  Field layouts come from resources/netlog_defs.ts, so run with ts-node:
//
// node --loader=ts-node/esm dev/patch-health.mjs <Network_*.log> [--baseline <older log>]
//   --baseline: a log from before the patch; each line type's rate (per matching game line) is
//               compared with it, which catches a line that still comes but far less often.
// Prints OK / WARN / FAIL per check (no names or other log contents); exits 1 on a FAIL.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseArgs } from './lib/log.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defs =
  (await import(pathToFileURL(path.join(repo, 'resources/netlog_defs.ts')).href)).default;
const byType = new Map(Object.values(defs).map((d) => [d.type, d]));

const { positional, named } = parseArgs();
const [logFile] = positional;
if (logFile === undefined)
  throw new Error(
    'node --loader=ts-node/esm dev/patch-health.mjs <Network_*.log> [--baseline <log>]',
  );

// OverlayPlugin's lines: whether every play should have them, or only some content.
const kAlways = ['260', '261', '263', '264', '270', '271', '272', '273'];
const kSometimes = ['257', '258', '259', '262', '265', '266', '267', '268', '269', '274'];
// Rates: each line type against the game line it accompanies.
const kRatios = [
  ['263', ['20'], 'StartsUsingExtra per StartsUsing (20)'],
  ['264', ['21', '22'], 'AbilityExtra per Ability (21/22)'],
  ['261', ['03'], 'CombatantMemory per AddCombatant (03)'],
];

const isHex = (s, len) => typeof s === 'string' && new RegExp(`^[0-9A-F]{${len}}$`, 'i').test(s);
const isNum = (s, min = -1e5, max = 1e5) => {
  const v = parseFloat(s);
  return s !== '' && Number.isFinite(v) && v >= min && v <= max;
};
const isActor = (s) => isHex(s, 8);
const isHeading = (s) => isNum(s, -3.2, 3.2);
const isPos = (s) => isNum(s, -5000, 5000);
// Per line type: checks of a line's fields (by name, from netlog_defs), each true when sane.
const kChecks = {
  '257': { instance: isActor, flags: (s) => isHex(s, 8), location: (s) => isHex(s, 2) },
  '260': {
    inACTCombat: (s) => s === '0' || s === '1',
    inGameCombat: (s) => s === '0' || s === '1',
  },
  '261': { change: (s) => ['Add', 'Remove', 'Change'].includes(s), id: isActor },
  '263': {
    sourceId: isActor,
    id: (s) => isHex(s, 4),
    x: isPos,
    y: isPos,
    z: isPos,
    heading: isHeading,
  },
  // Positions only when dataFlag is 1 (empty otherwise).
  '264': { sourceId: isActor, id: (s) => isHex(s, 4), dataFlag: (s) => s === '0' || s === '1' },
  // The zone id comes with or without leading zeros.
  '265': { zoneId: (s) => /^[0-9A-F]{1,4}$/i.test(s), zoneName: (s) => s !== '' },
  '266': {
    npcId: isActor,
    npcNameId: (s) => isHex(s, 4) && s !== '0000',
    npcYellId: (s) => isHex(s, 4),
  },
  '268': {
    id: isActor,
    countdownTime: (s) => isNum(s, 1, 30),
    // Anything else here (seen: 95, 97) means the packet is read with a wrong layout.
    result: (s) => s === '00',
    name: (s) => s !== '' && !s.includes(';'),
  },
  '269': { id: isActor, name: (s) => s !== '' && !s.includes(';') },
  '270': { id: isActor, heading: isHeading, x: isPos, y: isPos, z: isPos },
  '271': { id: isActor, heading: isHeading, x: isPos, y: isPos, z: isPos },
  '272': { id: isActor, parentId: isActor },
  '273': { id: isActor, category: (s) => isHex(s, 4) },
  '274': { id: isActor, category: (s) => isHex(s, 4) },
};

const scan = async (file) => {
  const info = {
    count: new Map(),
    badFields: new Map(),
    badChecks: new Map(),
    registered: new Map(),
  };
  const bump = (map, key, n = 1) => map.set(key, (map.get(key) ?? 0) + n);
  for await (const line of readline.createInterface({ input: fs.createReadStream(file) })) {
    if (line === '')
      continue;
    const f = line.split('|');
    const type = f[0] ?? '';
    bump(info.count, type);
    if (type === '250')
      info.gameVersion = /Game Version: ([\d.]+)/.exec(line)?.[1] ?? info.gameVersion;
    else if (type === '253')
      info.pluginVersion = /Version: ([\d.]+)/.exec(line)?.[1] ?? info.pluginVersion;
    else if (type === '251' && info.region === undefined && line.includes('ffxivgame.ver'))
      info.region = line.includes('KOREA') ? 'Korean' : line.includes('上海') ? 'Chinese' : 'Global?';
    else if (type === '256' && f[3] === 'OverlayPlugin')
      info.registered.set(f[2], f[5]);
    const def = byType.get(type);
    if (def === undefined || def.source !== 'OverlayPlugin' || type === '256')
      continue;
    // Field count: the last named field (or the first optional one) must exist; the last
    // field is the line's hash.
    const idx = Object.values(def.fields);
    // CombatantMemory's Remove lines end after the id.
    const need = type === '261' ? 4 : def.firstOptionalField ?? Math.max(...idx) + 1;
    if (f.length - 1 < need)
      bump(info.badFields, type);
    if (type === '264' && f[5] === '1') {
      for (const i of [6, 7, 8]) {
        if (!isPos(f[i] ?? ''))
          bump(info.badChecks, `264 ${['x', 'y', 'z'][i - 6]}`);
      }
    }
    for (const [field, ok] of Object.entries(kChecks[type] ?? {})) {
      const i = def.fields[field];
      if (i !== undefined && !ok(f[i] ?? ''))
        bump(info.badChecks, `${type} ${field}`);
    }
  }
  return info;
};

const results = [];
const report = (level, text) => results.push([level, text]);
const now = await scan(logFile);
const base = named.baseline !== undefined ? await scan(named.baseline) : undefined;
const name = (type) => byType.get(type)?.name ?? type;
const pct = (n, d) => (d === 0 ? 0 : (100 * n) / d);

console.log(
  `game ${now.gameVersion ?? '?'} (${now.region ?? '?'}), FFXIV_ACT_Plugin ${
    now.pluginVersion ?? '?'
  }`,
);
if (base !== undefined)
  console.log(
    `baseline: game ${base.gameVersion ?? '?'}, FFXIV_ACT_Plugin ${base.pluginVersion ?? '?'}`,
  );

// Registration: OverlayPlugin announces each line it can write.
for (const type of [...kAlways, ...kSometimes]) {
  if (!now.registered.has(type))
    report('WARN', `${type} ${name(type)}: not registered by OverlayPlugin (feature not loaded?)`);
}

// Presence.
for (const type of kAlways) {
  const n = now.count.get(type) ?? 0;
  report(n > 0 ? 'OK  ' : 'FAIL', `${type} ${name(type)}: ${n} lines`);
}
for (const type of kSometimes) {
  const n = now.count.get(type) ?? 0;
  const before = base?.count.get(type) ?? 0;
  // Zero is normal for these when the play had no such content, whatever the baseline had.
  report(
    n > 0 ? 'OK  ' : 'info',
    `${type} ${name(type)}: ${n} lines${base ? ` (baseline ${before})` : ''}${
      n === 0 ? ' (only in some content)' : ''
    }`,
  );
}

// Layout: missing fields and insane values.
for (const [type, n] of now.badFields)
  report(
    pct(n, now.count.get(type) ?? 0) > 1 ? 'FAIL' : 'WARN',
    `${type} ${name(type)}: ${n} lines with too few fields`,
  );
for (const [key, n] of [...now.badChecks].sort()) {
  const type = key.split(' ')[0] ?? '';
  const share = pct(n, now.count.get(type) ?? 0);
  report(
    share > 5 ? 'FAIL' : share > 0.5 ? 'WARN' : 'info',
    `${name(type)} ${key.split(' ')[1]}: ${n} odd values (${share.toFixed(1)}%)`,
  );
}

// Rates against the game lines they come with.
for (const [type, anchors, label] of kRatios) {
  const ratio = (info) => {
    const d = anchors.reduce((s, a) => s + (info.count.get(a) ?? 0), 0);
    return d === 0 ? undefined : (info.count.get(type) ?? 0) / d;
  };
  const r = ratio(now);
  if (r === undefined)
    continue;
  const b = base !== undefined ? ratio(base) : undefined;
  let level = r > 0 ? 'OK  ' : 'FAIL';
  if (b !== undefined && b > 0 && r < b * 0.5)
    level = 'FAIL';
  report(level, `${label}: ${r.toFixed(3)}${b !== undefined ? ` (baseline ${b.toFixed(3)})` : ''}`);
}

for (const [level, text] of results)
  console.log(`${level} ${text}`);
process.exitCode = results.some(([level]) => level === 'FAIL') ? 1 : 0;
