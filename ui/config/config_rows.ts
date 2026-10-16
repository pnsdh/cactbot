import { ConfigEntry, ConfigValue } from '../../resources/user_config';
import { LocaleText } from '../../types/trigger';

import { setDefault } from './config_dirty';
import { setTooltip } from './config_tooltip';

// Fork: arranges a section's option rows (a name cell and a control cell each, as
// CactbotConfigurator.buildUI makes them) into titled cards, and adds units, sliders for 0-1
// values, a mark on options changed from their default and a button to reset them.

type Topic = { title: LocaleText; ids: string[] };

const kTopics: { [group: string]: Topic[] } = {
  raidboss: [
    {
      title: { en: 'Display', ko: '표시' },
      ids: ['TimelineEnabled', 'AlertsEnabled', 'Skin', 'ReverseTimeline'],
    },
    {
      title: { en: 'Language and output', ko: '언어 · 출력' },
      ids: ['DefaultAlertOutput', 'AlertsLanguage', 'TimelineLanguage', 'DefaultPlayerLabel'],
    },
    {
      title: { en: 'Timeline', ko: '타임라인' },
      ids: [
        'ShowTimerBarsAtSeconds',
        'BarExpiresSoonSeconds',
        'MaxNumberOfTimerBars',
        'KeepExpiredTimerBarsForSeconds',
      ],
    },
    {
      title: { en: 'Alert duration', ko: '알람 표시 시간' },
      ids: [
        'DisplayAlarmTextForSeconds',
        'DisplayAlertTextForSeconds',
        'DisplayInfoTextForSeconds',
      ],
    },
    {
      title: { en: 'Sound', ko: '소리' },
      ids: [
        'MasterVolume',
        'AlarmSoundVolume',
        'AlertSoundVolume',
        'InfoSoundVolume',
        'LongSoundVolume',
        'PullSoundVolume',
      ],
    },
    {
      title: { en: 'Gamepad rumble', ko: '게임패드 진동' },
      ids: [
        'RumbleEnabled',
        'AlarmRumbleDuration',
        'AlarmRumbleWeak',
        'AlarmRumbleStrong',
        'AlertRumbleDuration',
        'AlertRumbleWeak',
        'AlertRumbleStrong',
        'InfoRumbleDuration',
        'InfoRumbleWeak',
        'InfoRumbleStrong',
      ],
    },
  ],
  jobs: [
    {
      title: { en: 'Display', ko: '표시' },
      ids: [
        'JustBuffTracker',
        'CompactView',
        'LowerOpacityOutOfCombat',
        'OpacityOutOfCombat',
        'ShowMPTickerOutOfCombat',
        'HideWellFedAboveSeconds',
      ],
    },
    {
      title: { en: 'HP', ko: 'HP' },
      ids: ['MidHealthThresholdPercent', 'LowHealthThresholdPercent'],
    },
    {
      title: { en: 'Buffs', ko: '버프' },
      ids: [
        'BigBuffShowCooldownSeconds',
        'BigBuffIconWidth',
        'BigBuffIconHeight',
        'BigBuffBarHeight',
        'BigBuffTextHeight',
        'BigBuffBorderSize',
      ],
    },
    {
      title: { en: 'Notifications and sound', ko: '알림 · 소리' },
      ids: [
        'NotifyExpiredProcsInCombat',
        'NotifyExpiredProcsInCombatSound',
        'PlayCountdownSound',
        'CountdownSoundVolume',
        'GpAlarmPoint',
        'GpAlarmSoundVolume',
      ],
    },
  ],
  oopsyraidsy: [
    {
      title: { en: 'Display', ko: '표시' },
      ids: ['Skin', 'DefaultPlayerLabel', 'NumLiveListItemsInCombat'],
    },
    {
      title: { en: 'Death reports', ko: '사망 보고서' },
      ids: ['TimeToShowDeathReportSeconds', 'DeathReportSide'],
    },
    {
      title: { en: 'Mistakes', ko: '실수 판정' },
      ids: [
        'MinimumTimeForPullMistake',
        'MinimumTimeForOverwrittenMit',
        'DamageDownMistakes',
        'DamageDownMaxPlayers',
      ],
    },
  ],
  eureka: [
    {
      title: { en: 'Display', ko: '표시' },
      ids: ['FlagTimeoutSeconds', 'CompleteNamesSTQ', 'EnrichedSTQ', 'RefreshRateSeconds'],
    },
    {
      title: { en: 'Sound', ko: '소리' },
      ids: [
        'PopNoiseForNM',
        'PopNoiseForBunny',
        'PopNoiseForSkirmish',
        'PopNoiseForCriticalEngagement',
        'PopNoiseForDuel',
        'PopVolume',
        'BunnyPopVolume',
        'CriticalPopVolume',
      ],
    },
  ],
  radar: [
    {
      title: { en: 'Detection', ko: '탐지' },
      ids: ['BRankEnabled', 'DetectionRange', 'Puller', 'Position'],
    },
    {
      title: { en: 'Notifications', ko: '알림' },
      ids: ['TTS', 'PopSoundAlert', 'PopVolume', 'PullSoundAlert', 'PullVolume'],
    },
  ],
};

