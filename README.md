# YBMECC — YBM ECC 대치점 학원 홍보 숏폼 파이프라인

**YBM ECC 대치점**(상호 이씨씨대치어학학원)의 홍보 영상을 대본에서 **원생 사진·모션·자막·BGM 포함 MP4**와 업로드 문안까지 만든다.
주연은 학원이 준 **원생의 실제 수업·행사 사진**, 대상은 **대치동 학부모(한국어)**, 목표 행동은 상담 예약·설명회 신청이다.

**ABMEN(`../ABMEN/`)에서 이식했다 (2026-10-20).** 제작 절차(①~⑥)·도구·검사·규율은 ABMEN과 같고,
다른 것은 `docs/channel/`(대상·법규·문안·디자인), `pipeline/templates/brand.json`(팔레트·로고·지점 법정 표시 값),
학원 광고 검사(`academy-check`)와 원생 사진 접수(`photo-intake`)다 — 목록은 `AGENTS.md` 맨 위.

---

## 이 저장소를 처음 읽는 AI 에이전트에게

| 요청 | 먼저 읽을 문서 |
|---|---|
| **🔵 "이 채널이 뭔데"** | **`docs/channel/README.md`** — 대상·법규·자료·포맷·디자인·계획·근거 라우팅 |
| **"영상 만들어줘"** | **Claude `/video` · Codex `$video`** — `.claude/skills/video/SKILL.md`의 ①~⑥ |
| **🔴 "학원 광고에서 뭘 지켜야 하나"** | **`docs/channel/02-platform-rules.md` §1** — 법정 표시·선행학습·표시광고·아동 사진·유치원 명칭 · `node pipeline/academy-check.mjs <p>` |
| **🔴 "원생 사진 받았어"** | **`docs/channel/03-data-sources.md` §2** — `node pipeline/photo-intake.mjs <p>` → README 「## 사진 동의」 |
| **🔵 "문안·대본 어떻게 쓰나"** | **`docs/channel/04-format-voice.md` §3** — 학부모에게 하는 한국어 |
| **🔵 "로고·색·엔딩 카드"** | **`docs/channel/05-brand-pipeline.md` §2** · `resources/brand/` |
| **"업로드 문안 만들어줘"** | **`/review <프로젝트>`** — 학원 법정 표시 블록 포함. 규격 `pipeline/lib/platforms.json` |
| 어떻게 해야 끝까지 볼까 | `docs/05-shorts.md` (3초 후킹 · 리텐션 근거) |
| UI에 가리지 않으려면 | `docs/09-safezone.md` |
| "왜 이렇게 나오지 / 화질이 이상해" | `docs/02-pitfalls.md` |

⚠️ `docs/02~17`은 ABM·ABMEN 기술 문서다 — 그 안의 영어권·가격 설명·생성 장소 사례와 Navy·Inter 브랜드는 이 채널의 취향이 아니다. 채널 정본은 `docs/channel/`.

**승부는 첫 3초다** — 0초 첫 장면은 주제 제목·후킹·원생 사진을 한 장에 담은 포스터(CLAUDE.md 최우선).

---

## 30초 요약

```
① 분석    원장 꼭지 + 원생 사진 → photo-intake(회전·축소·GPS 삭제, git 밖) → 동의 장부 ✅ · 확정 팩트(원장 확인)
② 구조    pipeline/new.sh <슬러그> → cuts.json (한국어 대사·자막) · 사진 선택 · 배경/소품만 생성
③ 목소리  요청 시 tts.mjs → measure.mjs → narration.sh → transcribe.py   (타입캐스트 명의 확인 전엔 무료 say로 길이만)
④ 디자인  hyperframes/ 프레임 직접 작성 → layout-scan + review-sheet → 컨펌 · 엔딩 카드(상호·등록번호·교습과정)
⑤ 감독    hf-render.sh → render-gate.sh → hf-export.mjs → 판정      (stage-gate 🏫: 화면 법정 표시 하드)
⑥ 문안    /review → publish.md (인스타·유튜브 + 법정 표시 블록)     (교습비 5항목 원장 확인 전엔 막힌다)
   사용자  업로드 · YouTube 아동용 설정 선택 · 72시간 지표와 문의 수 기록
```

기본은 세로 1080×1920. 길이는 보여 줄 장면에 필요한 만큼(상한·목표 수치 없음).

### 필요한 것

| | | 상태 (2026-10-20) |
|---|---|---|
| Node | 24+ | ✅ |
| ffmpeg / ffprobe · exiftool · sips | 사진 접수·렌더 | ✅ (`/opt/homebrew/bin/exiftool`, macOS sips) |
| Chrome | 헤드리스 렌더·시트 | ✅ |
| `pipeline/.env.local` | 타입캐스트·클라우드플레어 키 | ABMEN 파일을 복사해 뒀다(내용 미출력) — 🔴 대치점 광고 음성을 이 구독으로 만들어도 되는지는 확인 전(채널02 §1-8) |
| 지점 값 | `brand.json` `academy` — 교습과정·교습비 5항목 | 🔴 **원장 확인 필요** |
| 계정 핸들 | `brand.json` `handle` | 🔴 확인 필요 |

---

## 디렉터리

```
YBMECC/
├── CLAUDE.md · AGENTS.md   에이전트 규칙 (ABMEN 이식 + YBMECC 조정)
├── .claude/skills/         video · review · cards · ss · long(보류) + HyperFrames 보조(→ .agents/skills)
├── docs/channel/           🔵 YBMECC 고유 — 전략 · 법규 · 자료 · 문안 · 디자인 · 계획 · 근거
├── docs/02~17              ⚪ ABMEN 이식 기술 문서
├── resources/brand/        ybmecc-mark.svg(공식 마크) · ybmecc-daechi-*.png(대치점 락업 4종) · ybmecc-daechi.html(원본)
├── resources/              fonts(Pretendard 가변·Hahmlet·Inter) · music(CC0) · sfx · icons · logos
├── projects/<NNNNN-슬러그>/ 영상 하나 = 폴더 하나 — photos-in/·assets/photos/ 는 git 밖
├── pipeline/               new.sh · photo-intake.mjs · academy-check.mjs · hf-render.sh · stage-gate.mjs …
└── legal/                  타입캐스트·효과음 약관 증빙
```

## 확인이 필요한 것 (사용자·원장)

1. 교습과정(등록증 기준)·교습비 5항목(반당정원·월교습시간·월교습비·교습기간·기타경비) → `brand.json` `academy`
2. 보호자 서면 동의서가 홍보 사용(인스타·유튜브·기간·철회 방법)을 포함하는지
3. 가맹본부의 CI·로고 사용 가이드(지점 홍보물 승인 절차)
4. 타입캐스트 음성을 어느 사업자 명의 구독으로 만들지
5. 인스타·유튜브 계정 핸들
6. 「영어유치부」 표기 사용 여부(유치원 유사 명칭 — 교육지원청 해석)

🔴 이 저장소에서 아직 영상을 한 편도 만들지 않았다. 이식 직후 상태다.
