import { SavedConfigEntry } from '../../types/event';
import { LocaleText } from '../../types/trigger';

import { DefaultValue, setDefault } from './config_dirty';
import { addTooltipsIn } from './config_rows';

// Fork: a browser over the trigger lists that raidboss_config.ts and oopsyraidsy_config.ts build
// (expansion > file > trigger rows): expansions and content types as chips, files as cards that
// open to a page of their own (triggers, timeline and options as tabs), and trigger search for
// config_tabs.ts.  Those build the lists as before and register each file here.

export type TriggerEntry = {
  id: string;
  // Lower case words to search: id, output text, comment.
  text: string;
  // Shown in search results, with its severity for the color.
  preview?: string;
  severity?: 'alarm' | 'alert' | 'info';
};

export type TriggerFile = {
  group: string;
  container: HTMLElement;
  title: string;
  type?: string;
  triggers: TriggerEntry[];
  // Saved config for the whole file (trigger set options, timeline edits).
  settings: FileSetting[];
};

// A saved config path, and the default its value is compared with (without one, see isChange).
export type FileSetting = { path: string[]; default?: DefaultValue };

type Context = {
  translate: (text: LocaleText) => string;
  readSaved: (group: string, path: string[]) => SavedConfigEntry | undefined;
  // Shows a section's trigger list.
  showTriggers: (group: string) => void;
  // Files were added (raidboss's load after the page shows).
  onTriggersChanged: () => void;
};

const kAll: LocaleText = { en: 'All', ko: '전체' };
const kChangedOnly: LocaleText = { en: 'Changed only', ko: '변경한 것만' };
const kTriggerCount: LocaleText = { en: '${n} triggers', ko: '트리거 ${n}' };
const kChangedCount: LocaleText = { en: '${n} changed', ko: '변경 ${n}' };
const kNoFiles: LocaleText = { en: 'Nothing to show.', ko: '표시할 전투가 없습니다.' };
const kNoChanged: LocaleText = { en: 'No fight has changes.', ko: '변경한 전투가 없습니다.' };
const kUserFiles: LocaleText = { en: 'User files', ko: '사용자 파일' };
const kContentType: LocaleText = { en: 'Content', ko: '콘텐츠' };
const kOtherType: LocaleText = { en: 'Other', ko: '기타' };
const kOpenAll: LocaleText = { en: 'Open all', ko: '모두 펼치기' };
const kCloseAll: LocaleText = { en: 'Close all', ko: '모두 접기' };
const kBack: LocaleText = { en: 'List', ko: '목록' };
const kTabTriggers: LocaleText = { en: 'Triggers', ko: '트리거' };
const kTabTimeline: LocaleText = { en: 'Timeline', ko: '타임라인' };
const kTabOptions: LocaleText = { en: 'Fight options', ko: '전투 옵션' };

// A file's page shows one of these at a time.
type PageTab = 'triggers' | 'timeline' | 'options';

// A fight's timeline, for its tab: how many entries (it is read when asked) and edits.
export type TimelineInfo = { size: () => number; edits: () => number };
const timelines = new WeakMap<HTMLElement, TimelineInfo>();
export const describeTimeline = (container: HTMLElement, info: TimelineInfo): void => {
  timelines.set(container, info);
};

const files: { [group: string]: TriggerFile[] } = {};
const browsers: {
  [group: string]: {
    showFile: (file: TriggerFile) => void;
    openFile: (file: TriggerFile, tab?: PageTab) => void;
  };
} = {};
let context: Context = {
  translate: (text) => text.en,
  readSaved: () => undefined,
  showTriggers: () => undefined,
  onTriggersChanged: () => undefined,
};

export const setTriggerBrowserContext = (value: Partial<Context>): void => {
  context = { ...context, ...value };
};

export const triggerCount = (group: string): number =>
  (files[group] ?? []).reduce((n, f) => n + f.triggers.length, 0);

const stripTags = (html: string): string => html.replace(/<[^>]*>/g, '');

export const registerTriggerFile = (
  group: string,
  container: HTMLElement,
  title: string,
  type: string | undefined,
  triggers: TriggerEntry[],
  settings: FileSetting[] = [],
): void => {
  for (const setting of settings) {
    if (setting.default !== undefined)
      setDefault(group, setting.path, setting.default);
  }
  (files[group] ??= []).push({
    group: group,
    container: container,
    title: stripTags(title),
    type: type,
    triggers: triggers,
    settings: settings,
  });
};