// Link options shown in the section's description instead of as rows.
const kDescLinks = ['Coverage'];

const kOtherTitle: LocaleText = { en: 'Other', ko: '기타' };
const kTriggersTitle: LocaleText = { en: 'Triggers', ko: '트리거' };
const kDefault: LocaleText = { en: 'Default', ko: '기본값' };
const kOn: LocaleText = { en: 'on', ko: '켜짐' };
const kOff: LocaleText = { en: 'off', ko: '꺼짐' };
const kInfo: LocaleText = { en: 'Description', ko: '설명' };

// How a number option is shown: its unit, and a scale from the saved value to the shown one
// (0-1 as percent, milliseconds as seconds), with a slider for percents.
type NumberKind = { unit: LocaleText; scale?: number; slider?: boolean };

const kSecondsUnit: LocaleText = { en: 's', ko: '초' };
const kSeconds: NumberKind = { unit: kSecondsUnit };
const kMsAsSeconds: NumberKind = { unit: kSecondsUnit, scale: 0.001 };
const kPercent: NumberKind = { unit: { en: '%' }, scale: 100, slider: true };
const kCount: NumberKind = { unit: { en: '', ko: '개' } };
const kPx: NumberKind = { unit: { en: 'px' } };

const kNumbers: { [id: string]: NumberKind } = {
  ShowTimerBarsAtSeconds: kSeconds,
  KeepExpiredTimerBarsForSeconds: kSeconds,
  BarExpiresSoonSeconds: kSeconds,
  MaxNumberOfTimerBars: kCount,
  DisplayAlarmTextForSeconds: kSeconds,
  DisplayAlertTextForSeconds: kSeconds,
  DisplayInfoTextForSeconds: kSeconds,
  MasterVolume: kPercent,
  AlarmSoundVolume: kPercent,
  AlertSoundVolume: kPercent,
  InfoSoundVolume: kPercent,
  LongSoundVolume: kPercent,
  PullSoundVolume: kPercent,
  AlarmRumbleDuration: kMsAsSeconds,
  AlarmRumbleWeak: kPercent,
  AlarmRumbleStrong: kPercent,
  AlertRumbleDuration: kMsAsSeconds,
  AlertRumbleWeak: kPercent,
  AlertRumbleStrong: kPercent,
  InfoRumbleDuration: kMsAsSeconds,
  InfoRumbleWeak: kPercent,
  InfoRumbleStrong: kPercent,
  OpacityOutOfCombat: kPercent,
  CountdownSoundVolume: kPercent,
  HideWellFedAboveSeconds: kSeconds,
  MidHealthThresholdPercent: kPercent,
  LowHealthThresholdPercent: kPercent,
  BigBuffShowCooldownSeconds: kSeconds,
  BigBuffIconWidth: kPx,
  BigBuffIconHeight: kPx,
  BigBuffBarHeight: kPx,
  BigBuffTextHeight: kPx,
  BigBuffBorderSize: kPx,
  GpAlarmPoint: { unit: { en: 'GP' } },
  GpAlarmSoundVolume: kPercent,
  NotifyExpiredProcsInCombat: { unit: { en: 'times', ko: '회' } },
  NumLiveListItemsInCombat: kCount,
  MinimumTimeForPullMistake: kSeconds,
  TimeToShowDeathReportSeconds: kSeconds,
  MinimumTimeForOverwrittenMit: kSeconds,
  DamageDownMaxPlayers: { unit: { en: 'players', ko: '명' } },
  FlagTimeoutSeconds: kSeconds,
  PopVolume: kPercent,
  BunnyPopVolume: kPercent,
  CriticalPopVolume: kPercent,
  RefreshRateSeconds: kSeconds,
  DetectionRange: { unit: { en: 'yalms', ko: 'm' } },
  PullVolume: kPercent,
};

