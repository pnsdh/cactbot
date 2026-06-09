import Conditions from '../../../../../resources/conditions';
import { callOverlayHandler } from '../../../../../resources/overlay_plugin_api';
import { Responses } from '../../../../../resources/responses';
import Util from '../../../../../resources/util';
import ZoneId from '../../../../../resources/zone_id';
import { RaidbossData } from '../../../../../types/data';
import { PluginCombatantState } from '../../../../../types/event';
import { Job } from '../../../../../types/job';
import { Output, TriggerSet } from '../../../../../types/trigger';

type ForsakenRole = 'stack' | 'cone' | 'spread'; // 쉐어 / 부채꼴 / 산개
// 09STOP 전용: 처리자의 직전 탑 물리 위치. side=왼/오 탑, vert=상대북 위/아래.
type ForsakenPos = { side: 'L' | 'R'; vert: 'U' | 'D' };
type ForsakenMethod = 'jamjam' | '09stop'; // 행방불명 처리법 옵션
// 안내 위치 = 탑(side) + 시(clock). side 'N'=8탑(좌우 미정). 처리=안/비처리=밖은 렌더 시 결정.
type ForsakenSpot = { side: 'L' | 'R' | 'N'; clock: string };

// 페이즈 구분(업스트림 방식 채택): 보스 단계. dmStatueCount(P1 세부 단계)와는 별개·보완 관계.
type Phase = 'p1' | 'p2' | 'p3';
const phases: { [id: string]: Phase } = {
  'C24C': 'p2', // 종말의 포옹 (God 케프카)
  'C3F7': 'p3', // 갈기갈기 에어로가 (카오스·엑스데스)
};

export interface Data extends RaidbossData {
  // 행방불명 처리법(잼잼/09STOP) + 09STOP 스왑 주체(윗사람=상대북 / 아랫사람=상대남, 기본 아랫사람)
  readonly triggerSetConfig: {
    dmForsakenMethod: ForsakenMethod;
    dmForsakenSwap: 'upper' | 'lower';
    dmFakeMeleeCaster: 'fwd' | 'rev';
  };
  phase: Phase | 'unknown';
  combatantData?: PluginCombatantState[];
  dmKnockbackGroup?: boolean;
  dmHeadInvert?: boolean;
  dmSpreadBase?: boolean; // 007F=true(산개) / 0080=false(쉐어) / undefined=이번 조합엔 없음
  dmBlizzardCombo?: boolean;
  dmWaveCannonHit?: string[]; // 파동포(BAA8) 피격자 이름들
  dmThunderInner?: boolean; // 선더가: true=안으로(?/02A5) / false=밖으로(진실/02A6)
  dmJudgmentCount?: number; // 심판의 빛(C622) 횟수 (첫 2회만 하이퍼드라이브 짝)
  dmStatueCount?: number; // 신들의 상(BCF2) 소환 횟수 (1=넉백 / 2=중력 / 3↑=성모수마)
  dmGravityGroup?: 'gravity' | 'rock'; // 본인 그룹: 중력탄(중앙) / 암석탄(오른쪽)
  dmGazeType?: 'gaze' | 'look'; // combo3 시선: gaze=태만(뒤돌기) / look=아베(신상 보기)
  dmMarch?: { id: string; dur: number }[]; // 성큼성큼 강제이동 본인 2개 (effectId + 만료초)
  dmTrapMine?: boolean; // 줄줄이 함정(13D6) 이번 부여에 본인 포함 (일반 타이머 중복 억제용)
  dmForsakenSet?: number; // 행방불명 탑 세트 번호 1~8 (행방불명=1, 빛의 파동마다 ++)
  dmForsakenMarks?: { [name: string]: ForsakenRole }; // 현 세트 위험한 주문 마커 수집 {이름→역할}
  dmForsakenGroup?: 'A' | 'B'; // 1238/4567: A=1·2·3·8탑 처리 / B=4·5·6·7탑 처리
  dmForsakenInitMarks?: { [name: string]: ForsakenRole }; // set1 전체 8명 (B조 4탑 = 초기 마커)
  dmForsakenAGroup?: string[]; // A조 이름들(1·2·3탑 빛의 파동 피격자 = '조 판정'이 수집)
  dmForsakenA8Marks?: { [name: string]: ForsakenRole }; // A조 8탑 마커(set4 버스트 = 3탑 처리 후)
  dmForsakenEndCount?: number; // 종언(분신 설치) 횟수 1~4. 4=8탑(마지막, 다음 홀수탑 없음)
  dmForsakenLastEnd?: 'future' | 'past'; // 직전 종언 방향(BAD2미래/BAD3과거). 8탑 후 이동!/대기! 판정용
  dmForsakenCurrent?: { [name: string]: ForsakenRole }; // 8명 현재 마커(매 부여 덮어씀, 리셋X). 홀수탑 위치용
  dmForsakenPos?: { [name: string]: ForsakenPos }; // 09STOP 전용: 처리자별 직전 탑 위치(스왑 판정용)
}

// =============================================================================
// Dancing Mad (Ultimate) / 절 요성난무 — 개인용(한글), P1 중심
// =============================================================================
// 진행도: P1(케프카) 완성 / P2 행방불명 운동회 구현(인게임 검증 중) / P3 미착수.
//
// [페이즈 구조]  신들의 상(BCF2) 소환 횟수 = dmStatueCount 로 구분:
//   1상 = 넉백선 + 파동포 / 2상 = 중력탄·암석탄 + 중력파·박살 / 3상↑ = 성모수마 + 태만·아베
//
// [알쏭달쏭 마법(BA94) 조합]  매 시전마다 원소/마커가 풀마다 다른 조합으로 딸려옴:
//   조합1 = 블리자가(BA98/9B) + 산개쉐어(007F/0080) + (넉백)  → 트리거 '알쏭달쏭1'
//   조합2 = 블리자가 + 선더가(02A5/02A6)                       → 트리거 '알쏭달쏭2'
//   조합3 = 산개쉐어 + 선더가 + 태만/아베(시선)                → 트리거 '알쏭달쏭3' (3상)
//
// [위치 판정용 로그 신호]  (즉발기는 캐스트가 없어 좌표/텔레그래프로 판정)
//   271 ActorSetPos                    선·텔레그래프 시점의 석상/장판 좌표(PosX/PosY/Heading).
//   273 ActorControlExtra 019D|40|80   즉발기 '발동 N초 전 장판 텔레그래프' 신호. 액터 id로 위치 조회.
//   fetchCombatants(헬퍼) → getCombatants  위 좌표/BNpcID를 게임 메모리에서 직접 읽음.
//     ⚠ 에뮬레이터는 전투(InCombat) 구간만 재생 → 전투 시작 전 생성된 액터의 BNpcID는 못 읽음(폴백 발생).
//
// [BNpcID]  1EBFBC=중력파 1EBFBD=박살 · 1EBFBE=태만 1EBFBF=아베 · 1EBFB4=중앙장판(블리자가 등, 오발동 제외)
//
// [헤드마커]  007F=산개 0080=쉐어 · 02A1=머리?(산개쉐어 반전) 02A2=없음 ·
//             02A5=선더가?(안) 02A6=선더가 진실(밖) · 02CB=쉐어 02CC=개인 02CD=부채꼴(P2)
//   ※ 헤드마커는 모두 절대 id 가정 — 인게임 검증됨(offset 없음).
// =============================================================================

// 선/텔레그래프 sourceId(16진 문자열)의 액터 목록 조회 (271 ActorSetPos 위치 포함).
const fetchCombatants = async (sourceId: string): Promise<PluginCombatantState[]> => {
  const id = parseInt(sourceId, 16);
  return (await callOverlayHandler({ call: 'getCombatants', ids: [id] })).combatants;
};

// 블리자가 구슬 heading으로 안전 대각선 판정.
// 반환: true=북서+남동 안전 / false=북동+남서 안전 / undefined=heading 불명(폴백)
const getBlizzardSafeNwSe = (
  orb: PluginCombatantState | undefined,
  blizzardId: string,
): boolean | undefined => {
  if (orb === undefined)
    return undefined;
  const a = ((orb.Heading % Math.PI) + Math.PI) % Math.PI;
  const near3Q = Math.abs(a - (3 * Math.PI) / 4) < 0.4;
  const nearQ = Math.abs(a - Math.PI / 4) < 0.4;
  if (!near3Q && !nearQ)
    return undefined; // stale/비정상 heading
  const axisNeSw = near3Q; // 구슬축이 북동-남서
  const invert = blizzardId === 'BA9B'; // ?면 텔레그래프(구슬축)가 안전
  const safeNeSw = axisNeSw !== !invert;
  return !safeNeSw;
};

// 성큼성큼 강제이동 디버프 → 방향. 130C-F / 13D7-A 둘 다 상/하/우/좌 같은 순서.
const marchDir = (id: string): 'up' | 'down' | 'right' | 'left' | undefined => {
  switch (id) {
    case '130C':
    case '13D7':
      return 'up';
    case '130D':
    case '13D8':
      return 'down';
    case '130E':
    case '13D9':
      return 'right';
    case '130F':
    case '13DA':
      return 'left';
  }
  return undefined;
};

// ───── 행방불명(P2) 공통 ─────
// 위험한 주문 헤드마커 → 역할. 02CB=쉐어 / 02CD=부채꼴 / 02CC=산개.
const forsakenRole = (id: string): ForsakenRole | undefined => {
  switch (id) {
    case '02CB':
      return 'stack';
    case '02CD':
      return 'cone';
    case '02CC':
      return 'spread';
  }
  return undefined;
};

// 지원 구성: 탱2·힐2 + ① 근딜2(표준, 캐스터/유격 비율 무관) 또는 ② 근딜1·캐스터2·유격1(캐스터1명이 근딜 대체).
//   그 외(근딜3·근딜1캐스터1유격2 등)는 미지원 → 폴백(징/마커종류만). 딜러 좌우는 조-국소 2:2 분배로 처리.
const isStdComp = (data: Data): boolean => {
  let t = 0;
  let h = 0;
  let m = 0; // 근딜
  let c = 0; // 캐스터
  let r = 0; // 물리원딜(유격)
  for (const p of data.party.details) {
    if (!p.inParty)
      continue;
    const job = Util.jobEnumToJob(p.job);
    if (Util.isTankJob(job))
      t++;
    else if (Util.isHealerJob(job))
      h++;
    else if (Util.isMeleeDpsJob(job))
      m++;
    else if (Util.isCasterDpsJob(job))
      c++;
    else if (Util.isRangedDpsJob(job))
      r++;
  }
  // ① 근딜2(원딜 구성 무관) 또는 ② 근딜1+캐스터2(+유격1, 캐스터 대체). 그 외 딜러 구성은 미지원.
  return t === 2 && h === 2 && m + c + r === 4 && (m === 2 || (m === 1 && c === 2));
};

const forsakenJobOf = (data: Data, name: string): Job | undefined => {
  const p = data.party.details.find((x) => x.name === name);
  return p === undefined ? undefined : Util.jobEnumToJob(p.job);
};

// 근딜1·캐스터2 구성 대응: 한 캐스터가 '근딜 자리(왼쪽 탑)'를 대체. 우선순위 높은 캐스터가 근딜측.
//   프리셋 2개(정방향 적>소>흑>픽 / 역방향 픽>흑>소>적)는 서로 완전 역순 → 2캐스터의 모든 쌍에서
//   원하는 쪽을 근딜측으로 지정 가능(설정 dmFakeMeleeCaster).
const forsakenCasterFwd: { [job: string]: number } = { RDM: 0, SMN: 1, BLM: 2, PCT: 3 };
const forsakenCasterRev: { [job: string]: number } = { PCT: 0, BLM: 1, SMN: 2, RDM: 3 };

// 딜러 L(근딜측) 우선순위. 작을수록 왼쪽 탑. 근딜0 < 캐스터(프리셋 순) < 물리원딜.
const forsakenDpsLPriority = (data: Data, job: Job): number => {
  if (Util.isMeleeDpsJob(job))
    return 0;
  if (Util.isCasterDpsJob(job)) {
    const map = data.triggerSetConfig.dmFakeMeleeCaster === 'rev'
      ? forsakenCasterRev
      : forsakenCasterFwd;
    return 2 + (map[job] ?? 9);
  }
  return 20; // 물리원딜(유격) 등 → 오른쪽 탑(원딜측) 고정
};

// 내 행방불명 조(A/B) 4명 이름. A=AGroup(1탑 피격자) / B=그 외 inParty(=dmForsakenGroup 미설정자).
const forsakenMyGroupNames = (data: Data): string[] => {
  const a = data.dmForsakenAGroup ?? [];
  if (data.dmForsakenGroup === 'A')
    return [...a];
  return data.party.details.filter((p) => p.inParty && !a.includes(p.name)).map((p) => p.name);
};

// 조 4명 중 '근딜측(L)'에 설 딜러 이름 집합. 근딜측 인원 = 2 - 조내 힐러수 (힐=L·탱=R 고정).
//   딜러를 L우선순위로 정렬해 상위 N명을 근딜측으로. → 어떤 조든 L 2명·R 2명 균형 유지.
const forsakenGroupMeleeSide = (data: Data, group: string[]): Set<string> => {
  let healers = 0;
  const dps: { name: string; pri: number }[] = [];
  for (const name of group) {
    const job = forsakenJobOf(data, name);
    if (job === undefined)
      continue;
    if (Util.isHealerJob(job))
      healers++;
    else if (!Util.isTankJob(job))
      dps.push({ name: name, pri: forsakenDpsLPriority(data, job) });
  }
  dps.sort((x, y) => x.pri - y.pri || x.name.localeCompare(y.name));
  return new Set(dps.slice(0, Math.max(0, 2 - healers)).map((d) => d.name));
};

