import { jobLocalizedFull } from '../../resources/party';
import { SavedConfigEntry } from '../../types/event';
import { Job } from '../../types/job';
import { LocaleText } from '../../types/trigger';
import { setTooltip } from '../config/config_tooltip';

import {
  entryKey,
  highlightColor,
  isHexColor,
  kEditJobs,
  kEntryMoveSeconds,
  kNoHighlight,
  matchEdits,
  parseEntryKey,
} from './timeline_entries';
import { Event, TimelineParser } from './timeline_parser';

// Fork: the config page's timeline editor (the new style; the original page keeps the original
// one): each entry of a fight's timeline with its own text, hidden or not, and highlight, for
// everyone or for one job, next to the original edits by name and the added entries.  See
// timeline_entries.ts.

export type AddedRow = { time: number; text: string };
// An added entry's time or text changed (or it was removed), so its edits go with it.
export type AddedRowChange = (before: AddedRow, after?: AddedRow) => void;

// An added entry's row as processPerZoneTimelineConfig reads it, if it is one.
export const addedRow = (row: SavedConfigEntry): AddedRow | undefined => {
  if (typeof row !== 'object' || Array.isArray(row))
    return undefined;
  const time = typeof row.time === 'string' ? parseFloat(row.time) : NaN;
  const text = typeof row.text === 'string' ? row.text : '';
  return isNaN(time) || text.trim() === '' ? undefined : { time: time, text: text };
};

export type TimelineEditorContext = {
  // The fight's timeline as in its file (no user edits), and its text.
  timeline: TimelineParser;
  text: string;
  translate: (text: LocaleText) => string;
  // The fight's saved timeline config: 'entries', 'jobEntries', 'globalReplace', 'enable', 'add'.
  get: (path: string[]) => SavedConfigEntry;
  set: (path: string[], value: SavedConfigEntry) => void;
  // The original editors: by name (hide, rename) and added entries.
  buildByName: (parent: HTMLElement) => void;
  buildAdded: (parent: HTMLElement, onRowChange: AddedRowChange) => void;
};

type Edit = { text?: string; hide?: boolean; highlight?: string; color?: string };

// The edits for everyone ('') or for a job.
type Layer = string;

