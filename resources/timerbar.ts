import { UnreachableCode } from './not_reached';

// The smallest movement that draw() renders.  A bar usually crosses its lane over many seconds,
// i.e. a small fraction of a pixel per frame at high frame rates, so most frames would repaint
// it for no visible movement.  Half a pixel of the bar's width; until that width is known,
// 1/2000 (below half a pixel on bars up to 1000px wide).
const kMinProgressPixels = 0.5;
const kMinProgressStep = 0.0005;

// Bar widths, kept up to date by one observer shared by all bars (reading them every frame
// would force layout).
const barWidths = new WeakMap<Element, number>();
let barResizeObserver: ResizeObserver | undefined;
const getBarResizeObserver = (): ResizeObserver => {
  barResizeObserver ??= new ResizeObserver((entries) => {
    for (const entry of entries)
      barWidths.set(entry.target, entry.contentRect.width);
  });
  return barResizeObserver;
};

export default class TimerBar extends HTMLElement {
  rootElement: HTMLElement;
  foregroundElement: HTMLElement;
  backgroundElement: HTMLElement;
  leftTextElement: HTMLElement;
  centerTextElement: HTMLElement;
  rightTextElement: HTMLElement;
  runnerTrackElement: HTMLElement;
  runnerElement: HTMLElement;
  runnerFadeElement: HTMLElement;
  runnerFixedElement: HTMLElement;
  private _duration: number;
  private _start: number;
  private _width: string;
  private _height: string;
  private _bg: string;
  private _fg: string;
  private _towardRight: boolean;
  private _fill: boolean;
  private _leftText: string;
  private _centerText: string;
  private _rightText: string;
  private _hideAfter: number;
  private _loop: boolean;
  private _connected: boolean;
  private _hideTimer: number | null;
  // One animation frame loop per bar: setting a time on a running bar must not start another.
  private _frameRequested = false;
  private readonly _onFrame = (): void => {
    this._frameRequested = false;
    this.advance();
  };
  // What draw() last wrote, so that frames which wouldn't change anything skip the DOM writes
  // (and the style recalc, layout and repaint they cause).
  private _drawnProgress?: number;
  private _drawnTexts = new Map<HTMLElement, string>();
  // Read from the skin when the bar is connected (see syncRunner and draw).
  private _runnerEnabled = false;
  private _progressUpdates = true;
  private _runnerAnimations: Animation[] = [];

  static get observedAttributes(): string[] {
    return [
      'duration',
      'value',
      'elapsed',
      'hideafter',
      'lefttext',
      'centertext',
      'righttext',
      'width',
      'height',
      'bg',
      'fg',
      'stylefill',
      'toward',
      'loop',
    ];
  }

  /** create an instance of TimerBar with attributes */
  static create(o?: {
    duration?: number;
    value?: number;
    elapsed?: number;
    hideafter?: number;
    lefttext?: string;
    centertext?: string;
    righttext?: string;
    width?: string;
    height?: string;
    bg?: string;
    fg?: string;
    stylefill?: 'empty' | 'fill';
    toward?: 'left' | 'right';
    loop?: boolean;
  }): TimerBar {
    if (!window.customElements.get('timer-bar'))
      window.customElements.define('timer-bar', TimerBar);

    const element = document.createElement('timer-bar');
    if (!o)
      return element;

    if (typeof o.duration === 'number')
      element.duration = o.duration;
    if (typeof o.value === 'number')
      element.value = o.value;
    if (typeof o.elapsed === 'number')
      element.elapsed = o.elapsed;
    if (typeof o.hideafter === 'number')
      element.hideafter = o.hideafter;
    if (typeof o.lefttext === 'string')
      element.lefttext = o.lefttext;
    if (typeof o.centertext === 'string')
      element.centertext = o.centertext;
    if (typeof o.righttext === 'string')
      element.righttext = o.righttext;
    if (typeof o.width === 'string')
      element.width = o.width;
    if (typeof o.height === 'string')
      element.height = o.height;
    if (typeof o.bg === 'string')
      element.bg = o.bg;
    if (typeof o.fg === 'string')
      element.fg = o.fg;
    if (typeof o.stylefill === 'string')
      element.stylefill = o.stylefill;
    if (typeof o.toward === 'string')
      element.toward = o.toward;
    if (typeof o.loop === 'boolean')
      element.loop = o.loop;
    return element;
  }

