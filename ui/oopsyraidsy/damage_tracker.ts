import logDefinitions from '../../resources/netlog_defs';
import NetRegexes, { commonNetRegex } from '../../resources/netregexes';
import PartyTracker from '../../resources/party';
import { PlayerChangedDetail } from '../../resources/player_override';
import Regexes from '../../resources/regexes';
import { LocaleNetRegex, translateRegex } from '../../resources/translations';
import Util from '../../resources/util';
import ZoneId from '../../resources/zone_id';
import ZoneInfo from '../../resources/zone_info';
import { OopsyData } from '../../types/data';
import { EventResponses } from '../../types/event';
import { Job, Role } from '../../types/job';
import { Matches, NetMatches } from '../../types/net_matches';
import { CactbotBaseRegExp } from '../../types/net_trigger';
import {
  DataInitializeFunc,
  LooseOopsyTrigger,
  LooseOopsyTriggerSet,
  MistakeMap,
  OopsyDeathReason,
  OopsyField,
  OopsyFileData,
  OopsyMistake,
  OopsyMistakeType,
  OopsyTrigger,
  OopsyTriggerField,
} from '../../types/oopsy';
import { ZoneIdType } from '../../types/trigger';

import { CombatState } from './combat_state';
import { MistakeCollector } from './mistake_collector';
import {
  GetShareMistakeText,
  GetSoloMistakeText,
  IsPlayerId,
  IsTriggerEnabled,
  kAttackFlags,
  kFieldFlags,
  kShiftFlagValues,
  playerDamageFields,
  playerTargetFields,
  Translate,
  UnscrambleDamage,
} from './oopsy_common';
import { OopsyOptions } from './oopsy_options';
import { PlayerStateTracker } from './player_state_tracker';

const actorControlFadeInCommandPre62 = '40000010';
const actorControlFadeInCommand = '4000000F';

const partyWipeText = {
  en: 'Party Wipe',
  de: 'Gruppe ausgelöscht',
  fr: 'Party Wipe',
  ja: 'ワイプ',
  cn: '团灭',
  ko: '파티 전멸',
  tc: '團滅',
};

const earlyPullText = {
  en: 'early pull',
  de: 'zu früh angegriffen',
  fr: 'early pull',
  ja: 'タゲ取り早い',
  cn: '抢开',
  ko: '풀링 빠름',
  tc: '搶開',
};

const latePullText = {
  en: 'late pull',
  de: 'zu spät angegriffen',
  fr: 'late pull',
  ja: 'タゲ取り遅い',
  cn: '晚开',
  ko: '풀링 늦음',
  tc: '晚開',
};

// How long to wait for a hit that may be the pull to land (see PullWatch).
const kPullHitLandTimeoutMs = 3000;

// How much earlier than the time from its Countdown line a countdown can end on screen.
const kMaxOwnCountdownLeadMs = 1000;

// How far behind the latest line's time a line can be and still not be taken as the time.
const kMaxTimestampLagMs = 2000;

// Internal trigger id for early pull
export const earlyPullTriggerId = 'General Early Pull';

// The first hit to land among some.  A hit is resolved (Ability line) some time before it lands
// (its EffectResult line, ~0.5-1.7s later), and it is landing that pulls; the first to land may
// not be the first resolved.
class PullWatch {
  // Resolved hits that haven't landed yet, by target id and sequence.
  public hits = new Map<string, { puller: string; resolved: number }>();
  // When the first landed.  Also set, without a puller, when that can't be known.
  public time?: number;
  public puller?: string;
  public reported = false;

  get done(): boolean {
    return this.time !== undefined;
  }

  Reset(): void {
    this.hits.clear();
    this.time = undefined;
    this.puller = undefined;
    this.reported = false;
  }

  Add(key: string, puller: string, resolved: number): void {
    if (!this.hits.has(key))
      this.hits.set(key, { puller: puller, resolved: resolved });
  }

  Land(time: number, puller?: string): void {
    this.hits.clear();
    this.time = time;
    this.puller = puller;
  }

  // Training dummies whose HP doesn't go down get no EffectResult line for damage, so when
  // their hits land is unknown (the resolve time can be well over a second earlier, depending
  // on the action): after a while, or at once when known to be one, give up.  Whether it did.
  GiveUpIfLate(now: number, force: boolean): boolean {
    // The first one in is the first resolved.
    for (const first of this.hits.values()) {
      if (!force && now - first.resolved < kPullHitLandTimeoutMs)
        return false;
      this.Land(first.resolved);
      return true;
    }
    return false;
  }
}

