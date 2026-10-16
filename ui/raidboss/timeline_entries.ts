// Fork: edits of single timeline entries, made in the config page: another text, hidden, or
// highlighted.  An edit names its entry by its time and original name in the timeline file, so
// it stays on top of the file as the file is updated: an entry that moved a little is followed,
// and one that is gone is left alone (and listed in the config page) rather than guessed.

export type TimelineEntryEdit = {
  time: number;
  name: string;
  text?: string;
  hide?: boolean;
  highlight?: string;
  // For the 'custom' highlight, as #rrggbb.
  color?: string;
};

// How far an entry may have moved (in seconds) and still be found by its name.
export const kEntryMoveSeconds = 5;

// The saved config key of an entry: "time|name".
export const entryKey = (time: number, name: string): string => `${time}|${name}`;

export const parseEntryKey = (key: string): { time: number; name: string } | undefined => {
  const bar = key.indexOf('|');
  const time = parseFloat(key.slice(0, bar));
  if (bar < 0 || isNaN(time))
    return undefined;
  return { time: time, name: key.slice(bar + 1) };
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

// Highlights: skins draw them their own way (raidboss.css and skins look at
// .timer-bar[data-highlight] and --timeline-highlight-rgb); these colors are the default.
export const kHighlightColors: { [highlight: string]: string } = {
  danger: '#ff5c5c',
  caution: '#ffc24a',
  mitigation: '#4fc3ff',
  note: '#b79bff',
};

export const isHexColor = (color: string): boolean => /^#[0-9a-f]{6}$/i.test(color);

export const highlightColor = (highlight?: string, color?: string): string | undefined => {
  if (highlight === undefined || highlight === '')
    return undefined;
  if (highlight === 'custom')
    return color !== undefined && isHexColor(color) ? color : undefined;
  return kHighlightColors[highlight];
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
