import { SavedConfigEntry } from '../../types/event';
import { LocaleText } from '../../types/trigger';
import { setTip, setTooltip } from '../config/config_tooltip';

import {
  entryKey,
  highlightId,
  isHexColor,
  kEditJobs,
  kEntryMoveSeconds,
  kNoHighlight,
  kPalette,
  matchEdits,
  PaletteColor,
  paletteColor,
  parseEntryKey,
  readPalette,
} from './timeline_entries';
import { Event, TimelineParser } from './timeline_parser';

// Fork: the config page's timeline editor (the new style; the original page keeps the original
// one).  A fight's entries, with the ones the user added among them, as a list of single lines:
// one opens to edit its text, hidden or not, and highlight, for everyone or for one job.  The
// original edits by name are on a tab of their own.  See timeline_entries.ts.

export type TimelineEditorContext = {
  // The fight's timeline as in its file (no user edits), and its text.
  timeline: TimelineParser;
  text: string;
  translate: (text: LocaleText) => string;
  // The fight's saved timeline config: 'entries', 'jobEntries', 'globalReplace', 'enable', 'add'.
  get: (path: string[]) => SavedConfigEntry;
  set: (path: string[], value: SavedConfigEntry) => void;
  // The highlight colors, for all fights: { id: { color, name } }.
  getColors: () => SavedConfigEntry;
  setColor: (id: string, value: SavedConfigEntry) => void;
  jobName: (job: string) => string;
  // The original editor by name (hide, rename).
  buildByName: (parent: HTMLElement) => void;
};

type Edit = { text?: string; hide?: boolean; highlight?: string; color?: string };

// The edits for everyone ('') or for a job.
type Layer = string;

const t = {
  entries: { en: 'By entry', ko: '항목별' },
  byName: { en: 'By name', ko: '이름별' },
  layer: { en: 'Edits for', ko: '편집 대상' },
  common: { en: 'All jobs', ko: '공통 (모든 직업)' },
  layerHelp: {
    en:
      '<p>A job\'s edits override the common ones when you play that job; text, hiding and highlight are each overridden on their own. The overlay picks them by your job.</p><p>Entries added while editing for a job are for that job only.</p><p>"Copy from" copies the edits of another job (or the common ones) here; entries already edited here stay as they are.</p>',
    ko:
      '<p>직업 편집은 그 직업으로 플레이할 때 공통 편집보다 우선합니다. 문구·숨기기·강조를 각각 따로 덮어쓰며, 오버레이가 지금 직업에 맞춰 자동으로 고릅니다.</p><p>직업 편집 중에 추가한 항목은 그 직업에서만 보입니다.</p><p>"다른 대상에서 가져오기"는 다른 직업(또는 공통)의 편집을 여기로 복사합니다. 여기서 이미 편집한 항목은 그대로 둡니다.</p>',
  },
  search: { en: 'Find an ability', ko: '기술 이름으로 찾기' },
  editedOnly: { en: 'Changed only', ko: '변경한 것만' },
  copyFrom: { en: 'Copy from…', ko: '다른 대상에서 가져오기…' },
  add: { en: '+ Add entry', ko: '+ 항목 추가' },
  newEntry: { en: 'New entry', ko: '새 항목' },
  colors: { en: 'Colors', ko: '강조 색' },
  part: { en: 'Section', ko: '구간' },
  prevPart: { en: 'Previous section', ko: '이전 구간' },
  nextPart: { en: 'Next section', ko: '다음 구간' },
  movedFlag: { en: 'Time changed', ko: '시간 바뀜' },
  toCommon: { en: 'Use common', ko: '공통으로' },
  hiddenByNameShort: { en: 'Hidden by name', ko: '이름별에서 숨김' },
  details: { en: 'Details', ko: '자세히' },
  hide: { en: 'Hide', ko: '숨기기' },
  show: { en: 'Show', ko: '보이기' },
  sectionsHelp: {
    en:
      '<p>The timeline jumps between its sections as the fight goes (e.g. by the boss\'s pattern), so times are where entries are in the timeline file (in seconds), not times in the fight.</p><p>Go to another section with the list or the ‹ › buttons.</p><p>In a text box, ↑ ↓ and Enter go to the entries above and below; Esc puts the text back.</p>',
    ko:
      '<p>타임라인은 전투 진행(보스 패턴 등)에 따라 구간 사이를 건너뛰므로, 시간은 전투 경과 시간이 아니라 타임라인 파일 안의 위치(초)입니다.</p><p>구간 목록이나 ‹ › 버튼으로 다른 구간으로 이동할 수 있습니다.</p><p>문구 칸에서 ↑ ↓와 Enter로 위아래 항목으로 옮겨 가고, Esc로 고치기 전으로 되돌립니다.</p>',
  },
  start: { en: 'Start', ko: '시작' },
  original: { en: 'Original: ${text}', ko: '원본: ${text}' },
  twin: {
    en: 'Another entry has this time and name, so edits apply to both.',
    ko: '같은 시각에 같은 이름의 항목이 하나 더 있어 편집이 함께 적용됩니다.',
  },
  from: { en: 'from ${time}s', ko: '${time}초부터' },
  addedBadge: { en: 'Added', ko: '직접 추가' },
  highlight: { en: 'Highlight', ko: '강조' },
  none: { en: 'None', ko: '없음' },
  inherit: { en: 'Same as all jobs', ko: '공통 따름' },
  applyAll: { en: 'Apply to all ${n} with this name', ko: '같은 이름 ${n}개 모두 이 강조로' },
  jobEditNote: {
    en: 'This entry has an edit for ${job}; "↺ Use common" removes it, so the common one applies.',
    ko: '이 항목에 ${job} 편집이 있습니다. "↺ 공통으로"를 누르면 지우고 공통 편집을 따릅니다.',
  },
  remove: { en: 'Remove', ko: '삭제' },
  time: { en: 'Time (s)', ko: '시간(초)' },
  duration: { en: 'Duration (s)', ko: '지속 시간(초)' },
  offset: {
    en: '${s}s after the start of this section (in the timeline file).',
    ko: '이 구간 시작으로부터 ${s}초 뒤입니다(타임라인 파일 기준).',
  },
  moved: {
    en:
      'The timeline was updated: this edit was made for the entry at ${time}s, and has moved here with it.',
    ko: '타임라인이 업데이트되어 ${time}초 항목에 했던 편집을 이 항목으로 옮겼습니다.',
  },
  renamed: {
    en: '"By name" renames this name to "${text}"; text entered here takes priority.',
    ko: '"이름별"에서 이 이름을 "${text}"(으)로 바꿨습니다. 여기서 입력한 문구가 있으면 그 문구가 우선합니다.',
  },
  hiddenByName: {
    en: '"By name" hides every entry with this name, so it can\'t be shown here.',
    ko: '"이름별"에서 이 이름의 모든 항목을 숨겼으므로 여기서는 다시 표시할 수 없습니다.',
  },
  addedNote: { en: 'An entry you added.', ko: '직접 추가한 항목입니다.' },
  addedJobNote: { en: 'An entry you added for ${job} only.', ko: '${job} 전용으로 추가한 항목입니다.' },
  addedCommonNote: {
    en: 'An entry added for all jobs: its own time and text are changed under "All jobs".',
    ko: '모든 직업에 추가한 항목입니다. 시간과 문구는 "공통 (모든 직업)"에서 바꿀 수 있습니다.',
  },
  lost: { en: 'Edits whose entry is no longer in the timeline', ko: '타임라인에서 찾을 수 없는 편집' },
  lostHelp: {
    en:
      'The timeline was updated and these entries are gone (or moved more than ${s}s, or can\'t be told apart). They no longer apply: remove them, or make them again on the right entries.',
    ko:
      '타임라인이 업데이트되면서 이 항목들이 없어졌거나 ${s}초 넘게 옮겨졌습니다(또는 어느 항목인지 알 수 없습니다). 지금은 적용되지 않으니, 삭제하거나 맞는 항목에서 다시 편집해 주세요.',
  },
  colorsHelp: {
    en:
      '<p>The colors to highlight with, for all fights. A name you give a color shows when picking it.</p><p>Changing a color changes every entry with it.</p>',
    ko:
      '<p>강조에 쓸 색 목록이며, 모든 전투에서 함께 쓰입니다. 색에 이름을 붙여 두면 고를 때 함께 보입니다.</p><p>색을 바꾸면 그 색을 쓴 모든 항목이 같이 바뀝니다.</p>',
  },
  colorName: { en: 'Name (e.g. tank buster)', ko: '이름 (예: 탱버)' },
  addColor: { en: '+ Add a color', ko: '+ 색 추가' },
  red: { en: 'Red', ko: '빨강' },
  orange: { en: 'Orange', ko: '주황' },
  yellow: { en: 'Yellow', ko: '노랑' },
  green: { en: 'Green', ko: '초록' },
  blue: { en: 'Blue', ko: '파랑' },
  purple: { en: 'Purple', ko: '보라' },
  ownColor: { en: 'Color ${n}', ko: '내 색 ${n}' },
  customColor: { en: 'Unlisted color', ko: '목록에 없는 색' },
  shownLower: { en: 'shown', ko: '보임' },
  hiddenLower: { en: 'hidden', ko: '숨김' },
  noMatch: { en: 'No entry matches.', ko: '일치하는 항목이 없습니다.' },
  noChanged: { en: 'No entry has changes.', ko: '변경한 항목이 없습니다.' },
  seconds: { en: '${s}s', ko: '${s}초' },
  info: { en: 'Description', ko: '설명' },
  tank: { en: 'Tanks', ko: '탱커' },
  healer: { en: 'Healers', ko: '힐러' },
  melee: { en: 'Melee DPS', ko: '근거리 딜러' },
  ranged: { en: 'Physical ranged DPS', ko: '원거리 물리 딜러' },
  caster: { en: 'Magical ranged DPS', ko: '원거리 마법 딜러' },
} as const;

