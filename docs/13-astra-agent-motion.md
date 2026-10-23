# 에이전트 모션그래픽 — Codex·Astra·HyperFrames 사례 리서치

**2026-09-08 리서치.** 스레드·X·블로그·공식 문서 40여 건. @ssaengcho 의 게시물 2건은 브라우저를 연결해
**영상 프레임 49장과 댓글까지** 읽었다. 나머지 스레드 게시물은 본문만이다. 출처는 §5.

---

## 0. 한 줄 결론

스레드에 올라오는 "코덱스 아스트라 모션그래픽"은 **GPT-6 Astra(2026-09-03 출시) + Codex + HyperFrames** 조합이다.
모델이 창작·코드를 쓰고, Codex 가 실행 환경이고, HyperFrames(HeyGen, HTML+GSAP, Apache 2.0) 또는 Remotion 이 MP4 를 굽는다.

**우리 파이프라인(Claude + Remotion 엔진)과 구조가 같다.** 가져올 것은 도구가 아니라 **프롬프트 문법과 모션 규칙**이다.
렌더러를 바꿀 이유는 없다 — 근거는 §3 마지막 행.

---

## 1. 스레드 사례 — 무엇을 어떻게 만들었나

| 게시물 | 무엇 | 사람이 준 것 | 모델이 스스로 한 것 |
|---|---|---|---|
| @ssaengcho `Dc8NAi3GsRj` | 15초 타이포 모션 | 원하는 느낌 · 닉네임 · 노란 꽃 · 15초 | 음악 생성 · 어울리는 텍스트 채움 · **비트에 꽂히는 편집** |
| @ssaengcho `Dc8NBGNGjKH` **(다이소)** | 로고 모션, 한글+단순 도형 | 다이소 로고 · **"로고 안의 원형을 활용해달라"** · 무료 음원 파일 | 원형 모티프로 전체 안무. 댓글 버전은 음악까지 생성 |
| @ssaengcho `Dc_Ie3fE8oy` | 이미지·실사 영상 소스 추가 | 사진·클립 | "디테일이 붙을수록 **시간이 급증**, 결국 프레임 단위 수정" |
| @prompt_what `Dc2J13QigOE` | 박물관 촬영 | 공간·인물 | Astra 가 **도면(공간 사용·인물 위치·컷 수)** 을 먼저 그림 → Seedance 2.5 가 도면대로 촬영. 인물이 프레임 밖으로 안 튐 |
| @choi.openai `Dc3EZU-D2H2` · `Dc6DLf5DwS_` | 사례 20선 ×2 | — | 3,295객체 3D 기차 · Blender/Unreal 도시 · 30분 만에 영상 편집 앱. **댓글 미확보** |
| @unclejobs.ai `DXT0f9sk8tI` · @bravomylife153 `DXWeLlSifAm` | HyperFrames 소개 | URL 하나 | 디자인 분석 → 문서 → 로고 애니메이션 자동 |
| @alex_ai_mcp `DV5Eamxkd-x` | Remotion 바이브코딩 | — | "영상도 바이브코딩" (18.8K 뷰) |

### 다이소 영상 분석 — 프레임 34장으로 (사용자 요청)

브라우저를 연결한 뒤 영상을 0.25~0.5초 간격으로 정지시켜 찍었다. 컨택트 시트: `docs/experiments/astra-ssaengcho/daiso-10s-frames.png`
(행 우선. 0 · 0.5 · 1 · 1.5 · 2 · 2.5초, 이후 3.0~9.75초를 0.25초 간격). 원본은 1280×720, 10.0초, 무나레이션.

**타임라인 (실측)**

| 구간 | 화면 | 기법 |
|---|---|---|
| 0.0–1.0 | 흰 바탕에 빨강 "2026" → "09" (날짜를 숫자 두 컷으로) | 훅 = 숫자. 로고의 원(○)들이 흩어져 떠 있다 — **모티프 선포** |
| 1.0–1.5 | "50%" 가 **프레임을 넘치게** 커졌다가 "최대 할인 / 50%" 로 정착. 거대한 원 링이 왼쪽에서 쓸고 들어옴 | 스케일 오버플로 펀치 + 모티프가 전환을 실어 나른다 |
| 2.0–3.25 | **빨강으로 반전.** "다이소에서" → "일상을" → "큰 혜택", 각 0.5초. 오른쪽 위 흰 원이 물방울처럼 합쳐졌다 갈라진다 (메타볼) | 배경 반전 = 강조. 원 모티프가 액체로 변주. 3.25초에 원이 먼저 퇴장하고 텍스트가 남는다 (요소별 시차) |
| 3.5–4.5 | **흰색으로 반전.** "필요했던 물건을 더 가볍게" — 앞부분 검정·뒷부분 회색 → 0.5초 뒤 **색만 교체**해 뒷부분 강조. 부제 "FIND YOUR EVERYDAY" 빨강 | 1초 홀드 = 브리더. 강조는 새 요소가 아니라 **회색↔검정 스왑** |
| 4.5–5.25 | "담고 / PICK" → 글자가 갈라지는 중간 상태 → "준비하세요 / GET READY" 가 **자간 넓게 들어와 좁혀지며** 정착 | 글자 단위 모프 + 트래킹인 |
| 5.5–6.75 | 카테고리 슬롯 롤: 주방용품 → 수납용품 → 문구용품 → 욕실용품 → 청소용품, 항목당 0.25~0.5초, 부제 영문 동시 교체. 오른쪽 위·왼쪽 아래에 **원 링 호(弧)** 가 프레임 장식으로 고정 | 리스트는 세로 롤. 모티프가 이번엔 크롬(틀)이 된다 |
| 7.0–7.75 | **빨강 반전.** 주방용품(프레임 초과) → 문구용품(정상) → 욕실용품(초과) → 생활용품(정상), 0.25초 간격 | 비트에 맞춘 **거대/정상 스케일 교대** — "쫀득함"의 정체 |
| 8.0–10.0 | **흰색 반전.** 엔드카드: 다이소 로고 락업 + "최대 50% 할인" + "2026.09.30" + 원 링. 8.0→8.25 요소들이 스프링으로 정착, 이후 링이 천천히 표류 | 2초 홀드(20%). 정지가 아니라 **앰비언트 아이들**. 로고의 원 = 처음 모티프의 귀환 |

