# 숏츠·릴스 — 최우선 목표

**이 프로젝트의 1순위는 숏폼이다.** 리서치 기준 2026-08.

목표는 하나다. **사람들이 계속 보게 만드는 것.**
**첫 프레임부터 핵심을 모두 보여주고, 재생 즉시 강한 주연 동작으로 시작한다.** 현행 제작·검수 기준은 공용 video SKILL 맨 앞 「최우선 — 첫 1·2·3초」다(가이드 전체에서 가장 중요한 규칙). 아래 과거 리서치 수치는 참고 자료이며 창작 상한·합격선으로 적용하지 않는다.

---

## 0. 왜 숏폼이 최우선인가 — `03-strategy.md` 와의 관계

`docs/03-strategy.md` 는 **"쇼츠는 유입 장치이지 수익원이 아니다"** 라고 못 박았다. 그 판단은 지금도 맞다.
조회당 단가는 롱폼이 50~250배 높다. **숏폼 광고수익만 보면 적자다.**

그럼에도 숏폼이 1순위인 이유는 수익이 아니라 **속도**다.

| | 숏폼 | 롱폼 |
|---|---|---|
| 제작 회전 | 하루 여러 편 | 편당 수일 |
| 피드백 루프 | **즉시** (Stayed to watch로 바로 안다) | 느리다 |
| 신규 유입 | **강하다** | 약하다 |
| 수익 | 낮다 | 높다 |

**숏폼으로 모으고 롱폼·제휴·상품으로 회수한다.** 이 구조가 아니면 숫자가 안 맞는다 —
그건 `03-strategy.md` 가 이미 계산해뒀다. 숏폼을 최우선으로 만들되 **회수 경로를 반드시 함께 설계하라.**

> 숏폼은 **유입 엔진이자 학습 장치**다. 수익 모델이 아니다.

---

## 1. 첫 화면·첫 동작 — 시작부터 전력을 쓴다

### 근거 — 확인된 것만 (2026-10-03 재검증)

공식 안내·지각 연구·쓰지 않는 수치는 [근거 장부 H02](channel/07-evidence.md)에 있다. 2026-09-04 표에 있던 "3초 스와이프 이탈률 <15% 최상·>35% 훅 실패"(Prepublish 자체 주장)와 "틱톡 사용자 71%가 3초 내 결정"은 원 출처를 찾지 못해 지웠다. 무음 시청 "모바일 92%"는 Verizon Media × Publicis 2019 자기 보고 설문(n=5,616)이다. 플랫폼 기본값이 아니며 릴스·틱톡은 기본 소리 켬이다. 그래서 소리를 켠 시청을 기본으로 하되 그림과 자막만으로도 뜻이 통하게 만든다.

### 현행 규칙 — 정본은 video SKILL 「최우선 — 첫 1·2·3초」

합격 조건·6원칙·실행(README 「첫 3초 비트」 → `hook-check`)은 그 절에만 둔다. 여기에 다시 쓰지 않는다.

ABMEN 대사 문체는 `docs/channel/04-format-voice.md` §2~3(영어, 질문은 내용에 맞게 선택)을 따른다. 이 문서의 옛 라디오 어조·`-요` 종결·질문형 금지는 ABM 기록이다.

### §1-2. 데드에어 — 침묵은 출구 램프다 (2026-09-04 신설)

시청자는 무음 정체와 버퍼링을 구별하지 못한다. 버퍼링은 **시작 2초 지연부터 이탈이 시작되고
1초마다 +5.8%p** [학술, Krishnan & Sitaraman ACM IMC 2012, n=670만 — 버퍼링 연구의 유추임].
한국어 청자의 대화 반응 기대치는 **182ms**, **600ms부터 침묵이 부정 평가를 단조 증가**시킨다
[학술, Stivers 2009 PNAS · Lee 2025 말소리와 음성과학].

| 구간 | 상한 |
|---|---|
| 문장 사이 (컷 내부) | **120~250ms** |
| 컷 경계 순수 무음 | **≤300ms** (다음 컷 화면이 이미 떠 있으면 체감 완화) |
| 절대 상한 | **600ms** |
| **발화 점유율** | **≥90%** (의도된 홀드 제외) |