// Parts of option names in parentheses that only say the unit, now shown in the box.
const kUnitNote =
  /^(초|초 이하|밀리초|단위: ?초|pixel|px|0-1|1 = 100%|미터|seconds?|milliseconds?|in seconds|yalms)$/i;

// Explanations for options whose names leave something out, shown in their tooltip.
const kHelp: { [id: string]: LocaleText } = {
  ShowDeveloperOptions: {
    en: 'Also shows debugging options and the regexes of triggers.',
    ko: '디버그용 설정과 트리거의 정규식을 함께 보여 줍니다.',
  },
  DefaultAlertOutput: {
    en: 'How triggers alert unless set otherwise for a fight or a trigger.',
    ko: '전투나 트리거별로 따로 정하지 않은 트리거가 알리는 방식입니다.',
  },
  AlertsLanguage: {
    en: 'The language of alert texts.',
    ko: '알람 문구의 언어입니다.',
  },
  TimelineLanguage: {
    en: 'The language of ability names in timelines.',
    ko: '타임라인에 나오는 기술 이름의 언어입니다.',
  },
  ShowTimerBarsAtSeconds: {
    en: 'An ability shows up in the timeline once it is this close.',
    ko: '기술까지 남은 시간이 이 값 이하가 되면 타임라인에 막대가 나타납니다.',
  },
  BarExpiresSoonSeconds: {
    en: 'A bar changes color once its ability is this close.',
    ko: '남은 시간이 이 값 이하가 되면 막대 색이 바뀝니다.',
  },
  KeepExpiredTimerBarsForSeconds: {
    en: 'How long a bar stays after its time is up.',
    ko: '시간이 다 된 막대를 이만큼 더 보여 준 뒤 지웁니다.',
  },
  MaxNumberOfTimerBars: {
    en: 'How many bars the timeline shows at once.',
    ko: '타임라인에 한 번에 보여 줄 막대 수입니다.',
  },
  DisplayAlarmTextForSeconds: {
    en: 'How long an alert text stays on screen.',
    ko: '알람 문구를 화면에 띄워 두는 시간입니다.',
  },
  DisplayAlertTextForSeconds: {
    en: 'How long an alert text stays on screen.',
    ko: '알람 문구를 화면에 띄워 두는 시간입니다.',
  },
  DisplayInfoTextForSeconds: {
    en: 'How long an alert text stays on screen.',
    ko: '알람 문구를 화면에 띄워 두는 시간입니다.',
  },
  BigBuffShowCooldownSeconds: {
    en: 'A buff\'s cooldown is shown once this little of it is left.',
    ko: '재사용 대기시간이 이 값 이하로 남았을 때부터 표시합니다.',
  },
  MidHealthThresholdPercent: {
    en: 'Health at or below this is shown as middling.',
    ko: 'HP가 이 비율 이하이면 보통 HP로 표시합니다.',
  },
  LowHealthThresholdPercent: {
    en: 'Health at or below this is shown as low.',
    ko: 'HP가 이 비율 이하이면 낮은 HP로 표시합니다.',
  },
  MinimumTimeForPullMistake: {
    en:
      'A pull is marked early or late when the first hit lands at least this far from the end of the countdown.',
    ko: '첫 공격이 초읽기가 끝난 시각보다 이 시간 이상 빠르거나 늦으면 풀링 실수로 표시합니다.',
  },
  MinimumTimeForOverwrittenMit: {
    en: 'Recasting a party mitigation is marked when the one it replaces had more than this left.',
    ko: '같은 파티 생존기가 이 시간보다 많이 남아 있을 때 겹쳐 쓰면 경고합니다. 끝나 갈 때 이어서 쓰는 건 경고하지 않습니다.',
  },
  TimeToShowDeathReportSeconds: {
    en: 'How long the death report stays on screen when you die.',
    ko: '죽었을 때 사망 보고서를 띄워 두는 시간입니다.',
  },
};

type Translate = (text: LocaleText) => string;

// Called by buildUI for each top level option, so its row can be found later.
export const tagOptionRow = (
  elements: HTMLElement[],
  opt: ConfigEntry,
  defaultValue: ConfigValue,
  group: string,
): void => {
  setDefault(group, [opt.id], defaultValue.toString());
  for (const element of elements) {
    element.dataset.optionId = opt.id;
    element.dataset.optionType = opt.type;
    element.dataset.optionDefault = defaultValue.toString();
  }
};

