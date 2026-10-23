# 17 · 명령어 전체 목록

`CLAUDE.md` 「명령어」 절에서 옮겼다(2026-10-09 — 매 요청 로드되는 가이드의 토큰 절감). `CLAUDE.md`에는 자주 쓰는 명령만 남는다.
**명령을 더하거나 바꾸면 여기를 고치고 `node pipeline/guide-check.mjs`를 돌린다.**

**영상 하나 = 폴더 하나** (`projects/NNNNN-슬러그/` — 롱폼은 `projects/NNNNN-long-슬러그/`, `new.sh --long·--bundle`이 붙인다, 2026-10-08). 저장소 루트에서 `pipeline/…` 로 부르고, 프로젝트는 **순번만으로 지목한다** (`2` · `00002` · `00002-온누리적립` 전부 됨). 내부 모듈은 `pipeline/lib/`, Remotion 엔진은 `pipeline/motion/`.

## 전체 목록

```bash
pipeline/new.sh <슬러그> [--long] [--photo] [--bundle]   # ① 폴더 골격 (--photo = AI 실사 레거시 · --bundle = 숏츠 묶음 롱폼 · 롱폼은 폴더가 NNNNN-long-<슬러그>)
pipeline/status.sh <p> --resume              # 이어하기: 현재 작업 상태·실행 흔적만 읽기 (검사 재실행 없음)
pipeline/status.sh [<p>]                     # 지정 프로젝트의 산출물·지문 상태 (생략하면 전체 조회)
node pipeline/logo-check.mjs [<p>]            # ① 화면 자산 규격 — 래스터(알파·1000px) + SVG 아이콘(viewBox·벡터)
node pipeline/photo-intake.mjs <p> [원본 폴더]  # ① YBMECC 원생 사진 접수 — photos-in/ → assets/photos/(회전·긴 변 2400 이하·GPS/메타데이터 삭제, git 밖) + README 「## 사진 동의」 줄 + output/photos/sheet.png
node pipeline/photo-intake.mjs <p> --check     #    동의 ✅ 없는 사진이 있으면 exit 1
node pipeline/academy-check.mjs <p> [2-6]     # 🏫 YBMECC 학원 광고 — 법정 표시(⑤ 화면·⑥ 문안)·금지 표현(선행·유치원 명칭·보장)·사진 동의 (stage-gate 🏫 절·publish-check 와 같은 판정)
node pipeline/lib/font-check.mjs <p>/hyperframes  # ①④ 폰트 선언·파일·사용 대조 (render-gate ②-c 가 부른다)
pipeline/lib/font-check.test.sh [<p>]         # 위 검사기의 변이 시험 7종 — 사본에서만 돈다
node pipeline/cf-crawl.mjs <url> [--crawl -l N]  # ① 웹 판독 — WebFetch 가 JS 페이지 본문을 못 읽을 때 (pitfalls §105)
node pipeline/cross-verify.mjs <p> [--refresh]  # ① 교차검증 패킷 — video-verify(메인과 분리된 검증 에이전트)가 검증하고 --record 로 기록. Codex 미사용
node pipeline/tts.mjs <p> --measure           # ② 말이 컷 길이에 들어가는지만 (무료 say)
node pipeline/asset-prompts.mjs <p> --generate [--only=id --force]  # ② README 이미지 요청 형식 검사 → Codex image_gen 생성·편집 → 경로 복사 (--lint = 검사만)
node pipeline/asset-prompts.mjs <p> --check        # 에셋 상태·경로·해상도·승인 지문 검사
node pipeline/ref-photos.mjs <p> <id> --search "<영문 이름>" | --url <URL>…   # ② 실물 사진 → output/refs/<id>/ + 후보 시트 (분석 전용)
node pipeline/ref-photos.mjs <p> <id> --sheet <생성 이미지·3D 스틸>…          # ②④ 실물 | 생성 대조 시트 → output/review/ref-<id>.png (승인·3D 게이트가 본다)
node pipeline/motion-signature.mjs menu <p>   # ② 이징 서명·룰 후보 → 실제 대표 동작을 보고 조정
node pipeline/motion-signature.mjs check <p>  # ④ STORYBOARD 「서명 동작 —」 줄의 선언·구현 참고 — 막지 않는다 (stage-gate 는 부르지 않는다)
node pipeline/poster-sheet.mjs <p> <고른 안> [<안2> <안3>] [--before <png>] [--body <본문 최고 장면 png>]  # ④ 0초 포스터 3안 비교 시트 → output/review/poster-sheet.png (4-designer 「0초 포스터」)
node pipeline/hook-check.mjs <p> [--plan | --from <mp4>]  # ②③④⑤ 🔴🔴 **첫 1·2·3초** — 비트·핵심어 시각(--plan) · 훅 잠금 시트+시각 대조 · 최종 MP4 시트

node pipeline/tts.mjs <p>                     # ③ 목소리 → projects/<p>/voice/ (승인 범위·대본/설정/파일 지문 확인)
node pipeline/measure.mjs <p> [--apply]       # ③ 발화 끝 실측 → dur·UNITS (--apply = cuts.json 갱신)
pipeline/narration.sh <p> 1.2                 # ③ 구절 레벨링 + 단일 atempo → projects/<p>/output/narration.wav
                                              #    기본 1.20 = 규약값 (2026-09-13 통일). 레거시 Remotion 판만 1.10 명시
~/.venvs/abm-whisper/bin/python pipeline/transcribe.py <p>   # ③ 어절 온셋 (`--apply`는 Remotion subtitles.tsx 교체 — HF 편에 쓰지 않는다)

node pipeline/hf-compile.mjs <p>               # ④ **정지 화면 시안 초안**(shots 비움) + 골격 검사(폰트·락업·대비·글자 위계). 최종 프레임은 아니다
cat pipeline/templates/worker-brief.md        # ④ 🔴 워커 디스패치 — 공통 계약과 해당 절만 전달; 파일 소유권·발화별 동작 정점 포함
node pipeline/root-lockup.mjs <p> [--sub] [--revert]  # ④ 좌상단 채널 로고(brand.json logo — ybmecc-daechi-tab.png)를 루트 트랙으로 (조립 뒤 · 멱등 · 로고 파일 복사). `--sub` 는 호환 옵션
node pipeline/layout-scan.mjs <p>             # ④ ⛳C 레이아웃 전수 스윕 — 글자✕글자·글자✕도형·여백이탈·프레임간 불일치·죽은 선택자
node pipeline/review-sheet.mjs <p> [--from <mp4>]   # ④ ⛳C 컷별 **번호** 검수 시트 → projects/<p>/output/review/ (사용자가 「1-8」로 지목)
                                              #    --from 은 **렌더본**에서 뽑는다 (마감 확인용). 기본은 조립본. 스킬은 `/ss`
pipeline/preview.sh <p> user                  # ④ 스튜디오 — 🔴 **사용자가 요청할 때만**. 유일한 통로
                                              #    렌더 전 확인은 review-sheet 로 한다 · 끝나면 --stop-all
node pipeline/frame-solo.mjs <p> <프레임>       # ④ 프레임 하나만 렌더 (반복 작업용)
node pipeline/sfx-fit.mjs --find <상황 단어> · <p> [--apply]  # ②④ 효과음 — 재질·사물로 후보 찾기 · event→at(파일 안 동기점) · 배치 안내. --catalog = pick↔catalog↔CREDITS 대조 + 라이선스 근거 등급(verified·url-only·unverified — 00002번부터 새 편은 verified만)

pipeline/blender-render.sh <p> <장면> [--review|--stills 0,1.5|--preview]  # ④ Blender 3D 장면(--review = 형태 검수 시트 + ABM3D_QA 겹침·떠 있는 조각 검사, 2026-10-22)(assets/scene/<장면>.py) → hyperframes/assets/3d/<장면>.webm(알파)+anchors.js. docs/16-blender.md
node pipeline/shader-fx.mjs list [--category <분류>]        # ②④ 번들 셰이더 효과 — 생성·효과·전환, 움직임, ×2·⛔기본값만 (docs/14 §16)
node pipeline/shader-fx.mjs <p> install|check|remove      # ④ 설치(assets/vendor·<head>·루트 data-requires-webgpu) · check = prop·설치본 검사, stage-gate ④ 가 부른다
node pipeline/shader-fx.mjs shot <시안.html> [--at 0,1]    # ④ 셰이더 시안을 WebGPU 로 찍는다 (poster-sheet 가 셰이더 안이면 알아서 부른다)
pipeline/hf-render.sh <p> [출력.mp4]          # ⑤ HyperFrames 렌더 — 소스 지문을 렌더 전에 봉인 (pitfalls §38)
pipeline/render-gate.sh <p> [영상.mp4]        # ⑤ 렌더 직후 전수 검사 — 하드 5(봉인·fps·lint·폰트·빈 화면) + 경고(정지·이음매·구역) (약 2분)
node pipeline/review-page.mjs <p> [영상.mp4]  # ⑤ 검수 한 장 → projects/<p>/output/review.html (5초)
node pipeline/hf-export.mjs <p>               # ⑤ HyperFrames 자막·타임라인·유튜브 커버(cover.jpg = 납품 MP4 0초, 2MB 미만) → projects/<p>/output/ (🔴 export.mjs 는 덮어쓴다 — pitfalls §41)
node pipeline/ig-cta.mjs <p> [--video <mp4>] [--preview]  # ⑤ 인스타 CTA 판(cuts.json ig_cta — 지도 핀 편은 자동 2026-10-22) — 본편 위에 자막 아래 스티커 「댓글에 링크 …」를 얹어 ig-reels-vN.mp4(같은 길이) · --preview 는 review/ 에 빠른 미리보기(--link info|map · --keyword) (hf-export 뒤, video SKILL 「인스타 CTA 판」)
node pipeline/export.mjs <p>                  # ⑤ 자막·타임라인 — **Remotion 레거시 전용**
node pipeline/seam-scan.mjs <p> [영상.mp4]    # ⑤ 컷 이음매 — 조립본에서만 잰다 (격리 하네스 금지)
node pipeline/motion-audit.mjs <영상.mp4>       # ⑤ 모션 총량 — 정지 구간·빈 화면
node pipeline/motion-vocab.mjs <p> [비교...]   # ④⑤ 모션 **크기**·어휘 — 개수로는 안 잡힌다 (pitfalls §46)
pipeline/still-scan.sh <p> [프레임...]        # ④ **정지 화면** 검출 — 프레임당 3시점 화면 변화량 (pitfalls §62)
pipeline/zone-check.sh <p> [영상.mp4]         # ⑤ **구역 강제** — 움직임 포함 화소 검사 (docs/09-safezone.md §1) · render-gate ②-e
node pipeline/motion-signature.mjs audit <p>  # ⑤ 사고성 복제 감사

node pipeline/fix-batch.mjs <명령> <p> [...]    # 🔴 **수정 묶음 장부** — open·type·close. 열려 있으면 렌더·시트·게이트가 막힌다

# 숏츠 묶음 롱폼 (/long · docs/channel/08-longform.md)
node pipeline/hf-bundle.mjs catalog [--loudness] [--headlines] [--views]  # 묶을 수 있는 숏츠 전수 — 봉인 일치 렌더·길이·효과음·자막 효과·사용 여부 (--headlines = 연도·사건으로 이야기 연결 찾기 · --views = 공개 조회수, 챕터 1 = 최고 조회)
node pipeline/hf-bundle.mjs <p> plan              # 원본 봉인·길이·음량 → cuts.json 시간축(0.5초 격자)·YouTube 챕터
node pipeline/hf-bundle.mjs <p> build             # 원본 복사(chNN/, 봉인 일치만) + 1920×1080 index.html
node pipeline/hf-bundle.mjs <p> verify [--chapter N] [--video <mp4>]  # 렌더 전: 무대 = 원본(SSIM)·좌우 경계(B 확장 대상) · 렌더 후: 규격·챕터 음량 차이
node pipeline/bundle-widen.mjs <묶음> <원본> <이미지 경로> [--hint "장면"] [--margins-from <jpg>]  # B 확장 — 1080 폭 생성 사진을 16:9로 이어 그린 띠(가운데 원본 화소·경계 색 보정) → compositions/bundle/assets/ (08 §4.3)
pipeline/bundle-3d-wide.sh <묶음> <원본> <장면>   # B 확장 — 원본 3D webm을 가로 2280으로(좌우 띠만 렌더 + 가운데 원본 화소, 프레임 번호로 정렬) → compositions/bundle/assets/ (08 §4.3)
node pipeline/hf-bundle.mjs <p> loudness [--apply] [--keep]  # 렌더 전: 1fps 측정 렌더(납품 아님)로 묶음 믹스 챕터 음량·트루피크·피크 지점 → 배율 (pitfalls §147)
node pipeline/hf-bundle.mjs <p> sheet [--out <폴더>]  # 조립 + 전 프레임 3시점·전환·정리 시트(B 분류·감독 입력) · snap <폴더> <시각들> = 원하는 시각 스냅샷. 묶음 잠금 안에서 돈다
node pipeline/hf-bundle.mjs <p> reseal <챕터>       # 납품 뒤 루트 락업만 바뀐 원본 — 변경 전 조립본과 대조해 묶음 지문 기록 (pitfalls §153)
node pipeline/hf-bundle.mjs <p> lines [챕터]      # 챕터별 대사 문장·시각 (§7.4 효과음 큐 시각 등)
node pipeline/hf-bundle.mjs <p> chapters          # 설명란 챕터 (hf-export 는 output/chapters.txt 로도 쓴다)
node pipeline/hf-bundle.mjs <p> thumb frames <초,…> | check [--html <파일> [--alt]]   # 롱폼 썸네일 = 0초 포스터(렌더 전, 대표 영상 한 장 + 「+N MORE」) — 챕터 1 첫 화면 스냅샷 → cards/assets/ · cards/thumbnail.html(숏츠 0초 포스터 문법) 촬영+검사 → output/thumbnail.jpg, 다음 조립에 0초 포스터 (08 §3.1·§8.1, 틀 pipeline/templates/thumbnail-long.html)
node pipeline/keyword.mjs "<후보>" [--expand]   # ⑥ 영어 검색 표현 — 유튜브·구글 자동완성 제안 (검색량 아님) · 질문형·해시태그 후보
node pipeline/publish-check.mjs <p>           # ⑥ 공용 review 지침으로 만든 업로드 문안 검사 (카드 원본이 있으면 `## carousel` 절도 · cuts.json ig_cta 편은 `## dm` 절과 다른 플랫폼의 DM 약속 금지까지)
node pipeline/card-render.mjs <p>             # 카드 게시물 렌더+검수 — cards/NN-*.html → output/cards/NN.jpg(1080×1350 JPEG) + sheet.png. 글자 넘침·겹침·단어 중간 줄바꿈·서체·출처를 잡고, 하드면 납품 이미지 대신 check.png (/cards) · `--youtube` = cards/youtube/ → output/cards/youtube/(1080×1080, 유튜브 게시물용)
node pipeline/guide-check.mjs                 # 🔴 **문서를 고쳤으면 반드시** — 문서가 부르는 명령이 아직 맞는지

