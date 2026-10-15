import { SavedConfigEntry } from '../../types/event';
import { LocaleText } from '../../types/trigger';

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
  // Saved config paths for the whole file (trigger set options, timeline edits).
  settingPaths: string[][];
};

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
  settingPaths: string[][] = [],
): void => {
  (files[group] ??= []).push({
    group: group,
    container: container,
    title: stripTags(title),
    type: type,
    triggers: triggers,
    settingPaths: settingPaths,
  });
};

// Anything saved other than empty boxes, "default" and shown timeline entries (true) counts as a
// change.  A config edited by hand could have null too.
const isChange = (entry: SavedConfigEntry | null | undefined): boolean => {
  if (entry === undefined || entry === null || entry === true)
    return false;
  if (typeof entry === 'string')
    return entry !== '' && entry !== 'default';
  if (typeof entry === 'object')
    return Object.values(entry).some(isChange);
  return true;
};

const changedCount = (file: TriggerFile): number =>
  file.triggers.filter((t) => isChange(context.readSaved(file.group, ['triggers', t.id]))).length +
  file.settingPaths.filter((path) => isChange(context.readSaved(file.group, path))).length;

const format = (text: LocaleText, n: number): string =>
  context.translate(text).replace('${n}', n.toLocaleString());

const storageKey = (group: string) => `cactbot-config-expansion-${group}`;

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

// Finds a trigger's row in an open file, as either config builds it.
const findTriggerRow = (file: TriggerFile, id: string): HTMLElement | undefined => {
  for (const row of file.container.querySelectorAll<HTMLElement>('.trigger')) {
    const label = row.querySelector('.trigger-id')?.textContent ?? row.firstChild?.textContent;
    if (label === id)
      return row;
  }
  return undefined;
};

export const buildTriggerBrowser = (group: string, groupDiv: HTMLElement): void => {
  const list = files[group] ?? [];
  const expansions = [...groupDiv.children].filter((e): e is HTMLElement =>
    e instanceof HTMLElement && e.classList.contains('trigger-expansion-container')
  );
  if (expansions.length === 0)
    return;
  groupDiv.classList.add('config-trigger-browser');

  const fileOf = new Map<HTMLElement, TriggerFile>(list.map((f) => [f.container, f]));
  const changed = new Map<TriggerFile, number>();
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
      const parts = [file.type, count];
      meta.textContent = parts.filter((p) => p !== undefined).join(' · ');
      if (n > 0) {
        const span = document.createElement('span');
        span.classList.add('config-file-changed');
        span.textContent = ` · ${format(kChangedCount, n)}`;
        meta.appendChild(span);
      }
    };
    update();
    file.container.addEventListener('change', update);
    file.container.addEventListener('input', update);
    // Opening a card scrolls it into view, as it moves to a row of its own.
    header.addEventListener('click', () => {
      if (!file.container.classList.contains('collapsed'))
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

  const toolbar = document.createElement('div');
  toolbar.classList.add('config-trigger-toolbar');
  const expansionRow = document.createElement('div');
  expansionRow.classList.add('config-chips');
  const typeRow = document.createElement('div');
  typeRow.classList.add('config-chips');
  const empty = document.createElement('div');
  empty.classList.add('config-trigger-empty');
  empty.textContent = context.translate(kNoFiles);
  toolbar.append(expansionRow, typeRow);
  groupDiv.prepend(toolbar);
  groupDiv.appendChild(empty);

  let current = expansions[0];
  let type: string | undefined;
  let changedOnly = false;

  const filesIn = (expansion: HTMLElement) =>
    [...expansion.children].filter((e): e is HTMLElement =>
      e instanceof HTMLElement && e.classList.contains('trigger-file-container')
    );

  const apply = () => {
    let shown = 0;
    for (const expansion of expansions) {
      const active = expansion === current;
      expansion.classList.toggle('config-active', active);
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
    empty.classList.toggle('config-hidden', shown > 0);
  };

  const buildTypeChips = () => {
    typeRow.replaceChildren();
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
      typeRow.appendChild(chip);
    }
    const changedChip = makeChip(context.translate(kChangedOnly));
    changedChip.classList.add('config-chip-toggle');
    changedChip.classList.toggle('config-active', changedOnly);
    changedChip.onclick = () => {
      changedOnly = !changedOnly;
      changedChip.classList.toggle('config-active', changedOnly);
      apply();
    };
    typeRow.appendChild(changedChip);
  };

  const expansionChips = new Map<HTMLElement, HTMLButtonElement>();
  const selectExpansion = (expansion: HTMLElement) => {
    current = expansion;
    for (const [e, chip] of expansionChips)
      chip.classList.toggle('config-active', e === expansion);
    const label = expansion.querySelector('.trigger-expansion-header')?.textContent ?? '';
    storageSet(storageKey(group), label);
    buildTypeChips();
    apply();
  };
  for (const expansion of expansions) {
    const label = expansion.querySelector('.trigger-expansion-header')?.textContent ?? '';
    expansion.classList.remove('collapsed');
    const chip = makeChip(label);
    chip.onclick = () => selectExpansion(expansion);
    expansionChips.set(expansion, chip);
    expansionRow.appendChild(chip);
  }

  // The last saved expansion, or else the latest one ("x.x" in its name).
  const saved = storageGet(storageKey(group));
  const labelOf = (e: HTMLElement) =>
    e.querySelector('.trigger-expansion-header')?.textContent ?? '';
  const initial = expansions.find((e) => saved !== null && labelOf(e) === saved) ??
    [...expansions].reverse().find((e) => /\d\.x\)/.test(labelOf(e))) ??
    expansions[0];
  if (initial !== undefined)
    selectExpansion(initial);

  // The trigger count on the section's switch (see config_tabs.ts).
  const count = groupDiv.closest('.overlay-container')?.querySelector('.config-view-count');
  if (count)
    count.textContent = triggerCount(group).toLocaleString();
  context.onTriggersChanged();

  browsers[group] = {
    showFile: (file: TriggerFile) => {
      const expansion = expansions.find((e) => e.contains(file.container));
      type = undefined;
      changedOnly = false;
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
  if (row === undefined) {
    flash([file.container]);
    file.container.scrollIntoView({ block: 'start' });
    return;
  }
  // The row's top goes right under the file's header, which stays on top while open (rows with
  // many output strings are taller than the page, so centering them would hide their name).
  row.scrollIntoView({ block: 'start' });
  const scroller = row.closest('.config-scroll');
  if (scroller !== null && header !== null)
    scroller.scrollTop -= header.getBoundingClientRect().height + 8;
  const details = row.nextElementSibling;
  flash(details instanceof HTMLElement ? [row, details] : [row]);
};