**읽어낸 규칙 8개**

1. **색은 둘.** 다이소 빨강 + 흰색, 글자 검정. 강조는 새 색이 아니라 **배경 반전**(빨강↔흰 5회)·**스케일**(프레임 초과 3회)·**회색↔검정**이다. HyperFrames 스토리보드 규칙 *"emphasis = invert, scale up, or go denser — never a third color"* 그대로.
2. **모티프 하나가 다섯 번 변주된다.** 흩어진 링(0s) → 쓸고 가는 거대 링(1.5s) → 액체 원(2~3s) → 프레임 호(5.5~7s) → 엔드카드 링·로고(8s). 사용자가 준 지시는 "로고 안의 원형을 활용해라" 한 줄이었다.
3. **소재는 한글 큰 글자 + 영문 작은 자간 캡션 한 쌍.** 폰트 하나(볼드 산세리프), 장식 0. 블러·글로우·그라데이션·파티클 없음 — 우리 이펙트 금지 목록과 동일.
4. **상단 좌우·하단 좌우 크롬이 10초 내내 고정**("DAISO / SPECIAL OFFER" · ○○○ · "2026.09.30" · "UP TO 50%"). 우리 P6 지속 그라운드와 같다.
5. **시각 변화 18회/10초.** 우리 기준(10초당 5~7회)의 3배다. 차이는 나레이션 유무 — 무음 비트컷 스팟은 컷이 곧 리듬이다. 나레이션 숏츠에 그대로 옮기면 안 되고, **컷 안의 마이크로 비트**(스케일 펄스·색 스왑·트래킹인)로 가져온다.
6. **요소별 시차.** 3.25초에 원이 먼저 나가고 글자가 0.25초 더 남는다. "두 요소가 시작·끝을 공유하지 않는다" 규칙의 실물.
7. **브리더 1회(3.5~4.5s) + 홀드 1회(8~10s).** 홀드에도 링이 움직인다 — 정지 프레임 0.
8. **훅은 숫자, 엔드카드는 로고+숫자+날짜.** 마감일(2026.09.30)이 크롬에 상시 노출 — 우리 Stake 요소와 같다.

**같은 작성자의 15초 타이포 영상** (`ssaengcho-15s-frames.png`, 1초 간격): 검정/흰/노랑 세 색, 구절당 1초 하드컷, 서체 목소리 셋(볼드 흰 산세리프 · 노랑 모노 자간 · 회색 얇은 자간),
강조는 회색→흰 스왑, 반전 비트 3회(4·9·10s), 요청한 노란 꽃이 6초와 엔드카드에 모티프로, 7초의 "A different point of view" 가 14초 엔드카드 태그라인으로 콜백. 다이소와 **같은 문법**이다.

**댓글에서 나온 노하우** (`Dc8NBGNGjKH` 댓글 10개 중):
@shellang_k_official 이 행사용 이미지를 넣어 따라 만든 뒤 — *"요소를 사용하라는 이야기를 안 썼더니 좀 밋밋한 것 같아서 갓을 이용하라고 해서 다시 만들어봤어요."*
**모티프를 이름으로 지정하지 않으면 밋밋하게 나온다.** 다이소의 "원형", 타이포의 "노란 꽃", 이 사람의 "갓". 프롬프트에서 가장 값싼 한 줄이 결과를 가른다.

재현 프롬프트는 §4-D. 위 규칙 1·2·6 을 반영했다.

---

## 2. 노하우 — 그들이 프롬프트를 쓰는 법

### 2-1. 여섯 부분 골격 (HyperFrames 공식 `prompting/anatomy`)

| 부분 | 무엇 | 예시 | 우리 대응 |
|---|---|---|---|
| Route | 어떤 워크플로 규칙을 태울지 | `/motion-graphics` | `/video` 스킬 ④ 디자인 |
| Spec | 길이·해상도·fps 를 **문장 첫머리에** | "8-second 1080x1920 video, 30 fps" | cuts.json `dur` 합계, 1080×1920@60 |
| Beats | 구간별 타임스탬프 + 페이싱 메모. *"agents skip breathing room unless told"* | "Beat 2 (4–5s): the terminal shatters" | `timeline.ts` B·CUT_END_M |
| Copy | 화면 문구를 **따옴표로 원문 그대로**. 안 하면 의역된다 | `"YOU JUST MADE THIS / WITH HYPERFRAMES."` | cuts.json `text`·`headline` |
| Technique | 쓸 블록·패턴을 이름으로 못 박는다 | "Adapt the `code-typing` block" | `kit.tsx` 원자 이름 (P1·P3·P4…) |
| Negatives | 애매함을 닫는다 | "No narration, no image or media files" | 이펙트 금지 목록 |

### 2-2. 사양 다이얼 (`prompting/specification-dial`)

