import { Lang } from '../../resources/languages';
import { TriggerSetVariants } from '../../resources/trigger_set_variants';
import UserConfig, { ConfigValue } from '../../resources/user_config';
import { BaseOptions, RaidbossData } from '../../types/data';
import { Matches } from '../../types/net_matches';
import { PartyMemberParamObjectKeys, PartyTrackerOptions } from '../../types/party';
import {
  LooseTriggerSet,
  TriggerAutoConfig,
  TriggerField,
  TriggerOutput,
  TriggerSetAutoConfig,
} from '../../types/trigger';

import { TimelineEntryEdit } from './timeline_entries';

// This file defines the base options that raidboss expects to see.

// Backwards compat for this old style of overriding triggers.
// TODO: we should probably deprecate and remove this.
export type PerTriggerOption = Partial<{
  TextAlert: boolean;
  SoundAlert: boolean;
  SpeechAlert: boolean;
  GroupSpeechAlert: boolean; // TODO: we should remove this
  SoundOverride: string;
  VolumeOverride: number;
  Condition: TriggerField<RaidbossData, Matches, boolean>;
  InfoText: TriggerOutput<RaidbossData, Matches>;
  AlertText: TriggerOutput<RaidbossData, Matches>;
  AlarmText: TriggerOutput<RaidbossData, Matches>;
  TTSText: TriggerOutput<RaidbossData, Matches>;
}>;

export type TimelineConfig = Partial<{
  Ignore: string[];
  Rename: { [text: string]: string };
  // Fork: job, for an entry added for one job only.
  Add: { time: number; text: string; duration?: number; job?: string }[];
  // Fork: edits of single entries (see timeline_entries.ts).
  Entries: TimelineEntryEdit[];
  // Fork: edits for one job, over the common ones, by job.
  JobEntries: { [job: string]: TimelineEntryEdit[] };
}>;

export type PerTriggerAutoConfig = { [triggerId: string]: TriggerAutoConfig };
export type PerTriggerSetAutoConfig = { [triggerSetId: string]: TriggerSetAutoConfig };
export type PerTriggerOptions = { [triggerId: string]: PerTriggerOption };
export type DisabledTriggers = { [triggerId: string]: boolean };
export type PerZoneTimelineConfig = { [zoneId: number]: TimelineConfig };
export type TriggerSetConfig = { [triggerSetId: string]: { [key: string]: ConfigValue } };

type RaidbossNonConfigOptions = {
  PlayerNicks: { [gameName: string]: string };
  InfoSound: string;
  AlertSound: string;
  AlarmSound: string;
  LongSound: string;
  PullSound: string;
  AudioAllowed: boolean;
  DisabledTriggers: DisabledTriggers;
  PerTriggerAutoConfig: PerTriggerAutoConfig;
  PerTriggerSetAutoConfig: PerTriggerSetAutoConfig;
  PerTriggerOptions: PerTriggerOptions;
  PerZoneTimelineConfig: PerZoneTimelineConfig;
  TriggerSetConfig: TriggerSetConfig;
  // Fork: per fight, the fork's own version or upstream's (resources/trigger_set_variants.ts).
  TriggerSetVariant: TriggerSetVariants;
  Triggers: LooseTriggerSet[];
  PlayerNameOverride?: string;
  // Fork: the player's job as timelines load, for timeline entry edits by job (set by popup-text).
  TimelineJob?: string;
  IsRemoteRaidboss: boolean;
  // Transforms text before passing it to text popups (also affects TTS).
  TransformText: (text: string) => string;
  // Transforms text before passing it to TTS.
  TransformTts: (text: string) => string;
};

// These options are ones that are not auto-defined by raidboss_config.js.
const defaultRaidbossNonConfigOptions: RaidbossNonConfigOptions = {
  PlayerNicks: {},

  InfoSound: '../../resources/sounds/freesound/percussion_hit.webm',
  AlertSound: '../../resources/sounds/BigWigs/Alert.webm',
  AlarmSound: '../../resources/sounds/BigWigs/Alarm.webm',
  LongSound: '../../resources/sounds/BigWigs/Long.webm',
  PullSound: '../../resources/sounds/freesound/sonar.webm',

  AudioAllowed: true,

  DisabledTriggers: {},

  PerTriggerAutoConfig: {},
  PerTriggerSetAutoConfig: {},
  PerTriggerOptions: {},
  PerZoneTimelineConfig: {},
  TriggerSetConfig: {},
  // Fork: per fight, the fork's own triggers and timeline or upstream's (trigger_set_variants.ts).
  TriggerSetVariant: {},

  Triggers: [],

  IsRemoteRaidboss: false,

  TransformText: (t) => t,
  TransformTts: (t) => t,
};

// TODO: figure out how to get this type from raidboss_config??
// These values are overwritten and are just here for typing.
const defaultRaidbossConfigOptions = {
  DefaultAlertOutput: 'textAndSound',
  AlertsLanguage: undefined as (Lang | undefined),
  TimelineLanguage: undefined as (Lang | undefined),
  TimelineEnabled: true,
  AlertsEnabled: true,
  DefaultPlayerLabel: 'nick' as PartyMemberParamObjectKeys,
  ShowTimerBarsAtSeconds: 30,
  KeepExpiredTimerBarsForSeconds: 0.7,
  BarExpiresSoonSeconds: 6,
  MaxNumberOfTimerBars: 6,
  ReverseTimeline: false,
  DisplayAlarmTextForSeconds: 3,
  DisplayAlertTextForSeconds: 3,
  DisplayInfoTextForSeconds: 3,
  AlarmSoundVolume: 1,
  AlertSoundVolume: 1,
  InfoSoundVolume: 1,
  LongSoundVolume: 1,
  PullSoundVolume: 1,
  // Fork: multiplies every volume above (see PopupText._playAudioFile).
  MasterVolume: 1,
  // Fork: the pnsdh OverlayPlugin's TTS: its volume of all speech (shown and set in the plugin
  // from the config page, not used here), and cactbot's alerts' own by kind (sent with each).
  TtsVolume: 1,
  AlarmTtsVolume: 1,
  AlertTtsVolume: 1,
  InfoTtsVolume: 1,
  // Fork: how TTS reads a player (the screen keeps DefaultPlayerLabel; 'screen': the same), and
  // whether alerts naming one player are made ahead for each party member.
  TtsPlayerLabel: 'job' as 'screen' | PartyMemberParamObjectKeys,
  TtsPreparePlayers: false,
  RumbleEnabled: false,
  InfoRumbleDuration: 400,
  InfoRumbleWeak: 0.5,
  InfoRumbleStrong: 0,
  AlertRumbleDuration: 500,
  AlertRumbleWeak: 0,
  AlertRumbleStrong: 0.5,
  AlarmRumbleDuration: 750,
  AlarmRumbleWeak: 0.75,
  AlarmRumbleStrong: 0.75,
};
type RaidbossConfigOptions = typeof defaultRaidbossConfigOptions;

export interface RaidbossOptions
  extends BaseOptions, RaidbossNonConfigOptions, RaidbossConfigOptions, PartyTrackerOptions {}

// See user/raidboss-example.js for documentation.
const Options: RaidbossOptions = {
  ...UserConfig.getDefaultBaseOptions(),
  ...defaultRaidbossNonConfigOptions,
  ...defaultRaidbossConfigOptions,
};

export default Options;
