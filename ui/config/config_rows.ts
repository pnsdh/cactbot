import { ConfigEntry, ConfigValue } from '../../resources/user_config';
import { LocaleText } from '../../types/trigger';

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
const kResetTitle: LocaleText = { en: 'Reset to default', ko: '기본값으로' };

const kSeconds: LocaleText = { en: 's', ko: '초' };
const kCount: LocaleText = { en: '', ko: '개' };
const kPlayers: LocaleText = { en: 'players', ko: '명' };
const kTimes: LocaleText = { en: 'times', ko: '회' };
const kMs: LocaleText = { en: 'ms' };
const kPx: LocaleText = { en: 'px' };

const kUnits: { [id: string]: LocaleText } = {
  ShowTimerBarsAtSeconds: kSeconds,
  KeepExpiredTimerBarsForSeconds: kSeconds,
  BarExpiresSoonSeconds: kSeconds,
  MaxNumberOfTimerBars: kCount,
  DisplayAlarmTextForSeconds: kSeconds,
  DisplayAlertTextForSeconds: kSeconds,
  DisplayInfoTextForSeconds: kSeconds,
  AlarmRumbleDuration: kMs,
  AlertRumbleDuration: kMs,
  InfoRumbleDuration: kMs,
  HideWellFedAboveSeconds: kSeconds,
  BigBuffShowCooldownSeconds: kSeconds,
  BigBuffIconWidth: kPx,
  BigBuffIconHeight: kPx,
  BigBuffBarHeight: kPx,
  BigBuffTextHeight: kPx,
  BigBuffBorderSize: kPx,
  NotifyExpiredProcsInCombat: kTimes,
  NumLiveListItemsInCombat: kCount,
  MinimumTimeForPullMistake: kSeconds,
  TimeToShowDeathReportSeconds: kSeconds,
  MinimumTimeForOverwrittenMit: kSeconds,
  DamageDownMaxPlayers: kPlayers,
  FlagTimeoutSeconds: kSeconds,
  RefreshRateSeconds: kSeconds,
};

// Options from 0 to 1 that get a slider next to their box.
const kFractions = new Set([
  'AlarmSoundVolume',
  'AlertSoundVolume',
  'InfoSoundVolume',
  'LongSoundVolume',
  'PullSoundVolume',
  'AlarmRumbleWeak',
  'AlarmRumbleStrong',
  'AlertRumbleWeak',
  'AlertRumbleStrong',
  'InfoRumbleWeak',
  'InfoRumbleStrong',
  'OpacityOutOfCombat',
  'MidHealthThresholdPercent',
  'LowHealthThresholdPercent',
  'CountdownSoundVolume',
  'GpAlarmSoundVolume',
  'PopVolume',
  'BunnyPopVolume',
  'CriticalPopVolume',
  'PullVolume',
]);

type Translate = (text: LocaleText) => string;

// Called by buildUI for each top level option, so its row can be found later.
export const tagOptionRow = (
  elements: HTMLElement[],
  opt: ConfigEntry,
  defaultValue: ConfigValue,
): void => {
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

// A box with its unit, and a slider for 0-1 values that edits the box.
const decorateNumber = (
  input: HTMLInputElement,
  id: string,
  integer: boolean,
  translate: Translate,
): void => {
  const unit = kUnits[id];
  const box = document.createElement('span');
  box.classList.add('config-num');
  input.before(box);
  box.appendChild(input);
  if (unit !== undefined && translate(unit) !== '') {
    const span = document.createElement('span');
    span.classList.add('config-unit');
    span.textContent = translate(unit);
    box.appendChild(span);
  }
  // Anything but a number (or nothing, for the default) is marked: it would be saved as is.
  const markInvalid = () => {
    const value = input.value.trim();
    const n = Number(value);
    box.classList.toggle(
      'config-invalid',
      value !== '' && !(integer ? Number.isInteger(n) : isFinite(n)),
    );
  };
  markInvalid();
  // Set back to the default's value by the reset button, without saving it.
  input.addEventListener('config-shown', markInvalid);

  if (!kFractions.has(id)) {
    input.addEventListener('input', markInvalid);
    return;
  }
  const range = document.createElement('input');
  range.type = 'range';
  range.classList.add('config-range');
  range.min = '0';
  range.max = '1';
  range.step = '0.05';
  range.tabIndex = -1;
  const sync = () => {
    const value = parseFloat(input.value !== '' ? input.value : input.placeholder);
    if (!isNaN(value))
      range.value = value.toString();
  };
  sync();
  input.addEventListener('input', markInvalid);
  range.oninput = () => {
    input.value = parseFloat(range.value).toFixed(2);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  input.addEventListener('input', sync);
  input.addEventListener('config-shown', sync);
  box.before(range);
};

const addReset = (left: HTMLElement, inputDiv: HTMLElement, translate: Translate): void => {
  const type = left.dataset.optionType;
  const defaultValue = left.dataset.optionDefault ?? '';
  const control = inputDiv.querySelector<HTMLInputElement | HTMLSelectElement>(
    'input[type="checkbox"], input[type="text"], select',
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

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.classList.add('config-reset');
  reset.title = translate(kResetTitle);
  reset.setAttribute('aria-label', translate(kResetTitle));
  reset.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>';
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
    if (type !== 'html' && type !== 'directory')
      addReset(left, inputDiv, translate);
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
