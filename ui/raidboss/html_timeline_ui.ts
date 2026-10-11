import { Lang, langToLocale } from '../../resources/languages';
import { UnreachableCode } from '../../resources/not_reached';
import TimerBar from '../../resources/timerbar';
import { LooseTimelineTrigger } from '../../types/trigger';

import { PopupTextGenerator } from './popup-text';
import { RaidbossOptions } from './raidboss_options';
import { TimelineUI } from './timeline';
import { Event } from './timeline_parser';

const kBig = 1000000000; // Something bigger than any fight length in seconds.

const timelineInstructions = {
  en: [
    'These lines are',
    'debug timeline entries.',
    'If you lock the overlay,',
    'they will disappear!',
    'Real timelines automatically',
    'appear when supported.',
  ],
  de: [
    'Diese Zeilen sind',
    'Timeline Debug-Einträge.',
    'Wenn du das Overlay sperrst,',
    'werden sie verschwinden!',
    'Echte Timelines erscheinen automatisch,',
    'wenn sie unterstützt werden.',
  ],
  fr: [
    'Ces lignes sont',
    'des timelines de test.',
    'Si vous bloquez l\'overlay,',
    'elles disparaîtront !',
    'Les vraies Timelines',
    'apparaîtront automatiquement.',
  ],
  ja: [
    'こちらはデバッグ用の',
    'タイムラインです。',
    'オーバーレイをロックすれば、',
    'デバッグ用テキストも消える',
    'サポートするゾーンにはタイム',
    'ラインを動的にロードする。',
  ],
  cn: [
    '显示在此处的是',
    '调试用时间轴。',
    '将此悬浮窗锁定',
    '则会立刻消失',
    '真实的时间轴会根据',
    '当前区域动态加载并显示',
  ],
  ko: [
    '이 막대바는 디버그용',
    '타임라인 입니다.',
    '오버레이를 위치잠금하면,',
    '이 막대바도 사라집니다.',
    '지원되는 구역에서 타임라인이',
    '자동으로 표시됩니다.',
  ],
  tc: [
    '顯示於此處的是',
    '除錯用時間軸。',
    '將此浮動視窗鎖定後，',
    '這些內容會立即消失',
    '正式的時間軸會依據',
    '當前區域動態載入並顯示',
  ],
};

// TODO: Duplicated in 'jobs'
const computeBackgroundFrom = (element: HTMLElement, classList: string): string => {
  const div = document.createElement('div');
  const classes = classList.split('.');
  for (const cls of classes)
    div.classList.add(cls);
  element.appendChild(div);
  const color = window.getComputedStyle(div).background;
  element.removeChild(div);
  return color;
};

export type ActiveBar = {
  bar: TimerBar;
  soonTimeout?: number;
  expiredTimeout?: number;
  // Timeline order and Date.now() based time at which this bar reaches 0, used to find the
  // next bar.
  sortKey?: number;
  endTime?: number;
  channeling?: boolean;
};

export class HTMLTimelineUI extends TimelineUI {
  private init = false;
  private lang: Lang;

  private root: HTMLElement | null = null;
  private barColor: string | null = null;
  private barExpiresSoonColor: string | null = null;
  private timerlist: HTMLElement | null = null;

  private activeBars: { [activebar: string]: ActiveBar } = {};
  // Bars removed by force (a timeline sync removes every bar and adds the same events back right
  // away), kept until the end of the current task so that OnAddTimer can reuse them instead of
  // building new elements, which would also replay skin entry animations on every sync.
  private parkedBars = new Map<string, ActiveBar>();
  private parkedFlushQueued = false;

  private debugElement: HTMLElement | null = null;
  private debugFightTimer: TimerBar | null = null;

  private popupText?: PopupTextGenerator;

  constructor(protected options: RaidbossOptions) {
    super();
    this.lang = this.options.TimelineLanguage || this.options.ParserLanguage || 'en';
    this.AddDebugInstructions();
  }

  protected override Init(): void {
    if (this.init)
      return;
    this.init = true;

    this.root = document.getElementById('timeline-container');
    if (!this.root)
      throw new Error('can\'t find timeline-container');

    // TODO: left for now as backwards compatibility with user css.  Remove this later??
    this.root.classList.add(`lang-${this.lang}`);
    this.root.lang = langToLocale(this.lang);
    if (this.options.Skin !== undefined)
      this.root.classList.add(`skin-${this.options.Skin}`);

    this.barColor = computeBackgroundFrom(this.root, 'timeline-bar-color');
    this.barExpiresSoonColor = computeBackgroundFrom(this.root, 'timeline-bar-color.soon');

    this.timerlist = document.getElementById('timeline');
    if (this.timerlist) {
      this.timerlist.style.gridTemplateRows =
        `repeat(${this.options.MaxNumberOfTimerBars}, min-content)`;
      if (this.options.ReverseTimeline)
        this.timerlist.classList.add('reversed');
    }

    this.activeBars = {};
  }