const makeCard = (title: string | undefined, rows: HTMLElement): HTMLElement => {
  const card = document.createElement('div');
  card.classList.add('config-card');
  card.appendChild(rows);
  // After the rows, so CSS can hide the title of a card with no rows yet (placed above by CSS).
  if (title !== undefined) {
    const h2 = document.createElement('h2');
    h2.classList.add('config-card-title');
    h2.textContent = title;
    card.appendChild(h2);
  }
  return card;
};

const isNumberType = (type: string | undefined) => type === 'float' || type === 'integer';

const escapeHtml = (text: string): string => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

// A saved number as shown (scaled, without float noise like 0.30000000000000004).
const toShown = (value: string, scale: number): string => {
  if (value.trim() === '' || scale === 1)
    return value;
  const n = Number(value);
  return isFinite(n) ? parseFloat((n * scale).toFixed(4)).toString() : value;
};

const fromShown = (value: string, scale: number): string => {
  if (value.trim() === '' || scale === 1)
    return value;
  const n = Number(value);
  return isFinite(n) ? parseFloat((n / scale).toFixed(6)).toString() : value;
};

// A box with its unit.  A scaled number gets a box of its own showing the scaled value, and the
// original box (which the config saves from) is kept hidden behind it.  Percents get a slider.
const decorateNumber = (
  input: HTMLInputElement,
  id: string,
  integer: boolean,
  translate: Translate,
): void => {
  const kind = kNumbers[id];
  const scale = kind?.scale ?? 1;
  const box = document.createElement('span');
  box.classList.add('config-num');
  input.before(box);
  let shown = input;
  if (scale !== 1) {
    shown = document.createElement('input');
    shown.type = 'text';
    shown.classList.add('config-num-shown');
    shown.placeholder = toShown(input.placeholder, scale);
    shown.value = toShown(input.value, scale);
    input.classList.add('config-hidden');
    box.append(shown, input);
  } else {
    box.appendChild(input);
  }
  const unit = kind !== undefined ? translate(kind.unit) : '';
  if (unit !== '') {
    const span = document.createElement('span');
    span.classList.add('config-unit');
    span.textContent = unit;
    box.appendChild(span);
  }

  // Anything but a number (or nothing, for the default) is marked: it would be saved as is.
  const markInvalid = () => {
    const value = shown.value.trim();
    const n = Number(value);
    box.classList.toggle(
      'config-invalid',
      value !== '' && !(integer && scale === 1 ? Number.isInteger(n) : isFinite(n)),
    );
  };

  if (scale !== 1) {
    let typing = false;
    shown.addEventListener('input', () => {
      typing = true;
      input.value = fromShown(shown.value, scale);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      typing = false;
    });
    shown.addEventListener(
      'change',
      () => input.dispatchEvent(new Event('change', { bubbles: true })),
    );
    // Changed from outside (the reset button): show it too.
    const follow = () => {
      if (!typing)
        shown.value = toShown(input.value, scale);
    };
    input.addEventListener('input', follow);
    input.addEventListener('config-shown', follow);
  }
  markInvalid();
  shown.addEventListener('input', markInvalid);
  input.addEventListener('config-shown', markInvalid);

  if (kind?.slider !== true)
    return;
  const range = document.createElement('input');
  range.type = 'range';
  range.classList.add('config-range');
  range.min = '0';
  range.max = '100';
  range.step = '5';
  range.tabIndex = -1;
  const sync = () => {
    const value = parseFloat(shown.value !== '' ? shown.value : shown.placeholder);
    if (!isNaN(value))
      range.value = value.toString();
  };
  sync();
  range.oninput = () => {
    shown.value = range.value;
    shown.dispatchEvent(new Event('input', { bubbles: true }));
  };
  shown.addEventListener('input', sync);
  input.addEventListener('config-shown', sync);
  input.addEventListener('input', sync);
  box.before(range);
};

// A directory: its path first, cut at the start when long (the end says the most), then the button.
// The config writes the path into its own label, which this follows.
const decorateDirectory = (inputDiv: HTMLElement): void => {
  const label = inputDiv.querySelector<HTMLElement>('.input-dir-label');
  if (label === null)
    return;
  const path = document.createElement('span');
  path.classList.add('config-path');
  const text = document.createElement('bdi');
  text.dir = 'ltr';
  path.appendChild(text);
  const sync = () => text.textContent = label.textContent ?? '';
  sync();
  const watched = { childList: true, characterData: true, subtree: true };
  new MutationObserver(sync).observe(label, watched);
  label.classList.add('config-hidden');
  inputDiv.prepend(path);
  setTooltip(path, () => escapeHtml(label.textContent ?? ''));
};

