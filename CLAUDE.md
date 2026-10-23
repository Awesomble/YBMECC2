@AGENTS.md

# CLAUDE.md

YBMECC — **YBM ECC 대치점**(상호 이씨씨대치어학학원) **학원 홍보 숏폼**을 대본에서 MP4까지 사람 손 없이 만드는 파이프라인(ABMEN에서 2026-10-20 이식). **원생의 실제 수업·행사 사진이 주연**, 대상은 **한국어 학부모**. 편집 앱을 쓰지 않는다. 이 파일은 **매 작업마다 필요한 것만** 담는다(명령 전체는 `docs/17-commands.md`).
**공통 사실(ABMEN 이식·한국어 문안·이어하기·협업·모션 자율성·환경·폴더·파일 금지·검사·금지 행위)은 맨 위 `@AGENTS.md`로 임포트한 AGENTS.md 한 곳에만 둔다(2026-09-19) — 고칠 때도 그쪽을 고친다.**

## 🔴🔴 최우선 — 첫 1·2·3초 (이 저장소 가이드에서 가장 중요한 규칙 · 2026-09-25 절대 기준 · 2026-10-03 · 2026-10-06 사용자 지시)

**첫 3초는 구성한 내용 전체에서 가장 후킹이 강한 순간이고, 영상의 디자인·모션·소리 역량을 가장 먼저, 가장 많이 쓰는 곳이다.**
**0초 첫 장면은 이 영상의 포스터다** — 주제 제목·후킹(놀라운 결과·혜택·반전의 값)·키 비주얼이 한 장에 완성돼 주제·디자인·후킹이 모두 읽히고(2026-10-06 「무조건 포스터 느낌으로」), 곧바로 주연이 움직이며, 핵심어에 동작 정점·자막 강조·효과음이 만나고, 3초에 결과가 정착한다. 포스터의 디자인은 영상의 장면 중 가장 후킹이 센 장면에서 출발하고, 0초의 가장 작은 글자도 110px 이상이다(2026-10-21).
근거·조건은 본문에서 갚되 사실의 수치·대상·범위를 왜곡하지 않는다. 템플릿의 빈 무대·정적 정보판·작은 도형·자막 교체·사진 넘기기 슬라이드·로고 대기가 기본값이 되지 않게 한다. **학원 편의 키 비주얼은 원생의 실제 사진**(동의 ✅)이다.
첫 3초가 약하면 본문·검사가 좋아도 완성이 아니다. 기술 통과와 연출 완성도는 별개다.
**합격 조건·6원칙은 공용 video 스킬 맨 앞 「최우선 — 첫 1·2·3초」**, 실행은 README 「첫 3초 비트」·0초 포스터 세 줄 → `node pipeline/hook-check.mjs <p>` (② `--plan` · ④ 훅 잠금 · ⑤ `--from <mp4>`).

## 🔵 YBMECC 채널·디자인·품질