  protected override AddDebugInstructions(): void {
    const lang = this.lang in timelineInstructions ? this.lang : 'en';
    const instructions = timelineInstructions[lang];

    // Helper for positioning/resizing when locked.
    const helper = document.getElementById('timeline-resize-helper');
    if (!helper)
      return;
    const rows = Math.max(6, this.options.MaxNumberOfTimerBars);
    helper.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

    for (let i = 0; i < this.options.MaxNumberOfTimerBars; ++i) {
      const helperBar = document.createElement('div');
      helperBar.classList.add('text');
      helperBar.classList.add('resize-helper-bar');
      helperBar.classList.add('timeline-bar-color');
      if (i < 1)
        helperBar.classList.add('soon');
      if (i < instructions.length)
        helperBar.innerText = instructions[i] ?? '';
      else
        helperBar.innerText = `${i + 1}`;
      helper.appendChild(helperBar);
    }

    // For simplicity in code, always make debugElement valid,
    // however it does not exist in the raid emulator.
    this.debugElement = document.getElementById('timeline-debug');
    if (!this.debugElement)
      this.debugElement = document.createElement('div');
  }

  public override SetPopupTextInterface(popupText: PopupTextGenerator): void {
    this.popupText = popupText;
  }

  protected override Reset(): void {
    if (this.timeline) {
      delete this.timeline.ui;
      while (this.timerlist && this.timerlist.lastChild)
        this.timerlist.removeChild(this.timerlist.lastChild);
      if (this.debugElement)
        this.debugElement.innerHTML = '';
      this.debugFightTimer = null;
      for (const activeBar of [...Object.values(this.activeBars), ...this.parkedBars.values()]) {
        window.clearTimeout(activeBar.soonTimeout);
        window.clearTimeout(activeBar.expiredTimeout);
      }
      this.activeBars = {};
      this.parkedBars.clear();
    }
  }

  public override OnAddTimer(fightNow: number, e: Event, channeling: boolean): void {
    const parked = this.parkedBars.get(e.id);
    const reuse = parked !== undefined && parked.channeling === channeling &&
      this.activeBars[e.id] === undefined && parked.bar.parentElement !== null;
    let div: HTMLElement;
    let bar: TimerBar;
    if (reuse) {
      this.parkedBars.delete(e.id);
      bar = parked.bar;
      div = parked.bar.parentElement as HTMLElement;
      div.classList.remove('soon', 'expired');
    } else {
      div = document.createElement('div');
      bar = TimerBar.create();
      div.classList.add('timer-bar');
      // Hooks for user css/skins: .channeling, .soon, .expired and .next (the first bar in
      // timeline order; see updateNextBar), and [data-text] to target specific abilities,
      // e.g. `.timer-bar[data-text*="Ultima"]`.
      if (channeling)
        div.classList.add('channeling');
      div.appendChild(bar);
      bar.righttext = 'remain';
      bar.toward = 'right';
      bar.stylefill = !channeling ? 'fill' : 'empty';
    }
    div.dataset.text = e.text;
    bar.duration = channeling ? e.time - fightNow : this.options.ShowTimerBarsAtSeconds;
    bar.value = e.time - fightNow;
    bar.lefttext = e.text;

    // A reused bar already has its event's styles.
    if (e.style && !reuse)
      bar.applyStyles(e.style);

    // Adding a timer with the same id immediately removes the previous.
    const activeBar = this.activeBars[e.id];
    if (activeBar) {
      const parentDiv = activeBar.bar.parentNode;
      parentDiv?.parentNode?.removeChild(parentDiv);
      // Soon timeout is just an optimization to remove, as it's unnecessary.
      if (activeBar.soonTimeout !== undefined) {
        window.clearTimeout(activeBar.soonTimeout);
        activeBar.soonTimeout = undefined;
      }
      window.clearTimeout(activeBar.expiredTimeout);
    }

    const setSoon = () => {
      bar.fg = this.barExpiresSoonColor;
      div.classList.add('soon');
    };
    let soonTimeout: number | undefined = undefined;
    if (!channeling && e.time - fightNow > this.options.BarExpiresSoonSeconds) {
      bar.fg = this.barColor;
      soonTimeout = window.setTimeout(
        setSoon,
        (e.time - fightNow - this.options.BarExpiresSoonSeconds) * 1000,
      );
    } else {
      setSoon();
    }

    // The bar reaches 0 here; it may stay visible a bit longer (KeepExpiredTimerBarsForSeconds).
    const expiredTimeout = window.setTimeout(
      () => div.classList.add('expired'),
      Math.max(e.time - fightNow, 0) * 1000,
    );

    if (e.sortKey) {
      // Invert the order if the timer bars should "grow" in the reverse direction
      div.style.order = ((this.options.ReverseTimeline ? -1 : 1) * e.sortKey).toString();
    }
    if (!reuse)
      this.timerlist?.appendChild(div);
    this.activeBars[e.id] = {
      bar: bar,
      soonTimeout: soonTimeout,
      expiredTimeout: expiredTimeout,
      sortKey: e.sortKey,
      endTime: Date.now() + (e.time - fightNow) * 1000,
      channeling: channeling,
    };
    this.updateNextBar();
  }

