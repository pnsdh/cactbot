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
const cacheVersion = 1;
const cachePrefix = 'cbkr-user-ts:';

// The JavaScript, or the errors of a file that does not parse (kept too, so that a broken file
// does not load the transpiler every time until it is fixed).
type Result = { js: string } | { errors: string[] };
type CacheEntry = { v: number; hash: string; result: Result };

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

// JavaScript for each of `filenames` (keys of `files`); a file that does not parse is left out,
// with its errors in the console.
export const transpileUserTsFiles = async (
  files: { [filename: string]: string },
  filenames: string[],
): Promise<{ [filename: string]: string }> => {
  const output: { [filename: string]: string } = {};
  const add = (filename: string, result: Result) => {
    if ('js' in result) {
      output[filename] = result.js;
      return;
    }
    console.log('*** ERROR IN USER FILE ***');
    for (const error of result.errors)
      console.log(error);
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

  let ts: typeof import('typescript');
  try {
    ts = (await import(/* webpackChunkName: "ui/common/typescript" */ 'typescript')).default;
  } catch (e) {
    // Without it the .ts files are skipped, not the overlay.
    console.log('*** ERROR IN USER FILE ***');
    console.log('The TypeScript transpiler could not be loaded:', e);
    return output;
  }
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
      },
    });
    const errors = (result.diagnostics ?? []).map((error) => {
      const message = ts.flattenDiagnosticMessageText(error.messageText, '\n');
      const at = error.file && error.start !== undefined
        ? error.file.getLineAndCharacterOfPosition(error.start)
        : undefined;
      return `${filename}${at ? `:${at.line + 1}:${at.character + 1}` : ''}: ${message}`;
    });
    const transpiled: Result = errors.length > 0 ? { errors: errors } : { js: result.outputText };
    add(filename, transpiled);
    writeCache(filename, hash, transpiled);
  }
  return output;
};

const moduleName = (path: string): string => {
  const name = path.replace(/\\/g, '/').split('/').pop() ?? path;
  return name.replace(/\.[jt]s$/, '');
};

// Runs a transpiled file (transpileUserTsFiles) as user_config.ts runs .js user files.
export const runUserTsFile = (
  filename: string,
  js: string | undefined,
  options: BaseOptions,
): void => {
  if (js === undefined)
    throw new Error(`${filename} could not be read as TypeScript (see the errors above).`);
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
  const run = new Function('Options', 'require', 'exports', 'module', ...names, js);
  run(options, require, module.exports, module, ...names.map((name) => globals[name]));

  // `export default triggerSet;` of a trigger file.
  const exported = module.exports.default;
  const triggers = (options as BaseOptions & { Triggers?: unknown }).Triggers;
  if (exported !== undefined && Array.isArray(triggers))
    triggers.push(exported);
};
