import { SavedConfig, SavedConfigEntry } from '../../types/event';

// Fork: whether the config differs from what the overlays were last loaded with, so the reload
// prompt goes away when changes are undone.  Values that mean the default (an emptied box, a
// trigger's "default" output, an option set back to its default) count as not being there, as
// they do for the overlays.

const kBaselineStorageKey = 'cactbot-config-baseline';

// Defaults of top level options (group/id) and of a fight's own settings (group/path), from
// config_rows.ts and config_triggers.ts.  A function for a default that follows another option.
export type DefaultValue = string | (() => string);
const defaults = new Map<string, DefaultValue>();

export const setDefault = (group: string, path: string[], value: DefaultValue): void => {
  defaults.set([group, ...path].join('/'), value);
};

let baseline: SavedConfig | undefined;

const copy = (config: SavedConfig): SavedConfig =>
  JSON.parse(JSON.stringify(config)) as SavedConfig;

const sameValue = (value: string, def: string): boolean => {
  if (value === def)
    return true;
  const a = Number(value);
  const b = Number(def);
  return value !== '' && def !== '' && isFinite(a) && isFinite(b) && a === b;
};

const isDefault = (group: string, path: string[], value: SavedConfigEntry): boolean => {
  if (value === '')
    return true;
  const known = defaults.get([group, ...path].join('/'));
  const def = typeof known === 'function' ? known() : known;
  if (def !== undefined && typeof value !== 'object')
    return sameValue(value.toString(), def);
  // A trigger's own output setting.
  if (path[0] === 'triggers' && path[path.length - 1] === 'Output' && value === 'default')
    return true;
  // A shown timeline entry.
  if (path[0] === 'timeline' && path[2] === 'enable' && value === true)
    return true;
  return false;
};

// Options of this page alone: the overlays don't need a reload for them.
const kPageOptions = ['ConfigStyle', 'ConfigTheme', 'ConfigZoom'];
// ...and options that are another program's own setting (the pnsdh OverlayPlugin's TTS volume).
const kLinkedOptions: { [group: string]: string[] } = { raidboss: ['TtsVolume'] };

// The config without anything that means the default, with keys in order.
const normalize = (
  group: string,
  path: string[],
  value: SavedConfigEntry | null | undefined,
): SavedConfigEntry | undefined => {
  if (value === undefined || value === null)
    return undefined;
  if (group === 'general' && path.length === 1 && kPageOptions.includes(path[0] ?? ''))
    return undefined;
  if (path.length === 1 && kLinkedOptions[group]?.includes(path[0] ?? ''))
    return undefined;
  if (Array.isArray(value)) {
    const items = value.map((v) => normalize(group, path, v)).filter((v) => v !== undefined);
    return items.length > 0 ? items as [SavedConfigEntry] : undefined;
  }
  if (typeof value === 'object') {
    const out: { [key: string]: SavedConfigEntry } = {};
    for (const key of Object.keys(value).sort()) {
      const v = normalize(group, [...path, key], value[key]);
      if (v !== undefined)
        out[key] = v;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  return isDefault(group, path, value) ? undefined : value;
};

const canonical = (config: SavedConfig): string => {
  const out: { [group: string]: SavedConfigEntry } = {};
  for (const group of Object.keys(config).sort()) {
    const v = normalize(group, [], config[group]);
    if (v !== undefined)
      out[group] = v;
  }
  return JSON.stringify(out);
};

// The config the overlays run with: kept across reloads of this page alone (as when its style
// changes), and new when ACT starts again.
export const initBaseline = (config: SavedConfig): void => {
  try {
    const stored = window.sessionStorage.getItem(kBaselineStorageKey);
    if (stored !== null) {
      baseline = JSON.parse(stored) as SavedConfig;
      return;
    }
  } catch {
    // Only the current page then.
  }
  setBaseline(config);
};

// After the overlays reload with this config.
export const setBaseline = (config: SavedConfig): void => {
  baseline = copy(config);
  try {
    window.sessionStorage.setItem(kBaselineStorageKey, JSON.stringify(baseline));
  } catch {
    // Only the current page then.
  }
};

export const differsFromBaseline = (config: SavedConfig): boolean =>
  baseline === undefined || canonical(config) !== canonical(baseline);