- 🔴 **컨셉 결정의 정본은 `docs/channel/`**(라우팅 README). 기술 문서(`docs/02~17`)의 ABMEN·ABM 사례(영어권·가격 설명·생성 장소)를 학원 편 취향으로 가져오지 않는다.
- **디자인 v1 (2026-10-20, 채널05 §2):** 원생 사진 풀화면 + 2D 그래픽 층(색면·과정 칩·일정 띠·포인터). Ivory `#FFF7EE` 무대·Plum Ink `#2B1420` 글자·Burgundy `#A51D4D`·Orange `#F69321`(면·선만)·Gold `#FFC23D`(자막 강조)·**Pretendard**(0초 포스터 주제 제목만 Hahmlet 900). 정본 토큰 `pipeline/templates/brand.json`.
- **로고 (채널05 §2-1):** 공식 마크(`resources/brand/ybmecc-mark.svg` — ybmecc.com 헤더 원본, **무변형**) + 「대치점」 지점 표기. 기본 C 탭형 `resources/brand/ybmecc-daechi-tab.png`를 좌상단 x80·y228·높이 112(폭 약 355). 바꿀 때는 새 파일명으로 들이고 `brand.json` `logo.file`·`asset`만 바꾼다. 원본 HTML `resources/brand/ybmecc-daechi.html`.
- **품질 원리는 ABMEN 채널05 §3-1 승계:** 핵심 발화와 자막·화면·소리 강조의 결합, 원인→행동→결과를 본문까지. 사진을 같은 크기로 넘기는 슬라이드는 완료가 아니다. 기존 영상 재제작이나 외부 Claude 호출을 자동으로 시작하지 않는다.
- **제작 절차 정본은 공용 `.claude/skills/video/SKILL.md`**(①~⑥ 지시서 공용). 컨펌을 만들지 않는다 — 한 번의 /video는 ⑥까지 멈추지 않고, 예외(팩트 검증 실패·저작권·기본값 없는 갈림길)는 SKILL 「제작 흐름」에만 있다(2026-10-22). 모든 도구·역할 에이전트가 같은 번호·승인 대본·cuts.json 시간·자산·STORYBOARD·검사·`worker-brief.md`를 쓰고 실제 화면·음성으로 판정한다(SKILL 「역할 분담과 위임」). 별도 DESIGN.md·UI 하네스를 만들지 않는다.
- **HyperFrames 보조 스킬**은 프로젝트 `.agents/skills/<이름>/SKILL.md`를 경로로 직접 읽는다(`hyperframes` 먼저 · 개인 영역 동명 판본 금지 · 기술 참고일 뿐, SKILL 「실행 환경」).
- **진행·중단·재개 상태는 프로젝트 README가 정본이다.** 문서·스킬 정리나 컨셉 확정만으로 음성·모션·MP4 생성을 시작하지 않는다.

## 🔴 학원 광고 — 납품 조건 세 가지 (2026-10-20 · 코드가 막는다)

```bash
node pipeline/photo-intake.mjs <p> [--check]   # 원생 사진 접수 — 회전·축소·GPS/메타데이터 삭제 → assets/photos/, README 「## 사진 동의」 장부
node pipeline/academy-check.mjs <p> [2-6]      # 법정 표시·금지 표현·사진 동의 (stage-gate 🏫 절·publish-check 와 같은 판정)
```

1. **원생 사진 동의** — 보호자 서면 동의가 README 「## 사진 동의」에 ✅인 사진만 화면에 쓴다(개인정보 보호법 제22조의2). 사진은 **git 밖**(`.gitignore`), 생성기·외부 업로드 금지. 🔴 **원생·교실·선생님·수업 결과를 생성 이미지로 만들지 않는다.**
2. **법정 표시** — 엔딩 카드에 상호 「이씨씨대치어학학원」·「학원 등록번호 제3984호」·교습과정(⑤ 하드), 업로드 문안에 교습비 5항목까지(⑥ 하드). 값의 정본 `brand.json` `academy` — 교습과정·교습비는 **원장 확인 전 비어 있고 비어 있으면 업로드 단계가 막힌다.**
3. **금지 표현** — 선행학습 유발(공교육정상화법 제8조제4항)·유치원(유사) 명칭(유아교육법 제28조의2)·결과 보장은 하드, 최상급·순위·실적·후기·모집 긴급성은 README 확정 팩트에 근거가 있을 때만(표시광고법). 규칙 정본 `pipeline/lib/platforms.json` `academy_ad`, 근거 `docs/channel/02-platform-rules.md` §1.

## 🔴 수정 요청을 받으면 — **전체 집계 후 한 번에** (필수 요건 · 2026-09-13 사용자 지시)

**지적이 하나 들어와도 즉시 손대지 마라.** 지적을 **전부** 장부에 올리고, 「이 한 칸」이 아니라 「이 종류가 몇 컷에 있나」를 layout-scan·grep으로 **전수** 센 뒤 한 번에 고친다.

```bash
node pipeline/fix-batch.mjs open <p> "<지적1>" "<지적2>" …          # 지적 전부
node pipeline/fix-batch.mjs type <p> <번호> "<유형>" <전수 적중수>    # 항목마다 유형으로 일반화
node pipeline/fix-batch.mjs close <p>                                # 전부 고친 뒤 (유형 미기재면 안 닫힌다)
```

