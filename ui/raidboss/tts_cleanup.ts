import { Lang } from '../../resources/languages';

// Fork: what reads badly aloud taken out of an alert's text before TTS reads it (PopupText's
// _ttsCleanup), here for the config page's preview too.
export const cleanupTtsText = (text: string, lang: Lang): string => {
  // Heuristics for auto tts.
  // * Remove a bunch of chars.
  text = text.replace(/[#!]/g, '');
  // * slashes between mechanics
  text = text.replace('/', ' ');
  // * tildes at the end for emphasis
  text = text.replace(/~+$/, '');
  // * arrows helping visually simple to understand e.g. ↖ Front left / Back right ↘
  text = text.replace(/[↖-↙]/g, '');
  // * Korean TTS reads wrong with '1번째'
  text = text.replace('1번째', '첫번째');
  // * arrows at the front or the end are directions, e.g. "east =>"
  text = text.replace(/[-=]+>\s*$/g, '');
  text = text.replace(/^\s*<[-=]+/g, '');
  // * arrows in the middle are a sequence, e.g. "in => out => spread"
  const arrowReplacement = {
    en: ' then ',
    de: ' dann ',
    fr: ' puis ',
    ja: 'や',
    cn: '然后',
    ko: ' 그리고 ',
    tc: '然後',
  };
  text = text.replace(/\s*(<[-=]|[=-]>)\s*/g, arrowReplacement[lang]);
  // * Countdown substitution marker, if present
  text = text.replaceAll('{{CD}}', '');
  return text;
};
