# AGENTS.md — 이 저장소에서 코딩할 때

**YBMECC: YBM ECC 대치점(이씨씨대치어학학원) 학원 홍보 숏폼을 대본에서 MP4까지 사람 손 없이 만드는 파이프라인.** 전체 규칙은 **`CLAUDE.md`** — 영상을 만들거나 파이프라인 동작을 바꾸기 전에 읽어라. 여기는 Claude·Codex 공통 사실과 **코드를 고칠 때 바로 걸리는 것**만 적는다(CLAUDE.md가 `@AGENTS.md`로 임포트한다).

## 🔴 YBMECC 는 ABMEN(`../ABMEN/`)에서 이식했다 — 2026-10-20

제작 절차·도구·규율은 **ABMEN과 동일**하다(ABMEN은 ABM에서 이식 — 기술 문서의 「ABMEN」「ABM」 표시는 그 이력이다). 🔵 다른 것:

| 바뀐 곳 | 무엇 |
|---|---|
| `docs/channel/` | 대상(대치동 학부모)·학원 광고 법규·한국어 문안·디자인·로고 — 라우팅 `docs/channel/README.md` |
| `pipeline/templates/brand.json` | 팔레트(Ivory·Plum Ink·Burgundy·Orange·Gold)·Pretendard·로고 `ybmecc-daechi-tab.png`·`language: ko`·`platforms`(인스타·유튜브)·**`academy`(상호·등록번호·교습과정·교습비 — 법정 표시 정본)** |
| `pipeline/lib/platforms.json` `academy_ad` | 학원 광고 금지(하드)·주의(경고) 표현 |
| 새 코드 | `pipeline/lib/academy.mjs`(판정) · `pipeline/academy-check.mjs` · `pipeline/photo-intake.mjs` — stage-gate 🏫 절·publish-check가 같은 판정을 싣는다 |
| 코드 일반화 | 로고·서체·`lang`·채널명이 brand.json을 읽는다(stage-gate·hf-compile·hf-bundle·hf-project·root-lockup·shader 팔레트·테스트) |
| `.gitignore` | 원생 사진(`photos-in/`·`assets/photos/` 등)은 git에 올리지 않는다 |
| 빠진 것 | `dm/`(Awesomble LINK — ABMEN에만)·ABMEN 프로젝트·장소 사진 라이브러리 |

- 🔴🔴 **첫 1·2·3초가 가장 중요한 규칙이다** — 0초 첫 장면은 주제 제목·후킹·키 비주얼을 한 장에 담은 포스터(2026-10-06). 학원 편의 키 비주얼은 동의받은 원생의 실제 사진. 정본 video SKILL 맨 앞 「최우선 — 첫 1·2·3초」·CLAUDE.md 맨 앞, 실행 `node pipeline/hook-check.mjs <p>`.
- 🔵 **문안·대본은 학부모에게 하는 한국어(차분한 해요체)** — 보이는 장면을 그대로, 과장 대신 실제 활동과 조건. 정본 `docs/channel/04-format-voice.md` §3. ABM의 「옛 라디오 아나운서」 페르소나는 적용하지 않고 `docs/07-script.md`는 컷 분할·훅 구조 등 언어 무관 부분만 쓴다. 영어 문장은 아이가 실제로 한 말·수업 문장만.
- 🔴 **학원 광고 세 조건(원생 사진 동의·법정 표시·금지 표현)은 코드가 막는다** — CLAUDE.md 「학원 광고」 절, `node pipeline/academy-check.mjs <p>`.
- 영상 제작은 **`$video`**(Claude `/video`) — 공용 원본 `.claude/skills/video/SKILL.md`, 스킬 목록에 없으면 직접 읽는다.

## 세션·컨텍스트 전환 뒤 계속하기 — 2026-10-01 (ABMEN 승계)

**같은 작업의 세션 전환·자동 요약은 중단이나 새 작업이 아니다** — 목표·최신 지시·승인·중단 조건을 이어받아 승인된 미완료 작업을 계속한다. 전환만으로 "계속할까요?"를 묻거나 계획만 재설명하고 끝내지 않는다(명시적 중단·실제 차단은 유지 — 유료 음성은 /video 제작 요청이 곧 승인이다, 2026-10-22).