- 🔴 **장부가 열려 있으면 `hf-render.sh`·`review-sheet.mjs`·`stage-gate.mjs`·`hook-check.mjs`가 exit 3으로 막힌다** — 한 건 고치고→굽고→확인받는 반사를 exit code로 막는다(문장만 있을 때 5개 세션 중 4개가 한 건씩 반응했다).
- 🔴 **렌더 상한 3회:** `hf-render.sh`가 `projects/<p>/output/.render-count`로 세고 4회째는 굽지 않는다. 게이트가 낸 전 항목을 한 번에 고친다(00010은 한 항목씩 다시 구워 11회). ↻ **묶음을 제대로 닫으면 예산이 복구된다**(영구 누적이면 `rm` 우회를 가르친다) — 한 건씩 찔러 보는 굽기만 깎인다.

## 🔴 스튜디오는 사용자가 요청할 때만 (2026-09-13 · 09-14 재개정)

```bash
pipeline/preview.sh <p> user     # 🔴 사용자가 "띄워줘"라고 했을 때만 — 유일한 통로
pipeline/preview.sh --stop-all   # ⏹ 끝나면 반드시 (TERM→KILL, 실제로 남은 수를 세서 보고)
```

- 🔴 **렌더 전 확인도 스튜디오로 하지 않는다** — `node pipeline/review-sheet.mjs <p>`로 이미지를 보낸다(대화에 뜨고 「1-8」로 지목된다).
- 🔴 **`npx hyperframes preview`를 직접 부르지 마라.** 🔴 **내 확인용으로 열지 마라** — 내 눈은 헤드리스(`snapshot`·`layout-scan`·`review-sheet`·`render-gate`)다. 스튜디오는 사용자가 보는 물건이다.
- **이미 떠 있으면 손대지 않는다** — 사용자가 보는 창을 껐다 켜지 않는다.

## 🎯 딱 하나 — **학부모가 보내고 싶고, 상담을 예약하고 싶어지는 영상을 만들어라**

흥행·문의는 목표이지 보장·사전 합격 수치가 아니다. 막히면 **사진 속 아이의 행동으로 학부모가 무엇을 새로 이해하는지, 다음 장면이 왜 필요한지, 실제 화면에서 결과가 읽히는지** 본다. 판정은 채널05 §3-1, 근거는 구체적 장면·시각. 막연한 불안·확신으로 반복 렌더하지 않는다.

🔴 **규격·상한·목표 수치는 2026-09-16 전부 삭제했다 — 되살리지 마라** (3초 통과율 70%·섹션 4~6개·8~15초·컷 12~25·이동 300~600px·횡단 0.9·글자 트윈 70%·어휘 6종·punch 1회·임팩트 예산·그림 50%·썸네일 정지 5초 — 금지 633개 동안 6편 연속 반려). **대신 재료를 본다** — `resources/motion/`(승인본 실물 마크업 Easy/Intermediate/Advanced)·`logos/`·`icons/`·`images/`. 없으면 **발명해라.**

| 기술 규격 (파이프라인 값) | |
|---|---|
| 해상도 | 세로 **1080×1920** · 60fps |
| 말 속도 | 원음 합성 → 조립에서 **단일 atempo 1.20배** |
| 섹션 길이 | `dur` = 실제 음성 길이·voice_offset_s·결과를 읽을 시간. 고정 0.13초로 여운을 일괄 자르지 않는다(video ③) |
| 자막 | 렌더에 굽는다. 무음으로 뜻이 전달되는지 실제 화면에서 확인(무음 시청 비율은 `docs/05-shorts.md`의 2019 외부 조사 — 채널 실측 아님) |

🔴 **긴급성은 실제 마감일이 확인될 때만** — 없는 시한·잔여석은 허위 긴급성(2025-10-30 시행 공정위 개정 심사지침, `pipeline/lib/platforms.json` `legal`·`academy_ad`). 모집 마감·정원은 원장 확인값만. "최대"의 조건·계산은 본문에서 설명한다(첫 대사에 단서를 몰아넣을 의무는 없고, 과장 표현은 현행 대본 지침을 따른다).

## ⛔ 제작 절차 — 이 순서를 벗어나지 마라