세 단계: **분위기 단어** ("따뜻하고 미니멀한 로고 스팅") → **스타일 토큰** (hex · "halftone-dot" · "condensed caps, wide tracking")
→ **완전 시각 사양** (요소마다 형태+색+위치+시각). 밀도를 올리면 결과가 상상에서 덜 벗어날 뿐 나빠지지 않는다.
반드시 못 박는 두 가지: **3D 는 "Three.js via the adapter" 명시**, **시퀀싱은 시각으로** ("4.2s 까지 완전히 사라지고, 4.2s 에 READY 스탬프").

### 2-3. 스펙터클 비트 하나 + 앰비언트 아이들

- *"Spectacle beat: one exaggerated moment, everything else restrained."* 검증 프롬프트 17개 전부가 이 한 줄을 갖는다.
- *"settles into a gentle ambient idle (1–2% breathing scale + slow drift)"* — **정지된 마지막 1초가 가장 큰 싸구려 신호**. 연속 두 프레임이 비트 동일하면 죽은 영상.

### 2-4. 프리미엄 모션 8규칙 (`prompting/motion`)

*"Every movement makes a claim."* 문장을 완성해라: **"이게 움직이는 이유는 …"** 못 채우면 지운다.
모션의 일은 넷뿐 — 주의 유도 · 연속성 · 변화 자체 · 브랜드 성격. 나머지는 장식이고 싸 보인다.

| # | 규칙 | 한 줄 |
|---|---|---|
| 1 | 완전히 멈추지 않는다 | 홀드는 "ambient idle" 로 쓴다 |
| 2 | 카메라는 배우 | 씬당 연속 무빙 1개 (4~8% 푸시인·궤도·패럴랙스) |
| 3 | 오버랩 액션 | **어떤 두 요소도 시작 시각·끝 시각을 공유하지 않는다.** 서포트는 늦게, 포컬은 절대 안 늦게 |
| 4 | 복합 속성은 한 이야기일 때만 | 슬라이드+페이드 = "도착한다" 하나. 상충하는 주장은 버린다 |
| 5 | 오버슈트·팔로스루 | 변형(transform)에만. **데이터 값은 절대 오버슈트 금지**. 그림자는 1프레임 늦게 |
| 6 | 깊이 층 | 배경은 분율·콘텐츠 1×·전경 배수. 깊이 단서는 블러보다 **겹침** |
| 7 | 장르 페이싱 | 쇼릴 1.5~4초/아이디어. 템포는 애니메이션 전에 결정 |
| 8 | 손맛도 재현 가능하게 | 시드 PRNG. 스톱모션은 "정확히 2프레임 홀드, 프레임 인덱스로 양자화" |

### 2-5. 어휘 → 이징 매핑 (`prompting/vocabulary`)

| 말 | 설정 | 말 | 설정 |
|---|---|---|---|
| smooth | `power2.out` | fast / medium / slow | 0.2s / 0.4s / 0.6s |
| snappy | `power4.out` | slow push-in | 씬 전체 4~8% 확대 |
| bouncy | `back.out` | punchy cuts | 1.5~4s/아이디어, 하드컷, 등장 겹침 |
| springy | `elastic.out` | ambient idle | 1~2% 브리딩 + 느린 드리프트 |
| dramatic | `expo.out` | 캡션 Hype | 헤비 웨이트·스케일 팝·72~96px |
| dreamy | `sine.inOut` | 캡션 Social | 라운드체·바운스·56~80px |

우리는 이징 대신 스프링 프리셋(730/33 · 500/28 · 340/22)을 쓴다. 어휘를 프리셋에 매핑하면 같은 효과다:
smooth=730/33 · bouncy=340/22 · snappy=500/28 임펄스.

### 2-6. 수정은 편집자에게 말하듯 (`prompting/iterating` · Kingy)

- **한 번에 변수 하나.** 바꾸고 → 렌더 → 판단 → 반복. 여러 개를 동시에 바꾸면 무엇이 통했는지 모른다.
- **절대값으로.** ✗ "점을 더 가늘게" → ✓ "점 반경 = 행 간격의 25%". 상대 지시는 진동한다.
- **정착한 건 얼려라.** "구도와 모션은 맞다 — 건드리지 말고 점 크기만."
- **시각 + 요소 + 의도** 형식: *"At 0:03.2, headline and chart compete. Let chart finish, then reveal headline 0.4s later.
  Recover time from decorative movement. Keep total duration unchanged."*
- 리뷰 요청: *"Identify three most significant defects. Make one focused revision pass. Keep agreed copy, duration, format."*

### 2-7. 검증 — 그들도 눈으로 본다

- 첫 렌더는 실패한다. Kingy 실측: 겹침·작은 글자·불필요한 00:10 타이머 → 수정 사이클 후 통과. **원패스 아님.**
- 프레임 검사 위치: 오프닝 · 전환 · **마지막 프레임**. 8초@30fps 의 마지막 프레임은 **7.967s** 다 — 8.0s 로 찍으면 놓친다.
- 3게이트 (hyperframes-kit): 스튜디오 프리뷰 사인오프 → 드래프트 렌더 + ffmpeg 프레임 추출 → 최종 렌더.
- 수치 확인: 해상도·fps·**프레임 수**·길이·오디오 유무. 우리 `qc.mjs` 와 같다.
- 렌더 후 **오디오를 전사해 대본과 대조** (Nate Herk 50분 영상 사례) — 잘린 타이틀·대사 위 SFX 를 잡는다.

### 2-8. Astra 를 끝까지 일하게 하는 문장 (OpenAI 공식 가이드)

Astra 는 기본값이 "되묻고 멈추는" 쪽이다. 공식 가이드가 준 문장 (원문):

- *"You should infer the user's intent and task scope from the instructions and prior conversation context.
  Your job is to bias towards action and carry the user's intended task to completion."*
- *"When the user's prompt indicates a request for action, such as 'can you...', 'I want to...', 'help me...'
  and similar expressions, treat these as instructions to do the work and take action."*
