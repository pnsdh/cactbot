import { SavedConfigEntry } from '../../types/event';
import { LocaleText } from '../../types/trigger';

import { DefaultValue, setDefault } from './config_dirty';
import { addTooltipsIn } from './config_rows';

// Fork: a browser over the trigger lists that raidboss_config.ts and oopsyraidsy_config.ts build
// (expansion > file > trigger rows): expansions and content types as chips, files as cards that
// open in place, and trigger search for config_tabs.ts.  Those build the lists as before and
// register each file here.

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
const kTriggerGroup: LocaleText = { en: 'Edit Triggers', ko: '트리거 편집' };
const kCloseAll: LocaleText = { en: 'Close all', ko: '모두 접기' };

const files: { [group: string]: TriggerFile[] } = {};
const browsers: { [group: string]: { showFile: (file: TriggerFile) => void } } = {};
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

const changedCount = (file: TriggerFile): number =>
  file.triggers.filter((t) => isChange(context.readSaved(file.group, ['triggers', t.id]))).length +
  file.settings.filter((s) => {
    const saved = context.readSaved(file.group, s.path);
    if (s.default === undefined)
      return isChange(saved);
    return differs(saved, typeof s.default === 'function' ? s.default() : s.default);
  }).length;

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

// A file's trigger list is folded under a header of its own, like its timeline edits: most
// people only change a fight's options.
const groupTriggers = (file: TriggerFile): void => {
  const options = file.container.querySelector<HTMLElement>(':scope > .trigger-file-options');
  if (options === null)
    return;
  const overridden = options.querySelector('.trigger-set-override-warning') !== null;
  if (file.triggers.length === 0 && !overridden)
    return;
  const group = document.createElement('div');
  group.classList.add('timeline-edit-container', 'config-trigger-group');
  // An overridden set's warning stays in view.
  if (!overridden)
    group.classList.add('collapsed');
  const header = document.createElement('div');
  header.classList.add('timeline-edit-header');
  const title = document.createElement('span');
  title.textContent = context.translate(kTriggerGroup);
  const meta = document.createElement('span');
  meta.classList.add('config-trigger-group-meta');
  header.append(title, meta);
  const update = () => {
    const changed =
      file.triggers.filter((t) => isChange(context.readSaved(file.group, ['triggers', t.id])))
        .length;
    const parts = [format(kTriggerCount, file.triggers.length)];
    if (changed > 0)
      parts.push(format(kChangedCount, changed));
    meta.textContent = file.triggers.length > 0 ? parts.join(' · ') : '';
  };
  update();
  group.addEventListener('input', update);
  group.addEventListener('change', update);
  header.addEventListener('click', () => group.classList.toggle('collapsed'));
  options.before(group);
  group.append(header, options);
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
      const parts = [file.type ?? userFileOf.get(file.container), count];
      meta.textContent = parts.filter((p) => p !== undefined).join(' · ');
      if (n > 0) {
        const span = document.createElement('span');
        span.classList.add('config-file-changed');
        span.textContent = ` · ${format(kChangedCount, n)}`;
        meta.appendChild(span);
      }
    };
    update();
    groupTriggers(file);
    file.container.addEventListener('change', update);
    file.container.addEventListener('input', update);
    // Timeline rows are removed with a button, saving without an input event.
    file.container.addEventListener('click', update);
    // Opening a card scrolls it into view, as it moves to a row of its own.
    header.addEventListener('click', () => {
      if (file.container.classList.contains('collapsed'))
        return;
      compactTriggers(file);
      file.container.scrollIntoView({ block: 'start' });
    });
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
        const hit = (type === undefined || file?.type === type) &&
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

  browsers[group] = {
    showFile: (file: TriggerFile) => {
      const expansion = groups.find((e) => e.containers.some((c) => c.contains(file.container)));
      type = undefined;
      changedOnly = false;
      storageSet(changedKey(group), '0');
      if (expansion !== undefined)
        selectExpansion(expansion);
    },
  };
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
  const header = file.container.querySelector<HTMLElement>(':scope > .trigger-file-header');
  if (file.container.classList.contains('collapsed'))
    header?.click();
  const row = trigger !== undefined ? findTriggerRow(file, trigger.id) : undefined;
  row?.closest('.config-trigger-group')?.classList.remove('collapsed');
  if (row === undefined) {
    flash([file.container]);
    file.container.scrollIntoView({ block: 'start' });
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