  // Background color.
  set bg(c: string | null) {
    if (c === null)
      this.removeAttribute('bg');
    else
      this.setAttribute('bg', c);
  }
  get bg(): string | null {
    return this.getAttribute('bg');
  }

  // Foreground color.
  set fg(c: string | null) {
    if (c === null)
      this.removeAttribute('fg');
    else
      this.setAttribute('fg', c);
  }
  get fg(): string | null {
    return this.getAttribute('fg');
  }

  // The width of the bar.
  set width(w: string | null) {
    if (w === null)
      this.removeAttribute('width');
    else
      this.setAttribute('width', w);
  }
  get width(): string | null {
    return this.getAttribute('width');
  }

  // The height of the bar.
  set height(w: string | null) {
    if (w === null)
      this.removeAttribute('height');
    else
      this.setAttribute('height', w);
  }
  get height(): string | null {
    return this.getAttribute('height');
  }

  // The total length of time to count down.
  set duration(s: number | null) {
    if (s === null)
      this.removeAttribute('duration');
    else
      this.setAttribute('duration', s.toString());
  }
  get duration(): number | null {
    const s = this.getAttribute('duration');
    if (s === null)
      return null;
    return parseFloat(s);
  }

  // The length remaining in the count down.
  set value(s: number) {
    this.setAttribute('value', s.toString());
  }

  get value(): number {
    if (!this._start)
      return this._duration;
    const elapsedMs = Date.now() - this._start;
    return Math.max(0, this._duration - elapsedMs / 1000);
  }

  // The elapsed time.
  set elapsed(s: number) {
    this.setAttribute('elapsed', s.toString());
  }
  get elapsed(): number {
    if (!this._start)
      return 0;
    return (Date.now() - this._start) / 1000;
  }

  // If "right" then animates left-to-right (the default). If "left"
  // then animates right-to-left.
  set toward(t: 'left' | 'right' | null) {
    if (t === null)
      this.removeAttribute('toward');
    else
      this.setAttribute('toward', t);
  }
  get toward(): 'left' | 'right' | null {
    return this.getAttribute('toward') as 'left' | 'right';
  }

  // If "fill" then the progress goes empty-to-full, if "empty" then the
  // progress bar starts full and goes to empty.
  set stylefill(s: 'empty' | 'fill' | null) {
    if (s === null)
      this.removeAttribute('stylefill');
    else
      this.setAttribute('stylefill', s);
  }
  get stylefill(): 'empty' | 'fill' | null {
    return this.getAttribute('stylefill') as 'empty' | 'fill';
  }

  // When the bar reaches 0, it is hidden after this many seconds. If null
  // then it is not hidden.
  set hideafter(h: number | null) {
    if (h === null)
      this.removeAttribute('hideafter');
    else
      this.setAttribute('hideafter', h.toString());
  }
  get hideafter(): number | null {
    const h = this.getAttribute('hideafter');
    if (h === null)
      return null;
    return parseInt(h);
  }

  // Chooses what should be shown in the text field in each area of
  // the bar. Can be one of:
  // empty - nothing is shown.
  // "remain" - shows the remaining time.
  // "duration" - shows the remaining and total duration time
  //              of the bar.
  // "percent" - shows the percentage of remaining time to
  //             the duration.
  // "elapsed"   - shows the elapsed time
  // anything else - the given text is shown literally.
  set lefttext(p: string | null) {
    if (p === null)
      this.removeAttribute('lefttext');
    else
      this.setAttribute('lefttext', p);
  }
  get lefttext(): string | null {
    return this.getAttribute('lefttext');
  }
  set righttext(p: string | null) {
    if (p === null)
      this.removeAttribute('righttext');
    else
      this.setAttribute('righttext', p);
  }
  get righttext(): string | null {
    return this.getAttribute('righttext');
  }
  set centertext(p: string | null) {
    if (p === null)
      this.removeAttribute('centertext');
    else
      this.setAttribute('centertext', p);
  }
  get centertext(): string | null {
    return this.getAttribute('centertext');
  }

  // If this attribute is present, the timer will loop forever.
  set loop(l: boolean) {
    if (l)
      this.setAttribute('loop', '');
    else
      this.removeAttribute('loop');
  }
  get loop(): boolean {
    return this.hasAttribute('loop');
  }

  // This would be used with window.customElements.
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    this.init(root);

    this._connected = false;