- *"The user's instructions take precedence over guidelines provided in a skill."* — 스킬 파일이 충돌하면 멈춘다. 멈추면
  *"name and link to the exact SKILL.md file you read"* 로 범인을 찾는다.
- 범위를 말하라: "implement and verify locally" vs "just plan". 안 하면 다음 메시지를 기다리며 선다.
- 추론 단계는 **medium 기본**, 실패 증거가 있을 때만 올린다. 3D·긴 작업은 예외.
- 산문을 원하면 명시. 금지어 목록: delve · leverage · it's worth noting · Bottom Line: · "X, not Y" 프레이밍 · 지어낸 하이픈 복합어.

### 2-9. 커뮤니티 실측 메모

| 출처 | 관찰 |
|---|---|
| petergostev (X) | **처음부터 만들기보다 다듬기.** 제로베이스 생성은 "pretty aggressively mid" |
| MindStudio | godly.design · 21st.dev · Awwwards 컴포넌트를 **레퍼런스로 주면** 확 좋아진다 |
| 클리앙 · 더쿠 | SVG·복셀·3D 압도적. **프런트·디자인은 약점** |
| dcinside AI활용 | "Sol 은 바닥 보장, Astra 는 잘못 쓰면 끝없이 망가짐". Max 등급 5시간 한도가 5분에 소진 |
| @freddier (X) | Medium 이 코덱스 $200/월 예산을 **12시간**에 소진 |
| Chase AI 비교 | 모션그래픽 테스트(외부 도구 오케스트레이션) Astra vs Fable 5.1 **무승부** |
| Reddit | $200/8시간, 4작업 중 3실패. 2시간 넘는 작업은 반복이 어렵다 |

가격 $10/$50 per M 토큰 · 컨텍스트 1.05M · 추론 5단계(Light~Ultra) · Plus 순차 배포 · **ChatGPT 에서 고른 모델이 Codex 에 자동 적용되지 않는다.**

---

## 4. 프롬프트 — 원문과 우리용 번안

### 4-A. Kingy 스타터 (8초 · 원문)

```
Use the installed HyperFrames skills to create and render an eight-second motion graphic introducing
Astra in Codex. Create the project inside a new folder named astra-motion.
Exact copy: 'Astra' 'in Codex' 'Turn ideas into motion.'
Output: 1920 × 1080, 30 fps, exactly 8 seconds (240 frames), silent opaque MP4, editable source.
Design: Background #111111, main text #F4F1EA, accent #B8FF65, bold sans-serif, large typography,
100-pixel edge safety.
Choreography: 0.0–1.2s—thin green line expands from center, becomes reveal mask for 'Astra'.
1.2–2.5s—'in Codex' appears beneath with upward movement. 2.5–5.5s—green line travels across,
reveals 'Turn ideas into motion.' 5.5–8.0s—hold final composition.
Use controlled deceleration and crisp masked reveals.
I authorize creating, editing, and locally rendering this project. Make routine design decisions and
state assumptions. Build animation, run framework checks, inspect opening/transitions/final frame,
render MP4 locally, verify dimensions/frame rate/frame count/duration/audio absence.
Deliver video, editable source, preview image, and change instructions.
```

구조: 정확한 문구 → 출력 규격 → 디자인 토큰 → **초 단위 안무** → 권한 부여 → 검증 항목 → 산출물.
"I authorize…" 와 "Make routine design decisions" 가 Astra 의 되묻기를 끈다.

### 4-B. 세로 키네틱 타이포 (Kingy · 원문)

```
Use HyperFrames to create and render a ten-second kinetic typography video.
Exact copy: 'Too many moving parts.' 'One clear direction.'
Format: 1080 × 1920, 30 fps, silent MP4.
Design: warm white background, near-black bold text, cobalt accent.
0–4s: Reveal first phrase with words moving on competing paths, 1.5s+ readable hold.
4–7.5s: Align words vertically, reveal second phrase. 7.5–10s: Hold final composition.
Express disorder-to-coordination through motion. Inspect at phone size, render, deliver editable source.
```

### 4-C. HyperFrames 검증 프롬프트 (원문 발췌 — 세로·숫자·문구 교체)

**세로 소셜 훅**
```
9-second 1080x1920 vertical video, charcoal background. Social-style hook: "nobody talks about this"
types on center in bold white, then each following phrase replaces it on a hard cut every 1.5s —
"it's not your code", "it's your prompts", "here's the fix" — with yellow highlight bars behind key
words, alternating tilt. Last phrase holds with arrow-down bounce. No audio.
Spectacle beat: Final phrase is the payoff — slams in at 1.35× with three-frame shake and chromatic
split that resolves fast.
```

**숫자 카운트업**
```
6-second 1920x1080 video, dark navy background. Beat 1 (0-1s): label "ARR" fades up small, top-center.
Beat 2 (1-4s): giant number counts up to $4.2M with odometer roll, easing out as it lands.
Beat 3 (4-6s): "+312% YoY" stamps in below in green, then everything settles into gentle ambient idle
(subtle breathing scale, slow particle drift). No narration.
Spectacle beat: On the land at 4s, ~60 paper money notes erupt from behind the numeral and flutter
down, settled by 5.5s — the one exaggeration.
```

**단어 교체 헤드라인**
```
8-second 1920x1080 video, white background. Static sentence "Make it ___." in huge black type stays
centered while the blank cycles through "faster", "simpler", "yours" — each swap flips vertically like
a split-flap board, 1.5s apart, with slight blur on motion. Final word "yours." lands in orange and
the period pops. No audio.
Spectacle beat: Last swap lands hardest — that word arrives 1.3× behind a motion-blur streak.
```

