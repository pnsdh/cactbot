import { SavedConfigEntry } from '../../types/event';
import { LocaleText } from '../../types/trigger';
import { setTooltip } from '../config/config_tooltip';

import {
  entryKey,
  highlightColor,
  isHexColor,
  kEntryMoveSeconds,
  matchEntries,
  parseEntryKey,
} from './timeline_entries';
import { Event, TimelineParser } from './timeline_parser';

// Fork: the config page's timeline editor (the new style; the original page keeps the original
// one): each entry of a fight's timeline with its own text, hidden or not, and highlight, next to
// the original edits by name and the added entries.  See timeline_entries.ts.

export type TimelineEditorContext = {
  zoneId: number;
  // The fight's timeline as in its file (no user edits).
  timeline: TimelineParser;
  translate: (text: LocaleText) => string;
  // The saved edits of single entries: { 'time|name': { text, hide, highlight, color } }.
  getEntries: () => SavedConfigEntry;
  setEntry: (key: string, value: SavedConfigEntry) => void;
  // The original editors: by name (hide, rename) and added entries.
  buildByName: (parent: HTMLElement) => void;
  buildAdded: (parent: HTMLElement) => void;
};

type Edit = { text?: string; hide?: boolean; highlight?: string; color?: string };

const t = {
  entries: { en: 'Each entry', ko: '항목별 편집' },
  byName: { en: 'By name', ko: '이름별' },
  added: { en: 'Added entries', ko: '항목 추가' },
  time: { en: 'Time', ko: '시간' },
  original: { en: 'Timeline', ko: '타임라인' },
  text: { en: 'Shown as', ko: '표시 문구' },
  hide: { en: 'Hide', ko: '숨기기' },
  highlight: { en: 'Highlight', ko: '강조' },
  search: { en: 'Find an ability', ko: '기술 이름으로 찾기' },
  editedOnly: { en: 'Edited only', ko: '편집한 것만' },
  edits: { en: '${n} edited', ko: '편집 ${n}개' },
  same: { en: '${i} of ${n} with this name', ko: '같은 이름 ${n}개 중 ${i}번째' },
  applyAll: { en: 'All ${n}', ko: '${n}개 모두' },
  applyAllTip: {
    en: 'Gives every entry with this name this highlight.',
    ko: '같은 이름의 모든 항목에 이 강조를 적용합니다.',
  },
  moved: { en: 'Moved from ${time}', ko: '${time}에서 옮겨짐' },
  movedTip: {
    en: 'The timeline changed: this edit was made for the entry at ${time}, and follows it here.',
    ko: '타임라인이 바뀌어서, ${time}에 있던 항목에 했던 편집이 이 항목으로 따라왔습니다.',
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
  noMatch: { en: 'No entry matches.', ko: '일치하는 항목이 없습니다.' },
} as const;

const highlightLabel = (
  highlight: string,
): LocaleText => ({
  danger: t.danger,
  caution: t.caution,
  mitigation: t.mitigation,
  note: t.note,
}[highlight] ??
  t.custom);

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

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${parseFloat(s.toFixed(1))}`;
};

const asEdit = (value: SavedConfigEntry | undefined): Edit => {
  if (typeof value !== 'object' || Array.isArray(value))
    return {};
  const edit: Edit = {};
  if (typeof value.text === 'string' && value.text !== '')
    edit.text = value.text;
  if (value.hide === true)
    edit.hide = true;
  if (typeof value.highlight === 'string' && value.highlight !== '') {
    edit.highlight = value.highlight;
    if (typeof value.color === 'string')
      edit.color = value.color;
  }
  return edit;
};

// Only what differs from the timeline is saved; nothing at all is an empty string.
const toSaved = (edit: Edit): SavedConfigEntry => {
  const out: { [key: string]: SavedConfigEntry } = {};
  if (edit.text !== undefined && edit.text !== '')
    out.text = edit.text;
  if (edit.hide === true)
    out.hide = true;
  if (edit.highlight !== undefined && edit.highlight !== '') {
    out.highlight = edit.highlight;
    if (edit.highlight === 'custom' && edit.color !== undefined)
      out.color = edit.color;
  }
  return Object.keys(out).length > 0 ? out : '';
};

const isEmpty = (edit: Edit) => toSaved(edit) === '';

export const buildTimelineEditor = (parent: HTMLElement, ctx: TimelineEditorContext): void => {
  const tr = (text: LocaleText) => ctx.translate(text);
  const format = (text: LocaleText, values: { [key: string]: string | number }) =>
    Object.entries(values).reduce((s, [k, v]) => s.replace(`\${${k}}`, v.toString()), tr(text));

  const editor = document.createElement('div');
  editor.classList.add('config-tl-editor');
  parent.appendChild(editor);

  // Tabs: each entry (built now), by name and added entries (built when first shown).
  const tabs = document.createElement('div');
  tabs.classList.add('config-view-switch', 'config-tl-tabs');
  editor.appendChild(tabs);
  const panes: HTMLElement[] = [];
  const addTab = (label: LocaleText, build?: (pane: HTMLElement) => void) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = tr(label);
    tabs.appendChild(button);
    const pane = document.createElement('div');
    pane.classList.add('config-tl-pane');
    editor.appendChild(pane);
    panes.push(pane);
    let built = build === undefined;
    button.onclick = () => {
      if (!built && build !== undefined) {
        build(pane);
        built = true;
      }
      for (const [i, p] of panes.entries()) {
        p.classList.toggle('config-hidden', p !== pane);
        tabs.children[i]?.classList.toggle('config-active', p === pane);
      }
    };
    return { button: button, pane: pane };
  };
  const entriesTab = addTab(t.entries);
  addTab(t.byName, ctx.buildByName);
  addTab(t.added, ctx.buildAdded);
  entriesTab.button.click();
  const pane = entriesTab.pane;

  // The timeline's own entries, as its file has them (hideall ones aside).
  const events = ctx.timeline.events.filter((e) =>
    e.lineNumber !== undefined && !(e.name in ctx.timeline.ignores)
  );
  const sameName = new Map<string, Event[]>();
  for (const e of events)
    sameName.set(e.name, [...sameName.get(e.name) ?? [], e]);

  // Saved edits, put on the entries they are for now.
  const saved = ctx.getEntries();
  const savedEdits = typeof saved === 'object' && !Array.isArray(saved)
    ? Object.entries(saved).flatMap(([key, value]) => {
      const at = parseEntryKey(key);
      const edit = asEdit(value);
      return at !== undefined && !isEmpty(edit) ? [{ key: key, at: at, edit: edit }] : [];
    })
    : [];
  const matched = matchEntries(events, savedEdits.map((s) => s.at));
  // Per entry: its edit and the key it is saved under (the original time if it moved).
  const state = new Map<Event, { edit: Edit; key?: string }>();
  const lost: typeof savedEdits = [];
  savedEdits.forEach((s, i) => {
    const e = matched[i];
    if (e === undefined)
      lost.push(s);
    else
      state.set(e, { edit: s.edit, key: s.key });
  });

  const save = (e: Event, edit: Edit) => {
    const current = state.get(e);
    const key = entryKey(e.time, e.name);
    // A moved edit is saved again at its entry's new time.
    if (current?.key !== undefined && current.key !== key)
      ctx.setEntry(current.key, '');
    ctx.setEntry(key, toSaved(edit));
    state.set(e, { edit: edit, key: key });
    updateCount();
  };

  // Toolbar: search, edited only, count.
  const toolbar = document.createElement('div');
  toolbar.classList.add('config-tl-toolbar');
  const search = document.createElement('input');
  search.type = 'text';
  search.classList.add('config-tl-search');
  search.placeholder = tr(t.search);
  const editedOnly = document.createElement('button');
  editedOnly.type = 'button';
  editedOnly.classList.add('config-changed-toggle');
  const knob = document.createElement('span');
  knob.classList.add('config-mini-switch');
  editedOnly.append(knob, tr(t.editedOnly));
  const count = document.createElement('span');
  count.classList.add('config-tl-count');
  toolbar.append(search, count, editedOnly);
  pane.appendChild(toolbar);
  const updateCount = () => {
    const n = [...state.values()].filter((s) => !isEmpty(s.edit)).length;
    count.textContent = n > 0 ? format(t.edits, { n: n }) : '';
  };

  // Edits that lost their entry.
  if (lost.length > 0) {
    const box = document.createElement('div');
    box.classList.add('config-tl-lost');
    const title = document.createElement('div');
    title.classList.add('config-tl-lost-title');
    title.textContent = `${tr(t.lost)} · ${lost.length}`;
    setTooltip(title, () => format(t.lostTip, { s: kEntryMoveSeconds }));
    box.appendChild(title);
    for (const s of lost) {
      const row = document.createElement('div');
      row.classList.add('config-tl-lost-row');
      const what = document.createElement('span');
      const parts = [
        s.edit.text,
        s.edit.hide === true ? tr(t.hidden) : undefined,
        s.edit.highlight !== undefined ? tr(highlightLabel(s.edit.highlight)) : undefined,
      ].filter((p) => p !== undefined);
      what.textContent = `${formatTime(s.at.time)}  ${s.at.name}  →  ${parts.join(' · ')}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = tr(t.remove);
      remove.onclick = () => {
        ctx.setEntry(s.key, '');
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

  const rows: { e: Event; row: HTMLElement; refresh: () => void }[] = [];
  const highlightChoices: [string, LocaleText][] = [
    ['', t.none],
    ['danger', t.danger],
    ['caution', t.caution],
    ['mitigation', t.mitigation],
    ['note', t.note],
    ['custom', t.custom],
  ];

  for (const e of events) {
    const row = document.createElement('div');
    row.classList.add('config-tl-row');
    const edit = (): Edit => state.get(e)?.edit ?? {};

    const time = document.createElement('span');
    time.classList.add('config-tl-time');
    time.textContent = formatTime(e.time);

    const name = document.createElement('span');
    name.classList.add('config-tl-name');
    name.textContent = e.text;
    const same = sameName.get(e.name) ?? [];
    if (same.length > 1) {
      const dup = document.createElement('span');
      dup.classList.add('config-tl-dup');
      dup.textContent = format(t.same, { i: same.indexOf(e) + 1, n: same.length });
      name.appendChild(dup);
    }
    const at = state.get(e);
    const original = at?.key !== undefined ? parseEntryKey(at.key) : undefined;
    if (original !== undefined && Math.abs(original.time - e.time) > 0.001) {
      const moved = document.createElement('span');
      moved.classList.add('config-tl-moved');
      moved.textContent = format(t.moved, { time: formatTime(original.time) });
      setTooltip(moved, () => format(t.movedTip, { time: formatTime(original.time) }));
      name.appendChild(moved);
    }

    // The shown text: starts from the timeline's when edited (see prefillFromDefault).
    const text = document.createElement('input');
    text.type = 'text';
    text.classList.add('config-tl-text');
    text.placeholder = e.text;
    text.value = edit().text ?? '';
    text.oninput = () => save(e, { ...edit(), text: text.value === e.text ? '' : text.value });

    const hide = document.createElement('input');
    hide.type = 'checkbox';
    hide.checked = edit().hide === true;
    hide.onchange = () => {
      save(e, { ...edit(), hide: hide.checked });
      refresh();
    };

    const highlightCell = document.createElement('span');
    highlightCell.classList.add('config-tl-highlight');
    const select = document.createElement('select');
    for (const [value, label] of highlightChoices) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = tr(label);
      select.appendChild(option);
    }
    select.value = edit().highlight ?? '';
    // A custom color: a box for #rrggbb and a few swatches.
    const custom = document.createElement('span');
    custom.classList.add('config-tl-custom');
    const hex = document.createElement('input');
    hex.type = 'text';
    hex.classList.add('config-tl-hex');
    hex.placeholder = '#rrggbb';
    hex.value = edit().color ?? '';
    hex.oninput = () => {
      const color = hex.value.trim();
      hex.classList.toggle('config-invalid', color !== '' && !isHexColor(color));
      if (isHexColor(color)) {
        save(e, { ...edit(), highlight: 'custom', color: color });
        refresh();
      }
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
        save(e, { ...edit(), highlight: 'custom', color: color });
        refresh();
      };
      swatches.appendChild(swatch);
    }
    custom.append(hex, swatches);
    select.onchange = () => {
      const color = select.value === 'custom'
        ? (isHexColor(hex.value) ? hex.value : kSwatches[0])
        : undefined;
      if (color !== undefined)
        hex.value = color;
      save(e, { ...edit(), highlight: select.value, color: color });
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
        const { highlight, color } = edit();
        for (const other of same) {
          if (other !== e)
            save(other, { ...state.get(other)?.edit ?? {}, highlight: highlight, color: color });
        }
        for (const r of rows) {
          if (same.includes(r.e))
            r.refresh();
        }
      };
      highlightCell.appendChild(all);
    }
    highlightCell.appendChild(custom);

    const refresh = () => {
      const current = edit();
      select.value = current.highlight ?? '';
      if (current.color !== undefined)
        hex.value = current.color;
      hide.checked = current.hide === true;
      custom.classList.toggle('config-hidden', current.highlight !== 'custom');
      const color = highlightColor(current.highlight, current.color);
      row.style.setProperty('--config-tl-color', color ?? 'transparent');
      row.classList.toggle('config-tl-highlighted', color !== undefined);
      row.classList.toggle('config-tl-hidden', current.hide === true);
      row.classList.toggle('config-tl-edited', !isEmpty(current));
    };
    refresh();

    row.append(time, name, text, hide, highlightCell);
    list.appendChild(row);
    rows.push({ e: e, row: row, refresh: refresh });
  }
  list.appendChild(empty);
  updateCount();

  // Filters.
  let onlyEdited = false;
  const filter = () => {
    const query = search.value.trim().toLowerCase();
    let shown = 0;
    for (const { e, row } of rows) {
      const hit = (query === '' ||
        `${e.text} ${e.name} ${state.get(e)?.edit.text ?? ''}`.toLowerCase().includes(query)) &&
        (!onlyEdited || !isEmpty(state.get(e)?.edit ?? {}));
      row.classList.toggle('config-hidden', !hit);
      if (hit)
        shown++;
    }
    empty.classList.toggle('config-hidden', shown > 0);
  };
  search.oninput = filter;
  editedOnly.onclick = () => {
    onlyEdited = !onlyEdited;
    editedOnly.classList.toggle('config-active', onlyEdited);
    filter();
  };
};