**인포그래픽 모션그래픽 전문 (2026-09-04).** **HyperFrames 기본**(2026-09-08 · SVG·사진·GSAP 모션을 직접 구현 · `hf-compile`은 정지 시안 초안·골격 검사용, 최종 프레임을 덮지 않는다 · docs/11·14) · Remotion 레거시(새로 시작 금지) · 정적 카드 보조(납품 뒤 카드 게시물은 `/cards`) · AI 실사 보류(실사 B롤이 꼭 필요할 때만 · 힉스필드 미도입 2026-09-15 · 옛 ①~⑦ 번호는 뜻이 다르다 — `docs/06-workflow.md`).

**현행 절차는 공용 video 스킬의 ①~⑥ 하나다**(2026-09-07 번호 통일 · 상세 SKILL 「제작 흐름과 보고 지점」):

```
① 분석   원장 꼭지·원생 사진(photo-intake·동의 장부) → 확인된 지점 사실
② 구조   cuts.json + 시각 방향 + 사진 선택(생성은 배경·소품만)  ⛳A 보고 (멈추지 않고 같은 턴에 ③ 유료 음성)
③ 목소리 tts → narration → timeline·subtitles 실측
④ 디자인 HF 시안 → ⛳B 대본+실제 정지 화면 시트 → 대표 동작 검증 → 프레임·효과음 조립 → ⛳C 번호 검수 시트(렌더 전)
⑤ 감독   렌더 → render-gate.sh → 별도 검수 역할 판정   ⛳D 최종본 확인
⑥ 문안   ⑤ 뒤 멈추지 않고 review 지시서 → publish.md → publish-check → stage-gate 6 (인스타·유튜브 + 학원 법정 표시 블록 — 인스타 캡션이 페이스북·스레드까지)    업로드는 사용자
```

- **단계를 건너뛰지 마라** — 꼭지가 없으면 시나리오를 지어내지 않는다. 게이트가 필요한 이유는 `docs/02-pitfalls.md`.
- 🚫 **납품은 MP4와 publish.md까지(한 번의 /video가 ⑥까지 멈추지 않는다 — 2026-10-22, 예외는 팩트 검증 실패·저작권·기본값 없는 갈림길뿐)** — 자막(브라우저 렌더로 굽는다)·BGM·출처 확인된 CC0 효과음을 넣고 자막·타임라인·유튜브 커버 `cover.jpg`(`hf-export.mjs`)를 함께 낸다. **하지 않는다:** 업로드(사용자 몫) · 라이선스 미확인 곡·효과음 · /video 제작 요청 밖의 목소리(문서 정리·검토·다른 편 작업 중 합성 금지 — 제작 요청 안에서는 A 보고 뒤 바로 ③, 길이 점검은 무료 `tts.mjs --measure`).
- 내가 못 하는 일은 **프롬프트를 만들어 넘긴다** — 만든 척하지 않는다. 불편하다는 말이 오면 산출물 형식을 고친다.

## 작업 원칙 — 문서를 의심하라

문서를 정답으로 받지 말고 근거가 서면 고쳐라(틀린 사례는 `docs/02-pitfalls.md`).

- 성능·품질·동작 주장은 **숫자로 재라**(파일 존재는 `ls` 한 번). **의심은 검증으로 끝내라** — 확인 없이 고치거나 "아마 틀렸을 것"으로 보고하지 않는다
- 🔴 **새로 만든 측정 도구부터 의심하라** — 수치로 사람을 움직이기 전에 눈검사와 대조한다(지표를 세 번 틀렸다)
- 🔴 **동일성은 식별자가 아니라 렌더되는 값으로 판정하라** (abm-44: id만 비교해 「복제 23건」, 내용 대조 0건)
- 🔴 **화소는 무엇이 그렸는지 모른다** — 시각·순서·이징은 소스에서 읽고, 화소는 「보이나·비었나」에만 쓴다
- 새로 겪은 사고는 `docs/02-pitfalls.md`에 **원인과 검증법을 함께** 남겨라

## 작업 전 라우팅

