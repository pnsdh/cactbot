import Conditions from '../../../../../resources/conditions';
import { callOverlayHandler } from '../../../../../resources/overlay_plugin_api';
import { Responses } from '../../../../../resources/responses';
import ZoneId from '../../../../../resources/zone_id';
import { RaidbossData } from '../../../../../types/data';
import { PluginCombatantState } from '../../../../../types/event';
import { TriggerSet } from '../../../../../types/trigger';

// 페이즈 구분(업스트림 방식 채택): 보스 단계. dmStatueCount(P1 세부 단계)와는 별개·보완 관계.
type Phase = 'p1' | 'p2' | 'p3';
const phases: { [id: string]: Phase } = {
  'C24C': 'p2', // 종말의 포옹 (God 케프카)
  'C3F7': 'p3', // 갈기갈기 에어로가 (카오스·엑스데스)
};

export interface Data extends RaidbossData {
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
}

// =============================================================================
// Dancing Mad (Ultimate) / 절 요성난무 — 개인용(한글), P1 중심
// =============================================================================
// 진행도: P1(케프카) 완성 / P2 일부. 미구현(개인 판단으로 제외): 미래의 종언·빛의 파동 타워·소멸의 발차기.
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

const triggerSet: TriggerSet<Data> = {
  id: 'DancingMadUltimate',
  zoneId: ZoneId.DancingMadUltimate,
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
      delaySeconds: 0.5, // 구슬 회전 + 마커 수집
      durationSeconds: 4.5, // 콜(+0.5) → 널리널리 블리자가 발동까지
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
      delaySeconds: 0.5,
      durationSeconds: 4.5,
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
      delaySeconds: 0.5,
      durationSeconds: 4.5,
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
      delaySeconds: 0.6, // 머리고리/블리자가 수집 보장 (블리자가 통합 0.5보다 뒤)
      durationSeconds: 4, // 콜(+0.6) → 원소 해소(시전 4.7s)
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
      // (아래 '내것'보다 배열상 먼저 위치 → 같은 줄에서 false→true 순서 보장.)
      netRegex: { effectId: '13D6', capture: false },
      suppressSeconds: 4,
      run: (data) => data.dmTrapMine = false,
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
      delaySeconds: 0.5, // 석상 위치(271 ActorSetPos) 처리 대기
      durationSeconds: 6.5, // 선(걸림) → 중력탄(BAAC) 해소까지 ≈ 6.5s (이후 '이동' 콜이 인계)
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
          ko: '반대편으로 (눈으로)',
        },
      },
    },
    // ───────── 신들의 상 3상: 태만·아베(시선) / 알쏭달쏭3 / 성모수마 ─────────
    {
      id: 'DancingMad 태만 아베 수집',
      type: 'ActorControlExtra',
      // 태만의 신기(BAB4)/아베 마리아(BAB3)는 캐스트 없지만, 발동 ~10초 전 273 019D|40|80 텔레그래프로
      // 미리 판정. 그 액터를 getCombatants로 읽어 BNpcID 구분: 1EBFBE=태만(뒤돌기) / 1EBFBF=아베(신상 보기).
      // NOTE(에뮬 한계): 이 텔레그래프 액터는 '전투 시작 전' 세팅 단계(엔게이지 ~26s 전)에 생성됨.
      //   에뮬레이터는 전투(InCombat) 구간만 재생해 Add 시점의 BNpcID를 잃어버림 → 에뮬에선 '시선?' 폴백.
      //   실전(live)은 getCombatants가 게임 메모리를 직접 읽어 BNpcID가 있으므로 정상 작동.
      netRegex: {
        id: '4[0-9A-Fa-f]{7}',
        category: '019D',
        param1: '40',
        param2: '80',
        capture: true,
      },
      condition: (data) => data.dmStatueCount === 3,
      promise: async (data, matches) => {
        data.combatantData = await fetchCombatants(matches.id);
      },
      run: (data) => {
        const bnpc = data.combatantData?.[0]?.BNpcID;
        if (bnpc === 0x1EBFBE)
          data.dmGazeType = 'gaze';
        else if (bnpc === 0x1EBFBF)
          data.dmGazeType = 'look';
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
      delaySeconds: 1, // 헤드마커 수집 보장
      durationSeconds: 5, // 콜 → 선더가/태만 발동(~4.7s)
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
      delaySeconds: 0.5, // 석상 위치(271 ActorSetPos) 처리 대기
      durationSeconds: 8, // 선~산개 판정까지
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
          ko: '바깥쪽 산개',
        },
        inner: {
          en: 'Inner Spread (Sleep)',
          ko: '안쪽 산개',
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
      delaySeconds: 0.5, // 디버프 2개 수집 대기
      durationSeconds: 9.5, // 부여 → 2번째(긴 10s 디버프) 설치까지
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
          case 'down|left': // 좌하: 좌 먼저→왼쪽부터 / 하 먼저→오른쪽부터
            return output.swIn!({
              from: shortDir === 'left' ? output.fromLeft!() : output.fromRight!(),
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
      // BABC = 전체공격. 직후 8명에게 헤드마커(쉐어/개인/부채꼴) 부여 → 아래 헤드마커 트리거가 처리
      netRegex: { id: 'BABC', source: '케프카', capture: false },
      durationSeconds: 6.7, // 시전 6.7s → 해소
      response: Responses.aoe(),
    },
    {
      id: 'DancingMad 위험한 주문 헤드마커',
      type: 'HeadMarker',
      // 행방불명 직후 부여. 02CB = 쉐어, 02CD = 부채꼴, 02CC = 개인.
      netRegex: { id: ['02CB', '02CC', '02CD'] },
      condition: Conditions.targetIsYou(),
      durationSeconds: 11, // 마커 부여 → 타워 해소까지 ~12s (역할 유지)
      alertText: (_data, matches, output) => {
        if (matches.id === '02CB')
          return output.share!();
        if (matches.id === '02CD')
          return output.cone!();
        return output.solo!(); // 02CC
      },
      outputStrings: {
        share: {
          en: 'Stack',
          ko: '쉐어',
        },
        cone: {
          en: 'Cone',
          ko: '부채꼴',
        },
        solo: {
          en: 'Spread',
          ko: '개인',
        },
      },
    },
  ],
};

export default triggerSet;
