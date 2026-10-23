# 14 — HyperFrames 제작 절차 (2026-09-08 표준)

## 현행 모션 자율성 (2026-09-16)

> **ABMEN 2026-09-19 디자인 확정:** 전면 배경과 작은 락업·자막 오버레이를 사용한다. 아래 밴드·크림 무대 표현은 이전 구성이다. 현행 디자인은 `docs/channel/05-brand-pipeline.md` §2, 읽을 정보의 좌표는 `docs/09-safezone.md`를 따른다.

`CLAUDE.md`·`docs/09-safezone.md` §1이 우선한다. **무대 x0~1080 · y360~1360 안의 모션은 자유**다. 거리·속도·배율·횟수·이징·색·전환·의도적 겹침에 제한이나 기법별 승인을 붙이지 않는다. 블러·글로우·모프·파티클·Canvas·3D·WebGPU 셰이더(§16)도 렌더 재현성을 지키며 쓸 수 있다. 과거 사례의 실패 조건을 확인하고 적용하며, 기법 자체를 금지하지 않는다. 읽을 정보의 정착과 밴드·락업·자막·폰트 로딩·타임라인·음성 동기는 검증한다.


**모션그래픽의 기본 경로다.** Remotion 경로(`projects/<p>/motion/`)는 레거시 —
모션이 약해 2026-09-08 에 교체됐다. 근거와 비교는 이 문서 맨 아래.

`docs/11-motion.md`(모션 규격)와 `docs/02-pitfalls.md`(실측 함정)는 **여기서도 그대로 적용된다.**
이 문서는 그 규격을 HyperFrames 에서 *어떻게* 지키는지만 담는다.

---

## 1. 폴더 — 저장소 규칙 안에 넣어라

새 프로젝트는 저장소 루트에서 `pipeline/new.sh <슬러그>`로 만든다. cuts-motion.json과 로컬 런타임·폰트·락업을 사용하는 HF 골격이 생긴다. 기존 빈 프로젝트만 `node pipeline/hf-project.mjs <p> init`을 사용한다. 수동 프레임은 compositions/frames에 작성한다.

소스는 projects/<p>/hyperframes/, 산출은 projects/<p>/output/이다. 기록은 기존 README와 실제 사용하는 STORYBOARD에 두며 별도 ledger/인계 메모를 관성적으로 만들지 않는다.

⚠️ **웹 루트는 프로젝트 루트다. `public/` 이 아니다.**
프레임이 `/fonts/…`·`/brand-logo.png` 를 참조하면 파일이 **`<프로젝트>/fonts/`·`<프로젝트>/brand-logo.png`** 에 있어야 한다.
`public/` 에 두면 `lint` 가 `missing_local_asset` 로 잡는다 (2026-09-08 실측).

---

## 2. 현행 실행 경로

기획·음성 승인·에셋 요청은 공용 video 스킬을 따른다. 다음 명령은 모두 저장소 루트 기준이다.

```bash
node pipeline/tts.mjs <p> --status
node pipeline/measure.mjs <p> --apply
node pipeline/timing.mjs <p> --check
pipeline/narration.sh <p>
~/.venvs/abm-whisper/bin/python pipeline/transcribe.py <p>
node pipeline/hf-audio.mjs <p>
# 프레임을 작성한 새 관리 골격에서만:
node pipeline/hf-project.mjs <p> sync
node pipeline/hf-cli.mjs <p> lint
# 브라우저 허용 환경에서만:
node pipeline/motion-preview.mjs <p> --start=0 --end=5
node pipeline/layout-scan.mjs <p>
node pipeline/review-sheet.mjs <p>
# 기존 승인 범위의 전체 렌더와 실제 산출 검사:
pipeline/hf-render.sh <p> <출력.mp4>
pipeline/render-gate.sh <p> <출력.mp4>
node pipeline/hf-export.mjs <p>
node pipeline/stage-gate.mjs <p> 5 --video <출력.mp4>
```

cuts.json의 timing(version=1, speed)·fps·dur·voice_offset_s가 시간 정본이며 timeline.ts는 파생본이다. legacy는 timing --migrate로 실제 시간을 보존해 명시적으로 전환한다. 옛 유료 voice는 삭제하지 않으며 실제 대본/설정 일치 확인 후 tts --adopt=ID --confirm-script로 연결한다. 합성/재합성은 사용자 승인 범위에서만 --only로 대상을 한정한다.

hf-project sync는 관리 마커가 있는 root의 슬롯·오디오·길이를 갱신하고 프레임 안무/캡션을 덮지 않는다. 기존 수동 master는 그 프로젝트의 구조를 보존해 직접 맞춘다. 음성·전사·슬라이스는 내용 지문이 같으면 재사용한다. hf-export --source-only는 소스 기준 준비용이며 낡은 MP4 길이로 새 자막을 자르지 않는다.

**대표 동작을 먼저 구현하고 확장한다.** motion-preview는 같은 root의 snapshot 시퀀스+나레이션이다. 최종 60fps 렌더 합성·BGM 믹스 검사와 구분한다. 실제 발화의 정점, 무음 상태에서 보이는 큰 변화, 경계를 넘어 이어지는 객체를 본다. 정지 포스터 승인으로 모션 방향까지 검증됐다고 하지 않는다.

전체 무대 래퍼의 overflow:hidden/clip-path를 기본값으로 쓰지 않는다. 전체 캔버스 내에서 경계 돌파 레이어를 만들고 고정 락업·자막과의 실제 가림을 확인한다. 의도한 개별 마스크는 허용한다. 효과·이징·거리·속도에 추가 승인을 만들지 않는다.

CLI는 hf-cli가 프로젝트 고정 버전만 로컬에서 찾는다. 없으면 설치 필요를 알리고 중단하며 제작 중 최신판으로 자동 대체하지 않는다. 아래 과거 사례의 도구·좌표는 당시 원인 설명이고 현행 명령은 위 경로다.

## 2-b. 🔴 `lint` 와 `check` 는 다른 도구다 — 세 편을 레이아웃 검증 없이 구웠다 (2026-09-10)

**`lint` 는 정적 마크업만 본다.** `check` 는 브라우저를 띄워 **runtime·layout·motion·WCAG 대비**를
함께 재고, `--at-transitions` 는 **전환 이음매의 순간적 겹침**까지 샘플링한다.

00006 실측: **`lint` 0 에러 / `check` 60 에러.** 그중 4건이 실제 결함이었고
(큰 숫자가 박스를 11.7~18.6px 넘어 위쪽 라벨을 덮었다) 사용자가 눈으로 먼저 잡았다.

```bash
node pipeline/hf-cli.mjs <p> check --at-transitions --samples 14        # 사람이 읽는다
node pipeline/hf-cli.mjs <p> check --at-transitions --json > /tmp/chk.json   # 유형별로 묶어 센다
```

🔴 **왜 빠져 있었나**: 00005 에서 Codex 가 *"check 는 로컬 서버 listen EPERM 때문에
브라우저 단계에 진입하지 못했다"* 고 보고했다. **그건 샌드박스 제약이지 도구 결함이 아니다** —
우리 셸에서는 정상 작동한다. 샌드박스에서 한 번 실패한 것을 체인에서 빼는 바람에
그 뒤 프로젝트들이 레이아웃 검증 없이 렌더됐다.

### ⚠️ `content_overlap` 은 한글 다중행 제목에서 대량 오탐이 난다

00006 의 60 에러 중 **56개가 오탐**이었다. `line-height:1.12` 인 다중행 `h1` 에서
한글 글자의 em 박스가 줄 상자보다 커서 **줄끼리 스치는 것을 겹침으로 읽는다.**
3배 확대 스냅샷으로 보면 잉크는 전혀 겹치지 않는다.

| 규칙 | 신뢰도 | 처리 |
|---|---|---|
| `text_box_overflow` | **높다** | 실제 결함이었다. 고쳐라 |
| `container_overflow` | 중간 | 넘침 px 를 보고 눈검사 |
| `content_overlap` (한글 다중행 제목) | **낮다 — 오탐** | 확대 스냅샷으로 대조하고 아니면 패스 |

🔴 **60개를 다 고치면 멀쩡한 헤더 5개를 망가뜨린다.** `docs/02-pitfalls.md` 의
「눈으로 확인하지 않은 수치 지적은 고치지 않는다」가 여기 그대로 적용된다.

---

## 3. 말 속도 1.20배 — **오디오를 먼저 가속하고 표시 초로 통일하라**

**권장 방식 (2026-09-08 개정)**: `narration.sh` 로 **단일 atempo 가속을 마친 뒤** 프레임별로 자른다.
그러면 프레임 HTML 의 모든 시각이 **표시 초**가 되고 `timeScale` 이 필요 없다.
**좌표계가 하나뿐이라 실수할 자리가 없다.**

