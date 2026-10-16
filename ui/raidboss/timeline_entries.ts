import { SavedConfigEntry } from '../../types/event';
import { Job } from '../../types/job';

// Fork: edits of single timeline entries, made in the config page: another text, hidden, or
// highlighted.  An edit names its entry by its time and original name in the timeline file, so
// it stays on top of the file as the file is updated: an entry that moved a little is followed,
// and one that is gone is left alone (and listed in the config page) rather than guessed.
//
// Edits are for everyone (common) or for one job, which goes over the common ones field by
// field and is picked by the player's job when timelines load.

export type TimelineEntryEdit = {
  time: number;
  name: string;
  // An entry added in the config page rather than one in the timeline file.
  added?: boolean;
  text?: string;
  // In a job's edits, false shows an entry the common edits hide.
  hide?: boolean;
  // In a job's edits, kNoHighlight takes away the common edits' highlight.
  highlight?: string;
  // For the 'custom' highlight, as #rrggbb.
  color?: string;
};

export const kNoHighlight = 'none';

// How far an entry may have moved (in seconds) and still be found by its name.
export const kEntryMoveSeconds = 5;
// How much nearer the entry an edit follows must be than any other with its name in its place.
const kEntryAmbiguousSeconds = 1;

// The saved config key of an entry: "time|name", or "+time|text" for an added entry.
export const entryKey = (time: number, name: string, added?: boolean): string =>
  `${added === true ? '+' : ''}${time}|${name}`;

export const parseEntryKey = (
  key: string,
): { time: number; name: string; added: boolean } | undefined => {
  const added = key.startsWith('+');
  const rest = added ? key.slice(1) : key;
  const bar = rest.indexOf('|');
  const time = parseFloat(rest.slice(0, bar));
  if (bar < 0 || isNaN(time))
    return undefined;
  return { time: time, name: rest.slice(bar + 1), added: added };
};

// Saved edits ({ 'time|name': { text, hide, highlight, color } }) as TimelineEntryEdits.
// A config edited by hand could have null anywhere.
const isObject = (
  value: SavedConfigEntry | null | undefined,
): value is { [key: string]: SavedConfigEntry } =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseEntryEdits = (saved: SavedConfigEntry | undefined): TimelineEntryEdit[] => {
  if (!isObject(saved))
    return [];
  const edits: TimelineEntryEdit[] = [];
  for (const [key, value] of Object.entries(saved)) {
    const at = parseEntryKey(key);
    if (at === undefined || !isObject(value))
      continue;
    const edit: TimelineEntryEdit = { time: at.time, name: at.name };
    if (at.added)
      edit.added = true;
    if (typeof value.text === 'string' && value.text !== '')
      edit.text = value.text;
    if (typeof value.hide === 'boolean')
      edit.hide = value.hide;
    if (typeof value.highlight === 'string' && value.highlight !== '') {
      edit.highlight = value.highlight;
      if (typeof value.color === 'string')
        edit.color = value.color;
    }
    edits.push(edit);
  }
  return edits;
};

// How many edits of single entries (and entries added for one job) a fight's saved timeline
// config has, for the original config page, which doesn't show them.
export const countEntryEdits = (zone: SavedConfigEntry | undefined): number => {
  if (!isObject(zone))
    return 0;
  const count = (saved: SavedConfigEntry | undefined) => parseEntryEdits(saved).length;
  const jobs = isObject(zone.jobEntries) ? Object.values(zone.jobEntries) : [];
  const add = Array.isArray(zone.add) ? zone.add : [];
  const jobAdded = add.filter((row) =>
    isObject(row) && typeof row.job === 'string' && row.job !== ''
  );
  return count(zone.entries) + jobs.reduce((n: number, j) => n + count(j), 0) + jobAdded.length;
};