// Anything saved other than empty boxes, "default" and shown timeline entries (true) counts as a
// change.  A config edited by hand could have null too.
const isChange = (entry: SavedConfigEntry | null | undefined, shown = false): boolean => {
  if (entry === undefined || entry === null || entry === true && shown)
    return false;
  if (typeof entry === 'string')
    return entry !== '' && entry !== 'default';
  if (typeof entry === 'object')
    return Object.entries(entry).some(([key, value]) => isChange(value, shown || key === 'enable'));
  return true;
};

// A value saved for an option with a known default: empty is the default too.
const differs = (entry: SavedConfigEntry | null | undefined, value: string): boolean => {
  if (entry === undefined || entry === null || entry === '')
    return false;
  if (typeof entry === 'object')
    return isChange(entry);
  return entry.toString() !== value;
};

const settingChanged = (file: TriggerFile, setting: FileSetting): boolean => {
  const saved = context.readSaved(file.group, setting.path);
  if (setting.default === undefined)
    return isChange(saved);
  return differs(
    saved,
    typeof setting.default === 'function' ? setting.default() : setting.default,
  );
};

const changedTriggers = (file: TriggerFile): number =>
  file.triggers.filter((t) => isChange(context.readSaved(file.group, ['triggers', t.id]))).length;

const timelineOf = (file: TriggerFile): TimelineInfo | undefined => {
  const container = file.container.querySelector<HTMLElement>(
    ':scope > .timeline-edit-container:not(.config-trigger-group)',
  );
  return container !== null ? timelines.get(container) : undefined;
};

// What a page's tab has changed: each timeline edit (or, without a count of them, whether there
// are any), or the set's options.
const changedIn = (file: TriggerFile, tab: PageTab): number => {
  if (tab === 'triggers')
    return changedTriggers(file);
  const timeline = tab === 'timeline' ? timelineOf(file) : undefined;
  if (timeline !== undefined)
    return timeline.edits();
  return file.settings.filter((s) =>
    (s.path[0] === 'timeline') === (tab === 'timeline') && settingChanged(file, s)
  ).length;
};

// A card's count, as its page's tabs add up.
const changedCount = (file: TriggerFile): number =>
  changedIn(file, 'options') + changedIn(file, 'triggers') + changedIn(file, 'timeline');

const format = (text: LocaleText, n: number): string =>
  context.translate(text).replace('${n}', n.toLocaleString());

const storageKey = (group: string) => `cactbot-config-expansion-${group}`;
const changedKey = (group: string) => `cactbot-config-changed-${group}`;

const storageGet = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const storageSet = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Only a convenience.
  }
};

const makeChip = (label: string, count?: number): HTMLButtonElement => {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.classList.add('config-chip');
  chip.textContent = label;
  if (count !== undefined) {
    const n = document.createElement('span');
    n.classList.add('config-chip-count');
    n.textContent = count.toString();
    chip.appendChild(n);
  }
  return chip;
};

const makeKeyboardButton = (element: HTMLElement): void => {
  element.tabIndex = 0;
  element.setAttribute('role', 'button');
  element.addEventListener('keydown', (e) => {
    if (e.target !== element || e.key !== 'Enter' && e.key !== ' ')
      return;
    element.click();
    e.preventDefault();
  });
};

// Output strings (and timeline renames) start from their default text when edited, so a small
// change needs no retyping.  Left as it was, the box goes back to empty (the default) unsaved.
const kPrefilled = '.trigger-outputstring > input, .timeline-text-edit, .config-tl-text';
const prefillFromDefault = (root: HTMLElement): void => {
  root.addEventListener('focusin', (e) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || !input.matches(kPrefilled))
      return;
    if (input.value !== '' || input.placeholder === '')
      return;
    input.value = input.placeholder;
    input.dataset.prefilled = '';
  });
  root.addEventListener('input', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.dataset.prefilled !== undefined)
      e.target.dataset.prefilled = 'edited';
  });
  root.addEventListener('focusout', (e) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || input.dataset.prefilled === undefined)
      return;
    const edited = input.dataset.prefilled === 'edited';
    delete input.dataset.prefilled;
    if (input.value !== input.placeholder)
      return;
    input.value = '';
    // Edited back to the default text: saved as the default (empty), not as that text.
    if (edited)
      input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const isUserSection = (label: string): boolean => /[\\/]|\.js$/.test(label);

