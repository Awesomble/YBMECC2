# 효과음 — 고르기·맞추기·굽기

비디오 스킬의 효과음 운영 정본. **대사와 별개로 화면 상황마다 소리 또는 정적의 역할을 정하고, 선택한 큐를 대사와 비슷한 크기로 실제 믹스에 구현한다(2026-09-23 사용자 지시).** 자막·화면의 강조 계약은 [채널05 §3-1](../../docs/channel/05-brand-pipeline.md), 파일별 출처·자료 분석·실측 근거는 [CREDITS.md](CREDITS.md), 파일별 등급·재질/동작 태그·동기점은 [catalog.json](catalog.json)을 따른다. 효과음 수나 외부 자료의 조회수 주장을 품질 기준으로 삼지 않는다.

## ② 선택 — 역할과 기존 자산

**장면마다 화면 상황 목록을 먼저 만든다.** 주연의 등장·이동·충돌·착지·변형, 장면 전환·카메라 이동, 흐름·점화·연기 같은 재질 사건, 정보 칩·태그 등장이 대상이다. 대사가 없는 순간의 사건도 후보다. 각 사건에 **화면 사건 → 소리의 역할(또는 생략 이유) → 읽을 정착**을 STORYBOARD에 적고, 발화 강조음은 이 목록 중 핵심 발화와 겹치는 것으로 고른다. 화자 교대·자막 청크·컷마다 자동으로 소리를 반복하지 않고, 0.15초 안에 붙은 두 사건은 소리 하나로 묶는다. (00006: 발화 강조음 위주로만 넣어 전환·카메라·흐름 소리가 빠졌다.)

**소리는 화면에 보이는 재질·사물로 먼저 고른다(2026-09-26).** 그릇이 놓이면 접시, 동전이면 동전, 문이면 문 소리다. 카드·팝·충돌음으로 대체하기 전에 후보를 찾아본다. 목록에 맞는 소리가 없으면 억지로 대체하지 말고 ④의 새 사용본 규칙으로 CC0 원본을 들이거나 생략한다. (ABMEN 00025: `tape-lock`에 부드러운 충돌음, `lights`에 차임, `tape-zip`에 카드 슬라이드를 썼다.)

```bash
node pipeline/sfx-fit.mjs --find bowl land     # 상황 단어 → 새 영상에 쓸 수 있는 후보(길이·파일 안 동기점·음성 대역)
node pipeline/sfx-fit.mjs --find coin drop     # 큐 id 에 쓰는 단어(coin·bowl·door·tear·heart…)가 catalog.vocab 으로 태그에 이어진다
```

| 역할 | `pick/` 후보 | 화면과 연결할 기준 |
|---|---|---|
| 첫 훅·충돌·반전 | `impact-soft`, `impact-punch`, `impact-trailer`, `impact-short`, `sub-drop` · 짧은 변형 `impact-punch-heavy`·`impact-soft-short`·`impact-generic`·`impact-plank`·`impact-metal-mid` | 주연의 분할·착지·공개 순간. 첫 3초라는 이유만으로 무관한 폭발·검열음을 붙이지 않는다 |
| 등장·입력·답의 강조 | 등장 `pop-drop`·`pop-drop-low`·`pop-drop-high`·`pop-pluck`·`pop-pluck-2`·`pop-bubble`·`pop-pep`·`pop-pep-2` · 입력 `click`·`click-soft`·`click-mouse`·`select`·`select-low`·`toggle`·`switch-click`·`tick`·`tick-2`·`typing` · 답 `confirm`·`confirm-2`·`confirm-short`·`confirm-soft`·`ding-glass`·`ding-glass-2`·`success-tones`·`success-tones-2`·`notify-tones`·`question` | 등장·입력 확정·계산 결과를 구분한다. `error`는 실제 오류·잘못된 선택, `camera-click`은 사진·기록처럼 맥락이 맞을 때 |
| 이동·전환 | `whoosh-quick`, `whoosh-snap`, `whoosh-air`, `whoosh-mid`, `whoosh-wind`(바람결), `whoosh-whip`(휩 줌), `whoosh-dash`(0.17초), `whoosh-low`(깊은 카메라 이동), `card-shove`, `noise-sweep` | 이동의 통과 지점·속도와 연결한다. 공백을 모두 메우는 용도로 쓰지 않는다 |
| 기대 → 공개 → 정착 | `riser-8s`, `riser-impact`, `drumroll`, `crash` | 실제 비교·계산·반전의 기대를 공개에서 해소한다. 긴 샘플에 맞춰 답을 늦추거나 영상을 늘리지 않는다 |
| 흐름·상승·가열 | `whoosh-stereo`(흐름), `water-pour`(액체), `zap-up`(상승), `powerup`(켜짐), `fire-whoosh-short`(불, 1.0초) | 물·연기·열이 경로를 따라 움직이거나 오르는 동안. 흐름의 시작과 정점을 화면 이동과 맞춘다 |

