// Fork: TypeScript user files (user/raidboss/*.ts and the like), so a trigger file can be copied
// from cactbot's sources as it is.  Types are only stripped (TypeScript's transpileModule, loaded
// the first time a .ts file is seen and its output kept in localStorage), never checked.  Imports
// of cactbot's modules are given the same modules the overlay has, and `export default` of a
// trigger set adds it to Options.Triggers; `Options` and the globals of .js user files are there
// too, so a .js file renamed to .ts runs as before.

import { BaseOptions } from '../types/data';
import * as oopsyCommon from '../ui/oopsyraidsy/oopsy_common';

import * as conditions from './conditions';
import * as contentType from './content_type';
import * as languages from './languages';
import * as netRegexes from './netregexes';
import * as notReached from './not_reached';
import * as occultCrescentCommon from './occult_crescent_common';
import * as outputs from './outputs';
import * as overlayPluginApi from './overlay_plugin_api';
import * as regexes from './regexes';
import * as responses from './responses';
import * as util from './util';
import * as zoneId from './zone_id';
import * as zoneInfo from './zone_info';

// What `import ... from '../../../../../resources/<name>'` gives, by file name (and oopsy's
// `../../../oopsy_common`).  Imports used only as types (types/*, ConfigValue from user_config...)
// are removed by the transpiler.
const modules: { [name: string]: unknown } = {
  'conditions': conditions,
  'content_type': contentType,
  'languages': languages,
  'netregexes': netRegexes,
  'not_reached': notReached,
  'occult_crescent_common': occultCrescentCommon,
  'oopsy_common': oopsyCommon,
  'outputs': outputs,
  'overlay_plugin_api': overlayPluginApi,
  'regexes': regexes,
  'responses': responses,
  'util': util,
  'zone_id': zoneId,
  'zone_info': zoneInfo,
};

// The globals .js user files have (see user_config.ts).
const globals: { [name: string]: unknown } = {
  Conditions: conditions.default,
  ContentType: contentType.default,
  NetRegexes: netRegexes.default,
  Regexes: regexes.default,
  Responses: responses.Responses,
  Outputs: outputs.default,
  Util: util.default,
  Directions: util.Directions,
  ZoneId: zoneId.default,
  ZoneInfo: zoneInfo.default,
};

// Bump when the transpiler options change, so that old output is not reused.  Entries are also
// told apart by the cactbot version (`tag`): a new release may come with a new TypeScript.
const cacheVersion = 4;
const cachePrefix = 'cbkr-user-ts:';
// Problems told of a file that does not parse: the first ones (one missing brace in a big copied
// file can make dozens more).
const kMaxErrors = 3;

// The JavaScript (with the .ts line of each of its lines, for errors), or the errors of a file
// that does not parse (kept too, so that a broken file does not load the transpiler every time
// until it is fixed).
export type UserTsOutput = { js: string; lines: number[] };
type Result = UserTsOutput | { errors: string[] };
type CacheEntry = { v: number; hash: string; result: Result };

const base64Digits = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// For each generated line of a source map's `mappings`, the (1-based) source line it starts in,
// or 0 for a line with nothing of the source.
const sourceLines = (mappings: string): number[] => {
  const lines: number[] = [];
  let sourceLine = 0;
  for (const line of mappings.split(';')) {
    let first = 0;
    for (const segment of line.split(',')) {
      if (segment === '')
        continue;
      // Base64 VLQ: 5 bits a digit, low bit of the value its sign.
      const fields: number[] = [];
      let value = 0;
      let shift = 0;
      for (const char of segment) {
        const digit = base64Digits.indexOf(char);
        value += (digit & 31) << shift;
        if (digit & 32) {
          shift += 5;
          continue;
        }
        fields.push(value & 1 ? -(value >> 1) : value >> 1);
        value = 0;
        shift = 0;
      }
      // Generated column, source index, source line (relative to the previous one), column.
      const delta = fields[2];
      if (delta === undefined)
        continue;
      sourceLine += delta;
      if (first === 0)
        first = sourceLine + 1;
    }
    lines.push(first);
  }
  return lines;
};

export const isUserTsFile = (filename: string): boolean => {
  const lower = filename.toLowerCase();
  return lower.endsWith('.ts') && !lower.endsWith('.d.ts');
};