// Finds a trigger's row in an open file, as either config builds it.
const findTriggerRow = (file: TriggerFile, id: string): HTMLElement | undefined => {
  for (const row of file.container.querySelectorAll<HTMLElement>('.trigger')) {
    const label = row.querySelector('.trigger-id')?.textContent ?? row.firstChild?.textContent;
    if (label === id)
      return row;
  }
  return undefined;
};

// A file's trigger list (or an overridden set's warning), boxed as its timeline edits are: the
// triggers tab of its page (see buildTriggerBrowser).
const groupTriggers = (file: TriggerFile): void => {
  const options = file.container.querySelector<HTMLElement>(':scope > .trigger-file-options');
  if (options === null)
    return;
  const overridden = options.querySelector('.trigger-set-override-warning') !== null;
  if (file.triggers.length === 0 && !overridden)
    return;
  const group = document.createElement('div');
  group.classList.add('timeline-edit-container', 'config-trigger-group');
  options.before(group);
  group.appendChild(options);
};

const openTriggerRow = (row: HTMLElement, open: boolean): void => {
  row.classList.toggle('config-trigger-open', open);
  row.querySelector('.config-trigger-line > .trigger-id')
    ?.setAttribute('aria-expanded', open ? 'true' : 'false');
};

// A file's trigger rows as single lines (the trigger, what it says, its output, whether it was
// changed), each opened to the rest of its settings: open, a file of many triggers was a page of
// forms many screens long.
const compactTriggers = (file: TriggerFile): void => {
  const options = file.container.querySelector<HTMLElement>('.trigger-file-options');
  if (options === null || options.classList.contains('config-compact'))
    return;
  const rows = [...options.querySelectorAll<HTMLElement>(':scope > .trigger')];
  if (rows.length === 0)
    return;
  const entries = new Map(file.triggers.map((t) => [t.id, t]));
  // Rows with more to open, and "open all" for them.
  const openable: HTMLElement[] = [];
  const all = document.createElement('button');
  all.type = 'button';
  const updateAll = () => {
    const open = openable.every((r) => r.classList.contains('config-trigger-open'));
    all.textContent = context.translate(open ? kCloseAll : kOpenAll);
  };
  all.onclick = () => {
    const open = !openable.every((r) => r.classList.contains('config-trigger-open'));
    for (const row of openable)
      openTriggerRow(row, open);
    updateAll();
  };
  let compacted = false;
  for (const row of rows) {
    const details = row.nextElementSibling;
    if (!(details instanceof HTMLElement) || !details.classList.contains('trigger-details'))
      continue;
    // Oopsy's rows have the trigger's id as text: it gets an element as raidboss's has.
    let id = row.querySelector<HTMLElement>('.trigger-id');
    if (id === null) {
      const text = row.firstChild;
      if (!(text instanceof Text))
        continue;
      id = document.createElement('div');
      id.classList.add('trigger-id');
      id.textContent = text.textContent;
      text.replaceWith(id);
    }
    compacted = true;
    const line = document.createElement('div');
    line.classList.add('config-trigger-line');
    const entry = entries.get(id.textContent ?? '');
    const dot = document.createElement('span');
    dot.classList.add('config-trigger-dot');
    const preview = document.createElement('span');
    preview.classList.add('config-trigger-preview');
    if (entry?.severity !== undefined)
      preview.classList.add(`config-trigger-${entry.severity}`);
    preview.textContent = entry?.preview ?? '';
    line.append(id, dot, preview);
    // Its output (shown, muted, ...) can be changed without opening it.
    const output = details.querySelector<HTMLElement>(':scope > .trigger-options');
    if (output !== null)
      line.appendChild(output);
    row.prepend(line);
    const update = () => {
      const changed = entry !== undefined &&
        isChange(context.readSaved(file.group, ['triggers', entry.id]));
      row.classList.toggle('config-trigger-changed', changed);
    };
    update();
    details.addEventListener('input', update);
    details.addEventListener('change', update);
    output?.addEventListener('change', update);
    // Nothing more (as oopsy's, whose only setting is the output): nothing to open.
    if (details.childElementCount === 0 && row.querySelector('.comment') === null) {
      row.classList.add('config-trigger-plain');
      continue;
    }
    openable.push(row);
    // Its name is the button that opens it (the row holds the output's select).
    id.tabIndex = 0;
    id.setAttribute('role', 'button');
    openTriggerRow(row, false);
    const toggle = () => {
      openTriggerRow(row, !row.classList.contains('config-trigger-open'));
      updateAll();
    };
    row.addEventListener('click', (e) => {
      if (e.target instanceof Element && e.target.closest('select, input, button, a') !== null)
        return;
      toggle();
    });
    id.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ')
        return;
      e.preventDefault();
      toggle();
    });
  }
  if (!compacted)
    return;
  options.classList.add('config-compact');
  if (openable.length > 0) {
    updateAll();
    const tools = document.createElement('div');
    tools.classList.add('config-trigger-tools');
    tools.appendChild(all);
    options.prepend(tools);
  }
};

