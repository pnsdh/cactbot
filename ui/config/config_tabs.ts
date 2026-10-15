import { Lang, langToLocale } from '../../resources/languages';
import { LocaleText } from '../../types/trigger';

import { arrangeSection } from './config_rows';
import {
  revealTrigger,
  searchTriggers,
  setTriggerBrowserContext,
  triggerCount,
} from './config_triggers';

// Fork: the config page shows one overlay's options at a time, picked from tabs across the top
// (the page sits next to OverlayPlugin's own list, so a second sidebar would crowd it), in a dark
// or light theme.  The sections are the ones CactbotConfigurator.buildUI makes; this only moves
// and relabels them.

// Overlay names stay in English, as in OverlayPlugin and cactbot's docs; the tag above each title
// says what the overlay is for.
type SectionText = { title: string; tag: string; desc?: LocaleText };

const kSections: { [group: string]: SectionText } = {
  general: {
    title: 'General',
    tag: 'ALL OVERLAYS',
    desc: {
      en: 'Settings shared by all cactbot overlays.',
      ko: '모든 오버레이에 공통으로 쓰이는 설정입니다.',
    },
  },
  raidboss: {
    title: 'Raidboss',
    tag: 'TIMELINE · ALERTS',
    desc: {
      en: 'How timelines and trigger alerts are shown, and the output of each trigger.',
      ko: '타임라인과 트리거 알람의 표시 방식, 트리거별 출력입니다.',
    },
  },
  jobs: {
    title: 'Jobs',
    tag: 'JOB GAUGES · BUFFS',
    desc: {
      en: 'Job gauges, buffs and procs.',
      ko: '직업 게이지, 버프, 프록 표시 설정입니다.',
    },
  },
  eureka: {
    title: 'Eureka',
    tag: 'FIELD OPERATIONS',
    desc: {
      en: 'Notorious monster tracking in field operations such as Eureka.',
      ko: '에우레카 같은 특수 필드 탐색의 마물 알림 설정입니다.',
    },
  },
  oopsyraidsy: {
    title: 'Oopsyraidsy',
    tag: 'MISTAKES · DEATH REPORTS',
    desc: {
      en: 'Mistakes and death reports.',
      ko: '실수와 사망 원인 기록 설정입니다.',
    },
  },
  radar: {
    title: 'Radar',
    tag: 'HUNT RADAR',
    desc: {
      en: 'Hunt mob radar.',
      ko: '마물 레이더 설정입니다.',
    },
  },
};

const kTabStorageKey = 'cactbot-config-tab';
const kThemeStorageKey = 'cactbot-config-theme';
const kDefaultTab = 'raidboss';

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
    // Only a convenience: the saved config is the source of truth.
  }
};

// 'dark' (the default), 'light' or 'system'.
export const applyTheme = (theme: string): void => {
  const value = theme === 'light' || theme === 'system' ? theme : 'dark';
  document.documentElement.dataset.theme = value;
  storageSet(kThemeStorageKey, value);
};

// The saved config loads after the page shows, so the last theme is remembered here too.
export const applyStoredTheme = (): void => {
  const theme = storageGet(kThemeStorageKey);
  if (theme !== null)
    applyTheme(theme);
};

const kSearchPlaceholder: LocaleText = {
  en: 'Search settings and triggers',
  ko: '설정·트리거 검색',
};

const kNoResults: LocaleText = {
  en: 'Nothing matches.',
  ko: '일치하는 설정이나 트리거가 없습니다.',
};

const kTriggerResults: LocaleText = {
  en: 'Triggers',
  ko: '트리거',
};

const kMoreResults: LocaleText = {
  en: '${n} more: narrow the search to see them.',
  ko: '${n}개 더 있습니다. 검색어를 더 자세히 적어 주세요.',
};

const kSettingsView: LocaleText = {
  en: 'Settings',
  ko: '설정',
};

const kTriggersView: LocaleText = {
  en: 'Triggers',
  ko: '트리거',
};

// Sections with a trigger list (config_triggers.ts) switch between it and their options.
const kTriggerGroups = ['raidboss', 'oopsyraidsy'];
const kMaxTriggerResults = 40;

const groupTitle = (group: string): string => {
  const text = kSections[group];
  return text?.title ?? group;
};