**규칙: `dur` = 컷 음성의 실측 발화 끝 + 0.13초 (4프레임).** 남는 시간을 `dur` 로 흡수하지
마라 — TTS 자연 낭독은 문장 끝 휴지가 이미 590ms(중앙값)라 그대로 두면 임계선이다.
실측은 `ffmpeg silencedetect` 로 컷별 음성의 발화 끝을 잰다 (00002 사례: 36.1초 → 25.8초, 점유율 64%→90%).

### `cuts.json`의 전개 예시

```
시작      HOOK    핵심이 모두 보이는 강한 구도 + 즉시 시작하는 주연 동작
본문      PROOF   결과의 근거·방법·조건을 객체와 구도의 변화로 전개
끝        PAYOFF  결론·소재별 유머/꽁트. 자연스러우면 첫 장면과 연결
```

핵심 공개는 0초부터다. 발화 길이·컷 길이는 실제 대사와 동작에 맞추며 훅을 정해진 음절 수나 인사 순서에 끼워 맞추지 않는다.

---

## 2. 소리 없이도 전달돼야 한다

**85% 가 소리를 끄고 본다.** 자막과 헤드라인은 보조가 아니라 본체다.

- 키네틱 자막(`kineticLines()`) — 단어가 하나씩 들어온다. 시선이 머물 이유를 계속 만든다
- 진행 바(`progressBar()`) — 얼마 남았는지 보이면 이탈이 준다
- 숫자·체크리스트·전후 비교처럼 **읽지 않아도 읽히는** 형태

⚠️ 자막은 **`bottom: 470px` 아래로 내리지 마라.** Reels 는 캡션·오디오 표시가 하단 430px 까지
올라온다. 정확한 수치는 `docs/09-safezone.md`.

---

## 3. 루프 — 재시청이 가장 강한 신호다

끝 프레임이 첫 프레임으로 자연스럽게 이어지면 시청자는 **자기도 모르게 다시 본다.**
재시청은 숏폼 배포에서 가장 강한 신호 중 하나다.

**마지막 컷의 `image` 를 첫 컷과 같은 장면·같은 각도로 쓴다.** 조명이나 소품만 살짝 바꿔
"시간이 흐른 같은 자리"로 만들면 이어지는 느낌이 강해진다.

**문자 그대로 같을 필요는 없다. 개념적으로 이어지면 된다.**
마지막 한 마디가 첫 장면의 의미를 바꾸면 가장 좋다.

---

## 4. AI 클립 워크플로 — 우리 자산 기준

가용 자산은 `04-tools.md` §0 에 있다. **영상 생성 쿼터가 병목**이므로 아껴 쓴다.

### 핵심: image-to-video 로 일관성을 잡는다

**GPT Image 의 강점이 일관성이다.** 그리고 Kling·Veo 는 **첫 프레임을 주면 그 톤을 유지**한다.
이 둘을 붙이면 쿼터를 적게 쓰면서 일관된 룩을 얻는다.

```
① GPT Image 로 첫 프레임 생성      (쿼터 부담 낮음, 일관성 강점)
② 그 이미지를 Kling/Veo 에 넣어 image-to-video   (5~6초가 스위트스팟)
③ projects/<프로젝트>/assets/clips/<컷id>.mp4 에 저장
④ 사용자가 조립할 때 컷에 얹는다
```

**text-to-video 로 매번 새로 뽑으면 컷마다 룩이 달라지고 쿼터도 빨리 마른다.**

### 생성 시 지킬 것

- **처음부터 9:16 으로 생성한다.** 16:9 를 나중에 크롭하면 구도가 망가진다
- 프롬프트 구조: **주체와 동작 → 카메라 움직임 → 조명·분위기 → 스타일**
- "무엇을 유지할지"를 명시한다 (제품 형태·의상·구도)
- 클립은 5~6초. 길게 뽑을 이유가 없다 — 어차피 1.5~2초마다 전환한다

### 클립을 안 만들어도 되는 컷이 많다