const isOopsyMistake = (x: OopsyMistake | OopsyDeathReason): x is OopsyMistake => 'type' in x;

export type ProcessedOopsyTriggerSet = LooseOopsyTriggerSet & {
  filename?: string;
};

type ProcessedOopsyTrigger = LooseOopsyTrigger & {
  localRegex: RegExp;
};

export class DamageTracker {
  private triggerSets?: ProcessedOopsyTriggerSet[];
  private inCombat = false;
  private ignoreZone = false;
  private timers: number[] = [];
  private triggers: ProcessedOopsyTrigger[] = [];
  private playerStateTracker: PlayerStateTracker;
  private countdownEngageRegex: RegExp;
  private countdownStartRegex: RegExp;
  private countdownCancelRegex: RegExp;
  private abilityRegex: CactbotBaseRegExp<'Ability'>;
  private wipeCactbotEcho: CactbotBaseRegExp<'GameLog'>;
  private wipeEndEcho: CactbotBaseRegExp<'GameLog'>;
  private combatState = new CombatState(this);
  // When the countdown ended, a log timestamp like the pulls' times.  A pull is reported once
  // both are known.
  private engageTime?: number;
  // When the current countdown ends, from its Countdown line.  While set, the engage chat line
  // only counts when it comes first (see OnEngageLine).
  private countdownEngageTime?: number;
  // The pull (anyone's first hit to land), and the player's own first hit to land, shown too
  // when someone else pulled.
  private partyPull = new PullWatch();
  private myPull = new PullWatch();
  // A countdown started since combat last stopped: the next hits are the pull even if combat
  // started first (the in-combat event can come before the first hit's line).
  private countedDown = false;
  private lastTimestamp = 0;
  // logReplayMode - if using oopsy_viewer, we need to handle delays/suppresses differently
  public logReplayMode = false;
  private triggerSuppress: { [triggerId: string]: number } = {};
  private data: OopsyData;
  private timestampCallbacks: {
    timestamp: number;
    callback: (timestamp: number) => void;
  }[] = [];

  private job: Job = 'NONE';
  private role: Role = 'none';
  private me = '';
  private zoneName?: string;
  private zoneId: ZoneIdType = ZoneId.MatchAll;
  private contentType = 0;
  protected dataInitializers: {
    file: string;
    func: DataInitializeFunc<OopsyData>;
  }[] = [];

  constructor(
    private options: OopsyOptions,
    private collector: MistakeCollector,
    partyTracker: PartyTracker,
    private dataFiles: OopsyFileData,
  ) {
    const timestampCallback = (timestamp: number, callback: (timestamp: number) => void) =>
      this.OnRequestTimestampCallback(timestamp, callback);
    this.playerStateTracker = new PlayerStateTracker(
      this.options,
      this.collector,
      partyTracker,
      timestampCallback,
    );

    const lang = this.options.ParserLanguage;
    this.countdownEngageRegex = LocaleNetRegex.countdownEngage[lang];
    this.countdownStartRegex = LocaleNetRegex.countdownStart[lang];
    this.countdownCancelRegex = LocaleNetRegex.countdownCancel[lang];
    this.abilityRegex = NetRegexes.ability();
    this.wipeCactbotEcho = commonNetRegex.cactbotWipeEcho;
    this.wipeEndEcho = commonNetRegex.userWipeEcho;

    this.data = this.GetDataObject();
    this.Reset();
  }

  OnRequestTimestampCallback(timestamp: number, callback: (timestamp: number) => void): void {
    this.timestampCallbacks.push({
      timestamp: timestamp,
      callback: callback,
    });
    // Sort earliest to latest.
    this.timestampCallbacks.sort((a, b) => a.timestamp - b.timestamp);
  }

  GetDataObject(): OopsyData {
    const data: OopsyData = {
      me: this.me,
      job: this.job,
      role: this.role,
      party: this.playerStateTracker.partyTracker,
      inCombat: this.inCombat,
      IsImmune: (targetId?: string) => {
        // 52 = hallowed, 199 = holmgang, 32A = living, 32B = walking, 72C = bolide
        const invulnIds = ['52', '199', '32A', '32B', '72C'];
        if (this.playerStateTracker.HasEffect(targetId, invulnIds))
          return true;
        return false;
      },
      ShortName: (name?: string) => this.playerStateTracker.partyTracker.member(name).toString(),
      IsPlayerId: IsPlayerId,
      DamageFromMatches: (matches: NetMatches['Ability']) => UnscrambleDamage(matches?.damage),
      options: this.options,

      // Deprecated.
      ParseLocaleFloat: parseFloat,
    };

    let triggerData = {};

    for (const initObj of this.dataInitializers) {
      const init = initObj.func;
      const initData = init();
      if (typeof initData === 'object') {
        triggerData = {
          ...triggerData,
          ...initData,
        };
      } else {
        console.log(`Error in file: ${initObj.file}: these triggers may not work;
        initData function returned invalid object: ${init.toString()}`);
      }
    }
    return { ...triggerData, ...data };
  }