- **전환 직후:** 인계 요약의 다음 실행부터. 실행 중이던 도구/렌더/에이전트는 핸들·로그·산출물 상태부터 확인하고 중복 실행하지 않는다(핸들이 사라져도 끝났다고 단정하지 않는다).
- **복구:** 문맥이 부족할 때만 `pipeline/status.sh <p> --resume`. 전 프로젝트 조회·문서 재독·완료한 조사/검사/렌더를 반복하지 않고, 바뀐 입력·실제 실패의 영향 범위만 재검증한다.
- **상태 한 곳:** 긴 작업은 README 상단 `## 현재 작업 상태`에 목표/판본·승인/중단 조건·마지막 완료와 근거·실행 중 작업(핸들·명령·로그)·미검증·다음 명령을 짧게. 중요 단계·긴 실행 시작·승인 변경 때만 갱신하고, RESUME·인계·「활성 프로젝트」 파일은 만들지 않는다.
- **진행 유지:** 다음 행동이 명확하면 같은 턴에 실행하고 대기 중엔 독립 작업을 병행한다. 완료·명시적 중단·사용자 입력이 필요한 차단일 때만 멈춘다. 완료 시 판본·납품 경로·남은 사용자 작업을 적는다.
- `--resume` 기록은 검사 통과·실행 승인을 대신하지 않고, 현재 사용자 지시가 기록보다 우선한다.

## 선택 협업 — 2026-09-20 (ABMEN 승계)

메인은 사용자와 대화하며 video 스킬을 실행하는 에이전트다(Claude Code·Codex 어느 쪽이든 — video SKILL 「메인」 정의, 2026-10-21 현재 Claude Code Fable 5.1). **Codex가 메인인 video 작업에서 사용자가 "클로드코드도 사용해"라고 명시한 현재 작업에서만** 외부 Claude Code를 병행한다 — `$video` 단독·문서 정리·과거 협업 이력으로 자동 실행하지 않고, 같은 작업의 후속 지시엔 유지·새 작업엔 초기화한다. Codex가 핵심 연출과 최종 검수, Claude(Opus 5.5)는 배정된 범위만 수행하고 전체 기획·모션을 독자적으로 재설계하거나 다른 에이전트를 재귀 호출하지 않는다. 운영 정본은 video SKILL과 그 조건부 협업 지시서. 전역 모델·`CLAUDE_CODE_SUBAGENT_MODEL`·단독 Claude 사용 설정은 바꾸지 않는다.

## 모션 제작 자율성 — 2026-09-16 현행

사용자 지시: **모션 가능 영역 안에서는 방해나 제한 없이 제작한다**(정본 `docs/09-safezone.md` §1). 무대 **x0~1080 · y360~1360** 안에서 모션 종류·이징·거리·속도·배율·횟수·배경색·전환·의도적 겹침을 자유롭게 정하고 SVG·Canvas·3D·파티클·마스크·블러·글로우도 쓴다. 카탈로그·컴파일러는 선택 재료이며 최종 프레임은 직접 작성할 수 있다. **무대 위·아래·좌우를 넘나드는 시그니처 모션도 허용** — 무대 래퍼를 사각형 overflow:hidden/clip-path로 기본 봉쇄하지 않는다(root의 영상 경계·소재의 의도된 마스크는 유지 가능).

정보의 정착은 **x60~960 · y360~1360** 안에서 확인한다(56px 안쪽 여백은 배치 제안). 전면 배경 위 작은 락업·자막을 유지하고, 실제 정보 가림·잘림·자산 누락·렌더 비결정·음성 불일치는 고친다. 취향·통계·박스 교차만으로 반려하지 않는다.

**이 원칙은 옛 규칙·하위 문서·스킬·과거 프로젝트 지시보다 우선한다.** 모션 기법별 허가·감독 승인을 추가하지 않고, 자산 보존 규칙은 유지한다(제작 컨펌·유료 음성 승인은 2026-10-22부터 없다 — 한 번의 /video가 ⑥까지, video SKILL 「제작 흐름」). 과거 실패 기록은 원인을 배우는 자료이지 기법 금지 목록이 아니다.

## 환경 — 실측 기록 (2026-09-16 · Mac mini 2026-09-27)

실행 가능 여부는 **현재 세션의 권한과 실제 실행 결과**로 판단한다(아래는 측정 당시 값).

| | |
|---|---|
| Node | v24.12~24.13 (전역 `WebSocket` 때문에 24+ 필요) |
| **git** | 2026-10-20 로컬 `git init`(커밋·원격 없음 — 원격 저장소 생성·첫 커밋은 사용자가 정한다). MP4·렌더·캐시·**원생 사진**은 `.gitignore`로 제외 |
| npm 패키지 | **`pipeline/motion/` 안에만** 있다 (Remotion 4.0.520 · React 19). **저장소 루트에 `package.json`이 없다** |
| ffmpeg / ffprobe | 8.1.2~9.0.2 — 🔴 **`drawtext`·`subtitles`·`ass` 필터가 없다** (libfreetype 미포함). 자막을 ffmpeg로 굽지 마라 |
| python (whisper) | `~/.venvs/abm-whisper/bin/python` 3.14 · faster-whisper 1.2.1 — `pipeline/transcribe.py`·`lib/level-units.py`는 **이 인터프리터로만**(시스템 python3엔 numpy·whisper 없음) |
| **grep** | **ugrep 7.8.4** (BSD·GNU 아님). 🔴 **`-v`가 빈 입력에 0을 낸다** (pitfalls §21) — 부정 검사는 개수를 세라 |
| hyperframes | 전역이 아니라 **npx 캐시** `~/.npm/_npx/…` 또는 `~/.npm-global/cache/_npx/…`(Mac mini 0.8.41) — 래퍼가 둘 다 찾는다 |