const kBuiltInNames: { [id: string]: LocaleText } = {
  red: t.red,
  orange: t.orange,
  yellow: t.yellow,
  green: t.green,
  blue: t.blue,
  purple: t.purple,
};

// Colors for new colors of the user's own.
const kNewColors = [
  '#ff7ac6',
  '#26d0ce',
  '#d4e157',
  '#5c7cff',
  '#e17bff',
  '#ff7a45',
];

const kLayerStorageKey = 'cactbot-config-timeline-layer';

// Line icons for hidden or not (colored emoji don't take the text's color).
const kEye =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const kEyeOff =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

// Relative luminance (0 dark to 1 light) of #rrggbb.
const luminance = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
};

const formatSeconds = (seconds: number): string => parseFloat(seconds.toFixed(1)).toString();
// Shown with its tenths always (12.0, not 12), lined up as the timeline's file has them.
const showSeconds = (seconds: number): string => seconds.toFixed(1);

const asObject = (value: SavedConfigEntry | undefined): { [key: string]: SavedConfigEntry } =>
  typeof value === 'object' && !Array.isArray(value) ? value : {};

const asEdit = (value: SavedConfigEntry | undefined): Edit => {
  const v = asObject(value);
  const edit: Edit = {};
  if (typeof v.text === 'string' && v.text !== '')
    edit.text = v.text;
  if (typeof v.hide === 'boolean')
    edit.hide = v.hide;
  if (typeof v.highlight === 'string' && v.highlight !== '') {
    edit.highlight = v.highlight;
    if (typeof v.color === 'string')
      edit.color = v.color;
  }
  return edit;
};

// Only what differs is saved; nothing at all is an empty string.
const toSaved = (edit: Edit): SavedConfigEntry => {
  const out: { [key: string]: SavedConfigEntry } = {};
  if (edit.text !== undefined && edit.text !== '')
    out.text = edit.text;
  if (edit.hide !== undefined)
    out.hide = edit.hide;
  if (edit.highlight !== undefined && edit.highlight !== '') {
    out.highlight = edit.highlight;
    if (edit.highlight === 'custom' && edit.color !== undefined)
      out.color = edit.color;
  }
  return Object.keys(out).length > 0 ? out : '';
};

const isEmpty = (edit: Edit) => toSaved(edit) === '';

type AddedRow = { time: number; text: string; job?: string };

// An added entry's row as processPerZoneTimelineConfig reads it, if it is one.
const addedRow = (row: SavedConfigEntry | undefined): AddedRow | undefined => {
  const r = asObject(row);
  const time = typeof r.time === 'string' ? parseFloat(r.time) : NaN;
  const text = typeof r.text === 'string' ? r.text : '';
  if (isNaN(time) || text.trim() === '')
    return undefined;
  const job = typeof r.job === 'string' && r.job !== '' ? r.job : undefined;
  return job !== undefined ? { time: time, text: text, job: job } : { time: time, text: text };
};

// The timeline's parts: its start and each label (a jump destination), titled by the comment
// above the label if there is one.
type Section = { line: number; time: number; title: string };

const findSections = (text: string): Section[] => {
  const lines = text.split('\n');
  const sections: Section[] = [];
  lines.forEach((line, i) => {
    const m = /^\s*([0-9]+(?:\.[0-9]+)?)\s+label\s+"([^"]*)"/.exec(line);
    if (m === null)
      return;
    let title = m[2] ?? '';
    for (let j = i - 1; j >= 0 && j >= i - 3; --j) {
      const above = lines[j]?.trim() ?? '';
      if (above === '')
        continue;
      const comment = /^#+\s*([^-\s].*)$/.exec(above);
      if (comment?.[1] !== undefined)
        title = comment[1].trim();
      break;
    }
    // Line numbers count from 1, as TimelineParser's.
    sections.push({ line: i + 1, time: parseFloat(m[1] ?? '0'), title: title });
  });
  return sections;
};

