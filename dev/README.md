# 개발 도구 (포크 전용)

일반 사용자에게는 필요 없고 배포에도 들어가지 않는, 개발할 때 쓰는 측정·점검 도구입니다.
모두 빌드된 cactbot(`dist/`)을 화면 없는 Chrome으로 열어, OverlayPlugin을 흉내 낸 채로 돌립니다.

## 준비

```sh
npm run build        # 저장소 루트에서: dist/ 만들기
cd dev
npm install          # 이 폴더 전용 패키지(puppeteer-core)
```

환경 변수:

| 이름 | 뜻 |
| --- | --- |
| `CHROME` | 쓸 Chrome 경로 (기본 `C:/Program Files/Google/Chrome/Application/chrome.exe`) |
| `CHROME95` | Chromium 95 경로 (원래 OverlayPlugin의 엔진, `--chrome95`로 비교할 때) |
| `CACTBOT_LOG` | 재생할 ACT 네트워크 로그 (`--log` 대신) |
| `CACTBOT_PLAYER`, `CACTBOT_PLAYER_ID`, `CACTBOT_JOB` | 재생 때의 플레이어 (나에게만 뜨는 트리거용, ID는 16진수) |

결과(스크린샷, 추적 파일, 측정값)는 `dev/out/`에 쌓이고 커밋되지 않습니다.
게임 로그·스크린샷·캐릭터 이름 같은 개인 자료는 스크립트에 넣지 말고 인자나 환경 변수로 넘기세요.

## 도구

비교할 때 `page` 자리에는 다른 빌드의 `raidboss.html` 주소를 넣습니다.
예: 설치본 `file:///C:/Program%20Files%20(x86)/Advanced%20Combat%20Tracker/Plugins/cbkr/ui/raidboss/raidboss.html`