  // TODO: this shouldn't clear timers and triggers
  // TODO: seems like some reloads are causing the /poke test to get undefined
  Reset(): void {
    this.data = this.GetDataObject();
    this.triggerSuppress = {};

    for (const timer of this.timers)
      window.clearTimeout(timer);
    this.timers = [];
  }

  private OnEngage(timestamp: number) {
    this.engageTime = timestamp;
    this.CheckPulls();
  }

  private CheckPulls(): void {
    this.ReportPull(this.partyPull);
    // The player's own first hit, unless it was the pull, already reported.
    if (this.partyPull.done && this.partyPull.puller !== this.me)
      this.ReportPull(this.myPull);
  }

  private ReportPull(pull: PullWatch): void {
    if (pull.reported || this.engageTime === undefined || pull.time === undefined)
      return;
    pull.reported = true;
    // Combat started, but when the hit landed is unknown.
    if (pull.puller === undefined)
      return;

    const seconds = (pull.time - this.engageTime) / 1000;
    if (Math.abs(seconds) < this.options.MinimumTimeForPullMistake)
      return;
    if (!IsTriggerEnabled(this.options, earlyPullTriggerId))
      return;
    const early = seconds < 0;
    const pullText = early ? earlyPullText : latePullText;
    const mistakeStr = Translate(this.options.DisplayLanguage, pullText) ?? '';
    this.playerStateTracker.OnMistakeObj(early ? this.engageTime : pull.time, {
      type: 'pull',
      name: pull.puller,
      blame: pull.puller,
      text: `${mistakeStr} (${Math.abs(seconds).toFixed(2)}s)`,
    });
  }

  // A countdown started: whatever comes next is a new pull.
  private ResetPull(): void {
    this.combatState.Reset();
    this.partyPull.Reset();
    this.myPull.Reset();
    this.engageTime = undefined;
    this.countedDown = true;
  }

  private CancelCountdown(): void {
    this.ResetPull();
    this.countdownEngageTime = undefined;
    this.countedDown = false;
  }

  // The countdown ends its whole seconds after this line, which has the same clock and
  // millisecond precision as the lines of the hits that pull.
  private OnCountdown(splitLine: string[]): void {
    const fields = logDefinitions.Countdown.fields;
    // Non-zero: the countdown didn't start (one already running, already in combat, ...).
    // Right after a patch, before the opcode is updated, other packets come out as nonsense
    // Countdown lines, also with non-zero results.
    if (splitLine[fields.result] !== '00')
      return;
    const seconds = parseInt(splitLine[fields.countdownTime] ?? '');
    if (isNaN(seconds) || seconds <= 0 || seconds > 30)
      return;

    this.ResetPull();
    const engageTime = this.lastTimestamp + seconds * 1000;
    this.countdownEngageTime = engageTime;
    this.OnRequestTimestampCallback(engageTime, () => {
      // Cancelled or replaced by another countdown since, or the engage line came first.
      if (this.countdownEngageTime !== engageTime || this.engageTime !== undefined)
        return;
      this.OnEngage(engageTime);
    });
  }

  // The engage chat line is shown when the countdown ends on screen, and processed some time
  // after: the latest line's time then is when it ended at the latest.  It has no milliseconds
  // of its own.
  private OnEngageLine(): void {
    if (this.engageTime !== undefined)
      return;
    // Without a Countdown line (e.g. its opcode not yet updated after a patch), or before the
    // time from it: a player's own countdown starts on their screen before the Countdown line
    // comes back, so it ends ~0.2s (up to ~0.6s) earlier.  Others' end within a few ms of it.
    const countdownEnd = this.countdownEngageTime;
    if (countdownEnd !== undefined) {
      const early = countdownEnd - this.lastTimestamp;
      if (early <= 0 || early > kMaxOwnCountdownLeadMs)
        return;
    }
    this.OnEngage(this.lastTimestamp);
  }