**모든 컷을 i2v 로 돌리지 마라.** 정지 이미지로 충분한 컷은 그대로 넘기고
조립할 때 팬·줌을 넣으면 된다. 컷 하나 = 크레딧 8개다.

움직임이 값을 하는 곳은 **훅(첫 컷)과 마지막 루프**다. 거기부터 쓴다.

---

## 5. 만드는 순서

```bash
pipeline/new.sh 도메인구입                    # → projects/00001-도메인구입/ (+ motion/ 골격)
# cuts.json 에 컷·대사·자막을 쓴다

node pipeline/tts.mjs 1 --measure             # 말이 dur 에 들어가나 (무료 say)
node pipeline/tts.mjs 1                       # 목소리 (기존 파일 재사용)
pipeline/narration.sh 1 && pipeline/render.sh 1   # 모션 경로: 나레이션 → 렌더 → output/…/render.mp4

# AI 실사 레거시: node pipeline/prompts.mjs 1 → 9칸 격자 승인 → 컷별 이미지 → 움직일 컷만 i2v → node pipeline/export.mjs 1
```

**`--measure` 를 먼저 돌려라.** 무료 `say` 로 길이만 재므로 타입캐스트 한도를 쓰지 않고
`dur` 를 맞출 수 있다. 확정된 뒤에 실제 합성으로 간다.

`projects/<프로젝트>/README.md` 에 **훅 3안 · 확인할 사실 · 업로드 기록**을 남긴다.
`new.sh` 가 그 틀을 만들어 둔다.

---

## 6. 길이와 속도

| | |
|---|---|
| **영상 길이** | **30초 ~ 1분** |
| **말 속도** | **보통보다 50% 빠르게** |
| 컷 길이 | 2~3초 |

`export.mjs` 가 총 길이와 컷 수를 타임라인에 찍어 준다.

### 왜 빠르게 말하는가

느린 말은 그 자체가 이탈 사유다. 숏폼 시청자는 **정보 밀도**에 반응한다.
빠른 말은 "이 사람 뭔가 아는구나"로 읽히고, 느린 말은 스크롤을 부른다.

속도는 `cuts.json` 의 `voice.speed` 가 정한다(기본 `1.5`).
TTS 원본을 만든 뒤 `atempo` 로 조정하므로 **음정은 그대로**다.

```json
"voice": { "speed": 1.5 }
```

### ⚠️ 길어졌다고 내용을 더 넣지 마라

30초~1분으로 늘어난 건 **한 메시지를 제대로 전달할 시간**을 준 것이지
포인트를 더 넣으라는 뜻이 아니다.

```
❌ 30초에 팁 6개를 욱여넣는다      → 아무것도 안 남는다
✅ 30초 동안 한 가지를 각인시킨다   → 그거 하나는 남는다
```

**한 영상 = 한 메시지.** 곁가지가 생각나면 그건 다음 영상이다.
남는 시간은 새 정보가 아니라 **강조·반복·사례·시각 변화**로 채운다.

---

## 7. 개선하는 법 — 감이 아니라 데이터로

**같은 내용에 훅만 3가지로 바꿔 사흘 연속 올리고 리텐션 곡선을 비교하라.**
이 파이프라인은 대본 한 줄만 고쳐 재출력하는 데 몇 분이면 된다. **A/B 를 돌리기에 유리한 구조다.**

훅을 볼 때는 조회수보다 YouTube Studio의 **Stayed to watch**(구 Viewed vs. swiped away)를 본다. 첫 몇 초를 넘겨 계속 본 비율이며, 몇 초 기준인지는 공개되지 않았다. 같은 플랫폼·비슷한 길이·관측 기간끼리 비교한다.

2026-09-04의 「통과율 50% 미만 폐기·이탈률 25%/35% 초과 재작성」 기준은 지웠다. 근거가 업체 주장뿐이었고, 수치 목표를 2026-09-16에 전부 삭제했기 때문이다(CLAUDE.md). 낮은 지표는 0·1·2·3초 화면을 video SKILL 「최우선 — 첫 1·2·3초」로 다시 보는 신호로 쓴다.

---

## 8. 체크리스트