⚠️ 아래 `timeScale` 방식은 **00002 의 사정**이다 — 이미 원음으로 슬라이스를 자른 뒤 배속을 두 번
바꿨기 때문에 쓴 것이지 설계가 아니다. 새 프로젝트에서 따라하지 마라.
치른 비용: 워커에게 보내는 지시마다 *"코드는 미압축 좌표다 — ×배속 해서 넣어라"* 를 매번 적어야 했고,
그래도 몇 번 어긋났다. 그리고 **`lint` 의 `overlapping_gsap_tweens` 가 미압축 로컬 시각으로 보고한다**
(GSAP 자식의 `duration()` 은 고유 길이를 돌려주는데 lint 가 배율을 되돌리지 않는다) —
판정은 맞지만 **보고된 초로 스냅샷을 찍으면 엉뚱한 데를 본다.**

<details><summary>timeScale 방식 (00002 한정 — 이미 원음 슬라이스가 있을 때만)</summary>

**원음 1.0배로 합성한 뒤 여기서 가속한다** (되늘이기 금지, `02-pitfalls.md` §11).
오디오만 빠르게 하면 **화면이 13% 잘린다.** 둘 다 줄여야 한다.

```bash
# ① 프레임별 슬라이스를 단일 atempo 로
# ⚠️ 반드시 **원음(1.0x) 원본**에서 다시 뽑아라. 이미 가속된 파일에 또 걸면 배속이 누적된다
#    (1.15 파일에 1.20 을 걸면 1.38 이 된다). 원본은 .media/audio-orig-1.0x/ 에 남겨 둔다.
for i in 01 02 …; do ffmpeg -i .media/audio-orig-1.0x/frame-$i.wav -filter:a "atempo=1.20" -y .media/audio/frame-$i.wav; done
# ② audio_meta.json 의 duration_s 는 실측으로, words 의 start/end 는 **원음 백업본에서** ÷1.20
# ③ 화면: 각 프레임 타임라인을 자식으로 감싸 timeScale 을 건다
```

```js
// 프레임 HTML 끝. 원본 수치는 그대로 둔다 — 비트가 읽혀야 다음 사람이 고친다.
tl.paused(false).timeScale(1.20);
var __fast = gsap.timeline({ paused: true });
__fast.add(tl, 0);
window.__timelines["<frame-id>"] = __fast;
```

⚠️ **자식을 `paused(false)` 로 풀지 않으면 부모를 seek 해도 자식이 안 움직인다.**
적용 뒤 `snapshot` 으로 후반부 프레임이 전개되는지 반드시 확인하라 — 안 먹으면 전부 0프레임에 멈춘다.

**중간에 멈추는 느낌**은 대개 한 프레임 꼬리의 무음이다. 재라:
```bash
ffmpeg -i <렌더> -af silencedetect=n=-42dB:d=0.45 -f null - 2>&1 | grep silence_
```
문장 사이 정상 호흡은 0.45~0.6초다. **혼자 1초를 넘는 구간이 범인**이다 —
그 프레임의 wav 를 `-t` 로 잘라 꼬리를 0.30초로 맞춘다 (2026-09-08: 프레임 04, 0.87→0.30초).

---

</details>

## 3-b. 🔴 이음매를 손으로 맞추지 마라 — 구조로 없애라 (2026-09-08 · 00003 에서 비싸게 배웠다)

00003 에서 사용자가 *"앞쪽 모션이 약간 어색하고 뒤로 갈수록 잘 맞는다"* 고 했다. 재 보니 정확했다:

```
컷 한 프레임 만의 변화 (F1→F2)
  골드 금액        −11.7%
  크림 카드        920×344 → 580×132   면적 −76%
  관보레드 마감 띠  53,752화소 → 완전 소멸
  전경 전체 화소    −64%          ← 컷 한 프레임에 전경의 2/3가 사라진다
```

**원인은 워커 실력이 아니라 우리 구조다.** 프레임마다 **같은 요소를 새로 그리기** 때문에,
이음매마다 앞 프레임의 기하를 손으로 복제해야 한다. 00003 에서는 그걸 맞추느라
워커 둘이 md5 를 핀으로 박고 [재현용]/[검증용] 표를 주고받으며 **네 라운드**를 썼다.

### ① 지속 요소는 프레임이 아니라 **루트 트랙**에 둔다

전 프레임에 걸쳐 같은 자리에 있는 것 — **채널 락업 · 그라운드 · 브랜드존** — 은
프레임 컴포지션 안에 넣지 마라. 루트에 클립 하나로 두면 **프레임을 관통**하고,
이음매에서 튈 수가 없다. 00003 은 `/brand-logo.png` 를 **10개 프레임이 각자 그렸다.**

⚠️ **`assemble-index` 가 `index.html` 을 매번 재생성하므로 루트 클립은 조립 뒤에 주입한다** —
`tools/` 의 다른 도구(`fix-captions` · `safezone-fixups`)와 같은 계열로 멱등 스크립트를 둔다.

### ② `transition_in` 을 실제로 써라 — 도구가 이미 있다

`transitions.mjs inject` 가 프레임 간 전환을 자동 처리한다.
`transition_in` 에 쓸 수 있는 값: **`crossfade` · `blur-crossfade` · `push-slide` · `zoom-through` · `squeeze`**
(`"push-slide LEFT"` · `"crossfade 0.4s"` 처럼 방향·길이를 붙일 수 있다).

메커니즘은 **EXTEND-OUTGOING-ONLY** — 나가는 프레임의 `data-duration` 만 늘려 마지막 프레임을 유지하고,
들어오는 프레임이 그 위로 덮는다. **음성·자막·SFX 타이밍은 건드리지 않는다.**

⚠️ 00003 은 **10개 전부 `cut`** 이었다. 당시 "크로스페이드 전면 금지" 규칙이 있어서
`cut` 만 골랐다. **그 금지는 2026-09-16 에 사라졌다** — 전환은 전부 열려 있다.
하나 때문에 넷을 안 본 것이다.

### ③ moving hold 위상을 프레임마다 0 에서 시작하지 마라

기하를 다 맞춰도 **부유 위상이 리셋되면 전 페이로드가 한 프레임에 3~4px 튄다.**
00003 실측: F1 은 컷에서 cam `translate(−1.282, −2.192)` 인데 위상 0 은 `(+2.06, +2.24)` → **Δ(3.3, 4.4)**.

→ 각 프레임이 **자기 시작 시각을 더해** 평가한다: `hold(t_local + <프레임 시작 초>)`.
주기를 비정수비로 두면 그 뒤로도 안 겹치고, **영상 전체의 부유가 한 흐름**이 된다.

### ④ 그래도 손으로 맞춰야 하면 — 통보 규약을 지켜라

00003 의 F4↔F5 는 이 규약으로 **Δ≤1px** 을 냈다. 안 지킨 F1↔F2 는 −64% 가 났다.

