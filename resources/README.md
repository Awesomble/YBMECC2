# resources/ — 공유 리소스

**프로젝트와 무관하게 재사용하는 것**을 여기 둔다. 영상별 소스·자산·산출물은 전부 `projects/<p>/` 안이다(산출물은 `projects/<p>/output/`).

| 폴더 | 내용 | 렌더에 들어가는 법 |
|---|---|---|
| `brand/` | **YBM ECC 대치점** — 공식 마크 `ybmecc-mark.svg`(ybmecc.com 헤더 원본, 무변형) + 대치점 로고 4종 `ybmecc-daechi-{tab,plate,clear,stack}.png`(기본 tab — 좌상단 x80·y228·높이 112, 규격 `pipeline/templates/brand.json` `logo`) + 원본 HTML `ybmecc-daechi.html` + `SOURCES.md`(출처·다시 뽑기) | `new.sh` 골격이 `hyperframes/assets/brand/`로 복사하고 루트 `#el-root-lockup`이 그린다(옛 골격은 `node pipeline/root-lockup.mjs <p>`) |
| `logos/` | 주제 브랜드·기관 CI. 평면 구조 + `SOURCES.md` 한 파일(브랜드별 폴더가 아니다). 규칙·상표 주의·회수 절차는 `logos/README.md` | 쓸 것만 `projects/<p>/assets/scene/`에 두고 HF 경로(`hyperframes/assets/scene/`)로 복사한다 |
| `icons/` | 공용 픽토그램 SVG(Apache 2.0 — 체크·금지·화살표 등을 글리프 대신 그린다) | 쓸 것만 `hyperframes/assets/icons/`로 복사해 inline SVG·`<img>`로 |
| `motion/` | 모션 재료 — 승인본에서 뽑은 실물 마크업을 Easy/Intermediate/Advanced로(`motion/README.md`). 금지 목록을 대신한다 | 붙여 넣는다. 런타임 참조 금지(pitfalls §106) |
| `fonts/` | **Pretendard 가변(`PretendardVariable.woff2` — 본문·자막·숫자, YBMECC 기본)**·Hahmlet(0초 포스터 주제 제목) + OFL. Inter·한나체Pro·잘난체·Pretendard 정적은 이식분 — YBMECC 화면 기본이 아니다(채널05 §2). 라이선스 표 `fonts/README.md` | `new.sh` 골격이 `hyperframes/fonts/`로 복사한다(`brand.json` `font`·`posterFont`) |
| `music/` | BGM `cc0/`만 쓴다(`cc-by/`는 2026-10-02부터 사용 금지, 기록용). 출처·LUFS·**정서**는 `music/CREDITS.md`, 고르기는 `music/README.md`, 절차 `docs/14-hyperframes.md` §5 | 직접 참조하지 않는다. 이 편의 정서(README 「디자인 방향」)로 고른 곡을 하이라이트부터 잘라 `projects/<p>/hyperframes/assets/bgm/bgm.mp3`로 굽고 `audio_meta.json.bgm`에 적는다 |
| `sfx/` | 자동 사용 `pick/`(CC0 — 개수는 `node pipeline/sfx-fit.mjs --catalog`로 센다) · 출처가 기록된 원본(`kenney/`·`freesound/` 등) · 사용자 제공 `review/`(권리·청취 미확인, 자동 사용 제외). 선택·출처는 `sfx/README.md`·`sfx/CREDITS.md` | `audio_meta.json.sfx` → `hf-project sync` → root 오디오에 굽는다 |
| `images/` | 여러 영상에서 재사용하는 **배경·소품·생성 이미지**(🔴 원생 사진·아이 생성 이미지 금지 — 원생 사진은 프로젝트 `assets/photos/`, git 밖). 출처·라이선스·가공 이력은 `images/SOURCES.md`. 남의 제품 사진은 공식 보도자료만. 🔴 **로고는 여기가 아니라 `logos/`** | 쓸 것만 `projects/<p>/assets/scene/`(또는 `assets/images/`)에 두고 HF 경로로 복사한다 |
| `voices/audition/` | 타입캐스트 보이스 오디션 원음 — ABMEN 이식분 5종 + YBMECC `yeonhwa-ko.wav`(2026-10-20 내레이터 채택). 캐스트와 voice_id는 `docs/channel/04-format-voice.md` §4. **본합성은 오디션과 같은 설정** — `docs/02-pitfalls.md` §10 | 참고용. 렌더에 안 들어간다 |

## 규칙

- **자동 사용 자산은 사용 조건을 확인한다.** 사용자가 제공한 효과음의 미확인 선별 후보는 `sfx/review/`에만 구분해 보관한다. 폴더마다 `CREDITS.md`(음악·효과음) 또는 `SOURCES.md`(로고·이미지)에 출처 한 줄을 남긴다. 저작자 표시가 필요한 소재(CC BY 등)는 어느 폴더에도 새로 들이지 않는다(2026-10-02).
- 🔴 **회수**: 영상을 만들다 새로 구한 로고·공식 제품 사진·재사용할 생성 이미지는 **그 영상 폴더에 두고 끝내지 마라.** 규격 통과본을 여기로 올려야 다음 영상이 다시 안 구한다. 🔴 원생 사진은 회수하지 않는다(프로젝트 동의 범위 밖 재사용 금지). `node pipeline/logo-check.mjs` 맨 아래 📦 절이 미회수분을 세고 `stage-gate <p> 6`이 경고한다(`logos/README.md` 「회수」).
- **해상도 여유**: `표시 픽셀 = 출력 크기 × 확대 배율 ≤ 소스 픽셀`. 세로 숏츠 1080×1920에 1.15배 줌이면 ≈1,250px 이상. 로고 심볼은 정사각 1000px+, 워드마크는 가로 2000px+ 투명 PNG. 채널 로고(`brand/`)는 표시 높이 112px의 2배면 통과한다.
- 폴더를 새로 만들면 이 표에 한 줄 추가한다.
