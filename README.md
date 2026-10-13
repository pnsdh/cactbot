# cactbot (한국어 개인 포크)

[![최신 릴리즈](https://img.shields.io/github/v/release/pnsdh/cactbot?color=brightgreen&sort=semver)](https://github.com/pnsdh/cactbot/releases/latest)

[cactbot](https://github.com/OverlayPlugin/cactbot)을 기반으로, 일부 트리거를 한국 서버 공략에 맞게 따로 작성한 포크입니다.

문의·버그 제보는 [디스코드](https://discord.gg/R75tq68bA9)로 해 주세요.

* 본가 cactbot의 기능을 모두 포함하며, 본가 업데이트는 자동으로 반영되어 함께 릴리즈됩니다.
* 절 요성난무는 본가에도 트리거·타임라인이 있지만, 이 포크는 한국 서버 공략에 맞춰 따로 작성한 버전(P1~P5)을 사용합니다.
  본가가 업데이트되어도 이 포크의 절 요성난무 트리거는 유지됩니다.
* 기존 cactbot의 트리거 옵션·알람 설정은 그대로 이어서 사용합니다. ([설정 유지](#설정-유지))
* 알람·타임라인용 `cbkr` 스킨을 함께 제공합니다. cactbot 설정 → `Raidboss 스킨`에서 `cbkr`을 선택하면 적용됩니다.
  직접 꾸미는 방법은 [Raidboss CSS 커스터마이징](docs/ko-KR/RaidbossCSS.md)을 참고합니다.
* 버전은 `본가 버전.포크 번호` 형식입니다. 예를 들어 `0.37.5.2`는 본가 0.37.5 기반의 두 번째 포크 릴리즈입니다.
* 설치 폴더는 `Plugins\cbkr`, 사용자 폴더는 ACT 폴더의 `cbkr-user`를 사용합니다. ([폴더 이름](#폴더-이름))

## 목차

1. [설치](#설치)
1. [오버레이 추가](#오버레이-추가)
1. [해루봇 사용 시 참고사항](#해루봇-사용-시-참고사항)
1. [설정 유지](#설정-유지)
1. [업데이트](#업데이트)
1. [설치 확인](#설치-확인)
1. [문제 해결](#문제-해결)
1. [본가 cactbot으로 되돌리기](#본가-cactbot으로-되돌리기)
1. [cactbot 사용법](#cactbot-사용법)

## 설치

ACT, FFXIV ACT Plugin, OverlayPlugin이 설치되어 있어야 합니다.
설치되어 있지 않다면 해루봇이나 [본가 한국어 안내](docs/ko-KR/README.md#설치하기)로 먼저 설치합니다. 이때 cactbot은 설치하지 않아도 됩니다.

### 1. 사용자 폴더 분리

`raidboss.js`, 커스텀 타임라인, 커스텀 CSS 등 개인 파일은 cactbot 사용자 폴더에 있습니다.
해루봇은 cactbot을 삭제할 때 ACT 폴더의 `FileResources\user` 폴더를 함께 삭제하므로,
사용자 폴더를 ACT 폴더 바로 아래의 `cbkr-user`로 옮겨 연결해 둡니다. ([폴더 이름](#폴더-이름))

1. ACT의 `Plugins` 탭 → `OverlayPlugin.dll` 탭 → `Cactbot Config` → `GENERAL`에서 사용자 디렉토리(`Cactbot user directory`) 경로를 확인합니다.
    * 해루봇으로 설치한 경우 보통 `...\Advanced Combat Tracker\FileResources\user`입니다.
    * `(기본)`으로 표시되면 기존 cactbot 폴더 안의 `user` 폴더(`...\Plugins\cactbot\user`)입니다.
1. 탐색기에서 해당 폴더를 복사해, ACT 폴더(`...\Advanced Combat Tracker`) 바로 아래에 `cbkr-user`라는 이름으로 붙여넣습니다.
   사용자 폴더가 없다면 같은 위치에 빈 `cbkr-user` 폴더를 만듭니다.
1. 같은 화면에서 `디렉토리 선택`(`Choose Directory`)을 눌러 `...\Advanced Combat Tracker\cbkr-user` 폴더를 선택합니다.

### 2. 기존 cactbot 제거

cactbot이 두 개 설치되어 있으면 충돌하므로 기존 cactbot을 제거합니다.
트리거 옵션 등 cactbot 설정은 제거 후에도 유지됩니다.

* 해루봇 사용자: 해루봇의 플러그인 목록에서 Cactbot을 삭제합니다.
  해루봇은 이때 ACT 플러그인 목록의 `CactbotOverlay.dll` 항목을 모두 제거하므로, 이 포크를 설치하기 전에 진행합니다.
* 해루봇을 사용하지 않는 경우: ACT의 `Plugins` 탭 → `Plugin Listing`에서 `CactbotOverlay.dll` 항목의 체크를 끄고 **X** 버튼으로 목록에서 제거한 뒤, ACT를 종료하고 기존 cactbot 폴더를 삭제합니다.

### 3. 내려받기

1. ACT를 종료합니다.
1. [최신 릴리즈](https://github.com/pnsdh/cactbot/releases/latest)에서 `cactbot-버전.zip`을 내려받습니다.
1. zip 파일을 마우스 오른쪽 버튼으로 클릭 → **속성**에서, 아래쪽에 **차단 해제** 체크박스가 있으면 체크하고 **확인**을 누릅니다.
1. 압축을 풉니다. `cbkr` 폴더 안에 `cbkr` 폴더가 하나 더 있고, 안쪽 폴더에 `CactbotOverlay.dll`, `ui`, `resources` 등이 들어 있습니다.

### 4. ACT에 추가

1. 안쪽 `cbkr` 폴더를 ACT의 `Plugins` 폴더 안으로 옮깁니다.
   `...\Advanced Combat Tracker\Plugins\cbkr\CactbotOverlay.dll` 경로가 되면 됩니다.
   ACT 폴더는 보통 `C:\Program Files (x86)\Advanced Combat Tracker`이며, 관리자 권한 확인 창이 뜨면 **계속**을 누릅니다.
1. ACT를 실행하고 `Plugins` 탭 → `Plugin Listing` → `Browse...`로 `Plugins\cbkr\CactbotOverlay.dll`을 선택한 뒤 `Add/Enable Plugin`을 누릅니다.
1. 플러그인 순서가 `FFXIV_ACT_Plugin.dll` → `OverlayPlugin.dll` → `CactbotOverlay.dll`인지 확인합니다. 다르면 오른쪽 화살표로 순서를 바꿉니다.
1. ACT를 재시작합니다.
1. [설치 확인](#설치-확인) 후 [오버레이 추가](#오버레이-추가)로 넘어갑니다.

설치 후에는 ACT의 `Get Plugins`나 해루봇으로 cactbot을 다시 설치하지 않습니다. 본가 cactbot이 함께 설치되어 충돌합니다.

## 오버레이 추가

기존 cactbot 오버레이는 본가 파일이나 본가 웹 주소를 가리키므로 새로 만듭니다.
오버레이를 새로 만들어도 cactbot 설정은 유지됩니다.

1. ACT의 `Plugins` 탭 → `OverlayPlugin.dll` 탭으로 이동합니다.
1. 기존 cactbot 오버레이(`Raidboss`, `Oopsyraidsy` 등)를 선택해 삭제합니다.
   위치를 참고하려면 삭제 대신 `General` 탭에서 표시(`Show Overlay`) 체크를 끄고, 새 오버레이 배치 후 삭제해도 됩니다.
1. 새로 만들기(`New`)를 누르고 프리셋(`Preset`)에서 cactbot 프리셋을 선택합니다.

    | 용도 | 프리셋 |
    | --- | --- |
    | 알람 + 타임라인 | `Cactbot Raidboss (Combined Alerts & Timeline)` |
    | 알람만 | `Cactbot Raidboss Alerts Only` |
    | 타임라인만 | `Cactbot Raidboss Timeline Only` |
    | 실수 기록 | `Cactbot OopsyRaidsy` |

1. 이름을 정하고 **확인**을 누릅니다.
1. 만든 오버레이의 `General` 탭에서 URL에 `/Plugins/cbkr/ui/`가 포함되어 있는지 확인합니다.
1. 오버레이를 원하는 위치·크기로 배치한 뒤, `General` 탭에서 잠금(`Lock Overlay`)과 클릭 통과(`Enable Clickthrough`)를 체크합니다.

## 해루봇 사용 시 참고사항

해루봇으로 ACT를 실행해도 문제없습니다. 설치 후에는 다음 사항을 참고합니다.

* 해루봇에서 Cactbot 플러그인을 삭제·설치·업데이트하지 않습니다.
  삭제하면 이 포크가 ACT 플러그인 목록에서 제거되고, 설치·업데이트하면 본가 cactbot이 함께 설치됩니다.
  이 포크의 업데이트는 [업데이트](#업데이트)에 설명된 방식으로 진행됩니다.
* 해루봇의 cactbot 오버레이(Raidboss, Oopsyraidsy) 연결하기/연결 해제 버튼은 사용하지 않습니다.
  연결하기는 본가 웹 주소로 오버레이를 추가하고, 연결 해제는 직접 만든 오버레이도 삭제할 수 있습니다.
  오버레이는 [오버레이 추가](#오버레이-추가)처럼 OverlayPlugin에서 관리합니다.
* 설치 폴더(`Plugins\cbkr`)와 사용자 폴더(`cbkr-user`)의 이름과 위치는 그대로 유지합니다.

### 폴더 이름

* 설치 폴더 `cbkr`: 해루봇은 실행될 때 오버레이 주소에 `/cactbot/ui/`가 포함되어 있으면 공식 웹 주소로 변경합니다.
  설치 폴더 이름에 `cactbot`이 없으면 이 포크의 오버레이 주소는 변경되지 않습니다.
* 사용자 폴더 `cbkr-user`: 해루봇은 cactbot을 삭제할 때 cactbot 설정과 관계없이 ACT 폴더의 `FileResources\user`를 삭제합니다.
  사용자 폴더를 다른 위치에 두면 이 삭제의 영향을 받지 않습니다.
  ACT 폴더 안에 두면 해루봇의 ACT 백업에 포함되고, ACT 복원 후에도 경로가 유지됩니다.
  ACT 폴더 밖에 두면 해루봇이 실행될 때마다 경고를 표시하고, ACT 복원 시 경로를 `FileResources\user`로 되돌립니다.

## 설정 유지

cactbot 설정(트리거 옵션, 알람 설정, 표시 언어 등)은 cactbot 폴더가 아니라 OverlayPlugin 설정 파일에 저장됩니다.
따라서 기존 cactbot을 제거하고 `cbkr`로 설치하거나 오버레이를 새로 만들어도 설정은 그대로 유지됩니다.
`raidboss.js`, 커스텀 타임라인·CSS 등 개인 파일은 사용자 폴더에 별도로 저장되며, [사용자 폴더 분리](#1-사용자-폴더-분리)로 옮겨 둔 폴더를 계속 사용합니다.

## 업데이트

업데이트는 자동으로 확인됩니다.
ACT를 실행하면 이 포크의 새 릴리즈를 확인하고, 새 버전이 있으면 업데이트 여부를 묻습니다. **예**를 누르면 업데이트됩니다.

## 설치 확인

ACT의 `Plugins` 탭 → `OverlayPlugin.dll` 탭 아래쪽 로그에서 다음과 같은 줄을 확인합니다.

```text
cactbot: 0.37.5.2 C:\...\Plugins\cbkr\CactbotOverlay.dll (dir: C:\...\Plugins\cbkr)
```

* 버전이 네 자리(`0.37.5.2` 형식)이고 경로가 `cbkr`이면 정상입니다.
* `cactbot:` 줄이 두 번 나오면 cactbot이 두 개 설치된 상태입니다. [기존 cactbot 제거](#2-기존-cactbot-제거)를 다시 확인합니다.

## 문제 해결

* ACT 실행 시 cactbot 관련 오류가 나거나 오버레이가 비어 있는 경우:
  zip의 차단 해제를 하지 않고 압축을 풀었을 수 있습니다. ACT를 종료하고, 차단 해제한 zip으로 다시 덮어씁니다.
* 오버레이 주소가 `https://...github.io/cactbot/...`로 바뀐 경우:
  해루봇이 변경한 것입니다. 설치 폴더 이름이 `cbkr`인지 확인하고, [오버레이 추가](#오버레이-추가)대로 다시 만듭니다.
* 업데이트 알림이 뜨지 않는 경우:
  [설치 확인](#설치-확인)에서 버전이 네 자리인지 확인합니다.
* 그 밖의 문제는 [본가 FAQ](docs/FAQ-Troubleshooting.md)를 참고하거나 [디스코드](https://discord.gg/R75tq68bA9)로 문의합니다.

## 본가 cactbot으로 되돌리기

1. ACT의 `Plugin Listing`에서 `cbkr\CactbotOverlay.dll`을 제거하고, ACT를 종료한 뒤 `Plugins\cbkr` 폴더를 삭제합니다.
1. 해루봇이나 ACT의 `Get Plugins`로 cactbot을 설치합니다.
1. 오버레이를 본가 cactbot 프리셋으로 다시 만듭니다.

## cactbot 사용법

오버레이 종류, 설정, 커스터마이징 등 cactbot 자체의 사용법은 본가 문서를 참고합니다.

* [본가 한국어 README](docs/ko-KR/README.md)
* [본가 README (영어, 최신)](https://github.com/OverlayPlugin/cactbot/blob/main/README.md)
* [cactbot 커스터마이징](docs/ko-KR/CactbotCustomization.md)
