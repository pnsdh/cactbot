// Rename this file to `raidboss.ts` (or put it in a `raidboss` folder here) and edit it to add
// raidboss triggers.  See also raidboss-example.js for the options a user file can set.

// This file is TypeScript, written like cactbot's own trigger files in ui/raidboss/data: one of
// those can be copied here as it is and edited.  Its types are only removed, never checked.
// Its imports can be cactbot's resources/ modules, whatever path they are written with (they are
// found by file name), and the trigger set the file exports by default is added to the others.
// If there are errors in this file, they will appear in the OverlayPlugin.dll log window in ACT.

import Conditions from '../resources/conditions';
import ZoneId from '../resources/zone_id';
import { RaidbossData } from '../types/data';
import { TriggerSet } from '../types/trigger';

export interface Data extends RaidbossData {
  userPokes: number;
}

const triggerSet: TriggerSet<Data> = {
  // An id of your own: one of cactbot's (a copied file keeps it) replaces that whole set, with
  // its timeline (cactbot's own is used if its timeline file is not copied too).
  id: 'UserExampleMiddleLaNoscea',
  zoneId: ZoneId.MiddleLaNoscea,
  initData: () => {
    return {
      userPokes: 0,
    };
  },
  triggers: [
    {
      // A trigger with the `id` of one of cactbot's replaces it.
      id: 'User Example Poke Count',
      type: 'GameLog',
      netRegex: { line: 'You poke the striking dummy.*?', capture: false },
      preRun: (data) => data.userPokes++,
      infoText: (data, _matches, output) => output.text?.({ count: data.userPokes }),
      outputStrings: {
        text: {
          en: 'poke ${count}',
          ko: '${count}번째 찌르기',
        },
      },
    },
    {
      id: 'User Example Regen On You',
      type: 'GainsEffect',
      netRegex: { effectId: '9E' },
      condition: Conditions.targetIsYou(),
      // A little before it wears off.
      delaySeconds: (_data, matches) => parseFloat(matches.duration) - 3,
      infoText: (_data, _matches, output) => output.text?.(),
      outputStrings: {
        text: {
          en: 'Regen ending',
          ko: '리제네 곧 끝남',
        },
      },
    },
  ],
  // This set's own translations (cactbot's are in its own sets): the lines for your game client.
  timelineReplace: [
    {
      locale: 'ko',
      replaceSync: {
        'You poke the striking dummy': '.*나무인형을 쿡쿡 찌릅니다',
      },
    },
  ],
};

export default triggerSet;