    // Default values.
    this._start = 0;
    this._duration = 0;
    this._width = '100%';
    this._height = '100%';
    this._bg = 'black';
    this._fg = 'yellow';
    this._towardRight = false;
    this._fill = false;
    this._leftText = '';
    this._centerText = '';
    this._rightText = '';
    this._hideAfter = -1;
    this._loop = false;
    this._hideTimer = 0;

    this.rootElement = this.shadowRoot?.getElementById('root') as HTMLDivElement;
    this.foregroundElement = this.shadowRoot?.getElementById('fg') as HTMLDivElement;
    this.backgroundElement = this.shadowRoot?.getElementById('bg') as HTMLDivElement;
    this.leftTextElement = this.shadowRoot?.getElementById('lefttext') as HTMLDivElement;
    this.centerTextElement = this.shadowRoot?.getElementById('centertext') as HTMLDivElement;
    this.rightTextElement = this.shadowRoot?.getElementById('righttext') as HTMLDivElement;
    this.runnerTrackElement = this.shadowRoot?.getElementById('runnertrack') as HTMLDivElement;
    this.runnerElement = this.shadowRoot?.getElementById('runner') as HTMLDivElement;
    this.runnerFadeElement = this.shadowRoot?.getElementById('runnerfade') as HTMLDivElement;
    this.runnerFixedElement = this.shadowRoot?.getElementById('runnerfixed') as HTMLDivElement;
  }

  init(root: ShadowRoot): void {
    // The --timerbar-* custom properties let user css and skins restyle the bar from outside
    // the shadow root; the fallbacks are the original defaults. --timerbar-bg/--timerbar-fg
    // override the bg/fg attribute colors, which layout() passes in via --timerbar-*-attr.
    // draw() also sets --timerbar-progress (0-1, the filled fraction) on the root part.
    // timerbar-frame is an empty layer under the others (e.g. for borders a skin animates on
    // their own).  The runner (hidden unless a skin shows timerbar-runner-track) moves with the
    // progress through animations the compositor runs, like the fill: in place at 1, and at 0
    // translated by its own width away from the side the fill is anchored to.  Its last item,
    // timerbar-runner-e, has an opacity equal to the progress, and timerbar-runner-fixed moves
    // the other way so it stays in place (shown where the runner is, if it clips it) (see
    // syncRunner).
    root.innerHTML = `
      <style>
        .timerbar-root {
          position: relative;
          border: var(--timerbar-border, 1px solid black);
          border-radius: var(--timerbar-border-radius, 0);
          overflow: var(--timerbar-overflow, visible);
          box-sizing: border-box;
        }
        .timerbar-bg {
          position: absolute;
          width: 100%;
          height: 100%;
          background: var(--timerbar-bg, var(--timerbar-bg-attr));
          opacity: var(--timerbar-bg-opacity, 0.8);
        }
        .timerbar-fg {
          position: absolute;
          width: 100%;
          height: 100%;
          background: var(--timerbar-fg, var(--timerbar-fg-attr));
          opacity: var(--timerbar-fg-opacity, 1.0);
        }
        .timerbar-runner-track {
          display: none;
        }
        .timerbar-frame {
          border-radius: inherit;
        }
        .timerbar-frame,
        .timerbar-runner-track,
        .timerbar-runner,
        .timerbar-runner-item {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
        }
        .text {
          position: absolute;
          font-family: var(--timerbar-font-family, arial);
          font-weight: var(--timerbar-font-weight, bold);
          color: var(--timerbar-text-color, white);
          text-shadow: var(--timerbar-text-shadow, -1px 0 3px black, 0 1px 3px black, 1px 0 3px black, 0 -1px 3px black);
          will-change: content;
        }
        .text-container {
          position: absolute;
          left: 0px;
          top: calc(50% - 1.2ex);
          width: 100%;
          height: 100%;
          overflow: hidden;
        }
        .timerbar-lefttext {
          position: relative;
          text-align: left;
          padding: 0px 0.4em 0px 0.4em;
        }
        .timerbar-centertext {
          position: relative;
          text-align: center;
          padding: 0px 0.4em 0px 0.4em;
        }
        .timerbar-righttext {
          position: relative;
          text-align: right;
          padding: 0px 0.4em 0px 0.4em;
        }
        :host-context(.just-a-number) .timerbar-root {
          border: none;
        }
        :host-context(.just-a-number) .timerbar-bg {
          display: none;
        }
        :host-context(.just-a-number) .timerbar-fg {
          display: none;
        }
        /* Chinese better visibility CSS */
        :lang(zh-CN) .text-container {
          top: calc(50% - 1.4ex);
          overflow: visible;
        }
        :lang(zh-CN) .timerbar-righttext {
          top: 0.2ex;
        }
        /* Korean better visibility CSS */
        :lang(ko) .text-container {
          top: calc(50% - 1.5ex);
          height: calc(100% + 0.3ex);
        }
        :lang(ko) .timerbar-righttext {
          top: 0.3ex;
        }
      </style>
      <div id="root" class="timerbar-root" part="timerbar-root">
        <div class="timerbar-frame" part="timerbar-frame"></div>
        <div id="bg" class="timerbar-bg" part="timerbar-bg"></div>
        <div id="fg" class="timerbar-fg" part="timerbar-fg"></div>
        <div id="runnertrack" class="timerbar-runner-track" part="timerbar-runner-track">
          <div id="runner" class="timerbar-runner" part="timerbar-runner">
            <div id="runnerfixed" class="timerbar-runner-item" part="timerbar-runner-fixed"></div>
            <div class="timerbar-runner-item" part="timerbar-runner-a"></div>
            <div class="timerbar-runner-item" part="timerbar-runner-b"></div>
            <div class="timerbar-runner-item" part="timerbar-runner-c"></div>
            <div class="timerbar-runner-item" part="timerbar-runner-d"></div>
            <div id="runnerfade" class="timerbar-runner-item" part="timerbar-runner-e"></div>
          </div>
        </div>
        <div class="text-container" part="text-container">
          <div id="lefttext" class="text timerbar-lefttext" part="text timerbar-lefttext"></div>
        </div>
        <div class="text-container" part="text-container">
          <div id="centertext" class="text timerbar-centertext" part="text timerbar-centertext"></div>
        </div>
        <div class="text-container" part="text-container">
          <div id="righttext" class="text timerbar-righttext" part="text timerbar-righttext"></div>
        </div>
      </div>
    `;
  }

  connectedCallback(): void {
    this._connected = true;
    // Skins choose these once per bar: a shown runner track, and
    // `--timerbar-progress-updates: off` to stop the per-frame progress writes (the fg scaleX and
    // --timerbar-progress) when nothing reads them, which saves a style recalc every frame.
    this._runnerEnabled = window.getComputedStyle(this.runnerTrackElement).display !== 'none';
    this._progressUpdates = window.getComputedStyle(this.rootElement)
      .getPropertyValue('--timerbar-progress-updates').trim() !== 'off';
    getBarResizeObserver().observe(this.rootElement);
    this.layout();
    this.updateText();
    if (!this._start)
      this.setvalue(this._duration);
    else
      this.advance();
  }

  disconnectedCallback(): void {
    this._connected = false;
    getBarResizeObserver().unobserve(this.rootElement);
    this.cancelRunner();
  }

  attributeChangedCallback(name: string, _oldValue: string | number, newValue: string): void {
    if (name === 'duration') {
      this._duration = Math.max(parseFloat(newValue), 0);
      this.setvalue(this._duration);
    } else if (name === 'value') {
      this.setvalue(Math.max(parseFloat(newValue), 0));
    } else if (name === 'elapsed') {
      this.setvalue(this._duration - Math.max(parseFloat(newValue), 0));
    } else if (name === 'width') {
      this._width = newValue;
      this.layout();
    } else if (name === 'height') {
      this._height = newValue;
      this.layout();
    } else if (name === 'bg') {
      this._bg = newValue;
      this.layout();
    } else if (name === 'fg') {
      this._fg = newValue;
      this.layout();
    } else if (name === 'stylefill') {
      this._fill = newValue === 'fill';
      this.layout();
    } else if (name === 'toward') {
      this._towardRight = newValue === 'right';
      this.layout();
    } else if (name === 'lefttext') {
      const update = newValue !== this._leftText && this._connected;
      this._leftText = newValue;
      if (update)
        this.updateText();
    } else if (name === 'centertext') {
      const update = newValue !== this._centerText && this._connected;
      this._centerText = newValue;
      if (update)
        this.updateText();
    } else if (name === 'righttext') {
      const update = newValue !== this._rightText && this._connected;
      this._rightText = newValue;
      if (update)
        this.updateText();
    } else if (name === 'hideafter') {
      this._hideAfter = Math.max(this.hideafter ?? 0, 0);
      if (this.value === 0) {
        if (this._hideAfter >= 0)
          this.hide();
        else
          this.show();
      }
    } else if (name === 'loop') {
      this._loop = newValue !== null;
    }

    if (this._connected)
      this.draw();
  }

  layout(): void {
    if (!this._connected)
      return;

    this._drawnProgress = undefined;

    // Not inline backgrounds, so that --timerbar-bg/--timerbar-fg and ::part() can override them.
    this.backgroundElement.style.setProperty('--timerbar-bg-attr', this._bg);
    this.foregroundElement.style.setProperty('--timerbar-fg-attr', this._fg);
    this.rootElement.style.width = this._width;
    this.rootElement.style.height = this._height;

    // To start full and animate to empty, we animate backwards and flip
    // the direction.
    if (this._towardRight !== this._fill) {
      this.foregroundElement.style.left = '';
      this.foregroundElement.style.right = '0px';
      this.foregroundElement.style.transformOrigin = 'right center';
    } else {
      this.foregroundElement.style.left = '0px';
      this.foregroundElement.style.right = '';
      this.foregroundElement.style.transformOrigin = 'left center';
    }
    this.syncRunner();
  }

  // Restarts the runner animations at the bar's current time.  Called whenever the time or the
  // fill direction is set; in between they run on their own, without any per-frame work here.
  private syncRunner(): void {
    this.cancelRunner();
    if (!this._connected || !this._runnerEnabled)
      return;
    const durationMs = this._duration * 1000;
    const elapsedMs = Math.min(Math.max(Date.now() - this._start, 0), durationMs);
    // Progress at the start and the end, as draw() computes it.
    const from = this._fill ? 0 : 1;
    const to = 1 - from;
    // The fill is anchored to the right when layout() sets its transform origin there.
    const anchoredRight = this._towardRight !== this._fill;
    const offset = (progress: number): number =>
      (anchoredRight ? 1 - progress : progress - 1) * 100;
    const timing: KeyframeAnimationOptions = { duration: durationMs, fill: 'both' };
    this._runnerAnimations = [
      this.runnerElement.animate([
        { transform: `translateX(${offset(from)}%)` },
        { transform: `translateX(${offset(to)}%)` },
      ], timing),
      this.runnerFixedElement.animate([
        { transform: `translateX(${-offset(from)}%)` },
        { transform: `translateX(${-offset(to)}%)` },
      ], timing),
      this.runnerFadeElement.animate([{ opacity: from }, { opacity: to }], timing),
    ];
    // A start time rather than a current time: a current time would only count from when the
    // animation actually starts, a frame or more later.
    const startTime = performance.now() - elapsedMs;
    for (const animation of this._runnerAnimations)
      animation.startTime = startTime;
  }

  private cancelRunner(): void {
    for (const animation of this._runnerAnimations)
      animation.cancel();
    this._runnerAnimations = [];
  }

  updateText(): void {
    this._drawnTexts.clear();
    const varyingTexts = ['elapsed', 'duration', 'percent', 'remain'];
    // These values are filled in during draw() when the values change.
    if (!varyingTexts.includes(this._leftText)) {
      // Otherwise the value is fixed so it can be set here.
      this.leftTextElement.innerHTML = this._leftText;
    }
    if (!varyingTexts.includes(this._centerText))
      this.centerTextElement.innerHTML = this._centerText;

    if (!varyingTexts.includes(this._rightText))
      this.rightTextElement.innerHTML = this._rightText;
  }

  // Sets a text that changes while the bar runs, only when it differs from the last one.
  private drawText(element: HTMLElement, text: string): void {
    if (this._drawnTexts.get(element) === text)
      return;
    this._drawnTexts.set(element, text);
    element.innerText = text;
  }

  draw(): void {
    const elapsedSec = (Date.now() - this._start) / 1000;
    const remainSec = Math.max(0, this._duration - elapsedSec);
    let percent = this._duration <= 0 ? 0 : remainSec / this._duration;
    // Keep it between 0 and 1.
    percent = Math.min(1, Math.max(0, percent));
    const displayRemain = remainSec ? remainSec.toFixed(1) : '';
    const displayElapsed = elapsedSec.toFixed(1);
    if (this._fill)
      percent = 1.0 - percent;
    const ended = remainSec <= 0;
    const drawn = this._drawnProgress;
    const width = barWidths.get(this.rootElement) ?? 0;
    const minStep = width > 0 ? kMinProgressPixels / width : kMinProgressStep;
    if (
      this._progressUpdates && percent !== drawn &&
      (ended || drawn === undefined || Math.abs(percent - drawn) >= minStep)
    ) {
      this._drawnProgress = percent;
      this.foregroundElement.style.transform = `scaleX(${percent.toFixed(3)})`;
      // Exposed for user css/skins (inherited by every part), e.g. revealing a fixed gradient
      // with clip-path instead of the default scaleX (which stretches it), or placing effects
      // at the fill edge.
      this.rootElement.style.setProperty('--timerbar-progress', percent.toFixed(4));
    }
    // `ended` is set in the same frame the remaining time hits 0 (and the "remain" text goes
    // empty), so css can replace it without a gap, e.g. `timer-bar[ended]::part(...)`.
    if (ended !== this.hasAttribute('ended'))
      this.toggleAttribute('ended', ended);
    if (this._leftText !== '') {
      if (this._leftText === 'remain')
        this.drawText(this.leftTextElement, displayRemain);
      else if (this._leftText === 'duration')
        this.drawText(this.leftTextElement, `${displayRemain} / ${this._duration}`);
      else if (this._leftText === 'percent')
        this.drawText(this.leftTextElement, `${(percent * 100).toFixed(1)} %`);
      else if (this._leftText === 'elapsed')
        this.drawText(this.leftTextElement, displayElapsed);
    }
    if (this._centerText !== '') {
      if (this._centerText === 'remain')
        this.drawText(this.centerTextElement, displayRemain);
      else if (this._centerText === 'duration')
        this.drawText(this.centerTextElement, `${displayRemain} / ${this._duration}`);
      else if (this._centerText === 'percent')
        this.drawText(this.centerTextElement, `${(percent * 100).toFixed(1)} %`);
      else if (this._centerText === 'elapsed')
        this.drawText(this.centerTextElement, displayElapsed);
    }
    if (this._rightText !== '') {
      if (this._rightText === 'remain')
        this.drawText(this.rightTextElement, displayRemain);
      else if (this._rightText === 'duration')
        this.drawText(this.rightTextElement, `${displayRemain} / ${this._duration}`);
      else if (this._rightText === 'percent')
        this.drawText(this.rightTextElement, `${(percent * 100).toFixed(1)} %`);
      else if (this._rightText === 'elapsed')
        this.drawText(this.rightTextElement, displayElapsed);
    }
  }

  // Apply all styles from an object where keys are CSS properties
  applyStyles(styles: { [s: string]: string }): void {
    const s = Object.keys(styles).map((k) => {
      return `${k}:${styles?.[k] ?? ''};`;
    }).join('');

    const left = this.shadowRoot?.getElementById('lefttext');
    const center = this.shadowRoot?.getElementById('centertext');
    const right = this.shadowRoot?.getElementById('righttext');
    if (!left || !center || !right)
      throw new UnreachableCode();
    left.style.cssText += s;
    center.style.cssText += s;
    right.style.cssText += s;
  }

  setvalue(remainSec: number): void {
    const elapsedSec = Math.max(0, this._duration - remainSec);
    this._start = Date.now() - elapsedSec * 1000;

    if (!this._connected)
      return;

    this.show();
    clearTimeout(this._hideTimer ?? 0);
    this._hideTimer = null;

    this.syncRunner();
    this.advance();
  }

  advance(): void {
    // If the element has been disconnected from the DOM, stop requesting animation frames
    if (!this._connected)
      return;

    const elapsedSec = (Date.now() - this._start) / 1000;
    if (elapsedSec >= this._duration) {
      // Timer completed
      if (this._loop && this._duration > 0) {
        // Sets the remaining time to include any extra elapsed seconds past the duration
        this.setvalue(this._duration + (this._duration - elapsedSec) % this._duration);
        return;
      }

      // Sets the attribute to 0 so users can see the counter is done, and
      // if they set the same duration again it will count.
      this._duration = 0;
      if (this._hideAfter > 0)
        this._hideTimer = window.setTimeout(this.hide.bind(this), this._hideAfter * 1000);
      else if (this._hideAfter === 0)
        this.hide();
    } else if (!this._frameRequested) {
      // Timer not completed, request another animation frame
      this._frameRequested = true;
      window.requestAnimationFrame(this._onFrame);
    }

    this.draw();
  }

  show(): void {
    if (this._connected)
      this.rootElement.style.display = 'block';
  }

  hide(): void {
    if (this._connected)
      this.rootElement.style.display = 'none';
  }
}

window.customElements.define('timer-bar', TimerBar);

declare global {
  interface HTMLElementTagNameMap {
    'timer-bar': TimerBar;
  }
}