| 요청 | 읽을 문서 |
|---|---|
| 영상 만들어줘 | `/video`·`$video` — `.claude/skills/video/SKILL.md` (①~⑥) |
| 시안·대본 시트 (안무 전 보고 — 올리고 계속) | video ④ `stages/4-designer.md` B 보고 — 정지 화면 번호 시트+대본 · Claude `/ss` |
| 업로드 문안 | `.claude/skills/review/SKILL.md` (`/review`, Codex는 파일 직접) → `publish.md` |
| 인스타 판에 「댓글 달면 DM으로 지도/링크」 | video SKILL 「인스타 CTA 판」 — 학원을 찾아가는 편은 자동 `map`·「지도」(2026-10-22), 안내·상담 링크 `info`·「링크」는 요청한 편만. ②에서 cuts.json `ig_cta` + README 「인스타 판」·「지도 핀」 줄(stage-gate 2 대조) → 렌더 뒤 `ig-cta`가 자막 아래 스티커를 얹는다(같은 길이) · 문안 review §7 |
| 카드 게시물(캐러셀·카드뉴스) | `.claude/skills/cards/SKILL.md` (`/cards`·`$cards`) — 장마다 0초 포스터, 틱톡·X 제외(2026-10-08) |
| 절차의 근거 | `docs/05-shorts.md` (`docs/06-workflow.md`는 레거시 실사 — 현행 아님) |
| 🔵 채널 방향·전략·대상 | `docs/channel/README.md` (채널 라우팅) |
| 🔴 학원 광고 법규 (법정 표시·선행학습·표시광고·아동 사진·유치원 명칭) | `docs/channel/02-platform-rules.md` §1 · `node pipeline/academy-check.mjs <p>` |
| 🔴 원생 사진 받기·동의 장부 | `docs/channel/03-data-sources.md` §2 · `node pipeline/photo-intake.mjs <p>` |
| 🔵 한국어 문안·목소리 캐스팅 | `docs/channel/04-format-voice.md` §3·§4 (정본) |
| 🔵 지점 사실 / 근거 대장 | `pipeline/templates/brand.json` `academy` / `docs/channel/07-evidence.md` Y절 |
| 🔵 숏츠 묶음 롱폼(가로) | 보류 — `docs/channel/08-longform.md` 맨 위 |
| 시나리오 (언어 무관) | `docs/07-script.md` — 컷 분할·훅 구조 (ABM 라디오 페르소나 문체는 미적용 — 문체 정본 채널04 §3) |
| 이미지 에셋 | 원생·교실은 학원 사진만. 배경·소품 생성은 video ② 「이미지 생성 요청」 — 근거 `docs/08-prompting.md` §1 |
| 화면이 UI에 가린다 / 워터마크 | `docs/09-safezone.md` / `docs/10-watermark.md` |
| 모션·연출 | `resources/motion/` 재료 · 기술 함정 `docs/11-motion.md` |
| HyperFrames | `.agents/skills/hyperframes/SKILL.md`부터 → `docs/14-hyperframes.md` |
| 🔵 브랜드·로고·엔딩 카드 | `docs/channel/05-brand-pipeline.md` §2 (정본 — `docs/12-brand.md`는 ABMEN 기록) |
| 3D(Blender) / 사진·3D·코드 선택 | `docs/16-blender.md` — §4-1 실재 구조물 형상 대조 |
| 셰이더(배경 빛·사진 표면·와이프) | `docs/14-hyperframes.md` §16 · `node pipeline/shader-fx.mjs list` · 함정 pitfalls §181 |
| 서브에이전트로 프레임 | `pipeline/templates/worker-brief.md` — 공통 계약+해당 절만 전달 |
| 에이전트 모션 지시·Astra 사례 | `docs/13-astra-agent-motion.md` |
| 화질·원인 불명 | `docs/02-pitfalls.md` (HyperFrames 사고 §19) |
| 토큰·시간 절감 / 되돌리기 | `docs/15-cost-cuts.md` |
| 명령 전체 목록 | `docs/17-commands.md` |
| 주제·수익 / 도구 선택 | `docs/03-strategy.md` / `docs/04-tools.md` |

## 명령어 — 전체 목록은 `docs/17-commands.md`

자주 쓰는 것만 둔다(검사 4종은 AGENTS.md 「검사」, 수정 장부는 위 절). 명령을 더하거나 바꾸면 17번 문서를 고친다.

