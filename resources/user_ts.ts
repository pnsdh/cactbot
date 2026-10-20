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

// Bump when the transpiler options change, so that old output is not reused.
const cacheVersion = 3;
const cachePrefix = 'cbkr-user-ts:';

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

// A data: URL of a source map, for the developer tools.
const inlineSourceMap = (map: string): string => {
  let binary = '';
  for (const byte of new TextEncoder().encode(map))
    binary += String.fromCharCode(byte);
  return `//# sourceMappingURL=data:application/json;charset=utf-8;base64,${btoa(binary)}`;
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

const readCache = (filename: string, hash: string): Result | undefined => {
  try {
    const item = window.localStorage.getItem(`${cachePrefix}${filename}`);
    if (item === null)
      return;
    const entry = JSON.parse(item) as Partial<CacheEntry>;
    if (entry.v === cacheVersion && entry.hash === hash && typeof entry.result === 'object')
      return entry.result;
  } catch {
    // No storage (or a broken entry): transpile again.
  }
};

const writeCache = (filename: string, hash: string, result: Result): void => {
  try {
    const entry: CacheEntry = { v: cacheVersion, hash: hash, result: result };
    window.localStorage.setItem(`${cachePrefix}${filename}`, JSON.stringify(entry));
  } catch {
    // Full or no storage: it is transpiled again next time.
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

// "<line>:<column>: <message>" for each problem the parser found.
const describe = (ts: TypeScript, list: readonly import('typescript').Diagnostic[]): string[] =>
  list.map((error) => {
    const message = ts.flattenDiagnosticMessageText(error.messageText, '\n');
    const at = error.file && error.start !== undefined
      ? error.file.getLineAndCharacterOfPosition(error.start)
      : undefined;
    return `${at ? `${at.line + 1}:${at.character + 1}` : ''}: ${message}`;
  });

// JavaScript for each of `filenames` (keys of `files`); a file that does not parse is left out,
// with its errors in the console and given to `onErrors`.
export const transpileUserTsFiles = async (
  files: { [filename: string]: string },
  filenames: string[],
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
    const hash = hashText(source);
    const cached = readCache(filename, hash);
    if (cached !== undefined)
      add(filename, cached);
    else
      todo.push({ filename: filename, source: source, hash: hash });
  }
  if (todo.length === 0)
    return output;

  const ts = await loadTranspiler();
  if (ts === undefined)
    return output;
  for (const { filename, source, hash } of todo) {
    const result = ts.transpileModule(source, {
      fileName: filename,
      reportDiagnostics: true,
      compilerOptions: {
        // What the overlays' Chromium runs.
        target: ts.ScriptTarget.ES2020,
        // require / exports, given to the file by runUserTsFile.
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: false,
        sourceMap: true,
        inlineSources: true,
      },
    });
    const errors = describe(ts, result.diagnostics ?? []);
    const map = result.sourceMapText ?? '{}';
    const mappings = (JSON.parse(map) as { mappings?: string }).mappings ?? '';
    // Its own `//# sourceMappingURL=<name>.js.map` replaced by the map itself.
    const js = `${result.outputText.replace(/\/\/# sourceMappingURL=\S*\s*$/, '')}\n${
      inlineSourceMap(map)
    }`;
    const transpiled: Result = errors.length > 0
      ? { errors: errors }
      : { js: js, lines: sourceLines(mappings) };
    add(filename, transpiled);
    writeCache(filename, hash, transpiled);
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
// <message>".  A syntax error has no stack in the file: the TypeScript parser finds it (loaded
// for that, and its answer cached by the file's text, as transpiled files are).
export const locateJsError = async (
  filename: string,
  source: string,
  error: unknown,
): Promise<string | undefined> => {
  if (!(error instanceof Error))
    return;
  if (!(error instanceof SyntaxError))
    return stackLine(error.stack, source)?.toString();
  const key = `js:${filename}`;
  const hash = hashText(source);
  const cached = readCache(key, hash);
  if (cached !== undefined)
    return 'errors' in cached ? cached.errors[0] : undefined;
  const ts = await loadTranspiler();
  if (ts === undefined)
    return;
  const result = ts.transpileModule(source, {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: { allowJs: true, target: ts.ScriptTarget.ES2020 },
  });
  const errors = describe(ts, result.diagnostics ?? []);
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
        `${filename}: '${path}' is not available to user files (only cactbot's resources/ modules and oopsy_common are).`,
      );
    }
    return found;
  };
  const module: { exports: { [name: string]: unknown } } = { exports: {} };
  const names = Object.keys(globals);
  // As user_config.ts evals .js user files: they are arbitrary code from the user's own folder.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const run = new Function('Options', 'require', 'exports', 'module', ...names, output.js);
  try {
    run(options, require, module.exports, module, ...names.map((name) => globals[name]));
  } catch (e) {
    // Where in the .ts file (the browser does not apply source maps to the stack), after the 2
    // lines of the function header `new Function` adds.
    if (e instanceof Error && e.stack !== undefined) {
      const line = output.lines[(stackLine(e.stack, output.js) ?? 0) - 3];
      if (line !== undefined && line > 0) {
        const message = e.message;
        e.message = `${message} (${filename}:${line})`;
        // The stack (which the log shows) starts with the message it was made with.
        e.stack = e.stack.replace(message, e.message);
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
