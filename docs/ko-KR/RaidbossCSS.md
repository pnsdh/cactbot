# Raidboss CSS 커스터마이징

이 포크는 raidboss 오버레이(알람·타임라인)를 사용자 CSS와 스킨으로 더 넓게 꾸밀 수 있도록
CSS 변수, 클래스, 속성을 추가로 제공합니다.
아무것도 지정하지 않으면 기본 모양은 본가 cactbot과 같습니다.

## 목차

1. [CSS 적용 순서](#css-적용-순서)
1. [CSS 변수: 알람·타임라인](#css-변수-알람타임라인)
1. [CSS 변수: 타임라인 막대 내부](#css-변수-타임라인-막대-내부)
1. [::part 선택자](#part-선택자)
1. [상태 클래스와 속성](#상태-클래스와-속성)
1. [예시](#예시)
1. [참고사항](#참고사항)

## CSS 적용 순서

1. 기본 CSS (`ui/raidboss/raidboss.css`)
1. 스킨 CSS (cactbot 설정 → `Raidboss 스킨`에서 선택한 경우)
1. 사용자 CSS (사용자 디렉토리의 `raidboss.css`)

뒤에 적용되는 CSS가 앞의 값을 덮어씁니다. 스킨을 쓰면서 일부만 바꾸고 싶다면 사용자 CSS에 해당 값만 지정합니다.
사용자 디렉토리 설정은 [Cactbot 사용자 설정](CactbotCustomization.md#user-디렉토리-설정하기)을 참고합니다.

## CSS 변수: 알람·타임라인

`:root`에 지정합니다. 지정하지 않은 변수는 괄호 안의 기본값을 사용합니다.
타임라인 크기의 기본값은 언어에 따라 다르며, 변수를 지정하면 모든 언어에 같은 값이 적용됩니다.

| 변수 | 대상 | 기본값 |
| --- | --- | --- |
| `--raidboss-font-family` | 오버레이 전체 글꼴 (타임라인 막대 안 글자는 제외) | 브라우저 기본 |
| `--popup-text-shadow` | 알람 글자 그림자 | 검은 테두리 그림자 |
| `--info-text-color` | info 알람 색 | `#2b2` |
| `--info-text-font-size` | info 알람 크기 | `140%` |
| `--popup-text-info-top` | info 알람 세로 위치 | `155px` |
| `--alert-text-color` | alert 알람 색 | `#fb0` |
| `--alert-text-font-size` | alert 알람 크기 | `170%` |
| `--popup-text-alert-top` | alert 알람 세로 위치 | `90px` |
| `--alarm-text-color` | alarm 알람 색 | `#f30` |
| `--alarm-text-font-size` | alarm 알람 크기 | `230%` |
| `--popup-text-alarm-top` | alarm 알람 세로 위치 | `0` |
| `--timeline-width` | 타임라인 너비 | `220px` (한국어 `250px`, 독일어·프랑스어 `300px`) |
| `--timeline-height` | 타임라인 높이 | `100%` (한국어 `140px`) |
| `--timeline-font-size` | 타임라인 글자 크기 | `14px` (한국어 `15px`) |
| `--timeline-bar-height` | 타임라인 막대 높이 | `18px` (한국어 `23px`) |
| `--timeline-bar-gap` | 타임라인 막대 간격 | `0` |
| `--timeline-bar-color` | 막대 채움 색 | `#88f` |
| `--timeline-bar-soon-color` | 곧 시전될 막대의 채움 색 | `#f88` |

`--timeline-bar-color`와 `--timeline-bar-soon-color`는 오버레이가 시작될 때 한 번 읽어 적용되며, 단색만 사용할 수 있습니다.
그라데이션 등은 아래 `--timerbar-fg`를 사용합니다.

## CSS 변수: 타임라인 막대 내부

타임라인 막대(`timer-bar`)는 내부가 Shadow DOM으로 되어 있어 일반 선택자로는 안쪽을 꾸밀 수 없습니다.
대신 아래 변수를 `timer-bar` 요소나 그 바깥 요소에 지정하면 안쪽에 적용됩니다.
raidboss의 타임라인 막대만 바꾸려면 `.timer-bar timer-bar`에 지정합니다.

| 변수 | 대상 | 기본값 |
| --- | --- | --- |
| `--timerbar-font-family` | 막대 글자 글꼴 | `arial` |
| `--timerbar-font-weight` | 막대 글자 굵기 | `bold` |
| `--timerbar-text-color` | 막대 글자 색 | `white` |
| `--timerbar-text-shadow` | 막대 글자 그림자 | 검은 그림자 |
| `--timerbar-border` | 막대 테두리 | `1px solid black` |
| `--timerbar-border-radius` | 막대 모서리 둥글기 | `0` |
| `--timerbar-overflow` | 내용 잘라내기 (둥근 모서리에는 `hidden`) | `visible` |
| `--timerbar-bg` | 막대 배경 (그라데이션 가능) | 막대에 지정된 배경색 (`black`) |
| `--timerbar-bg-opacity` | 막대 배경 투명도 | `0.8` |
| `--timerbar-fg` | 막대 채움 (그라데이션 가능) | 막대에 지정된 채움 색 |
| `--timerbar-fg-opacity` | 막대 채움 투명도 | `1.0` |

막대 안쪽에는 다음 값도 자동으로 설정되며, `::part` 규칙 안에서 `var()`로 읽을 수 있습니다.

| 변수 | 내용 |
| --- | --- |
| `--timerbar-progress` | 채워진 비율 (`0`~`1`). 매 프레임 갱신됩니다. |

기본 막대는 채움을 가로로 늘이는 방식(`scaleX`)이라 그라데이션을 넣으면 함께 늘어납니다.
고정된 그라데이션이 드러나게 하려면 `--timerbar-progress`와 `clip-path`를 사용합니다.

```css
.timer-bar timer-bar::part(timerbar-fg) {
  transform: none !important;
  clip-path: inset(0 calc((1 - var(--timerbar-progress, 1)) * 100%) 0 0);
  background: linear-gradient(90deg, #4f6bed, #7b8ff7);
}
```

`--timerbar-fg`를 지정하면 곧 시전될 막대의 색 변화도 덮어씁니다.
곧 시전될 막대에 다른 채움을 주려면 `.timer-bar.soon timer-bar`에 따로 지정합니다.

## ::part 선택자

`timer-bar::part(이름)`으로 막대 안쪽 요소에 직접 CSS를 적용할 수 있습니다.

| 이름 | 요소 |
| --- | --- |
| `timerbar-root` | 막대 전체 |
| `timerbar-bg` | 배경 |
| `timerbar-fg` | 채움 |
| `text-container` | 글자 영역 (왼쪽·가운데·오른쪽 각각) |
| `text` | 글자 (왼쪽·가운데·오른쪽 공통) |
| `timerbar-lefttext` | 왼쪽 글자 (기술 이름) |
| `timerbar-centertext` | 가운데 글자 |
| `timerbar-righttext` | 오른쪽 글자 (남은 시간) |

## 상태 클래스와 속성

| 선택자 | 대상 |
| --- | --- |
| `.timer-bar.soon` | 곧 시전될 막대 (cactbot 설정의 `BarExpiresSoonSeconds` 이내) |
| `.timer-bar.channeling` | 시전 중인 막대. cactbot은 원래 막대를 같은 줄에서 이 막대로 바꾸며, 이름 앞에 `시전중:`을 붙입니다. |
| `.timer-bar.next` | 가장 먼저 끝나는 막대 (시전 막대 포함). 끝난 뒤 사라질 때까지 유지됩니다. |
| `.timer-bar.expired` | 시간이 다 된 막대 (`KeepExpiredTimerBarsForSeconds` 동안 표시) |
| `timer-bar[ended]` | 막대 안쪽(`timer-bar` 요소)에 시간이 0이 된 바로 그 프레임부터 붙는 속성. 남은 시간 글자가 비는 시점과 같습니다. |
| `.timer-bar[data-text="..."]` | 특정 기술의 막대. 예: `.timer-bar[data-text*="알테마"]` |
| `.info-text`, `.alert-text`, `.alarm-text` | 알람 단계별 글자 |
| `[data-trigger-id="..."]` | 특정 트리거의 알람. 트리거 ID는 cactbot 설정의 트리거 목록에서 확인합니다. |
| `.countdown` | 알람 안의 카운트다운 숫자 |

## 예시

```css
/* 사용자 디렉토리의 raidboss.css */
:root {
  --raidboss-font-family: "Pretendard", sans-serif;
  --timeline-width: 280px;
  --timeline-bar-height: 26px;
  --timeline-bar-gap: 4px;
}

.timer-bar timer-bar {
  --timerbar-font-family: "Pretendard", sans-serif;
  --timerbar-font-weight: 600;
  --timerbar-border: none;
  --timerbar-border-radius: 6px;
  --timerbar-overflow: hidden;
  --timerbar-bg: rgb(20 24 36 / 75%);
  --timerbar-fg: linear-gradient(90deg, #4f6bed, #7b8ff7);
}

.timer-bar.soon timer-bar {
  --timerbar-fg: linear-gradient(90deg, #e5484d, #ff7a7f);
}

/* 특정 기술 강조 */
.timer-bar[data-text*="알테마"] timer-bar {
  --timerbar-text-color: #ffd54a;
}

/* 알람 카운트다운 숫자만 작게 */
.alert-text .countdown {
  font-size: 70%;
  opacity: 0.8;
}
```

## 참고사항

* `.timer-bar`에 애니메이션을 넣을 때는 제거 애니메이션(`.animate-timer-bar-removed`)이 덮어써지지 않도록 더 높은 우선순위로 따로 지정합니다.
  cactbot은 제거 애니메이션이 끝나기를 기다렸다가 막대를 지우며, 끝나지 않으면 3초 뒤에 지웁니다.

* 글꼴을 바꾸면 막대 안 글자의 세로 위치가 어긋날 수 있습니다. 이때는 글자 영역을 직접 맞춥니다.

  ```css
  .timer-bar timer-bar::part(text-container) {
    top: 0;
    height: 100%;
    display: flex;
    align-items: center;
  }
  ```

* 글꼴은 PC에 설치되어 있거나 `@font-face`로 불러와야 합니다.
  사용자 CSS는 페이지에 직접 삽입되므로 상대 경로가 사용자 디렉토리가 아닌 `ui/raidboss/` 기준이 됩니다.
  사용자 CSS에서 글꼴 파일을 불러올 때는 `url("file:///C:/.../font.woff2")`처럼 절대 경로를 사용합니다.
* `--timerbar-*` 변수와 `::part`는 jobs 오버레이의 막대에도 같은 방식으로 적용할 수 있습니다.
* 스타일이 적용되지 않으면 OverlayPlugin의 개발자 도구(오버레이 설정 → `개발자 도구 열기`)에서 요소와 적용된 CSS를 확인합니다.