**비교 차트 (Kingy)**
```
Create and render an eight-second HyperFrames chart animation. Title: 'Completed projects.'
Before: 18, After: 27, statement: '50% increase,' persistent label: 'Illustrative data.'
0–2s: Reveal title, grow Before bar to 18. 2–4s: Grow After bar to 27. 4–5.5s: Reveal '50% increase.'
5.5–8s: Hold complete chart. Use shared zero baseline, proportional heights, stationary labels.
Verify values and percentage. Render and deliver editable project.
```

**세로 페이스리스 설명 영상 (나레이션 있음)**
```
/faceless-explainer Turn this into a ~60-second 1080x1920 vertical explainer: [text].
One idea per scene, big typography, diagrams over stock footage, brand color #FF5533 on off-black.
Male TTS voice, calm. Embedded captions, keywords highlighted in the brand color.
Spectacle beat: final CTA's key phrase slams in at 1.5× with chromatic split that resolves in 0.2s.
Every other scene stays typographically calm.
```
길이에 `~` 를 붙인다 — 나레이션 단어 수가 실제 길이를 정하므로 정확한 초는 억지 트리밍을 부른다.

**로고 리빌 (Kingy — 다이소 기법의 원형)**
```
Use attached logo to create and render six-second brand reveal. Inspect logo first.
Choose one line, shape, or alignment to motivate motion. Preserve final geometry, proportions, colors.
0–1s: Introduce geometric motif. 1–3.5s: Reveal complete logo. 3.5–6s: Hold logo with tagline [TAGLINE].
Use restrained motion and precise alignment. Verify over light and dark backgrounds.
```

### 4-D. 다이소식 로고 모티프 — 우리 번안 (잘살아보세 로고, 한국어)

`resources/brand/` 로고를 붙이고 Codex/Claude 에 준다. 여섯 부분 골격 그대로.

```
[Route] 모션그래픽. 나레이션 없음. 렌더까지 하고, 통상적 디자인 결정은 네가 내리고 가정을 적어라.
[Spec] 1080×1920, 60fps, 정확히 12초(720프레임), 무음 MP4 + 편집 가능한 소스.
[Technique] 첨부한 로고를 먼저 살펴라. 로고 안의 기하 요소 하나(원·선·정렬)를 골라 그것이
  영상 전체의 모션 모티프가 되게 하라 — 흩어진 상태 → 전환을 실어 나르는 거대형 → 프레임 장식 → 엔드카드 귀환,
  최소 네 번 변주한다. 로고의 최종 형태·비율·색은 바꾸지 마라.
  색은 브랜드색 + 흰색 둘뿐. 강조는 세 번째 색이 아니라 배경 반전·스케일·회색↔검정 스왑으로.
  상단 좌우·하단 좌우 크롬(캠페인명·마감일)은 12초 내내 고정하고 가운데 요소만 교체한다. 화면 전체 크로스페이드 금지.
  같은 컷 안의 두 요소는 시작·끝 시각을 공유하지 않는다 (장식이 먼저 나가고 글자가 남는다).
[Copy] 화면 문구 원문: "잘살아보세" / "매주 2만 원" / "이번 주 마감". 이 밖의 문구를 만들지 마라.
[Beats]
  0.0–1.0s  모티프(예: 원)만 단독 등장. 스케일 오버슈트 8% 후 정착.
  1.0–3.5s  모티프가 늘어나고 갈라지며 "잘살아보세" 를 드러낸다 (마스크 리빌). 글자는 어절 단위 스태거 70ms 안팎, 간격을 불규칙하게.
  3.5–7.0s  같은 모티프가 숫자 판이 되어 "매주 2만 원" 카운트업. 숫자는 오버슈트 금지.
  7.0–9.5s  모티프가 붉게 바뀌며 "이번 주 마감" 스탬프 — 이것이 유일한 과장 순간(셰이크 3프레임, 플래시).
  9.5–12.0s 로고 완성형으로 복귀. 정지하지 말고 브리딩 ±0.5%, 느린 드리프트로 홀드.
[Negatives] 블러·글로우·모션블러 없음. 라이브러리 파티클 없음(시드 난수 직접). 로고 색 변경 없음.
  이모지 ZWJ 조합 없음. 한글 받침이 잘리지 않게 lineHeight 명시, overflow hidden 금지.
[Verify] 프레임 0·60·210·420·570·719 를 PNG 로 뽑아 잘림·겹침을 확인하고, 해상도·fps·프레임 수·무음을 수치로 보고하라.
```

### 4-E. Remotion 소셜 릴 템플릿 (claude-code-handbook · 원문)

```
Create 15-second video at 1080x1920, 30fps.
Background: gradient [color1]→[color2].
0–3s: Hook text "[TEXT]" spring bounce, 72px white, centered.
3–8s: Three points slide up one by one with 1.5s gaps.
8–12s: Big stat scales in, context text fades below.
12–15s: CTA pulses (1.0→1.03), handle/URL fades in.
```
Remotion 쪽 반복 지시 예: *"make the beam pulse twice"* · *"delay the second logo by 12 frames"* · *"at frame 417 replace text with typing animation instead of fade"*.

### 4-F. 수정·리뷰·검증 (Kingy · 원문)

```
At 0:03.2, headline and chart compete. Let chart finish, then reveal headline 0.4s later.
Recover time from decorative movement. Keep total duration unchanged.
Inspect and re-render affected sequence.
```
```
Review motion graphic for readability, hierarchy, and message communication.
Identify three most significant defects. Make one focused revision pass using timing, spacing,
scale, or movement changes. Keep agreed copy, duration, format, and brand assets.
```
```
Check the actual exported file against brief.md. Verify duration, dimensions, frame rate, video codec,
audio presence, and whether the complete file decodes without errors. Inspect frames at the opening,
ending, and significant cut points. Report separately: technical checks performed and their results;
visual or audio checks performed; anything still requiring human playback review.
```