export const buildTriggerBrowser = (group: string, groupDiv: HTMLElement): void => {
  const list = files[group] ?? [];
  const expansions = [...groupDiv.children].filter((e): e is HTMLElement =>
    e instanceof HTMLElement && e.classList.contains('trigger-expansion-container')
  );
  // The original page keeps the original lists.
  if (expansions.length === 0 || document.documentElement.classList.contains('config-classic'))
    return;
  groupDiv.classList.add('config-trigger-browser');

  const fileOf = new Map<HTMLElement, TriggerFile>(list.map((f) => [f.container, f]));
  const changed = new Map<TriggerFile, number>();
  // A user file's section is its path: its cards say which file they are from.
  const userFileOf = new Map<HTMLElement, string>();
  for (const container of expansions) {
    const label = container.querySelector('.trigger-expansion-header')?.textContent ?? '';
    if (!isUserSection(label))
      continue;
    for (const child of container.children) {
      if (child instanceof HTMLElement && child.classList.contains('trigger-file-container'))
        userFileOf.set(child, label.split(/[\\/]/).pop() ?? label);
    }
  }
  for (const file of list) {
    const header = file.container.querySelector<HTMLElement>(':scope > .trigger-file-header');
    if (header === null)
      continue;
    const meta = document.createElement('div');
    meta.classList.add('config-file-meta');
    header.appendChild(meta);
    const update = () => {
      const n = changedCount(file);
      changed.set(file, n);
      // Files with only a timeline or trigger set options have no count.
      const count = file.triggers.length > 0
        ? format(kTriggerCount, file.triggers.length)
        : undefined;
      // Parts of their own: a fight's page shows its counts on its tabs instead.
      const parts: [string, string | undefined][] = [
        ['config-file-type', file.type ?? userFileOf.get(file.container)],
        ['config-file-count', count],
        ['config-file-changed', n > 0 ? format(kChangedCount, n) : undefined],
      ];
      meta.replaceChildren();
      for (const [className, text] of parts) {
        if (text === undefined)
          continue;
        const span = document.createElement('span');
        span.classList.add(className);
        span.textContent = meta.childElementCount > 0 ? ` · ${text}` : text;
        meta.appendChild(span);
      }
    };
    update();
    groupTriggers(file);
    file.container.addEventListener('change', update);
    file.container.addEventListener('input', update);
    // Timeline rows are removed with a button, saving without an input event.
    file.container.addEventListener('click', update);
  }
  // Headers that open things can be reached and used with the keyboard.
  for (
    const header of groupDiv.querySelectorAll<HTMLElement>(
      '.trigger-file-header, .timeline-edit-header',
    )
  )
    makeKeyboardButton(header);

  prefillFromDefault(groupDiv);

  // Fights' own options explain themselves in tooltips, as top level options do.
  for (const file of list)
    addTooltipsIn(file.container, context.translate);

  // Expansions (one per section; user files are put together) are tabs of a kind, content types
  // are filters within one, and "changed only" is a switch of its own on the right.
  type Expansion = { label: string; key: string; containers: HTMLElement[] };
  const groups: Expansion[] = [];
  let userGroup: Expansion | undefined;
  for (const container of expansions) {
    const label = container.querySelector('.trigger-expansion-header')?.textContent ?? '';
    container.classList.remove('collapsed');
    if (isUserSection(label)) {
      if (userGroup === undefined) {
        userGroup = { label: context.translate(kUserFiles), key: 'user', containers: [] };
        groups.push(userGroup);
      }
      userGroup.containers.push(container);
      continue;
    }
    groups.push({ label: label, key: label, containers: [container] });
  }

  const filesIn = (expansion: Expansion) =>
    expansion.containers.flatMap((c) =>
      [...c.children].filter((e): e is HTMLElement =>
        e instanceof HTMLElement && e.classList.contains('trigger-file-container')
      )
    );

  // Within an expansion, files are put together by content type under headings.
  const headings: { heading: HTMLElement; type: string | undefined; files: HTMLElement[] }[] = [];
  for (const container of expansions) {
    const byType = new Map<string | undefined, HTMLElement[]>();
    for (
      const file of [...container.children].filter((e): e is HTMLElement =>
        e instanceof HTMLElement && e.classList.contains('trigger-file-container')
      )
    ) {
      const t = fileOf.get(file)?.type;
      byType.set(t, [...byType.get(t) ?? [], file]);
    }
    if (byType.size < 2)
      continue;
    for (const [t, files] of byType) {
      const heading = document.createElement('div');
      heading.classList.add('config-type-heading');
      heading.textContent = t ?? context.translate(kOtherType);
      const n = document.createElement('span');
      n.textContent = files.length.toString();
      heading.appendChild(n);
      container.append(heading, ...files);
      headings.push({ heading: heading, type: t, files: files });
    }
  }

  const toolbar = document.createElement('div');
  toolbar.classList.add('config-trigger-toolbar');
  const expansionRow = document.createElement('div');
  expansionRow.classList.add('config-segments');
  const typeRow = document.createElement('div');
  typeRow.classList.add('config-chips');
  const typeChips = document.createElement('div');
  typeChips.classList.add('config-chips-list');
  const typeLabel = document.createElement('span');
  typeLabel.classList.add('config-chips-label');
  typeLabel.textContent = context.translate(kContentType);
  const changedToggle = document.createElement('button');
  changedToggle.type = 'button';
  changedToggle.classList.add('config-changed-toggle');
  changedToggle.setAttribute('role', 'switch');
  const knob = document.createElement('span');
  knob.classList.add('config-mini-switch');
  changedToggle.append(knob, context.translate(kChangedOnly));
  typeRow.append(typeLabel, typeChips, changedToggle);
  const empty = document.createElement('div');
  empty.classList.add('config-trigger-empty');
  empty.textContent = context.translate(kNoFiles);
  toolbar.append(expansionRow, typeRow);
  groupDiv.prepend(toolbar);
  groupDiv.appendChild(empty);

  let current = groups[0];
  let type: string | undefined;
  // "Changed only" stays as it was left.
  let changedOnly = storageGet(changedKey(group)) === '1';

  const apply = () => {
    let shown = 0;
    for (const expansion of groups) {
      const active = expansion === current;
      for (const container of expansion.containers)
        container.classList.toggle('config-active', active);
      if (!active)
        continue;
      for (const container of filesIn(expansion)) {
        const file = fileOf.get(container);
        // The page shown is never filtered out.
        const hit = container.classList.contains('config-page') ||
          (type === undefined || file?.type === type) &&
            (!changedOnly || file !== undefined && (changed.get(file) ?? 0) > 0);
        container.classList.toggle('config-filter-miss', !hit);
        if (hit)
          shown++;
      }
    }
    // Headings only when all types show, and only over files that do.
    for (const { heading, files } of headings) {
      const any = files.some((f) => !f.classList.contains('config-filter-miss'));
      heading.classList.toggle('config-hidden', type !== undefined || !any);
    }
    changedToggle.classList.toggle('config-active', changedOnly);
    changedToggle.setAttribute('aria-checked', changedOnly ? 'true' : 'false');
    empty.textContent = context.translate(changedOnly ? kNoChanged : kNoFiles);
    empty.classList.toggle('config-hidden', shown > 0);
  };

  const buildTypeChips = () => {
    typeChips.replaceChildren();
    const counts = new Map<string, number>();
    const containers = current !== undefined ? filesIn(current) : [];
    for (const container of containers) {
      const t = fileOf.get(container)?.type;
      if (t !== undefined)
        counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const chips: [HTMLButtonElement, string | undefined][] = [
      [makeChip(context.translate(kAll), containers.length), undefined],
    ];
    if (counts.size > 1) {
      for (const [t, n] of counts)
        chips.push([makeChip(t, n), t]);
    }
    if (type !== undefined && !counts.has(type))
      type = undefined;
    for (const [chip, t] of chips) {
      chip.classList.toggle('config-active', t === type);
      chip.onclick = () => {
        type = t;
        buildTypeChips();
        apply();
      };
      typeChips.appendChild(chip);
    }
    typeRow.classList.toggle('config-chips-single', counts.size < 2);
  };
  changedToggle.onclick = () => {
    changedOnly = !changedOnly;
    storageSet(changedKey(group), changedOnly ? '1' : '0');
    apply();
  };

  const expansionChips = new Map<Expansion, HTMLButtonElement>();
  const selectExpansion = (expansion: Expansion) => {
    current = expansion;
    for (const [e, chip] of expansionChips)
      chip.classList.toggle('config-active', e === expansion);
    storageSet(storageKey(group), expansion.key);
    buildTypeChips();
    apply();
  };
  for (const expansion of groups) {
    const chip = makeChip(expansion.label);
    chip.onclick = () => selectExpansion(expansion);
    expansionChips.set(expansion, chip);
    expansionRow.appendChild(chip);
  }

  // The last saved expansion, or else the latest one ("x.x" in its name).
  const saved = storageGet(storageKey(group));
  const initial = groups.find((e) => saved !== null && e.key === saved) ??
    [...groups].reverse().find((e) => /\d\.x\)/.test(e.label)) ??
    groups[0];
  if (initial !== undefined)
    selectExpansion(initial);

  // The trigger count on the section's switch (see config_tabs.ts).
  const count = groupDiv.closest('.overlay-container')?.querySelector('.config-view-count');
  if (count)
    count.textContent = triggerCount(group).toLocaleString();
  context.onTriggersChanged();

  // ---- A file opens to a page of its own, not among the other cards: its header (with the way
  // back) on top, then its options, triggers or timeline as tabs.  The page shown last comes
  // back with the config page. ----
  type Page = {
    file: TriggerFile;
    header: HTMLElement;
    panels: Map<PageTab, HTMLElement>;
    tabs: Map<PageTab, HTMLButtonElement>;
    update: () => void;
  };
  const kTabNames: { [tab in PageTab]: LocaleText } = {
    options: kTabOptions,
    triggers: kTabTriggers,
    timeline: kTabTimeline,
  };
  const pageKey = `cactbot-config-page-${group}`;
  const tabKey = `cactbot-config-page-tab-${group}`;
  const pages = new Map<TriggerFile, Page>();
  let page: Page | undefined;
  let listScroll = 0;
  // Set while a file's header is clicked for its own toggle (see below).
  let toggling = false;
  // A page's timeline tab shown when the page itself isn't (one restored while loading): its
  // editor is built once it shows.
  const unbuilt = new Map<HTMLElement, HTMLElement>();
  const buildPanel = (panel: HTMLElement) => {
    if (!panel.classList.contains('collapsed'))
      return;
    panel.querySelector<HTMLElement>(':scope > .timeline-edit-header')?.click();
    panel.classList.remove('collapsed');
  };
  const watcher = typeof ResizeObserver === 'undefined'
    ? undefined
    : new ResizeObserver((entries) => {
      for (const entry of entries) {
        const panel = unbuilt.get(entry.target as HTMLElement);
        if (panel === undefined || entry.contentRect.height === 0)
          continue;
        unbuilt.delete(entry.target as HTMLElement);
        watcher?.unobserve(entry.target);
        buildPanel(panel);
      }
    });
  const scroller = () => groupDiv.closest<HTMLElement>('.config-scroll');

  const makeButton = (className: string, text: string, onclick: () => void) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.classList.add(className);
    button.textContent = text;
    // Not the header's click, which opens and closes the file.
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      onclick();
    });
    return button;
  };

  const showTab = (p: Page, tab: PageTab) => {
    for (const [t, panel] of p.panels) {
      const shown = t === tab;
      panel.classList.toggle('config-page-shown', shown);
      const button = p.tabs.get(t);
      button?.classList.toggle('config-active', shown);
      button?.setAttribute('aria-selected', shown ? 'true' : 'false');
    }
    // Never folded in a page; the timeline editor is built when first opened, and not while
    // the page is out of sight.
    const panel = p.panels.get(tab);
    if (panel !== undefined) {
      if (tab === 'timeline' && groupDiv.offsetParent === null && watcher !== undefined) {
        unbuilt.set(p.file.container, panel);
        watcher.observe(p.file.container);
      } else {
        buildPanel(panel);
      }
    }
    storageSet(tabKey, tab);
  };

  const leavePage = (p: Page) => {
    p.file.container.classList.remove('config-page');
    p.file.container.classList.add('collapsed');
    p.header.setAttribute('role', 'button');
    p.header.tabIndex = 0;
  };

  const closePage = () => {
    if (page === undefined)
      return;
    const header = page.header;
    leavePage(page);
    page = undefined;
    groupDiv.classList.remove('config-page-open');
    storageSet(pageKey, '');
    // Its changes may change what the list shows ("changed only").
    apply();
    const s = scroller();
    if (s !== null)
      s.scrollTop = listScroll;
    if (header.offsetParent !== null)
      header.focus({ preventScroll: true });
  };

  const buildPage = (file: TriggerFile, header: HTMLElement): Page => {
    const container = file.container;
    const panels = new Map<PageTab, HTMLElement>();
    const triggers = container.querySelector<HTMLElement>(':scope > .config-trigger-group');
    const timeline = container.querySelector<HTMLElement>(
      ':scope > .timeline-edit-container:not(.config-trigger-group)',
    );
    const options = container.querySelector<HTMLElement>(':scope > .overlay-options');
    // Its options first: what is changed most.
    if (options !== null)
      panels.set('options', options);
    if (triggers !== null)
      panels.set('triggers', triggers);
    if (timeline !== null)
      panels.set('timeline', timeline);
    const timelineInfo = timeline !== null ? timelines.get(timeline) : undefined;

    const back = makeButton('config-page-back', context.translate(kBack), () => closePage());
    const tabBar = document.createElement('div');
    tabBar.classList.add('config-page-tabs');
    tabBar.setAttribute('role', 'tablist');
    // One part only (oopsy's triggers): no tabs.
    tabBar.classList.toggle('config-hidden', panels.size < 2);
    const p: Page = {
      file: file,
      header: header,
      panels: panels,
      tabs: new Map(),
      update: () => undefined,
    };
    for (const tab of panels.keys()) {
      const button = makeButton('config-page-tab', '', () => showTab(p, tab));
      button.setAttribute('role', 'tab');
      p.tabs.set(tab, button);
      tabBar.appendChild(button);
    }
    // Its name, how many triggers or entries, and how many were changed.
    p.update = () => {
      for (const [tab, button] of p.tabs) {
        button.replaceChildren(context.translate(kTabNames[tab]));
        const size = tab === 'triggers'
          ? file.triggers.length
          : tab === 'timeline'
          ? timelineInfo?.size()
          : undefined;
        if (size !== undefined) {
          const n = document.createElement('span');
          n.classList.add('config-page-tab-count');
          n.textContent = size.toLocaleString();
          button.appendChild(n);
        }
        const changed = changedIn(file, tab);
        if (changed > 0) {
          const mark = document.createElement('span');
          mark.classList.add('config-page-tab-changed');
          mark.textContent = format(kChangedCount, changed);
          button.appendChild(mark);
        }
      }
    };
    container.addEventListener('change', p.update);
    container.addEventListener('input', p.update);
    container.addEventListener('click', p.update);
    // Appended (the header's first part is styled as its first child).
    header.append(back, tabBar);
    return p;
  };

  // Its options first, unless a tab is asked for, or it comes back as it was left.
  const openPage = (file: TriggerFile, tab?: PageTab, restore = false) => {
    const header = file.container.querySelector<HTMLElement>(':scope > .trigger-file-header');
    if (header === null)
      return;
    const s = scroller();
    if (page === undefined && s !== null)
      listScroll = s.scrollTop;
    else if (page !== undefined && page.file !== file)
      leavePage(page);
    // Its own toggle builds its triggers the first time (an event of its own: click() does
    // nothing while the header's click, e.g. by the keyboard, is still being handled).
    if (file.container.classList.contains('collapsed')) {
      toggling = true;
      header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      toggling = false;
    }
    compactTriggers(file);
    const p = pages.get(file) ?? buildPage(file, header);
    pages.set(file, p);
    page = p;
    file.container.classList.add('config-page');
    // Not hidden by the list's filters (as when it comes back with "changed only" on).
    file.container.classList.remove('config-filter-miss');
    groupDiv.classList.add('config-page-open');
    // Not a button while it is the page's header.
    header.removeAttribute('role');
    header.tabIndex = -1;
    const wanted = tab ?? (restore ? storageGet(tabKey) : null);
    const tabs = [...p.panels.keys()];
    showTab(p, tabs.find((t) => t === wanted) ?? tabs[0] ?? 'options');
    p.update();
    storageSet(pageKey, `${list.indexOf(file)}|${file.title}`);
    if (s !== null)
      s.scrollTop = 0;
  };

  for (const file of list) {
    const header = file.container.querySelector<HTMLElement>(':scope > .trigger-file-header');
    if (header === null)
      continue;
    // A card's header opens its page, and does nothing on its page; this comes before the
    // header's own toggle (which only runs for openPage).
    file.container.addEventListener('click', (e) => {
      if (toggling || !(e.target instanceof Element))
        return;
      // Its buttons (on a page) stop the click themselves.
      if (
        e.target.closest('.trigger-file-header') !== header || e.target.closest('button') !== null
      )
        return;
      e.stopPropagation();
      if (page?.file !== file)
        openPage(file);
    }, true);
  }

  // Esc (but not in a box, where it undoes the typing) and the mouse's back button go back.
  const visible = () => page !== undefined && groupDiv.offsetParent !== null;
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || !visible())
      return;
    if (
      e.target instanceof Element &&
      e.target.closest('input[type="text"], input[type="number"], input:not([type]), textarea') !==
        null
    )
      return;
    closePage();
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button !== 3 || !visible())
      return;
    e.preventDefault();
    closePage();
  });

  browsers[group] = {
    showFile: (file: TriggerFile) => {
      const expansion = groups.find((e) => e.containers.some((c) => c.contains(file.container)));
      type = undefined;
      changedOnly = false;
      storageSet(changedKey(group), '0');
      if (expansion !== undefined)
        selectExpansion(expansion);
    },
    openFile: (file, tab) => openPage(file, tab),
  };

  // The page shown last: the same file if the list is as it was, or else one of that name.
  const last = storageGet(pageKey) ?? '';
  const bar = last.indexOf('|');
  const lastTitle = bar >= 0 ? last.slice(bar + 1) : last;
  const atIndex = bar >= 0 ? list[parseInt(last.slice(0, bar))] : undefined;
  const lastFile = lastTitle === ''
    ? undefined
    : atIndex?.title === lastTitle
    ? atIndex
    : list.find((f) => f.title === lastTitle);
  if (lastFile !== undefined) {
    const expansion = groups.find((e) => e.containers.some((c) => c.contains(lastFile.container)));
    if (expansion !== undefined && expansion !== current)
      selectExpansion(expansion);
    openPage(lastFile, undefined, true);
  }
};