```bash
pipeline/new.sh <슬러그> [--long|--bundle]               # ① 폴더 골격 (기본 HF · 롱폼은 NNNNN-long-<슬러그>)
pipeline/status.sh <p> --resume                          # 이어하기 — README 상태·실행 흔적만 읽기
node pipeline/tts.mjs <p> --measure                      # ② 말이 컷에 들어가는지 (무료 say)
node pipeline/photo-intake.mjs <p> [--check]             # ①② 원생 사진 접수·동의 장부 (git 밖)
node pipeline/academy-check.mjs <p> [2-6]                # 🏫 법정 표시·금지 표현·사진 동의
node pipeline/asset-prompts.mjs <p> --generate           # ② 배경·소품 이미지 생성(아이·교실 금지) → Codex image_gen
node pipeline/hook-check.mjs <p> [--plan|--from <mp4>]   # 🔴🔴 첫 1·2·3초 (② 계획 · ④ 훅 잠금 · ⑤ 최종)
node pipeline/review-sheet.mjs <p> [--from <mp4>]        # ④ ⛳C 번호 검수 시트 (/ss)
pipeline/hf-render.sh <p> [출력.mp4]                     # ⑤ 렌더 — 소스 지문 봉인 · 상한 3회
node pipeline/hf-export.mjs <p>                          # ⑤ 자막·타임라인·커버 cover.jpg (export.mjs는 Remotion 전용 — 덮어쓴다)
```

## 시나리오 쓰기 — `cuts.json`

필드: `id`·`frame`·`dur`·`headline`·`say`·`text`·`dialogue[{speaker,say}]`(2인 대화)·`concept`(그림과 모션으로 이해시킬 것). **골격은 `pipeline/templates/cuts-motion.json`**(`new.sh`가 복사 — `timing`·`voice`·`assets` 포함). 필드를 지어내지 마라 — 뜻은 video ② `stages/2-architect.md` 「cuts.json과 그림 주문」, 화자는 ③. 옛 `image`/`overlay`/`video`·`image_prompt`/`video_prompt`는 실사 레거시 전용(`prompts.mjs`가 옛 스키마를 거부한다).

- `dur`가 타임라인의 기준이다 — **음성이 아니라 컷이 먼저다**
- 수치·가격·정책은 **확인하고 쓰고** 근거는 프로젝트 `README.md`에 남긴다. 문체·훅·컷 분할 규칙은 `stages/2-architect.md`·`docs/07-script.md`가 갖는다

## 자산을 넣을 때

**제작 경로는 화면 품질로 고른다** — 학원 사진·공식 마크·코드·이미지 생성(배경·소품)·Blender·셰이더를 조합한다(채널05 §4 — ABMEN과 뒤집힌 부분이 있다).

- 🔴 **원생·교실·선생님·수업 결과는 학원이 준 실제 사진·영상만** — `photo-intake`로 들이고 동의 장부 ✅만 쓴다. 생성·합성으로 아이를 만들거나 얼굴을 바꾸지 않는다. 원생 사진을 생성기·외부 서비스에 첨부하지 않는다(배경 제거는 로컬 `hyperframes remove-background`만).
- **이미지 생성은 배경·소품·계절 장식·설명 그림에만** — README `## 에셋 생성 요청`의 영문 고정 형식 프롬프트(② 지시서)에 `no people, no children`을 넣고 `asset-prompts --generate`. 실재 장소·제품을 생성할 때만 ABMEN의 `ref-photos` 실물 대조 규칙을 적용한다(대조 시트 없으면 `asset-prompts --accept` 거부).
- 🔴 **외부 사진(Commons·스톡·블로그)·저작자 표시 필요 소재(CC BY 등, 지도 OSM 등)를 쓰지 않고 화면·문안에 출처를 표시하지 않는다**(ABMEN 2026-10-02 승계 — `stage-gate ④`·`publish-check`가 막는다). YBM ECC 마크는 공식 원본 무변형.
- **사진 다루기:** 확대·이동·마스크로 시선을 옮기고 같은 크기 넘기기를 반복하지 않는다. 이름표·교복 학교명·셔틀 번호는 크롭·흐림으로 가린다. 사진의 밝은 부분 위 글자는 Ink 그라데이션 또는 Burgundy 면 위에(채널05 §2·§3).
- **해상도:** 표시 픽셀(1080 × 확대 배율) < 소스 픽셀(`photo-intake`는 긴 변 2400px까지 보존). `logo-check`(래스터 알파·1000px, SVG viewBox·벡터)를 통과 못 한 로고·컷아웃은 올리지 않는다.
- **로고·CI·재사용할 생성 소품은 `resources/`에 먼저 넣고 복사한다**(로고 → `logos/`·`brand/`, 생성 소품 → `images/`, 출처는 각 `SOURCES.md` 한 줄). 🔴 **원생 사진은 `resources/`에 넣지 않는다**(프로젝트 동의 범위 밖으로 재사용 금지).
- Blender·셰이더는 ABMEN 규칙 그대로 선택 재료(`docs/16-blender.md`·`docs/14-hyperframes.md` §16). 사진 속 아이를 3D로 재현하지 않는다.