### 4-G. 우리 파이프라인용 컷 브리프 — ④ 디자인 단계에서 씬을 쓰기 전에 채운다

cuts.json 한 컷을 Remotion 씬으로 옮길 때, 코드를 치기 전에 이 여섯 줄을 먼저 쓴다.
비어 있는 줄이 있으면 씬을 쓰지 않는다.

```
컷 cut-07 · 2.6s (156f) · 앵커 컷 · 유닛 3
문구   "매주 2만 원" (headline) / "온누리 앱에서" (text 자막 청크)
비트   0.00s 배지 pop(340/22) → 0.35s 금액 카운트 시작 → 1.72s 발화 "만 원" 강세에 착지 펀치(500/28) → 2.47s 퇴장 시작
포컬   금액 판 (kit.AmountPanel) — 서포트 배지·밑줄은 60~90ms 늦게, 시작·끝 시각 겹치지 않게
모티프 훅의 X 도장 색을 배지 테두리로 콜백
움직이는 이유  카운트업 = 변화 자체가 정보 / 착지 펀치 = 강세 음절 주의 유도
금지   블러·글로우·라이브러리 파티클·높이 애니메이션·overflow hidden
```

---

## 6. 모션 에셋 후보 — 정보 종류 ↔ 모션 사전 (2026-09-08, abm-a3 세션 요청으로 정리)

디자인 키트(`kit.tsx`)처럼 **모션도 이름 붙인 원자로 쌓는다**는 방침에 맞춘 목록이다. 조건: 60fps · 1080×1920 · 결정론(프레임 순수 함수) ·
비트 프레임은 whisper 온셋에 고정(옮기지 못한다 → 모션은 **앵커 프레임 기준 상대 정의**) · 팔레트 고정 · 블러·글로우 금지.
프레임 수는 60fps 기준. 이징은 `11-motion.md` 스프링 프리셋으로 표기 (730/33 등장 · 500/28 펀치 · 340/22 대형).

**근거 등급**: ⓜ = 다이소·타이포 영상 프레임 실측 · ⓓ = HyperFrames 공식 검증 프롬프트/규칙(그들이 렌더해 확인, 나는 영상을 못 봄) · ⓘ = 커뮤니티 인상.