  private OnEffectResult(splitLine: string[]): void {
    const fields = logDefinitions.NetworkEffectResult.fields;
    const key = `${splitLine[fields.id] ?? ''}:${splitLine[fields.sequenceId] ?? ''}`;
    // Full HP after the hit: a training dummy whose HP doesn't go down, whose hits only get
    // this line when they apply a status, so it tells nothing about which landed first.
    const hp = splitLine[fields.currentHp];
    const fullHp = hp !== undefined && hp !== '' && hp === splitLine[fields.maxHp];

    let landed = false;
    // The party's first, as the same hit may be both.
    for (const pull of [this.partyPull, this.myPull]) {
      const hit = pull.hits.get(key);
      if (hit === undefined)
        continue;
      if (fullHp)
        pull.GiveUpIfLate(this.lastTimestamp, true);
      else
        pull.Land(this.lastTimestamp, hit.puller);
      landed = true;
    }
    if (landed)
      this.CheckPulls();
  }

  private UpdateLastTimestamp(splitLine: string[]): void {
    const timeField = splitLine[logDefinitions.None.fields.timestamp];
    if (timeField === undefined)
      return;
    const timestamp = new Date(timeField).getTime();
    // Fork: some lines (e.g. CombatantMemory) come up to ~1s behind the others: the time
    // doesn't go back for them.  A bigger jump back is a new log or a clock change.
    if (timestamp < this.lastTimestamp && this.lastTimestamp - timestamp < kMaxTimestampLagMs)
      return;
    this.lastTimestamp = timestamp;
  }

  OnNetLog(e: EventResponses['LogLine']): void {
    const line = e.rawLine;
    const splitLine = e.line;
    const type = splitLine[logDefinitions.None.fields.type];

    // Fork: except leaving the zone, which log replays only know from this line.
    if (this.ignoreZone && type !== logDefinitions.ChangeZone.type)
      return;

    // If we're waiting on a timestamp callback, check if any have passed with this line.
    // Ignore game log lines, which don't track milliseconds.
    if (type !== logDefinitions.GameLog.type) {
      this.UpdateLastTimestamp(splitLine);
      const gaveUp = this.partyPull.GiveUpIfLate(this.lastTimestamp, false);
      if (this.myPull.GiveUpIfLate(this.lastTimestamp, false) || gaveUp)
        this.CheckPulls();
      let timestampCallback = this.timestampCallbacks[0];
      while (timestampCallback) {
        if (this.lastTimestamp < timestampCallback.timestamp)
          break;

        timestampCallback.callback(this.lastTimestamp);
        this.timestampCallbacks.shift();
        timestampCallback = this.timestampCallbacks[0];
      }
    }

    switch (type) {
      case logDefinitions.GameLog.type:
        if (this.countdownEngageRegex.test(line))
          this.OnEngageLine();
        if (this.countdownStartRegex.test(line))
          this.ResetPull();
        if (this.countdownCancelRegex.test(line))
          this.CancelCountdown();
        if (this.wipeCactbotEcho.test(line) || this.wipeEndEcho.test(line))
          this.Wipe(this.lastTimestamp);
        break;
      case logDefinitions.Countdown.type:
        this.OnCountdown(splitLine);
        break;
      case logDefinitions.CountdownCancel.type:
        this.CancelCountdown();
        break;
      case logDefinitions.NetworkEffectResult.type:
        this.OnEffectResult(splitLine);
        this.playerStateTracker.OnHp(splitLine);
        break;
      case logDefinitions.StatusEffect.type:
        this.playerStateTracker.OnHp(splitLine);
        break;
      case logDefinitions.ChangeZone.type:
        {
          const name = splitLine[logDefinitions.ChangeZone.fields.name];
          const id = splitLine[logDefinitions.ChangeZone.fields.id];
          if (name !== undefined && id !== undefined)
            this.SetZone(this.lastTimestamp, name, parseInt(id, 16));
        }
        break;
      case logDefinitions.PartyList.type:
        this.playerStateTracker.OnPartyList(line, splitLine);
        break;
      case logDefinitions.ChangedPlayer.type:
        this.playerStateTracker.OnChangedPlayer(line, splitLine);
        break;
      case logDefinitions.AddedCombatant.type:
        this.playerStateTracker.OnAddedCombatant(line, splitLine);
        break;
      case logDefinitions.Ability.type:
      case logDefinitions.NetworkAOEAbility.type:
        this.OnAbilityEvent(line, splitLine);
        this.playerStateTracker.OnAbility(line, splitLine);
        break;
      case logDefinitions.WasDefeated.type:
        this.playerStateTracker.OnDefeated(line, splitLine);
        break;
      case logDefinitions.GainsEffect.type:
        this.playerStateTracker.OnGainsEffect(line, splitLine);
        break;
      case logDefinitions.LosesEffect.type:
        this.playerStateTracker.OnLosesEffect(line, splitLine);
        break;
      case logDefinitions.NetworkDoT.type:
        this.playerStateTracker.OnHoTDoT(line, splitLine);
        break;
      case logDefinitions.ActorControl.type:
        if (
          splitLine[logDefinitions.ActorControl.fields.command] === actorControlFadeInCommand ||
          splitLine[logDefinitions.ActorControl.fields.command] === actorControlFadeInCommandPre62
        ) {
          this.Wipe(this.lastTimestamp);
        }
        break;
    }

    // Process triggers after abilities, so that death reasons for abilities that do damage get
    // listed after the damage from that ability.
    for (const trigger of this.triggers) {
      const matches = trigger.localRegex.exec(line);
      if (matches)
        this.OnTrigger(trigger, matches, this.lastTimestamp);
    }
  }