| | |
|---|---|
| **[재현용] / [검증용] 을 갈라 적는다** | 섞으면 받는 쪽이 검증용 값을 t=0 에 더해 **이중 적용**한다 (00003 에서 10.5px 그럴 뻔했다) |
| **상대 파일의 md5 를 핀으로 박는다** | 조용히 바뀌면 내 t=0 이 통째로 거짓이 된다. 00003 의 04-gap 은 **네 번** 움직였다 |
| **"확정" 시점에만 통보한다** | 중간 저장마다 보내면 받는 쪽이 옛 값에 맞춘다 |
| **정지 CSS 가 아니라 컷 시점 실효 상태를 준다** | 꼬리 비트가 걸려 있으면 `scale 0.9493 · opacity 0.78` 처럼 **변환이 걸린 채로** 끝난다 |
| **중첩 변환을 분해해서 준다** | 카메라 × 브리딩 × 스케일이 곱해진 **총 실효배율**이 필요하다 |
| **요소별 구간속도(px/s)를 준다** | 진입 이징은 위치가 아니라 **속도**에 맞춘다. 위치를 재현하면 이중 적용이다 |
| 🔴 **측정 표준을 통일한다 — 값만 주지 마라** | `tol N = (\|Δr\|+\|Δg\|+\|Δb\|)/3 >= N` · 배경은 딥그린 고정(샘플링 금지 — 요소 위를 짚는다) · 자막존 제외. ⚠️ **여기에 `crop` · `스케일` · `양자화` · `비교연산자`를 반드시 함께 적어라.** 00003 에서 이걸 빠뜨려 **사고가 세 번** 났다 — ① 두 워커가 `tol` 정의가 달라 다퉜다 ② 워커가 풀해상도로 잰 값이 팀리드의 1/8 표와 30~100배 차이가 나 비교 불가였다 ③ 워커가 「전체 프레임·정확 RGB」로 잰 75.78% 를 도구의 「crop y180~1380 · 192×214 · 4비트 양자화」 임계 98.5% 와 맞댔다. **세 번 다 값은 맞았고 자가 달랐다** |
| **`측정 시각`(mtime 또는 렌더 판번호)을 적는다** | 화면은 새것을 재고 파라미터는 옛것을 인용하면 상대 구조를 의심하게 된다 |
| **`밴드 좌표(y0~y1, x0~x1)`를 적는다** | 정규화 기준 높이가 밴드에 따라 **1.8배** 갈린다. ⚠️ 좌표만으로는 부족하다 — **밴드는 물체 경계가 아니라 여백에서 자른다.** ①**구간 양 끝 프레임 모두에서** 여백일 것(이동·축소가 물체를 밴드 밖으로 민다) ②**밴드 안에 정지 요소가 없을 것** — ⚠️ 「정지」는 **트윈 유무가 아니라 변환 원점과의 거리**로 판정한다(같은 트윈이라도 원점 위/아래에서 상쇄·가산이 갈린다). 브랜드 락업 y232~350 이 대표 함정 → 페이로드 밴드는 **y355 아래**에서 시작. 좌표만 적으면 틀린 합의가 성립한다 |
| 🔴 **방향 일치가 유일한 판정 기준** | 「물체의 속도」는 단일 값이 아니다. **추정기 하나로 비가 0.50~1.76 으로 흩어지고 큰 쪽이 뒤집힌다** — 정합한 이음매와 2배 어긋난 이음매를 구별하지 못한다. **크기는 참고 기록으로만, 합불에 쓰지 마라.** ⚠️ 투명도가 변하는 구간은 변위 비교 자체가 성립하지 않는다(페이드가 변위로 섞인다) — 추정기가 아니라 **구간을 바꿔라** |
| 🔴 **착지 bbox 와 함께 「마지막 두 프레임의 Δ」를 재라** | **위치는 1프레임 검사, 속도는 2프레임 검사다.** 부모(스테이지·카메라)의 이탈 트윈을 타는 요소는 **위치를 맞춰도 부모 속도가 그대로 더해진다** — 00003 에서 BK CI 가 착지 Δ0.1px 인데 속도는 상대의 **4.3배**였다. 해법은 자기 운동을 부모와 반대로 걸어 상쇄. 상세는 `docs/02-pitfalls.md` |
| **컷에 맞닿은 스텝끼리 비교한다** | `앞 프레임 마지막 스텝` ↔ `뒤 프레임 **첫 스텝(0→1)**`. 한 칸 밀리면 단차가 7배로 벌어진다 |
| 🔴 **`powerN` 은 `t^(N+1)` 이다** | GSAP 규약: power1=quad·power2=cubic·power3=quart·power4=quint. 경계 속도 계수는 **N+1**. ⚠️ **차수가 같으면 계수가 약분돼 같은 답이 나온다** — 어긋나는 건 차수가 다른 이음매뿐(`power3.in→power4.out` 이면 +6.7%). 전표는 `docs/11-motion.md` 「이음매 정합 — 이징 경계 속도표」 |
| **컷 경계에 못 쓰는 이징이 있다** | `elastic.out` 은 t=D 속도가 **4057·d/D**(진동 중), `circ.out` 은 t=0 이 **4472·d/D**(수직 접선) — 해석적으로 맞출 방법이 없다. 유한한 것: `expo.out` 6.93 · `back.out(1.7)` 4.70 · `sine.out` 1.571 · `none` 1.0 |
| **정합은 트윈 파라미터로 해석 계산하고 픽셀은 검산으로만** | 빠른 첫 스텝에서 픽셀 실측이 해석값보다 **1.5px** 크다 (글리프 경계 임계 오차) |
| **격리 측정에 실제 `data-start` 를 넣는다** | 0 으로 두면 샘플링 위상이 어긋나 **33%** 틀린다 |
| 🔴 **남의 프레임은 조립본에서 잰다** | 격리 하네스에 상대 프레임을 얹어 재면 값이 달라져(h 197 vs 211) **상대를 틀렸다고 지목하게 된다.** 자기 프레임은 하네스·조립본이 같았다 — 어긋난 건 남을 얹었을 때뿐 |

### ⑤ 이징 서명은 ②에서 초안을 잡고 대표 동작에서 확인한다

00003 에서 워커들이 컷 이음매를 **이징 공식으로 역산해** 맞췄다:
```
power4.in  종단 속도 = 5·d/D      power3.in  종단 = 4·d/D      power4.out  t=0 속도 = 5·d/D
```
⚠️ 계수는 **N 이 아니라 N+1** 이다 (바로 위 ④ 표). 여기 한때 `4·d/D`·`3·d/D` 로 적혀 있었고,
워커 둘이 그 값으로 계산해 순간속도를 20~25% 틀리게 기록했다.
그 결과 **F1→F2 금액 Δ 0.0px**, **F3→F4 1.88 vs 1.85 %/f** 가 나왔다.

**이징을 바꾸면 이 식이 전부 달라져 정합이 무효가 된다.** `elastic.out` 은 종단 속도가 0 에 수렴하지 않고
오버슈트가 붙는다 — `ease` 문자열만 갈아 끼우는 "기계적 교체"가 아니라
**이음매 재정합 + 모션 밀도 재측정 + 감독 재심사**가 따라온다.

→ **`node pipeline/motion-signature.mjs menu` 를 ② 구조에서 보고 이징 서명과 룰을 확정한 뒤,
스토리보드 프레임 블록의 `- rules:` 와 함께 워커 패킷에 실어 보낸다.**
④ 이후 변경은 이음매 재작업을 부른다. 원리적 충돌이 아니라 **순서 문제**다.

### ⑥ `- rules:`로 재료를 전달할 수 있다 (`docs/02-pitfalls.md` §20)

`frame-packets.mjs` 가 스토리보드의 `- rules:` 를 읽어 **룰 레시피 전문을 워커 패킷에 인라인**한다.
00002·00003은 재료 전달이 없어 비슷한 모션으로 수렴했다. 재사용 룰은 이 필드에 적고, 직접 발명한 동작은 동작 의도와 구현으로 전달한다. 인용은 의무가 아니다.

```bash
node pipeline/motion-signature.mjs menu  [<p>]   # ② 구조에서 카탈로그·이력·잠긴 것을 본다
node pipeline/motion-signature.mjs audit  <p>    # ⑤ 감독에서 사고성 복제만 잰다
```
🔴 **`propose` 는 폐기됐다** (2026-09-08). "최근에 안 쓴 룰을 돌려 뽑는" 로테이션이었고,
사용자 지시로 `menu` 로 교체됐다 — *"영상마다 크리에이티브와 해당 브랜드와 내용을 가장 잘
설명할수 있는 인터렉션을 추구하도록 자율성 보장해"*. **도구는 이제 고르지 않는다.**
축도 "무슨 룰이 있나"가 아니라 **"이 컷의 문장이 무슨 일을 하는가"** 다.

**라이브러리의 모든 룰을 선택할 수 있다.** 크로스페이드·반복·블러·글로우에도 별도 감독 승인은 없다. 카탈로그에 없는 동작은 직접 구현하며 통계는 참고값이다.

---

### ⑦ 🔴 렌더 직전에 **파일 동결**을 선언하라 — 오늘 가장 비쌌던 실패다

00003 에서 워커가 **"완료, 재렌더 가능"이라고 보고한 뒤에도 파일을 계속 고쳤다.** 하루에 네 번.
그중 한 번은 **사용자에게 옛 판이 나갔다.** 워커는 성실했다 — 눈검사로 결함을 더 찾았고
고칠 때마다 화면이 좋아졌다. 문제는 **좋아지는 것과 렌더 시점이 확정되는 것이 다른 일**이라는 것이다.

```
21:22:59  785e310b   워커: "완료했습니다. 재렌더 가능합니다"
21:25:25  ← v7 렌더 · 사용자에게 전송
21:27:01  ce8eb87d   조용히 바뀜
21:29:29  9d03ec1f   또 바뀜
```

**"완료"는 동결이 아니다.** 워커에게 완료는 *"이 라운드의 지시를 처리했다"* 이고,
팀리드에게 완료는 *"이제 이 바이트를 구워도 된다"* 다. 같은 단어의 두 뜻이 하루 종일 어긋났다.

**규약 — 워커 패킷에 이 네 줄을 그대로 넣어라:**

> 1. 보고에 **md5 앞 8자와 mtime** 을 적는다
> 2. 보고 이후 **파일을 열지 마라.** 읽기는 되고 쓰기는 안 된다
> 3. 추가 결함을 발견하면 **고치지 말고 글로만 보고**한다 — 반영 여부는 팀리드가 정한다
> 4. 팀리드가 "동결 해제"라고 말하기 전까지 3번이 유효하다
> 5. 팀리드가 **「지금 `<md5>` 로 굽는다, 맞나?」** 를 물으면 예/아니오로만 답한다.
>    그 물음을 받기 전까지는 새 지시에 따라 고쳐도 된다