| 재질·사물 | `pick/` 후보 |
|---|---|
| 그릇·접시·쟁반 | `plate`, `plate-light`, `plate-light-2`, `plate-heavy`, `tin` |
| 컵·유리·물 | `glass`, `glass-heavy`, `glass-tap`, `glass-tap-2`, `ice-glass`(얼음 한 알), `water-pour`, `pop-bubble` |
| 동전·돈 | `coins`, `coins-2`, `coin-drop`, `coin-spill`, `chips-handle`, `chip-clink`, `chip-lay` |
| 종이·영수증·표·책 | `page-flip`, `page-flip-2`, `book-place`, `book-close`, `paper-tear`, `card-place`, `card-place-2`, `card-slide`, `card-slide-2`, `card-fan`, `card-shuffle` |
| 문·자물쇠·열쇠 | `door-open`, `door-creak`, `door-close`, `door-close-2`, `lock-click`, `latch`, `sci-fi-door-open`(자동문) |
| 나무·돌·금속·종 | `wood`, `wood-tap`, `impact-plank`, `stone`, `impact-metal`, `impact-metal-mid`, `bell-hit`, `bell-small` |
| 주방 | `knife-slice`, `chop`, `pot`, `stew-boil-short`(끓음 1.2초), `butter-sizzle-short`(지글 1.2초), `sugar-pour`(설탕) |
| 사람·몸 | `step`, `step-wood`, `step-boot`, `step-carpet`, `step-grass`, `step-snow`·`step-snow-2`(눈), `cloth`, `heartbeat`, `applause-short`(박수) |
| 축제 | `firework-boom`(불꽃 한 발), `firecracker`(폭죽), `applause-short` |
| 기계·탈것·시간 | `vroom`(차량 출발·지나감 — 부릉 한 번, 1.7초), `bus-depart-short`(버스 출발, 0.8초), `jet-takeoff-short`(비행기 이륙, 0.8초), `typing`, `switch`, `rewind`, `dice`, `fall-tone`. 🔴 2026-10-21 길게 울리는 저음·지속음 중단 — `fire-whoosh`·`stew-boil-vc`·`butter-sizzle-vc`·`butter-sizzle-loud-vc`·`jet-takeoff`·`jet-roll`·`bus-pullaway`(파생본 포함)은 catalog `retired_reason: "long"`이라 00002번부터(YBMECC 이식 시행 번호 — ABMEN 은 00128) 새 편은 조립이 막히고 위의 짧은 파생본이 대체로 나온다. 그 전 편은 경고만 내고, 롱폼 묶음은 `swap`으로 짧은 파생본에 자동 교체한다. 🔴 `rumble`(5초 엔진 저음)은 2026-10-08 신규 사용 중단 — 사용자 「너무 시끄러워 대사가 안 들린다」. 차량이 계속 움직이는 동안 엔진음을 깔지 않는다 — 출발·지나가는 순간에 한 번. 이미 납품된 숏츠 10편(00027·00030·00041·00042·00047·00048·00052·00053·00057·00060)은 그대로이고, 롱폼 묶음에 넣으면 `hf-bundle build`가 그 큐를 `vroom`으로 자동 교체한다(catalog `swap`) |

같은 동작의 소리는 일관되게 유지할 수 있다. 강조 뒤에는 숫자·단위·조건을 읽을 여유를 주고, 같은 사건에 클릭·whoosh·딩을 의미 없이 겹치지 않는다. **정적은 강조음을 쉬는 선택**이며 나레이션·BGM까지 모두 끄라는 뜻이 아니다. 유머는 대사·상황·그림을 먼저 살리고 문화권의 밈·방송/게임 고유음·강제 웃음 반응을 기본값으로 삼지 않는다. 특정 기법이나 횟수를 일률적으로 제한하지 않는다.

## ④ 준비·동기화·조립

| 경로 | 사용 상태 |
|---|---|
| `pick/` | CC0 사용본(개수는 `node pipeline/sfx-fit.mjs --catalog`로 센다 · 2026-09-26 58개 추가)·48kHz WAV. 등급·태그·동기점은 `catalog.json`. 현행 조립기가 받는 유일한 소스 |
| `kenney/`(rpg-audio 포함) · `mixclap/` · `freesound/` · `videoeditingsfx/` | 출처가 기록된 원본. 필요한 파일만 사용본으로 준비 |
| `review/hoons-page-20260922/` | 사용자 제공18개 후보. **권리·청취 미확인, 자동 사용 제외** |