export const buildTimelineEditor = (parent: HTMLElement, ctx: TimelineEditorContext): void => {
  const tr = (text: LocaleText) => ctx.translate(text);
  const format = (text: LocaleText, values: { [key: string]: string | number }) =>
    Object.entries(values).reduce(
      (s, [k, v]) => s.replace(`\${${k}}`, () => v.toString()),
      tr(text),
    );

  const make = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    cls?: string,
    text?: string,
  ): HTMLElementTagNameMap[K] => {
    const element = document.createElement(tag);
    if (cls !== undefined)
      element.className = cls;
    if (text !== undefined)
      element.textContent = text;
    if (element instanceof HTMLButtonElement)
      element.type = 'button';
    return element;
  };
  // Explanations are behind an icon, as for options (config_rows.ts).
  const help = (html: () => string): HTMLElement => {
    const icon = make('span', 'config-help', 'i');
    icon.tabIndex = 0;
    icon.setAttribute('role', 'img');
    icon.setAttribute('aria-label', tr(t.info));
    setTooltip(icon, html);
    return icon;
  };

  const editor = make('div', 'config-tl-editor');
  parent.appendChild(editor);

  // Tabs: each entry, and by name (built when first shown).  The entries are rebuilt on coming
  // back from by name, which changes what they show.  They go in the entries' bar (set as it is
  // built), and on a line of their own over the names.
  const tabs = make('div', 'config-view-switch config-tl-tabs');
  const entriesButton = make('button', undefined, tr(t.entries));
  const byNameButton = make('button', undefined, tr(t.byName));
  tabs.append(entriesButton, byNameButton);
  const entriesPane = make('div', 'config-tl-pane');
  const byNamePane = make('div', 'config-tl-pane config-hidden');
  editor.append(tabs, entriesPane, byNamePane);
  let entriesBar: HTMLElement | undefined;
  let byNameBuilt = false;
  let entriesStale = true;
  // focused: whether the switch had the focus, which it loses as it is moved (or rebuilt with
  // the entries): given back to the one pressed.
  const showPane = (entries: boolean, focused = false) => {
    if (entries)
      entriesBar?.prepend(tabs);
    else
      byNamePane.before(tabs);
    entriesPane.classList.toggle('config-hidden', !entries);
    byNamePane.classList.toggle('config-hidden', entries);
    entriesButton.classList.toggle('config-active', entries);
    byNameButton.classList.toggle('config-active', !entries);
    // Once shown (a hidden one takes no focus).
    if (focused)
      (entries ? entriesButton : byNameButton).focus({ preventScroll: true });
  };

  // Kept as the entries are rebuilt.
  const kChangedStorageKey = 'cactbot-config-timeline-changed';
  let onlyEdited = false;
  try {
    onlyEdited = window.localStorage.getItem(kChangedStorageKey) === '1';
  } catch {
    // Off then.
  }
  const filters = { query: '', onlyEdited: onlyEdited };
  const setOnlyEdited = (value: boolean) => {
    filters.onlyEdited = value;
    try {
      window.localStorage.setItem(kChangedStorageKey, value ? '1' : '0');
    } catch {
      // Only this page then.
    }
  };
  let layer: Layer = '';
  try {
    layer = window.localStorage.getItem(kLayerStorageKey) ?? '';
  } catch {
    // The common edits then.
  }
  if (layer !== '' && !kEditJobs.some((r) => r.jobs.some((j) => j === layer)))
    layer = '';
  // The open entry ('L' and its line number, or 'A' and its added row), and whether to start
  // typing its text.
  let openId: string | undefined;
  let focusText = false;
  let colorsOpen = false;

  const sections = findSections(ctx.text);
  const layerPath = (l: Layer) => l === '' ? ['entries'] : ['jobEntries', l];
  const addRows = (): SavedConfigEntry[] => {
    const rows = ctx.get(['add']);
    return Array.isArray(rows) ? rows : [];
  };
  const writeAddRows = (change: (rows: { [key: string]: SavedConfigEntry }[]) => void) => {
    const rows = addRows().map((r) => ({ ...asObject(r) }));
    change(rows);
    ctx.set(['add'], rows as [SavedConfigEntry]);
  };
  const allLayers = () => ['', ...Object.keys(asObject(ctx.get(['jobEntries'])))];
  const filled = (value: SavedConfigEntry | undefined) => value !== undefined && value !== '';
  // An added entry's edits go with it when its time or text changes, in every layer; not over
  // another entry's edits (which would be lost), and then not at all.  False then.
  const moveKeys = (from: string, to?: string): boolean => {
    const layers = allLayers().map((l) => ({
      path: layerPath(l),
      saved: asObject(ctx.get(layerPath(l))),
    }));
    if (to !== undefined && layers.some(({ saved }) => filled(saved[from]) && filled(saved[to])))
      return false;
    for (const { path, saved } of layers) {
      const value = saved[from];
      if (!filled(value) || value === undefined)
        continue;
      if (to !== undefined)
        ctx.set([...path, to], value);
      ctx.set([...path, from], '');
    }
    return true;
  };
  const layerCount = (l: Layer) =>
    Object.values(asObject(ctx.get(layerPath(l)))).filter((v) => !isEmpty(asEdit(v))).length +
    addRows().filter((r) => {
      const a = addedRow(r);
      return a !== undefined && (a.job ?? '') === l;
    }).length;

  // The open color picker closes on a click elsewhere (set as the entries are built).
  let closeOpenPicker: () => void = () => undefined;
  let pickerOf: () => HTMLElement | undefined = () => undefined;
  document.addEventListener('mousedown', (e) => {
    const pop = pickerOf();
    if (pop === undefined || !(e.target instanceof Node) || pop.contains(e.target))
      return;
    if (e.target instanceof Element && e.target.closest('.config-tl-color-button') !== null)
      return;
    closeOpenPicker();
  });

  // Called on scroll while the entries show (set as they are built), and as the fight's header
  // changes height (watched once, whatever rebuilds the entries).
  let onScroll: () => void = () => undefined;
  let headerWatched = false;
  // Puts the bar under the header (set as the entries are built), also while they are out of
  // sight (as the header changes on another tab), so it is right when they show again.
  let placeBar: () => void = () => undefined;
  let scrollQueued = false;
  let scroller: HTMLElement | null = null;
  const listenScroll = () => {
    if (scroller !== null)
      return;
    scroller = editor.closest('.config-scroll');
    scroller?.addEventListener('scroll', () => {
      if (scrollQueued)
        return;
      scrollQueued = true;
      window.requestAnimationFrame(() => {
        scrollQueued = false;
        if (!entriesPane.classList.contains('config-hidden'))
          onScroll();
      });
    }, { passive: true });
  };

  const buildEntries = (pane: HTMLElement): void => {
    // Edits taken back are saved empty; they go when the editor opens.
    for (const l of allLayers()) {
      const saved = asObject(ctx.get(layerPath(l)));
      const kept = Object.keys(saved).filter((k) => filled(saved[k]));
      if (kept.length !== Object.keys(saved).length) {
        const value: { [key: string]: SavedConfigEntry } = {};
        for (const k of kept)
          value[k] = saved[k] ?? '';
        ctx.set(layerPath(l), value);
      }
    }
    let palette = readPalette(ctx.getColors());
    const isJob = layer !== '';

    // The timeline's own entries (hideall ones aside), with the added ones by time among them.
    const fileEvents = ctx.timeline.events.filter((e) =>
      e.lineNumber !== undefined && !(e.name in ctx.timeline.ignores)
    );
    const addedInfo = new Map<Event, { index: number; job?: string }>();
    const addedEvents: Event[] = [];
    addRows().forEach((row, i) => {
      const a = addedRow(row);
      if (a === undefined || a.job !== undefined && a.job !== layer)
        return;
      const e: Event = { id: `+${i}`, time: a.time, name: a.text, text: a.text, sortKey: 0 };
      addedInfo.set(e, a.job !== undefined ? { index: i, job: a.job } : { index: i });
      addedEvents.push(e);
    });
    addedEvents.sort((a, b) => a.time - b.time);
    const events: Event[] = [];
    let next = 0;
    for (const e of fileEvents) {
      for (let a = addedEvents[next]; a !== undefined && a.time < e.time; a = addedEvents[next]) {
        events.push(a);
        next++;
      }
      events.push(e);
    }
    events.push(...addedEvents.slice(next));
    const isAdded = (e: Event) => addedInfo.has(e);
    // Added for this layer: its own time and text are edited here.
    const isOwnAdded = (e: Event) => isAdded(e) && (addedInfo.get(e)?.job ?? '') === layer;
    const idOf = (e: Event) =>
      isAdded(e) ? `A${addedInfo.get(e)?.index ?? ''}` : `L${e.lineNumber ?? ''}`;
    // The key an added entry's edits are saved under (kept when moving them couldn't be done).
    const addedKey = new Map<Event, string>(
      addedEvents.map((e) => [e, entryKey(e.time, e.name, true)]),
    );
    // Entries at the same time with the same name have the same key: their edits are one, on
    // the first of them.
    const firstOf = new Map<string, Event>();
    const canonOf = new Map<Event, Event>();
    for (const e of events) {
      const key = entryKey(e.time, e.name, isAdded(e));
      const first = firstOf.get(key);
      if (first === undefined)
        firstOf.set(key, e);
      canonOf.set(e, first ?? e);
    }
    const canon = (e: Event): Event => canonOf.get(e) ?? e;
    const hasTwin = (e: Event) => events.some((x) => x !== e && canon(x) === canon(e));

    const sameName = new Map<string, Event[]>();
    for (const e of fileEvents)
      sameName.set(e.name, [...sameName.get(e.name) ?? [], e]);

    const renames = asObject(ctx.get(['globalReplace']));
    const enables = asObject(ctx.get(['enable']));
    const baseText = (e: Event) => {
      const rename = renames[e.name];
      return !isAdded(e) && typeof rename === 'string' && rename !== '' ? rename : e.text;
    };
    const hiddenByName = (e: Event) => enables[e.name] === false;

    // Saved edits of a layer, put on the entries they are for now.
    type Saved = { key: string; at: { time: number; name: string; added: boolean }; edit: Edit };
    type LayerState = { state: Map<Event, { edit: Edit; key: string }>; lost: Saved[] };
    const loadLayer = (l: Layer, into?: LayerState): LayerState => {
      const saved = Object.entries(asObject(ctx.get(layerPath(l)))).flatMap(([key, value]) => {
        const at = parseEntryKey(key);
        const edit = asEdit(value);
        return at !== undefined && !isEmpty(edit) ? [{ key: key, at: at, edit: edit }] : [];
      });
      const matched = matchEdits(events, saved.map((s) => s.at));
      const out: LayerState = into ?? { state: new Map(), lost: [] };
      out.state.clear();
      out.lost.length = 0;
      saved.forEach((s, i) => {
        const e = matched[i];
        if (e === undefined)
          out.lost.push(s);
        else
          out.state.set(e, { edit: s.edit, key: s.key });
      });
      return out;
    };
    const common = loadLayer('');
    const own = isJob ? loadLayer(layer) : common;
    const reload = () => {
      loadLayer('', common);
      if (isJob)
        loadLayer(layer, own);
    };
    const edit = (e: Event): Edit => own.state.get(canon(e))?.edit ?? {};
    const commonEdit = (e: Event): Edit => isJob ? common.state.get(canon(e))?.edit ?? {} : {};
    const isEdited = (e: Event) => !isEmpty(edit(e)) || isOwnAdded(e);

    const colorName = (p: PaletteColor) => {
      const base = p.custom
        ? format(t.ownColor, { n: palette.filter((c) => c.custom).indexOf(p) + 1 })
        : tr(kBuiltInNames[p.id] ?? { en: p.id });
      return p.name !== undefined ? `${base} · ${p.name}` : base;
    };
    const highlightName = (value: Edit) => {
      if (value.highlight === undefined || value.highlight === kNoHighlight)
        return tr(t.none);
      const p = palette.find((c) => c.id === highlightId(value.highlight ?? ''));
      return p !== undefined ? colorName(p) : tr(t.customColor);
    };
    // A job's own highlight, or else the common one.
    const effective = (e: Event): Edit => {
      const mine = edit(e);
      return mine.highlight !== undefined ? mine : commonEdit(e);
    };
    const shownText = (e: Event) => edit(e).text ?? commonEdit(e).text ?? baseText(e);
    const isHidden = (e: Event) => hiddenByName(e) || (edit(e).hide ?? commonEdit(e).hide) === true;

    // ---- The bar on top: the view, the edited layer, search, filters, adding, the parts,
    // colors ----
    // One bar that stays in view (a line on a wide page, wrapping on a narrow one).
    const sticky = make('div', 'config-tl-sticky');
    const toolbar = make('div', 'config-tl-toolbar');
    sticky.appendChild(toolbar);
    pane.appendChild(sticky);
    entriesBar = toolbar;

    const layerName = (l: Layer) => l === '' ? tr(t.common) : ctx.jobName(l);
    const withCount = (l: Layer) => {
      const n = layerCount(l);
      return n > 0 ? `${layerName(l)} · ${n}` : layerName(l);
    };
    const layerSelect = make('select', 'config-tl-layer');
    layerSelect.add(new Option(withCount(''), ''));
    for (const { role, jobs } of kEditJobs) {
      const group = make('optgroup');
      group.label = tr(t[role]);
      for (const job of jobs)
        group.appendChild(new Option(withCount(job), job));
      layerSelect.appendChild(group);
    }
    layerSelect.value = layer;
    layerSelect.setAttribute('aria-label', tr(t.layer));
    // Which edits are made stands out while they are a job's (it is kept across fights and
    // sessions).
    layerSelect.classList.toggle('config-tl-layer-job', isJob);
    // A control's ⓘ goes on its name, not in the way of its control.
    const nameWithHelp = (text: LocaleText, html: () => string) => {
      const element = make('span', 'config-tl-part-label', tr(text));
      element.appendChild(help(html));
      return element;
    };
    const layerGroup = make('span', 'config-tl-layer-group');
    layerGroup.append(nameWithHelp(t.layer, () => tr(t.layerHelp)), layerSelect);

    const search = make('input', 'config-tl-search');
    search.type = 'text';
    search.placeholder = tr(t.search);
    search.setAttribute('aria-label', tr(t.search));
    search.value = filters.query;
    // "Edited only" says how many there are.
    const count = make('span', 'config-tl-count');
    const editedOnly = make('button', 'config-changed-toggle');
    editedOnly.classList.toggle('config-active', filters.onlyEdited);
    editedOnly.setAttribute('role', 'switch');
    editedOnly.setAttribute('aria-checked', filters.onlyEdited ? 'true' : 'false');
    editedOnly.append(make('span', 'config-mini-switch'), tr(t.editedOnly), count);
    const addButton = make('button', 'config-tl-tool config-tl-add', tr(t.add));
    const colorsButton = make('button', 'config-tl-tool config-tl-colors-button', tr(t.colors));
    colorsButton.classList.toggle('config-active', colorsOpen);

    // Copy another layer's edits (and entries added for it) here, leaving the ones here.
    const copy = make('select', 'config-tl-copy');
    copy.add(new Option(tr(t.copyFrom), ''));
    for (const l of ['', ...kEditJobs.flatMap((r) => r.jobs)]) {
      if (l !== layer && layerCount(l) > 0)
        copy.add(new Option(withCount(l), l));
    }
    if (copy.options.length > 1)
      layerGroup.appendChild(copy);

    // Parts of a timeline with jumps: the one in view, to go to another, and the ones around it.
    const partGroup = make('span', 'config-tl-part-group');
    const partSelect = make('select', 'config-tl-part-select');
    partSelect.setAttribute('aria-label', tr(t.part));
    const prevPart = make('button', 'config-tl-tool config-tl-step', '‹');
    prevPart.setAttribute('aria-label', tr(t.prevPart));
    setTip(prevPart, tr(t.prevPart));
    const nextPart = make('button', 'config-tl-tool config-tl-step', '›');
    nextPart.setAttribute('aria-label', tr(t.nextPart));
    setTip(nextPart, tr(t.nextPart));
    partGroup.append(
      nameWithHelp(t.part, () => tr(t.sectionsHelp)),
      partSelect,
      prevPart,
      nextPart,
    );
    toolbar.append(tabs, layerGroup, search, editedOnly, addButton);
    if (sections.length > 0)
      toolbar.appendChild(partGroup);
    toolbar.appendChild(colorsButton);

    const colorsBox = make('div', 'config-tl-colors');
    colorsBox.classList.toggle('config-hidden', !colorsOpen);
    pane.appendChild(colorsBox);

    // ---- Edits that lost their entry ----
    if (own.lost.length > 0) {
      const box = make('div', 'config-tl-lost');
      const title = make('div', 'config-tl-lost-title');
      const titleText = make('span', undefined, `${tr(t.lost)} · ${own.lost.length}`);
      title.append(titleText, help(() => format(t.lostHelp, { s: kEntryMoveSeconds })));
      box.appendChild(title);
      for (const s of [...own.lost]) {
        const line = make('div', 'config-tl-lost-row');
        const parts = [
          s.edit.text,
          s.edit.hide !== undefined ? tr(s.edit.hide ? t.hiddenLower : t.shownLower) : undefined,
          s.edit.highlight !== undefined
            ? `${tr(t.highlight)}: ${highlightName(s.edit)}`
            : undefined,
        ].filter((p) => p !== undefined);
        const where = s.at.added ? ` (${tr(t.addedBadge)})` : '';
        const when = format(t.seconds, { s: showSeconds(s.at.time) });
        const what = make(
          'span',
          undefined,
          `${when}  ${s.at.name}${where}  →  ${parts.join(' · ')}`,
        );
        const remove = make('button', undefined, tr(t.remove));
        remove.onclick = () => {
          ctx.set([...layerPath(layer), s.key], '');
          line.remove();
          const left = box.querySelectorAll('.config-tl-lost-row').length;
          if (left === 0)
            box.remove();
          else
            titleText.textContent = `${tr(t.lost)} · ${left}`;
        };
        line.append(what, remove);
        box.appendChild(line);
      }
      pane.appendChild(box);
    }

    // ---- The list ----
    const list = make('div', 'config-tl-list');
    pane.appendChild(list);
    const empty = make('div', 'config-tl-empty config-hidden', tr(t.noMatch));

    type Row = {
      e: Event;
      row: HTMLElement;
      input: HTMLInputElement;
      colorButton: HTMLButtonElement;
      refresh: () => void;
    };
    const rows: Row[] = [];
    const headings: { heading: HTMLElement; rows: HTMLElement[] }[] = [];
    const sectionOf = (e: Event): Section | undefined =>
      sections.filter((s) => s.line < (e.lineNumber ?? 0)).pop();
    const sectionOfRow = new Map<Event, Section | undefined>();
    let lastSection: Section | undefined | null = null;
    let currentSection: Section | undefined;
    // The open details of an entry, and the open color picker.
    let open: { r: Row; panel: HTMLElement } | undefined;
    let picker: { r: Row; pop: HTMLElement } | undefined;

    const fileHeader = parent.closest('.trigger-file-container')
      ?.querySelector<HTMLElement>(':scope > .trigger-file-header');
    // Under the bars on top, in one step: where the page can't scroll that far (its end), it
    // goes as far as it can rather than past the heading and back.
    const goTo = (heading: HTMLElement) => {
      const s = heading.closest<HTMLElement>('.config-scroll');
      if (s === null)
        return;
      // offsetHeight, unlike rects, is in the page's own pixels whatever its scale.
      const rect = heading.getBoundingClientRect();
      const k = rect.height > 0 ? heading.offsetHeight / rect.height : 1;
      const top = (rect.top - s.getBoundingClientRect().top) * k;
      s.scrollTop += top - ((fileHeader?.offsetHeight ?? 0) + sticky.offsetHeight + 4);
    };

    const save = (e: Event, value: Edit) => {
      const c = canon(e);
      const current = own.state.get(c);
      const key = addedKey.get(c) ?? entryKey(c.time, c.name, false);
      // A moved edit is saved again at its entry's new time.
      if (current !== undefined && current.key !== key)
        ctx.set([...layerPath(layer), current.key], '');
      ctx.set([...layerPath(layer), key], toSaved(value));
      own.state.set(c, { edit: value, key: key });
      updateCount();
      for (const r of rows) {
        if (r.e !== e && canon(r.e) === c)
          r.refresh();
      }
    };
    const rebuild = () => {
      entriesPane.replaceChildren();
      buildEntries(entriesPane);
    };
    // An entry added here: its time, text or duration changed (its edits go with it).
    // Not saved without a time and text (it would be gone): false then.
    const updateAdded = (e: Event, change: { [key: string]: string }): boolean => {
      const index = addedInfo.get(e)?.index ?? -1;
      const a = addedRow({ ...asObject(addRows()[index]), ...change });
      if (a === undefined)
        return false;
      writeAddRows((all) => {
        const target = all[index];
        if (target !== undefined)
          Object.assign(target, change);
      });
      e.time = a.time;
      e.name = a.text;
      e.text = a.text;
      const before = addedKey.get(e) ?? entryKey(e.time, e.name, true);
      const after = entryKey(e.time, e.name, true);
      if (after !== before && moveKeys(before, after)) {
        addedKey.set(e, after);
        reload();
      }
      return true;
    };
    // The text an entry shows unless edited here.
    const inherited = (e: Event) => isOwnAdded(e) ? e.text : commonEdit(e).text ?? baseText(e);
    // Notes about an entry, for its details.
    const notesOf = (e: Event): { text: string; warn: boolean }[] => {
      const notes: { text: string; warn: boolean }[] = [];
      const section = sectionOfRow.get(e);
      if (section !== undefined)
        notes.push({
          text: format(t.offset, { s: showSeconds(e.time - section.time) }),
          warn: false,
        });
      if (isAdded(e)) {
        const job = addedInfo.get(e)?.job;
        const text = job !== undefined
          ? format(t.addedJobNote, { job: ctx.jobName(job) })
          : tr(isJob ? t.addedCommonNote : t.addedNote);
        notes.push({ text: text, warn: false });
      }
      if (baseText(e) !== e.text)
        notes.push({ text: format(t.renamed, { text: baseText(e) }), warn: false });
      if (hiddenByName(e))
        notes.push({ text: tr(t.hiddenByName), warn: true });
      if (hasTwin(e))
        notes.push({ text: tr(t.twin), warn: false });
      if (isJob && !isOwnAdded(e) && !isEmpty(edit(e)))
        notes.push({ text: format(t.jobEditNote, { job: ctx.jobName(layer) }), warn: false });
      const key = own.state.get(canon(e))?.key;
      const at = key !== undefined ? parseEntryKey(key) : undefined;
      if (at !== undefined && Math.abs(at.time - e.time) > 0.001)
        notes.push({ text: format(t.moved, { time: showSeconds(at.time) }), warn: true });
      return notes;
    };
    const isMoved = (e: Event) => {
      const key = own.state.get(canon(e))?.key;
      const at = key !== undefined ? parseEntryKey(key) : undefined;
      return at !== undefined && Math.abs(at.time - e.time) > 0.001;
    };
    const visibleRows = () => rows.filter((x) => !x.row.classList.contains('config-hidden'));

    for (const e of events) {
      if (!isAdded(e))
        currentSection = sectionOf(e);
      sectionOfRow.set(e, currentSection);
      if (sections.length > 0 && currentSection !== lastSection) {
        lastSection = currentSection;
        const when = currentSection !== undefined
          ? format(t.from, { time: showSeconds(currentSection.time) })
          : undefined;
        const title = currentSection?.title ?? tr(t.start);
        const heading = make(
          'div',
          'config-tl-section',
          when !== undefined ? `${title} · ${when}` : title,
        );
        list.appendChild(heading);
        headings.push({ heading: heading, rows: [] });
        partSelect.add(new Option(title, (headings.length - 1).toString()));
      }

      // A line: its time, its text to edit in place, then marks and buttons: hidden, color,
      // details.
      const row = make('div', 'config-tl-row');
      headings[headings.length - 1]?.rows.push(row);
      const time = make('span', 'config-tl-time', showSeconds(e.time));
      const cell = make('span', 'config-tl-cell');
      const input = make('input', 'config-tl-inline');
      input.type = 'text';
      input.setAttribute('aria-label', e.text);
      const was = make('span', 'config-tl-was');
      cell.append(input, was);
      const side = make('span', 'config-tl-side');
      const same = isAdded(e) ? [] : sameName.get(e.name) ?? [];
      if (same.length > 1)
        side.appendChild(make('span', 'config-tl-dup', `#${same.indexOf(e) + 1}/${same.length}`));
      if (isAdded(e)) {
        const job = addedInfo.get(e)?.job;
        side.appendChild(
          make('span', 'config-tl-badge', job !== undefined ? ctx.jobName(job) : tr(t.addedBadge)),
        );
      }
      const flag = make('button', 'config-tl-flag', tr(t.movedFlag));
      side.appendChild(flag);
      // A job's edit of this entry, which goes back to the common one.
      const jobChip = make('button', 'config-tl-job-chip', '↺');
      jobChip.appendChild(make('span', 'config-tl-chip-text', ` ${tr(t.toCommon)}`));
      jobChip.setAttribute('aria-label', tr(t.toCommon));
      if (isJob && !isOwnAdded(e))
        side.appendChild(jobChip);
      const eye = make('button', 'config-tl-icon config-tl-eye');
      // Not disabled: its tooltip says why (disabled buttons get no mouse events).
      if (hiddenByName(e))
        eye.setAttribute('aria-disabled', 'true');
      eye.setAttribute('aria-label', tr(t.hide));
      setTip(eye, tr(hiddenByName(e) ? t.hiddenByNameShort : t.hide));
      const colorButton = make('button', 'config-tl-icon config-tl-color-button');
      const dot = make('span', 'config-tl-dot');
      colorButton.appendChild(dot);
      const more = make('button', 'config-tl-icon config-tl-more', '▾');
      setTip(more, tr(t.details));
      more.setAttribute('aria-label', tr(t.details));
      more.setAttribute('aria-expanded', 'false');
      side.append(eye, colorButton, more);
      row.append(time, cell, side);
      list.appendChild(row);

      const showWas = () =>
        was.textContent = shownText(e) !== e.text ? format(t.original, { text: e.text }) : '';
      const refresh = () => {
        // Not while typing: the text box would narrow under the caret.
        if (document.activeElement !== input) {
          input.value = shownText(e);
          showWas();
        }
        input.placeholder = inherited(e);
        const color = paletteColor(palette, effective(e).highlight, effective(e).color);
        row.style.setProperty('--config-tl-color', color ?? 'transparent');
        // A light wash of it on the line, and the text in it unless too dark to read.
        row.style.setProperty(
          '--config-tl-tint',
          color !== undefined ? `${color}24` : 'transparent',
        );
        row.style.setProperty(
          '--config-tl-ink',
          color !== undefined && luminance(color) >= 0.3 ? color : 'var(--cfg-text)',
        );
        dot.classList.toggle('config-tl-dot-none', color === undefined);
        const label = `${tr(t.highlight)}: ${highlightName(effective(e))}`;
        setTip(colorButton, label);
        colorButton.setAttribute('aria-label', label);
        row.classList.toggle('config-tl-highlighted', color !== undefined);
        const hidden = isHidden(e);
        row.classList.toggle('config-tl-hidden', hidden);
        // Static icons only.
        eye.innerHTML = hidden ? kEyeOff : kEye;
        eye.classList.toggle('config-active', hidden);
        eye.setAttribute('aria-pressed', hidden ? 'true' : 'false');
        flag.classList.toggle('config-hidden', !isMoved(e));
        jobChip.classList.toggle('config-hidden', isEmpty(edit(e)));
        more.classList.toggle('config-hidden', notesOf(e).length === 0 && !isOwnAdded(e));
        row.classList.toggle('config-tl-edited', isEdited(e));
      };
      refresh();
      const r: Row = { e: e, row: row, input: input, colorButton: colorButton, refresh: refresh };
      rows.push(r);

      // The text, edited in place: an entry added here changes its own, others are edited over
      // what they show.
      let before = '';
      let returning = false;
      input.onfocus = () => {
        if (!returning)
          before = input.value;
        returning = false;
      };
      input.oninput = () => {
        if (isOwnAdded(e)) {
          if (updateAdded(e, { text: input.value }))
            refresh();
          return;
        }
        const v = input.value;
        save(e, { ...edit(e), text: v.trim() === '' || v === inherited(e) ? undefined : v });
        refresh();
      };
      input.onblur = () => {
        // To another window: the typing goes on when it comes back.
        if (!document.hasFocus()) {
          returning = true;
          return;
        }
        if (input.value.trim() === '')
          input.value = shownText(e);
        showWas();
      };
      input.onkeydown = (ev) => {
        if (ev.isComposing)
          return;
        if (ev.key === 'Escape') {
          if (input.value !== before) {
            input.value = before;
            input.dispatchEvent(new window.Event('input'));
          }
          input.blur();
          return;
        }
        // Up and down (and Enter, down) go to the next entries' text.
        const step = ev.key === 'ArrowUp'
          ? -1
          : ev.key === 'ArrowDown' || ev.key === 'Enter'
          ? 1
          : 0;
        if (step === 0)
          return;
        ev.preventDefault();
        const shown = visibleRows();
        const target = shown[shown.indexOf(r) + step];
        target?.input.focus();
        target?.input.select();
        target?.row.scrollIntoView({ block: 'nearest' });
      };
      eye.onclick = () => {
        if (hiddenByName(e))
          return;
        const hidden = !isHidden(e);
        const inheritedHide = commonEdit(e).hide === true;
        const value = isJob && !isOwnAdded(e)
          ? (hidden === inheritedHide ? undefined : hidden)
          : hidden || undefined;
        save(e, { ...edit(e), hide: value });
        refresh();
      };
      jobChip.onclick = () => {
        save(e, {});
        input.value = shownText(e);
        refresh();
        if (picker?.r === r)
          openPicker(r);
      };
      colorButton.onclick = () => {
        if (picker?.r === r)
          closePicker();
        else
          openPicker(r, true);
      };
      more.onclick = () => toggleDetails(r);
      flag.onclick = () => toggleDetails(r);
      // Clicking the line elsewhere edits its text.
      row.onclick = (ev) => {
        if (ev.target === row || ev.target === time || ev.target === cell)
          input.focus();
      };
    }
    list.appendChild(empty);

    const updateCount = () => {
      // Entries with the same edits (see canon) count once, as they are saved.
      const n = new Set(events.filter(isEdited).map(canon)).size;
      count.textContent = n > 0 ? n.toString() : '';
      // The edited layer's count in its list too.
      const option = [...layerSelect.options].find((o) => o.value === layer);
      if (option !== undefined)
        option.text = withCount(layer);
    };
    updateCount();

    // ---- The color picker of an entry: none, the colors (and for a job, as common) ----
    const closePicker = () => {
      picker?.pop.remove();
      picker?.r.colorButton.classList.remove('config-active');
      picker?.r.row.classList.remove('config-tl-picking');
      picker = undefined;
    };
    const openPicker = (r: Row, focus = false) => {
      closePicker();
      const { e } = r;
      const pop = make('div', 'config-tl-pop');
      const colors = make('div', 'config-tl-pick-colors');
      pop.appendChild(colors);
      const picks: { button: HTMLButtonElement; value: string | undefined }[] = [];
      const pickName = make('span', 'config-tl-pick-name');
      const show = () => {
        const mine = edit(e);
        let current: string | undefined;
        if (mine.highlight === undefined)
          current = inherits ? undefined : '';
        else
          current = mine.highlight === kNoHighlight ? '' : highlightId(mine.highlight);
        for (const { button, value } of picks)
          button.classList.toggle('config-active', value === current);
        // The chosen color's name (the "none" chip says itself).
        const chosen = effective(e);
        pickName.textContent = chosen.highlight === undefined || chosen.highlight === kNoHighlight
          ? ''
          : highlightName(chosen);
      };
      const pick = (button: HTMLButtonElement, value: string | undefined) => {
        button.onclick = () => {
          let highlight = value;
          if (value === '')
            highlight = isJob && commonEdit(e).highlight !== undefined ? kNoHighlight : undefined;
          save(e, { ...edit(e), highlight: highlight, color: undefined });
          r.refresh();
          show();
        };
        picks.push({ button: button, value: value });
        colors.appendChild(button);
      };
      // An entry added for this job has no common edits to follow.
      const inherits = isJob && !isOwnAdded(e);
      if (inherits) {
        const inherit = make('button', 'config-tl-pick-chip');
        const theirs = commonEdit(e);
        const color = paletteColor(palette, theirs.highlight, theirs.color);
        if (color !== undefined) {
          const d = make('span', 'config-tl-dot');
          d.style.backgroundColor = color;
          inherit.appendChild(d);
        }
        inherit.append(tr(t.inherit));
        pick(inherit, undefined);
      }
      pick(make('button', 'config-tl-pick-chip', tr(t.none)), '');
      for (const p of palette) {
        const swatch = make('button', 'config-tl-swatch');
        swatch.style.backgroundColor = p.color;
        swatch.setAttribute('aria-label', colorName(p));
        // Its name while pointed at, as the colors have no text of their own.
        const preview = () => pickName.textContent = colorName(p);
        swatch.addEventListener('mouseenter', preview);
        swatch.addEventListener('focus', preview);
        swatch.addEventListener('mouseleave', show);
        swatch.addEventListener('blur', show);
        pick(swatch, p.id);
      }
      pop.appendChild(pickName);
      // The same highlight for every entry with this name.
      const same = isAdded(e) ? [] : sameName.get(e.name) ?? [];
      if (same.length > 1) {
        const all = make('button', 'config-tl-action', format(t.applyAll, { n: same.length }));
        all.onclick = () => {
          const { highlight, color } = edit(e);
          for (const other of same) {
            if (other !== e)
              save(other, { ...edit(other), highlight: highlight, color: color });
          }
          for (const x of rows) {
            if (same.includes(x.e))
              x.refresh();
          }
        };
        pop.appendChild(all);
      }
      show();
      pop.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Escape')
          return;
        ev.stopPropagation();
        closePicker();
        r.colorButton.focus();
      });
      r.row.appendChild(pop);
      r.row.classList.add('config-tl-picking');
      r.colorButton.classList.add('config-active');
      picker = { r: r, pop: pop };
      if (focus)
        (pop.querySelector<HTMLElement>('.config-active') ?? pop.querySelector('button'))?.focus();
    };
    closeOpenPicker = closePicker;
    pickerOf = () => picker?.pop;

    // ---- The details of an entry: notes, and for one added here, its time and duration ----
    const buildDetails = (r: Row): HTMLElement => {
      const { e } = r;
      const panel = make('div', 'config-tl-panel');
      const notes = notesOf(e);
      if (notes.length > 0) {
        const box = make('div', 'config-tl-notes');
        for (const n of notes)
          box.appendChild(make('p', n.warn ? 'config-tl-warn' : undefined, n.text));
        panel.appendChild(box);
      }
      if (isOwnAdded(e)) {
        const line = make('div', 'config-tl-panel-line');
        const saved = asObject(addRows()[addedInfo.get(e)?.index ?? -1]);
        const field = (label: LocaleText, cls: string, value: SavedConfigEntry | undefined) => {
          const wrap = make('label', `config-tl-field ${cls}`);
          wrap.appendChild(make('span', 'config-tl-field-label', tr(label)));
          const input = make('input');
          input.type = 'text';
          input.value = typeof value === 'string' ? value : '';
          wrap.appendChild(input);
          line.appendChild(wrap);
          return input;
        };
        const timeInput = field(t.time, 'config-tl-f-time', saved.time);
        const durationInput = field(t.duration, 'config-tl-f-duration', saved.duration);
        durationInput.oninput = () => updateAdded(e, { duration: durationInput.value });
        // A new time puts the entry in its place.
        timeInput.onchange = () => {
          if (updateAdded(e, { time: timeInput.value }))
            rebuild();
          else
            timeInput.value = typeof saved.time === 'string' ? saved.time : '';
        };
        const remove = make('button', 'config-tl-remove', tr(t.remove));
        remove.onclick = () => {
          moveKeys(addedKey.get(e) ?? entryKey(e.time, e.name, true));
          writeAddRows((all) => all.splice(addedInfo.get(e)?.index ?? -1, 1));
          openId = undefined;
          rebuild();
        };
        line.appendChild(remove);
        panel.appendChild(line);
      }
      return panel;
    };
    const closeDetails = () => {
      if (open === undefined)
        return;
      open.panel.remove();
      open.r.row.classList.remove('config-tl-open');
      open.r.row.querySelector('.config-tl-more')?.setAttribute('aria-expanded', 'false');
      open = undefined;
      openId = undefined;
    };
    const toggleDetails = (r: Row) => {
      const same = open?.r === r;
      closeDetails();
      if (same)
        return;
      const panel = buildDetails(r);
      r.row.after(panel);
      r.row.classList.add('config-tl-open');
      r.row.querySelector('.config-tl-more')?.setAttribute('aria-expanded', 'true');
      open = { r: r, panel: panel };
      openId = idOf(r.e);
    };

    // ---- Colors ----
    const refreshAll = () => {
      for (const r of rows)
        r.refresh();
      if (picker !== undefined)
        openPicker(picker.r);
    };
    const buildColors = () => {
      colorsBox.replaceChildren();
      const title = make('div', 'config-tl-colors-title', tr(t.colors));
      title.appendChild(help(() => tr(t.colorsHelp)));
      colorsBox.appendChild(title);
      for (const p of palette) {
        const line = make('div', 'config-tl-color-line');
        const dot = make('span', 'config-tl-dot');
        dot.style.backgroundColor = p.color;
        const label = p.custom
          ? format(t.ownColor, { n: palette.filter((c) => c.custom).indexOf(p) + 1 })
          : tr(kBuiltInNames[p.id] ?? { en: p.id });
        const name = make('input', 'config-tl-color-name');
        name.type = 'text';
        name.placeholder = tr(t.colorName);
        name.value = p.name ?? '';
        const hex = make('input', 'config-tl-hex');
        hex.type = 'text';
        hex.value = p.color;
        const store = () => {
          const value: { [key: string]: SavedConfigEntry } = {};
          const builtIn = kPalette.find((c) => c.id === p.id)?.color;
          // A box that isn't a color (yet) keeps the color it had.
          const typed = hex.value.trim();
          const color = isHexColor(typed)
            ? typed
            : palette.find((c) => c.id === p.id)?.color ?? p.color;
          if (p.custom || color.toLowerCase() !== builtIn)
            value.color = color;
          if (name.value.trim() !== '')
            value.name = name.value.trim();
          ctx.setColor(p.id, Object.keys(value).length > 0 ? value : '');
          palette = readPalette(ctx.getColors());
          dot.style.backgroundColor = palette.find((c) => c.id === p.id)?.color ?? p.color;
        };
        // A name shows only in the color picker.
        name.oninput = () => {
          store();
          if (picker !== undefined)
            openPicker(picker.r);
        };
        hex.oninput = () => {
          hex.classList.toggle('config-invalid', !isHexColor(hex.value.trim()));
          if (isHexColor(hex.value.trim())) {
            store();
            refreshAll();
          }
        };
        line.append(dot, make('span', 'config-tl-color-label', label), name, hex);
        if (p.custom) {
          const remove = make('button', 'config-tl-color-remove', tr(t.remove));
          remove.onclick = () => {
            ctx.setColor(p.id, '');
            palette = readPalette(ctx.getColors());
            buildColors();
            refreshAll();
          };
          line.appendChild(remove);
        }
        colorsBox.appendChild(line);
      }
      const addColor = make('button', 'config-tl-color-add', tr(t.addColor));
      addColor.onclick = () => {
        const used = new Set(palette.map((p) => p.color.toLowerCase()));
        const color = kNewColors.find((c) => !used.has(c)) ?? kNewColors[0] ?? '#ff7ac6';
        ctx.setColor(`c${Date.now().toString(36)}`, { color: color });
        palette = readPalette(ctx.getColors());
        buildColors();
        refreshAll();
      };
      colorsBox.appendChild(addColor);
    };
    colorsButton.onclick = () => {
      colorsOpen = !colorsOpen;
      colorsButton.classList.toggle('config-active', colorsOpen);
      colorsBox.classList.toggle('config-hidden', !colorsOpen);
      if (colorsOpen)
        buildColors();
    };
    if (colorsOpen)
      buildColors();

    // ---- Filters ----
    const filter = () => {
      const query = filters.query.trim().toLowerCase();
      let shown = 0;
      for (const r of rows) {
        const { e, row } = r;
        const hit = (query === '' ||
          `${e.text} ${e.name} ${shownText(e)}`.toLowerCase().includes(query)) &&
          (!filters.onlyEdited || isEdited(e));
        row.classList.toggle('config-hidden', !hit);
        if (hit) {
          shown++;
        } else {
          if (open?.r === r)
            closeDetails();
          if (picker?.r === r)
            closePicker();
        }
      }
      for (const { heading, rows } of headings) {
        const none = rows.every((x) => x.classList.contains('config-hidden'));
        heading.classList.toggle('config-hidden', none);
      }
      empty.textContent = tr(filters.onlyEdited && query === '' ? t.noChanged : t.noMatch);
      empty.classList.toggle('config-hidden', shown > 0);
      onScroll();
    };
    search.oninput = () => {
      filters.query = search.value;
      filter();
    };
    search.onkeydown = (ev) => {
      if (ev.key !== 'Enter' || ev.isComposing)
        return;
      ev.preventDefault();
      visibleRows()[0]?.input.focus();
    };
    editedOnly.onclick = () => {
      setOnlyEdited(!filters.onlyEdited);
      editedOnly.classList.toggle('config-active', filters.onlyEdited);
      editedOnly.setAttribute('aria-checked', filters.onlyEdited ? 'true' : 'false');
      filter();
    };
    filter();

    // ---- The toolbar's other controls ----
    layerSelect.onchange = () => {
      layer = layerSelect.value;
      try {
        window.localStorage.setItem(kLayerStorageKey, layer);
      } catch {
        // Only this page then.
      }
      openId = undefined;
      rebuild();
    };
    copy.onchange = () => {
      const from = copy.value;
      const here = asObject(ctx.get(layerPath(layer)));
      for (const [k, value] of Object.entries(asObject(ctx.get(layerPath(from))))) {
        if (!isEmpty(asEdit(value)) && isEmpty(asEdit(here[k])))
          ctx.set([...layerPath(layer), k], value);
      }
      if (from !== '' && layer === '') {
        writeAddRows((all) => {
          for (const x of all) {
            if (x.job === from)
              delete x.job;
          }
        });
      } else if (from !== '') {
        writeAddRows((all) => {
          const have = new Set(all.map((x) => {
            const a = addedRow(x);
            return a !== undefined ? `${a.job ?? ''}|${a.time}|${a.text}` : '';
          }));
          for (const x of [...all]) {
            const a = addedRow(x);
            if (a === undefined || a.job !== from || have.has(`${layer}|${a.time}|${a.text}`))
              continue;
            const copied = { ...x };
            delete copied.job;
            if (layer !== '')
              copied.job = layer;
            all.push(copied);
          }
        });
      }
      rebuild();
    };
    // A new entry at the time in view, its text ready to type.
    const topRow = (): Row | undefined => {
      const bottom = sticky.getBoundingClientRect().bottom;
      return visibleRows().find((x) => x.row.getBoundingClientRect().bottom > bottom);
    };
    addButton.onclick = () => {
      const at = topRow()?.e.time ?? 0;
      let index = 0;
      const taken = new Set(
        addRows().map((x) => addedRow(x)).filter((a) => a?.time === at).map((a) => a?.text),
      );
      let text = tr(t.newEntry);
      for (let n = 2; taken.has(text); ++n)
        text = `${tr(t.newEntry)} ${n}`;
      writeAddRows((all) => {
        const added: { [key: string]: SavedConfigEntry } = {
          time: formatSeconds(at),
          text: text,
          duration: '',
        };
        if (layer !== '')
          added.job = layer;
        index = all.push(added) - 1;
      });
      openId = `A${index}`;
      focusText = true;
      filters.query = '';
      setOnlyEdited(false);
      rebuild();
    };

    // ---- The bar stays under the fight's header; the part in view is shown ----
    const currentPart = (): number => {
      const bottom = sticky.getBoundingClientRect().bottom + 8;
      let current = 0;
      headings.forEach(({ heading }, i) => {
        const visible = !heading.classList.contains('config-hidden');
        if (visible && heading.getBoundingClientRect().top <= bottom)
          current = i;
      });
      return current;
    };
    // The parts shown (a filter can leave some without entries): the one before or after a part.
    const shownPart = (from: number, step: number): number | undefined => {
      for (let i = from + step; i >= 0 && i < headings.length; i += step) {
        if (!headings[i]?.heading.classList.contains('config-hidden'))
          return i;
      }
      return undefined;
    };
    const goToPart = (i: number | undefined) => {
      const target = i !== undefined ? headings[i] : undefined;
      if (target !== undefined && !target.heading.classList.contains('config-hidden'))
        goTo(target.heading);
    };
    partSelect.onchange = () => goToPart(parseInt(partSelect.value));
    prevPart.onclick = () => goToPart(shownPart(currentPart(), -1));
    nextPart.onclick = () => goToPart(shownPart(currentPart(), 1));
    const placeSticky = () => {
      const top = `${fileHeader?.offsetHeight ?? 0}px`;
      if (sticky.style.top !== top)
        sticky.style.top = top;
    };
    placeSticky();
    placeBar = placeSticky;
    // And as the header's height changes (a narrower window wraps it), as the triggers' bar does.
    if (
      !headerWatched && fileHeader !== null && fileHeader !== undefined &&
      typeof ResizeObserver !== 'undefined'
    ) {
      headerWatched = true;
      new ResizeObserver(() => placeBar()).observe(fileHeader, { box: 'border-box' });
    }
    onScroll = () => {
      // Not while the fight's timeline edits are closed.
      if (editor.offsetParent === null)
        return;
      placeSticky();
      if (headings.length === 0)
        return;
      const current = currentPart();
      partSelect.value = current.toString();
      headings.forEach(({ heading }, i) => {
        const option = partSelect.options[i];
        if (option !== undefined)
          option.disabled = heading.classList.contains('config-hidden');
      });
      prevPart.disabled = shownPart(current, -1) === undefined;
      nextPart.disabled = shownPart(current, 1) === undefined;
    };
    listenScroll();
    onScroll();

    // The entry open before a rebuild (or a new one, to type its text).
    const reopen = openId !== undefined ? rows.find((x) => idOf(x.e) === openId) : undefined;
    if (reopen !== undefined) {
      reopen.row.scrollIntoView({ block: 'center' });
      if (focusText) {
        openId = undefined;
        reopen.input.focus();
        reopen.input.select();
      } else {
        toggleDetails(reopen);
      }
    } else {
      openId = undefined;
    }
    focusText = false;
  };

  entriesButton.onclick = () => {
    const focused = tabs.contains(document.activeElement);
    if (entriesStale) {
      entriesPane.replaceChildren();
      buildEntries(entriesPane);
    }
    entriesStale = false;
    showPane(true, focused);
  };
  byNameButton.onclick = () => {
    const focused = tabs.contains(document.activeElement);
    if (!byNameBuilt)
      ctx.buildByName(byNamePane);
    byNameBuilt = true;
    entriesStale = true;
    showPane(false, focused);
  };
  entriesButton.click();
};