🔴 **새 작업 지시를 보낼 때는 「동결 해제」를 명시하라.** 안 쓰면 받는 쪽이 스스로 해제 여부를
판단한다 — 00003 에서 팀리드가 새 수정을 지시하면서 끝에 "동결 규약은 그대로다"를 붙였고,
워커는 「고치고 → 보고하고 → 다시 동결」로 읽었다. **합리적인 독해였고, 그 사이에 렌더가 돌았다.**
지시와 동결은 **양립할 수 없다.** 둘 중 하나만 보내라.

🔴 **굽기 직전에 워커에게 md5 를 확인시켜라 — 이게 가장 싼 방어다.**

> 「지금 `ccdd563d` 로 굽는다. 맞나?」  →  「아니다, `4aa2caa0` 가 최신이다」

워커 제안이고 채택했다. 00003 에서 워커는 **자기 파일이 최신이 아니라는 걸 알고 있었는데
물어보지 않아서** 폐기될 판이 구워졌다. 해시 표는 "무엇이 바뀌었나"만 보고
**"지금 무엇이 옳은가"는 워커만 안다.**

🔴 **해시 표만으로는 부족하다 — 렌더 직전에 `lint` 를 한 번 돌려라.**
`frame-solo.mjs` 는 작업 중 `.frame-solo.html` 을 루트에 만든다(끝나면 지운다).
**워커가 그걸 돌리고 있는 동안 조립·렌더하면 진입점이 두 개가 되어 오디오가 겹친다.**

```
✗ [index.html] multiple_root_compositions: .frame-solo.html, index.html
  The runtime may discover both as entry points, causing duplicate audio playback.
```

00003 v8 직전에 실제로 걸렸다 — 해시 표는 깨끗했는데(워커가 자기 파일을 아직 안 고쳤으니)
**그 워커가 검산 렌더를 돌리는 중이었다.** 해시는 "누가 무엇을 고쳤나"만 보고
**"지금 누가 일하고 있나"는 못 본다.** lint 가 그걸 잡는다. 지우지 말고 **기다려라** —
남의 작업 중인 파일이다.

**팀리드 쪽 방어 — 렌더 직전과 직후에 한 번씩 해시를 찍는다:**

```bash
cd projects/<p>/hyperframes/compositions/frames
for f in *.html; do printf "%-20s %s  %s\n" "$f" "$(md5 -q "$f" | cut -c1-8)" "$(stat -f '%Sm' -t '%H:%M:%S' "$f")"; done
```

렌더 전후 두 표가 다르면 그 렌더는 폐기다. `pipeline/status.sh` 의 「렌더보다 새로운 소스」
경고가 같은 일을 하지만 **그건 사후 통보**다 — 이미 사용자에게 보냈을 수 있다.

⚠️ **동결 창을 짧게 잡아라.** 동결을 오래 걸어 두면 워커가 발견한 진짜 결함이 쌓인다.
「동결 선언 → 남은 치환 목록 수집 → 팀리드가 일괄 적용 → 렌더」를 한 호흡에 끝낸다.
막바지에는 **파일을 만지는 손이 하나여야** 재렌더 시점을 확정할 수 있다.

## 4. 자막 — 판 없이 글자만, 숫자는 숫자로

사용자 지시(2026-09-08): **디자인 없이 단순하게.** `.hyperframes/caption-skin.html` 에서
`.caption-pill` 의 배경·테두리를 지우고, `.caption-word` 의 강조(`is-active`·`cap-num` 등)를 전부 같은 크림색으로 만든다.
가독성은 `text-shadow: 0 2px 10px rgba(0,0,0,.55)` 하나로 낸다.

**말은 한글 수사, 화면은 숫자다** (`02-pitfalls.md` §17). TTS 대본이 "칠 프로"라서
그대로 두면 화면에 "칠 프로"가 찍힌다. `tools/fix-captions.mjs` 를
**captions build 뒤마다** 돌려라 — 빌드가 SCRIPT.md 에서 다시 만들기 때문에 매번 되살아난다.

---

## 5. BGM — 이 편의 정서로 매번 고른다 (`music: none` 을 그대로 두지 마라)

사용자(2026-09-15): *"매번 똑같은 배경음악 사용하지 말고 컨텐츠와 분위기에 맞는 음악을 매번 찾고, 그중 하이라이트만."* 당시 16편 중 9편이 곡 2개만 돌려 썼고(원인은 「기존 곡 재사용 + `cp bgm.mp3`」 지시), 2026-10-21 감사에서도 132편이 업비트 4곡을 순환했다 — 템플스테이에 휘파람 우쿨렐레, 실종 경보에 뉴스 징글, 달고나 긴장 훅에 휘파람. **같은 곡을 다시 쓰는 것 자체가 금지는 아니다 — 정서가 맞고 이유(`why`)를 적었을 때만 같은 곡이다.** 정서는 ②에서 README 「디자인 방향」 BGM 정서 줄에 정하고, 곡은 ④에서 `resources/music/cc0/`의 `CREDITS.md` 「정서」 열에서 고른다. 그 칸이 비면 `resources/music/README.md` 「새 곡 받을 때」로 먼저 들인다(반입 후보는 CREDITS 「반입 후보」).

```bash
# ① 고른다 — README 「디자인 방향」 BGM 정서 줄 ↔ CREDITS.md 「정서」 열. 같은 곡이면 이 영상에 맞는 구간과 이유를 다시 정한다
sed -n '/^| `/p' ../../../resources/music/CREDITS.md | cut -d'|' -f2,3,6,9,10,11
# ② 하이라이트를 잰다 — 도입부는 약하다. 에너지가 처음 정점에 닿는 초를 읽는다 (M 열이 급등하는 지점)
ffmpeg -i ../../../resources/music/<폴더>/<곡>.mp3 -af ebur128=peak=true -f null - 2>&1 | grep -E "^\[Parsed_ebur128" | awk '{print $2, $6}' | head -40
# ③ 그 지점부터 영상 길이(+1초 페이드)만 잘라 굽는다 — 1분 미만 영상이라 곡 전체가 필요 없다
mkdir -p assets/bgm && ffmpeg -y -ss <피크초> -i ../../../resources/music/<폴더>/<곡>.mp3 -t <영상길이+1> -af "afade=t=out:st=<영상길이>:d=1" assets/bgm/bgm.mp3
```
`STORYBOARD.md`의 music에 곡명·출처 폴더·시작초·정서를 적는다(`music: <곡> — <작곡> (resources/music/cc0/<파일>.mp3 @<초>s, CC0) · 정서 <칸> · …`). 시작초·대역 처리(carve)는 곡마다 잰다 — 앞 편 값을 복사하지 않는다(2026-10-21: 15편 중 14편이 같은 carve·같은 시작초).
```json
// audio_meta.json — stage-gate ④가 license(CC0)를 요구하고, mood·why가 없으면 경고한다 (2026-10-21)
"bgm": {"path": "assets/bgm/bgm.mp3", "volume": 0.5, "title": "Romantic Inspiration", "composer": "Rafael Krux", "source": "resources/music/cc0/romantic-inspiration.mp3 @0s; archival verification in resources/music/CREDITS.md", "license": "CC0", "source_file": "resources/music/cc0/romantic-inspiration.mp3", "source_start_s": 0, "mood": "따뜻·포근", "why": "(예시) 발표회에서 아이가 처음 무대에 서는 이야기 — 피아노로 시작해 차오르는 곡이 긴장에서 뿌듯함으로 가는 흐름과 맞다, 경쾌 칸은 훅의 정서보다 가볍다", "processing": "loudnorm -28 LUFS · 이 곡의 멜로디 대역 carve는 단어 SNR을 재서 정함(앞 편 값 복사 금지)"}, "bgm_pending": false
```
붙었는지는 `node pipeline/stage-gate.mjs <p> 4`의 「컷마다 오디오 트랙 + BGM」으로, 렌더 뒤에는 `silencedetect`에 무음 구간이 하나도 안 나오는지로 확인한다(`STORYBOARD.md`의 `music:` 줄도 같이 쓴다 — 게이트가 곡명을 거기서 읽는다).

곡은 영상보다 긴 구간을 잘라 온다(조립기의 루프 동작은 미확인). 레벨: 나레이션 −20 LUFS에 베드는 `loudnorm` −28 LUFS 뒤 `volume 0.5`(총 −14dB 여유), 최종 −16 LUFS · TP −3dBTP 근처. **대사 명료도:** 곡의 멜로디 대역이 어절을 가리면 그 대역만 좁게 깎는다(carve — 예: 00120 Happy Whistling 1.3·2.6kHz −12dB, 단어 SNR 17.7→24.9dB 실측 뒤). 깎을 대역·시작초는 곡마다 잰다 — 앞 편 값을 복사하지 않는다(2026-10-21: 15편 중 14편이 같은 값).

### 효과음 — 화면 사건과 함께 렌더한다

`resources/sfx/pick/`의 CC0 확인본을 듣고 화면에서 실제로 바뀌는 순간에만 쓴다. `audio_meta.json`의 `sfx` 배열에 `id`·`file`(pick/의 WAV 파일명)·`event`(화면 사건의 표시 초 — `node pipeline/sfx-fit.mjs <p> --apply`가 파일 안 동기점만큼 앞당긴 `at`을 채운다, `resources/sfx/README.md` ④)·`volume`을 적고 `node pipeline/hf-project.mjs <p> sync`를 다시 실행한다. 조립기는 `assets/sfx/`에 원본을 복사하고 각 효과음을 root의 별도 오디오 트랙에 넣는다. `stage-gate 5`가 라이선스 장부·파일 지문·트랙·시각을 대조한다. 새 영상은 효과음을 포함하며, 효과음이 오히려 설명을 방해할 때만 `cuts.json`의 `sfx_policy`를 `omit`으로 바꾸고 README에 `SFX 미사용: 이유`를 적는다. 옛 `sfx-cues.md`만으로 내장 완료라고 보지 않는다.

렌더본에서 효과음 정점이 주연 동작과 맞는지, BGM과 겹쳐 음성을 가리지 않는지 실제로 듣는다. 음성·음악·효과음의 믹스를 조정해야 하면 프로젝트 `.agents/skills/hyperframes-audio/SKILL.md`를 필요한 절만 읽는다. 소리의 종류·개수·볼륨을 고정 처방으로 쓰지 않는다.

---

## 6. 심 게이트 — 셀렉터를 먼저 의심하라

`ledger.json` 의 셀렉터는 **이음매에서 실제로 움직이는 요소**여야 한다.
`.hero` 클래스가 곧 캐리어는 아니다 — 큰 숫자·타임라인 축·**고정 로고**에 붙어 있으면
"진입 시 안 보임"·"컷에서 정지" 같은 없는 결함이 뜬다 (`02-pitfalls.md` §18).

- 컴포지션 루트에는 `id="01-hook"` 인 요소가 **없다.** 씬 컨테이너는 `id="el-01-hook"` 이다
- CSS 셀렉터는 숫자로 시작할 수 없다 — `#01-hook` 은 문법 오류다
- 길이를 바꾸면 `cut` 시각도 `index.html` 의 `data-start` 에서 다시 뽑아 갱신하라

