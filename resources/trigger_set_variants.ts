// Fork: fights the fork has its own triggers and timeline for keep upstream's files where they
// are (ui/raidboss/data/...); the fork's are in ui/raidboss/data/fork/ at the same path, with the
// same trigger set id.  Each user picks per fight which one loads (saved as raidboss >
// TriggerSetVariant > <set id>: 'custom', the default, or 'upstream'); the other is left out of
// the files before anything else (raidboss, its config page, the raid emulator) sees them.

export const kForkDir = 'fork/';

export type TriggerSetVariant = 'custom' | 'upstream';
export type TriggerSetVariants = { [setId: string]: TriggerSetVariant };

// A data file's path (as the manifest keys it) is the fork's own version.
export const isForkFile = (filename: string): boolean => filename.startsWith(kForkDir);

// A data file's path as upstream has it (without fork/).
export const withoutForkDir = (filename: string): string =>
  isForkFile(filename) ? filename.slice(kForkDir.length) : filename;

type DataFile = { id?: unknown; zoneId?: unknown } | string | undefined;

const setIdOf = (data: DataFile): string | undefined =>
  typeof data === 'object' && typeof data.id === 'string' ? data.id : undefined;

const isTriggerFile = (filename: string): boolean =>
  filename.endsWith('.ts') || filename.endsWith('.js');

// Trigger set ids that have both the fork's version and upstream's.
export const variantSetIds = (files: { [filename: string]: DataFile }): Set<string> => {
  const fork = new Set<string>();
  const upstream = new Set<string>();
  for (const [filename, data] of Object.entries(files)) {
    const id = setIdOf(data);
    if (!isTriggerFile(filename) || id === undefined)
      continue;
    (isForkFile(filename) ? fork : upstream).add(id);
  }
  return new Set([...fork].filter((id) => upstream.has(id)));
};

// The files with, for each such fight, only the version chosen (timelines all kept: one that no
// trigger file names is never loaded).
export const selectVariants = <T extends DataFile>(
  files: { [filename: string]: T },
  choice: (setId: string) => TriggerSetVariant,
): { [filename: string]: T } => {
  const ids = variantSetIds(files);
  if (ids.size === 0)
    return files;
  return Object.fromEntries(
    Object.entries(files).filter(([filename, data]) => {
      const id = setIdOf(data);
      if (!isTriggerFile(filename) || id === undefined || !ids.has(id))
        return true;
      return (choice(id) === 'upstream') !== isForkFile(filename);
    }),
  );
};

// Zones whose fight is played with upstream's version instead of the fork's (their timeline
// edits are kept apart, as '<zone id>@upstream').
export const upstreamZones = (
  files: { [filename: string]: DataFile },
  variants: TriggerSetVariants,
): Set<number> => {
  const zones = new Set<number>();
  // Only fights that still have both versions (both load otherwise, each with its own edits).
  const paired = variantSetIds(files);
  for (const [filename, data] of Object.entries(files)) {
    const id = setIdOf(data);
    if (!isForkFile(filename) || id === undefined || !paired.has(id) || variants[id] !== 'upstream')
      continue;
    if (typeof data !== 'object')
      continue;
    const zoneId = data.zoneId;
    for (const zone of Array.isArray(zoneId) ? zoneId : [zoneId]) {
      if (typeof zone === 'number')
        zones.add(zone);
    }
  }
  return zones;
};

// The key a zone's timeline edits are saved under.
export const timelineZoneKey = (zoneId: number, upstream: boolean): string =>
  upstream ? `${zoneId}@upstream` : zoneId.toString();