// Every edit of a zone's timeline, for the config page: single entries (common and per job),
// added entries, and by name hidden or renamed ones.
export const countTimelineEdits = (zone: SavedConfigEntry | undefined): number => {
  if (!isObject(zone))
    return 0;
  // Added entries (each of the common ones or a job's own) as "time|text", by layer.
  const added: { key: string; job: string }[] = [];
  for (const row of Array.isArray(zone.add) ? zone.add : []) {
    if (!isObject(row) || typeof row.text !== 'string' || row.text.trim() === '')
      continue;
    const time = typeof row.time === 'string' ? parseFloat(row.time) : NaN;
    if (isNaN(time))
      continue;
    added.push({ key: `${time}|${row.text}`, job: typeof row.job === 'string' ? row.job : '' });
  }
  // An added entry is one edit with its own edits; a job's edits of a common added entry count
  // as that job's.
  const addedIn = (job: string) =>
    new Set(added.filter((row) => row.job === job).map((row) => row.key));
  const count = (saved: SavedConfigEntry | undefined, job: string) => {
    const own = addedIn(job);
    return parseEntryEdits(saved).filter((e) => e.added !== true || !own.has(`${e.time}|${e.name}`))
      .length;
  };
  const jobs = isObject(zone.jobEntries) ? Object.entries(zone.jobEntries) : [];
  const hidden = isObject(zone.enable)
    ? Object.values(zone.enable).filter((v) => v === false).length
    : 0;
  const renamed = isObject(zone.globalReplace)
    ? Object.values(zone.globalReplace).filter((v) => typeof v === 'string' && v !== '').length
    : 0;
  return count(zone.entries, '') + jobs.reduce((n: number, [job, j]) => n + count(j, job), 0) +
    added.length + hidden + renamed;
};

// The entry each edit is for: the one with its name at its time, or else one with its name moved
// within kEntryMoveSeconds (see below).  Undefined when there is none.
export const matchEntries = <E extends { time: number; name: string }>(
  entries: E[],
  edits: { time: number; name: string }[],
): (E | undefined)[] => {
  const taken = new Set<E>();
  const result: (E | undefined)[] = edits.map(() => undefined);
  edits.forEach((edit, i) => {
    const entry = entries.find((e) =>
      e.name === edit.name && Math.abs(e.time - edit.time) < 0.001 && !taken.has(e)
    );
    if (entry !== undefined) {
      taken.add(entry);
      result[i] = entry;
    }
  });
  // Then, name by name, the others: in the order of their times (a part of the timeline moved,
  // its entries in the same order), each within kEntryMoveSeconds, the least moving in all.
  // Times in milliseconds keep the sums exact.
  const ms = (seconds: number) => Math.round(seconds * 1000);
  const limit = ms(kEntryMoveSeconds);
  const names = new Set(edits.filter((_, i) => result[i] === undefined).map((e) => e.name));
  for (const name of names) {
    const ed = edits.map((edit, i) => ({ time: ms(edit.time), i: i }))
      .filter(({ i }) => result[i] === undefined && edits[i]?.name === name)
      .sort((x, y) => x.time - y.time);
    const en = entries.filter((e) => e.name === name && !taken.has(e))
      .map((e) => ({ time: ms(e.time), e: e }))
      .sort((x, y) => x.time - y.time);
    const w = en.length + 1;
    const distance = (i: number, j: number) => Math.abs((ed[i]?.time ?? 0) - (en[j]?.time ?? 0));
    // cost[i * w + j]: the least for the first i edits and the first j entries; an edit left
    // without an entry costs more than any move.
    const skip = limit + 1;
    const cost: number[] = new Array<number>((ed.length + 1) * w).fill(0);
    const at = (i: number, j: number) => cost[i * w + j] ?? Infinity;
    for (let i = 1; i <= ed.length; ++i) {
      cost[i * w] = i * skip;
      for (let j = 1; j <= en.length; ++j) {
        const d = distance(i - 1, j - 1);
        cost[i * w + j] = Math.min(
          at(i, j - 1),
          at(i - 1, j) + skip,
          d <= limit ? at(i - 1, j - 1) + d : Infinity,
        );
      }
    }
    const pairs: [number, number][] = [];
    for (let i = ed.length, j = en.length; i > 0;) {
      const d = j > 0 ? distance(i - 1, j - 1) : Infinity;
      if (j > 0 && at(i, j) === at(i, j - 1)) {
        j--;
      } else if (d <= limit && at(i, j) === at(i - 1, j - 1) + d) {
        pairs.unshift([i - 1, j - 1]);
        i--;
        j--;
      } else {
        i--;
      }
    }
    // Not when another entry in its place is about as near (e.g. the edited one of a repeated
    // cast was removed and those around it are left): which one it was for can't be told.
    const used = new Set(pairs.map(([, j]) => j));
    pairs.forEach(([i, j], k) => {
      const lo = pairs[k - 1]?.[1] ?? -1;
      const hi = pairs[k + 1]?.[1] ?? en.length;
      const d = distance(i, j);
      for (let other = lo + 1; other < hi; ++other) {
        if (other === j || used.has(other))
          continue;
        const od = distance(i, other);
        if (od <= limit && od - d < ms(kEntryAmbiguousSeconds))
          return;
      }
      const edit = ed[i];
      const entry = en[j];
      if (edit === undefined || entry === undefined)
        return;
      taken.add(entry.e);
      result[edit.i] = entry.e;
    });
  }
  return result;
};

