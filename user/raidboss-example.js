// Rename this file to `raidboss.js` and edit it to change the raidboss UI.

// This file is JavaScript.  Anything after "//" on a line is a comment.
// If you edit this file, remember to reload ACT or click the "Reload overlay"
// button on the raidboss overlay.
// If there are errors in this file, they will appear in the OverlayPlugin.dll
// log window in ACT.
// See: https://github.com/OverlayPlugin/cactbot/blob/main/docs/CactbotCustomization.md#check-the-overlayplugin-log-for-errors

// Path to sound played for info-priority text popups, or when "Info" is
// specified as the sound name.
Options.InfoSound = '../../resources/sounds/freesound/percussion_hit.webm';

// Path to sound played for alert-priority text popups, or when "Alert" is
// specified as the sound name.
Options.AlertSound = '../../resources/sounds/BigWigs/Alert.webm';

// Path to sound played for alarm-priority text popups, or when "Alarm" is
// specified as the sound name.
Options.AlarmSound = '../../resources/sounds/BigWigs/Alarm.webm';

// Path to sound played when "Long" is specified as the sound name.
Options.LongSound = '../../resources/sounds/BigWigs/Long.webm';

// Path to sound played when the fight starts, or when "Pull" is
// specified as the sound name.
Options.PullSound = '../../resources/sounds/freesound/sonar.webm';

// A set of nicknames to use for players, when trying to shorten names.
// See: https://github.com/OverlayPlugin/cactbot/blob/main/docs/CactbotCustomization.md#customizing-behavior
Options.PlayerNicks = {
  'Captain Jimmy': 'Jimmy',
  'Pipira Pira': 'Fish',
};

// An array of user-defined triggers, in the format defined in the trigger guide:
// See: https://github.com/OverlayPlugin/cactbot/blob/main/docs/CactbotCustomization.md#overriding-raidboss-triggers
// See also: https://github.com/OverlayPlugin/cactbot/blob/main/docs/RaidbossGuide.md

// Here's an example of overriding a trigger.
// This overrides the "Test Poke" trigger from:
// https://github.com/OverlayPlugin/cactbot/blob/main/ui/raidboss/data/00-misc/test.ts

Options.Triggers.push({
  zoneId: ZoneId.MiddleLaNoscea,
  // A trigger set of your own does not have the translations of cactbot's: give the lines in the
  // language of your game client here (only the ones it needs).
  timelineReplace: [
    {
      locale: 'ko',
      replaceSync: {
        'You poke the striking dummy': '.*나무인형을 쿡쿡 찌릅니다',
      },
    },
  ],
  triggers: [
    {
      id: 'Test Poke',
      type: 'GameLog',
      netRegex: { line: 'You poke the striking dummy.*?', capture: false },
      preRun: (data) => {
        data.pokes = (data.pokes || 0) + 1;
      },
      // Instead of printing the number of pokes with infoText like the original trigger,
      // This overrides the type and text of the output.
      alarmText: 'POKE (user file override)',
    },
  ],
});

// Here's an example of overriding a timeline.
// This overrides the test timeline that you normally play with a `/countdown 5` in Middle La Noscea
// with an updated one from `user/test-override.txt`.
Options.Triggers.push({
  zoneId: ZoneId.MiddleLaNoscea,
  // This flag is required to clear any previously specified timelines.
  overrideTimelineFile: true,
  // This file is in the same directory as this JavaScript file.
  timelineFile: 'test-override.txt',
});

// Here's an example of a adding a custom regen trigger.
// It reminds you to use regen again when you are in Sastasha (unsynced).
Options.Triggers.push({
  // The zone this should apply to.
  // This should match the zoneId in the triggers file.
  zoneId: ZoneId.Sastasha,
  triggers: [
    // A more complicated regen trigger.
    {
      // This is a made up id that does not exist in Cactbot.
      id: 'User Example Regen',
      // When you put Regen on someone: its effect id needs no translation.
      type: 'GainsEffect',
      netRegex: { effectId: '9E' },
      condition: (data, matches) => matches.source === data.me,
      delaySeconds: (_data, matches) => {
        // Wait the amount of seconds regen lasts before reminding you to
        // reapply it.  This is not smart enough to figure out if you
        // cast it twice, and is left as an exercise for the reader to
        // figure out how to do so via storing variables on `data`.
        return parseFloat(matches.duration);
      },
      alertText: 'Regen',
    },
  ],
});