**그리고 게이트 실패를 무조건 고치지 마라.** 화면에서 안 보이면 결함이 아니다 —
판정 기준은 `docs/11-motion.md` 「사람 눈에 안 보이는 결함은 고치지 않는다」.

---

## 왜 바꿨나 (2026-09-08)

Remotion 판 v13~v19 를 일곱 번 돌렸지만 사용자 평가는 *"모션이 안 맞고 초급 수준"* 이었다.
진짜 원인은 도구가 아니라 **내가 모션을 볼 수 없다**는 것이었다 — 컷 중앙에서 뽑은 정지 프레임으로
판단했고, 모션은 시간에 따른 변화다. 모든 품질 판단이 관찰이 아니라 추측이었다.

HyperFrames 가 해결한 것은 **계측**이다.

| | Remotion 판 | HyperFrames 판 |
|---|---|---|
| 이음매 검증 | 없음 (눈대중) | `seam-gate verify` — 진입·이탈 속도를 px/s 로 실측 |
| 화면 확인 | 프레임 추출 후 추측 | `snapshot --at` — 실제 런타임으로 임의 시각 |
| 프레임 작성 | 내가 순차적으로 | 서브에이전트 11개 병렬, 패킷으로 범위 격리 |
| 첫 완성까지 | v13~v19, 반나절 | 1회, 렌더 29초 |

⚠️ **자체 제작한 임시 스크린샷 하네스를 근거로 쓰지 마라.** 클립 런타임이 빠져 있어
프레임 04·06 에 **없는 결함**을 만들어 냈다. 눈검사는 `node pipeline/hf-cli.mjs <p> snapshot` 으로만 한다.

---

## 7. 조립기 기본값이 우리 규격과 어긋나는 세 곳 (2026-09-08 실측)

`assemble-index`·`captions build` 는 스킬 기본값으로 되돌려 놓는다. **조립할 때마다 다시 고쳐라.**
`tools/safezone-fixups.mjs` + `tools/fix-captions.mjs` 가 멱등으로 처리한다.

| 기본값 | 문제 | 우리 값 |
|---|---|---|
| 자막 밴드 y1600~1920 | 하단 데드존(1490~) 안이라 **100% 가려진다** | **y1280~1450**, 전경 한계 y1260 |
| 마지막 씬이 루트와 동시에 끝남 | 마지막 프레임 1장이 **검정** — 숏츠 루프가 끊긴다 | 마지막 씬 `data-duration` 을 루트보다 **+0.25초** |
| 자막 z 순서는 DOM 순서 | 프레임이 `z-index` 를 쓰면 스택 문맥이 뒤집힐 수 있다 | `#el-captions { z-index: 9999 }` 명시 |

⚠️ `data-track-index` 는 **렌더가 읽지 않는다** (스튜디오 표시용). z 순서는 DOM 순서다.

## 8. 자막 타이밍 — 프레임 경계를 넘는 문장이 잘린다

`captions.mjs` 는 어절을 **프레임별로** 묶는데, 문장이 프레임 경계를 넘으면 앞 프레임에 묶인 채
`end` 가 그 프레임 끝으로 잘린다. 결과: 어떤 자막은 **0.02초**만 뜨고, 뒷 프레임은 말하는 내내 무자막이다.

2026-09-08 실측 — 40.6초 영상에서 **9.5초가 자막 없이** 지나가고 있었다.
프레임 06 은 2.4초 내내 발화하는데 자막 노출이 0.14초였다.

**고치는 법**: 각 그룹의 `end` 를 **다음 그룹의 `start`** 로 다시 잇는다 (시작 시각은 실측이라 그대로).
`tools/fix-captions.mjs` 가 하고, 검산으로 **최단 노출**과 **무자막 총합**을 찍는다.
최단 노출 0.5초 미만이면 exit 1.

## 9. 길이를 바꾸면 이탈 트윈이 컷 밖으로 밀린다

프레임 04 의 꼬리 무음을 0.57초 잘랐더니, 이탈 Z-pull 이 **컷 밖으로 밀려나 절정 컷에서 움직임이 죽었다**
(`seam-gate` 의 `exit-moving` 실패로 잡힘). 프레임 길이를 바꿨으면 **그 프레임의 이탈 트윈 시작 시각을
같이 옮겨라.** `timeScale(1.15)` 를 쓰고 있으므로 미압축 기준 길이는 `실측 × 1.15` 다.

---

## 10. 🔴 `hyperframes render` 의 기본 fps 는 30 이다 — 우리 규격은 60 이다

`docs/11-motion.md:31` 은 **"60fps 필수 — 233ms 모션이 30fps 에선 7샘플로 언더샘플링
(곡선을 고쳐도 눈에 안 닿는다). 비용 1.64× 실측"** 이라고 못박는다.
그런데 `hyperframes render` 는 **루트 `data-fps` 가 없으면 30** 으로 뽑는다.
**00002 의 v1~v5 납품본이 전부 30fps 였다** (2026-09-08 발견, 00003 세션 지적).

### 왜 문제인가 — 우리 영상의 실측 속도

`seam-gate` 가 잰 컷 이음매 속도를 프레임당 이동량으로 환산하면:

| 속도 | 30fps | 60fps |
|---|---|---|
| 2,441 px/s | **81px** | 41px |
| 1,853 px/s | **62px** | 31px |
| 1,372 px/s | **46px** | 23px |

그리고 렌더된 영상에서 잉크 좌측단을 프레임마다 재 보니 진입 순간 **한 프레임에 196px**
(화면 폭의 18%)을 건너뛴다. 고대비 글자에서 이 정도면 스트로빙이다.

```bash
pipeline/hf-render.sh <프로젝트> [출력.mp4]     # 🔴 렌더는 이걸로만 (내부에서 아래를 부른다)
pipeline/hf-render.sh <p> <출력.mp4>
```

**비용 실측 (2026-09-08, 38.9초 영상)**

| | 30fps | 60fps | 배수 |
|---|---|---|---|
| 렌더 시간 | 26초 | 47.5초 | **1.83×** |
| 용량 | 8.3MB | 10.6MB | **1.28×** |

