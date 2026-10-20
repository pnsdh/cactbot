// The globals user files have (see resources/user_config.ts and user_ts.ts), for editors.  It
// goes in cactbot-types with the declarations of the modules (tsconfig.user-types.json).  It is
// .d.mts so that the repo's lint (*.ts), whose types would get these globals too, leaves it out.
import type ConditionsType from './resources/conditions';
import type ContentTypeType from './resources/content_type';
import type NetRegexesType from './resources/netregexes';
import type OutputsType from './resources/outputs';
import type RegexesType from './resources/regexes';
import type { Responses as ResponsesType } from './resources/responses';
import type UtilType from './resources/util';
import type { Directions as DirectionsType } from './resources/util';
import type ZoneIdType from './resources/zone_id';
import type ZoneInfoType from './resources/zone_info';
import type { TriggerSet } from './types/trigger';
import type { RaidbossOptions } from './ui/raidboss/raidboss_options';

// What `Options.Triggers.push` takes in a user file: a trigger set whose `id` may be left out,
// with `data` free to hold anything.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UserTriggerSet = Omit<TriggerSet<any>, 'id'> & { id?: string };

declare global {
  // Raidboss's (oopsy's own trigger sets are better given with `export default`).
  // (Not Omit<>, which loses the named options: BaseOptions has an index signature.)
  const Options:
    & { [K in keyof RaidbossOptions as K extends 'Triggers' ? never : K]: RaidbossOptions[K] }
    & { Triggers: UserTriggerSet[] };
  const Conditions: typeof ConditionsType;
  const ContentType: typeof ContentTypeType;
  const NetRegexes: typeof NetRegexesType;
  const Regexes: typeof RegexesType;
  const Responses: typeof ResponsesType;
  const Outputs: typeof OutputsType;
  const Util: typeof UtilType;
  const Directions: typeof DirectionsType;
  const ZoneId: typeof ZoneIdType;
  const ZoneInfo: typeof ZoneInfoType;
}

export {};