  private OnAbilityEvent(line: string, splitLine: string[]): void {
    // From the first hit (unless combat started otherwise), hits are candidates for the pull
    // until one lands, and the player's own for their first until one lands.
    const forParty = !this.partyPull.done &&
      (this.partyPull.hits.size > 0 || !this.combatState.startTime || this.countedDown);
    const forMe = !this.myPull.done && (forParty || this.partyPull.done);
    if (!forParty && !forMe)
      return;

    // This is kind of obnoxious to have to regex match every ability line that's already split.
    // But, it turns it into a usable match object.
    // TODO: use log definitions here??
    const lineMatches = this.abilityRegex.exec(line);
    if (!lineMatches || !lineMatches.groups)
      return;

    const matches = lineMatches.groups;

    // Shift damage and flags forward for mysterious spurious :3E:0:.
    // Plenary Indulgence also appears to prepend confession stacks.
    // UNKNOWN: Can these two happen at the same time?
    const origFlags = splitLine[kFieldFlags];
    if (origFlags !== undefined && kShiftFlagValues.includes(origFlags)) {
      matches.flags = splitLine[kFieldFlags + 2] ?? matches.flags;
      matches.damage = splitLine[kFieldFlags + 3] ?? matches.damage;
    }

    // Length 1 or 2.
    let lowByte = matches.flags.slice(-2);
    if (lowByte.length === 1)
      lowByte = `0${lowByte}`;

    if (!kAttackFlags.includes(lowByte))
      return;

    const sequence = splitLine[logDefinitions.Ability.fields.sequence] ?? '';
    const key = `${matches.targetId}:${sequence}`;

    if (forParty) {
      // Start combat first prior to sending a pull mistake,
      // as starting a new combat can reset the live list.
      if (this.partyPull.hits.size === 0)
        this.combatState.StartCombat(this.lastTimestamp);

      let puller = '???';
      if (IsPlayerId(matches.sourceId))
        puller = matches.source;
      else if (IsPlayerId(matches.targetId))
        puller = matches.target;
      this.partyPull.Add(key, puller, this.lastTimestamp);
    }
    if (forMe && IsPlayerId(matches.sourceId) && matches.source === this.me)
      this.myPull.Add(key, this.me, this.lastTimestamp);
  }

  OnStartEncounter(timestamp: number): void {
    this.playerStateTracker.OnStartEncounter(timestamp);
  }

  OnStopEncounter(timestamp: number): void {
    this.playerStateTracker.OnStopEncounter(timestamp);
    this.partyPull.Reset();
    this.myPull.Reset();
    this.engageTime = undefined;
    this.countdownEngageTime = undefined;
    this.countedDown = false;
  }