# Remotion 레거시 경로
pipeline/render.sh <p> [파일명]                # ④ Remotion 렌더  ·  pipeline/studio.sh <p> 미리보기
node pipeline/qc.mjs <p> [--frames]           # ⑤ Remotion 렌더 QC

# AI 실사·정적 카드 경로 (레거시·보조)
node pipeline/prompts.mjs <p>                 # ② 컷별 AI 프롬프트 → projects/<p>/output/PROMPTS.md
pipeline/cards.sh <p> [컷id ...]              # 레거시 컷 이미지(게시물 카드 아님 — 카드 게시물은 card-render) → projects/<p>/assets/images/
node pipeline/assemble.mjs <p>                # 정적 이미지 조립 초안 → projects/<p>/output/draft.mp4
```

## 현행 도구 경로 (2026-09-16)

```bash
node pipeline/hf-cli.mjs <p> --resolve | lint         # 프로젝트가 고정한 로컬 HyperFrames CLI (제작 중 설치·업그레이드 금지 — AGENTS.md 환경 절)
node pipeline/timing.mjs <p> [--migrate]              # cuts.json timing/fps/dur/voice_offset_s → timeline.ts 파생 (--migrate = 기존 프로젝트를 실제 시간 보존해 전환)
node pipeline/tts.mjs <p> --status                    # 대본·설정·파일 지문 검사 (같으면 재사용, stale/untracked 자동 재합성 없음)
node pipeline/tts.mjs <p> --adopt=<컷id> --confirm-script   # 옛 음성 — 실제 대본 일치 확인 뒤 채택
node pipeline/tts.mjs <p> --only=<컷id> --force       # 사용자가 승인한 컷만 유료 재합성 → 새 파일 + 활성 포인터 갱신
node pipeline/motion-preview.mjs <p> --start=0 --end=5 --plan   # 대표 동작 — 나레이션 포함 snapshot 시퀀스 (캡처는 브라우저 허용 환경에서만, 최종 렌더/BGM 검사 아님)
node pipeline/hf-project.mjs <p> sync                 # 새 관리 골격 조립 — 수동 master·내부 GSAP/캡션은 덮어쓰지 않는다
node pipeline/stage-gate.mjs <p> 5 --prepare          # 납품 전 준비 검사 (납품 완료가 아니다)
```

## 업로드에 넘기는 파일 — `hf-export.mjs` (Remotion만 `export.mjs`)

```
projects/<p>/output/subtitles.srt        자막 (편집 프로그램이 그대로 읽는다)
projects/<p>/output/cover.jpg            유튜브 커버 — 납품 MP4의 0초 포스터 한 장(쇼츠 1080×1920 · 롱폼 1920×1080 JPEG, 2MB 미만)
projects/<p>/output/timeline.md / .csv   컷 순서·시작/끝·길이·파일 대조표 + 나레이션 전문
projects/<p>/voice/<컷id>.m4a            컷별 음성 — 컷에 하나씩 얹으면 된다
projects/<p>/output/narration.m4a        통합본 (타임라인에 맞춘 무음 패딩 포함)
```

## 레거시·보조 경로 메모

- **Remotion** — `render.sh` 는 렌더 직전에 `pipeline/motion/public/` 을 스테이징한다 (`resources/brand`·`fonts` → `public/`, `projects/<p>/output/narration.wav` + `projects/<p>/assets/audio/*` → `public/project/`) — 씬에서는 `staticFile('project/narration.wav')`.
- **정적 카드** — `cards.sh` 는 headless Chrome 으로 `cards/*.html` 을 2160×3840 PNG 로 찍고, `assemble.mjs` 는 이미지+`narration.m4a` 를 크로스페이드·미세 줌으로 `draft.mp4` 조립 초안까지 만든다(2026-09-03 도입). 초안에는 자막이 없다 — 자막을 구운 납품 MP4는 `hf-render.sh` 가 만든다.
- **폐기·삭제된 HTML 렌더러** — `render.mjs`·`lib/anim.js`·`build*.sh`·`confirm.sh`. 문서에서 이 이름들을 보면 그 문서가 낡은 것이다.
