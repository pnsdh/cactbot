# 내 트리거 쓰기 (사용자 폴더)

[README로 돌아가기](../../README.md)

사용자 폴더(`cbkr-user`)에 `.js`뿐 아니라 `.ts` 트리거 파일도 넣을 수 있습니다. 예시는 `Plugins\cbkr\user\raidboss-typescript-example.ts`에 있습니다.

* 레이드보스는 `raidboss.ts` 또는 `raidboss` 폴더 안, 웁시레이지는 `oopsyraidsy.ts` 또는 `oopsyraidsy` 폴더 안에 넣습니다.
* 파일을 고쳐 저장하면 오버레이가 다시 불러옵니다. 전투 중이면 전투가 끝난 뒤에 불러옵니다.
* 오류는 `Cactbot Config` 화면 맨 위에 파일과 줄 번호로 나옵니다. 오류가 난 파일은 오류가 난 곳부터(문법 오류면 파일 전체) 적용되지 않고, 다른 파일은 그대로 적용됩니다.

## cactbot 트리거를 고쳐 쓰기

* **전투 하나를 통째로**(레이드보스): cactbot 트리거 파일(`ui/raidboss/data/...`의 `.ts`)을 그대로 복사해 고칩니다. 세트 `id`가 같아서 그 전투의 cactbot 트리거·타임라인을 대신합니다.
  * 타임라인 `.txt`도 복사하면 그것을 쓰고, 복사하지 않으면 cactbot 것을 씁니다.
  * cactbot이 나중에 그 전투를 고쳐도 반영되지 않습니다.
* **트리거 몇 개만**: 자기 세트(다른 `id`)에 그 트리거만 넣습니다. 같은 `id`의 트리거는 cactbot 것을 덮어씁니다.
  자기 세트에는 cactbot의 번역이 없으므로, 영어 문구로 찾는 트리거는 `timelineReplace`에 한국어 문구를 같이 적습니다(예시 참고).
* **웁시레이지**: 같은 `id`의 트리거와 실수 항목(`damageWarn` 등)은 사용자 것이 cactbot 것을 대신하므로, `ui/oopsyraidsy/data/...` 파일을 그대로 복사해 고쳐도 됩니다.
  웁시 세트에는 `id`가 없어 트리거마다 대신하는 것이라, 복사본에서 지운 트리거는 cactbot 것이 그대로 남습니다. 없애려면 `Cactbot Config`의 웁시레이지 트리거 목록에서 끕니다.

## 알아 둘 것

* `import`는 트리거 파일이 쓰는 cactbot 모듈(`resources/`의 `conditions`, `netregexes`, `outputs`, `responses`, `util`, `zone_id` 등)과 웁시의 `oopsy_common`만 됩니다. 다른 사용자 파일은 가져올 수 없습니다.
* 타입은 지우기만 하고 검사하지 않습니다.
* 파일을 처음 읽거나 고친 뒤 처음 열 때만 1초 안쪽으로 더 걸리고, 그 뒤로는 변환해 둔 것을 씁니다.
* 오류는 `OverlayPlugin.dll` 탭 아래쪽 로그에도 `*** ERROR IN USER FILE ***`로 나옵니다.

## 편집기 도움 (선택)

VS Code 같은 편집기에서 자동 완성과 형식 오류를 보려면 `Plugins\cbkr\user\tsconfig.json`을 사용자 폴더에 복사하고, import를 `cactbot/`으로 시작하게 씁니다(예: `cactbot/resources/zone_id`).
복사한 cactbot 파일은 import의 `../../../../../`를 `cactbot/`으로 바꿉니다(웁시의 `../../../oopsy_common`은 `cactbot/ui/oopsyraidsy/oopsy_common`). 바꾸지 않아도 실행에는 문제가 없습니다.

그 밖의 사용자 폴더 사용법(CSS, 옵션 등)은 [cactbot 커스터마이징](../ko-KR/CactbotCustomization.md)을 참고합니다.