// 본인이 내 조의 근딜측(L)인가 (딜러 한정; 탱힐은 호출 전에 분기).
const forsakenIsMeleeSide = (data: Data): boolean =>
  forsakenGroupMeleeSide(data, forsakenMyGroupNames(data)).has(data.me ?? '');

// 행방불명 우선순위 랭크: 힐0 < 탱1 < 근딜측딜2 < 원딜측딜3 (작을수록 라인 왼쪽). 딜러 좌우는 조-국소 결정.
const forsakenRank = (data: Data, name: string): number => {
  const job = forsakenJobOf(data, name);
  if (job === undefined)
    return 3;
  if (Util.isHealerJob(job))
    return 0;
  if (Util.isTankJob(job))
    return 1;
  return forsakenGroupMeleeSide(data, forsakenMyGroupNames(data)).has(name) ? 2 : 3;
};
const forsakenRankByName = (data: Data, name: string): number | undefined => {
  const p = data.party.details.find((x) => x.name === name);
  return p === undefined ? undefined : forsakenRank(data, name);
};

// 같은 조(탱힐 또는 딜러)의 쉐어 대상자 이름. isTh=본인이 탱힐인지.
const forsakenStackName = (data: Data, isTh: boolean): string | undefined => {
  for (const [name, role] of Object.entries(data.dmForsakenMarks ?? {})) {
    if (role !== 'stack')
      continue;
    const nameTh = data.party.isTank(name) || data.party.isHealer(name);
    if (nameTh === isTh)
      return name;
  }
  return undefined;
};

// 행방불명 공통 라벨(역할·폴백). 실제 위치/포맷은 forsakenFmt(통합 포맷)에서 조립.
const forsakenOutputs = {
  // 역할 라벨(처리 마커).
  stack: { en: 'Stack', ko: '쉐어' },
  cone: { en: 'Cone', ko: '부채꼴' },
  conePair: { en: 'Cone (pair)', ko: '부채꼴(부+부)' }, // 잼잼 짝수탑 부채 2명(같이 부채 유도)
  spread: { en: 'Spread', ko: '산개' },
  // 비표준/역할불명 → 탑 번호 + 마커종류만.
  jingOnly: { en: 'T${tower} / Mark: ${role}', ko: '${tower}탑 / 징: ${role}' },
  // 비처리 짝수 = 분신 설치(탱힐).
  placeClone: { en: 'T${tower} / Go place clone', ko: '${tower}탑 / 분신 설치 위치로' },
  // 탑 처리인데 본인 마커 판정 실패 시 폴백(위치/종류 생략). 본안내는 탑 번호 포함.
  soak: { en: 'Tower', ko: '탑' },
  soakOnly: { en: 'T${tower} / Soak tower', ko: '${tower}탑 / 탑 처리' },
  // 본인 디버프가 정원 초과로 꼬였을 때 접미(위치는 강행 표시).
  withTangle: { en: '${text} [conflict]', ko: '${text} [디버프 꼬임]' },
  unknown: { en: '?', ko: '?' },
  // 비표준 구성(역할별 자리 불확정) 비처리 폴백.
  nonSoakGeneric: { en: 'Bait by role', ko: '역할대로 유도' },
} as const;

// 통합 안내 포맷(잼잼·09STOP 공통). 처리/비처리 본안내 = 'N탑 역할 / 탑side + 시 안|밖' + 꼬임.
//   머리유도 미리보기 = '탑side + 시 안|밖'(N탑·역할 없음). 안=처리 / 밖=비처리.
const forsakenFmt = {
  soakLine: {
    en: 'T${tower} ${role} / ${side}+${clock} ${inout}',
    ko: '${tower}탑 ${role} / ${side}+${clock} ${inout}',
  },
  previewLine: { en: '${side}+${clock} ${inout}', ko: '${side}+${clock} ${inout}' },
  sideL: { en: 'Left tower', ko: '왼쪽 탑' },
  sideR: { en: 'Right tower', ko: '오른쪽 탑' },
  sideN: { en: 'Marked-side tower', ko: '머리징쪽 탑' }, // 8탑: 좌/오 미정 → 머리 징 방향 탑
  inside: { en: 'in', ko: '안' },
  outside: { en: 'out', ko: '밖' },
  // 비처리 역할 라벨(유도 동작).
  nonSoakStack: { en: 'share stack', ko: '쉐어 맞기' },
  nonSoakCone: { en: 'bait cone', ko: '부채꼴 유도' },
  // 시계(시만, side는 별도).
  cCenter: { en: 'center', ko: '중앙' },
  c3: { en: '3:00', ko: '3시' },
  c4: { en: '4:00', ko: '4시' },
  c5: { en: '5:00', ko: '5시' },
  c6: { en: '6:00', ko: '6시' },
  c7: { en: '7:00', ko: '7시' },
  c9: { en: '9:00', ko: '9시' },
  c10: { en: '10:00', ko: '10시' },
  c12: { en: '12:00', ko: '12시' },
} as const;

// 행방불명 트리거 공용 outputStrings(잼잼·09STOP 공통).
const forsakenOutputsAll = { ...forsakenOutputs, ...forsakenFmt } as const;

const forsakenRoleLabel = (role: ForsakenRole, output: Output): string =>
  role === 'stack' ? output.stack!() : (role === 'cone' ? output.cone!() : output.spread!());

const forsakenSideLabel = (side: 'L' | 'R' | 'N', output: Output): string =>
  side === 'L' ? output.sideL!() : (side === 'R' ? output.sideR!() : output.sideN!());

// 처리/비처리 본안내: 'N탑 역할 / 탑side + 시 안|밖' (+꼬임 접미). soak=처리(안)/비처리(밖).
const forsakenSoakLine = (
  output: Output,
  tower: number,
  roleLabel: string,
  spot: ForsakenSpot,
  soak: boolean,
  tangle: boolean,
): string => {
  const text = output.soakLine!({
    tower: tower,
    role: roleLabel,
    side: forsakenSideLabel(spot.side, output),
    clock: spot.clock,
    inout: soak ? output.inside!() : output.outside!(),
  });
  return tangle ? output.withTangle!({ text: text }) : text;
};

// 머리유도 미리보기: '탑side + 시 안|밖' (N탑·역할 없음).
const forsakenPreviewLine = (output: Output, spot: ForsakenSpot, soak: boolean): string =>
  output.previewLine!({
    side: forsakenSideLabel(spot.side, output),
    clock: spot.clock,
    inout: soak ? output.inside!() : output.outside!(),
  });

// 탑 처리자 마커맵(본인 포함)에서 본인 기준 (같은 마커 총원 count, 나보다 우선순위 높은 수 higher) 계산.
// 선형 [왼탑끝,왼탑아래,우탑아래,우탑끝] + 우선순위(힐0탱1근2원3) → 같은 마커끼리 왼→오.
const forsakenSlotRank = (
  role: ForsakenRole,
  marks: { [name: string]: ForsakenRole },
  data: Data,
): { count: number; higher: number } => {
  const myRank = forsakenRank(data, data.me ?? '');
  let count = 0;
  let higher = 0; // 같은 마커 중 나보다 우선순위 높은(rank 작은) 수
  for (const [name, r] of Object.entries(marks)) {
    if (r !== role)
      continue;
    count++;
    if (name === data.me)
      continue;
    const rk = forsakenRankByName(data, name);
    if (rk !== undefined && rk < myRank)
      higher++;
  }
  return { count, higher };
};

// 본인 탑 처리 위치(탑side+시) 계산. 탑 종류=마커개수로 분기:
//   쉐어(홀수탑): 선(왼쪽) 왼9시 / 후(오른쪽) 오5시
//   부채 2명(짝수탑): 선 오6시 / 후 오5시 · 부채 1명(홀수탑): 오7시
//   산개 2명(짝수탑): 선 왼9시 / 후 왼3시 · 산개 1명(홀수탑): 왼3시
const forsakenSlotPos = (
  role: ForsakenRole,
  marks: { [name: string]: ForsakenRole },
  data: Data,
  output: Output,
): ForsakenSpot => {
  const { count, higher } = forsakenSlotRank(role, marks, data);
  if (role === 'stack')
    return higher === 0 ? { side: 'L', clock: output.c9!() } : { side: 'R', clock: output.c5!() };
  if (role === 'cone') {
    if (count >= 2)
      return higher === 0 ? { side: 'R', clock: output.c6!() } : { side: 'R', clock: output.c5!() };
    return { side: 'R', clock: output.c7!() };
  }
  if (count >= 2)
    return higher === 0 ? { side: 'L', clock: output.c9!() } : { side: 'L', clock: output.c3!() };
  return { side: 'L', clock: output.c3!() };
};

// 탑 규칙상 해당 마커의 정원 — 홀수탑(1·3·5·7)=쉐산부쉐(쉐2산1부1) / 짝수탑(2·4·6·8)=산산부부(산2부2).
const forsakenSlotMax = (role: ForsakenRole, isOdd: boolean): number => {
  if (isOdd) // 쉐2산1부1
    return role === 'stack' ? 2 : 1;
  return role === 'stack' ? 0 : 2; // 산2부2 (쉐어 없음)
};

// 본인 마커 타입이 정원 초과인가(= 본인이 디버프 꼬임에 포함). 같은 타입끼리만 자리가 모자라 꼬임.
//   (다른 타입이 꼬여도 본인 자리엔 영향 없으니 본인 타입 초과만 검사.) 초과여도 위치는 강행 표시.
const forsakenTangled = (
  role: ForsakenRole,
  marks: { [name: string]: ForsakenRole },
  data: Data,
  isOdd: boolean,
): boolean => forsakenSlotRank(role, marks, data).count > forsakenSlotMax(role, isOdd);

// 처리 본안내(통합 포맷) + 본인 디버프 꼬였으면 '[디버프 꼬임]' 접미(위치는 강행).
const forsakenSoakText = (
  role: ForsakenRole,
  marks: { [name: string]: ForsakenRole },
  data: Data,
  output: Output,
  isOdd: boolean,
  tower: number,
): string => {
  const spot = forsakenSlotPos(role, marks, data, output);
  const tangle = forsakenTangled(role, marks, data, isOdd);
  // 잼잼 짝수탑 부채 2명(같이 부채 유도)은 역할 라벨에 '(부+부)' 표기.
  const paired = role === 'cone' && forsakenSlotRank(role, marks, data).count >= 2;
  const roleLabel = paired ? output.conePair!() : forsakenRoleLabel(role, output);
  return forsakenSoakLine(output, tower, roleLabel, spot, true, tangle);
};

// 다음 홀수탑(3·5·7)에서 본인이 탑 처리하는가? 라이브 마커가 아닌 조+종언카운트로 판정.
//   (마커는 매 탑 재부여 + 미변경자는 로그 미기록 → dmForsakenMarks가 불완전. 조 판정은 결정적이라 신뢰 가능.)
//   종언 k회 직후 다음 홀수탑 = 2k+1: 3탑(k1)=A조 / 5탑(k2)·7탑(k3)=B조 탑 처리. k4=8탑(다음 없음).
const forsakenISoakNextOdd = (data: Data): boolean => {
  const k = data.dmForsakenEndCount ?? 0;
  if (k === 1)
    return data.dmForsakenGroup === 'A';
  if (k === 2 || k === 3)
    return data.dmForsakenGroup === 'B';
  return false;
};

// 다음 홀수탑 탑 처리자(본인 조 4명)의 현재 마커맵. 위치(선/후) 계산용.
//   A조=AGroup 명단 / B조=그 외. dmForsakenCurrent(리셋X)에서 본인 조만 추림.
const forsakenSoakGroupMarks = (data: Data): { [name: string]: ForsakenRole } => {
  const aSet = new Set(data.dmForsakenAGroup ?? []);
  const wantA = data.dmForsakenGroup === 'A';
  const marks: { [name: string]: ForsakenRole } = {};
  for (const [name, r] of Object.entries(data.dmForsakenCurrent ?? {})) {
    if (aSet.has(name) === wantA)
      marks[name] = r;
  }
  return marks;
};

// 잼잼 비처리 홀수탑 유도 위치+역할(탱힐=왼9 쉐어 / 근딜=오5 쉐어 / 원딜=오7 부채).
const forsakenNonSoakSpot = (data: Data, output: Output): { spot: ForsakenSpot; role: string } => {
  if (data.role === 'tank' || data.role === 'healer')
    return { spot: { side: 'L', clock: output.c9!() }, role: output.nonSoakStack!() };
  if (forsakenIsMeleeSide(data)) // 근딜측(근딜 또는 근딜 대체 캐스터)
    return { spot: { side: 'R', clock: output.c5!() }, role: output.nonSoakStack!() };
  return { spot: { side: 'R', clock: output.c7!() }, role: output.nonSoakCone!() };
};

// 다음 홀수탑 본인 전체 안내(통합 포맷). 소멸발차기('홀수탑 안내') 타이밍에 표시. tower=다음 홀수탑 번호.
const forsakenNextGuidance = (data: Data, output: Output, tower: number): string => {
  if (forsakenISoakNextOdd(data)) { // 탑 처리자(안): 홀수탑 위치
    const marks = forsakenSoakGroupMarks(data);
    const myMark = marks[data.me ?? ''];
    if (myMark === undefined) // 마커 판정 실패 → 탑 번호 + 탑 처리만
      return output.soakOnly!({ tower: tower });
    if (!isStdComp(data)) // 비표준 구성 → 우선순위 판정 불가 → 탑 번호 + 본인 디버프만
      return output.jingOnly!({ tower: tower, role: forsakenRoleLabel(myMark, output) });
    return forsakenSoakText(myMark, marks, data, output, true, tower); // 꼬이면 접미
  }
  const ns = forsakenNonSoakSpot(data, output); // 비처리조(밖)
  return forsakenSoakLine(output, tower, ns.role, ns.spot, false, false);
};