const t = {
  entries: { en: 'Each entry', ko: '항목별 편집' },
  byName: { en: 'By name', ko: '이름별' },
  added: { en: 'Added entries', ko: '항목 추가' },
  time: { en: 'Time (s)', ko: '시간(초)' },
  original: { en: 'Timeline', ko: '타임라인' },
  text: { en: 'Shown as', ko: '표시 문구' },
  hide: { en: 'Hide', ko: '숨기기' },
  highlight: { en: 'Highlight', ko: '강조' },
  search: { en: 'Find an ability', ko: '기술 이름으로 찾기' },
  editedOnly: { en: 'Edited only', ko: '편집한 것만' },
  edits: { en: '${n} edited', ko: '편집 ${n}개' },
  layer: { en: 'Edits for', ko: '편집 대상' },
  common: { en: 'Everyone', ko: '공통 (모든 직업)' },
  layerTip: {
    en:
      'Edits for a job go over the common ones for players of that job, each of text, hidden and highlight on its own. The overlay picks them by your job.',
    ko: '직업 편집은 그 직업일 때 공통 편집 위에 덮어씁니다(문구·숨기기·강조 각각). 오버레이가 지금 직업에 맞춰 자동으로 고릅니다.',
  },
  copyFrom: { en: 'Copy from…', ko: '다른 편집 가져오기…' },
  copyFromTip: {
    en: 'Copies another job\'s (or the common) edits here.  Entries already edited here stay.',
    ko: '다른 직업(또는 공통)의 편집을 여기로 복사합니다. 여기서 이미 편집한 항목은 그대로 둡니다.',
  },
  same: { en: '${i} of ${n} with this name', ko: '같은 이름 ${n}개 중 ${i}번째' },
  applyAll: { en: 'All ${n}', ko: '${n}개 모두' },
  applyAllTip: {
    en: 'Gives every entry with this name this highlight.',
    ko: '같은 이름의 모든 항목에 이 강조를 적용합니다.',
  },
  moved: { en: 'Moved from ${time}s', ko: '${time}초에서 옮겨짐' },
  movedTip: {
    en: 'The timeline changed: this edit was made for the entry at ${time}s, and follows it here.',
    ko: '타임라인이 바뀌어서, ${time}초에 있던 항목에 했던 편집이 이 항목으로 따라왔습니다.',
  },
  addedBadge: { en: 'Added', ko: '직접 추가' },
  addedTip: {
    en: 'An entry from "Added entries", where its time and text are changed.',
    ko: '"항목 추가"에서 넣은 항목입니다. 시간과 문구는 거기서 바꿉니다.',
  },
  addedGroup: { en: 'Added entries', ko: '직접 추가한 항목' },
  renamed: { en: 'By name: ${text}', ko: '이름별: ${text}' },
  renamedTip: {
    en: 'Renamed in "By name" for every entry with this name.  Text here goes over it.',
    ko: '"이름별"에서 이 이름의 모든 항목을 바꾼 문구입니다. 여기서 쓴 문구가 그보다 먼저입니다.',
  },
  hiddenByName: { en: 'Hidden by name', ko: '이름별로 숨김' },
  hiddenByNameTip: {
    en: 'Hidden in "By name" with every entry of this name.  Show it there to edit this.',
    ko: '"이름별"에서 이 이름의 모든 항목을 숨겼습니다. 거기서 다시 켜야 여기서 바꿀 수 있습니다.',
  },
  start: { en: 'Start', ko: '시작' },
  branch: { en: 'Branch from ${time}s', ko: '분기 · ${time}초부터' },
  branchTip: {
    en:
      'The timeline jumps between its parts as the fight goes (e.g. by the boss\'s pattern), so times are where entries are in the timeline file, not times in the fight.  "+s" is from the start of the part.',
    ko:
      '타임라인은 전투 진행(보스 패턴 등)에 따라 구간 사이를 건너뛰므로, 시간은 전투 경과 시간이 아니라 타임라인 파일 안의 위치입니다. "+초"는 구간 시작부터의 시간입니다.',
  },
  inherit: { en: 'Common: ${what}', ko: '공통: ${what}' },
  reset: { en: 'Use common', ko: '공통으로' },
  resetTip: {
    en: 'Removes this job\'s edit of this entry, so the common one applies.',
    ko: '이 항목의 직업 편집을 지우고 공통 편집을 따릅니다.',
  },
  lost: { en: 'Edits whose entry is no longer in the timeline', ko: '타임라인에서 찾을 수 없는 편집' },
  lostTip: {
    en:
      'The timeline was updated and these entries are gone (or moved more than ${s}s). They do nothing: remove them, or make them again on the right entries.',
    ko: '타임라인이 업데이트되면서 이 항목들이 없어졌거나 ${s}초 넘게 옮겨졌습니다. 지금은 적용되지 않으니, 지우거나 맞는 항목에 다시 편집해 주세요.',
  },
  remove: { en: 'Remove', ko: '지우기' },
  none: { en: 'None', ko: '없음' },
  danger: { en: '🔴 Danger', ko: '🔴 위험' },
  caution: { en: '🟡 Caution', ko: '🟡 주의' },
  mitigation: { en: '🔵 Mitigation', ko: '🔵 생존기' },
  note: { en: '🟣 Note', ko: '🟣 메모' },
  custom: { en: '🎨 Color…', ko: '🎨 직접 고르기' },
  hidden: { en: 'hidden', ko: '숨김' },
  shown: { en: 'shown', ko: '보임' },
  noMatch: { en: 'No entry matches.', ko: '일치하는 항목이 없습니다.' },
  seconds: { en: '${s}s', ko: '${s}초' },
  tank: { en: 'Tanks', ko: '탱커' },
  healer: { en: 'Healers', ko: '힐러' },
  melee: { en: 'Melee', ko: '근거리 딜러' },
  ranged: { en: 'Physical ranged', ko: '원거리 물리 딜러' },
  caster: { en: 'Casters', ko: '원거리 마법 딜러' },
} as const;

const kHighlights: [string, LocaleText][] = [
  ['danger', t.danger],
  ['caution', t.caution],
  ['mitigation', t.mitigation],
  ['note', t.note],
  ['custom', t.custom],
];

const highlightLabel = (highlight?: string): LocaleText =>
  kHighlights.find(([h]) => h === highlight)?.[1] ?? t.none;