문서의 1.64× 와 근사하다. **이 정도면 아깝지 않다 — 기본값으로 60 을 쓰라.**
루트에 `data-fps="60"` 을 박아 두면 `--fps` 를 매번 안 줘도 된다.

⚠️ **60fps 로 뽑으면 `motion-audit` 판정이 달라진다.** 프레임 간격이 절반이라
**얇은 선이 자라는 모션·moving hold 가 픽셀 변화로 안 잡힌다** (00003 실측: 같은 영상이
30fps 0곳 / 60fps 1곳 — 눈으로 보니 헤어라인이 화면 폭 40%만큼 자라던 **거짓 실패**였다).
**판정은 30fps 상당으로 재고, 걸린 구간은 반드시 눈으로 대조하라.**

---

## 11. 🔴 `- rules:` 를 비우면 워커 10명이 전부 `power2.out` 으로 수렴한다 (2026-09-08 실측)

프레임 하나 = 서브에이전트 하나로 병렬 작성하는 구조의 **가장 큰 함정**이다.

`frame-packets-core.mjs:76` 은 스토리보드 프레임 블록의 **명시 `- rules:` 필드 + 본문에 등장하는
유효 룰 id** 를 기계적으로 모아, 그 **룰 레시피 전문을 해당 프레임 워커의 패킷에 인라인**한다.
워커는 `STORYBOARD.md` 도 스킬 문서도 열지 않는다 — **패킷과 `frame.md` 가 세계의 전부**다.

그래서 그 필드가 비면 워커는 아무 레시피 없이 일반 GSAP 을 쓴다. 그리고 서로 상의하지 않는
독립 워커 10명이 **똑같이 `power2.out` 을 고른다.** 실측:

| | 인용 룰 | 이징 `power*` 점유 |
|---|---|---|
| 00002 온누리 | 1 (`waterfall-entry`) | **92.2%** (231회 중) |
| 00003 버거킹 | 0 | **69.5%** (238회 중) |

두 영상의 `frame.md` 는 `diff` 0줄로 동일했고, 사용자가 *"모션감이 비슷하네"* 라고 지적했다.

**대책** — ④ 전에 `node pipeline/motion-signature.mjs menu`, ⑤ 에서 `audit <p>`.
설계 방법(내용→물리, 브랜드의 물리에서 끌어오기, 자율성의 경계)은
`.claude/skills/video/stages/4-designer.md` 의 「모션 설계」 절.

⚠️ **없는 룰 id 를 적으면 조용히 무시된다** (패킷에 아무것도 안 들어간다).
00003 이 `stamp-reveal`·`number-plus-list`·`calendar-cutoff` 를 적었다가 전부 실재하지 않아
프레임 워커가 되돌렸다. 라이브러리에 없는 모션을 발명했으면 **id 를 붙이지 말고 산문으로 서술해라** —
워커는 그걸 읽고 만든다. 실재 id 목록은 `menu` 가 출력한다.

---

## 12. 🔴 프레임 하나만 렌더하는 법 — `render -c frames/NN.html` 는 안 된다 (2026-09-08 실측)

모션을 고칠 때마다 38.9초 영상을 통째로 다시 뽑을 필요가 없다. **그런데 CLI 의 `-c` 는 우리 구조에서 안 된다.**

```
npx hyperframes render -c compositions/frames/04-save-90k.html   →  95초 + 실패
   [sub_timeline_readiness_timeout] Sub-composition timelines did not become ready within 45000ms
```

**원인**: 프레임 파일이 `<template>` 안에 있다. `index.html` 이 `data-composition-src` 로 인라인해 주는
걸 전제로 쓰였기 때문에, 단독 루트로 열면 아무것도 인스턴스화되지 않는다. 렌더러는 45초를 기다리다
포기하고 빈 결과를 낸다. **전체 렌더보다 4배 느리고 결과도 틀리다.**

**대신 하네스로 우회한다** — 그 프레임 하나만 남기고 `data-start` 를 0 으로 당긴 임시 index 를 만든다.

```bash
node pipeline/frame-solo.mjs <p> --list      # 프레임 목록 + 위상오차
node pipeline/frame-solo.mjs 00002 04        # 04 만 렌더
node pipeline/frame-solo.mjs 00002 04 --captions --fps 60
```

| | 시간 |
|---|---|
| 전체 렌더 (38.9초) | **25.6초** |
| `frame-solo.mjs` (2.76초 프레임) | **5.2초** ← 5.2배 |
| `render -c frames/NN.html` | 95초 + 실패 |

**정확도** (전체 렌더의 같은 시각과 PSNR): 모션 영역 y0~1300 **45.4dB**(사실상 동일) ·
하단 y1540~ **inf**(픽셀 동일) · 자막 밴드는 기본 제외라 다르다(`--captions` 로 포함).

### ⚠️ 두 가지는 하네스로 판단하지 마라

1. **자막 겹침·가림** — 기본적으로 자막을 뺀다. `--captions` 를 붙여야 한다
2. **이음매 속도** — 하네스는 `data-start=0` 이라 **위상 오차**가 사라진다.
   00002 실측: 11프레임 중 **6개가 반 프레임 이상** 어긋나 있다 (최대 28.7ms = 30fps 에서 86%).
   `--list` 가 프레임별 오차를 출력하고, 큰 프레임은 렌더 뒤에도 경고한다.
   이음매를 재려면 **전체 렌더에서** 재라 (00003 세션이 이 함정으로 위상을 33% 틀렸다).

---

## 13. 🔴 `transition_in` 을 `cut` 외의 값으로 쓰지 마라 (2026-09-09 · 00004 실측)

§3-b ② 가 *"전환은 전부 열려 있다"* 고
적어 두었고, 00004 에서 그 말을 믿고 다섯 곳에 넣었다. **검증 렌더에서 다섯 곳 전부 결함을 냈다.**

원인은 전환 도구가 아니라 **우리 컴포지션 구조**다. 루트 트랙에 **고정 락업(y232~350)** 과
**고정 자막(y1380~1485)** 이 있고 프레임 컴포지션이 그 사이 z층에 있다. 프레임을 밀거나 확대하면
그 둘과의 상대 위치가 깨진다 — 애초에 §3-b ① 이 "지속 요소는 루트 트랙에 두라"고 한 결과다.
**두 지침이 서로 충돌한다.**

| 전환 | 프레임 시각 | 실측 결함 |
|---|---|---|
| `push-slide` F2→F3 | 6.35s | 올라가는 F2 크림 판이 **브랜드 락업을 덮는다.** 하단 절반이 빈 딥그린 |
| `squeeze` F7→F8 | 16.95s | 화면이 좌우로 갈려 **락업 2개·헤드라인 2개**가 동시에 보인다 |
| `push-slide` F10→F11 | 27.55s | 들어오는 F11 헤드라인이 **자막 밴드를 통과**하며 자막과 겹친다. `motion-audit` 이 「빈 화면 1프레임」으로 잡았다 |
| `zoom-through` F12→F13 | 33.70s | 확대된 F12 마감 띠·`18:00` 이 **F13 배경에 그대로 겹쳐 남는다** |

**검증 방법**: 렌더 뒤 각 전환 시각 + 0.2초 프레임을 뽑아 본다. `motion-audit` 의 「빈 화면」 경고도
전환 지점을 가리킨다.

**이음매는 전환 효과가 아니라 프레임 자체의 진입·이탈 벡터로 만든다** (§3-b ①③④).
00003 이 10개 전부 `cut` 이었던 건 게으름이 아니라 이 구조 때문이었을 가능성이 높다.

## 14. 🔴 QC 하네스가 `seek()` 를 쓰면 moving hold 가 죽은 것으로 보인다 (2026-09-09)

00004 에서 워커 셋이 같은 함정에 빠져 **서로 반대되는 진단**을 내놓았다.

```
GSAP  timeline.seek(t)            → suppressEvents 기본 true  → onUpdate 안 돔
      timeline.totalTime(t, false) → 이벤트 억제 안 함          → onUpdate 돔
HyperFrames 런타임(hyperframe-runtime.js) 은 totalTime(t, false) 를 쓴다
```

- F02 는 F01 의 `.to(clock, {onUpdate: hold})` 를 `seek()` 로 재고 **"위상 0 에 얼어 있다"** 고 보고했다
- F03·F11 은 같은 현상을 겪고 **"프로브가 틀렸다"** 고 진단했다 (`.time()` 으로 바꿔 재측정)
- **실제 렌더 mp4 를 `motion-audit` 으로 재니 F01 구간에 정지 구간이 없었다** — F03·F11 이 맞았다

**교훈**: 하네스 수치로 남의 프레임을 지목하기 전에 **실제 렌더에서 확인**하라. 하네스를 쓸 거면
`totalTime(t, false)` 로 시킹해야 런타임과 같은 경로다.