// As matchEntries, with the entries of the timeline file (those with a line number) and the added
// ones apart: an added entry is the user's own, so its edits are only for it, at its time.
export const matchEdits = <E extends { time: number; name: string; lineNumber?: number }>(
  entries: E[],
  edits: { time: number; name: string; added?: boolean }[],
): (E | undefined)[] => {
  const fileEntries = entries.filter((e) => e.lineNumber !== undefined);
  const addedEntries = entries.filter((e) => e.lineNumber === undefined);
  const fileIndexes: number[] = [];
  const fileEdits: { time: number; name: string }[] = [];
  edits.forEach((edit, i) => {
    if (edit.added !== true) {
      fileIndexes.push(i);
      fileEdits.push(edit);
    }
  });
  const fileMatches = matchEntries(fileEntries, fileEdits);
  const result: (E | undefined)[] = edits.map((edit) =>
    edit.added === true
      ? addedEntries.find((e) => e.name === edit.name && Math.abs(e.time - edit.time) < 0.001)
      : undefined
  );
  fileIndexes.forEach((editIndex, i) => result[editIndex] = fileMatches[i]);
  return result;
};

// The events a timeline's edits are applied to (timeline_parser.ts's).
type EditedEvent = {
  time: number;
  name: string;
  text: string;
  lineNumber?: number;
  hidden?: boolean;
  highlight?: string;
  highlightColor?: string;
};

// Edits of a fight's timeline on its events: the common ones, then those for the player's job
// over them, field by field.  Entries at the same time with the same name can't be told apart:
// all of them.
export const applyEntryEdits = (
  events: EditedEvent[],
  config: { Entries?: TimelineEntryEdit[]; JobEntries?: { [job: string]: TimelineEntryEdit[] } },
  playerJob: string,
): void => {
  const job = editJob(playerJob);
  // Job keys from user files might be base classes too.
  const jobEdits = Object.entries(config.JobEntries ?? {})
    .filter(([key]) => editJob(key) === job)
    .flatMap(([, edits]) => edits);
  for (const edits of [config.Entries ?? [], jobEdits]) {
    matchEdits(events, edits).forEach((matched, i) => {
      const edit = edits[i];
      if (matched === undefined || edit === undefined)
        return;
      const twins = events.filter((e) =>
        e.name === matched.name && Math.abs(e.time - matched.time) < 0.001 &&
        (e.lineNumber === undefined) === (matched.lineNumber === undefined)
      );
      for (const e of twins) {
        if (edit.text !== undefined)
          e.text = edit.text;
        if (edit.hide !== undefined)
          e.hidden = edit.hide;
        if (edit.highlight === kNoHighlight) {
          delete e.highlight;
          delete e.highlightColor;
        } else if (edit.highlight !== undefined) {
          e.highlight = edit.highlight;
          e.highlightColor = edit.color;
        }
      }
    });
  }
};

// Jobs that can have their own edits, by role.  Base classes use their job's.
export const kEditJobs: { role: 'tank' | 'healer' | 'melee' | 'ranged' | 'caster'; jobs: Job[] }[] =
  [
    { role: 'tank', jobs: ['PLD', 'WAR', 'DRK', 'GNB'] },
    { role: 'healer', jobs: ['WHM', 'SCH', 'AST', 'SGE'] },
    { role: 'melee', jobs: ['MNK', 'DRG', 'NIN', 'SAM', 'RPR', 'VPR'] },
    { role: 'ranged', jobs: ['BRD', 'MCH', 'DNC'] },
    { role: 'caster', jobs: ['BLM', 'SMN', 'RDM', 'PCT', 'BLU'] },
  ];