// Trigger search results: a list of buttons that open the trigger in its list.
const renderTriggerResults = (
  results: HTMLElement,
  query: string,
  translate: (text: LocaleText) => string,
): boolean => {
  results.replaceChildren();
  if (query === '')
    return false;
  const { hits, total } = searchTriggers(query, kMaxTriggerResults);
  if (hits.length === 0)
    return false;

  const title = document.createElement('h2');
  title.classList.add('config-card-title');
  title.textContent = `${translate(kTriggerResults)} · ${total.toLocaleString()}`;
  const list = document.createElement('div');
  list.classList.add('config-hits');
  for (const hit of hits) {
    const button = document.createElement('button');
    button.type = 'button';
    button.classList.add('config-hit');
    const name = document.createElement('span');
    name.classList.add('config-hit-name');
    name.textContent = hit.trigger?.id ?? hit.file.title;
    const where = document.createElement('span');
    where.classList.add('config-hit-where');
    where.textContent = hit.trigger !== undefined
      ? `${hit.file.title} · ${groupTitle(hit.file.group)}`
      : [hit.file.type, groupTitle(hit.file.group)].filter((x) => x).join(' · ');
    button.append(name, where);
    const preview = hit.trigger?.preview;
    if (preview !== undefined && preview !== '') {
      const pill = document.createElement('span');
      pill.classList.add('config-hit-preview', `config-${hit.trigger?.severity ?? 'info'}`);
      pill.textContent = preview;
      button.appendChild(pill);
    }
    button.onclick = () => revealTrigger(hit);
    list.appendChild(button);
  }
  results.append(list, title);
  if (total > hits.length) {
    const more = document.createElement('p');
    more.classList.add('config-hits-more');
    more.textContent = translate(kMoreResults).replace('${n}', (total - hits.length).toString());
    list.appendChild(more);
  }
  return true;
};

// Searches option names and descriptions in every section at once (sections, cards and rows
// without a match are hidden while there is a query), and triggers (listed below them).
const buildSearch = (
  scroller: HTMLElement,
  translate: (text: LocaleText) => string,
  sections: () => { section: HTMLElement }[],
): { box: HTMLElement; results: HTMLElement; clear: () => void } => {
  const results = document.createElement('div');
  results.classList.add('config-card', 'config-trigger-results');
  const box = document.createElement('label');
  box.classList.add('config-search');
  const input = document.createElement('input');
  input.type = 'text';
  input.classList.add('config-search-input');
  input.placeholder = translate(kSearchPlaceholder);
  input.spellcheck = false;
  const key = document.createElement('kbd');
  key.textContent = '/';
  box.append(input, key);

  const empty = document.createElement('p');
  empty.classList.add('config-no-results', 'config-hidden');
  empty.textContent = translate(kNoResults);
  scroller.prepend(empty);

  let searching = false;
  const run = () => {
    const query = input.value.trim().toLowerCase();
    if (query === '' && !searching)
      return;
    searching = query !== '';
    document.documentElement.classList.toggle('config-searching', searching);
    let anyHit = renderTriggerResults(results, query, translate);
    for (const { section } of sections()) {
      let sectionHit = false;
      for (const card of section.querySelectorAll<HTMLElement>('.config-card')) {
        if (card.classList.contains('config-card-tree'))
          continue;
        let cardHit = false;
        for (const name of card.querySelectorAll<HTMLElement>('[data-option-id]')) {
          if (name.classList.contains('option-input-container'))
            continue;
          const text = `${name.textContent ?? ''} ${name.dataset.optionId ?? ''}`.toLowerCase();
          const hit = !searching || text.includes(query);
          name.classList.toggle('config-search-miss', !hit);
          name.nextElementSibling?.classList.toggle('config-search-miss', !hit);
          if (hit && name.style.display !== 'none')
            cardHit = true;
        }
        card.classList.toggle('config-search-miss', !cardHit);
        sectionHit ||= cardHit;
      }
      section.classList.toggle('config-search-empty', searching && !sectionHit);
      anyHit ||= sectionHit;
    }
    empty.classList.toggle('config-hidden', !searching || anyHit);
    scroller.scrollTop = 0;
  };
  input.addEventListener('input', run);
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape')
      return;
    input.value = '';
    run();
    input.blur();
  });

  // "/" or Ctrl+F starts a search from anywhere but a text box.
  document.addEventListener('keydown', (e) => {
    const target = e.target;
    const typing = target instanceof HTMLInputElement && target.type === 'text' ||
      target instanceof HTMLSelectElement;
    if (e.key === '/' && !typing || e.key === 'f' && e.ctrlKey) {
      input.focus();
      input.select();
      e.preventDefault();
    }
  });

  const clear = () => {
    if (input.value === '')
      return;
    input.value = '';
    run();
  };
  return { box: box, results: results, clear: clear };
};

type ShowView = (view: 'settings' | 'triggers') => void;