### 🔴 `npx hyperframes` 를 프로젝트 안에서 부르지 마라

`projects/<p>/hyperframes/package.json`의 `name`이 `"hyperframes"`라서 **npx가 자기 자신을 실행하려다 실패**한다(`could not determine executable to run`). 공용 래퍼로 프로젝트가 고정한 로컬 버전만 쓴다(네트워크 허용과 무관, 제작 중 설치·업그레이드 금지):

```bash
node pipeline/hf-cli.mjs <p> --resolve
node pipeline/hf-cli.mjs <p> lint
```

- 과거의 `ENOTCACHED`(npx)·`EPERM`(포트)을 모든 세션의 금지로 일반화하지 않는다. 렌더·측정은 직접 하고, 실제 제한이면 우회하지 말고 소스 작업·정적 검사 뒤 차단된 명령·오류를 전달한다. 실측 기록은 실행 승인이 아니다(중단 지시 규칙은 그대로).
- `pipeline/.env.local`은 기기마다 다르다(Mac mini 점검 당시 없음) — 유료 음성 전에 존재·연결을 확인한다(내용은 출력 금지).

## 폴더

```
docs/       지식 — 왜 그렇게 하는가 (채널 고유는 docs/channel/)
resources/  공유 자산 — brand/ logos/ icons/ images/ fonts/ music/ sfx/ voices/ (resources/README.md)
projects/   영상 하나 = 폴더 하나 (NNNNN-슬러그 · 롱폼 NNNNN-long-슬러그) — 소스(cuts.json·hyperframes/·cards/·README)와 한도 자산(voice/·assets/)
            ├ photos-in/      학원이 준 원생 사진 원본 — git 밖, 고치지 않는다
            ├ assets/photos/  photo-intake 사본(회전·축소·메타데이터 삭제) — git 밖
            └ output/  산출물 — 전부 재생성 가능, gitignore
pipeline/   코드 — 실행 스크립트 + lib/ + templates/ + motion/(Remotion 엔진, 프로젝트를 모른다)
legal/      라이선스·약관 증빙 (타입캐스트)
```

- 모든 명령은 **저장소 루트에서 `pipeline/…`** 로 부르고, 프로젝트는 **순번으로 지목한다** (`2` · `00002` · `00002-온누리적립`). 같은 번호의 폴더가 둘이면(ABMEN 에서 다른 클론이 각자 번호를 매긴 19쌍 — 2026-10-21) 도구가 멈추고 후보를 보여 주니 **폴더명 전체**로 지목한다. 전체 명령 `docs/17-commands.md`
- 🔴 **산출물은 그 영상 폴더 안 `projects/<p>/output/`에** (2026-09-16). 루트 `output/`은 프로젝트 밖 것만(`output/crawl/`). **output/에 손으로 쓴 것(README 등)을 두지 마라** — 재생성 대상이다. 옛 `sfx-cues.md`는 보존하되 새로 만들지 않는다
- 🔴 **엔진(`pipeline/motion/src/`)에 영상별 값(타임라인·큐·자막)을 넣지 마라** — 다른 영상이 같이 깨진다

## 🔴 파일을 만들지 마라 — 셋만 남긴다 (2026-09-11 사용자 지시)

| 남긴다 | 무엇 |
|---|---|
| **영상 제작에 필요** | `cuts.json` · `hyperframes/`(index·frames·assets·audio_meta·STORYBOARD) · `assets/scene/` · `assets/photos/`(git 밖) · `voice/` |
| **업로드에 필요** | `publish.md`(복붙 전용) · 그 영상 폴더 `output/`의 효과음 포함 mp4·srt·timeline·유튜브 커버 `cover.jpg`(MP4 0초) · 카드 게시물 편은 `cards/`(NN-*.html·cards.css·유튜브 1:1 `youtube/`)와 `output/cards/`(NN.jpg·sheet.png·`youtube/`) |
| **기록상 필수** | `README.md` — 확정 팩트(원장 확인 날짜)·근거 URL·**사진 동의 장부**·정정 이력·업로드 기록(지표·문의 수) |