⚠️ 다만 런타임의 시킹 경로에는 **다른 함정**이 있다 (F05 실측):
매 프레임 `totalTime(t+0.001, true)` → `totalTime(t, ·)` 로 시킹하므로,
**t=0 에 아직 시작하지 않은 `fromTo` 는 빌드 때 `immediateRender` 가 써 놓은 값이 프레임 0 에 남는다.**
→ **같은 요소·같은 속성의 두 번째 이후 `fromTo` 는 전부 `immediateRender: false`.**
00004 에서 F05·F10 이 각각 이 결함을 겪었다 (플래시가 첫 0.96초를 덮음 / t=0 이음매가 통째로 깨짐).

## 15. 폰트 weight 를 선언하지 않으면 호스트 굵기를 상속한다 (2026-09-09 실측)

Chrome 의 합성 볼드는 `<600 / ≥600` **이진**이라 700·800·900 은 픽셀까지 동일하다.
그런데 **선언을 빠뜨리면 호스트 `body` 굵기를 상속**해 렌더가 환경에 따라 갈린다 — 결정론이 깨진다.

| 폰트 | 합성 볼드 | 비고 |
|---|---|---|
| **BMHannaPro** | **걸린다** — 400 대비 잉크 **+17.0%** | 미선언이면 400 으로 얇게 나온다. `frame.md` h2 값인 **700 을 명시** |
| **Jalnan** | **안 걸린다** (400/700/900 픽셀 동일) | 400 명시는 무해하나 원인 진단에 쓰지 마라 |

어느 쪽이든 **advance width 는 안 변한다** — 폭·데드존 수치는 영향 없다.
00004 에서 13개 중 4개가 미선언이었다. 검증: `grep 'BMHannaPro", sans-serif' compositions/frames/*.html` 로
`font-weight` 가 붙어 있는지 센다.

## 16. WebGPU 셰이더 — Shaders 번들 (2026-10-08 도입 · 셰이더 사용의 기술 정본)