## TTS — 함부로 재생성하지 마라

🔴 **YBMECC: 타입캐스트 이용정책은 지점·사업자마다 따로 가입하라고 적는다**(채널02 §1-8) — 어느 명의 구독으로 대치점 광고 음성을 만들지 사용자 확인 전에는 typecast 합성을 하지 않는다(길이는 무료 `say` Yuna). 재합성하면 같은 문장도 길이가 달라지고 타입캐스트는 한도가 있다. `tts.mjs --status`가 대본·설정·파일 지문을 검사한다 — 같으면 재사용, stale/untracked를 자동 재합성하지 않는다. 옛 음성은 대본 일치 확인 후 `--adopt=ID --confirm-script`. 대본을 고친 컷도 원본 voice를 보존하고, **대본이 바뀐 컷만** `--only=<컷id> --force`로 새 파일에 합성해 활성 포인터를 갱신한다(수정 요청이 곧 승인 — 2026-10-22).

시간 정본은 timing.version=1인 cuts.json(`timing`·`fps`·`dur`·`voice_offset_s`)이고 timeline.ts는 파생본이다 — `node pipeline/timing.mjs <p>`로만 갱신한다(기존 프로젝트는 `--migrate`로 실제 시간 보존). dur는 실제 음성 길이·발화 끝 여유·오프셋·읽을 시간을 포함하고, `measure --apply`가 관통 유닛을 임의 분할하거나 뒷말을 자르지 않는다(video ③).

## 도구 규칙 (2026-09-16 현행 경로 — 명령은 `docs/17-commands.md`)

- 대표 동작 `motion-preview --plan`은 나레이션 포함 snapshot 시퀀스다(캡처는 브라우저 허용 환경에서만) — 최종 렌더/BGM 검사가 아니다. `hf-project sync`는 수동 master·내부 GSAP/캡션을 덮어쓰지 않는다.
- 검증의 정상 결과만 다음 단계로 쓴다. `stage-gate 5 --prepare`는 납품 전 준비 검사이지 납품 완료가 아니다.
- srcman v4는 실제 참조한 .media/audio까지 봉인한다. 옛 봉인을 사후 덮어써 새 렌더 증거로 만들지 않고, 이미 납품된 영상은 원본을 유지한다.
- 폐기·삭제된 HTML 렌더러(`render.mjs`·`lib/anim.js`·`build*.sh`·`confirm.sh`)가 문서에 보이면 그 문서가 낡은 것이다.

## 남은 것

- 프로젝트 `README.md`의 "확인이 필요한 사실"을 채우지 않고 넘어가지 마라
- 지점 값(교습과정·교습비)·행사 날짜·정원은 **원장 확인값만** — 확인 날짜를 README에 적는다
- 업로드 72시간 뒤 인스타(도달·시청 시간·보내기·저장)·유튜브(Stayed to watch — `docs/channel/07-evidence.md` H02) 지표와 **그 주 상담 문의 수**를 `README.md`에 기록해야 다음 훅이 나아진다(채널06 §3)

## 손대지 말 것 (공통 금지는 AGENTS.md 「절대 하지 않는 것」)

- `.claude/settings.json`의 `CLAUDE_CODE_SUBAGENT_MODEL` — 일반 서브에이전트 기본값(Sonnet) 그대로. Claude 역할 에이전트(`.claude/agents/video-*.md`)의 모델·effort는 정의 파일이 정본이다(`docs/15-cost-cuts.md` 「서브에이전트 모델」). Codex에 Claude 모델명을 강제하지 않는다.