// 다음 홀수탑 본인 위치 미리보기(머리유도). N탑·역할 없이 'side + 시 안|밖'만.
const forsakenNextPos = (data: Data, output: Output): string => {
  if (forsakenISoakNextOdd(data)) {
    const marks = forsakenSoakGroupMarks(data);
    const myMark = marks[data.me ?? ''];
    if (myMark === undefined)
      return output.soak!();
    if (!isStdComp(data)) // 비표준: 위치 불확정 → 마커종류만 (꼬임 표기는 본안내에서)
      return forsakenRoleLabel(myMark, output);
    return forsakenPreviewLine(output, forsakenSlotPos(myMark, marks, data, output), true); // 처리=안
  }
  return forsakenPreviewLine(output, forsakenNonSoakSpot(data, output).spot, false); // 비처리=밖
};

// ===== 09STOP: 상태 기반 위치 모델 (잼잼과 병렬, 위치만 다름) =====
const forsaken09Opp = (s: 'L' | 'R'): 'L' | 'R' => (s === 'L' ? 'R' : 'L');

// 현재 탑 패리티에서 마커→상대북 vert. 홀수: 쉐어=위, 부/산=아래 / 짝수: 부채=위, 산개=아래.
const forsaken09Vert = (role: ForsakenRole, isOdd: boolean): 'U' | 'D' => {
  if (isOdd)
    return role === 'stack' ? 'U' : 'D';
  return role === 'cone' ? 'U' : 'D';
};

// (side, 마커, 패리티) → 탑side+시. 홀수: 쉐어 L왼중앙/R오10·부채 왼7(고정)·산개 오4(고정) / 짝수: 부채 12·산개 6.
const forsaken09Clock = (
  side: 'L' | 'R',
  role: ForsakenRole,
  isOdd: boolean,
  output: Output,
): ForsakenSpot => {
  if (isOdd) {
    if (role === 'stack')
      return side === 'L'
        ? { side: 'L', clock: output.cCenter!() }
        : { side: 'R', clock: output.c10!() };
    return role === 'cone'
      ? { side: 'L', clock: output.c7!() }
      : { side: 'R', clock: output.c4!() };
  }
  if (role === 'cone')
    return { side: side, clock: output.c12!() };
  return { side: side, clock: output.c6!() };
};

// 1탑(A조) 시드: InitMarks(8명) 역할×마커로 직접 배정. 조 미정 시점이라 8명 모두 계산(B조 분은 4탑 시드가 덮어씀).
//   탱힐 쉐어→L위·딜러 쉐어→R위·부채→L아래·산개→R아래.
const forsaken09Seed1All = (data: Data): { [name: string]: ForsakenPos } => {
  const seed: { [name: string]: ForsakenPos } = {};
  for (const [name, role] of Object.entries(data.dmForsakenInitMarks ?? {})) {
    if (role === 'stack') {
      const th = data.party.isTank(name) || data.party.isHealer(name);
      seed[name] = { side: th ? 'L' : 'R', vert: 'U' };
    } else if (role === 'cone') {
      seed[name] = { side: 'L', vert: 'D' };
    } else {
      seed[name] = { side: 'R', vert: 'D' };
    }
  }
  return seed;
};

// 현재 탑(패리티 isOdd)에서 내 조 4명의 위치 계산. mode: 'seed4'=B조 첫 탑 시드 / 'trans'=직전 위치로 전이.
//   반환만; dmForsakenPos commit은 호출측이 결정(머리유도 미리보기는 commit 안 함).
const forsaken09Compute = (
  data: Data,
  mode: 'seed4' | 'trans',
  isOdd: boolean,
): { [name: string]: ForsakenPos } => {
  const marks = forsakenSoakGroupMarks(data);
  const prev = data.dmForsakenPos ?? {};
  const next: { [name: string]: ForsakenPos } = { ...prev };
  // 스왑 옵션: 같은 마커 2명일 때 누가 반대 탑으로. 기본=아랫사람(상대남) / upper=윗사람(상대북).
  const swapUpper = data.triggerSetConfig.dmForsakenSwap === 'upper';

  // 4탑(B조, 짝수) 시드: 힐근=L, 탱원=R; vert=마커(부채 위/12, 산개 아래/6).
  if (mode === 'seed4') {
    for (const [name, role] of Object.entries(marks)) {
      const rank = forsakenRankByName(data, name) ?? 0; // 힐0탱1근2원3 → %2: 힐근=L, 탱원=R
      next[name] = { side: rank % 2 === 0 ? 'L' : 'R', vert: forsaken09Vert(role, false) };
    }
    return next;
  }

  // 전이 →홀수(3·5·7): 부채=왼7(L아래)·산개=오5(R아래) 고정. 쉐어 2명만 직전 위치로 배정.
  if (isOdd) {
    const stacks: string[] = [];
    for (const [name, role] of Object.entries(marks)) {
      if (role === 'cone')
        next[name] = { side: 'L', vert: 'D' };
      else if (role === 'spread')
        next[name] = { side: 'R', vert: 'D' };
      else
        stacks.push(name);
    }
    const s1 = stacks[0];
    const s2 = stacks[1];
    const p1 = s1 !== undefined ? prev[s1] : undefined;
    const p2 = s2 !== undefined ? prev[s2] : undefined;
    if (s1 !== undefined && s2 !== undefined && p1 !== undefined && p2 !== undefined) {
      if (p1.side !== p2.side) { // 서로 다른 탑 → 각자 자기 side 쉐어로
        next[s1] = { side: p1.side, vert: 'U' };
        next[s2] = { side: p2.side, vert: 'U' };
      } else { // 같은 탑 → 옵션에 따라 위/아래 중 한 명이 반대 side로 스왑
        const upN = p1.vert === 'U' ? s1 : s2;
        const downN = p1.vert === 'U' ? s2 : s1;
        const swapN = swapUpper ? upN : downN;
        const stayN = swapUpper ? downN : upN;
        next[swapN] = { side: forsaken09Opp(p1.side), vert: 'U' };
        next[stayN] = { side: p1.side, vert: 'U' };
      }
    } else { // 직전 위치 불명 폴백
      if (s1 !== undefined)
        next[s1] = { side: 'L', vert: 'U' };
      if (s2 !== undefined)
        next[s2] = { side: 'R', vert: 'U' };
    }
    return next;
  }

  // 전이 →짝수(2·6·8): side별 위(stack)·아래(부/산) 2명의 새 마커로 stay/swap. 같으면 위쪽이 반대 side로.
  for (const side of ['L', 'R'] as const) {
    const onSide = Object.keys(marks).filter((n) => prev[n]?.side === side);
    const upN = onSide.find((n) => prev[n]?.vert === 'U');
    const downN = onSide.find((n) => prev[n]?.vert === 'D');
    if (upN === undefined || downN === undefined)
      continue; // 폴백: 그대로
    const upRole = marks[upN];
    const downRole = marks[downN];
    if (upRole === undefined || downRole === undefined)
      continue;
    if (upRole === downRole) { // 같은 마커 → 옵션에 따라 위/아래 중 한 명이 스왑
      const swapN = swapUpper ? upN : downN;
      const stayN = swapUpper ? downN : upN;
      next[swapN] = { side: forsaken09Opp(side), vert: forsaken09Vert(upRole, false) };
      next[stayN] = { side: side, vert: forsaken09Vert(upRole, false) };
    } else { // 다른 마커 → 그 side 유지
      next[upN] = { side: side, vert: forsaken09Vert(upRole, false) };
      next[downN] = { side: side, vert: forsaken09Vert(downRole, false) };
    }
  }
  return next;
};

// 처리자 본인 안내. withRole=true면 통합 본안내(N탑 ...+꼬임), false면 미리보기(side+시 안).
//   generic=true(8탑): 좌/우 탑 배정이 유저 임의 룰(캑봇 모름) → side 생략(N), 마커→시(부채꼴 12/산개 6)만.
const forsaken09Show = (
  data: Data,
  output: Output,
  isOdd: boolean,
  posMap: { [name: string]: ForsakenPos },
  withRole: boolean,
  tower: number,
  generic = false,
): string => {
  const myMark = (data.dmForsakenCurrent ?? {})[data.me ?? ''];
  if (myMark === undefined)
    return withRole ? output.soakOnly!({ tower: tower }) : output.soak!();
  if (!isStdComp(data)) // 비표준 구성 → 우선순위/좌우 판정 불가 → 마커종류만
    return withRole
      ? output.jingOnly!({ tower: tower, role: forsakenRoleLabel(myMark, output) })
      : forsakenRoleLabel(myMark, output);
  let spot: ForsakenSpot;
  if (generic) { // 8탑: side 모름(N) → 마커로 시만(짝수 부채꼴=12/산개=6)
    spot = {
      side: 'N',
      clock: forsaken09Vert(myMark, isOdd) === 'U' ? output.c12!() : output.c6!(),
    };
  } else {
    const myPos = posMap[data.me ?? ''];
    if (myPos === undefined)
      return withRole ? output.soakOnly!({ tower: tower }) : output.soak!();
    spot = forsaken09Clock(myPos.side, myMark, isOdd, output);
  }
  if (!withRole) // 머리유도 미리보기: 처리자=안
    return forsakenPreviewLine(output, spot, true);
  const tangle = forsakenTangled(myMark, forsakenSoakGroupMarks(data), data, isOdd);
  return forsakenSoakLine(output, tower, forsakenRoleLabel(myMark, output), spot, true, tangle);
};

// 홀수탑 비처리 유도 위치+역할: 탱커=왼4 쉐어 / 힐러=왼7 부채 / 근원딜=오10 쉐어.
const forsaken09NonSoakSpot = (
  data: Data,
  output: Output,
): { spot: ForsakenSpot; role: string } => {
  if (data.role === 'tank')
    return { spot: { side: 'L', clock: output.c4!() }, role: output.nonSoakStack!() };
  if (data.role === 'healer')
    return { spot: { side: 'L', clock: output.c7!() }, role: output.nonSoakCone!() };
  // 비처리 근원딜: 오른쪽 쉐어 처리자(오10)와 같이 쉐어
  return { spot: { side: 'R', clock: output.c10!() }, role: output.nonSoakStack!() };
};

// 홀수탑 비처리 통합. full=true면 통합 본안내(밖), false면 미리보기(side+시 밖).
const forsaken09NonSoakOdd = (data: Data, output: Output, full: boolean, tower: number): string => {
  if (!isStdComp(data)) // 비표준 구성 → 역할별 자리 불확정 → 일반 안내
    return output.nonSoakGeneric!();
  const ns = forsaken09NonSoakSpot(data, output);
  if (!full)
    return forsakenPreviewLine(output, ns.spot, false);
  return forsakenSoakLine(output, tower, ns.role, ns.spot, false, false);
};

// 홀수탑(3·5·7) 09STOP 통합. commit=true(홀수탑 안내)면 dmForsakenPos 기록+본안내 / false(머리유도)면 미리보기.
const forsaken09NextGuidance = (data: Data, output: Output, commit: boolean): string => {
  const tower = 2 * (data.dmForsakenEndCount ?? 0) + 1; // 다음 홀수탑 번호
  if (forsakenISoakNextOdd(data)) {
    const map = forsaken09Compute(data, 'trans', true);
    if (commit)
      data.dmForsakenPos = map;
    return forsaken09Show(data, output, true, map, commit, tower);
  }
  return forsaken09NonSoakOdd(data, output, commit, tower);
};

// ───── P2 트라인(Trine) ─────
// 육각 6칸 고정 좌표(중앙 100,100 제외). idx 시계방향: 0북 1북동 2남동 3남 4남서 5북서.
const dmTrineSpots = [
  { x: 102.9, y: 85 }, // 0 북
  { x: 114.4, y: 95 }, // 1 북동
  { x: 111.5, y: 110 }, // 2 남동
  { x: 97.1, y: 115 }, // 3 남
  { x: 85.6, y: 105 }, // 4 남서
  { x: 88.5, y: 90 }, // 5 북서
] as const;
// 1:1:1 담당 영역: idx별 0=T1 / 1=T2 / 2=본진. (T1 북서·남서 / T2 북·남 / 본진 북동·남동)
const dmTrineZone = [1, 2, 2, 1, 0, 0] as const;

// (x,y) → 가장 가까운 육각 칸 idx(0~5).
const dmTrineNearest = (x: number, y: number): number => {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < 6; i++) {
    const dx = x - dmTrineSpots[i]!.x;
    const dy = y - dmTrineSpots[i]!.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
};

type DmTrineAssign = {
  type: 'consecutive' | 'twoOne' | 'oneEach';
  t1: number;
  relT1: 'left' | '';
  t2: number;
  relT2: 'mid' | 'right' | '';
  body: number;
  relBody: 'right' | 'one' | '';
};

