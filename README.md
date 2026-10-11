# cactbot (한국어 개인 포크)

[![최신 릴리즈](https://img.shields.io/github/v/release/pnsdh/cactbot?color=brightgreen&sort=semver)](https://github.com/pnsdh/cactbot/releases/latest)

[cactbot](https://github.com/OverlayPlugin/cactbot)을 기반으로, 일부 트리거를 한국 서버 공략에 맞게 따로 작성한 포크입니다.

* **본가 cactbot의 기능을 모두 포함합니다.** 본가 업데이트는 자동으로 반영되어 함께 릴리즈됩니다.
* **절 요성난무:** 본가에도 트리거·타임라인이 있지만, 이 포크는 한국 서버 공략에 맞춰 따로 작성한 버전(P1~P5)을 사용합니다.
  본가가 업데이트되어도 이 포크의 절 요성난무 트리거는 그대로 유지됩니다.
* **기존 cactbot 설정을 그대로 이어서 씁니다.** 트리거 옵션, 알람 설정 등을 다시 할 필요가 없습니다. ([설정은 어떻게 유지되나요?](#설정은-어떻게-유지되나요))
* 버전은 `본가 버전.포크 번호` 형식입니다. 예를 들어 `0.37.5.2`는 본가 0.37.5 기반의 두 번째 포크 릴리즈입니다.
* 설치 폴더 이름은 **`cbkr`** 입니다. (아래 [왜 폴더 이름이 cbkr인가요?](#왜-폴더-이름이-cbkr인가요) 참고)

## 목차

1. [설치하기](#설치하기)
1. [오버레이 추가하기](#오버레이-추가하기)
1. [해루봇 사용자 주의사항](#해루봇-사용자-주의사항)
1. [설정은 어떻게 유지되나요?](#설정은-어떻게-유지되나요)
1. [업데이트](#업데이트)
1. [설치 확인](#설치-확인)
1. [문제 해결](#문제-해결)
1. [본가 cactbot으로 되돌리기](#본가-cactbot으로-되돌리기)
1. [cactbot 사용법](#cactbot-사용법)

## 설치하기

ACT, FFXIV ACT Plugin, OverlayPlugin이 이미 설치되어 있어야 합니다.
아직 없다면 해루봇으로 설치하거나 [본가 한국어 안내](docs/ko-KR/README.md#설치하기)를 따라 설치하세요.
(cactbot은 설치하지 않아도 됩니다.)

### 1. 기존 cactbot 제거

cactbot이 두 개 설치되어 있으면 충돌하므로, 기존 cactbot을 먼저 제거합니다.
cactbot 설정은 지워지지 않습니다. ([설정은 어떻게 유지되나요?](#설정은-어떻게-유지되나요))

* **해루봇 사용자:** 해루봇의 플러그인 목록에서 **Cactbot을 삭제**합니다.
* **해루봇을 쓰지 않는 경우:** ACT의 `Plugins` 탭 → `Plugin Listing`에서 `CactbotOverlay.dll` 항목의 체크를 끄고 오른쪽의 **X** 버튼으로 목록에서 제거합니다.

> 제거하기 전에 **사용자 폴더 위치**를 한 번 확인하세요.
> ACT의 `Plugins` 탭 → `OverlayPlugin.dll` 탭 → `Cactbot Config` → `GENERAL`에서 사용자 디렉토리(`Cactbot user directory`) 경로를 봅니다.
>
> * `...\FileResources\user`처럼 **기존 cactbot 폴더 밖**이면(해루봇 기본값) 그대로 두면 됩니다.
> * `...\Plugins\cactbot\user`처럼 **기존 cactbot 폴더 안**이면, 제거할 때 그 안의 개인 파일(`raidboss.js` 등)도 지워집니다.
>   제거하기 전에 그 `user` 폴더를 다른 곳(예: `...\Advanced Combat Tracker\FileResources\user`)에 복사하고, 사용자 디렉토리 경로를 복사한 곳으로 바꿔 주세요.

### 2. 내려받기

1. **ACT를 종료합니다.**
1. [최신 릴리즈](https://github.com/pnsdh/cactbot/releases/latest)에서 `cactbot-버전.zip`을 내려받습니다.
1. 내려받은 zip 파일을 마우스 오른쪽 버튼으로 클릭 → **속성** → 아래쪽에 **차단 해제** 체크박스가 있으면 체크하고 **확인**을 누릅니다.
1. 압축을 풉니다. `cbkr` 폴더 안에 또 `cbkr` 폴더가 있고, 안쪽 `cbkr` 폴더에 `CactbotOverlay.dll`, `ui`, `resources` 등이 들어 있습니다.

### 3. ACT에 넣기

1. **안쪽 `cbkr` 폴더**를 통째로 ACT의 `Plugins` 폴더 안으로 옮깁니다.
    * 결과적으로 `...\Advanced Combat Tracker\Plugins\cbkr\CactbotOverlay.dll`이 되면 됩니다.
    * ACT 폴더는 보통 `C:\Program Files (x86)\Advanced Combat Tracker`입니다. 관리자 권한 확인 창이 뜨면 **계속**을 누릅니다.
1. ACT를 실행하고 `Plugins` 탭 → `Plugin Listing` → `Browse...`로 `Plugins\cbkr\CactbotOverlay.dll`을 선택한 뒤 `Add/Enable Plugin`을 누릅니다.
1. 플러그인 순서가 `FFXIV_ACT_Plugin.dll` → `OverlayPlugin.dll` → `CactbotOverlay.dll` 순인지 확인합니다. (아니면 오른쪽 화살표로 순서 변경)
1. **ACT를 재시작합니다.**
1. [설치 확인](#설치-확인)을 한 뒤 [오버레이 추가하기](#오버레이-추가하기)로 넘어갑니다.

> ⚠️ 설치한 뒤에는 ACT의 `Get Plugins`나 해루봇에서 cactbot을 **다시 설치하지 마세요.**
> 본가 cactbot이 하나 더 설치되어 충돌합니다.

## 오버레이 추가하기

기존 cactbot 오버레이는 본가 파일이나 본가 웹 주소를 가리키고 있으므로, **새로 만들어야 합니다.**
오버레이를 지우고 새로 만들어도 트리거 옵션 등 cactbot 설정은 그대로 유지됩니다.

1. ACT의 `Plugins` 탭 → `OverlayPlugin.dll` 탭으로 갑니다.
1. 기존 cactbot 오버레이(이름이 `Raidboss`, `Oopsyraidsy` 등인 것)를 선택하고 **삭제**합니다.
    * 위치를 참고하고 싶으면, 삭제 대신 `General` 탭에서 **표시**(`Show Overlay`) 체크를 꺼 두었다가 나중에 삭제해도 됩니다.
1. **새로 만들기**(`New`)를 누르고, **프리셋**(`Preset`)에서 원하는 cactbot 프리셋을 고릅니다.

    | 하고 싶은 것 | 프리셋 |
    | --- | --- |
    | 알람 + 타임라인 한 창에 | `Cactbot Raidboss (Combined Alerts & Timeline)` |
    | 알람만 | `Cactbot Raidboss Alerts Only` |
    | 타임라인만 | `Cactbot Raidboss Timeline Only` |
    | 실수 기록 | `Cactbot OopsyRaidsy` |

1. 이름을 적당히 정하고 **확인**을 누릅니다.
1. 만든 오버레이를 선택해서 `General` 탭의 **URL**에 `/Plugins/cbkr/ui/`가 들어 있는지 확인합니다.
1. 화면에 나타난 오버레이를 원하는 위치·크기로 옮긴 뒤, `General` 탭에서 **잠금**(`Lock Overlay`)과 **클릭 통과**(`Enable Clickthrough`)를 체크합니다.

## 해루봇 사용자 주의사항

해루봇으로 ACT를 켜도 괜찮습니다. 다만 다음은 지켜 주세요.

* 해루봇에서 **Cactbot 플러그인을 설치·업데이트하지 마세요.** 업데이트는 이 포크가 직접 합니다([업데이트](#업데이트) 참고).
* 해루봇의 cactbot 오버레이(Raidboss, Oopsyraidsy) **연결하기/연결 해제 버튼을 누르지 마세요.**
  연결하기는 본가 웹 주소로 오버레이를 하나 더 만들고, 연결 해제는 직접 만든 오버레이까지 지울 수 있습니다.
  오버레이는 위 [오버레이 추가하기](#오버레이-추가하기)처럼 OverlayPlugin에서 직접 관리합니다.
* 설치 폴더 이름을 **`cbkr`에서 바꾸지 마세요.** 특히 이름에 `cactbot`이 들어가면 안 됩니다.

### 왜 폴더 이름이 cbkr인가요?

해루봇은 실행될 때 오버레이 주소에 `/cactbot/ui/`가 들어 있으면 공식 웹 주소로 바꿔 버리고,
cactbot을 삭제할 때 경로에 `cactbot`이 들어간 플러그인을 모두 ACT 목록에서 지웁니다.
폴더 이름에 `cactbot`이 없으면 해루봇이 이 포크를 건드리지 않습니다.

## 설정은 어떻게 유지되나요?

cactbot 설정(트리거 옵션, 알람 설정, 표시 언어 등)은 cactbot 폴더가 아니라 **OverlayPlugin 설정 파일**에 저장됩니다.
그래서 cactbot 폴더를 지우고 `cbkr`로 새로 설치해도, 오버레이를 새로 만들어도 설정은 그대로 이어집니다.
`raidboss.js` 같은 개인 파일은 사용자 폴더에 있으므로, 위 [1. 기존 cactbot 제거](#1-기존-cactbot-제거)에서 안내한 확인만 하면 됩니다.

## 업데이트

**자동입니다.**
ACT를 켜면 cactbot이 이 포크의 새 릴리즈를 확인하고, 새 버전이 있으면 업데이트할지 물어봅니다. **예**를 누르면 됩니다.

## 설치 확인

ACT의 `Plugins` 탭 → `OverlayPlugin.dll` 탭 아래쪽 로그에서 다음과 같은 줄을 찾습니다.

```text
cactbot: 0.37.5.2 C:\...\Plugins\cbkr\CactbotOverlay.dll (dir: C:\...\Plugins\cbkr)
```

* 버전이 **숫자 네 자리**(`0.37.5.2`처럼)이고 경로가 `cbkr`이면 정상입니다.
* `cactbot:` 줄이 두 번 나오면 cactbot이 두 개 설치된 상태입니다. [1. 기존 cactbot 제거](#1-기존-cactbot-제거)를 다시 확인하세요.

## 문제 해결

* **ACT를 켰더니 cactbot 관련 오류가 뜨거나 오버레이가 비어 있음**
  zip의 **차단 해제**를 하지 않고 압축을 풀었을 수 있습니다.
  ACT를 종료하고, 차단 해제한 zip으로 다시 덮어쓰세요.
* **오버레이 주소가 `https://...github.io/cactbot/...`로 바뀌어 있음**
  해루봇이 바꾼 것입니다. 폴더 이름이 `cbkr`인지 확인하고, [오버레이 추가하기](#오버레이-추가하기)대로 다시 만드세요.
* **업데이트 알림이 안 뜸**
  [설치 확인](#설치-확인)에서 버전이 네 자리인지 확인하세요.
* 그 밖의 일반적인 문제는 [본가 FAQ](docs/FAQ-Troubleshooting.md)를 참고하세요.

## 본가 cactbot으로 되돌리기

1. ACT의 `Plugin Listing`에서 `cbkr\CactbotOverlay.dll`을 제거하고 ACT를 종료한 뒤 `Plugins\cbkr` 폴더를 지웁니다.
1. 해루봇이나 ACT의 `Get Plugins`로 cactbot을 다시 설치합니다.
1. 오버레이를 본가 cactbot 프리셋으로 다시 만듭니다.

## cactbot 사용법

오버레이 종류, 설정, 커스터마이징 등 cactbot 자체의 사용법은 본가 문서를 참고하세요.

* [본가 한국어 README](docs/ko-KR/README.md)
* [본가 README (영어, 최신)](https://github.com/OverlayPlugin/cactbot/blob/main/README.md)
* [cactbot 커스터마이징](docs/ko-KR/CactbotCustomization.md)