| 도구 | 하는 일 |
| --- | --- |
| `perf-replay.mjs <이름> [page] --log <로그> --from <줄> --to <줄> --zone <ID> [--cast] [--seconds 6]` | 실제 전투 로그를 재생해 타임라인·알람 오버레이의 부하(막대 갱신 요청, 스크립트·스타일·그리기 시간)를 잽니다. `--cast`는 시전 막대가 뜬 뒤부터 잽니다. |
| `cpu-bench.mjs [page] --log <로그> [--from] [--to] [--zone] [--top 30] [--heap]` | 로그 줄당 JS 시간과 가장 바쁜 함수들. `--heap`이면 대신 힙 크기. |
| `land-bench.mjs <이름> [page]` | 막대가 1초마다 끝나고 다음 막대가 올라오는 동안의 부하. |
| `fx-compare.mjs capture <이름> [page] [--chrome95]`, `fx-compare.mjs diff <A> <B>` | cbkr 효과(착지, 다음 막대로 넘어감, 시전 시작)를 같은 시점에 멈춰 찍고, 두 빌드를 픽셀 비교한 표를 만듭니다. |
| `layer-area.mjs [page]` | 브라우저가 만든 합성 층의 개수와 면적(GPU 합성 비용의 지표). |
| `ended-check.mjs [page]` | 막대의 남은 시간 글자가 0.1초 단위로 빠짐없이 바뀌는지, 끝 표시가 얼마나 늦는지. |
| `timeline-edits-e2e.mjs --log <로그> --from <줄> --to <줄> --zone <ID> --edits <json>` | 실제 전투 재생에 타임라인 편집(문구·숨기기·강조색·직업별·추가 항목)을 넣고, 직업마다 보여야 할 것/안 보여야 할 것을 확인합니다. 예시: `examples/timeline-edits-1368.json`. |
| `oopsy-replay.mjs <로그> [--sets <파일들>] [--grep] [--print] [--me]` | 로그를 웁시 실수 감지에 그대로 통과시켜 잡힌 실수를 셉니다. 빌드 없이 소스로 돌므로 저장소 루트에서 `node --loader=ts-node/esm dev/oopsy-replay.mjs ...`. |
| `oopsy-candidates.py "<로그 glob>" --zones 52F=r12s,...` | 피할 수 있는 적 기술(맞는 사람이 거의 없는 기술) 후보를 찾습니다. 새 레이드가 나올 때 웁시 실수 목록을 만드는 데 씁니다. `--names`에 영어 Action.csv를 주면 영어 이름도 붙습니다. |
| `patch-health.mjs <로그> [--baseline <패치 전 로그>]` | 게임 패치 뒤 첫 플레이 로그로 OverlayPlugin 자체 로그 줄(257~274)을 검진합니다: 줄 종류별로 나오는지, 필드 수와 값이 정상인지(예: 초읽기 결과 00, 위치·방향 범위), 함께 나와야 할 게임 줄과의 비율. opcode가 틀리면 줄이 끊기고, 패킷 구조가 바뀌면 값이 깨집니다. 저장소 루트에서 `node --loader=ts-node/esm dev/patch-health.mjs ...`. 이름 등 로그 내용은 출력하지 않습니다. 패치 날 전체 순서는 [OverlayPlugin 포크 tools/README의 패치 날 순서](https://github.com/pnsdh/OverlayPlugin/blob/main/tools/README.md#패치-날-순서). |
| `config-tests/run.mjs` | 설정 화면 회귀 시험 전부(전투 페이지, 툴팁, 기본값 버튼 등). `layout-sweep.mjs`는 여러 너비의 배치 점검 (따로 실행). |

예:

```sh
node perf-replay.mjs before "file:///.../raidboss.html" --log "%CACTBOT_LOG%" --from 97044 --to 129762 --zone 1368 --cast
node perf-replay.mjs after --log "%CACTBOT_LOG%" --from 97044 --to 129762 --zone 1368 --cast
node fx-compare.mjs capture before "file:///.../raidboss.html"
node fx-compare.mjs capture after
node fx-compare.mjs diff before after
```

## 알아 둘 것

- 화면 없는 Chrome의 수치는 이전·이후 비교용입니다. ACT 안(CEF, WebView2)의 절대값과는 다릅니다.
- 개발자 도구의 느린 재생(Animation.setPlaybackRate)은 그리기 전용 스레드의 애니메이션(투명도, transform)을 늦추지 못합니다. 효과 비교는 `fx-compare.mjs`처럼 멈추고 시점을 옮겨서 하세요.
- 구역 변경 이벤트에 구역 이름이 없으면 레이드보스는 전투를 불러오지 않습니다(`lib/overlay.mjs`의 `startFight`가 채워 줌).

## 실제 ACT에서의 지연 측정

알람이 늦게 뜨는지 볼 때, 실제 게임 중의 지연을 파일로 남깁니다.

1. ACT를 끈 상태에서 `%TEMP%\op-probe.enable` 파일을 만듭니다(내용 없음, 포크 OverlayPlugin 필요).
2. 레이드보스 오버레이 주소 끝에 `&devProbe=latency`를 붙입니다.
3. 플레이하면 `%TEMP%\op-latency.log`에 1분마다 요약이 쌓입니다:
   ACT가 줄을 넘기기까지, WebView2 오버레이가 ACT 화면 스레드를 기다린 시간, 그 스레드가 막힌 정도,
   페이지 도착까지의 전체 지연.
4. 끝나면 파일과 주소 옵션을 지웁니다.

두 타이머 항목은 Windows 타이머 간격(15.6ms) 때문에 문제가 없어도 약 12ms씩 늦게 나옵니다.

## 게임 패치 뒤 메모리 구조 자가 점검

cactbot 플러그인은 내 캐릭터 정보(이름, 직업, 레벨, HP/MP, 위치, 방향)를 메모리에서 직접 읽습니다(`plugin/CactbotEventSource/FFXIVProcess*.cs`).
ACT를 시작할 때 `%TEMP%\op-selfcheck.enable` 파일이 있으면, 게임 중 3초마다 이 값을 FFXIV_ACT_Plugin 값과 비교해
1분마다 `%TEMP%\op-selfcheck.log`에 필드별로 다른 비율을 남깁니다(`BROKEN?` = 절반 넘게 다름). 포크 OverlayPlugin도 같은 파일로
자기 메모리 읽기를 비교해 같은 로그에 남깁니다(OverlayPlugin `tools/README.md`). 시그니처 점검은 OverlayPlugin `tools/PatchCheck`입니다.