// 첫 3개 칸 idx → T1/T2/본진 배정 + 상대(왼/중/오/1칸) 라벨. 중앙은 항상 3차라 첫 3개엔 미포함.
//   중앙에서 바깥(중간/페어) 바라볼 때 반시계=왼쪽, 시계=오른쪽 (idx 시계 증가).
const dmTrineAssign = (idxs: number[]): DmTrineAssign | undefined => {
  if (idxs.length !== 3)
    return undefined;
  const s = new Set(idxs);
  const pairs: number[] = []; // 인접쌍의 반시계(작은쪽) idx
  for (let i = 0; i < 6; i++) {
    if (s.has(i) && s.has((i + 1) % 6))
      pairs.push(i);
  }
  if (pairs.length === 2) { // 3연속: 양옆이 모두 set = 중간. 왼=mid-1, 오(본진)=mid+1.
    const mid = idxs.find((i) => s.has((i + 1) % 6) && s.has((i + 5) % 6));
    if (mid === undefined)
      return undefined;
    return {
      type: 'consecutive',
      t1: (mid + 5) % 6,
      relT1: 'left',
      t2: mid,
      relT2: 'mid',
      body: (mid + 1) % 6,
      relBody: 'right',
    };
  }
  if (pairs.length === 1) { // 2:1: 페어 반시계=왼=T1, 시계=오=T2, 외딴=본진.
    const a = pairs[0]!;
    const b = (a + 1) % 6;
    const sep = idxs.find((i) => i !== a && i !== b);
    if (sep === undefined)
      return undefined;
    return {
      type: 'twoOne',
      t1: a,
      relT1: 'left',
      t2: b,
      relT2: 'right',
      body: sep,
      relBody: 'one',
    };
  }
  // 1:1:1: 담당 영역제. 각 칸의 영역(T1/T2/본진)으로 배정.
  const byZone: (number | undefined)[] = [undefined, undefined, undefined];
  for (const i of idxs)
    byZone[dmTrineZone[i]!] = i;
  const t1 = byZone[0];
  const t2 = byZone[1];
  const body = byZone[2];
  if (t1 === undefined || t2 === undefined || body === undefined)
    return undefined;
  return { type: 'oneEach', t1: t1, relT1: '', t2: t2, relT2: '', body: body, relBody: '' };
};

