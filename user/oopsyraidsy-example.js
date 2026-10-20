// Rename this file to `oopsyraidsy.js` then edit to change the oopsyraidsy UI.

// This file is JavaScript.  Anything after "//" on a line is a comment.
// If you edit this file, remember to reload ACT or click the "Reload overlay"
// button on the oopsyraidsy overlay.
// If there are errors in this file, they will appear in the OverlayPlugin.dll
// log window in ACT.

// A set of triggers to be ignored. The key is the 'id' of the trigger, and
// the value should be true if the trigger is to be ignored, whereas false
// will have no effect.  The trigger ids can be found in the trigger files for
// each fight in the files inside of this directory:
// https://github.com/OverlayPlugin/cactbot/tree/main/ui/oopsyraidsy/data
Options.DisabledTriggers = {
  'General Rabbit Medium': true,
  'General Early Pull': true,
  'Test Bootshine': true,
};

// A set of nicknames to use for players.  By default, first names are used to
// make the mistake lines shorter.  If a player's name appears in this map,
// their nickname will be used instead of their first name.
Options.PlayerNicks = {
  'Darkest Edgelord': 'Mary',
  'Captain Jimmy': 'Jimmy',
  'Pipira Pira': '&#x1F41F;',
};

// An array of user-defined triggers, in the format defined in the oopsy guide:
// https://github.com/OverlayPlugin/cactbot/blob/main/docs/OopsyraidsyGuide.md
// Add to it with `push`: setting `Options.Triggers = [...]` would drop the ones other user files
// have added.
//
// Here's an example trigger to show a line in the mistake log when
// you crit adlo yourself in Summerford Farms.
Options.Triggers.push({
  zoneId: ZoneId.MiddleLaNoscea,
  triggers: [
    {
      id: 'Test Self Crit Adlo',
      type: 'Ability',
      // Adloquium ability id
      netRegex: NetRegexes.ability({ id: 'B9' }),
      // The low byte 04 is a heal, and 0x200000 makes it a critical one (see docs/LogGuide.md).
      condition: (data, matches) => {
        const flags = parseInt(matches.flags, 16);
        return matches.target === data.me && (flags & 0xff) === 0x04 && (flags & 0x200000) !== 0;
      },
      mistake: (data, matches) => {
        return { type: 'good', blame: matches.target, text: `${matches.ability} (crit)` };
      },
    },
    // ...more triggers here...
  ],
});