const kClassJobs: { [job: string]: Job } = {
  GLA: 'PLD',
  PGL: 'MNK',
  MRD: 'WAR',
  LNC: 'DRG',
  ARC: 'BRD',
  CNJ: 'WHM',
  THM: 'BLM',
  ACN: 'SMN',
  ROG: 'NIN',
};

// The job whose edits are for a player of this job.
export const editJob = (job: string): string => kClassJobs[job] ?? job;

// Highlights are colors from a list the user can change and name (e.g. "blue = spread"), saved
// as raidboss 'timelineColors': { id: { color, name } }; entries keep the color's id, so changing
// a color changes every entry with it.  Skins draw them their own way (raidboss.css and skins
// look at .timer-bar[data-highlight] and --timeline-highlight-rgb).
export const kPalette: { id: string; color: string }[] = [
  { id: 'red', color: '#ff5c5c' },
  { id: 'orange', color: '#ff9f43' },
  { id: 'yellow', color: '#ffc24a' },
  { id: 'green', color: '#7bed9f' },
  { id: 'blue', color: '#4fc3ff' },
  { id: 'purple', color: '#b79bff' },
];

// The first highlights had meanings rather than colors.
const kOldHighlights: { [highlight: string]: string } = {
  danger: 'red',
  caution: 'yellow',
  mitigation: 'blue',
  note: 'purple',
};

export const highlightId = (highlight: string): string => kOldHighlights[highlight] ?? highlight;

export type PaletteColor = { id: string; color: string; name?: string; custom: boolean };

export const isHexColor = (color: string): boolean => /^#[0-9a-f]{6}$/i.test(color);

const asObject = (value: SavedConfigEntry | undefined): { [key: string]: SavedConfigEntry } =>
  isObject(value) ? value : {};

// The list of colors: the built in ones (as the user changed them), then the user's own.
export const readPalette = (saved: SavedConfigEntry | undefined): PaletteColor[] => {
  const colors = asObject(saved);
  const read = (id: string, fallback?: string): PaletteColor | undefined => {
    const value = asObject(colors[id]);
    const color = typeof value.color === 'string' && isHexColor(value.color)
      ? value.color
      : fallback;
    if (color === undefined)
      return undefined;
    const name = typeof value.name === 'string' && value.name.trim() !== ''
      ? value.name.trim()
      : undefined;
    return { id: id, color: color, name: name, custom: fallback === undefined };
  };
  const builtIn = kPalette.flatMap((p) => read(p.id, p.color) ?? []);
  const own = Object.keys(colors)
    .filter((id) => !kPalette.some((p) => p.id === id))
    .flatMap((id) => read(id) ?? []);
  return [...builtIn, ...own];
};

// The color of a highlight: its own (a 'custom' one, or as resolved from the user's colors when
// the config is read), or else the built in color of its id.
export const highlightColor = (highlight?: string, color?: string): string | undefined => {
  if (highlight === undefined || highlight === '' || highlight === kNoHighlight)
    return undefined;
  if (color !== undefined && isHexColor(color))
    return color;
  return kPalette.find((p) => p.id === highlightId(highlight))?.color;
};

export const paletteColor = (
  palette: PaletteColor[],
  highlight?: string,
  color?: string,
): string | undefined => {
  if (highlight === undefined || highlight === '' || highlight === kNoHighlight)
    return undefined;
  if (highlight === 'custom')
    return color !== undefined && isHexColor(color) ? color : undefined;
  return palette.find((p) => p.id === highlightId(highlight))?.color;
};

// "r g b" for colors with alpha in CSS, e.g. rgb(var(--timeline-highlight-rgb) / 50%).
export const rgbChannels = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

// The color halfway to white, for the lighter parts of a skin's bar.
export const rgbChannelsLight = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  const light = (c: number) => Math.round(c + (255 - c) * 0.5);
  return `${light((n >> 16) & 255)} ${light((n >> 8) & 255)} ${light(n & 255)}`;
};