const kSwatches = [
  '#ff5c5c',
  '#ff9f43',
  '#ffc24a',
  '#7bed9f',
  '#4fc3ff',
  '#5c7cff',
  '#b79bff',
  '#ff7ac6',
];

const kLayerStorageKey = 'cactbot-config-timeline-layer';

const formatSeconds = (seconds: number): string => parseFloat(seconds.toFixed(1)).toString();

const asEdit = (value: SavedConfigEntry | undefined): Edit => {
  if (typeof value !== 'object' || Array.isArray(value))
    return {};
  const edit: Edit = {};
  if (typeof value.text === 'string' && value.text !== '')
    edit.text = value.text;
  if (typeof value.hide === 'boolean')
    edit.hide = value.hide;
  if (typeof value.highlight === 'string' && value.highlight !== '') {
    edit.highlight = value.highlight;
    if (typeof value.color === 'string')
      edit.color = value.color;
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

const asObject = (value: SavedConfigEntry): { [key: string]: SavedConfigEntry } =>
  typeof value === 'object' && !Array.isArray(value) ? value : {};

// The timeline's parts: its start and each label (a jump destination), titled by the comment
// above the label if there is one.
type Section = { line: number; time?: number; title: string };

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

  const editor = document.createElement('div');
  editor.classList.add('config-tl-editor');
  parent.appendChild(editor);

  // Tabs: each entry, by name and added entries (built when first shown).  The entries are
  // rebuilt on coming back from the others, which change what they show.
  const tabs = document.createElement('div');
  tabs.classList.add('config-view-switch', 'config-tl-tabs');
  editor.appendChild(tabs);
  const panes: HTMLElement[] = [];
  const addTab = (label: LocaleText, build: (pane: HTMLElement) => void, rebuild: boolean) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = tr(label);
    tabs.appendChild(button);
    const pane = document.createElement('div');
    pane.classList.add('config-tl-pane');
    editor.appendChild(pane);
    panes.push(pane);
    let built = false;
    let shown = false;
    button.onclick = () => {
      if (!built || rebuild && !shown) {
        pane.replaceChildren();
        build(pane);
        built = true;
      }
      shown = true;
      for (const [i, p] of panes.entries()) {
        p.classList.toggle('config-hidden', p !== pane);
        tabs.children[i]?.classList.toggle('config-active', p === pane);
      }
    };
    return {
      button: button,
      leave: () => shown = false,
    };
  };

  // Filters and the edited layer stay as the entries are rebuilt.
  const filters = { query: '', onlyEdited: false };
  let layer: Layer = '';
  try {
    layer = window.localStorage.getItem(kLayerStorageKey) ?? '';
  } catch {
    // The common edits then.
  }
  if (layer !== '' && !kEditJobs.some((r) => r.jobs.includes(layer as Job)))
    layer = '';

  const onAddedChange: AddedRowChange = (before, after) => {
    const from = entryKey(before.time, before.text, true);
    const to = after !== undefined ? entryKey(after.time, after.text, true) : undefined;
    if (from === to)
      return;
    const layers = ['', ...Object.keys(asObject(ctx.get(['jobEntries'])))];
    for (const l of layers) {
      const path = l === '' ? ['entries'] : ['jobEntries', l];
      const saved = asObject(ctx.get(path));
      const value = saved[from];
      if (value === undefined || value === '')
        continue;
      if (to !== undefined && (saved[to] === undefined || saved[to] === ''))
        ctx.set([...path, to], value);
      ctx.set([...path, from], '');
    }
  };

  const entriesTab = addTab(t.entries, (pane) => buildEntries(pane), true);
  const byNameTab = addTab(t.byName, ctx.buildByName, false);
  const addedTab = addTab(t.added, (pane) => ctx.buildAdded(pane, onAddedChange), false);
  for (const tab of [byNameTab, addedTab])
    tab.button.addEventListener('click', entriesTab.leave);

  const sections = findSections(ctx.text);

  const buildEntries = (pane: HTMLElement) => {
    // The timeline's own entries (hideall ones aside), then the added ones.
    const fileEvents = ctx.timeline.events.filter((e) =>
      e.lineNumber !== undefined && !(e.name in ctx.timeline.ignores)
    );
    const added = ctx.get(['add']);
    const addedEvents: Event[] = (Array.isArray(added) ? added : []).flatMap((row, i) => {
      const a = addedRow(row);
      if (a === undefined)
        return [];
      return [{ id: `+${i}`, time: a.time, name: a.text, text: a.text, activeTime: 0, sortKey: 0 }];
    }).sort((a, b) => a.time - b.time);
    const isAdded = (e: Event) => e.lineNumber === undefined;
    const events = [...addedEvents, ...fileEvents];

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
    const layerPath = (l: Layer) => l === '' ? ['entries'] : ['jobEntries', l];
    const loadLayer = (l: Layer) => {
      const saved = Object.entries(asObject(ctx.get(layerPath(l)))).flatMap(([key, value]) => {
        const at = parseEntryKey(key);
        const edit = asEdit(value);
        return at !== undefined && !isEmpty(edit) ? [{ key: key, at: at, edit: edit }] : [];
      });
      const matched = matchEdits(events, saved.map((s) => s.at));
      // Per entry: its edit and the key it is saved under (the original time if it moved).
      const state = new Map<Event, { edit: Edit; key: string }>();
      const lost: typeof saved = [];
      saved.forEach((s, i) => {
        const e = matched[i];
        if (e === undefined)
          lost.push(s);
        else
          state.set(e, { edit: s.edit, key: s.key });
      });
      return { state: state, lost: lost };
    };
    const common = loadLayer('');
    const own = layer === '' ? common : loadLayer(layer);
    const isJob = layer !== '';
    const edit = (e: Event): Edit => own.state.get(e)?.edit ?? {};
    const commonEdit = (e: Event): Edit => isJob ? common.state.get(e)?.edit ?? {} : {};

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

    // Toolbar: the edited layer, search, count, edited only, copy from.
    const toolbar = document.createElement('div');
    toolbar.classList.add('config-tl-toolbar');
    pane.appendChild(toolbar);

    const layerCount = (l: Layer) =>
      Object.values(asObject(ctx.get(layerPath(l)))).filter((v) => !isEmpty(asEdit(v))).length;
    const jobName = (job: string) => tr(jobLocalizedFull[job as Job] ?? { en: job });
    const layerName = (l: Layer) => l === '' ? tr(t.common) : jobName(l);
    const withCount = (l: Layer) => {
      const n = layerCount(l);
      return n > 0 ? `${layerName(l)} · ${n}` : layerName(l);
    };

    const layerSelect = document.createElement('select');
    layerSelect.classList.add('config-tl-layer');
    layerSelect.add(new Option(withCount(''), ''));
    for (const { role, jobs } of kEditJobs) {
      const group = document.createElement('optgroup');
      group.label = tr(t[role]);
      for (const job of jobs)
        group.appendChild(new Option(withCount(job), job));
      layerSelect.appendChild(group);
    }
    layerSelect.value = layer;
    layerSelect.onchange = () => {
      layer = layerSelect.value;
      try {
        window.localStorage.setItem(kLayerStorageKey, layer);
      } catch {
        // Only this page then.
      }
      pane.replaceChildren();
      buildEntries(pane);
    };
    const layerLabel = document.createElement('label');
    layerLabel.classList.add('config-tl-layer-label');
    layerLabel.append(tr(t.layer), layerSelect);
    setTooltip(layerLabel, () => tr(t.layerTip));

    const search = document.createElement('input');
    search.type = 'text';
    search.classList.add('config-tl-search');
    search.placeholder = tr(t.search);
    search.value = filters.query;
    const editedOnly = document.createElement('button');
    editedOnly.type = 'button';
    editedOnly.classList.add('config-changed-toggle');
    editedOnly.classList.toggle('config-active', filters.onlyEdited);
    const knob = document.createElement('span');
    knob.classList.add('config-mini-switch');
    editedOnly.append(knob, tr(t.editedOnly));
    const count = document.createElement('span');
    count.classList.add('config-tl-count');

    // Copy another layer's edits here, leaving the ones already here.
    const copy = document.createElement('select');
    copy.classList.add('config-tl-copy');
    copy.add(new Option(tr(t.copyFrom), ''));
    for (const l of ['', ...kEditJobs.flatMap((r) => r.jobs)]) {
      if (l !== layer && layerCount(l) > 0)
        copy.add(new Option(withCount(l), l));
    }
    copy.onchange = () => {
      const from = asObject(ctx.get(layerPath(copy.value)));
      const here = asObject(ctx.get(layerPath(layer)));
      for (const [key, value] of Object.entries(from)) {
        if (!isEmpty(asEdit(value)) && isEmpty(asEdit(here[key])))
          ctx.set([...layerPath(layer), key], value);
      }
      pane.replaceChildren();
      buildEntries(pane);
    };
    setTooltip(copy, () => tr(t.copyFromTip));
    toolbar.append(layerLabel, search, count, editedOnly);
    if (copy.options.length > 1)
      toolbar.appendChild(copy);

    const updateCount = () => {
      const n = [...own.state.values()].filter((s) => !isEmpty(s.edit)).length;
      count.textContent = n > 0 ? format(t.edits, { n: n }) : '';
    };

    // Edits that lost their entry.
    if (own.lost.length > 0) {
      const box = document.createElement('div');
      box.classList.add('config-tl-lost');
      const title = document.createElement('div');
      title.classList.add('config-tl-lost-title');
      title.textContent = `${tr(t.lost)} · ${own.lost.length}`;
      setTooltip(title, () => format(t.lostTip, { s: kEntryMoveSeconds }));
      box.appendChild(title);
      for (const s of own.lost) {
        const row = document.createElement('div');
        row.classList.add('config-tl-lost-row');
        const what = document.createElement('span');
        const parts = [
          s.edit.text,
          s.edit.hide !== undefined ? tr(s.edit.hide ? t.hidden : t.shown) : undefined,
          s.edit.highlight !== undefined ? tr(highlightLabel(s.edit.highlight)) : undefined,
        ].filter((p) => p !== undefined);
        const where = s.at.added ? ` (${tr(t.addedBadge)})` : '';
        const when = format(t.seconds, { s: formatSeconds(s.at.time) });
        what.textContent = `${when}  ${s.at.name}${where}  →  ${parts.join(' · ')}`;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = tr(t.remove);
        remove.onclick = () => {
          ctx.set([...layerPath(layer), s.key], '');
          row.remove();
          const left = box.querySelectorAll('.config-tl-lost-row').length;
          if (left === 0)
            box.remove();
          else
            title.textContent = `${tr(t.lost)} · ${left}`;
        };
        row.append(what, remove);
        box.appendChild(row);
      }
      pane.appendChild(box);
    }

    // The list.
    const list = document.createElement('div');
    list.classList.add('config-tl-list');
    list.classList.toggle('config-tl-job', isJob);
    pane.appendChild(list);
    const head = document.createElement('div');
    head.classList.add('config-tl-row', 'config-tl-head');
    for (const label of [t.time, t.original, t.text, t.hide, t.highlight]) {
      const cell = document.createElement('span');
      cell.textContent = tr(label);
      head.appendChild(cell);
    }
    list.appendChild(head);
    const empty = document.createElement('div');
    empty.classList.add('config-tl-empty', 'config-hidden');
    empty.textContent = tr(t.noMatch);

    // Part headings, for timelines with jumps.
    const headings: { heading: HTMLElement; rows: HTMLElement[] }[] = [];
    const addHeading = (title: string, tip?: () => string) => {
      const heading = document.createElement('div');
      heading.classList.add('config-tl-section');
      heading.textContent = title;
      if (tip !== undefined)
        setTooltip(heading, tip);
      list.appendChild(heading);
      headings.push({ heading: heading, rows: [] });
    };
    const sectionOf = (e: Event): Section | undefined =>
      e.lineNumber === undefined
        ? undefined
        : sections.filter((s) => s.line < (e.lineNumber ?? 0)).pop();
    let lastSection: Section | undefined | null = null;
    if (addedEvents.length > 0)
      addHeading(tr(t.addedGroup));

    const rows: { e: Event; row: HTMLElement; refresh: () => void }[] = [];
    for (const e of events) {
      if (!isAdded(e) && sections.length > 0) {
        const section = sectionOf(e);
        if (section !== lastSection) {
          lastSection = section;
          if (section === undefined)
            addHeading(tr(t.start));
          else
            addHeading(
              `${section.title} · ${format(t.branch, { time: formatSeconds(section.time ?? 0) })}`,
              () => tr(t.branchTip),
            );
        }
      } else if (!isAdded(e) && addedEvents.length > 0 && lastSection === null) {
        lastSection = undefined;
        addHeading(tr(t.start));
      }

      const row = document.createElement('div');
      row.classList.add('config-tl-row');
      headings[headings.length - 1]?.rows.push(row);
      const byName = hiddenByName(e);

      const time = document.createElement('span');
      time.classList.add('config-tl-time');
      time.textContent = formatSeconds(e.time);
      const section = sectionOf(e);
      if (section?.time !== undefined) {
        const offset = document.createElement('span');
        offset.classList.add('config-tl-offset');
        offset.textContent = `+${formatSeconds(e.time - section.time)}`;
        time.appendChild(offset);
      }

      const name = document.createElement('span');
      name.classList.add('config-tl-name');
      name.textContent = e.text;
      const note = (text: string, cls: string, tip?: () => string) => {
        const span = document.createElement('span');
        span.classList.add(cls);
        span.textContent = text;
        if (tip !== undefined)
          setTooltip(span, tip);
        name.appendChild(span);
      };
      if (isAdded(e))
        note(tr(t.addedBadge), 'config-tl-badge', () => tr(t.addedTip));
      const same = sameName.get(e.name) ?? [];
      if (same.length > 1)
        note(format(t.same, { i: same.indexOf(e) + 1, n: same.length }), 'config-tl-dup');
      if (baseText(e) !== e.text)
        note(format(t.renamed, { text: baseText(e) }), 'config-tl-dup', () => tr(t.renamedTip));
      if (byName)
        note(tr(t.hiddenByName), 'config-tl-moved', () => tr(t.hiddenByNameTip));
      const original = own.state.get(e)?.key;
      const at = original !== undefined ? parseEntryKey(original) : undefined;
      if (at !== undefined && Math.abs(at.time - e.time) > 0.001) {
        const was = formatSeconds(at.time);
        note(
          format(t.moved, { time: was }),
          'config-tl-moved',
          () => format(t.movedTip, { time: was }),
        );
      }

      // The shown text: starts from what it is now when edited (see prefillFromDefault).  An
      // added entry's own text is changed where it was added.
      const inherited = () => commonEdit(e).text ?? baseText(e);
      let text: HTMLElement;
      if (isAdded(e) && !isJob) {
        text = document.createElement('span');
        text.classList.add('config-tl-fixed');
        text.textContent = e.text;
        setTooltip(text, () => tr(t.addedTip));
      } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.classList.add('config-tl-text');
        input.placeholder = inherited();
        input.value = edit(e).text ?? '';
        input.oninput = () => {
          const value = input.value === inherited() ? undefined : input.value;
          save(e, { ...edit(e), text: value });
          refresh();
        };
        text = input;
      }

      const hide = document.createElement('input');
      hide.type = 'checkbox';
      hide.disabled = byName;
      if (byName)
        setTooltip(hide, () => tr(t.hiddenByNameTip));
      hide.onchange = () => {
        const inheritedHide = commonEdit(e).hide === true;
        const value = hide.checked === inheritedHide ? undefined : hide.checked;
        save(e, { ...edit(e), hide: isJob ? value : hide.checked || undefined });
        refresh();
      };

      const highlightCell = document.createElement('span');
      highlightCell.classList.add('config-tl-highlight');
      const select = document.createElement('select');
      if (isJob)
        select.add(new Option('', 'inherit'));
      select.add(new Option(tr(t.none), ''));
      for (const [value, label] of kHighlights)
        select.add(new Option(tr(label), value));
      // A custom color: a box for #rrggbb and a few swatches.
      const custom = document.createElement('span');
      custom.classList.add('config-tl-custom');
      const hex = document.createElement('input');
      hex.type = 'text';
      hex.classList.add('config-tl-hex');
      hex.placeholder = '#rrggbb';
      const setCustom = (color: string) => {
        save(e, { ...edit(e), highlight: 'custom', color: color });
        refresh();
      };
      hex.oninput = () => {
        const color = hex.value.trim();
        hex.classList.toggle('config-invalid', color !== '' && !isHexColor(color));
        if (isHexColor(color))
          setCustom(color);
      };
      const swatches = document.createElement('span');
      swatches.classList.add('config-tl-swatches');
      for (const color of kSwatches) {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.style.backgroundColor = color;
        swatch.title = color;
        swatch.onclick = () => {
          hex.value = color;
          hex.classList.remove('config-invalid');
          setCustom(color);
        };
        swatches.appendChild(swatch);
      }
      custom.append(hex, swatches);
      select.onchange = () => {
        const value = select.value;
        let highlight: string | undefined = value;
        let color: string | undefined;
        if (value === 'inherit')
          highlight = undefined;
        else if (value === '')
          highlight = isJob && commonEdit(e).highlight !== undefined ? kNoHighlight : undefined;
        else if (value === 'custom')
          color = isHexColor(hex.value) ? hex.value : kSwatches[0];
        if (color !== undefined)
          hex.value = color;
        save(e, { ...edit(e), highlight: highlight, color: color });
        refresh();
      };
      highlightCell.appendChild(select);
      // The same highlight for every entry with this name.
      if (same.length > 1) {
        const all = document.createElement('button');
        all.type = 'button';
        all.classList.add('config-tl-all');
        all.textContent = format(t.applyAll, { n: same.length });
        setTooltip(all, () => tr(t.applyAllTip));
        all.onclick = () => {
          const { highlight, color } = edit(e);
          for (const other of same) {
            if (other !== e)
              save(other, { ...edit(other), highlight: highlight, color: color });
          }
          for (const r of rows) {
            if (same.includes(r.e))
              r.refresh();
          }
        };
        highlightCell.appendChild(all);
      }
      // A job's edit of this entry back to the common one.
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.classList.add('config-tl-reset');
      reset.textContent = '↺';
      reset.setAttribute('aria-label', tr(t.reset));
      setTooltip(reset, () => tr(t.resetTip));
      reset.onclick = () => {
        save(e, {});
        if (text instanceof HTMLInputElement)
          text.value = '';
        refresh();
      };
      if (isJob)
        highlightCell.appendChild(reset);
      highlightCell.appendChild(custom);

      const refresh = () => {
        const mine = edit(e);
        const theirs = commonEdit(e);
        const effective = mine.highlight !== undefined ? mine : theirs;
        // In a job's edits: following the common highlight, or none when there is none (and
        // then no separate "none").
        if (isJob) {
          const [inheritOption, noneOption] = select.options;
          if (inheritOption !== undefined) {
            inheritOption.text = theirs.highlight === undefined
              ? tr(t.none)
              : format(t.inherit, { what: tr(highlightLabel(theirs.highlight)) });
          }
          if (noneOption !== undefined)
            noneOption.hidden = theirs.highlight === undefined;
        }
        select.value = mine.highlight === undefined
          ? (isJob ? 'inherit' : '')
          : mine.highlight === kNoHighlight
          ? ''
          : mine.highlight;
        if (mine.color !== undefined)
          hex.value = mine.color;
        const hidden = byName || (mine.hide ?? theirs.hide) === true;
        hide.checked = hidden;
        custom.classList.toggle('config-hidden', mine.highlight !== 'custom');
        reset.classList.toggle('config-hidden', isEmpty(mine));
        if (text instanceof HTMLInputElement)
          text.placeholder = inherited();
        const color = highlightColor(effective.highlight, effective.color);
        row.style.setProperty('--config-tl-color', color ?? 'transparent');
        row.classList.toggle('config-tl-highlighted', color !== undefined);
        row.classList.toggle('config-tl-hidden', hidden);
        row.classList.toggle('config-tl-edited', !isEmpty(mine));
      };
      refresh();

      row.append(time, name, text, hide, highlightCell);
      list.appendChild(row);
      rows.push({ e: e, row: row, refresh: refresh });
    }
    list.appendChild(empty);
    updateCount();

    // Filters.
    const filter = () => {
      const query = filters.query.trim().toLowerCase();
      let shown = 0;
      for (const { e, row } of rows) {
        const mine = edit(e);
        const hit = (query === '' ||
          `${e.text} ${e.name} ${baseText(e)} ${mine.text ?? ''}`.toLowerCase().includes(query)) &&
          (!filters.onlyEdited || !isEmpty(mine));
        row.classList.toggle('config-hidden', !hit);
        if (hit)
          shown++;
      }
      for (const { heading, rows } of headings)
        heading.classList.toggle(
          'config-hidden',
          rows.every((r) => r.classList.contains('config-hidden')),
        );
      empty.classList.toggle('config-hidden', shown > 0);
    };
    search.oninput = () => {
      filters.query = search.value;
      filter();
    };
    editedOnly.onclick = () => {
      filters.onlyEdited = !filters.onlyEdited;
      editedOnly.classList.toggle('config-active', filters.onlyEdited);
      filter();
    };
    filter();
  };

  entriesTab.button.click();
};