| # | 에셋 | 무엇 | 맞는 정보 | 프레임·이징 (앵커 = 강세 온셋) | 쓰면 안 되는 자리 | 근거 |
|---|---|---|---|---|---|---|
| M1 | **오버플로 펀치** | 숫자·단어가 프레임을 넘치게 커진 상태로 시작해 제자리 크기로 정착 | 숫자 최초 공개 · 마감·경고 | 앵커 −6f 에 scale 1.8~2.2 → 앵커에서 340/22 로 1.0 정착(22f, 오버슈트 9%) | 조건·단서 · 자막 밴드 · 영상당 3회 초과 · 값이 아닌 글자 크기만 (데이터 오버슈트 금지) | ⓜ 1.0s·7.0s·7.5s |
| M2 | **색면 반전** | 콘텐츠 밴드 배경을 브랜드색↔크림으로 하드 스왑, 글자색은 같은 프레임에 역전 | 상태 전환(손실→이득) · 섹션 경계 · 마감(→관보레드) | 0f 하드컷 또는 6f 세로 와이프(expo-out). 앵커 = 스왑 프레임 | 36초에 5회 초과 · 어절 중간 · 상단·하단 고정 밴드 | ⓜ 2.0·3.5·7.0·8.0s |
| M3 | **잉크 스왑** | 한 문장을 두 토막으로 두고, 강세 온셋에 잉크(진초록/검정)와 회색을 맞바꾼다. 이동 0 | 조건·단서(조건 토막을 회색으로 두다 잉크로) · 비교(강조 이동) · 목록(현재 항목만 잉크) | 0f 또는 6f 색 보간. 앵커 = 스왑 프레임 | 숫자(숫자는 회색 금지) · 자막 밴드(이미 1어절 토큰색) | ⓜ 3.5→4.0s |
| M4 | **자간 수축** | 단어가 자간 +0.35em 으로 들어와 0 으로 조여지며 정착 | 상태 전환(준비→완료) · 헤드라인 등장 | 18f expo-out. 앵커 = 정착 프레임. `white-space: nowrap` 필수 | 숫자(tabular 정렬 깨짐) · 컷당 1회 초과 · 첫 3초 등장용 | ⓜ 5.0→5.25 · 6.0→6.25s |
| M5 | **슬롯 롤** | 항목이 세로로 밀려 올라가며 다음 항목이 들어온다. 부제(영문/보조어)는 같은 프레임에 교체 | 목록(사용처·카테고리 ≤5) · 비교(옵션 순회) | 항목 이동 15f expo-out · 항목 노출 ≥72f(1.2초, 나레이션 규칙). 앵커 = 항목 온셋 | 숫자 동시 변화 · 글자 상자 `overflow:hidden`(받침 잘림 — 패딩 준 래퍼에서만 클립) | ⓜ 5.5~6.75s (무나레이션이라 0.25초/항목) |
| M6 | **비트 펄스 교대** | 연속 비트마다 거대(프레임 초과)↔정상 크기를 하드 교대 | 빠른 나열 ≤4 · 반복 강조(매주·매주) | 상태당 15f, 전환 0~4f. 앵커 = 각 비트 | 나레이션 컷(항목당 1.2초 필요) · 훅 · 영상당 1회 초과 | ⓜ 7.0~7.75s |
| M7 | **요소별 시차 퇴장/등장** | 장식이 먼저 나가고 글자가 남는다. 등장은 글자(포컬) 먼저, 장식 +6~10f | 전 컷 공통 규칙 | 퇴장: 장식 컷−20f, 글자 컷−8f. 등장: 포컬 0f, 서포트 +6/+10/+8f 불규칙 | 숫자를 자막 청크보다 먼저 퇴장 · 두 요소가 같은 프레임에 시작·끝 | ⓜ 3.25s · ⓓ motion 규칙 3 |
| M8 | **모티프 릴레이** | 로고의 기하 요소 하나가 흩어짐 → 전환 캐리어(거대 스윕) → 프레임 장식 → 엔드카드로 네 번 변주 | 브랜드 연속성 · 컷 전환 캐리어 · 콜백 | 스윕 24f expo-out 프레임 가로지름. 장식은 P5 드리프트 공유 | 자막 밴드 위 · 액체 합체(블러 필터 필요 — 금지) | ⓜ 0~10s 전체 |
| M9 | **자릿수 분해** | 날짜·큰 수를 자릿수 그룹별 비트로 쪼개 순차 공개 (2026 → 09 → 30) | 마감(연·월·일 3비트) · 큰 숫자 도입 | 그룹당 하드컷, 나레이션이면 각 음절 온셋 | 금액(원 단위 분해 금지) · 자막 | ⓜ 0~1.0s |
| M10 | **정착 + 표류 홀드** | 엔드카드 요소가 스프링으로 정착한 뒤 장식만 느리게 표류 | 마지막 컷 · 루프 컷 | 정착 15f 730/33 · 표류 ±4px/3.6s sine (= moving hold) | 텍스트 단독 표류 · 화면 전체 동기 호흡 | ⓜ 8.0~9.75s · `11-motion` |
| M11 | **크롬 상시 마감** | 캠페인명·마감일·한도를 상단/하단 고정 밴드에 작은 캡션으로 10초 내내 | 마감·경고 · 조건 한 줄 | 모션 없음(그라운드). 마감일 변경 시 M2 와 같은 프레임 | 자막 밴드 · 콘텐츠 밴드 | ⓜ 크롬 4곳 |
| M12 | **하이라이트 바** | 키워드 뒤에서 색 바가 scaleX 0→1 로 와이프, 등장마다 기울기 ±2° 교대 | 조건·단서(크림 밑줄과 같은 역할) · 헤드라인 키워드 | 12f expo-out, transformOrigin left. 앵커 = 완료 프레임 | 5자리 이상 숫자(바가 너무 넓음) · 자막 밴드 · 컷당 2회 초과 | ⓓ vertical social hook |
| M13 | **분할 플랩 교체** | 문장 틀은 고정, 빈칸 단어만 세로로 뒤집혀 교체 (rotateX) | 비교(같은 틀에 값만) · 상태 전환 · 목록 ≤3 | out 12f power2-in → in 12f back-out. 앵커 = 새 단어 도착 | 폭이 다른 숫자(tabular + 고정폭 필수) · 블러 잔상(금지) | ⓓ word-swap |
| M14 | **공유 기준선 바 성장** | 막대가 0 에서 자라고 라벨은 제자리, 시작을 스태거 | 비교 · 합산(스택) | 막대 36f expo-out, 스태거 12f, 값 라벨은 카운트업. `scaleY` + origin bottom (height 애니 금지) | 막대 높이 오버슈트(데이터) · 기준선 다른 두 막대 | ⓓ chart prompt · `kit` 규율 |
| M15 | **디바이더 와이프** | 세로 분할선이 좌→우로 쓸며 전(어수선)→후(정리) 상태로 바꾼다 | 비교(before/after) · 상태 전환 | 24f power3-inOut. 양쪽 상태는 첫 60f 안에 정착. 선은 플랫 6px | 훅(두 상태가 보여야 함) · 스캔라인 블룸(금지) | ⓓ before/after split |
| M16 | **링 프로그레스** | 링이 0→360° 그려지고 숫자가 정확히 동행, 100% 에 스탬프 | 조건·단서(한도 대비) · 마감(남은 기간) · 합산(누적) | 60~120f, 데이터는 선형~약한 ease-out. 완료 스탬프는 P3 340/22 | 링이 실제 값을 넘기는 오버슈트 · 블룸 플래시 | ⓓ loader→reveal |

이미 `11-motion.md` 에 있는 것(P1 카운트업+착지 · P3 스탬프 · P4 스태거 · P5 카메라 · P6 그라운드 · P7 플로우 릴레이 · P12 홀드)은 중복하지 않았다.
Astra 쪽에서 새로 확인된 규칙 하나만 P1 에 덧붙인다: **데이터 값은 절대 오버슈트하지 않는다** — 펀치는 크기(scale)로, 값은 정확히 착지.

### 정보 종류 → 모션 사전

