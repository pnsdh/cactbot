import { Lang, langToLocale } from '../../resources/languages';
import { LocaleText } from '../../types/trigger';

import { arrangeSection } from './config_rows';

// Fork: the config page shows one overlay's options at a time, picked from tabs across the top
// (the page sits next to OverlayPlugin's own list, so a second sidebar would crowd it), in a dark
// or light theme.  The sections are the ones CactbotConfigurator.buildUI makes; this only moves
// and relabels them.

type SectionText = { title: LocaleText; desc?: LocaleText };

const kSections: { [group: string]: SectionText } = {
  general: {
    title: {
      en: 'General',
      de: 'Allgemein',
      fr: 'Général',
      ja: '一般',
      cn: '常规',
      ko: '일반',
      tc: '一般',
    },
    desc: {
      en: 'Settings shared by all cactbot overlays.',
      ko: '모든 오버레이에 공통으로 쓰이는 설정입니다.',
    },
  },
  raidboss: {
    title: {
      en: 'Raidboss',
      ja: 'レイドボス',
      ko: '레이드보스',
    },
    desc: {
      en: 'How timelines and trigger alerts are shown, and the output of each trigger.',
      ko: '타임라인과 트리거 알람의 표시 방식, 트리거별 출력입니다.',
    },
  },
  jobs: {
    title: {
      en: 'Jobs',
      de: 'Jobs',
      fr: 'Jobs',
      ja: 'ジョブ',
      cn: '职业',
      ko: '직업',
      tc: '職業',
    },
    desc: {
      en: 'Job gauges, buffs and procs.',
      ko: '직업 게이지, 버프, 프록 표시 설정입니다.',
    },
  },
  eureka: {
    title: {
      en: 'Eureka',
      ja: 'エウレカ',
      ko: '유레카',
    },
    desc: {
      en: 'Notorious monster tracking in field operations.',
      ko: '특수 필드 탐색의 마물 알림 설정입니다.',
    },
  },
  oopsyraidsy: {
    title: {
      en: 'Oopsy',
      ko: '실수 감지',
    },
    desc: {
      en: 'Mistakes and death reports.',
      ko: '실수와 사망 원인 기록 설정입니다.',
    },
  },
  radar: {
    title: {
      en: 'Radar',
      ja: 'レーダー',
      ko: '레이더',
    },
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
  en: 'Search settings',
  ko: '설정 검색',
};

const kNoResults: LocaleText = {
  en: 'No matching settings.',
  ko: '일치하는 설정이 없습니다.',
};

// Searches option names and descriptions in every section at once: sections, cards and rows
// without a match are hidden while there is a query.  Trigger lists are not searched.
const buildSearch = (
  scroller: HTMLElement,
  translate: (text: LocaleText) => string,
  sections: () => { section: HTMLElement }[],
): { box: HTMLElement; clear: () => void } => {
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
  empty.classList.add('config-no-results');
  empty.textContent = translate(kNoResults);
  scroller.prepend(empty);

  const run = () => {
    const query = input.value.trim().toLowerCase();
    const searching = query !== '';
    document.documentElement.classList.toggle('config-searching', searching);
    let anyHit = false;
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
  run();
  return { box: box, clear: clear };
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
  const search = buildSearch(scroller, translate, () => [...tabs.values()]);
  const select = (group: string) => {
    search.clear();
    for (const [key, { tab, section }] of tabs) {
      const active = key === group;
      tab.classList.toggle('config-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
      section.classList.toggle('config-active', active);
    }
    scroller.scrollTop = 0;
    storageSet(kTabStorageKey, group);
  };

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
    const title = text !== undefined ? translate(text.title) : group;

    // A section is a page of its own now, not a collapsible block.
    anchor.onclick = null;
    section.classList.remove('collapsed');
    section.dataset.group = group;
    header.textContent = title;
    header.dataset.eyebrow = group.toUpperCase();
    if (text?.desc !== undefined) {
      const desc = document.createElement('p');
      desc.classList.add('config-section-desc');
      desc.textContent = translate(text.desc);
      anchor.after(desc);
    }
    arrangeSection(section, group, translate);

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