// What the default is, for the reset button: a number with its unit, a choice's text, on or off.
const describeDefault = (
  id: string,
  type: string | undefined,
  defaultValue: string,
  control: HTMLInputElement | HTMLSelectElement,
  translate: Translate,
): string => {
  if (control instanceof HTMLSelectElement)
    return [...control.options].find((o) => o.value === defaultValue)?.textContent ?? '';
  if (control.type === 'checkbox')
    return translate(defaultValue === 'true' ? kOn : kOff);
  if (isNumberType(type)) {
    const kind = kNumbers[id];
    const unit = kind !== undefined ? translate(kind.unit) : '';
    return `${toShown(defaultValue, kind?.scale ?? 1)}${unit === '%' ? '' : ' '}${unit}`.trim();
  }
  return defaultValue;
};

const addReset = (
  id: string,
  left: HTMLElement,
  inputDiv: HTMLElement,
  translate: Translate,
): void => {
  const type = left.dataset.optionType;
  const defaultValue = left.dataset.optionDefault ?? '';
  // For scaled numbers, the hidden original box is the one the config saves from.
  const control = inputDiv.querySelector<HTMLInputElement | HTMLSelectElement>(
    'input[type="checkbox"], input[type="text"]:not(.config-num-shown), select',
  );
  if (control === null)
    return;
  // A select whose default isn't one of its choices couldn't be put back.
  if (
    control instanceof HTMLSelectElement &&
    ![...control.options].some((o) => o.value === defaultValue)
  )
    return;
  const current = () =>
    control instanceof HTMLInputElement && control.type === 'checkbox'
      ? control.checked.toString()
      : control.value;
  const isDefault = () => {
    const value = current();
    if (value === defaultValue)
      return true;
    // An emptied box means the default, as do numbers written differently (0.5 and 0.50).
    if (value === '' && (type === 'string' || isNumberType(type)))
      return true;
    return isNumberType(type) && parseFloat(value) === parseFloat(defaultValue);
  };

  // Says what the default is, so it reads as "back to <that>" rather than as a reload button.
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.classList.add('config-reset');
  const shownDefault = describeDefault(id, type, defaultValue, control, translate);
  const label = document.createElement('span');
  label.textContent = shownDefault !== ''
    ? `${translate(kDefault)}: ${shownDefault}`
    : translate(kDefault);
  reset.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>';
  reset.appendChild(label);
  // Its name when it is only its icon (in narrow windows).
  reset.title = label.textContent;
  reset.onclick = () => {
    // Its control is disabled by another option's value.
    if (control.disabled)
      return;
    const box = type === 'string' || isNumberType(type);
    if (control instanceof HTMLInputElement && control.type === 'checkbox')
      control.checked = defaultValue === 'true';
    // Boxes save as empty, which means the default (so a later new default applies too).
    else
      control.value = box ? '' : defaultValue;
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    // ...and show the default's value, as the page does on load.
    if (box) {
      control.value = defaultValue;
      control.dispatchEvent(new Event('config-shown', { bubbles: true }));
    }
  };

  // The control cell is a grid of one column: keep the button on the control's line.
  const line = document.createElement('span');
  line.classList.add('config-ctl');
  line.append(reset, ...inputDiv.childNodes);
  inputDiv.appendChild(line);

  const refresh = () => {
    const changed = !isDefault();
    left.classList.toggle('config-modified', changed);
    reset.classList.toggle('config-hidden', !changed);
  };
  inputDiv.addEventListener('input', refresh);
  inputDiv.addEventListener('change', refresh);
  refresh();
};