  OnTrigger(trigger: LooseOopsyTrigger, execMatches: RegExpExecArray, timestamp: number): void {
    // If running in replay mode, pretend that the current time is the log line timstamp
    // so delays/suppresses work correctly.
    const triggerTime = this.logReplayMode ? timestamp : Date.now();

    // TODO: turn this into a helper?? this was copied/pasted from popup-text.js

    // If using named groups, treat matches.groups as matches
    // so triggers can do things like matches.target.
    let matches: Matches = {};
    // If using named groups, treat matches.groups as matches
    // so triggers can do things like matches.target.
    if (execMatches.groups) {
      matches = execMatches.groups;
    } else {
      // If there are no matching groups, reproduce the old js logic where
      // groups ended up as the original RegExpExecArray object
      execMatches.forEach((value, idx) => {
        matches[idx] = value;
      });
    }

    if (trigger.id !== undefined) {
      if (!IsTriggerEnabled(this.options, trigger.id))
        return;

      if (trigger.id in this.triggerSuppress) {
        const suppressTime = this.triggerSuppress[trigger.id];
        if (suppressTime && suppressTime > triggerTime)
          return;
        delete this.triggerSuppress[trigger.id];
      }
    }

    const ValueOrFunction = (
      f: OopsyTriggerField<OopsyData, Matches, OopsyField>,
      matches: Matches,
    ) => {
      return typeof f === 'function' ? f(this.data, matches) : f;
    };

    if ('condition' in trigger) {
      const condition = ValueOrFunction(trigger.condition, matches);
      if (condition === undefined || condition === null || condition === false)
        return;
    }

    const delayField = 'delaySeconds' in trigger
      ? ValueOrFunction(trigger.delaySeconds, matches)
      : 0;
    const delaySeconds = delayField === undefined || delayField === null || delayField === false ||
        typeof delayField !== 'number'
      ? 0
      : delayField;

    const suppress = 'suppressSeconds' in trigger
      ? ValueOrFunction(trigger.suppressSeconds, matches)
      : 0;
    if (trigger.id !== undefined && typeof suppress === 'number' && suppress > 0)
      this.triggerSuppress[trigger.id] = triggerTime + suppress * 1000;

    const f = () => {
      if ('mistake' in trigger) {
        const m = ValueOrFunction(trigger.mistake, matches);
        if (typeof m === 'object') {
          const mistakeTimestamp = timestamp + delaySeconds * 1000;
          if (Array.isArray(m)) {
            for (const mistake of m)
              this.playerStateTracker.OnMistakeObj(mistakeTimestamp, mistake);
          } else if (isOopsyMistake(m)) {
            this.playerStateTracker.OnMistakeObj(mistakeTimestamp, m);
          }
        }
      }
      if ('deathReason' in trigger) {
        const ret = ValueOrFunction(trigger.deathReason, matches);
        if (ret !== null && typeof ret === 'object' && !Array.isArray(ret)) {
          if (!isOopsyMistake(ret))
            this.playerStateTracker.OnDeathReason(timestamp, ret);
        }
      }
      if ('run' in trigger)
        ValueOrFunction(trigger.run, matches);
    };

    if (delaySeconds <= 0)
      f();
    else if (this.logReplayMode) { // in replay mode, we can't use timeouts to control delays
      const execTs = triggerTime + delaySeconds * 1000;
      this.OnRequestTimestampCallback(execTs, () => f());
    } else
      this.timers.push(window.setTimeout(f, delaySeconds * 1000));
  }

  Wipe(timestamp: number): void {
    this.playerStateTracker.OnMistakeObj(timestamp, {
      type: 'wipe',
      text: partyWipeText,
    });

    this.Reset();
    // Fork: for every wipe (echoes too), not only the fade in.
    this.playerStateTracker.OnWipe();
    this.combatState.StopCombat(timestamp);
  }

  // Similar to PlayerStateTracker handling OnPlayerChanged events plus ChangedPlayer lines,
  // handling this event is extra insurance for reloads in the middle of a zone when
  // there won't be ChangeZone lines to do it more naturally.
  OnChangeZone(e: EventResponses['ChangeZone']): void {
    this.SetZone(this.lastTimestamp, e.zoneName, e.zoneID);
  }

  SetZone(timestamp: number, zoneName: string, zoneId: number): void {
    if (this.zoneId === zoneId)
      return;

    this.zoneName = zoneName;
    this.zoneId = zoneId;

    const zoneInfo = ZoneInfo[this.zoneId];
    this.contentType = zoneInfo?.contentType ?? 0;

    this.combatState.StopCombat(timestamp);
    this.combatState.Reset();
    this.playerStateTracker.ClearTriggerSets();
    this.playerStateTracker.OnChangeZone(timestamp, zoneName, zoneId);
    this.ReloadTriggers();
  }

  OnInCombatChangedEvent(e: EventResponses['onInCombatChangedEvent']): void {
    // Don't send StartCombat with a timestamp=0 before we've seen any
    // log messages.  This can happen if you reload while in combat.
    // We'll see an action event soon enough to also start combat.
    if (!this.lastTimestamp)
      return;

    if (this.inCombat !== e.detail.inGameCombat) {
      if (e.detail.inGameCombat)
        this.combatState.StartCombat(this.lastTimestamp);
      else
        this.combatState.StopCombat(this.lastTimestamp);
    }

    this.inCombat = e.detail.inGameCombat;
    this.data.inCombat = this.inCombat;
  }

