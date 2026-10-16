import { SavedConfigEntry } from '../../types/event';
import { LocaleText } from '../../types/trigger';
import { setTooltip } from '../config/config_tooltip';

import {
  entryKey,
  highlightId,
  isHexColor,
  kEditJobs,
  kEntryMoveSeconds,
  kNoHighlight,
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
  entries: { en: 'Each entry', ko: '항목별 편집' },
  byName: { en: 'By name', ko: '이름별' },
  layer: { en: 'Edits for', ko: '편집 대상' },
  common: { en: 'Everyone', ko: '공통 (모든 직업)' },
  layerHelp: {
    en:
      '<p>Edits for a job go over the common ones for players of that job, each of text, hidden and highlight on its own. The overlay picks them by your job.</p><p>Entries added while editing for a job are for that job only.</p><p>"Copy from" copies another job\'s (or the common) edits here; entries already edited here stay.</p>',
    ko:
      '<p>직업 편집은 그 직업일 때 공통 편집 위에 덮어씁니다(문구·숨기기·강조 각각). 오버레이가 지금 직업에 맞춰 자동으로 고릅니다.</p><p>직업 편집 중에 추가한 항목은 그 직업에서만 보입니다.</p><p>"다른 편집 가져오기"는 다른 직업(또는 공통)의 편집을 여기로 복사합니다. 여기서 이미 편집한 항목은 그대로 둡니다.</p>',
  },
  search: { en: 'Find an ability', ko: '기술 이름으로 찾기' },
  editedOnly: { en: 'Edited only', ko: '편집한 것만' },
  copyFrom: { en: 'Copy from…', ko: '다른 편집 가져오기…' },
  add: { en: '+ Add', ko: '+ 항목 추가' },
  newEntry: { en: 'New entry', ko: '새 항목' },
  colors: { en: 'Colors', ko: '강조 색' },
  more: { en: 'More', ko: '더 보기' },
  sectionsHelp: {
    en:
      '<p>The timeline jumps between its parts as the fight goes (e.g. by the boss\'s pattern), so times are where entries are in the timeline file (in seconds), not times in the fight.</p><p>Click a part to go to it.</p>',
    ko:
      '<p>타임라인은 전투 진행(보스 패턴 등)에 따라 구간 사이를 건너뛰므로, 시간은 전투 경과 시간이 아니라 타임라인 파일 안의 위치(초)입니다.</p><p>누르면 그 구간으로 이동합니다.</p>',
  },
  start: { en: 'Start', ko: '시작' },
  from: { en: 'from ${time}s', ko: '${time}초부터' },
  addedBadge: { en: 'Added', ko: '추가' },
  shownText: { en: 'Shown as', ko: '표시 문구' },
  shown: { en: 'Shown', ko: '보임' },
  hidden: { en: 'Hidden', ko: '숨김' },
  highlight: { en: 'Highlight', ko: '강조' },
  none: { en: 'None', ko: '없음' },
  inherit: { en: 'As common', ko: '공통 따름' },
  applyAll: { en: 'This highlight for all ${n}', ko: '같은 이름 ${n}개 모두 이 강조로' },
  reset: { en: '↺ As common', ko: '↺ 공통으로' },
  remove: { en: 'Remove', ko: '삭제' },
  time: { en: 'Time (s)', ko: '시간(초)' },
  text: { en: 'Text', ko: '문구' },
  duration: { en: 'Duration (s)', ko: '지속 시간(초)' },
  offset: {
    en: '+${s}s from the start of this part (in the timeline file).',
    ko: '이 구간 시작부터 +${s}초 (타임라인 파일 기준).',
  },
  moved: {
    en: 'The timeline changed: this edit was made for the entry at ${time}s, and follows it here.',
    ko: '타임라인이 바뀌어서, ${time}초에 있던 항목에 했던 편집이 이 항목으로 따라왔습니다.',
  },
  renamed: {
    en: '"By name" renames this name to "${text}"; text here goes over it.',
    ko: '"이름별"에서 이 이름을 "${text}"(으)로 바꿨습니다. 여기서 쓴 문구가 그보다 먼저입니다.',
  },
  hiddenByName: {
    en: '"By name" hides every entry with this name, so it can\'t be shown here.',
    ko: '"이름별"에서 이 이름의 모든 항목을 숨겨서, 여기서는 켤 수 없습니다.',
  },
  addedNote: { en: 'An entry you added.', ko: '직접 추가한 항목입니다.' },
  addedJobNote: { en: 'An entry you added for ${job} only.', ko: '${job} 전용으로 추가한 항목입니다.' },
  addedCommonNote: {
    en: 'An entry added for everyone: its own time and text are changed in the common edits.',
    ko: '공통으로 추가한 항목입니다. 시간과 문구 자체는 공통 편집에서 바꿉니다.',
  },
  lost: { en: 'Edits whose entry is no longer in the timeline', ko: '타임라인에서 찾을 수 없는 편집' },
  lostHelp: {
    en:
      'The timeline was updated and these entries are gone (or moved more than ${s}s). They do nothing: remove them, or make them again on the right entries.',
    ko: '타임라인이 업데이트되면서 이 항목들이 없어졌거나 ${s}초 넘게 옮겨졌습니다. 지금은 적용되지 않으니, 지우거나 맞는 항목에 다시 편집해 주세요.',
  },
  colorsHelp: {
    en:
      '<p>The colors to highlight with, for all fights.  A name you give a color shows when picking it.</p><p>Changing a color changes every entry with it.</p>',
    ko:
      '<p>강조에 쓸 색 목록입니다(모든 전투 공통). 색에 이름을 붙여 두면 고를 때 함께 보입니다.</p><p>색을 바꾸면 그 색을 쓴 모든 항목이 같이 바뀝니다.</p>',
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
  customColor: { en: 'Other color', ko: '그 밖의 색' },
  shownLower: { en: 'shown', ko: '보임' },
  hiddenLower: { en: 'hidden', ko: '숨김' },
  noMatch: { en: 'No entry matches.', ko: '일치하는 항목이 없습니다.' },
  seconds: { en: '${s}s', ko: '${s}초' },
  info: { en: 'Info', ko: '설명' },
  tank: { en: 'Tanks', ko: '탱커' },
  healer: { en: 'Healers', ko: '힐러' },
  melee: { en: 'Melee', ko: '근거리 딜러' },
  ranged: { en: 'Physical ranged', ko: '원거리 물리 딜러' },
  caster: { en: 'Casters', ko: '원거리 마법 딜러' },
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

const formatSeconds = (seconds: number): string => parseFloat(seconds.toFixed(1)).toString();

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
    Object.entries(values).reduce((s, [k, v]) => s.replace(`\${${k}}`, v.toString()), tr(text));

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
  // back from by name, which changes what they show.
  const tabs = make('div', 'config-view-switch config-tl-tabs');
  const entriesButton = make('button', undefined, tr(t.entries));
  const byNameButton = make('button', undefined, tr(t.byName));
  tabs.append(entriesButton, byNameButton);
  const entriesPane = make('div', 'config-tl-pane');
  const byNamePane = make('div', 'config-tl-pane config-hidden');
  editor.append(tabs, entriesPane, byNamePane);
  let byNameBuilt = false;
  let entriesStale = true;
  const showPane = (entries: boolean) => {
    entriesPane.classList.toggle('config-hidden', !entries);
    byNamePane.classList.toggle('config-hidden', entries);
    entriesButton.classList.toggle('config-active', entries);
    byNameButton.classList.toggle('config-active', !entries);
  };

  // Kept as the entries are rebuilt.
  const filters = { query: '', onlyEdited: false };
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
  // An added entry's edits go with it when its time or text changes, in every layer.
  const moveKeys = (from: string, to?: string) => {
    for (const l of ['', ...Object.keys(asObject(ctx.get(['jobEntries'])))]) {
      const saved = asObject(ctx.get(layerPath(l)));
      const value = saved[from];
      if (value === undefined || value === '')
        continue;
      if (to !== undefined && (saved[to] === undefined || saved[to] === ''))
        ctx.set([...layerPath(l), to], value);
      ctx.set([...layerPath(l), from], '');
    }
  };
  const layerCount = (l: Layer) =>
    Object.values(asObject(ctx.get(layerPath(l)))).filter((v) => !isEmpty(asEdit(v))).length +
    addRows().filter((r) => {
      const a = addedRow(r);
      return a !== undefined && (a.job ?? '') === l;
    }).length;

  // Called on scroll while the entries show (set as they are built).
  let onScroll: () => void = () => undefined;
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
    const edit = (e: Event): Edit => own.state.get(e)?.edit ?? {};
    const commonEdit = (e: Event): Edit => isJob ? common.state.get(e)?.edit ?? {} : {};
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

    // ---- The bar on top: the edited layer, search, filters, adding, colors; the parts ----
    const sticky = make('div', 'config-tl-sticky');
    const toolbar = make('div', 'config-tl-toolbar');
    sticky.appendChild(toolbar);
    pane.appendChild(sticky);

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
    const layerGroup = make('span', 'config-tl-layer-group');
    layerGroup.append(layerSelect, help(() => tr(t.layerHelp)));

    const search = make('input', 'config-tl-search');
    search.type = 'text';
    search.placeholder = tr(t.search);
    search.value = filters.query;
    // "Edited only" says how many there are.
    const count = make('span', 'config-tl-count');
    const editedOnly = make('button', 'config-changed-toggle');
    editedOnly.classList.toggle('config-active', filters.onlyEdited);
    editedOnly.append(make('span', 'config-mini-switch'), tr(t.editedOnly), count);
    const addButton = make('button', 'config-tl-tool', tr(t.add));
    // Less used: the colors and copying, in a menu.
    const more = make('span', 'config-tl-more');
    const moreButton = make('button', 'config-tl-tool config-tl-more-button', '⋯');
    moreButton.setAttribute('aria-label', tr(t.more));
    moreButton.setAttribute('aria-haspopup', 'true');
    const menu = make('div', 'config-tl-menu config-hidden');
    const colorsButton = make('button', 'config-tl-menu-item', `🎨 ${tr(t.colors)}`);
    colorsButton.classList.toggle('config-active', colorsOpen);
    menu.appendChild(colorsButton);
    more.append(moreButton, menu);
    const showMenu = (show: boolean) => {
      menu.classList.toggle('config-hidden', !show);
      moreButton.classList.toggle('config-active', show);
      moreButton.setAttribute('aria-expanded', show ? 'true' : 'false');
    };
    moreButton.onclick = () => showMenu(menu.classList.contains('config-hidden'));
    more.addEventListener('focusout', (e) => {
      if (!(e.relatedTarget instanceof Node) || !more.contains(e.relatedTarget))
        showMenu(false);
    });

    // Copy another layer's edits (and entries added for it) here, leaving the ones here.
    const copy = make('select', 'config-tl-copy');
    copy.add(new Option(tr(t.copyFrom), ''));
    for (const l of ['', ...kEditJobs.flatMap((r) => r.jobs)]) {
      if (l !== layer && layerCount(l) > 0)
        copy.add(new Option(withCount(l), l));
    }
    toolbar.append(layerGroup, search, editedOnly, addButton, more);
    if (copy.options.length > 1)
      menu.appendChild(copy);

    // Parts of a timeline with jumps, to go to.
    const partBar = make('div', 'config-tl-parts');
    const partChips: { chip: HTMLButtonElement; heading: HTMLElement }[] = [];
    if (sections.length > 0) {
      partBar.appendChild(help(() => tr(t.sectionsHelp)));
      sticky.appendChild(partBar);
    }

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
          s.edit.highlight !== undefined ? highlightName(s.edit) : undefined,
        ].filter((p) => p !== undefined);
        const where = s.at.added ? ` (${tr(t.addedBadge)})` : '';
        const when = format(t.seconds, { s: formatSeconds(s.at.time) });
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

    type Row = { e: Event; row: HTMLElement; refresh: () => void };
    const rows: Row[] = [];
    const headings: { heading: HTMLElement; rows: HTMLElement[] }[] = [];
    const sectionOf = (e: Event): Section | undefined =>
      sections.filter((s) => s.line < (e.lineNumber ?? 0)).pop();
    const sectionOfRow = new Map<Event, Section | undefined>();
    let lastSection: Section | undefined | null = null;
    let currentSection: Section | undefined;
    let open: { r: Row; panel: HTMLElement } | undefined;

    const fileHeader = parent.closest('.trigger-file-container')
      ?.querySelector<HTMLElement>(':scope > .trigger-file-header');
    const goTo = (heading: HTMLElement) => {
      heading.scrollIntoView({ block: 'start' });
      const s = heading.closest('.config-scroll');
      // offsetHeight, unlike rects, is in the page's own pixels whatever its scale.
      if (s !== null)
        s.scrollTop -= (fileHeader?.offsetHeight ?? 0) + sticky.offsetHeight + 4;
    };

    for (const e of events) {
      if (!isAdded(e))
        currentSection = sectionOf(e);
      sectionOfRow.set(e, currentSection);
      if (sections.length > 0 && currentSection !== lastSection) {
        lastSection = currentSection;
        const title = currentSection === undefined
          ? tr(t.start)
          : `${currentSection.title} · ${
            format(t.from, { time: formatSeconds(currentSection.time) })
          }`;
        const heading = make('div', 'config-tl-section', title);
        list.appendChild(heading);
        headings.push({ heading: heading, rows: [] });
        const chip = make('button', 'config-tl-part', currentSection?.title ?? tr(t.start));
        chip.onclick = () => goTo(heading);
        partBar.appendChild(chip);
        partChips.push({ chip: chip, heading: heading });
      }

      const row = make('div', 'config-tl-row');
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-expanded', 'false');
      headings[headings.length - 1]?.rows.push(row);
      const time = make('span', 'config-tl-time', formatSeconds(e.time));
      const name = make('span', 'config-tl-name');
      const shown = make('span', 'config-tl-shown');
      const was = make('span', 'config-tl-was');
      name.append(shown, was);
      const same = sameName.get(e.name) ?? [];
      if (same.length > 1)
        name.appendChild(make('span', 'config-tl-dup', `#${same.indexOf(e) + 1}/${same.length}`));
      if (isAdded(e)) {
        const job = addedInfo.get(e)?.job;
        const badge = job !== undefined ? ctx.jobName(job) : tr(t.addedBadge);
        name.appendChild(make('span', 'config-tl-badge', badge));
      }
      const state = make('span', 'config-tl-state');
      const jobChip = make('span', 'config-tl-badge', isJob ? ctx.jobName(layer) : '');
      const hiddenChip = make('span', 'config-tl-hidden-chip', tr(t.hidden));
      const dot = make('span', 'config-tl-dot');
      state.append(jobChip, hiddenChip, dot);
      row.append(time, name, state);
      list.appendChild(row);

      const refresh = () => {
        const text = shownText(e);
        shown.textContent = text;
        was.textContent = text !== e.text ? `← ${e.text}` : '';
        const color = paletteColor(palette, effective(e).highlight, effective(e).color);
        row.style.setProperty('--config-tl-color', color ?? 'transparent');
        dot.classList.toggle('config-hidden', color === undefined);
        row.classList.toggle('config-tl-highlighted', color !== undefined);
        row.classList.toggle('config-tl-hidden', isHidden(e));
        hiddenChip.classList.toggle('config-hidden', !isHidden(e));
        jobChip.classList.toggle('config-hidden', !isJob || isEmpty(edit(e)));
        row.classList.toggle('config-tl-edited', isEdited(e));
      };
      refresh();
      const r: Row = { e: e, row: row, refresh: refresh };
      rows.push(r);
    }
    list.appendChild(empty);

    const updateCount = () => {
      const n = events.filter(isEdited).length;
      count.textContent = n > 0 ? n.toString() : '';
    };
    updateCount();

    const save = (e: Event, value: Edit) => {
      const current = own.state.get(e);
      const key = entryKey(e.time, e.name, isAdded(e));
      // A moved edit is saved again at its entry's new time.
      if (current !== undefined && current.key !== key)
        ctx.set([...layerPath(layer), current.key], '');
      ctx.set([...layerPath(layer), key], toSaved(value));
      own.state.set(e, { edit: value, key: key });
      updateCount();
    };
    const rebuild = () => {
      entriesPane.replaceChildren();
      buildEntries(entriesPane);
    };

    // ---- An open entry ----
    const buildPanel = (r: Row): HTMLElement => {
      const { e } = r;
      const panel = make('div', 'config-tl-panel');
      const notes = make('div', 'config-tl-notes');
      const note = (text: string, cls?: string) => notes.appendChild(make('p', cls, text));
      const section = sectionOfRow.get(e);
      if (section !== undefined)
        note(format(t.offset, { s: formatSeconds(e.time - section.time) }));
      if (isAdded(e)) {
        const job = addedInfo.get(e)?.job;
        if (job !== undefined)
          note(format(t.addedJobNote, { job: ctx.jobName(job) }));
        else
          note(tr(isJob ? t.addedCommonNote : t.addedNote));
      }
      if (baseText(e) !== e.text)
        note(format(t.renamed, { text: baseText(e) }));
      if (hiddenByName(e))
        note(tr(t.hiddenByName), 'config-tl-warn');
      const key = own.state.get(e)?.key;
      const at = key !== undefined ? parseEntryKey(key) : undefined;
      if (at !== undefined && Math.abs(at.time - e.time) > 0.001)
        note(format(t.moved, { time: formatSeconds(at.time) }), 'config-tl-warn');
      if (notes.childElementCount > 0)
        panel.appendChild(notes);

      // Text (for an entry added here, its time, text and duration), and hidden.
      const line = make('div', 'config-tl-panel-line');
      panel.appendChild(line);
      const field = (label: LocaleText, cls: string, value: string, placeholder?: string) => {
        const wrap = make('label', `config-tl-field ${cls}`);
        wrap.appendChild(make('span', 'config-tl-field-label', tr(label)));
        const input = make('input');
        input.type = 'text';
        input.value = value;
        if (placeholder !== undefined)
          input.placeholder = placeholder;
        wrap.appendChild(input);
        line.appendChild(wrap);
        return input;
      };
      let textInput: HTMLInputElement;
      if (isOwnAdded(e)) {
        const index = addedInfo.get(e)?.index ?? -1;
        const saved = asObject(addRows()[index]);
        const timeInput = field(
          t.time,
          'config-tl-f-time',
          typeof saved.time === 'string' ? saved.time : '',
        );
        textInput = field(t.text, 'config-tl-f-text', e.text);
        const durationInput = field(
          t.duration,
          'config-tl-f-duration',
          typeof saved.duration === 'string' ? saved.duration : '',
        );
        const update = (change: { [key: string]: string }): boolean => {
          const before = entryKey(e.time, e.name, true);
          writeAddRows((all) => {
            const target = all[index];
            if (target !== undefined)
              Object.assign(target, change);
          });
          const a = addedRow(addRows()[index]);
          if (a === undefined)
            return false;
          e.time = a.time;
          e.name = a.text;
          e.text = a.text;
          const after = entryKey(e.time, e.name, true);
          if (after !== before) {
            moveKeys(before, after);
            reload();
          }
          return true;
        };
        textInput.oninput = () => {
          if (update({ text: textInput.value }))
            r.refresh();
        };
        durationInput.oninput = () => update({ duration: durationInput.value });
        // A new time puts the entry in its place.
        timeInput.onchange = () => {
          if (update({ time: timeInput.value }))
            rebuild();
        };
        const remove = make('button', 'config-tl-remove', tr(t.remove));
        remove.onclick = () => {
          moveKeys(entryKey(e.time, e.name, true));
          writeAddRows((all) => all.splice(index, 1));
          openId = undefined;
          rebuild();
        };
        line.appendChild(remove);
      } else {
        const inherited = () => commonEdit(e).text ?? baseText(e);
        textInput = field(t.shownText, 'config-tl-f-text', edit(e).text ?? '', inherited());
        // Starts from what it is now when edited (see prefillFromDefault).
        textInput.classList.add('config-tl-text');
        textInput.oninput = () => {
          const value = textInput.value === inherited() ? undefined : textInput.value;
          save(e, { ...edit(e), text: value });
          r.refresh();
          refreshPanel();
        };
      }
      const hide = make('button', 'config-tl-hide');
      hide.disabled = hiddenByName(e);
      hide.onclick = () => {
        const hidden = !isHidden(e);
        const inheritedHide = commonEdit(e).hide === true;
        const value = isJob ? (hidden === inheritedHide ? undefined : hidden) : hidden || undefined;
        save(e, { ...edit(e), hide: value });
        r.refresh();
        refreshPanel();
      };
      line.appendChild(hide);

      // Highlight: none, the colors (and for a job, as common).
      const colorLine = make('div', 'config-tl-panel-line config-tl-pick-line');
      colorLine.appendChild(make('span', 'config-tl-field-label', tr(t.highlight)));
      const picks: { button: HTMLButtonElement; value: string | undefined }[] = [];
      const pick = (button: HTMLButtonElement, value: string | undefined) => {
        button.onclick = () => {
          let highlight = value;
          if (value === '')
            highlight = isJob && commonEdit(e).highlight !== undefined ? kNoHighlight : undefined;
          save(e, { ...edit(e), highlight: highlight, color: undefined });
          r.refresh();
          refreshPanel();
        };
        picks.push({ button: button, value: value });
        colorLine.appendChild(button);
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
        swatch.title = colorName(p);
        swatch.setAttribute('aria-label', colorName(p));
        pick(swatch, p.id);
      }
      const pickName = make('span', 'config-tl-pick-name');
      colorLine.appendChild(pickName);
      panel.appendChild(colorLine);

      // Actions.
      const actions = make('div', 'config-tl-panel-line config-tl-actions');
      const same = sameName.get(e.name) ?? [];
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
        actions.appendChild(all);
      }
      const reset = make('button', 'config-tl-action', tr(t.reset));
      reset.onclick = () => {
        save(e, {});
        textInput.value = '';
        r.refresh();
        refreshPanel();
      };
      if (isJob && !isOwnAdded(e))
        actions.appendChild(reset);
      panel.appendChild(actions);

      const refreshPanel = () => {
        const mine = edit(e);
        const hidden = isHidden(e);
        hide.textContent = hidden ? `⦸ ${tr(t.hidden)}` : `👁 ${tr(t.shown)}`;
        hide.classList.toggle('config-active', hidden);
        hide.setAttribute('aria-pressed', hidden ? 'true' : 'false');
        let current: string | undefined;
        if (mine.highlight === undefined)
          current = inherits ? undefined : '';
        else
          current = mine.highlight === kNoHighlight ? '' : highlightId(mine.highlight);
        for (const { button, value } of picks)
          button.classList.toggle('config-active', value === current);
        pickName.textContent = highlightName(effective(e));
        reset.classList.toggle('config-hidden', isEmpty(mine));
        const anyAction = [...actions.children].some((c) => !c.classList.contains('config-hidden'));
        actions.classList.toggle('config-hidden', !anyAction);
      };
      refreshPanel();

      panel.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Escape')
          return;
        ev.stopPropagation();
        close();
        r.row.focus();
      });
      return panel;
    };

    const unmark = () => {
      if (open === undefined)
        return;
      open.panel.remove();
      open.r.row.classList.remove('config-tl-open');
      open.r.row.setAttribute('aria-expanded', 'false');
    };
    const close = () => {
      unmark();
      open = undefined;
      openId = undefined;
    };
    const openRow = (r: Row) => {
      unmark();
      const panel = buildPanel(r);
      r.row.after(panel);
      r.row.classList.add('config-tl-open');
      r.row.setAttribute('aria-expanded', 'true');
      open = { r: r, panel: panel };
      openId = idOf(r.e);
    };
    const toggle = (r: Row) => {
      if (open?.r === r)
        close();
      else
        openRow(r);
    };
    for (const r of rows)
      r.row.onclick = () => toggle(r);

    // ---- Colors ----
    const refreshAll = () => {
      for (const r of rows)
        r.refresh();
      if (open !== undefined)
        openRow(open.r);
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
          const builtIn = palette.find((c) => c.id === p.id && !c.custom);
          const color = hex.value.trim();
          if (isHexColor(color) && (p.custom || color.toLowerCase() !== builtIn?.color))
            value.color = color;
          if (name.value.trim() !== '')
            value.name = name.value.trim();
          ctx.setColor(p.id, Object.keys(value).length > 0 ? value : '');
          palette = readPalette(ctx.getColors());
          dot.style.backgroundColor = palette.find((c) => c.id === p.id)?.color ?? p.color;
          refreshAll();
        };
        name.oninput = store;
        hex.oninput = () => {
          hex.classList.toggle('config-invalid', !isHexColor(hex.value.trim()));
          if (isHexColor(hex.value.trim()))
            store();
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
      showMenu(false);
      colorsOpen = !colorsOpen;
      colorsButton.classList.toggle('config-active', colorsOpen);
      colorsBox.classList.toggle('config-hidden', !colorsOpen);
      if (colorsOpen)
        buildColors();
    };
    if (colorsOpen)
      buildColors();

    // ---- Keyboard: up and down move between entries (an open one follows), Enter opens ----
    const visibleRows = () => rows.filter((x) => !x.row.classList.contains('config-hidden'));
    list.addEventListener('keydown', (ev) => {
      const r = rows.find((x) => x.row === ev.target);
      if (r === undefined)
        return;
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        toggle(r);
        return;
      }
      if (ev.key === 'Escape') {
        close();
        return;
      }
      if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp')
        return;
      ev.preventDefault();
      const shown = visibleRows();
      const target = shown[shown.indexOf(r) + (ev.key === 'ArrowDown' ? 1 : -1)];
      if (target === undefined)
        return;
      const following = open !== undefined;
      target.row.focus();
      if (following)
        openRow(target);
      target.row.scrollIntoView({ block: 'nearest' });
    });

    // ---- Filters ----
    const filter = () => {
      const query = filters.query.trim().toLowerCase();
      let shown = 0;
      for (const { e, row } of rows) {
        const hit = (query === '' ||
          `${e.text} ${e.name} ${shownText(e)}`.toLowerCase().includes(query)) &&
          (!filters.onlyEdited || isEdited(e));
        row.classList.toggle('config-hidden', !hit);
        if (hit)
          shown++;
        else if (open?.r.row === row)
          close();
      }
      for (const { heading, rows } of headings) {
        const none = rows.every((x) => x.classList.contains('config-hidden'));
        heading.classList.toggle('config-hidden', none);
      }
      empty.classList.toggle('config-hidden', shown > 0);
    };
    search.oninput = () => {
      filters.query = search.value;
      filter();
    };
    search.onkeydown = (ev) => {
      if (ev.key !== 'Enter')
        return;
      ev.preventDefault();
      visibleRows()[0]?.row.focus();
    };
    editedOnly.onclick = () => {
      filters.onlyEdited = !filters.onlyEdited;
      editedOnly.classList.toggle('config-active', filters.onlyEdited);
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
      if (from !== '') {
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
    // A new entry at the time in view, opened to type its text.
    const topRow = (): Row | undefined => {
      const bottom = sticky.getBoundingClientRect().bottom;
      return visibleRows().find((x) => x.row.getBoundingClientRect().bottom > bottom);
    };
    addButton.onclick = () => {
      const at = topRow()?.e.time ?? 0;
      let index = 0;
      writeAddRows((all) => {
        const added: { [key: string]: SavedConfigEntry } = {
          time: formatSeconds(at),
          text: tr(t.newEntry),
          duration: '',
        };
        if (layer !== '')
          added.job = layer;
        index = all.push(added) - 1;
      });
      openId = `A${index}`;
      focusText = true;
      filters.query = '';
      filters.onlyEdited = false;
      rebuild();
    };

    // ---- The bar stays under the fight's header; the part in view is marked ----
    sticky.style.top = `${fileHeader?.offsetHeight ?? 0}px`;
    onScroll = () => {
      sticky.style.top = `${fileHeader?.offsetHeight ?? 0}px`;
      if (partChips.length === 0)
        return;
      const bottom = sticky.getBoundingClientRect().bottom + 8;
      let current = partChips[0];
      for (const p of partChips) {
        const visible = !p.heading.classList.contains('config-hidden');
        if (visible && p.heading.getBoundingClientRect().top <= bottom)
          current = p;
      }
      for (const p of partChips) {
        const active = p === current;
        if (active && !p.chip.classList.contains('config-active'))
          partBar.scrollLeft = p.chip.offsetLeft - 40;
        p.chip.classList.toggle('config-active', active);
      }
    };
    listenScroll();
    onScroll();

    // The entry open before a rebuild.
    const reopen = openId !== undefined ? rows.find((x) => idOf(x.e) === openId) : undefined;
    if (reopen !== undefined) {
      openRow(reopen);
      reopen.row.scrollIntoView({ block: 'center' });
      const input = open?.panel.querySelector<HTMLInputElement>('.config-tl-f-text input');
      if (focusText) {
        input?.focus();
        input?.select();
      } else {
        reopen.row.focus();
      }
    } else {
      openId = undefined;
    }
    focusText = false;
  };

  entriesButton.onclick = () => {
    if (entriesStale) {
      entriesPane.replaceChildren();
      buildEntries(entriesPane);
    }
    entriesStale = false;
    showPane(true);
  };
  byNameButton.onclick = () => {
    if (!byNameBuilt)
      ctx.buildByName(byNamePane);
    byNameBuilt = true;
    entriesStale = true;
    showPane(false);
  };
  entriesButton.click();
};
