# cactbot (한국어 개인 포크)

[![최신 릴리즈](https://img.shields.io/github/v/release/pnsdh/cactbot?color=brightgreen&sort=semver)](https://github.com/pnsdh/cactbot/releases/latest)

[cactbot](https://github.com/OverlayPlugin/cactbot)에 한국 서버용 트리거와 스킨을 더한 포크입니다. 본가 업데이트는 자동으로 반영됩니다.

* 절 요성난무(P1~P5) 트리거·타임라인을 한국 서버 공략에 맞춰 따로 작성했습니다.
* 알람·타임라인과 웁시용 `cbkr` 스킨을 제공합니다.

문의·버그 제보는 [디스코드](https://discord.gg/R75tq68bA9)로 해 주세요.

## 설치

ACT, FFXIV ACT Plugin, OverlayPlugin이 필요합니다. 없다면 해루봇이나 [본가 한국어 안내](docs/ko-KR/README.md#설치하기)로 먼저 설치합니다(cactbot은 설치하지 않아도 됩니다).

> [OverlayPlugin 한국어 포크](https://github.com/pnsdh/OverlayPlugin)를 함께 쓰면 타임라인이 더 부드럽게 움직입니다.

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
1. [최신 릴리즈](https://github.com/pnsdh/cactbot/releases/latest)에서 `cactbot-버전.zip`을 내려받습니다.
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
1. 스킨을 쓰려면 `Cactbot Config`에서 `Raidboss 스킨`, `Oopsy 스킨`을 `cbkr`로 바꿉니다.

기존 cactbot 오버레이는 본가 파일을 가리키므로 지우고 새로 만듭니다. 위치를 참고하려면 표시(`Show Overlay`)만 꺼 두었다가 나중에 지웁니다.

### 지켜야 할 것

* 해루봇이나 ACT의 `Get Plugins`로 cactbot을 설치·업데이트·삭제하지 않습니다. 해루봇의 cactbot 오버레이 **연결하기/연결 해제** 버튼도 쓰지 않습니다.
* 폴더 이름(`Plugins\cbkr`, `cbkr-user`)을 바꾸지 않습니다.

업데이트는 ACT를 실행할 때 자동으로 확인하고, 새 버전이 있으면 설치할지 묻습니다.

<details>
<summary>왜 이렇게 하나요? (해루봇 동작)</summary>

* 해루봇은 cactbot을 삭제할 때 설정과 관계없이 ACT 폴더의 `FileResources\user`를 지우고, ACT 플러그인 목록의 `CactbotOverlay.dll` 항목을 모두 제거합니다.
  그래서 사용자 폴더를 `cbkr-user`로 옮겨 두고, 기존 cactbot 삭제는 이 포크를 설치하기 전에 합니다.
* 해루봇은 실행될 때 오버레이 주소에 `/cactbot/ui/`가 있으면 공식 웹 주소로 바꿉니다. 설치 폴더 이름이 `cbkr`이면 바뀌지 않습니다.
* 해루봇으로 cactbot을 설치·업데이트하면 본가 cactbot이 함께 설치되어 충돌합니다.
* 연결하기는 본가 웹 주소로 오버레이를 추가하고, 연결 해제는 직접 만든 오버레이도 지울 수 있습니다.
* `cbkr-user`를 ACT 폴더 안에 두면 해루봇의 ACT 백업에 포함되고, 복원 후에도 경로가 유지됩니다.
  ACT 폴더 밖에 두면 해루봇이 실행될 때마다 경고하고, 복원 시 경로를 `FileResources\user`로 되돌립니다.

</details>

## 자주 묻는 것

**설정은 유지되나요?**
cactbot 설정(트리거 옵션, 알람, 표시 언어 등)은 OverlayPlugin 설정 파일에 저장되므로, 포크로 바꾸거나 오버레이를 새로 만들어도 유지됩니다.
`raidboss.js`, 커스텀 타임라인·CSS 같은 개인 파일은 사용자 폴더(`cbkr-user`)에 있습니다.

**제대로 설치됐는지 확인하려면?**
`OverlayPlugin.dll` 탭 아래쪽 로그에 `cactbot: 0.37.5.6 C:\...\Plugins\cbkr\CactbotOverlay.dll`처럼 버전이 네 자리이고 경로가 `cbkr`인 줄이 있으면 정상입니다.
이 줄이 두 번 나오면 cactbot이 두 개 설치된 것이니 [기존 cactbot 제거](#기존-cactbot을-쓰던-경우)를 다시 확인합니다.
`CactbotOverlay.dll` 파일을 마우스 오른쪽 버튼으로 클릭 → **속성** → **자세히**에서 파일 설명이 `CactbotOverlay (커스텀)`인지로도 확인할 수 있습니다.

**오버레이가 비어 있거나 cactbot 오류가 나요.**
zip의 차단 해제를 하지 않고 압축을 풀었을 수 있습니다. ACT를 종료하고 차단 해제한 zip으로 다시 덮어씁니다.

**오버레이 주소가 `https://...github.io/cactbot/...`로 바뀌었어요.**
해루봇이 바꾼 것입니다. 설치 폴더 이름이 `cbkr`인지 확인하고 오버레이를 다시 만듭니다.

**업데이트 알림이 안 떠요.**
위의 로그에서 버전이 네 자리(`0.37.5.6` 형식)인지 확인합니다. 버전은 `본가 버전.포크 번호`입니다.

**본가 cactbot으로 되돌리려면?**
`Plugin Listing`에서 `cbkr\CactbotOverlay.dll`을 제거하고 ACT를 종료한 뒤 `Plugins\cbkr` 폴더를 지웁니다.
해루봇이나 `Get Plugins`로 cactbot을 설치하고, 오버레이를 본가 프리셋으로 다시 만듭니다.

**그 밖의 문제나 사용법은?**
[본가 FAQ](docs/FAQ-Troubleshooting.md), [본가 한국어 README](docs/ko-KR/README.md), [cactbot 커스터마이징](docs/ko-KR/CactbotCustomization.md), [Raidboss CSS 커스터마이징](docs/ko-KR/RaidbossCSS.md)을 참고하거나 [디스코드](https://discord.gg/R75tq68bA9)로 문의합니다.