- [ ] 실제 0초 프레임이 **포스터**인가 — 주제 제목·후킹(핵심 결과)·키 비주얼이 모두 보이고 주연·타이포 위계가 강한가
- [ ] **재생 즉시 주연의 큰 사건이 시작**되는가. 로고 대기·정지 정보판·미세 장식만 있는 시작은 아닌가
- [ ] 채널명·유머 동안에도 화면이 진행되며 핵심 발화에 동작 정점이 맞는가
- [ ] 소리를 끄고 휴대폰 크기로 봐도 주연과 변화가 드러나는가
- [ ] 실제 첫 프레임·동작 정점·연속 재생을 함께 확인했는가
- [ ] 읽기·강조에 필요한 홀드와 의도하지 않은 대기 시간을 구분했는가
- [ ] 마무리가 보상을 완성하고 필요할 때 자연스럽게 처음과 연결되는가
- [ ] 자막과 읽을 정보가 현행 `docs/09-safezone.md`의 구역에서 읽히는가
- [ ] **회수 경로가 있는가** — 숏폼 자체로는 돈이 안 된다 (`03-strategy.md`)
- [ ] **프레임을 뽑아 눈으로 봤는가** — 검사 통과는 화면이 맞다는 뜻이 아니다

---

## 참고 — 리서치 출처

- [The First 3 Seconds: Hook Structures That Stop Scroll on Shorts](https://virvid.ai/blog/first-3-seconds-hook-faceless-shorts-2026)
- [YouTube Shorts Retention Curve Playbook (2026)](https://aibrify.com/blog/youtube-shorts-retention-curve-playbook)
- [Looping Structure: The Hidden Retention Trick in Viral Shorts](https://virvid.ai/blog/looping-structure-shorts-retention-2026)
- [YouTube Shorts Hook Formulas That Drive 3-Second Holds](https://www.opus.pro/blog/youtube-shorts-hook-formulas)
- [YouTube Audience Retention Benchmarks 2026](https://humbleandbrag.com/blog/youtube-audience-retention-benchmarks)
- [Google Veo 3 for YouTube Shorts: Complete Guide 2026](https://www.veo3ai.io/blog/veo-3-youtube-shorts-guide-2026)
- [Kling 3.0 Tutorial: Complete Guide to 4K AI Video Generation](https://medium.com/@cliprise/kling-3-0-tutorial-the-complete-guide-to-4k-ai-video-generation-in-2026-0e8cfed0e042)
- [Hook-Retain-Reward: the Short-Form Video Structure](https://www.selfstorming.com/tools/libraries/frameworks/hook-retain-reward)

**전부 제3자 블로그·분석 글이다.** 플랫폼 공식 수치가 아니므로 **방향과 감각용**으로 쓰고,
절대값은 자기 채널 애널리틱스로 다시 재라.

2026-09-04 추가 (등급 있는 근거 — hook-pacing 리서치):

- [학술] 유도영·신지영(2019) 한국어 휴지 — 발화 말 중앙값 590ms · 발화 내 424ms ([말소리와 음성과학 11(2)](https://www.eksss.org/archive/view_article?pid=pss-11-2-33))
- [학술] Stivers et al.(2009) PNAS — 한국어 턴 전환 평균 182ms ([pubmed](https://pubmed.ncbi.nlm.nih.gov/19553212/))
- [학술] Lee et al.(2025) — 침묵 600ms 부터 청자 평가 단조 하락 ([말소리와 음성과학 17(1)](https://www.eksss.org/archive/view_article?pid=pss-17-1-13))
- [학술] Krishnan & Sitaraman, ACM IMC 2012 — 정체 1초당 이탈 +5.8%p (n=670만, 버퍼링 유추) ([ACM](https://dl.acm.org/doi/abs/10.1145/2398776.2398799))
- [조사] Verizon Media × Publicis(2019, n=5,616) — 모바일 무음 시청 92% ([3PlayMedia](https://www.3playmedia.com/blog/verizon-media-and-publicis-media-find-viewers-want-captions/))
- [공식] YouTube Help — Shorts 지표 "Viewed vs Swiped away", 공식 목표치 없음 ([support.google.com](https://support.google.com/youtube/answer/12942217))
