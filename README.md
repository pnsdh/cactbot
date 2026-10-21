# cactbot (한국어 개인 포크)

[![최신 릴리즈](https://img.shields.io/github/v/release/pnsdh/cactbot?color=brightgreen&sort=semver)](https://github.com/pnsdh/cactbot/releases/latest)

[cactbot](https://github.com/OverlayPlugin/cactbot)에 한국 서버용 트리거와 스킨을 더한 포크입니다. 본가 업데이트는 자동으로 반영됩니다.

* 절 요성난무(P1~P5) 트리거·타임라인을 한국 서버 공략에 맞춰 따로 작성했습니다. 전투마다 본가 트리거로 바꿔 쓸 수도 있습니다.
* 알람·타임라인과 웁시레이지용 `cbkr` 스킨을 제공합니다(기본 스킨).
* 설정 화면을 새로 디자인했고, 트리거 문구와 타임라인 항목(문구·숨기기·강조색)을 전투마다 바꿀 수 있습니다.
* TTS가 플레이어를 직업으로 읽고, 문구마다 TTS로 읽을 말을 따로 쓸 수 있습니다.
* 사용자 폴더에 cactbot 트리거 파일(TypeScript)을 그대로 복사해 고쳐 쓸 수 있습니다.

**[OverlayPlugin 한국어 포크](https://github.com/pnsdh/OverlayPlugin)를 함께 쓰는 것을 권장합니다.** 타임라인이 더 부드럽게 움직이고, TTS가 중요한 알림을 먼저 읽으며 경고·주의·안내별로 크기를 정할 수 있습니다. 본가 OverlayPlugin에서도 이 두 가지 말고는 모두 동작합니다.

## 설치

ACT, FFXIV ACT Plugin, OverlayPlugin이 필요합니다. 없다면 해루봇이나 [본가 한국어 안내](docs/ko-KR/README.md#설치하기)로 먼저 설치합니다(cactbot은 설치하지 않아도 됩니다).

### 기존 cactbot을 쓰던 경우

처음 쓰는 경우는 건너뜁니다. 트리거 옵션 등 cactbot 설정은 그대로 유지됩니다.

1. **사용자 폴더 옮기기**: ACT의 `Plugins` 탭 → `OverlayPlugin.dll` 탭 → `Cactbot Config` → `GENERAL`에서 사용자 디렉토리(`Cactbot user directory`)를 확인합니다.
   그 폴더를 ACT 폴더 바로 아래에 `cbkr-user`라는 이름으로 복사하고, 같은 화면의 `디렉토리 선택`으로 `cbkr-user`를 지정합니다.
   * 해루봇으로 설치했다면 보통 `...\Advanced Combat Tracker\FileResources\user`, `(기본)`이면 `...\Plugins\cactbot\user`입니다.
1. **기존 cactbot 제거**
   * 해루봇 사용자: 해루봇의 플러그인 목록에서 Cactbot을 삭제합니다. 이 포크를 설치하기 **전에** 합니다.
   * 그 외: ACT의 `Plugins` 탭 → `Plugin Listing`에서 `CactbotOverlay.dll`의 체크를 끄고 **X**로 제거한 뒤, ACT를 종료하고 기존 cactbot 폴더를 삭제합니다.

### 설치하기

1. ACT를 종료합니다.
1. [최신 릴리즈](https://github.com/pnsdh/cactbot/releases/latest)에서 `cactbot-버전.zip`을 다운로드합니다.
   파일을 마우스 오른쪽 버튼으로 클릭 → **속성**에 **차단 해제**가 있으면 체크합니다.
1. 압축을 풀면 `cbkr` 안에 `cbkr` 폴더가 하나 더 있습니다. 안쪽 `cbkr` 폴더를 ACT의 `Plugins` 폴더로 옮깁니다.
   `...\Advanced Combat Tracker\Plugins\cbkr\CactbotOverlay.dll`이 되면 됩니다.
1. ACT를 실행하고 `Plugins` 탭 → `Plugin Listing` → `Browse...`로 `CactbotOverlay.dll`을 선택해 `Add/Enable Plugin`을 누릅니다.
   순서가 `FFXIV_ACT_Plugin.dll` → `OverlayPlugin.dll` → `CactbotOverlay.dll`이 아니면 화살표로 맞춥니다.
1. ACT를 재시작합니다.

### 오버레이 만들기

1. ACT의 `Plugins` 탭 → `OverlayPlugin.dll` 탭에서 새로 만들기(`New`)를 누르고 프리셋을 고릅니다.

    | 용도 | 프리셋 |
    | --- | --- |
    | 알람 + 타임라인 | `Cactbot Raidboss (Combined Alerts & Timeline)` |
    | 알람만 | `Cactbot Raidboss Alerts Only` |
    | 타임라인만 | `Cactbot Raidboss Timeline Only` |
    | 실수 기록 | `Cactbot OopsyRaidsy` |

1. 위치와 크기를 맞춘 뒤 `General` 탭에서 잠금(`Lock Overlay`)과 클릭 통과(`Enable Clickthrough`)를 체크합니다.

기존 cactbot 오버레이는 본가 파일을 가리키므로 지우고 새로 만듭니다.

### 지켜야 할 것

* 해루봇이나 ACT의 `Get Plugins`로 cactbot을 설치·업데이트·삭제하지 않습니다. 해루봇의 cactbot 오버레이 **연결하기/연결 해제** 버튼도 쓰지 않습니다. ([이유](docs/fork/FAQ.md#설치할-때-왜-해루봇을-쓰지-말라고-하나요))
* 폴더 이름(`Plugins\cbkr`, `cbkr-user`)을 바꾸지 않습니다.

업데이트는 ACT를 실행할 때 자동으로 확인하고, 새 버전이 있으면 설치할지 묻습니다.

## 문서

* [사용 안내](docs/fork/Usage.md): 트리거·타임라인 고치기, TTS로 알림 듣기, 요성난무를 본가 트리거로 쓰기, 스킨
* [내 트리거 쓰기](docs/fork/UserFiles.md): 사용자 폴더에 트리거 파일(`.js`, `.ts`) 넣기
* [자주 묻는 것](docs/fork/FAQ.md): 설치 확인, 업데이트, 본가로 되돌리기, 해루봇 동작

문의·버그 제보는 [디스코드](https://discord.gg/R75tq68bA9)로 해 주세요.