**신규 사용 중단 — VideoEditingSFX 계열(2026-09-26 저작권 검수).** CC0가 사이트 자기 주장뿐이라 `catalog.json`에 `retired`로 표시했다(`pop`·`chime`·`whoosh-fast`·`whoosh-deep`·`swipe`·`success`·`notification`·`pay-success`·`camera-shutter`·`impact-hit`·`thump` 등과 그 `-loud`·`-vc` 파생본). 새 영상에서 쓰면 조립이 막히고 대체 후보가 함께 나온다. 이미 쓴 편은 `retired_allow`에 번호로 고정해 소급하지 않는다.

**대사 위에 1.2초 넘게 울리는 저음·지속음은 쓰지 않는다(2026-10-21 사용자). 재질 사건이 길면 짧은 파생본**(`<이름>-short.wav` · 1.2초 이하 · 끝 페이드)을 만들어 원본의 `replace`로 잇는다. 원본은 지우지 않고 `retired_reason: "long"`으로 중단한다.

**같은 역할이라도 편마다 음색을 바꾼다 — 상위 5개 큐가 전체의 41%였다(2026-10-21).** `pop-drop`·`impact-soft`·`whoosh-air`·`whoosh-quick`·`impact-punch`를 기본값으로 반복하지 말고, 위 ② 표의 같은 역할 변형을 `--find`로 함께 보고 고른다.

`card-slide`를 종이 넘김에 쓰는 것처럼 비슷한 역할로 대체하면 같은 음색·재질은 보장되지 않는다. 재질이 보이는 사건은 위 재질표에서 먼저 찾는다. 후보 대응표는 CREDITS에서 필요한 행만 읽는다.

**화면 사건의 초와 파일 재생 시작의 초를 구분한다.** 큐에 `event`(실측 음성에 맞춘 화면 사건의 표시 초)를 적고 `node pipeline/sfx-fit.mjs <p> --apply`로 `at = event − 파일 안 동기점`을 채운다. 동기점은 `catalog.json`의 `sync`(들어서 확정한 값)가 있으면 그것, 없으면 측정 추정이다 — 타격·클릭은 어택(최대 10ms RMS의 6dB 안에 처음 드는 시각), 라이저·빌드·휘익은 정점(최대 10ms RMS 시각). 실제 파일·시작초·음량은 `audio_meta.json.sfx` 한 곳에서 관리한다. 별도 큐 문서를 만들지 않는다.

측정 추정도 파일 끝·전역 피크를 청각적 정점으로 단정하지 않는다. 복수 타격·긴 선행 구간·잔향이 있는 파일은 들어서 확인하고, 다르면 그 파일의 catalog 항목에 `sync`를 적는다(모든 영상에 반영된다). `--apply`가 음수 `at`을 거부하거나 꼬리가 다음 대사를 덮으면 다른 후보를 고르거나 필요한 구간을 파생본으로 준비한다.

새 사용본은 **원본을 보존해 48kHz PCM WAV로** 만든다. 크롭·페이드·레벨 조정과 출처는 CREDITS에 기록하고, 필요한 잔향은 남기되 절단면·선행 무음을 확인한다. 2026-09-26 반입분은 피크를 −1dBFS로 맞췄다(ABMEN volume 상한 1 안에서 대사 크기에 닿게). 기존 `pick/`을 덮어 납품본의 지문을 바꾸지 않는다. 다운로드 반입은 중복·디코딩·길이·역할을 확인해 필요한 것만 선별하며 원본을 삭제하지 않는다. **새 파일은 CREDITS 행과 catalog 항목(태그·등급)을 함께 올려야 조립된다** — `node pipeline/sfx-fit.mjs --catalog --write`로 세 곳을 대조하고 측정치를 채운다.

자동 제작 등록은 개별 파일/공식 팩의 **CC0 근거**가 확인된 경우만 한다. 무료·로열티 프리·제3자 배포를 CC0로 추정하지 않고, **사이트의 CC0 표기가 제작자·약관·원 출처로 뒷받침되지 않으면 등록하지 않는다.** Freesound는 파일마다 원 페이지 라이선스를 확인하고 페이지 원문을 `legal/`에 보존한다(브랜드 소리·게임/방송음 재업로드로 보이면 CC0 표기여도 제외). 라이선스 파일 없는 드라이브 모음·유튜브에서 잘라낸 밈음은 들이지 않는다(CREDITS 「반입 거부 기록」). 다른 허락은 실제 조건과 현행 지원 여부를 검토하며 검사기를 우회하지 않는다.

기존 `audio_meta.json.sfx`를 보존·수정한다. 아래는 구조 예시이며 고정 시각·음량 처방이 아니다. `at`은 `--apply`가 채운다.