// FNV-1a, enough to tell an edited file from the cached one.
const hashText = (text: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; ++i) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${text.length}-${(hash >>> 0).toString(16)}`;
};

const isResult = (value: unknown): value is Result => {
  if (typeof value !== 'object' || value === null)
    return false;
  const result = value as { js?: unknown; lines?: unknown; errors?: unknown };
  if (typeof result.js === 'string')
    return Array.isArray(result.lines);
  return Array.isArray(result.errors) && result.errors.every((e) => typeof e === 'string');
};

const readCache = (key: string, hash: string): Result | undefined => {
  try {
    const item = window.localStorage.getItem(`${cachePrefix}${key}`);
    if (item === null)
      return;
    const entry = JSON.parse(item) as Partial<CacheEntry>;
    if (entry.v === cacheVersion && entry.hash === hash && isResult(entry.result))
      return entry.result;
  } catch {
    // No storage (or a broken entry): transpile again.
  }
};

const cacheKeys = (): string[] => {
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; ++i) {
    const key = window.localStorage.key(i);
    if (key !== null && key.startsWith(cachePrefix))
      keys.push(key);
  }
  return keys;
};

const writeCache = (key: string, hash: string, result: Result): void => {
  const item = JSON.stringify({ v: cacheVersion, hash: hash, result: result });
  try {
    window.localStorage.setItem(`${cachePrefix}${key}`, item);
  } catch {
    // Full (the storage is shared by every cactbot page): this cache gives way (all of it, so
    // files too big for the storage together are transpiled again on every load).
    try {
      for (const old of cacheKeys())
        window.localStorage.removeItem(old);
      window.localStorage.setItem(`${cachePrefix}${key}`, item);
    } catch {
      // No storage: transpiled again next time.
    }
  }
};

// Drops the entries of an overlay's user files that are no longer there (`filenames`: the .js
// and .ts files it has now).
export const pruneUserTsCache = (overlayName: string, filenames: string[]): void => {
  try {
    const overlay = overlayName.toLowerCase();
    const current = new Set(filenames);
    for (const key of cacheKeys()) {
      const filename = key.slice(cachePrefix.length).replace(/^js:/, '');
      const lower = filename.toLowerCase();
      const own = lower.startsWith(`${overlay}/`) || lower.startsWith(`${overlay}\\`) ||
        lower === `${overlay}.ts` || lower === `${overlay}.js`;
      if (own && !current.has(filename))
        window.localStorage.removeItem(key);
    }
  } catch {
    // No storage.
  }
};

type TypeScript = typeof import('typescript');

// Loaded the first time it is needed (undefined if it cannot be: then .ts files are skipped, not
// the overlay).
let transpiler: Promise<TypeScript | undefined> | undefined;
const loadTranspiler = (): Promise<TypeScript | undefined> => {
  transpiler ??= import(/* webpackChunkName: "ui/common/typescript" */ 'typescript').then(
    (m) => m.default,
    (e) => {
      console.log('*** ERROR IN USER FILE ***');
      console.log('The TypeScript transpiler could not be loaded:', e);
      return undefined;
    },
  );
  return transpiler;
};

// "<line>:<column>: <message>" for the first problems the parser found in the file (not those of
// the options, which would be the same for every file).
const describe = (ts: TypeScript, list: readonly import('typescript').Diagnostic[]): string[] => {
  const errors = list.filter((error) => error.file !== undefined).map((error) => {
    const message = ts.flattenDiagnosticMessageText(error.messageText, '\n');
    const at = error.file !== undefined && error.start !== undefined
      ? error.file.getLineAndCharacterOfPosition(error.start)
      : undefined;
    return `${at ? `${at.line + 1}:${at.character + 1}` : ''}: ${message}`;
  });
  if (errors.length <= kMaxErrors)
    return errors;
  return [...errors.slice(0, kMaxErrors), `: (${errors.length - kMaxErrors} more)`];
};

const errorText = (e: unknown): string => e instanceof Error ? e.message : String(e);

const transpile = (ts: TypeScript, filename: string, source: string): Result => {
  const result = ts.transpileModule(source, {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: {
      // What the overlays' Chromium runs.
      target: ts.ScriptTarget.ES2020,
      // require / exports, given to the file by runUserTsFile.
      module: ts.ModuleKind.CommonJS,
      // Only for `lines`: an inline one (with the source again) would make the cache several
      // times bigger, for the developer tools only.
      sourceMap: true,
    },
  });
  const errors = describe(ts, result.diagnostics ?? []);
  if (errors.length > 0)
    return { errors: errors };
  const mappings = (JSON.parse(result.sourceMapText ?? '{}') as { mappings?: string }).mappings;
  return {
    js: result.outputText.replace(/\/\/# sourceMappingURL=\S*\s*$/, ''),
    lines: sourceLines(mappings ?? ''),
  };
};

// JavaScript for each of `filenames` (keys of `files`); a file that does not parse is left out,
// with its errors in the console and given to `onErrors`.
export const transpileUserTsFiles = async (
  files: { [filename: string]: string },
  filenames: string[],
  tag: string,
  onErrors?: (filename: string, errors: string[]) => void,
): Promise<{ [filename: string]: UserTsOutput }> => {
  const output: { [filename: string]: UserTsOutput } = {};
  const add = (filename: string, result: Result) => {
    if ('js' in result) {
      output[filename] = result;
      return;
    }
    console.log('*** ERROR IN USER FILE ***');
    for (const error of result.errors)
      console.log(`${filename}:${error}`);
    onErrors?.(filename, result.errors);
  };
  const todo: { filename: string; source: string; hash: string }[] = [];
  for (const filename of filenames) {
    const source = files[filename] ?? '';
    const hash = hashText(`${tag}\n${source}`);
    const cached = readCache(filename, hash);
    if (cached !== undefined)
      add(filename, cached);
    else
      todo.push({ filename: filename, source: source, hash: hash });
  }
  if (todo.length === 0)
    return output;

  const ts = await loadTranspiler();
  for (const { filename, source, hash } of todo) {
    if (ts === undefined) {
      add(filename, { errors: [': the TypeScript transpiler could not be loaded'] });
      continue;
    }
    let result: Result;
    try {
      result = transpile(ts, filename, source);
    } catch (e) {
      // The transpiler failing on it is the file's problem, not the overlay's.
      result = { errors: [`: ${errorText(e)}`] };
    }
    add(filename, result);
    writeCache(filename, hash, result);
  }
  return output;
};

// The line in a user file of the first stack frame in it: frames are at the file's sourceURL
// (which the plugin adds), or <anonymous> without one.
const stackLine = (stack: string | undefined, source: string): number | undefined => {
  if (stack === undefined)
    return;
  const url = /\/\/# sourceURL=(.*)$/m.exec(source)?.[1]?.trim();
  const at = url !== undefined ? stack.indexOf(`${url}:`) : -1;
  const frame = url !== undefined && at >= 0
    ? /^:(\d+):\d+/.exec(stack.slice(at + url.length))
    : /<anonymous>:(\d+):\d+/.exec(stack);
  return frame?.[1] !== undefined ? parseInt(frame[1]) : undefined;
};

// Where in a .js user file an error while it was run is, as "<line>" or "<line>:<column>:
// <message>".  A syntax error of the file itself has no stack frame in it: with `parse`, the
// TypeScript parser finds it (loaded for that, and its answer cached by the file's text, as
// transpiled files are).
export const locateJsError = async (
  filename: string,
  source: string,
  error: unknown,
  tag: string,
  parse: boolean,
): Promise<string | undefined> => {
  if (!(error instanceof Error))
    return;
  const line = stackLine(error.stack, source);
  // Also a SyntaxError of something the file ran (e.g. a bad regular expression).
  if (line !== undefined || !(error instanceof SyntaxError) || !parse)
    return line?.toString();
  const key = `js:${filename}`;
  const hash = hashText(`${tag}\n${source}`);
  const cached = readCache(key, hash);
  if (cached !== undefined)
    return 'errors' in cached ? cached.errors[0] : undefined;
  const ts = await loadTranspiler();
  if (ts === undefined)
    return;
  let errors: string[];
  try {
    const result = ts.transpileModule(source, {
      fileName: filename,
      reportDiagnostics: true,
      compilerOptions: { allowJs: true, target: ts.ScriptTarget.ES2020 },
    });
    errors = describe(ts, result.diagnostics ?? []);
  } catch {
    return;
  }
  writeCache(key, hash, { errors: errors });
  return errors[0];
};

const moduleName = (path: string): string => {
  const name = path.replace(/\\/g, '/').split('/').pop() ?? path;
  return name.replace(/\.[jt]s$/, '');
};

// Runs a transpiled file (transpileUserTsFiles) as user_config.ts runs .js user files.
export const runUserTsFile = (
  filename: string,
  output: UserTsOutput,
  options: BaseOptions,
): void => {
  const require = (path: string): unknown => {
    const found = modules[moduleName(path)];
    if (found === undefined) {
      throw new Error(
        `${filename}: '${path}' is not available to user files (only those of cactbot's resources/ modules trigger files use, and oopsy_common, are).`,
      );
    }
    return found;
  };
  const module: { exports: { [name: string]: unknown } } = { exports: {} };
  const names = Object.keys(globals);
  // As user_config.ts evals .js user files: they are arbitrary code from the user's own folder.
  // In a block, so that the file's own `const ZoneId` and such hide the globals instead of
  // clashing with the parameters (as in an eval'd .js file); on the same line, for `lines`.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const run = new Function(
    'Options',
    'require',
    'exports',
    'module',
    ...names,
    `"use strict";{${output.js}\n}`,
  );
  try {
    run(options, require, module.exports, module, ...names.map((name) => globals[name]));
  } catch (e) {
    // Where in the .ts file (the browser does not apply source maps to the stack), after the 2
    // lines of the function header `new Function` adds.
    if (e instanceof Error && e.stack !== undefined) {
      const line = output.lines[(stackLine(e.stack, output.js) ?? 0) - 3];
      if (line !== undefined && line > 0) {
        const message = e.message;
        const located = `${message} (${filename}:${line})`;
        e.message = located;
        // The stack (which the log shows) starts with the message it was made with.
        if (message !== '')
          e.stack = e.stack.replace(message, () => located);
      }
    }
    throw e;
  }

  // `export default triggerSet;` of a trigger file.
  const exported = module.exports.default;
  const triggers = (options as BaseOptions & { Triggers?: unknown }).Triggers;
  if (exported !== undefined && Array.isArray(triggers))
    triggers.push(exported);
};
