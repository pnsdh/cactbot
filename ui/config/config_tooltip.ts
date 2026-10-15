// Fork: tooltips for the config page: one shared box, shown when an element with one is pointed
// at or focused, and kept while the pointer moves into it (descriptions can have links).

let box: HTMLElement | undefined;
let owner: HTMLElement | undefined;
let showTimer: number | undefined;
let hideTimer: number | undefined;
// HTML, read when shown.
type Content = () => string;
const contents = new WeakMap<HTMLElement, Content>();

const kShowDelayMs = 250;
const kHideDelayMs = 150;
const kGap = 6;

const getBox = (): HTMLElement => {
  if (box !== undefined)
    return box;
  box = document.createElement('div');
  box.classList.add('config-tooltip');
  box.setAttribute('role', 'tooltip');
  box.addEventListener('mouseenter', () => window.clearTimeout(hideTimer));
  box.addEventListener('mouseleave', () => scheduleHide());
  document.body.appendChild(box);
  return box;
};

const pageZoom = (): number =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue('zoom')) || 1;

// The page may be zoomed with CSS zoom (the config page's scale option).  Element rects then come
// either zoomed or not, depending on the Chromium version; this finds which from the element
// itself, and returns rects in the tooltip's own (zoomed) coordinates.
const rectOf = (element: HTMLElement): DOMRect => {
  const rect = element.getBoundingClientRect();
  const zoom = pageZoom();
  const rectScale = element.offsetWidth > 0 ? rect.width / element.offsetWidth : 1;
  // Rects in screen pixels (newer Chromium) are divided back by the zoom.
  const k = Math.abs(rectScale - 1) < 0.01 ? 1 : 1 / zoom;
  return new DOMRect(rect.left * k, rect.top * k, rect.width * k, rect.height * k);
};

const place = (target: HTMLElement, tip: HTMLElement): void => {
  const zoom = pageZoom();
  const width = window.innerWidth / zoom;
  const height = window.innerHeight / zoom;
  const r = rectOf(target);
  const tipWidth = tip.offsetWidth;
  const tipHeight = tip.offsetHeight;
  let left = r.left + r.width / 2 - tipWidth / 2;
  left = Math.max(8, Math.min(left, width - tipWidth - 8));
  // Below, unless it doesn't fit there.
  let top = r.bottom + kGap;
  if (top + tipHeight > height - 8 && r.top - kGap - tipHeight > 8)
    top = r.top - kGap - tipHeight;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
};

const show = (target: HTMLElement): void => {
  const content = contents.get(target);
  if (content === undefined)
    return;
  const tip = getBox();
  tip.innerHTML = content();
  owner = target;
  tip.classList.add('config-tooltip-shown');
  place(target, tip);
};

const hide = (): void => {
  window.clearTimeout(showTimer);
  owner = undefined;
  box?.classList.remove('config-tooltip-shown');
};

const scheduleHide = (): void => {
  window.clearTimeout(showTimer);
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(hide, kHideDelayMs);
};

// `content` is HTML, read when shown.
export const setTooltip = (target: HTMLElement, content: Content): void => {
  const first = !contents.has(target);
  contents.set(target, content);
  if (!first)
    return;
  const open = () => {
    window.clearTimeout(hideTimer);
    window.clearTimeout(showTimer);
    if (owner === target)
      return;
    showTimer = window.setTimeout(() => show(target), owner !== undefined ? 0 : kShowDelayMs);
  };
  target.addEventListener('mouseenter', open);
  target.addEventListener('focus', open);
  target.addEventListener('mouseleave', scheduleHide);
  target.addEventListener('blur', scheduleHide);
};

// Scrolling or clicking elsewhere closes it; Escape too.
if (typeof document !== 'undefined') {
  document.addEventListener('scroll', hide, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape')
      hide();
  });
}