**그 외는 만들지 마라.** 실측 파편: `RESUME.md`·`publish-notes.md`·`WORKER-BRIEF.md`·`CODEX-BRIEF.md`·`CODEX-REPORT.md`·`BRIEF.md`·`SCRIPT.md`·`frame.md`·`GEOMETRY.md`·`DRAFT-*.md`·`source-*.md`·`publish.<날짜>.md`(백업)·`hyperframes.*.bak/`.

- 🔴 **중간 산출물을 파일로 남기지 마라** — 워커 브리프·세션 인계·근거 메모는 **대화와 README**로 끝낸다. 반복해서 쓸 것은 **`pipeline/templates/`** 에 둔다
- 🔴 **백업본을 만들지 마라** — 고칠 게 있으면 고치고, 되돌릴 일은 사용자가 말한다
- 🔴 **근거·순위·주의사항은 `README.md` 한 곳에** 모은다
- 스크래치는 **세션 스크래치패드**(`/tmp/claude-*/…/scratchpad`)에 — 저장소에 두지 마라. 예외: 사용자가 **명시적으로 요청한 파일**
- ⚠️ **이미 있는 파편은 함부로 지우지 마라** — 목록을 사용자에게 보여주고 확인받는다

## 손대기 전에 읽을 것

- 🔴 **씬·모션 코드는 `docs/02-pitfalls.md`부터** — 추측이 아니라 실제로 부딪혀 원인을 찾은 기록이다
- 모션 규격 `docs/11-motion.md` · 화면 구역 `docs/09-safezone.md` §1 · 팔레트·폰트·로고 `docs/12-brand.md` · HyperFrames 절차 `docs/14-hyperframes.md`
- 프레임을 새로 쓴다 → `pipeline/templates/worker-brief.md` — **특히 §⑤-0 배치 표·겹침 검산**
- 3D 장면 → `docs/16-blender.md`(`pipeline/blender/abm3d.py` 규칙·렌더 전 검사) · 셰이더 번들·브리지(`pipeline/templates/hyperframes/abm-shaders.js`)를 고치면 `node pipeline/shader-fx.mjs selftest`(docs/14 §16)

## 검사 — 고쳤으면 돌려라

```bash
node pipeline/stage-gate.mjs <p> [1-6]     # 단계별 산출물 전수
node pipeline/layout-scan.mjs <p>          # 레이아웃 겹침·구역 이탈
pipeline/render-gate.sh <p> <영상.mp4>      # 렌더 직후 — 하드 5(봉인·fps·lint·폰트·빈 화면) + 경고(정지·이음매·구역), 약 2분
node pipeline/guide-check.mjs              # 🔴 **문서를 고쳤으면 반드시** — 문서가 부르는 명령이 아직 맞는지
```

**하드 실패가 하나라도 있으면 다음 단계로 넘어가지 마라.**

## 절대 하지 않는 것

- 🔴 `pipeline/.env.local`(타입캐스트 키·클라우드플레어 Browser Rendering 토큰, gitignore)의 내용을 출력하거나 커밋하기
- `resources/`(brand·logos·icons(Apache 2.0)·fonts·music·sfx·voices) · `projects/*/assets/`(생성·확보한 이미지·클립) · `projects/*/voice/`(**유료 한도를 써서 만든 것** — 지우면 그만큼 다시 쓴다)를 지우거나 이름 바꾸기
- `docs/02-pitfalls.md`의 항목을 추측으로 지우기 — 전부 실측 기록이다
- /video 제작 요청 밖에서(문서·스킬 정리·검토·다른 편 작업 중) `pipeline/tts.mjs`를 typecast로 돌리기 — 제작 요청 안에서는 ③에서 바로 합성하고, `--force` 재합성은 대본이 바뀐 컷만(2026-10-22). ⚠️ YBMECC는 어느 사업자 명의 구독인지 사용자 확인 전까지는 합성 전에 먼저 묻는다(채널02 §1-8 — 사용자만 정할 수 있는 갈림길)
- 🔴 보호자 동의 ✅가 없는 원생 사진을 화면에 쓰기 · 원생·교실·선생님을 생성 이미지로 만들기 · 원생 사진을 생성기·외부 서비스에 올리거나 git에 커밋하기 · `resources/`로 복사하기
- 🔴 원장 확인 없이 교습비·교습과정·정원·마감·실적을 지어 쓰기 (`brand.json` `academy`·README 확정 팩트)
- `.claude/settings.json`의 `CLAUDE_CODE_SUBAGENT_MODEL` 건드리기
