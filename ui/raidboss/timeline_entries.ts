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
export const parseEntryEdits = (saved: SavedConfigEntry | undefined): TimelineEntryEdit[] => {
  if (typeof saved !== 'object' || Array.isArray(saved))
    return [];
  const edits: TimelineEntryEdit[] = [];
  for (const [key, value] of Object.entries(saved)) {
    const at = parseEntryKey(key);
    if (at === undefined || typeof value !== 'object' || Array.isArray(value))
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

// The entry each edit is for: the one with its name at its time, or else the nearest one with its
// name within kEntryMoveSeconds that no other edit has.  Undefined when there is none.
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
  edits.forEach((edit, i) => {
    if (result[i] !== undefined)
      return;
    let best: E | undefined;
    let bestDistance = Infinity;
    for (const e of entries) {
      const distance = Math.abs(e.time - edit.time);
      if (e.name !== edit.name || taken.has(e) || distance > kEntryMoveSeconds)
        continue;
      if (distance < bestDistance) {
        best = e;
        bestDistance = distance;
      }
    }
    if (best !== undefined) {
      taken.add(best);
      result[i] = best;
    }
  });
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
  typeof value === 'object' && !Array.isArray(value) ? value : {};

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
