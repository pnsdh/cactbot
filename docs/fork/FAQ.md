# 자주 묻는 것 (한국어 포크)

[README로 돌아가기](../../README.md)

## 설정은 유지되나요?

cactbot 설정(트리거 옵션, 알람, 표시 언어 등)은 OverlayPlugin 설정 파일에 저장되므로, 포크로 바꾸거나 오버레이를 새로 만들어도 유지됩니다.
`raidboss.js`, 커스텀 타임라인·CSS 같은 개인 파일은 사용자 폴더(`cbkr-user`)에 있습니다.

## 제대로 설치됐는지 확인하려면?

`OverlayPlugin.dll` 탭 아래쪽 로그에 `cactbot: 0.37.5.10 C:\...\Plugins\cbkr\CactbotOverlay.dll`처럼 버전이 네 자리이고 경로가 `cbkr`인 줄이 있으면 정상입니다.
이 줄이 두 번 나오면 cactbot이 두 개 설치된 것이니 [기존 cactbot 제거](../../README.md#기존-cactbot을-쓰던-경우)를 다시 확인합니다.
`CactbotOverlay.dll` 파일을 마우스 오른쪽 버튼으로 클릭 → **속성** → **자세히**에서 파일 설명이 `CactbotOverlay (커스텀)`인지로도 확인할 수 있습니다.

## 오버레이가 비어 있거나 cactbot 오류가 나요

zip의 차단 해제를 하지 않고 압축을 풀었을 수 있습니다. ACT를 종료하고 차단 해제한 zip으로 다시 덮어씁니다.

## 오버레이 주소가 `https://...github.io/cactbot/...`로 바뀌었어요

해루봇이 바꾼 것입니다. 설치 폴더 이름이 `cbkr`인지 확인하고 오버레이를 다시 만듭니다.

## 업데이트 알림이 안 떠요

위의 로그에서 버전이 네 자리(`0.37.5.10` 형식)인지 확인합니다. 버전은 `본가 버전.포크 번호`입니다.

## 본가 cactbot으로 되돌리려면?

`Plugin Listing`에서 `cbkr\CactbotOverlay.dll`을 제거하고 ACT를 종료한 뒤 `Plugins\cbkr` 폴더를 지웁니다.
해루봇이나 `Get Plugins`로 cactbot을 설치하고, 오버레이를 본가 프리셋으로 다시 만듭니다.

## 설치할 때 왜 해루봇을 쓰지 말라고 하나요?

* 해루봇은 cactbot을 삭제할 때 설정과 관계없이 ACT 폴더의 `FileResources\user`를 지우고, ACT 플러그인 목록의 `CactbotOverlay.dll` 항목을 모두 제거합니다.
  그래서 사용자 폴더를 `cbkr-user`로 옮겨 두고, 기존 cactbot 삭제는 이 포크를 설치하기 전에 합니다.
* 해루봇은 실행될 때 오버레이 주소에 `/cactbot/ui/`가 있으면 공식 웹 주소로 바꿉니다. 설치 폴더 이름이 `cbkr`이면 바뀌지 않습니다.
* 해루봇으로 cactbot을 설치·업데이트하면 본가 cactbot이 함께 설치되어 충돌합니다.
* 연결하기는 본가 웹 주소로 오버레이를 추가하고, 연결 해제는 직접 만든 오버레이도 지울 수 있습니다.
* `cbkr-user`를 ACT 폴더 안에 두면 해루봇의 ACT 백업에 포함되고, 복원 후에도 경로가 유지됩니다.
  ACT 폴더 밖에 두면 해루봇이 실행될 때마다 경고하고, 복원 시 경로를 `FileResources\user`로 되돌립니다.

## 그 밖의 문제나 사용법은?

[본가 FAQ](../FAQ-Troubleshooting.md), [본가 한국어 README](../ko-KR/README.md), [cactbot 커스터마이징](../ko-KR/CactbotCustomization.md), [레이드보스 CSS 커스터마이징](../ko-KR/RaidbossCSS.md)을 참고하거나 [디스코드](https://discord.gg/R75tq68bA9)로 문의합니다.