const triggerSet: TriggerSet<Data> = {
  id: 'DancingMadUltimate',
  zoneId: ZoneId.DancingMadUltimate,
  config: [
    {
      id: 'dmFakeMeleeCaster',
      name: {
        en: 'Fake-melee caster priority',
        ko: '근딜 자리 캐스터 우선순위',
      },
      comment: {
        en:
          'When the party runs 2 casters, which one plays the melee (fake-melee) spot in mechanics that split DPS into melee/ranged sides. The higher-priority caster is the fake melee. The two presets are exact reverses, so any caster pair can pick either side. ' +
          '(Currently used by P2 Forsaken; kept fight-wide for future use.)',
        ko:
          '캐스터 2명 구성에서, 딜러를 근딜/원딜로 가르는 기믹에서 어느 캐스터가 근딜 자리(fake-melee)를 맡을지. 우선순위 높은(왼쪽) 캐스터가 근딜 자리.',
      },
      type: 'select',
      options: {
        en: {
          'RDM > SMN > BLM > PCT': 'fwd',
          'PCT > BLM > SMN > RDM': 'rev',
        },
        ko: {
          '적마>소환>흑마>픽토': 'fwd',
          '픽토>흑마>소환>적마': 'rev',
        },
      },
      default: 'fwd',
    },
    {
      id: 'dmForsakenMethod',
      name: {
        en: 'P2 Forsaken strategy',
        ko: 'P2 행방불명 처리법',
      },
      comment: {
        en:
          'Position strategy for the P2 Forsaken tower phase. A/B group, order, and timing are identical.',
        ko: '행방불명 공략별 위치 안내 방식 설정',
      },
      type: 'select',
      options: {
        en: {
          'JamJam': 'jamjam',
          '09STOP': '09stop',
        },
        ko: {
          '잼잼': 'jamjam',
          '09STOP': '09stop',
        },
      },
      default: '09stop',
    },
    {
      id: 'dmForsakenSwap',
      name: {
        en: 'P2 Forsaken swap person (09STOP only)',
        ko: 'P2 행방불명 스왑 주체 (09STOP)',
      },
      comment: {
        en:
          'When two same markers land on one tower, who moves to the other tower: Lower = relative-south person (default), Upper = relative-north person.',
        ko: '09STOP에서 한 탑에 같은 마커 2명이 겹치면 누가 반대 탑으로 넘어가는지 설정. 아랫사람=상대남(기본) / 윗사람=상대북.',
      },
      type: 'select',
      options: {
        en: {
          'Lower (rel. south)': 'lower',
          'Upper (rel. north)': 'upper',
        },
        ko: {
          '아랫사람 (상대남)': 'lower',
          '윗사람 (상대북)': 'upper',
        },
      },
      default: 'lower',
    },
  ],
  timelineFile: 'dancing_mad.txt',
  initData: () => ({ phase: 'p1' }),
  triggers: [
    // ───────── 페이즈 트래커 (업스트림) ─────────
    {
      id: 'DancingMad Phase Tracker',
      type: 'StartsUsing',
      // 종말의 포옹(C24C)=P2 / 갈기갈기 에어로가(C3F7)=P3 진입 시점에 data.phase 갱신.
      netRegex: { id: Object.keys(phases) },
      run: (data, matches) => data.phase = phases[matches.id] ?? 'unknown',
    },
    // ───────── 전체공격 ─────────
    {
      id: 'DancingMad 심판의 빛',
      type: 'StartsUsing',
      netRegex: { id: 'C622', source: '케프카', capture: false },
      durationSeconds: 4.7, // 시전 4.7s → 해소
      response: Responses.aoe(),
    },
    {
      id: 'DancingMad 하이퍼드라이브',
      type: 'StartsUsing',
      // 하이퍼드라이브(C24B)는 즉발이라 앞의 심판의 빛(C622)을 앵커로. 첫 2회 심판의 빛만 하이퍼가 뒤따름.
      // C622 시전 시작 → 하이퍼 첫 피격까지 ~8s. 첫 피격 5초전(=시전+3s)부터 마지막 피격까지.
      netRegex: { id: 'C622', source: '케프카', capture: false },
      preRun: (data) => data.dmJudgmentCount = (data.dmJudgmentCount ?? 0) + 1,
      delaySeconds: 3,
      durationSeconds: 9.5, // 하이퍼 첫 피격 5초전 → 마지막 피격(3타)
      // 탱커 포함 모두 초록색(info)
      infoText: (data, _matches, output) => {
        if (data.dmJudgmentCount !== undefined && data.dmJudgmentCount <= 2)
          return output.text!();
      },
      outputStrings: {
        text: {
          en: 'AoE Tankbuster x3',
          ko: '광역 탱버 3연타',
        },
      },
    },
    {
      id: 'DancingMad 심판의 빛 전멸기',
      type: 'StartsUsing',
      // BABB = 강화판 심판의 빛 = P1 전멸기 (DPS 부족 시 전멸)
      netRegex: { id: 'BABB', source: '케프카', capture: false },
      durationSeconds: 4.7,
      infoText: (_data, _matches, output) => output.enrage!(),
      outputStrings: {
        enrage: {
          en: 'Enrage!',
          ko: '전멸기',
        },
      },
    },

    // ───────── 탱버 ─────────
    {
      id: 'DancingMad 파삭파삭 루인가',
      type: 'StartsUsing',
      // C403 = 1타(1어글자 대상, 시전 4.7s). C4E1 = 2타(2어글자 대상).
      netRegex: { id: 'C403', source: '케프카' },
      durationSeconds: 4.7, // 시전 4.7s → 1타 해소
      // 탱커 포함 모두 초록색(info). 대상 닉네임 표시.
      infoText: (_data, matches, output) => output.text!({ target: matches.target }),
      outputStrings: {
        text: {
          en: 'Tankbuster on ${target}',
          ko: '${target}에게 탱버',
        },
      },
    },
    {
      id: 'DancingMad 파삭파삭 루인가 2타',
      type: 'Ability',
      // C403 1타 피격 시점에 2어글자용 콜 (캑봇은 2어글자 판정 불가 → 일반 경고).
      // 1타 메시지가 끝나는 시점에 떠서 2타(C4E1, ~3s 후)까지 유지.
      netRegex: { id: 'C403', source: '케프카', capture: false },
      durationSeconds: 3, // 1타 → 2타(~3s 후)
      suppressSeconds: 5,
      // 탱커 포함 모두 초록색(info)
      infoText: (_data, _matches, output) => output.secondTank!(),
      outputStrings: {
        secondTank: {
          en: '2nd Aggro Tankbuster',
          ko: '2어글자 탱버',
        },
      },
    },
    // ───────── 알쏭달쏭 마법 + 신들의 상 (P1) ─────────
    // 수집기: 신들의 상 카운트 / 넉백선 / 머리·선더가·산개쉐어 마커 / 블리자가 유무 → 출력 트리거에서 조합 판정
    {
      id: 'DancingMad 신들의 상 카운트',
      type: 'StartsUsing',
      // BCF2 = 신들의 상 소환. 1상=넉백선 / 2상=중력선 / 3상↑=성모수마선. 선(002D) 스코프용.
      netRegex: { id: 'BCF2', source: '케프카', capture: false },
      run: (data) => data.dmStatueCount = (data.dmStatueCount ?? 0) + 1,
    },
    {
      id: 'DancingMad 신들의 상 줄 수집',
      type: 'Tether',
      // 002D = 1번째 신들의 상 직후 4명에게 줄 연결 → 줄 끊기면 넉백. 본인이 넉백조인지 수집.
      netRegex: { id: '002D', source: '신들의 상' },
      condition: (data, matches) => data.me === matches.target && data.dmStatueCount === 1,
      run: (data) => data.dmKnockbackGroup = true,
    },
    {
      id: 'DancingMad 머리고리 수집',
      type: 'HeadMarker',
      // 보스 머리 고리: 02A1 = ?(산개<->쉐어 반전), 02A2 = ? 없음.
      netRegex: { id: ['02A1', '02A2'] },
      run: (data, matches) => data.dmHeadInvert = matches.id === '02A1',
    },
    {
      id: 'DancingMad 선더가 고리 수집',
      type: 'HeadMarker',
      // 선더가 고리: 02A5 = 거짓(?→안으로), 02A6 = 진실(→밖으로). (라벨 3개로 검증됨)
      netRegex: { id: ['02A5', '02A6'] },
      run: (data, matches) => data.dmThunderInner = matches.id === '02A5',
    },
    {
      id: 'DancingMad 산개쉐어 수집',
      type: 'HeadMarker',
      // 007F = 산개(base), 0080 = 쉐어(base).
      netRegex: { id: ['007F', '0080'] },
      run: (data, matches) => data.dmSpreadBase = matches.id === '007F',
    },
    {
      id: 'DancingMad 블리자가 유무 수집',
      type: 'StartsUsing',
      netRegex: { id: ['BA98', 'BA9B'], source: '케프카', capture: false },
      run: (data) => data.dmBlizzardCombo = true,
    },
    // 출력기: 위 수집 결과로 조합별 콜. (조합1=알쏭1 / 조합2=알쏭2 / 단독 블리자가 / 단독 산개쉐어)
    // 출력: 1번째 알쏭달쏭 (넉백 + 블리자가 방향 + 산개/쉐어) — 산개/쉐어 마커가 있을 때만
    {
      id: 'DancingMad 알쏭달쏭1',
      type: 'StartsUsing',
      // BA98=정상(안전=구슬축 수직), BA9B=?(안전=구슬축=텔레그래프). BA9E 제외(BA9B가 텔레그래프 축).
      netRegex: { id: ['BA98', 'BA9B'], source: '케프카' },
      // 로그 측정: 구슬 위치는 시전 직전(~0.09s 전) 확정·이후 고정, 마커도 선도착 → 큰 대기 불필요.
      delaySeconds: 0.3, // promise/수집 안전 버퍼만
      durationSeconds: 4.7, // 콜(+0.3) → 널리널리 블리자가 발동까지(끝 시점 동일 유지)
      suppressSeconds: 5,
      promise: async (data, matches) => {
        if (data.dmSpreadBase === undefined)
          return; // 1번째 아님 → 조회 안 함 (combatantData 공유 경합 방지)
        data.combatantData = await fetchCombatants(matches.sourceId);
      },
      alertText: (data, matches, output) => {
        if (data.dmSpreadBase === undefined)
          return; // 산개/쉐어 없음 = 1번째 아님 (2번째는 아래 트리거)
        const safeNwSe = getBlizzardSafeNwSe(data.combatantData?.[0], matches.id);
        const isKb = data.dmKnockbackGroup === true;
        const spread = data.dmHeadInvert ? !data.dmSpreadBase : data.dmSpreadBase;
        const ss = spread ? output.spread!() : output.stack!();
        if (safeNwSe === undefined) // 방향 불명 → ??? 폴백
          return isKb ? output.kbUnknown!({ ss: ss }) : output.noKbUnknown!({ ss: ss });
        // 왼/오: 넉백=남코너, 비넉백=북코너 / 동코너=오른쪽. isRight = (safeNwSe === isKb)
        const side = safeNwSe === isKb ? output.right!() : output.left!();
        return isKb ? output.kb!({ side: side, ss: ss }) : output.noKb!({ side: side, ss: ss });
      },
      outputStrings: {
        kb: { en: '${side} + Knockback + ${ss}', ko: '${side}에서 넉백 + ${ss}' },
        noKb: { en: '${side} + ${ss}', ko: '${side} + ${ss}' },
        kbUnknown: { en: 'Knockback + ${ss} / Blizzard: ???', ko: '넉백 + ${ss} / 블리자가: ???' },
        noKbUnknown: { en: '${ss} / Blizzard: ???', ko: '${ss} / 블리자가: ???' },
        spread: { en: 'Spread', ko: '산개' },
        stack: { en: 'Stack', ko: '쉐어' },
        right: { en: 'Right', ko: '오른쪽' },
        left: { en: 'Left', ko: '왼쪽' },
      },
    },
    // 출력: 2번째 알쏭달쏭 (블리자가 방향 + 선더가 안/밖) — 산개/쉐어 마커가 없을 때만
    {
      id: 'DancingMad 알쏭달쏭2',
      type: 'StartsUsing',
      netRegex: { id: ['BA98', 'BA9B'], source: '케프카' },
      delaySeconds: 0.3, // 구슬·마커 선확정 → 버퍼만 (알쏭달쏭1과 동일 근거)
      durationSeconds: 4.7, // 끝 시점 동일 유지
      suppressSeconds: 5,
      promise: async (data, matches) => {
        // 2번째(블리자가+선더가)만: 산개/쉐어 없고 선더가 있음
        if (data.dmSpreadBase !== undefined || data.dmThunderInner === undefined)
          return; // (combatantData 공유 경합 방지)
        data.combatantData = await fetchCombatants(matches.sourceId);
      },
      alertText: (data, matches, output) => {
        if (data.dmSpreadBase !== undefined || data.dmThunderInner === undefined)
          return;
        const safeNwSe = getBlizzardSafeNwSe(data.combatantData?.[0], matches.id);
        const dir = safeNwSe === undefined
          ? output.dirUnknown!()
          : (safeNwSe ? output.dirNwSe!() : output.dirNeSw!());
        // 선더가: 02A5=?(안으로) / 02A6=진실(밖으로)  ※ 라벨 3개로 검증됨
        const inout = data.dmThunderInner ? output.inner!() : output.outer!();
        return output.combo2!({ dir: dir, inout: inout });
      },
      outputStrings: {
        combo2: { en: '${dir} / ${inout}', ko: '${dir}에서 ${inout}' },
        inner: { en: 'In', ko: '안으로' },
        outer: { en: 'Out', ko: '밖으로' },
        dirNeSw: { en: 'NE/SW', ko: '북동/남서' },
        dirNwSe: { en: 'NW/SE', ko: '북서/남동' },
        dirUnknown: { en: '???', ko: '???' },
      },
    },
    // 출력: 단독 널리널리 블리자가 (알쏭달쏭/선더가 없음) — 안전 대각선만
    {
      id: 'DancingMad 널리널리 블리자가 단독',
      type: 'StartsUsing',
      // 2번째 신들의 상(중력탄/암석탄) 사이클의 블리자가. 방향 대신 ?-state로 바닥+쉐어 안내.
      // BA98=진실(바닥 피하고) / BA9B=거짓?(바닥 밟고). 둘 다 쉐어 처리(중력/암석 그룹 공통).
      // 그룹별 이동(중앙/시계방향)은 '중력탄 암석탄 이동' 콜이 별도로 처리.
      netRegex: { id: ['BA98', 'BA9B'], source: '케프카' },
      delaySeconds: 0.3, // 구슬·마커 선확정 → 버퍼만
      durationSeconds: 4.7, // 끝 시점 동일 유지
      suppressSeconds: 5,
      alertText: (data, matches, output) => {
        // 산개/쉐어 마커나 선더가가 있으면 다른 조합 → 제외 (단독 블리자가만)
        if (data.dmSpreadBase !== undefined || data.dmThunderInner !== undefined)
          return;
        return matches.id === 'BA9B' ? output.stepStack!() : output.avoidStack!();
      },
      outputStrings: {
        stepStack: { en: 'Step on floor', ko: '바닥 밟기' },
        avoidStack: { en: 'Avoid floor', ko: '바닥 피하기' },
      },
    },
    // 출력: 산개/쉐어 트리거 (블리자가 없는 조합 전용; 조합1은 위 블리자가 통합이 처리)
    {
      id: 'DancingMad 산개쉐어',
      type: 'HeadMarker',
      netRegex: { id: ['007F', '0080'] },
      delaySeconds: 0.2, // 플래그/마커뿐(promise 없음). dmBlizzardCombo(+0.09s) 본 뒤면 충분 → 0.2
      durationSeconds: 4.4, // 콜(+0.2) → 원소 해소(끝 시점 동일 유지)
      suppressSeconds: 3,
      alertText: (data, matches, output) => {
        if (data.dmBlizzardCombo)
          return; // 블리자가와 동시(조합1) → 블리자가 통합 트리거가 콜
        if (data.dmThunderInner !== undefined)
          return; // 선더가와 동시(조합3) → 알쏭달쏭3 트리거가 콜
        const baseSpread = matches.id === '007F';
        const spread = data.dmHeadInvert ? !baseSpread : baseSpread;
        const kb = data.dmKnockbackGroup;
        if (spread)
          return kb ? output.kbSpread!() : output.spread!();
        return kb ? output.kbStack!() : output.stack!();
      },
      outputStrings: {
        spread: { en: 'Spread', ko: '산개' },
        stack: { en: 'Stack', ko: '쉐어' },
        kbSpread: { en: 'Knockback + Spread', ko: '넉백 + 산개' },
        kbStack: { en: 'Knockback + Stack', ko: '넉백 + 쉐어' },
      },
    },
    // 정리기: 알쏭달쏭 마법 1회 끝나면 플래그 리셋
    {
      id: 'DancingMad 알쏭달쏭 마법 정리',
      type: 'StartsUsing',
      netRegex: { id: 'BA94', source: '케프카', capture: false },
      delaySeconds: 2.5, // 위 출력들(+0.5/+0.6)이 플래그를 다 쓴 뒤
      suppressSeconds: 2,
      run: (data) => {
        data.dmKnockbackGroup = undefined;
        data.dmHeadInvert = undefined;
        data.dmSpreadBase = undefined;
        data.dmBlizzardCombo = undefined;
        data.dmThunderInner = undefined;
        data.dmGazeType = undefined;
      },
    },
    // ───────── 신들의 상 1상: 파동포 (산개 + 탑) ─────────
    {
      id: 'DancingMad 파동포 산개',
      type: 'Ability',
      // 파동포(BAA8) 산개 안내. 첫 신들의 상의 파동탄(BAA9)을 앵커로 — 파동포 직전이고 항상 존재.
      // 파동포는 전투당 1회(첫 신들의 상 후)라 suppressSeconds로 1회 제한.
      netRegex: { id: 'BAA9', source: '신들의 상', capture: false },
      delaySeconds: 3.2, // 파동탄(BAA9) → 파동포 5초전 근처
      durationSeconds: 4.2, // → 파동포(BAA8) 피격(~4.2s)
      suppressSeconds: 9999,
      infoText: (_data, _matches, output) => output.text!(),
      outputStrings: {
        text: {
          en: 'Wave Cannon: Spread',
          ko: '파동포 산개',
        },
      },
    },
    {
      id: 'DancingMad 파동포 피격 수집',
      type: 'Ability',
      // BAA8 = 파동포. 피격자(4명, 산개 실수 시 5+)는 마법피해증가 디버프. 피격자 이름 수집.
      netRegex: { id: 'BAA8', source: '신들의 상' },
      run: (data, matches) => (data.dmWaveCannonHit ??= []).push(matches.target),
    },
    {
      id: 'DancingMad 파동포 탑',
      type: 'Ability',
      // 파동포 피격자(디버프 O) → 탑 피하기 / 안 맞은 사람 → 탑 처리(들어가서 폭발 받음).
      // 로그 확인: 폭발(BAAA)은 파동포 안 맞은 4명이 맞음 = 그들이 탑 처리.
      netRegex: { id: 'BAA8', source: '신들의 상', capture: false },
      delaySeconds: 0.3, // 피격자 전원 수집
      durationSeconds: 3.5, // 파동포 → 폭발(탑 처리 해소)까지
      suppressSeconds: 5,
      // 탑 처리(폭발 받음)/탑 피하기 모두 노란색
      alertText: (data, _matches, output) => {
        if (data.dmWaveCannonHit?.includes(data.me))
          return output.avoid!();
        return output.soak!();
      },
      run: (data) => data.dmWaveCannonHit = [],
      outputStrings: {
        soak: {
          en: 'Soak Tower',
          ko: '탑 처리',
        },
        avoid: {
          en: 'Avoid Tower',
          ko: '탑 피하기',
        },
      },
    },
    // ───────── 줄줄이 함정 (13D6) ─────────
    // 부여 구조: 매번 동시 2명(첫 부여 2명 고정, 이후 전염으로 0/1/2명). 지속 5초 또는 68초.
    //   서로 다른 부여 간격 ≥5.7초 > suppress 4초 > 동시부여(~0.001초) → suppress로 동시 2명만 1회 묶음.
    // 3트리거 분업: [리셋] 부여마다 플래그 초기화 / [내것] 본인 대상 시 빨간 알람 + 플래그 set /
    //   [일반] 남만 걸렸을 때 초록 타이머(본인 포함 부여면 생략). '내것'은 본인 줄 기반이라 항상 정확.
    {
      id: 'DancingMad 줄줄이 함정 리셋',
      type: 'GainsEffect',
      // 새 부여 시작(첫 1명)에서 본인 포함 플래그 초기화. suppress 4s로 동시 2명째는 통과.
      // ★ run이 아니라 preRun이어야 함: preRun은 동기(줄 처리 즉시)라 같은 줄의 '내것' preRun보다
      //   배열 순서대로 먼저 실행 → false→true 보장. run은 딜레이 이후라 '내것'(true)을 덮어써 버그.
      netRegex: { effectId: '13D6', capture: false },
      preRun: (data) => data.dmTrapMine = false,
      suppressSeconds: 4,
    },
    {
      id: 'DancingMad 줄줄이 함정 내것',
      type: 'GainsEffect',
      // 본인이 대상일 때만 발동 → 지연/다른 부여와 무관하게 항상 정확(공유 플래그 X).
      // 만료 5초 전부터 빨간 알람으로 '내 함정' 강조. 지속은 5/68초(전염 잔여 시 49초 등도 자동 대응).
      // preRun으로 매칭 즉시 플래그 set → 일반 타이머가 같은 부여에서 중복으로 안 뜨게 함.
      netRegex: { effectId: '13D6' },
      condition: Conditions.targetIsYou(),
      preRun: (data) => data.dmTrapMine = true,
      delaySeconds: (_data, matches) => Math.max(parseFloat(matches.duration) - 5, 0),
      suppressSeconds: 4,
      countdownSeconds: 5,
      alarmText: (_data, _matches, output) => output.mine!(),
      outputStrings: {
        mine: {
          en: 'My trap! Expiring: {{CD}}',
          ko: '내 함정! 만료: {{CD}}',
        },
      },
    },
    {
      id: 'DancingMad 줄줄이 함정',
      type: 'GainsEffect',
      // 남이 걸렸을 때만 일반 타이머(이름 표시 안 함). 본인이 이번 부여에 포함되면 생략('내것'이 처리).
      // suppress 4s로 동시 부여(2명, ~0.001s)는 1회로 묶음(다음 부여는 ≥5.7s 후라 별개 인식).
      netRegex: { effectId: '13D6' },
      condition: (data, matches) => data.me !== matches.target,
      delaySeconds: (_data, matches) => Math.max(parseFloat(matches.duration) - 5, 0),
      suppressSeconds: 4,
      countdownSeconds: 5,
      infoText: (data, _matches, output) => {
        if (data.dmTrapMine)
          return; // 본인도 같은 부여에 걸림 → '내 함정!' 알람만 (중복 방지)
        return output.other!();
      },
      outputStrings: {
        other: {
          en: 'Trap expiring: {{CD}}',
          ko: '함정 만료: {{CD}}',
        },
      },
    },
    // ───────── 신들의 상 2상: 중력탄/암석탄 + 중력파/박살 ─────────
    {
      id: 'DancingMad 중력탄 암석탄 그룹',
      type: 'Tether',
      // 본인 그룹 저장(이동 콜에서 사용) + 선 걸린 시점에 '이후' 방향 예고.
      // 2번째 신들의 상 이후 선(002D): 연결 석상이 중앙(x≈102.5)=중력탄 / 오른쪽(x≈126)=암석탄.
      netRegex: { id: '002D', source: '신들의 상' },
      condition: (data, matches) => data.me === matches.target && data.dmStatueCount === 2,
      delaySeconds: 0.3, // 석상 위치(271)는 선과 동시 확정 → 버퍼만 (측정 기반 0.5→0.3)
      durationSeconds: 6.7, // 선(걸림) → 중력탄(BAAC) 해소까지(끝 시점 동일 유지)
      suppressSeconds: 3, // 동시 다발 선/중복 방지 (라운드2 선은 ~18s 후라 통과)
      promise: async (data, matches) => {
        data.combatantData = await fetchCombatants(matches.sourceId);
      },
      // 선 시점 석상 위치(271): 중력탄 석상 x≈102.5(중앙) / 암석탄 석상 x≈126(오른쪽).
      infoText: (data, _matches, output) => {
        const statue = data.combatantData?.[0];
        if (statue === undefined)
          return;
        return statue.PosX > 114 ? output.thenSpread!() : output.thenCenter!();
      },
      run: (data) => {
        const statue = data.combatantData?.[0];
        if (statue === undefined) {
          data.dmGravityGroup = undefined;
          return;
        }
        data.dmGravityGroup = statue.PosX > 114 ? 'rock' : 'gravity';
      },
      outputStrings: {
        thenCenter: {
          en: 'Then: Center',
          ko: '이후 중앙으로',
        },
        thenSpread: {
          en: 'Then: Prepare spread',
          ko: '이후 산개 준비',
        },
      },
    },
    {
      id: 'DancingMad 중력탄 암석탄 이동',
      type: 'Ability',
      // 콜 B(중력탄~암석탄): 중력탄(BAAC) 처리 후 실제 이동. 중력탄 선=중앙으로 / 암석탄 선=산개.
      // 메시지 종료 = 암석탄(BAB0, ~4s 후) 처리 시점.
      netRegex: { id: 'BAAC', source: '신들의 상', capture: false },
      durationSeconds: 4, // 중력탄(56.379) → 암석탄(BAB0, 00.385) 처리까지 = 4.0s
      suppressSeconds: 10, // 한 사이클당 1회 (다음 중력탄 ~18s 후)
      alertText: (data, _matches, output) => {
        if (data.dmGravityGroup === 'gravity')
          return output.center!();
        if (data.dmGravityGroup === 'rock')
          return output.spread!();
      },
      outputStrings: {
        center: {
          en: 'Center',
          ko: '중앙으로',
        },
        spread: {
          en: 'Spread',
          ko: '산개',
        },
      },
    },
    {
      id: 'DancingMad 중력파 박살 방향',
      type: 'ActorControlExtra',
      // 중력파(BAB1, 왼쪽 절반)/박살(BAB2, 오른쪽 절반)은 즉발이라 캐스트가 없지만,
      // 발동 5.1초 전 장판 텔레그래프 액터가 273 ActorControlExtra 019D|40|80 신호를 냄.
      // 그 액터 위치로 어느 절반이 위험한지 판정: PosX<100=중력파(왼쪽 위험) / >100=박살(오른쪽 위험).
      // 019D는 신들의 상 장판 범용 신호라 dmStatueCount===2(중력 페이즈)로 게이팅
      // (중력탄/암석탄엔 019D 텔레그래프 없음 — 확인됨).
      netRegex: {
        id: '4[0-9A-Fa-f]{7}',
        category: '019D',
        param1: '40',
        param2: '80',
        capture: true,
      },
      condition: (data) => data.dmStatueCount === 2,
      durationSeconds: 5, // 텔레그래프(발동 5.1초 전) → 발동
      suppressSeconds: 2,
      promise: async (data, matches) => {
        data.combatantData = await fetchCombatants(matches.id);
      },
      alertText: (data, _matches, output) => {
        const tele = data.combatantData?.[0];
        if (tele === undefined)
          return output.unknown!();
        // 중력파/박살 텔레그래프는 BNpcID 1EBFBC(중력파)/1EBFBD(박살)뿐. 같은 페이즈의
        // 다른 중앙 019D 장판(예: 1EBFB4 @ 100,100 = 블리자가 등)은 오발동이므로 제외.
        if (tele.BNpcID !== 0x1EBFBC && tele.BNpcID !== 0x1EBFBD)
          return;
        // 위치 고정: 중력파(92,27) / 박살(116,43). 위험 절반의 반대로 대피.
        return tele.PosX < 100 ? output.goRight!() : output.goLeft!();
      },
      outputStrings: {
        goRight: {
          en: 'Right (Gravity left)',
          ko: '오른쪽으로',
        },
        goLeft: {
          en: 'Left (Comet right)',
          ko: '왼쪽으로',
        },
        unknown: {
          en: 'Dodge half (visual)',
          ko: '반대편으로 (눈으로 볼 것)',
        },
      },
    },
    // ───────── 신들의 상 3상: 태만·아베(시선) / 알쏭달쏭3 / 성모수마 ─────────
    {
      id: 'DancingMad 태만 아베 수집',
      type: 'ActorControlExtra',
      // 태만의 신기(BAB4)/아베 마리아(BAB3)는 캐스트 없지만, 발동 ~10초 전 273 019D|40|80 텔레그래프로
      // 미리 판정. 그 액터를 getCombatants로 읽어 BNpcID 구분: 1EBFBE=태만(뒤돌기) / 1EBFBF=아베(신상 보기).
      //   판정 즉시 시선을 초록색으로 '미리' 안내 → 알쏭달쏭3 종합 안내 등장 직전(~5.7s 후)에 사라짐(duration).
      //   (시선 외 019D 텔레그래프=성모수마 등은 BNpcID 불일치 → 표시 안 함.)
      // NOTE(에뮬 한계): 이 텔레그래프 액터는 '전투 시작 전' 세팅 단계(엔게이지 ~26s 전)에 생성됨.
      //   에뮬레이터는 전투(InCombat) 구간만 재생해 Add 시점의 BNpcID를 잃어버림 → 에뮬에선 표시 안 됨.
      //   실전(live)은 getCombatants가 게임 메모리를 직접 읽어 BNpcID가 있으므로 정상 작동.
      netRegex: {
        id: '4[0-9A-Fa-f]{7}',
        category: '019D',
        param1: '40',
        param2: '80',
        capture: true,
      },
      condition: (data) => data.dmStatueCount === 3,
      // 미리 안내(텔레그래프) → 알쏭달쏭3 종합 안내 직전에 소멸. 알쏭달쏭3 delay가 0.2로 더 빨라져(BA94+0.2
      //   ≈ 텔레그래프+4.9s) 겹치지 않도록 4.5로 축소(선행 트리거 충돌 방지, 변동 여유 포함).
      durationSeconds: 4.5,
      promise: async (data, matches) => {
        data.combatantData = await fetchCombatants(matches.id);
      },
      // 시선 텔레그래프일 때만 초록으로 미리 표시(run보다 먼저 실행되므로 combatantData를 직접 판정).
      infoText: (data, _matches, output) => {
        const bnpc = data.combatantData?.[0]?.BNpcID;
        if (bnpc === 0x1EBFBE)
          return output.gaze!();
        if (bnpc === 0x1EBFBF)
          return output.look!();
      },
      run: (data) => {
        const bnpc = data.combatantData?.[0]?.BNpcID;
        if (bnpc === 0x1EBFBE)
          data.dmGazeType = 'gaze';
        else if (bnpc === 0x1EBFBF)
          data.dmGazeType = 'look';
      },
      outputStrings: {
        gaze: { en: 'Look Away (soon)', ko: '곧 뒤돌기' },
        look: { en: 'Look at Statue (soon)', ko: '곧 신상 보기' },
      },
    },
    {
      id: 'DancingMad 알쏭달쏭3',
      type: 'StartsUsing',
      // combo3 = 산개/쉐어 + 선더가(밖/안) + 태만/아베(뒤돌기/신상 보기). 3신상.
      // combo3엔 파이가(BAA3) ability가 없음(산개/쉐어는 마커 007F/0080로만). → 알쏭달쏭 마법(BA94)
      // 시전을 앵커로. 마커(선더가 02A5/02A6, 산개쉐어 007F/0080, 머리? 02A1/02A2)는 BA94 직전 부여됨.
      // dmStatueCount===3 + dmThunderInner로 combo3만 (combo1/2의 BA94 제외).
      netRegex: { id: 'BA94', source: '케프카', capture: false },
      condition: (data) => data.dmStatueCount === 3 && data.dmThunderInner !== undefined,
      delaySeconds: 0.2, // 플래그/마커뿐(promise 없음). 헤드마커 BA94보다 0.09s 먼저 도착(측정) → 0.2
      durationSeconds: 5.8, // 콜 → 선더가/태만 발동(끝 시점 동일 유지)
      suppressSeconds: 5,
      alertText: (data, _matches, output) => {
        // 선더가: 02A5=거짓(안에서) / 02A6=진실(밖에서)
        const inout = data.dmThunderInner ? output.inner!() : output.outer!();
        // 파이가 산개/쉐어: 머리?(02A1)면 반전 → 실제 처리할 것
        const spread = data.dmHeadInvert ? !data.dmSpreadBase : data.dmSpreadBase;
        const ss = spread ? output.spread!() : output.stack!();
        // 시선: 태만(뒤돌기) / 아베(신상 보기)
        const gaze = data.dmGazeType === 'gaze'
          ? output.gaze!()
          : (data.dmGazeType === 'look' ? output.look!() : output.gazeUnknown!());
        return output.combo3!({ inout: inout, ss: ss, gaze: gaze });
      },
      outputStrings: {
        combo3: { en: '${inout} ${ss} + ${gaze}', ko: '${inout} ${ss} + ${gaze}' },
        inner: { en: 'In', ko: '바닥 안에서' },
        outer: { en: 'Out', ko: '바닥 밖에서' },
        spread: { en: 'Spread', ko: '산개' },
        stack: { en: 'Stack', ko: '쉐어' },
        gaze: { en: 'Look Away', ko: '뒤돌기' },
        look: { en: 'Look at Statue', ko: '신상 보기' },
        gazeUnknown: { en: 'Gaze?', ko: '시선?' },
      },
    },
    {
      id: 'DancingMad 성모수마 산개',
      type: 'Tether',
      // 3번째 신들의 상 이후 선(002D): 연결된 석상이 바깥(성모/혼란)=바깥산개 / 안쪽(수마/수면)=안쪽산개.
      // 선 시점에 석상 위치를 getCombatants로 읽어 판정 (성모 중심거리~75 / 수마~57).
      netRegex: { id: '002D', source: '신들의 상' },
      condition: (data, matches) => data.me === matches.target && (data.dmStatueCount ?? 0) >= 3,
      delaySeconds: 0.3, // 석상 위치(271)는 선과 동시 확정 → 버퍼만 (측정 기반 0.5→0.3)
      durationSeconds: 8.2, // 선~산개 판정까지(끝 시점 동일 유지)
      promise: async (data, matches) => {
        data.combatantData = await fetchCombatants(matches.sourceId);
      },
      alertText: (data, _matches, output) => {
        const statue = data.combatantData?.[0];
        if (statue === undefined)
          return output.unknown!();
        // 중심(100,100)거리: 바깥(~75)=성모 / 안쪽(~57)=수마
        const dist = Math.hypot(statue.PosX - 100, statue.PosY - 100);
        return dist > 66 ? output.outer!() : output.inner!();
      },
      outputStrings: {
        outer: {
          en: 'Outer Spread (Confusion)',
          ko: '혼란: 바깥쪽 산개',
        },
        inner: {
          en: 'Inner Spread (Sleep)',
          ko: '수면: 안쪽 산개',
        },
        unknown: {
          en: 'Spread (check tether)',
          ko: '산개 (선 확인)',
        },
      },
    },
    // ───────── 성큼성큼 텔레포 (강제이동 디버프) ─────────
    {
      id: 'DancingMad 성큼성큼 수집',
      type: 'GainsEffect',
      // 성큼성큼 텔레포(BAB9) 강제이동 디버프. 본인은 2개 받음(짧은 7s + 긴 10s).
      // 방향: 130C/13D7=위 · 130D/13D8=아래 · 130E/13D9=오른쪽 · 130F/13DA=왼쪽. (13D6은 줄줄이 함정)
      // 두 방향의 조합(순서 무관)으로 위치 판정 → 아래 '성큼성큼 텔레포' 트리거.
      netRegex: { effectId: ['130C', '130D', '130E', '130F', '13D7', '13D8', '13D9', '13DA'] },
      condition: (data, matches) => data.me === matches.target,
      run: (data, matches) =>
        (data.dmMarch ??= []).push({ id: matches.effectId, dur: parseFloat(matches.duration) }),
    },
    {
      id: 'DancingMad 성큼성큼 텔레포',
      type: 'GainsEffect',
      // 본인 강제이동 디버프 2개 조합(순서 무관)으로 위치 안내. 상=up/하=down/좌=left/우=right.
      //   하하→북서 밖(상하) · 좌좌→북동 밖(좌우) · 상상→남동 밖(상하) · 우우→남서 밖(좌우)
      //   좌상→북서 안(상하) · 우상→북동 안(좌우) · 우하→남동 안(상하) · 좌하→남서 안(좌우)
      // 안쪽 4조합은 먼저 만료(짧은 지속)되는 방향에 따라 '~부터' 시작 안내를 덧붙임.
      netRegex: { effectId: ['130C', '130D', '130E', '130F', '13D7', '13D8', '13D9', '13DA'] },
      condition: (data, matches) => data.me === matches.target,
      delaySeconds: 0.3, // 디버프 2개는 동시 도착(측정) → 버퍼만 (0.5→0.3)
      durationSeconds: 9.7, // 부여 → 2번째(긴 10s 디버프) 설치까지(끝 시점 동일 유지)
      suppressSeconds: 5,
      alertText: (data, _matches, output) => {
        const m = data.dmMarch;
        if (m === undefined || m.length < 2)
          return;
        const e0 = m[0];
        const e1 = m[1];
        if (e0 === undefined || e1 === undefined)
          return;
        const d0 = marchDir(e0.id);
        const d1 = marchDir(e1.id);
        if (d0 === undefined || d1 === undefined)
          return;
        // 먼저 만료(짧은 지속)되는 디버프의 방향
        const shortDir = e0.dur <= e1.dur ? d0 : d1;
        const key = [d0, d1].sort().join('|');
        switch (key) {
          case 'down|down':
            return output.nwOut!();
          case 'left|left':
            return output.neOut!();
          case 'up|up':
            return output.seOut!();
          case 'right|right':
            return output.swOut!();
          case 'left|up': // 좌상: 좌 먼저→위부터 / 상 먼저→아래부터
            return output.nwIn!({
              from: shortDir === 'left' ? output.fromUp!() : output.fromDown!(),
            });
          case 'right|up': // 우상: 우 먼저→왼쪽부터 / 상 먼저→오른쪽부터
            return output.neIn!({
              from: shortDir === 'right' ? output.fromLeft!() : output.fromRight!(),
            });
          case 'down|right': // 우하: 우 먼저→아래부터 / 하 먼저→위부터
            return output.seIn!({
              from: shortDir === 'right' ? output.fromDown!() : output.fromUp!(),
            });
          case 'down|left': // 좌하(SW): 좌 먼저→오른쪽부터 / 하 먼저→왼쪽부터 (NE 점대칭, 인게임 검증)
            return output.swIn!({
              from: shortDir === 'left' ? output.fromRight!() : output.fromLeft!(),
            });
        }
        return; // 미정의 조합(상+하, 좌+우 등) → 표시 안 함
      },
      run: (data) => data.dmMarch = [],
      outputStrings: {
        nwOut: { en: 'NW outside (U/D)', ko: '북서 바깥쪽 (상하로)' },
        neOut: { en: 'NE outside (L/R)', ko: '북동 바깥쪽 (좌우로)' },
        seOut: { en: 'SE outside (U/D)', ko: '남동 바깥쪽 (상하로)' },
        swOut: { en: 'SW outside (L/R)', ko: '남서 바깥쪽 (좌우로)' },
        nwIn: { en: 'NW inside · ${from}', ko: '북서 안쪽 · ${from}' },
        neIn: { en: 'NE inside · ${from}', ko: '북동 안쪽 · ${from}' },
        seIn: { en: 'SE inside · ${from}', ko: '남동 안쪽 · ${from}' },
        swIn: { en: 'SW inside · ${from}', ko: '남서 안쪽 · ${from}' },
        // 먼저 처리할 자리 → 뒤에 처리할 자리 흐름
        fromUp: { en: 'Top→Bottom', ko: '위에서 아래로' },
        fromDown: { en: 'Bottom→Top', ko: '아래에서 위로' },
        fromLeft: { en: 'Left→Right', ko: '왼쪽에서 오른쪽으로' },
        fromRight: { en: 'Right→Left', ko: '오른쪽에서 왼쪽으로' },
      },
    },

    // ───────── P2 ─────────
    {
      id: 'DancingMad 종말의 포옹',
      type: 'StartsUsing',
      // C24C = 탱커 2명 쉐어 탱크버스터
      netRegex: { id: 'C24C', source: '케프카', capture: false },
      durationSeconds: 4.7, // 시전 4.7s → 해소
      // 탱커 포함 모두 초록색(info)
      infoText: (_data, _matches, output) => output.text!(),
      outputStrings: {
        text: {
          en: 'Shared Tankbuster',
          ko: '쉐어 탱버',
        },
      },
    },
    {
      id: 'DancingMad 행방불명',
      type: 'StartsUsing',
      // BABC = 전체공격 + 행방불명 운동회 시작. 직후 8명에게 위험한 주문 헤드마커(쉐어/부채꼴/산개) 부여.
      // 탑 세트 카운터(dmForsakenSet) 1로 초기화, 마커 수집 리셋.
      netRegex: { id: 'BABC', source: '케프카', capture: false },
      durationSeconds: 6.7, // 시전 6.7s → 해소
      response: Responses.aoe(),
      run: (data) => {
        data.dmForsakenSet = 1;
        data.dmForsakenMarks = {};
        data.dmForsakenGroup = 'B'; // 기본 B조; 1탑 처리(set2 마커 수령) 시 A조로 갱신
        data.dmForsakenInitMarks = {};
        data.dmForsakenAGroup = [];
        data.dmForsakenA8Marks = {};
        data.dmForsakenEndCount = 0;
        data.dmForsakenCurrent = {};
        data.dmForsakenPos = {}; // 09STOP 위치 추적 초기화
      },
    },
    {
      id: 'DancingMad 행방불명 탑 세트 카운터',
      type: 'Ability',
      // 빛의 파동(BABE)=탑 처리. 캐스트당 1회 세트++ & 다음 세트 마커 새로 수집(탑 처리자 새 헤드마커).
      netRegex: { id: 'BABE', source: '케프카', capture: false },
      suppressSeconds: 3,
      run: (data) => {
        if (data.dmForsakenSet !== undefined)
          data.dmForsakenSet++;
        data.dmForsakenMarks = {};
      },
    },
    {
      id: 'DancingMad 행방불명 조 판정',
      type: 'Ability',
      // A조 = 1탑 빛의 파동(BABE) 피격자 4명. 2·3탑은 사고 여지가 있어 보지 않고 1탑만 기준(어지간하면 1탑은 안전).
      //   마커 변경 여부와 무관하게 잡혀 마커 기반 명단보다 견고. 본인이 그 안에 있으면 A조.
      //   카운터(위 트리거)가 먼저 ++ → 탑1 피격 시점엔 set===2. (탑2=3·탑3=4… 제외.)
      //   헤드마커 버스트보다 빠른 이 시점에 판정해야 비처리조 안내 레이스 방지.
      netRegex: { id: 'BABE', source: '케프카' },
      condition: (data) => data.dmForsakenSet === 2,
      run: (data, matches) => {
        const a = (data.dmForsakenAGroup ??= []);
        if (!a.includes(matches.target))
          a.push(matches.target);
        if (matches.target === data.me)
          data.dmForsakenGroup = 'A';
      },
    },
    {
      id: 'DancingMad 행방불명 위험한 주문 수집',
      type: 'HeadMarker',
      // 위험한 주문 마커 수집. set별 추가 저장: set1=초기 전체(B조 4탑용) / set4=A조 8탑 마커(3탑 처리 후).
      //   (A조 명단은 마커가 아니라 '조 판정'이 빛의 파동 피격으로 모음 — 더 견고.) 탑 처리자만 새 마커를 받음.
      netRegex: { id: ['02CB', '02CC', '02CD'] },
      run: (data, matches) => {
        const role = forsakenRole(matches.id);
        if (role === undefined)
          return;
        (data.dmForsakenMarks ??= {})[matches.target] = role;
        (data.dmForsakenCurrent ??= {})[matches.target] = role; // 현재 마커 갱신(리셋X, 홀수탑 위치용)
        const set = data.dmForsakenSet ?? 0;
        if (set === 1)
          (data.dmForsakenInitMarks ??= {})[matches.target] = role;
        else if (set === 4)
          (data.dmForsakenA8Marks ??= {})[matches.target] = role;
      },
    },
    {
      id: 'DancingMad 행방불명 1탑 위치',
      type: 'HeadMarker',
      // 1탑(공략 1238/4567, 세트 쉐산부쉐): 우선순위 미확정(approach b) → (역할군×마커)로 위치 + 같은 조 쉐어 이름.
      // 시계는 3·5·7탑과 동일: 탱힐 쉐어=왼9시 / 딜러 쉐어=오5시 / 산개=왼3시 / 부채꼴=오7시.
      // (위치가 역할군×마커로만 정해져 파티 구성과 무관하게 동작. 역할 불명 시에만 징만 표시.)
      netRegex: { id: ['02CB', '02CC', '02CD'] },
      condition: (data, matches) => data.me === matches.target && data.dmForsakenSet === 1,
      delaySeconds: 0.5, // 8개 마커 수집 대기
      durationSeconds: 9,
      alertText: (data, matches, output) => {
        const role = forsakenRole(matches.id);
        if (role === undefined)
          return;
        const roleLabel = forsakenRoleLabel(role, output);
        // 역할 불명(none 등) → 좌우 판정 불가 → 징만
        if (data.role !== 'tank' && data.role !== 'healer' && data.role !== 'dps')
          return output.jingOnly!({ tower: 1, role: roleLabel });
        const isTh = data.role === 'tank' || data.role === 'healer';
        if (data.triggerSetConfig.dmForsakenMethod === '09stop') {
          // 1탑 트리거는 suppress가 없어 A조(첫·둘째 버스트 모두 등장)는 2번 발동됨.
          //   둘째 버스트=탑1 탑 처리 후 부2산2 재부여(InitMarks 덮어씀) → 시드/표시는 첫 버스트만(가드).
          if (Object.keys(data.dmForsakenPos ?? {}).length > 0)
            return; // 이미 시드됨 → 첫 표시(dur 9s) 유지
          data.dmForsakenPos = forsaken09Seed1All(data); // 1탑 시드(8명, 첫 버스트 기준)
          if (!isStdComp(data)) // 비표준 구성 → 좌우 판정 불가 → 마커종류만
            return output.jingOnly!({ tower: 1, role: roleLabel });
          // 쉐어=탱힐 왼중앙/딜러 오10(처리=안) / 부채·산개는 위치 생략, 같은 역할군 쉐어 대상자만.
          //   (오른쪽 쉐어는 3·5·7탑과 동일하게 오10.)
          if (role === 'stack') {
            const spot: ForsakenSpot = isTh
              ? { side: 'L', clock: output.cCenter!() }
              : { side: 'R', clock: output.c10!() };
            return forsakenSoakLine(output, 1, roleLabel, spot, true, false);
          }
          const stackName09 = forsakenStackName(data, isTh) ?? output.unknown!();
          return output.onlyStack!({ tower: 1, role: roleLabel, stack: stackName09 });
        }
        // 잼잼: 쉐어=탱힐 왼9/딜러 오5(처리=안). 부채꼴/산개는 위치 생략, 같은 역할군 쉐어 대상자만.
        if (role === 'stack') {
          const spot: ForsakenSpot = isTh
            ? { side: 'L', clock: output.c9!() }
            : { side: 'R', clock: output.c5!() };
          return forsakenSoakLine(output, 1, roleLabel, spot, true, false);
        }
        const stackName = forsakenStackName(data, isTh) ?? output.unknown!();
        return output.onlyStack!({ tower: 1, role: roleLabel, stack: stackName });
      },
      outputStrings: {
        ...forsakenOutputsAll,
        // 1탑(첫 안내) 부채/산개 전용: 위치 대신 같은 역할군 쉐어 대상자만(빛의 파동 전이라 A/B 미정).
        onlyStack: {
          en: 'T${tower} ${role} / stack: ${stack}',
          ko: '${tower}탑 ${role} / 쉐어: ${stack}',
        },
      },
    },
    {
      id: 'DancingMad 행방불명 정상 탑 위치',
      type: 'Ability',
      // 짝수탑 탑 처리 직접 안내: A조 2탑(set2), B조 6탑(set6). 4·8탑은 스왑 트리거.
      //   홀수탑(3·5·7) 탑 처리는 직전 짝수탑의 '분신 머리 유도/소멸발차기'에 통합되어 거기서 안내.
      // 빛의 파동(BABE) 앵커 + dmForsakenCurrent 기반 → 헤드마커 재부여를 못 받아도(사망·미변경) 항상 발동,
      //   최소 'N탑 / 탑 처리' 폴백(꼬여도 통합 포맷+[디버프 꼬임]). 정밀 set 판정은 지연 alertText에서(set=탑번호).
      netRegex: { id: 'BABE', source: '케프카', capture: false },
      condition: (data) => (data.dmForsakenSet ?? 0) >= 2,
      delaySeconds: 1, // BABE 후 ~0.6s 헤드마커 재부여 + 카운터 반영 대기
      durationSeconds: 9,
      suppressSeconds: 5,
      alertText: (data, _matches, output) => {
        const set = data.dmForsakenSet ?? 0;
        const mine = (data.dmForsakenGroup === 'A' && set === 2) ||
          (data.dmForsakenGroup === 'B' && set === 6);
        if (!mine) // 내 짝수 처리 탑(A2/B6)이 아니면 표시 안 함
          return;
        const tower = set; // set=탑번호
        if (data.triggerSetConfig.dmForsakenMethod === '09stop') {
          const map = forsaken09Compute(data, 'trans', false); // 직전 홀수 위치 → 짝수 전이
          data.dmForsakenPos = map;
          return forsaken09Show(data, output, false, map, true, tower);
        }
        // 잼잼: 내 조 4명 현재 마커(dmForsakenCurrent)로 자리. 마커 없으면 'N탑 / 탑 처리' 폴백.
        const marks = forsakenSoakGroupMarks(data);
        const myMark = marks[data.me ?? ''];
        if (myMark === undefined)
          return output.soakOnly!({ tower: tower });
        if (!isStdComp(data)) // 비표준 구성 → 탑 번호 + 본인 디버프만
          return output.jingOnly!({ tower: tower, role: forsakenRoleLabel(myMark, output) });
        return forsakenSoakText(myMark, marks, data, output, false, tower);
      },
      outputStrings: forsakenOutputsAll,
    },
    {
      id: 'DancingMad 행방불명 스왑 탑 위치',
      type: 'Ability',
      // 스왑 탑(짝수, 산산부부): A조 3탑 처리 직후 B조가 4탑(set4) / B조 7탑 처리 직후 A조가 8탑(set8).
      //   스왑조는 새 헤드마커 없이 기존 마커로 처리 → 빛의 파동(BABE)을 앵커로(HeadMarker 안 옴).
      //   4탑(B) 마커 = 초기 전체(InitMarks)에서 A조(AGroup) 제외 / 8탑(A) 마커 = 3탑 처리 후 수집(A8Marks).
      netRegex: { id: 'BABE', source: '케프카', capture: false },
      condition: (data) =>
        (data.dmForsakenGroup === 'B' && data.dmForsakenSet === 4) ||
        (data.dmForsakenGroup === 'A' && data.dmForsakenSet === 8),
      delaySeconds: 0.5,
      durationSeconds: 9,
      suppressSeconds: 5,
      alertText: (data, _matches, output) => {
        const tower = data.dmForsakenSet ?? 0; // B 4탑 / A 8탑 (set=탑번호)
        if (data.triggerSetConfig.dmForsakenMethod === '09stop') {
          // 8탑: 좌/우 탑 배정이 유저 임의 룰(캑봇 모름) → side 없이 시만(generic).
          if (data.dmForsakenSet === 8)
            return forsaken09Show(data, output, false, {}, true, 8, true);
          // 4탑=B조 첫 처리(시드).
          const map = forsaken09Compute(data, 'seed4', false);
          data.dmForsakenPos = map;
          return forsaken09Show(data, output, false, map, true, tower);
        }
        // 잼잼 처리조 4명 마커맵: 4탑=InitMarks−AGroup / 8탑=A8Marks 그대로.
        let marks: { [name: string]: ForsakenRole };
        if (data.dmForsakenSet === 4) {
          const aSet = new Set(data.dmForsakenAGroup ?? []);
          marks = {};
          for (const [name, r] of Object.entries(data.dmForsakenInitMarks ?? {})) {
            if (!aSet.has(name))
              marks[name] = r;
          }
        } else {
          marks = data.dmForsakenA8Marks ?? {};
        }
        const myRole = marks[data.me ?? ''];
        if (myRole === undefined) // 저장 마커 없음(사망 등) → 탑 번호 폴백
          return output.soakOnly!({ tower: tower });
        if (!isStdComp(data)) // 비표준 구성 → 탑 번호 + 본인 디버프만
          return output.jingOnly!({ tower: tower, role: forsakenRoleLabel(myRole, output) });
        return forsakenSoakText(myRole, marks, data, output, false, tower);
      },
      outputStrings: forsakenOutputsAll,
    },
    {
      id: 'DancingMad 행방불명 분신 설치 (비처리조)',
      type: 'Ability',
      // 짝수탑 비처리조 = 분신 설치. B조=2·8탑(set2/8), A조=4·6탑(set4/6). (홀수탑 디버프 유도는 통합되어 별도 X)
      // 게이팅을 지연 텍스트에서 — 빛의 파동 첫 줄 시점엔 조 판정이 아직일 수 있어 레이스 방지.
      //   본 액션이라 alertText(노랑). 예고(머리유도)만 초록.
      netRegex: { id: 'BABE', source: '케프카', capture: false },
      condition: (data) => (data.dmForsakenSet ?? 0) >= 2,
      delaySeconds: 0.5,
      durationSeconds: 9,
      suppressSeconds: 5,
      alertText: (data, _matches, output) => {
        const set = data.dmForsakenSet ?? 0;
        const g = data.dmForsakenGroup;
        const placeClone = (g === 'B' && (set === 2 || set === 8)) ||
          (g === 'A' && (set === 4 || set === 6));
        if (!placeClone)
          return;
        // 09STOP: 탱힐만 분신 설치, 근딜=왼9 부채꼴 유도, 원딜=오3 부채꼴 유도(비처리=밖).
        if (data.triggerSetConfig.dmForsakenMethod === '09stop') {
          // 비표준 구성 → 근/원 분리 불확정 → 잼잼식 공통 분신 설치로 폴백.
          if (!isStdComp(data) || data.role === 'tank' || data.role === 'healer')
            return output.placeClone!({ tower: set });
          const spot: ForsakenSpot = forsakenIsMeleeSide(data) // 근딜측(근딜 또는 근딜 대체 캐스터)
            ? { side: 'L', clock: output.c9!() }
            : { side: 'R', clock: output.c3!() };
          return forsakenSoakLine(output, set, output.nonSoakCone!(), spot, false, false);
        }
        return output.placeClone!({ tower: set });
      },
      outputStrings: forsakenOutputsAll,
    },
    {
      // '분신 머리 유도'(BAD2/BAD3 Ability)의 선행 안내: 종언 캐스팅 시작(StartsUsing) 시점에
      //   미래(BAD2)=보스 너머 / 과거(BAD3)=탑 사이를 미리 예고해 빠른 위치 선점 유도.
      //   본 안내(분신 머리 유도: 캐스트~6.4s + delay 1.5 ≈ 7.9s 후)가 뜨기 전에 사라지도록 delay 2.5 + dur 5
      //   → 캐스트 시작 2.5s 후 떠서 5s 표시(=7.5s에 사라짐).
      //   8탑(4번째 종언, 캐스트 시점엔 endCount 아직 3)은 미래/과거 무관 '터진 8탑 사이로'.
      id: 'DancingMad 행방불명 분신 머리 유도 선행',
      type: 'StartsUsing',
      netRegex: { id: ['BAD2', 'BAD3'], source: '케프카', capture: true },
      delaySeconds: 2.5,
      durationSeconds: 5,
      suppressSeconds: 5,
      infoText: (data, matches, output) => {
        if ((data.dmForsakenEndCount ?? 0) >= 3) // 4번째 종언(8탑): 캐스트 시점은 증가 전이라 3
          return output.bait8!();
        return matches.id === 'BAD2' ? output.future!() : output.past!();
      },
      outputStrings: {
        bait8: { en: 'Then bait between burst towers', ko: '이후 터진 8탑 사이에서 머리 유도' },
        future: { en: 'Then bait behind boss', ko: '이후 보스 너머에서 머리 유도' },
        past: { en: 'Then bait between towers', ko: '이후 탑 사이에서 머리 유도' },
      },
    },
    {
      id: 'DancingMad 행방불명 분신 머리 유도',
      type: 'Ability',
      // 짝수탑 분신 설치 후 8명 전원 머리 유도(BAD2 미래=보스 너머 / BAD3 과거=탑 사이).
      //   다음 홀수탑 '위치(시계)'만 '(이후 ~~~)'로 미리 붙여 빠른 이동 유도 → 자세한 마커종류/유도법은
      //   소멸발차기 타이밍(홀수탑 안내 트리거)에서 표시. 8탑(4번째 종언)은 다음 탑 없음 → 방향만.
      // delay 1.5: 종언끝 직후(~1.3s) 다음 홀수탑 마커 수집 대기. duration 4.8 → 홀수탑 안내로 인계.
      netRegex: { id: ['BAD2', 'BAD3'], source: '케프카', capture: true },
      preRun: (data, matches) => {
        data.dmForsakenEndCount = (data.dmForsakenEndCount ?? 0) + 1;
        data.dmForsakenLastEnd = matches.id === 'BAD2' ? 'future' : 'past'; // 8탑 후 이동!/대기! 판정용
      },
      delaySeconds: 1.5,
      durationSeconds: 4.8,
      suppressSeconds: 5,
      infoText: (data, matches, output) => {
        if ((data.dmForsakenEndCount ?? 0) >= 4) // 8탑: 마지막, 미래/과거 무관 터진 8탑 사이로
          return output.bait8!();
        const dir = matches.id === 'BAD2' ? output.dirFuture!() : output.dirPast!();
        // 미리보기: 다음 홀수탑 위치만(commit 안 함). 09STOP은 forsaken09NextGuidance(commit=false).
        const next = data.triggerSetConfig.dmForsakenMethod === '09stop'
          ? forsaken09NextGuidance(data, output, false)
          : forsakenNextPos(data, output);
        return output.baitNext!({ dir: dir, next: next });
      },
      outputStrings: {
        ...forsakenOutputsAll,
        bait8: { en: 'Bait between burst towers', ko: '터진 8탑 사이에서 머리 유도' },
        dirFuture: { en: 'Behind boss', ko: '보스 너머로' },
        dirPast: { en: 'Between towers', ko: '탑 사이로' },
        baitNext: { en: '${dir} (then ${next})', ko: '${dir} (이후 ${next})' },
      },
    },
    {
      // 트리거 타이밍은 분신 소멸의 발차기 시전이지만, 내용은 그 경고가 아니라 '다음 홀수탑 처리' 안내.
      id: 'DancingMad 행방불명 홀수탑 안내',
      type: 'StartsUsing',
      // 분신 소멸의 발차기 시전 시작 시점 → 다음 홀수탑 처리 안내(마커종류+위치) 표시(머리유도 통합 흐름).
      //   미래의 종언=BADC / 과거의 종언=BADD. 8탑(4번째)은 다음 탑 없음 → 직전 종언 방향따라 이동!/대기!.
      netRegex: { id: ['BADC', 'BADD'], source: '케프카', capture: false },
      durationSeconds: 5.5,
      suppressSeconds: 5,
      // 본 액션이라 처리/비처리 모두 alertText(노랑). 예고(머리유도)만 초록.
      //   8탑(다음 탑 없음): 직전 분신 종언이 미래면 '이동!', 과거면 '대기!'.
      //   09STOP은 forsaken09NextGuidance(commit=true)로 홀수탑 위치 기록+상세 표시.
      alertText: (data, _matches, output) => {
        if ((data.dmForsakenEndCount ?? 0) >= 4)
          return data.dmForsakenLastEnd === 'past' ? output.wait!() : output.move!();
        return data.triggerSetConfig.dmForsakenMethod === '09stop'
          ? forsaken09NextGuidance(data, output, true)
          : forsakenNextGuidance(data, output, 2 * (data.dmForsakenEndCount ?? 0) + 1);
      },
      outputStrings: {
        ...forsakenOutputsAll,
        move: { en: 'Move!', ko: '이동!' },
        wait: { en: 'Wait!', ko: '대기!' },
      },
    },
    {
      // 첫 번째 파괴의 날개(한쪽 날개): BACD=왼쪽 날개 빛→오른쪽 회피 / BACE=오른쪽 날개 빛→왼쪽 회피.
      //   (두 번째 파괴의 날개 C487/BACF는 양 날개라 회피 방향 없음 → 트리거 X.)
      id: 'DancingMad 파괴의 날개 회피',
      type: 'StartsUsing',
      netRegex: { id: ['BACD', 'BACE'], source: '케프카' },
      durationSeconds: 4, // 시전(~4s) 동안 유지
      alertText: (_data, matches, output) =>
        matches.id === 'BACD' ? output.right!() : output.left!(),
      outputStrings: {
        right: { en: 'Right', ko: '오른쪽으로' },
        left: { en: 'Left', ko: '왼쪽으로' },
      },
    },
    {
      id: 'DancingMad 트라인 배치',
      type: 'Ability',
      // 트라인(BADF) + delay → getCombatants로 첫 3개 삼각형 위치 읽어 배정. '이후 ~' 초록 안내.
      //   탱커=T1+T2 두 자리(순서구분X), 그 외(딜힐)=본진 1자리. 1번째 날개 회피와 동시(날개=노랑/배치=초록).
      netRegex: { id: 'BADF', source: '케프카', capture: false },
      delaySeconds: 1.5,
      durationSeconds: 11, // 1트라인 폭발(이동 안내)까지 유지
      promise: async (data) => {
        data.combatantData = (await callOverlayHandler({ call: 'getCombatants' })).combatants;
      },
      infoText: (data, _matches, output) => {
        const all = data.combatantData ?? [];
        // 삼각형 = 주인 없는 NPC(BNpcID 있음·OwnerID 없음) & 육각 6칸 정확 좌표 위(반경<1.5).
        //   플레이어(BNpcID 없음)·펫/분신(OwnerID 있음, 영웅의 환영 등)은 칸 위에 서 있어도 제외.
        //   중앙·칸 밖 마커는 반경으로 제외. 조회 시점(BADF+1.5s)엔 1차 3개만 칸 위(2·3차 미스폰).
        //   BNpcNameID는 에뮬서 깨져 미사용. BNpcID/OwnerID는 정상.
        const tris = all.filter((c) => {
          if (c.BNpcID === undefined || c.OwnerID !== undefined)
            return false;
          const i = dmTrineNearest(c.PosX, c.PosY);
          const dx = c.PosX - dmTrineSpots[i]!.x;
          const dy = c.PosY - dmTrineSpots[i]!.y;
          return (dx * dx + dy * dy) < 2.25;
        });
        if (tris.length !== 3) // 칸 위 3개 미수집(타이밍/불완전 풀) → 생략
          return;
        const idxs = tris.map((c) => dmTrineNearest(c.PosX, c.PosY)).sort((x, y) => x - y);
        const assign = dmTrineAssign(idxs);
        if (assign === undefined)
          return;
        const dirs = [
          output.dirN!(),
          output.dirNE!(),
          output.dirSE!(),
          output.dirS!(),
          output.dirSW!(),
          output.dirNW!(),
        ];
        const rels: { [k: string]: string } = {
          'left': output.relLeft!(),
          'mid': output.relMid!(),
          'right': output.relRight!(),
          'one': output.relOne!(),
          '': '',
        };
        const fmt = (idx: number, rel: string) =>
          rel === '' ? dirs[idx]! : `${dirs[idx]!}(${rels[rel]!})`;
        const type = assign.type === 'consecutive'
          ? output.consecutive!()
          : (assign.type === 'twoOne' ? output.twoOne!() : output.oneEach!());
        if (data.role === 'tank') {
          return output.tank!({
            type: type,
            left: fmt(assign.t1, assign.relT1),
            right: fmt(assign.t2, assign.relT2),
          });
        }
        return output.body!({ type: type, spot: fmt(assign.body, assign.relBody) });
      },
      outputStrings: {
        consecutive: { en: '3-in-row', ko: '3연속' },
        twoOne: { en: '2:1', ko: '2:1' },
        oneEach: { en: '1:1:1', ko: '1:1:1' },
        dirN: { en: 'N', ko: '북쪽' },
        dirNE: { en: 'NE', ko: '북동쪽' },
        dirSE: { en: 'SE', ko: '남동쪽' },
        dirS: { en: 'S', ko: '남쪽' },
        dirSW: { en: 'SW', ko: '남서쪽' },
        dirNW: { en: 'NW', ko: '북서쪽' },
        relLeft: { en: 'left', ko: '왼쪽' },
        relMid: { en: 'mid', ko: '중간' },
        relRight: { en: 'right', ko: '오른쪽' },
        relOne: { en: '1 away', ko: '1칸' },
        tank: { en: 'Then ${type} - ${left} + ${right}', ko: '이후 ${type} - ${left} + ${right}' },
        body: { en: 'Then ${type} - ${spot}', ko: '이후 ${type} - ${spot}' },
      },
    },
    {
      id: 'DancingMad 트라인 이동',
      type: 'Ability',
      // 1트라인(첫 3개) 폭발 = 첫 BAE0 → 이동 시작(2번째 파괴의 날개 양쪽 대응). suppress로 첫 폭발만.
      netRegex: { id: 'BAE0', source: '케프카', capture: false },
      // 첫 BAE0(365.6)~파괴의 날개 양쪽 피격(BACF 370.0)≈4.4s → 피격 직전까지 유지.
      durationSeconds: 4.3,
      suppressSeconds: 20,
      alertText: (data, _matches, output) =>
        data.role === 'tank' ? output.tankMove!() : output.bodyMove!(),
      outputStrings: {
        tankMove: { en: 'Move! Farthest / Closest!', ko: '이동! 가장 멀리 / 가까이!' },
        bodyMove: { en: 'Move to party spot!', ko: '이동! 본대 위치로!' },
      },
    },
  ],
};

export default triggerSet;