// Moves an option's description (and the notes in its name's parentheses) into a tooltip on an
// icon after its name.  The texts stay in the row, hidden, for search.
export const addOptionTooltip = (
  left: HTMLElement,
  translate: Translate,
  help?: LocaleText,
  isNumber?: boolean,
): void => {
  const name = left.querySelector<HTMLElement>('.option-name');
  if (name === null || name.querySelector('.config-help') !== null)
    return;
  const notes: string[] = [];
  if (isNumber === true) {
    let label = name.textContent ?? '';
    for (const part of label.match(/\([^()]*\)/g) ?? []) {
      label = label.replace(part, ' ');
      const note = part.slice(1, -1).trim();
      if (!kUnitNote.test(note))
        notes.push(note);
    }
    name.textContent = label.replace(/\s+/g, ' ').replace(/\s+([,.])/g, '$1').trim();
  }
  const comment = [...left.children].find((e): e is HTMLElement =>
    e instanceof HTMLElement && e.classList.contains('comment')
  );
  const parts = [
    ...help !== undefined ? [escapeHtml(translate(help))] : [],
    ...notes.map(escapeHtml),
    ...comment !== undefined && comment.innerHTML.trim() !== '' ? [comment.innerHTML] : [],
  ];
  if (parts.length === 0)
    return;
  if (comment !== undefined)
    comment.classList.add('config-hidden');
  if (notes.length > 0) {
    const hidden = document.createElement('span');
    hidden.classList.add('config-hidden');
    hidden.textContent = notes.join(' ');
    left.appendChild(hidden);
  }
  const icon = document.createElement('span');
  icon.classList.add('config-help');
  icon.tabIndex = 0;
  icon.setAttribute('role', 'img');
  icon.setAttribute('aria-label', translate(kInfo));
  icon.textContent = 'i';
  name.appendChild(icon);
  setTooltip(icon, () => parts.map((p) => `<p>${p}</p>`).join(''));
};

// Option rows inside trigger lists (a fight's own options) get tooltips too.
export const addTooltipsIn = (root: HTMLElement, translate: Translate): void => {
  for (const name of root.querySelectorAll<HTMLElement>('.option-name')) {
    const left = name.parentElement;
    if (left !== null)
      addOptionTooltip(left, translate);
  }
};

export const arrangeSection = (
  section: HTMLElement,
  group: string,
  translate: Translate,
): void => {
  const groupDiv = [...section.children].find((e): e is HTMLElement =>
    e instanceof HTMLElement && e.classList.contains('overlay-options')
  );
  if (groupDiv === undefined)
    return;

  // Option id to its [name cell, control cell], in page order.
  const rows = new Map<string, HTMLElement[]>();
  for (const child of [...groupDiv.children]) {
    if (!(child instanceof HTMLElement))
      continue;
    const id = child.dataset.optionId;
    if (id !== undefined)
      rows.set(id, [...rows.get(id) ?? [], child]);
  }

  for (const id of kDescLinks) {
    const [left, inputDiv] = rows.get(id) ?? [];
    const anchor = inputDiv?.querySelector('a');
    const desc = section.querySelector('.config-section-desc');
    if (!left || !inputDiv || !anchor || !desc)
      continue;
    const link = document.createElement('a');
    link.classList.add('config-desc-link');
    link.href = anchor.href;
    link.target = '_blank';
    const name = left.querySelector('.option-name')?.textContent ?? anchor.textContent ?? '';
    link.textContent = `${name} ↗`;
    desc.appendChild(link);
    left.remove();
    inputDiv.remove();
    rows.delete(id);
  }

  for (const [id, [left, inputDiv]] of rows) {
    if (left === undefined || inputDiv === undefined)
      continue;
    const type = left.dataset.optionType;
    const input = inputDiv.querySelector<HTMLInputElement>('input[type="text"]');
    if (input !== null && isNumberType(type))
      decorateNumber(input, id, type === 'integer', translate);
    if (type === 'directory')
      decorateDirectory(inputDiv);
    addOptionTooltip(left, translate, kHelp[id], isNumberType(type));
    if (type !== 'html' && type !== 'directory')
      addReset(id, left, inputDiv, translate);
  }

  const topics = kTopics[group] ?? [];
  const cards: HTMLElement[] = [];
  const used = new Set<string>();
  const fill = (title: string | undefined, ids: string[]) => {
    const cardRows = document.createElement('div');
    cardRows.classList.add('overlay-options');
    for (const id of ids) {
      for (const element of rows.get(id) ?? [])
        cardRows.appendChild(element);
      used.add(id);
    }
    if (cardRows.childElementCount > 0)
      cards.push(makeCard(title, cardRows));
  };
  for (const topic of topics)
    fill(translate(topic.title), topic.ids.filter((id) => rows.has(id)));
  const rest = [...rows.keys()].filter((id) => !used.has(id));
  fill(topics.length > 0 ? translate(kOtherTitle) : undefined, rest);

  for (const card of cards)
    groupDiv.before(card);

  // What's left (raidboss and oopsy trigger lists, added by buildExtraUI) is a card of its own.
  const treeCard = makeCard(translate(kTriggersTitle), groupDiv);
  treeCard.classList.add('config-card-tree');
  section.appendChild(treeCard);
};