```json
"sfx": [{"id":"bowl-land","file":"plate.wav","event":0.72,"volume":0.18}]
```

**크기는 대사와 비슷하게 맞춘다.** 파일마다 원래 크기가 달라 volume 숫자로는 들리는지 알 수 없다(00006: 앞 편 값을 옮겨 적어 18큐 중 10개가 대사보다 18dB 넘게 작아 묻혔다). 렌더 전에 아래 측정으로 각 큐의 가장 큰 0.1초를 그 순간 대사와 비교한다.
- 목표: 대사 대비 0dB, ±3dB면 통과. −18dB 미만은 묻힘, 대사와 겹치며 +3dB를 넘으면 가림 위험.
- 제안 volume을 적용하고 한 번 더 재서 수렴시킨다.
- **일부러 작게 둘 큐**(종이 스침·배경 질감처럼 크면 오히려 거슬리는 소리)는 audio_meta 큐에 `"subtle": "<이유>"`를 적는다 — `sfx-level`이 「✅ 의도적 작게」로 두고 키울 volume을 제안하지 않는다. 경고를 없애려고 전부 0dB로 올리지 않는다(2026-10-08 차량음이 대사를 덮은 사고와 같은 방향). ABM도 같은 키다.
- 제안이 1을 넘으면 원본을 보존한 레벨 조정 사용본(`*-loud.wav`, 피크는 리미터로 −1dBFS)을 `pick/`에 만들고 CREDITS에 파생 내용을 기록한다.

```bash
node pipeline/sfx-fit.mjs <p> --apply   # event → at (파일 안 동기점만큼 앞당김)
node pipeline/sfx-fit.mjs <p>           # 재질·사물 불일치 · 동기 · 대사 위 음성 대역 · 0.15초 인접 — 안내이며 상한이 아니다
node pipeline/sfx-level.mjs <p>
node pipeline/hf-project.mjs <p> sync
node pipeline/stage-gate.mjs <p> 5 --prepare
```

⚠️ `sfx-level`은 큐 전체 대역 크기만 잰다 — 초록(±3dB)이어도 **내용어 바로 위의 광대역 큐**는 1~4kHz 어절 SNR이 0~5dB일 수 있다(ABMEN 00045: 56큐 전부 통과했는데 최종 MP4 측정에서 9어절이 0~5dB). 숫자·지명·핵심어 위에 겹치는 큐는 `sfx-fit`의 음성 대역 지표가 높은 파일(`card-place`·`door-open`·`bell-small` 등)을 피하거나 어절 사이로 옮기고, 최종 MP4에서 1~4kHz 대역으로 따로 확인한다.

sync는 실제 사용 파일만 `hyperframes/assets/sfx/`로 복사하고 root 오디오 트랙을 만든다. 파일별 CC0 장부·복사본 지문·시각·볼륨·root 배치는 기존 검사로 확인한다. `--prepare`는 납품 검수가 아니다. 영상 전체에서 효과음을 생략할 때는 `cuts.json`의 `sfx_policy: "omit"`과 README의 `SFX 미사용: 이유`를 함께 기록한다.

## ④·⑤ 청취 — 사건과 말이 함께 명료한가

후보를 단독으로 확인한 뒤 **해당 대사·BGM과 함께** 듣는다. 소스마다 크기가 다르므로 동일 volume이나 짧은 효과음의 일괄 LUFS 정규화를 쓰지 않는다. 선택이 애매하면 같은 짧은 구간에서 대사·BGM·재생 음량을 고정하고 SFX만 켜고 꺼 비교한다. 비교용 전편 렌더를 늘리지 않는다.

실제 root의 대표 구간과 최종 MP4에서 **사건의 타격/통과 → 공개의 해소 → 읽을 정착**을 해당 큐에 맞춰 확인한다. 숫자·단위·지명·부정문이 들리는지, 저음·잔향·반복음이 말을 가리거나 클리핑·끝 잘림이 생기는지 판정한다. 더 크거나 화려하다는 이유만으로 채택하지 않는다.

최종 MP4에서도 대사 대비 크기를 다시 잰다. 렌더에서 전체 믹스가 다시 조정돼 도구 추정보다 몇 dB 달라질 수 있다(00006 v5: 추정 0dB → 실측 중앙값 −4.2dB). 효과음과 겹친 단어가 전사에서 달라지면(00006: 4.3초 흐름음과 겹친 "pipes"→"tights") 그 큐를 먼저 들어 보고 조정한다.
메타·파형·피크·게이트 통과는 직접 청취를 대신하지 않는다. 듣지 못했다면 가능한 신호 검사만 수행하고 **청감 미검증**으로 남긴다. 선택한 큐의 누락·동기 불일치·대사 가림은 기존 수정 절차에서 처리한다.