| 정보 | 1순위 | 2순위 | 금지 |
|---|---|---|---|
| 숫자 (최초 공개) | M1 오버플로 펀치 → P1 카운트업+착지(5자리+) / P3 스탬프(%·4자리 이하) | M9 자릿수 분해 | 회색 처리 · 값 오버슈트 · 자간 애니 |
| 비교 (전/후 · A vs B) | M15 디바이더 와이프 · M14 공유 기준선 | M3 잉크 스왑(강조 이동) · M13 분할 플랩 | 두 값이 다른 기준선 · 동시 등장 |
| 합산 (누적 · 매주→총액) | P1 카운트업 + M14 스택 | M16 링 프로그레스 · P7 플로우 릴레이 | 합계가 항목보다 먼저 |
| 마감·경고 | M2 색면 반전(→관보레드) + M1 펀치 on 날짜 | M9 연·월·일 3비트 · M11 크롬 상시 | 흔들림 남발(대형 임팩트 예산 4회) · 없는 마감 |
| 조건·단서 | M3 잉크 스왑(회색→잉크) · M12 하이라이트 바 | M16 링(한도) | M1 펀치 · 스케일 강조 (조건은 작게, 정확히) |
| 상태 전환 | M2 색면 반전 | M4 자간 수축 · M13 분할 플랩 | 전체 프레임 크로스페이드 |
| 목록 | M5 슬롯 롤(≤5, ≥1.2초/항목) · P4 스태거 | M6 펄스 교대(≤4, 무나레이션만) | 글자 단위 타자기 · 항목 6개+ |
| 브랜드·콜백 | M8 모티프 릴레이 · M10 정착+표류 | 루프 컷(`11-motion` 훅 규격) | 자막 밴드 침범 |

### 하지 말 것 — 레퍼런스에 흔하지만 정보형 세로 숏폼에서 역효과

| 레퍼런스에서 흔함 | 왜 빼나 |
|---|---|
| 블러 휘프·모션블러·글로우·크로매틱 스플릿·RGB 셰이크 (HyperFrames 스펙터클 비트 단골) | 사용자 금지(2026-09-04) + 1080×1920 폰 화면에서 가독성 손실 |
| 10초당 18컷 밀도 (다이소) | 무나레이션 비트 스팟 전용. 나레이션 숏츠는 요소 노출 ≥1.2초, 10초당 5~7회. 밀도는 **컷 안 마이크로 비트**(M1·M3·M4)로 |
| 액체·메타볼 원 (다이소 2~3초) | SVG 블러 필터 필요 → 금지 목록 |
| 글자 단위 타자기·문자 스태거 | hyperframes-kit 도 어절 단위만 권장. 한글 음절 블록은 더 느리게 읽힌다 |
| 데이터 값 바운스 (숫자·막대 오버슈트) | HyperFrames 규칙 5 "never let data overshoot its actual value" |
| 검정 90% 캔버스 + 크롬 그라디언트 텍스트 + 할로 | 잘살아보세 팔레트와 충돌, 글로우 금지 |
| 전체 프레임 크로스페이드 · 하드컷 대신 블러 전환 | 슬라이드 느낌의 주범(P6). 색면 하드 스왑(M2)은 괜찮다 |
| 앰비언트 파티클 · 라이브러리 파티클 | 비결정론(ticker) · 정보 없는 순간의 소음. 버스트는 `Burst.tsx` 로 정보 확정 순간에만 |
| 세 번째 강조색 | 팔레트 5색 고정. 강조는 반전·스케일·잉크 스왑으로 |
| 글자 상자 `overflow:hidden` 클립 (슬롯 롤 구현 시 유혹) | 한글 받침 잘림 실사고(`11-motion` 키트 규율) |
| 스펙터클 2회+/10초 | "one exaggerated moment" — 나머지는 절제해야 그 하나가 산다 |

---

## 5. 출처

**스레드** — @ssaengcho `Dc8NAi3GsRj` · `Dc8NBGNGjKH`(다이소, 사용자 제공 `threads.com/share/_ises41qw`) · `Dc_Ie3fE8oy` ·
@prompt_what `Dc2J13QigOE` · @choi.openai `Dc3EZU-D2H2` · `Dc6DLf5DwS_` · @unclejobs.ai `DXT0f9sk8tI` · @bravomylife153 `DXWeLlSifAm` ·
@alex_ai_mcp `DV5Eamxkd-x`. @ssaengcho 2건은 프레임·댓글까지, 나머지는 본문만.
프레임 시트: `docs/experiments/astra-ssaengcho/`.

**공식** — OpenAI GPT-6 Astra 발표 `openai.com/index/gpt-6-astra` · 프롬프팅 가이드 `developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra` (한국어 요약: discuss.pytorch.kr/t/openai-gpt-6-astra/11846) ·
HyperFrames 문서 `hyperframes.heygen.com/prompting/{anatomy,motion,specification-dial,vocabulary,visual-specs,motion-graphics,iterating,storyboards,explainers,captions-catalog,rules-and-anti-patterns,recreating-references,examples}` ·
`guides/gsap-animation` · `guides/hyperframes-vs-remotion` · GitHub `heygen-com/hyperframes` (skills: hyperframes · motion-graphics · faceless-explainer · hyperframes-animation · hyperframes-creative) · `remotion-dev/skills`.

**가이드·실측** — Kingy AI `astra-codex-motion-graphics-guide-prompts` · `astra-codex-video-editing-guide` · `campaign-breakdown-codex-motion-graphics-ai-coding` ·
hyperframes-kit (`aaronpie/hyperframes-kit` — MOTION_PHILOSOPHY.md 11법칙 · CLAUDE.md 렌더 계약) · `heygen-com/hyperframes-launch-video/STORYBOARD.md` ·
MindStudio `gpt-6-astra-design-websites` · `gpt-6-astra-video-editing-agent` · `gpt-6-astra-prompting-tips` · the-decoder 슬롭 워드 기사 ·
onewave-ai `hyperframes-video-as-code` · ThamJiaHe `claude-code-handbook` Remotion 가이드 · buldrr · pandaitech · Chase AI 비교 · thecreatorsai ·
codex.danielvaughan.com Astra CLI 설정 · statisticsplaybook `gpt-6-astra-use`.

**커뮤니티** — promppy 1446860 · 1497066 · 1413138 · 1504401 · 클리앙 park/19258735 · dcinside ai_utilize/57739 · dcbest/460919 · Reddit r/artificial 1w9or91.