  private AddDamageTriggers(type: OopsyMistakeType, dict?: MistakeMap): void {
    if (!dict)
      return;
    for (const key in dict) {
      const id = dict[key];
      const trigger: OopsyTrigger<OopsyData> = {
        id: key,
        type: 'Ability',
        netRegex: NetRegexes.ability({ id: id, ...playerDamageFields }),
        mistake: (_data, matches) => {
          return {
            type: type,
            blame: matches.target,
            reportId: matches.targetId,
            triggerType: 'Damage',
            text: matches.ability,
          };
        },
      };
      this.ProcessTrigger(trigger);
    }
  }

  private AddGainsEffectTriggers(type: OopsyMistakeType, dict?: MistakeMap): void {
    if (!dict)
      return;
    for (const key in dict) {
      const id = dict[key];
      const trigger: OopsyTrigger<OopsyData> = {
        id: key,
        type: 'GainsEffect',
        netRegex: NetRegexes.gainsEffect({ effectId: id, ...playerTargetFields }),
        mistake: (_data, matches) => {
          return {
            type: type,
            blame: matches.target,
            reportId: matches.targetId,
            triggerType: 'GainsEffect',
            text: matches.effect,
          };
        },
      };
      this.ProcessTrigger(trigger);
    }
  }

  // Helper function for "double tap" shares where multiple players share
  // damage when it should only be on one person, such as a spread mechanic.
  AddShareTriggers(type: OopsyMistakeType, dict?: MistakeMap): void {
    if (!dict)
      return;
    for (const key in dict) {
      const id = dict[key];
      const trigger: OopsyTrigger<OopsyData> = {
        id: key,
        type: 'Ability',
        netRegex: NetRegexes.ability({ type: '22', id: id, ...playerDamageFields }),
        mistake: (_data, matches) => {
          // Some single target damage is still marked as AOEActionEffect type 22, so check
          // the number of targets that it hits.
          const numTargets = parseInt(matches.targetCount);
          if (numTargets === 1 || isNaN(numTargets))
            return;
          return {
            type: type,
            blame: matches.target,
            reportId: matches.targetId,
            triggerType: 'Share',
            text: GetShareMistakeText(matches.ability, numTargets),
          };
        },
      };
      this.ProcessTrigger(trigger);
    }
  }

  AddSoloTriggers(type: OopsyMistakeType, dict?: MistakeMap): void {
    if (!dict)
      return;
    for (const key in dict) {
      const id = dict[key];
      const trigger: OopsyTrigger<OopsyData> = {
        id: key,
        type: 'Ability',
        netRegex: NetRegexes.ability({ id: id, ...playerDamageFields }),
        mistake: (_data, matches) => {
          // Taken alone, some are still marked as AOEActionEffect type 22, with one target.
          if (matches.type === '22' && parseInt(matches.targetCount) !== 1)
            return;
          return {
            type: type,
            blame: matches.target,
            reportId: matches.targetId,
            triggerType: 'Solo',
            text: GetSoloMistakeText(matches.ability),
          };
        },
      };
      this.ProcessTrigger(trigger);
    }
  }