export type TriggerHit = { file: TriggerFile; trigger?: TriggerEntry };

// Files whose title matches, then triggers whose id, output or comment matches, latest
// expansions first (files are registered oldest first).
export const searchTriggers = (
  query: string,
  limit: number,
): { hits: TriggerHit[]; total: number } => {
  const hits: TriggerHit[] = [];
  let total = 0;
  const add = (hit: TriggerHit) => {
    total++;
    if (hits.length < limit)
      hits.push(hit);
  };
  // Raidboss before oopsy, whichever registered first.
  const groups = Object.keys(files).sort((a, b) =>
    (b === 'raidboss' ? 1 : 0) - (a === 'raidboss' ? 1 : 0)
  );
  const ordered = groups.map((group) => [...files[group] ?? []].reverse());
  for (const list of ordered) {
    for (const file of list) {
      if (file.title.toLowerCase().includes(query))
        add({ file: file });
    }
  }
  for (const list of ordered) {
    for (const file of list) {
      for (const trigger of file.triggers) {
        if (trigger.text.includes(query))
          add({ file: file, trigger: trigger });
      }
    }
  }
  return { hits: hits, total: total };
};

const flash = (elements: HTMLElement[]): void => {
  for (const element of elements) {
    element.classList.remove('config-flash');
    // Restart the animation.
    void element.offsetWidth;
    element.classList.add('config-flash');
  }
};

export const revealTrigger = (hit: TriggerHit): void => {
  const { file, trigger } = hit;
  context.showTriggers(file.group);
  browsers[file.group]?.showFile(file);
  browsers[file.group]?.openFile(file, trigger !== undefined ? 'triggers' : undefined);
  const header = file.container.querySelector<HTMLElement>(':scope > .trigger-file-header');
  const row = trigger !== undefined ? findTriggerRow(file, trigger.id) : undefined;
  if (row === undefined) {
    flash([file.container]);
    return;
  }
  openTriggerRow(row, true);
  // The row's top goes right under the file's header, which stays on top while open (rows with
  // many output strings are taller than the page, so centering them would hide their name).
  row.scrollIntoView({ block: 'start' });
  const scroller = row.closest('.config-scroll');
  if (scroller !== null && header !== null)
    // offsetHeight, unlike rects, is in the page's own pixels whatever its scale.
    scroller.scrollTop -= header.offsetHeight + 8;
  const details = row.nextElementSibling;
  flash(details instanceof HTMLElement ? [row, details] : [row]);
  const name = row.querySelector<HTMLElement>('.config-trigger-line > .trigger-id');
  if (name !== null && name.tabIndex >= 0)
    name.focus({ preventScroll: true });
};