[Shaders](https://shaders.com)(2026-10-06 오픈소스, MIT, WebGPU 전용)의 엔진과, 렌더 순서와 무관하게 같은 화소가 나오는지 실측한 효과만 `pipeline/templates/hyperframes/`에 번들로 넣었다(목록·제외 이유·실측 기록은 `shaders-manifest.json`). 프레임은 `ABMShaders.mount()` 한 줄로 쓰고, 설치·검사·시안 촬영은 `pipeline/shader-fx.mjs` 하나로 한다. 디자인상 쓰는 자리(주연·정보를 받치는 층, 팔레트, 망점 기각)는 채널05 §2 「셰이더 층」 행이 정본이다. 사고 기록은 `docs/02-pitfalls.md` §181.

### 어디에 — 효과 고르기

| 쓸 곳 | 효과 (`node pipeline/shader-fx.mjs list [--category <분류>]`) |
|---|---|
| 0초 포스터·장면 배경의 살아 있는 빛·색면 | MeshGradient·Aurora·FlowingGradient·LinearGradient·RadialGradient(`stops`) · Godrays·SunBurst·Beam·LensFlare |
| 생성 사진의 표면을 움직인다 (래스터 내부는 GSAP 으로 못 움직인다 — pitfalls §106) | `ImageTexture` 위에 Glow·LightLeak·ChromaticAberration·FilmGrain·Vignette·Sparkle · Bulge·WaveDistortion·ZoomBlur·Glass·FlutedGlass·Perspective · 톤 맞춤 Duotone·Tritone·GradientMap |
| 장면 안의 와이프 | Transitions 13종(LinearWipe·IrisWipe·RippleWipe·NoiseDissolve 등, PagePeel 은 `amount`) — `at(t)` 로 `progress` 를 움직인다 |
| **소재 → 먼저 볼 효과** (②·④에서 「빛 층」을 고를 때 — 2026-10-21) | **학원 편(YBMECC):** 교실 창빛·아침 햇살 → Godrays·SunBurst · 발표회·졸업식·행사 무대 조명 → Glow·LightLeak·Sparkle · 상장·트로피 반짝임 → Sparkle · 방학·눈 오는 날 → FallingLines·Sparkle · 칠판·교재·화이트보드 같은 평면 → 셰이더 없음이 기본(글씨는 코드 획·필기 애니메이션이 읽힌다 — 원생 사진 색을 바꿀 만큼 센 효과 금지) · ABMEN 소재: 밤·축제·조명·불빛 → 사진 위 Sparkle·Glow·LightLeak · 김·국물·열기·아지랑이 → WaveDistortion·Glass 약하게 · 눈·비·꽃잎·낙엽 → FallingLines·Sparkle · 창·숲·물 위의 빛 → Godrays·SunBurst · 포스터 푸시인·돌진 → ZoomBlur·Perspective · 사물 없는 색면 무대 → MeshGradient·Aurora(팔레트 `stops`). 해당 소재가 없으면 「없음 — 이유」가 답이고, 「코드 글로우로 충분」은 이 표를 본 뒤의 결론일 때만 쓴다 |

- `list` 의 분류 이름은 영어다: Blurs·Shapes·Stylize·Textures·Transitions·Distortions·Adjustments·Shape Effects·Utilities. 기본값까지 보려면 `list --json`.
- 장면 **사이** 전환은 이 번들의 몫이 아니다 — 슬롯 하나 안에서만 그린다. (HyperFrames 레지스트리의 셰이더 전환 블록은 WebGL 이고 이 저장소에서 결정성을 재지 않았다.)
- 효과 세기는 사진 색을 바꾸지 않는 데서 멈춘다 — 00071 시험에서 LightLeak `intensity` 0.5 는 그릇을 하얗게 날렸고 0.2 도 짜장 소스를 주황으로 바꿨다(0.1~0.2 부근부터 본다). 사진 위 효과는 같은 표시 크기로 원본과 나란히 본다.
- 직접 쓴 WebGL·WGSL 도 허용 재료다. 다만 아래 브리지 계약(`hf-seek` 절대 t·데우기·실패 시 reject)을 스스로 지켜야 하고 결정성은 재지 않은 상태다 — 번들 효과로 되면 번들을 먼저 쓴다.

### 절차

```bash
node pipeline/shader-fx.mjs <p> install          # 메인(index.html 소유자)이 한 번 — assets/vendor 3파일 + <head> 두 줄 + 루트 data-requires-webgpu
node pipeline/shader-fx.mjs <p> check            # prop 이름·기본값만 허용 prop·설치본=원본·루트 속성 — stage-gate ④ 가 같은 판정을 부른다
node pipeline/shader-fx.mjs shot <시안.html> [--at 0,1.2] [-o x.png] [--hf <p>/hyperframes]   # 스크래치 시안을 WebGPU 로 — --at 이 여럿이면 x-0.png·x-1.2.png
node pipeline/shader-fx.mjs <p> remove           # 쓰는 프레임이 없어졌을 때
```

프레임(컴포지션 템플릿 안, GSAP 타임라인 등록 뒤):

```html
<canvas id="k-bg" width="1080" height="1920"></canvas>   <!-- 풀프레임. id 는 프레임 접두사 -->
<script>
  ABMShaders.mount('#k-bg', {
    layers: [
      { type: 'ImageTexture', props: { url: 'assets/scene/hero.png', objectFit: 'cover' } },   // index.html 기준 상대 경로
      { type: 'Glow', id: 'k-glow' },
      { type: 'FilmGrain', props: { strength: 0.25 } },
    ],
    at: (t) => ({ 'k-glow': { intensity: t < 1.2 ? t / 1.2 : 1 } }),   // t = 이 슬롯 안의 초
  });
</script>
```

- **캔버스는 1080×1920 풀프레임**으로 두고(`position:absolute;inset:0`), 크기·위치·잘라내기는 캔버스 요소의 CSS `transform`·`mask`·`opacity`·`mix-blend-mode`·`z-index` 로 한다. 브리지가 버퍼를 width/height 속성 크기로 고정한다.
- 효과는 캔버스 전체에 걸린다 — 투명 컷아웃 위의 LightLeak 은 빈 곳까지 칠했다. 사진 모양만 남기려면 캔버스에 같은 PNG 로 CSS `mask` 를 건다(`-webkit-mask:url(…) center/contain no-repeat`). Glow 는 알파를 지켰다.
- `layers` 는 배열 순서대로 아래에서 위로 쌓인다. 효과는 그 아래 레이어들의 합성에 걸린다. 전환은 **progress 0 = children, 1 = 배열에서 그 앞(아래)에 쌓인 레이어**가 보인다(실측) — 라임 판 → 사진이면 `[SolidColor(lime), LinearWipe{children:[사진]}]` 를 progress 1→0 으로.
- `at(t)` 는 **t 하나의 순수 함수**다 — 실시간 시계·난수·이전 호출 결과를 쓰지 않는다. `speed` 는 `at` 으로 바꾸지 않는다(시계를 0→t 로 한 번에 적분하므로 바뀐 speed 가 과거 전체에 걸린다). 위치·progress 를 t 로 직접 계산한다.
- **시각:** `at(t)` 의 t 는 슬롯 안의 초다. `snapshot --at`·`review-sheet` 의 시각은 루트 초다 — 루트 = 슬롯 `data-start` + t.
- 글자는 HTML 로 얹는다(번들에 Text 없음). 색은 `ABMShaders.stops(['navy','blue','navy'])`·`ABMShaders.palette.<navy|blue|cream|lime|coral|white>`.
- 시안 HTML 에서 이미지·폰트는 `file://` 가 아니라 절대 경로(`/Users/…`)나 시안 기준 상대 경로로 쓰고, 파일은 저장소·세션 스크래치(임시 폴더)·시안 폴더 안에 둔다 — `shot` 은 그 밖과 `.env*` 를 내주지 않아 흰 그림이 된다.

### 브리지가 보장하는 것 (`abm-shaders.js` — 고쳤으면 `shader-fx selftest`)

| 보장 | 이유(실측) |
|---|---|
| 매 seek 시계를 0 으로 되돌리고 t 로 한 번에 간다 | 증분 delta 는 워커 수에 따라 1~2 코드값 어긋났다 |
| 루트 시각에서 슬롯 시작초를 빼고 숨은 슬롯은 건너뛰며, 슬롯을 벗어나면 렌더러를 놓는다 | `hf-seek` 는 루트 시각으로 모든 프레임에 온다. 컴파일된 DOM 의 슬롯은 `data-composition-file`·`data-hf-authored-duration` 이다 |
| 이미지가 이 렌더러에 들어올 때까지 데운다 | 데우지 않으면 워커 하나가 이미지 없는 프레임을 찍었다 |
| 버퍼를 width/height 속성 크기·배율 1 로 고정한다 | 렌더러 기본은 화면상 크기(조상 카메라 줌·묶음 무대 축소)를 따라가 처음 seek 한 시각마다 달라진다 |
| `list` 의 ×2 효과(Blur·Glow·FilmStock 등 9종)는 같은 t 를 두 번 그린다 | compute 결과가 한 프레임 늦게 반영돼, 0.2초를 그리면 직전 seek 화면의 블러가 나왔다 |
| `list` 의 ⛔기본값만 prop(FilmGrain `animated`·FilmStock `weave`·Glass `blur`·Irradiance `shadows`)을 바꾸면 거부한다 | 켜면 CPU 누산기가 돌고 시계를 되돌려도 초기화되지 않는다 — 앞서 그린 프레임 수에 따라 결과가 갈렸다 |
| 오류(번들에 없는 효과·없는 prop·이미지 못 읽음·렌더러 실패)는 자홍 판 + 그 슬롯 seek 의 `waitUntil` reject — snapshot·렌더가 그 프레임에서 멈춘다 | 렌더러 실패의 기본 동작은 「투명 캔버스로 조용히 통과」였고, 마운트 오류만으로는 snapshot 이 exit 0 이었다 |
| GPU 가 없는 브라우저에서는 캔버스를 자홍(NO WEBGPU)으로 칠하고 통과 | layout-scan(`--disable-gpu`)을 막지 않는다 — 00071 사본의 layout-scan 결과가 셰이더 없는 원본과 같았다 |

**번들에서 뺀 효과** — 시뮬레이션(이전 프레임 상태: Smoke·Fog·Particles·ReactionDiffusion 등), 커서 입력, DOM 캡처·영상·카메라·원격 글꼴(HTMLInCanvas·VideoTexture·WebcamTexture·Text), selftest 불일치(KeyFrames·StudioBackground). 이름과 이유는 `list` 끝과 manifest 의 `excluded`.

### 검사·비용·미검증

- **화면 확인:** `hf-cli snapshot`·`review-sheet`·`hook-check`·`still-scan`·`frame-solo` 는 HyperFrames 브라우저(WebGPU)로 찍어 셰이더가 보인다. **`layout-scan` 은 캔버스 화소를 못 본다**(3D 레이어와 같다 — pitfalls §119). 셰이더 위 글자의 대비·가림은 `at()` 의 정점(가장 밝거나 강한 시각)과 정착 시각을 `snapshot --at` 으로 본다.
- **GPU 없는 호스트:** 루트 `data-requires-webgpu` 때문에 HyperFrames 의 snapshot·render 가 캡처 전에 멈춘다(렌더 횟수는 쓰지 않는다). snapshot 을 쓰는 시트(review-sheet·hook-check·still-scan)도 함께 멈추므로, 그 환경에서는 소스·정적 검사까지 하고 화면 확인은 미검증으로 넘긴다.
- **롱폼 묶음:** `hf-bundle build` 가 셰이더 챕터를 찾아 묶음에도 같은 설치를 한다(원본 복사는 `assets/vendor` 를 빼므로). `check`·stage-gate ④ 는 `chNN/compositions` 도 본다. 셰이더를 쓴 숏츠(00072·00111~00115)를 묶은 렌더는 아직 확인하지 않았다 — 첫 묶음에서 그 챕터를 `snapshot --at` 으로 본다.
- **결정성 실측 범위:** `shader-fx selftest` 는 효과마다 같은 t 를 ① 새 렌더러 ② 다른 시각·슬롯 밖을 거친 렌더러 ③ 또 새 렌더러로 그려 화소 해시를 대조한다(움직이는 MeshGradient 입력, 270×480 캔버스 — `--full` 은 1080×1920). build 는 꺼진 기능을 켠 변형도 재서 ⛔기본값만 prop 을 찾는다. 2026-10-08 apple metal-3 하나에서 잰 결과다. 실제 HyperFrames 경로로는 00071 사본 두 프레임(전면 Godrays · 사진+Blur+FilmGrain)에서 lint 0 오류, layout-scan 결과 원본과 동일, 슬롯 시각(루트 23.5초 = 슬롯 0.4초)을 확인했고, snapshot 을 서로 다른 seek 순서로 두 번 찍어 셰이더 장면의 차이가 셰이더 없는 원본의 차이(글자 1단계·00071 자체의 2초 구간)를 넘지 않음을 확인했다. 워커 4·2 렌더의 셰이더 슬롯 PSNR 48.6dB 는 셰이더 없는 슬롯 50.9dB 와 같은 인코딩 잡음 수준이다.
- **렌더 비용(00071 사본, 69초·60fps, 같은 기계·같은 캡처 방식):** 셰이더 없음 214초·95MB → 01 전면 Godrays(5.3초) + 03 사진·Blur×2·FilmGrain(9.8초)을 더해 217초·225초(두 번 구움)·97MB — +3~11초, 해당 프레임당 많아야 12ms. 최종 브리지 판은 render-gate 를 통과했다(지문 일치·빈 화면 0). 숨은 슬롯은 그리지 않으므로 비용은 셰이더가 있는 슬롯 길이에 비례한다. 매 프레임 바뀌는 결(`FilmGrain animated`)은 결정성 때문에 막혔다 — 그 판은 파일이 170MB 로 커졌다.
- **미검증:** 스튜디오 **재생** 중 셰이더가 매 프레임 갱신되는지(일시정지 화면은 같은 t 를 다시 그린다 — 사용자가 스튜디오를 요청하면 「셰이더 층은 재생 중 멈춰 보일 수 있다, 판정은 렌더본」이라고 알린다), Apple Metal 외 GPU, 한 화면에 캔버스 셋 이상.
- **라이선스:** 엔진·효과는 MIT — 영상에 표기하지 않는다(채널 출처 표시 금지와 충돌 없음). 라이선스 원문은 `assets/vendor/LICENSE-shaders.txt` 로 함께 복사된다. **shaders.com 사이트의 프리셋을 옮겨 오지 않는다** — Pro 프리셋은 활성 플랜이 필요하고 프리셋 재배포는 금지다. 효과 목록에서 직접 구성한다.
- **버전:** `shaders@4.0.2`·`typegpu@0.12.3`·`esbuild@0.24.2` 고정. 올릴 때는 `shader-fx.mjs` 의 `PIN` 을 바꾸고 `node pipeline/shader-fx.mjs build`(설치 → 번들 → selftest → 변형 → 재묶음 → 회귀) 뒤, 쓰는 프로젝트마다 `install` 을 다시 한다. build·selftest 는 설치된 최신 HyperFrames 의 브라우저를 쓰고, `shot` 은 `--hf` 로 준 프로젝트의 고정판을 쓴다(poster-sheet 가 넘긴다).