  ReloadTriggers(): void {
    this.ProcessDataFiles();

    // Wait for datafiles / jobs / zone events / localization.
    if (!this.triggerSets || this.zoneName === undefined)
      return;

    this.Reset();

    this.triggers = [];
    // Fork: only this zone's initData (this list used to keep every zone's of the session).
    this.dataInitializers = [];

    this.ignoreZone = this.options.IgnoreContentTypes.includes(this.contentType) ||
      this.options.IgnoreZoneIds.includes(this.zoneId);
    if (this.ignoreZone)
      return;

    for (const set of this.triggerSets) {
      if ('zoneId' in set) {
        if (
          set.zoneId !== ZoneId.MatchAll && set.zoneId !== this.zoneId &&
          !(typeof set.zoneId === 'object' && set.zoneId.includes(this.zoneId))
        )
          continue;
      } else if ('zoneRegex' in set) {
        const zoneError = (s: string) => {
          console.error(`${s}: ${JSON.stringify(set.zoneRegex)} in ${set.filename ?? '???'}`);
        };

        let zoneRegex = set.zoneRegex;
        if (typeof zoneRegex !== 'object') {
          zoneError('zoneRegex must be translatable object or regexp');
          continue;
        } else if (!(zoneRegex instanceof RegExp)) {
          const parserLang = this.options.ParserLanguage || 'en';
          if (parserLang in zoneRegex) {
            zoneRegex = zoneRegex[parserLang];
          } else if ('en' in zoneRegex) {
            zoneRegex = zoneRegex['en'];
          } else {
            zoneError('unknown zoneRegex language');
            continue;
          }

          if (!(zoneRegex instanceof RegExp)) {
            zoneError('zoneRegex must be regexp');
            continue;
          }
        }

        if (this.zoneName.search(Regexes.parse(zoneRegex)) < 0)
          continue;
      } else {
        return;
      }

      if (this.options.Debug) {
        if (set.filename !== undefined)
          console.log(`Loading ${set.filename}`);
        else
          console.log('Loading user triggers for zone');
      }

      const setFilename = set.filename ?? 'Unknown';

      if (set.initData) {
        this.dataInitializers.push({
          file: setFilename,
          func: set.initData,
        });
      }

      this.AddDamageTriggers('warn', set.damageWarn);
      this.AddDamageTriggers('fail', set.damageFail);
      this.AddGainsEffectTriggers('warn', set.gainsEffectWarn);
      this.AddGainsEffectTriggers('fail', set.gainsEffectFail);
      this.AddShareTriggers('warn', set.shareWarn);
      this.AddShareTriggers('fail', set.shareFail);
      this.AddSoloTriggers('warn', set.soloWarn);
      this.AddSoloTriggers('fail', set.soloFail);

      for (const trigger of set.triggers ?? [])
        this.ProcessTrigger(trigger, set);

      this.playerStateTracker.PushTriggerSet(set);
    }

    // Fork: Reset() above ran before this zone's initData was known.
    this.data = this.GetDataObject();
  }

  ProcessTrigger(trigger: OopsyTrigger<OopsyData>, set?: ProcessedOopsyTriggerSet): void {
    // This is a bit of a hack, but LooseOopsyTrigger extends OopsyTrigger<OopsyData>
    // but not vice versa.  Because the NetMatches['Ability'] requires a number
    // of fields, Matches cannot be assigned to Matches & NetMatches['Ability'].
    const looseTrigger = trigger as LooseOopsyTrigger;

    const netRegex = looseTrigger.netRegex;
    // Some oopsy triggers (e.g. early pull) have only an id.
    if (!netRegex)
      return;

    const parserLang = this.options.ParserLanguage;
    const timelineReplace = set?.timelineReplace;

    let localRegex: RegExp;
    if (Array.isArray(netRegex)) {
      localRegex = Regexes.parse(Regexes.anyOf(netRegex));
    } else {
      // RegExp (e.g. from NetRegexes.xxx()), translate the regex string
      const translated = translateRegex(netRegex, parserLang, timelineReplace);
      localRegex = Regexes.parse(translated);
    }

    this.triggers.push({
      ...looseTrigger,
      localRegex,
    });
  }

  OnPlayerChange(e: PlayerChangedDetail): void {
    if (this.job === e.detail.job && this.me === e.detail.name)
      return;

    this.me = e.detail.name;
    this.job = e.detail.job;
    this.role = Util.jobToRole(this.job);
    this.ReloadTriggers();
    this.playerStateTracker.SetPlayerId(e.detail.id.toString(16).toUpperCase());
  }

  ProcessDataFiles(): void {
    // Only run this once.
    if (this.triggerSets)
      return;

    this.triggerSets = this.options.Triggers;
    for (const [filename, json] of Object.entries<LooseOopsyTriggerSet>(this.dataFiles)) {
      if (typeof json !== 'object') {
        console.error(`Unexpected JSON from ${filename}, expected an object`);
        continue;
      }
      const hasZoneRegex = 'zoneRegex' in json;
      const hasZoneId = 'zoneId' in json;
      if (!hasZoneRegex && !hasZoneId || hasZoneRegex && hasZoneId) {
        console.error(`Unexpected JSON from ${filename}, need one of zoneRegex/zoneID`);
        continue;
      }

      if ('triggers' in json) {
        if (typeof json.triggers !== 'object' || !(json.triggers.length >= 0)) {
          console.error(`Unexpected JSON from ${filename}, expected triggers to be an array`);
          continue;
        }
      }

      const set = {
        filename: filename,
        ...json,
      };
      this.triggerSets.push(set);
    }
    this.ReloadTriggers();
  }
}