// The switch between a section's options and its trigger list.
const buildViewSwitch = (
  section: HTMLElement,
  group: string,
  translate: (text: LocaleText) => string,
): ShowView => {
  const storage = `cactbot-config-view-${group}`;
  const bar = document.createElement('div');
  bar.classList.add('config-view-switch');
  bar.setAttribute('role', 'tablist');
  const settings = document.createElement('button');
  settings.type = 'button';
  settings.textContent = translate(kSettingsView);
  const triggers = document.createElement('button');
  triggers.type = 'button';
  triggers.textContent = translate(kTriggersView);
  const count = document.createElement('span');
  count.classList.add('config-view-count');
  const n = triggerCount(group);
  if (n > 0)
    count.textContent = n.toLocaleString();
  triggers.appendChild(count);
  bar.append(settings, triggers);

  const show = (view: 'settings' | 'triggers') => {
    section.dataset.view = view;
    settings.classList.toggle('config-active', view === 'settings');
    triggers.classList.toggle('config-active', view === 'triggers');
    storageSet(storage, view);
  };
  settings.onclick = () => show('settings');
  triggers.onclick = () => show('triggers');
  section.classList.add('config-has-triggers');
  section.querySelector('.config-section-desc')?.after(bar);
  show(storageGet(storage) === 'triggers' ? 'triggers' : 'settings');
  return show;
};

export const buildSectionTabs = (
  container: HTMLElement,
  lang: Lang,
  translate: (text: LocaleText) => string,
): void => {
  document.documentElement.lang = langToLocale(lang);
  document.documentElement.classList.add('config-tabs');

  const bar = document.createElement('nav');
  bar.classList.add('config-tab-bar');
  bar.setAttribute('role', 'tablist');
  const logo = document.createElement('div');
  logo.classList.add('config-logo');
  logo.textContent = 'c';
  bar.appendChild(logo);

  const scroller = document.createElement('div');
  scroller.classList.add('config-scroll');

  const tabs = new Map<string, { tab: HTMLButtonElement; section: HTMLElement }>();
  const views = new Map<string, ShowView>();
  const search = buildSearch(scroller, translate, () => [...tabs.values()]);
  let shown: string | undefined;
  const select = (group: string) => {
    search.clear();
    for (const [key, { tab, section }] of tabs) {
      const active = key === group;
      tab.classList.toggle('config-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
      section.classList.toggle('config-active', active);
    }
    // Not on the first one: that would lay out the whole page before it shows.
    if (shown !== undefined && shown !== group)
      scroller.scrollTop = 0;
    shown = group;
    storageSet(kTabStorageKey, group);
  };
  setTriggerBrowserContext({
    showTriggers: (group) => {
      select(group);
      views.get(group)?.('triggers');
    },
  });

  const sections = [...container.children].filter((e): e is HTMLElement =>
    e instanceof HTMLElement && e.classList.contains('overlay-container')
  );
  for (const section of sections) {
    const anchor = section.querySelector('a');
    const header = section.querySelector<HTMLElement>('.overlay-header');
    const group = header?.textContent ?? '';
    if (!anchor || !header || group === '')
      continue;
    const text = kSections[group];
    const title = text?.title ?? group;

    // A section is a page of its own now, not a collapsible block.
    anchor.onclick = null;
    section.classList.remove('collapsed');
    section.dataset.group = group;
    header.textContent = title;
    header.dataset.eyebrow = text?.tag ?? group.toUpperCase();
    if (text?.desc !== undefined) {
      const desc = document.createElement('p');
      desc.classList.add('config-section-desc');
      desc.textContent = translate(text.desc);
      anchor.after(desc);
    }
    arrangeSection(section, group, translate);
    if (kTriggerGroups.includes(group))
      views.set(group, buildViewSwitch(section, group, translate));

    const tab = document.createElement('button');
    tab.classList.add('config-tab');
    tab.setAttribute('role', 'tab');
    tab.textContent = title;
    tab.onclick = () => select(group);
    bar.appendChild(tab);
    tabs.set(group, { tab: tab, section: section });
    scroller.appendChild(section);
  }

  // Left and right arrows move between tabs, as in other tab lists.
  bar.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')
      return;
    const keys = [...tabs.keys()];
    const current = keys.findIndex((key) => tabs.get(key)?.tab === document.activeElement);
    if (current < 0)
      return;
    const next = keys[(current + (e.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length];
    if (next === undefined)
      return;
    select(next);
    tabs.get(next)?.tab.focus();
    e.preventDefault();
  });

  bar.appendChild(search.box);
  scroller.appendChild(search.results);
  container.prepend(bar, scroller);
  const saved = storageGet(kTabStorageKey);
  const first = [...tabs.keys()][0];
  const initial = saved !== null && tabs.has(saved)
    ? saved
    : tabs.has(kDefaultTab)
    ? kDefaultTab
    : first;
  if (initial !== undefined)
    select(initial);
};