  private parkBar(id: string, activeBar: ActiveBar): void {
    if (this.activeBars[id]?.bar === activeBar.bar)
      delete this.activeBars[id];
    if (activeBar.soonTimeout !== undefined)
      window.clearTimeout(activeBar.soonTimeout);
    this.parkedBars.set(id, activeBar);
    if (this.parkedFlushQueued)
      return;
    this.parkedFlushQueued = true;
    queueMicrotask(() => {
      this.parkedFlushQueued = false;
      if (this.parkedBars.size === 0)
        return;
      for (const parked of this.parkedBars.values()) {
        const div = parked.bar.parentNode;
        div?.parentNode?.removeChild(div);
      }
      this.parkedBars.clear();
      this.updateNextBar();
    });
  }

  // Marks the first bar in timeline order (the one the list shows first, e.g. an ongoing
  // cast before later abilities) with .next; bars without a sortKey fall back to the time they
  // reach 0.  An expired bar stays next while it is still shown
  // (KeepExpiredTimerBarsForSeconds); bars being removed are skipped and keep their class, so a
  // skin can animate them out at the same size.
  private updateNextBar(): void {
    const isDone = (div: HTMLElement) => div.classList.contains('animate-timer-bar-removed');
    const rank = (b: ActiveBar): [number, number] => [b.sortKey ?? Infinity, b.endTime ?? Infinity];
    let next: HTMLElement | undefined;
    let nextRank: [number, number] = [Infinity, Infinity];
    for (const activeBar of Object.values(this.activeBars)) {
      const div = activeBar.bar.parentElement;
      if (!div || isDone(div))
        continue;
      const [key, end] = rank(activeBar);
      if (key < nextRank[0] || (key === nextRank[0] && end < nextRank[1])) {
        next = div;
        nextRank = [key, end];
      }
    }
    for (const activeBar of Object.values(this.activeBars)) {
      const div = activeBar.bar.parentElement;
      if (div && !isDone(div))
        div.classList.toggle('next', div === next);
    }
  }

  public override OnRemoveTimer(e: Event, force: boolean): void {
    const activeBar = this.activeBars[e.id];
    if (!activeBar)
      return;

    const div = activeBar.bar.parentNode;
    if (!(div instanceof HTMLElement))
      throw new UnreachableCode();

    window.clearTimeout(activeBar.expiredTimeout);
    const removeBar = () => {
      div?.parentNode?.removeChild(div);
      // A new bar with the same id may have replaced this one in the meantime.
      if (this.activeBars[e.id]?.bar === activeBar.bar)
        delete this.activeBars[e.id];
    };

    // Forced removals skip animations; otherwise a skin animating .timer-bar (e.g. on entry)
    // would leave a stale animationName and the bar would wait forever.
    if (force) {
      this.parkBar(e.id, activeBar);
      return;
    }
    div.classList.add('animate-timer-bar-removed');
    this.updateNextBar();
    if (window.getComputedStyle(div).animationName !== 'none') {
      // Wait for animation to finish, with a fallback in case user css never ends it.
      div.addEventListener('animationend', (ev) => {
        if (ev.target === div)
          removeBar();
      });
      window.setTimeout(removeBar, 3000);
    } else {
      removeBar();
    }
  }

  public override OnShowInfoText(text: string, currentTime: number): void {
    if (this.popupText)
      this.popupText.Info(text, currentTime);
  }

  public override OnShowAlertText(text: string, currentTime: number): void {
    if (this.popupText)
      this.popupText.Alert(text, currentTime);
  }

  public override OnShowAlarmText(text: string, currentTime: number): void {
    if (this.popupText)
      this.popupText.Alarm(text, currentTime);
  }

  public override OnSpeakTTS(text: string, currentTime: number): void {
    if (this.popupText)
      this.popupText.TTS(text, currentTime);
  }

  public override OnTrigger(
    trigger: LooseTimelineTrigger,
    matches: RegExpExecArray | null,
    currentTime: number,
  ): void {
    if (this.popupText)
      this.popupText.Trigger(trigger, matches, currentTime);
  }

  public override OnSyncTime(fightNow: number, running: boolean): void {
    if (!this.options.Debug || !this.debugElement)
      return;

    if (!running) {
      if (this.debugFightTimer)
        this.debugElement.removeChild(this.debugFightTimer);
      this.debugFightTimer = null;
      return;
    }

    if (!this.debugFightTimer) {
      this.debugFightTimer = TimerBar.create();
      this.debugFightTimer.width = '100px';
      this.debugFightTimer.height = '17px';
      this.debugFightTimer.duration = kBig;
      this.debugFightTimer.lefttext = 'elapsed';
      this.debugFightTimer.toward = 'right';
      this.debugFightTimer.stylefill = 'fill';
      this.debugFightTimer.bg = 'transparent';
      this.debugFightTimer.fg = 'transparent';
      // Align it to the 'first' item in the timeline container
      if (this.options.ReverseTimeline)
        this.debugElement.classList.add('reversed');
      this.debugElement.appendChild(this.debugFightTimer);
    }

    // Force this to be reset.
    this.debugFightTimer.elapsed = 0;
    this.debugFightTimer.elapsed = fightNow;
  }
}
