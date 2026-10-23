# ② 대본과 시각적 설명

입력은 확인된 팩트와 사용자 의도, 출력은 cuts.json과 프로젝트 README의 기획 근거다.
문체는 docs/channel/04-format-voice.md, 시각 스타일은 docs/channel/05-brand-pipeline.md를 따른다. docs/07-script.md·docs/12-brand.md는 기술 참고이며 과거 ABM 문체·브랜드·수치 목표를 복구하지 않는다.

## 설계

1. **대상과 보상:** 이 영상을 본 사람이 얻을 답·선택·발견과 마지막 장면을 함께 정한다. 사용자가 원하는 주제·정서가 기준이다. 조사한 사실 중 이 답의 원인·증거·조건이 아닌 곁가지는 덜어낸다. 관광 안내를 시작해 연대표가 본론을 대신하거나, 재건 이야기를 자극적인 전쟁 장면 위주로 바꾸지 않는다. 역사 자체가 요청 주제라면 필요한 인과를 충분히 설명한다.
2. **증거와 전개:** 의미 블록(채널05 §3-1)으로 실제 계산·제품·과정·조건을 설계한다. 방법을 끝없이 미루거나 중요한 조건을 빼서 완주를 유도하지 않는다.
3. **그림으로 말하기:** 차이는 비교, 과정은 작동, 대상은 분류 등 각 의미 블록의 설명 방식을 고른다. **주연 오브젝트·건물 요소의 형태·질감·동작을 살리는 Blender와 사진 매핑을 적극 검토한다.** README 에셋 경로에는 대상·3D 제작 범위·얻는 이점·표면 자료/매핑·선택을 짧게 적는다(docs/16-blender.md §1). **실재 건물·구조물을 3D로 만들면 이 단계에서 실제 사진 여러 장을 모아 `실물 형상:` 줄(비율·테이퍼·평면·외피·꼭대기·흔히 틀리는 것)을 쓴다**(docs/16 §4-1 — 2026-10-06 사용자 지시). 공간 전체 세트 재현은 비권장이고, 판단이 애매할 때만 ④에서 2D 대안과 시안을 비교한다. README 「디자인 방향」의 여섯 줄(이 소재가 실제로 하는 일 → 주연 표현 · 카메라 · 빛 층 · 이징 성격 · BGM 정서 — `new.sh` 골격)을 **이 소재의 값**으로 채운다. 브랜드(팔레트·서체·로고)는 고정이라 적지 않고, 골격 문장이나 형용사(「풀화면 2D」·「고급스럽게」)가 아니라 이 소재의 사건·재질·운동으로 쓴다(2026-10-21 ABMEN 감사 — 6편 연속 골격 문장 복사). 팔레트 도식과 사진 매핑한 3D 알파 레이어, 배경 빛·사진 표면을 움직이는 셰이더 층(docs/14 §16 — 고를 때 `node pipeline/shader-fx.mjs list`)은 확정 디자인 안에서 함께 쓰는 재료다. 셰이더를 쓸 장면은 README 에셋 경로에 장면·효과·이유 한 줄로 적는다. 최근 영상과 같은 정보판 구조가 나오면 색만 바꾸지 말고 주연과 사건의 구도를 바꾼다. “고급스럽게·화려하게” 같은 형용사만으로 주문하지 않는다.
4. **🔴 첫 1·2·3초 — 이 단계에서 가장 중요한 결정.** 블록을 다 짠 뒤 공용 SKILL 맨 앞 「최우선」의 네 행 합격 조건과 6원칙 표를 열어 두고 순서대로 한다.
   1. **후보:** 모든 블록에서 장면 후보를 뽑아 README 「훅 선택」 표로 비교하고 `선택: S0N — 이유`를 쓴다. 후보는 같은 팩트의 문구 변형이 아니라 서로 다른 블록의 **장면**이다 — 0초 한 장으로 상황이 읽히고 3초 안에 주연이 바뀌는 장면이 이긴다. 후보마다 「0초에 크게 보일 것(디자인)」 칸에 그 장면의 주연 상태·구도·색면을 적고, **승자 장면의 정점 디자인이 0초 포스터의 바탕**이다 — 별도 제목판을 새로 짜지 않는다(2026-10-21 사용자 「영상 구성 장면 중 가장 후킹 있는 디자인부터 시작」). 승자가 중간·결론 블록이면 그 결과를 먼저 보여주고 원래 블록은 거기에 이르는 원인·경로를 설명하도록 고친다(같은 문장 반복 금지). 자극적인 곁가지가 원래 주제나 사용자가 원하는 정서를 대신하지 않게 한다.
   2. **포스터와 비트:** 승자가 cut-01이 된다. 먼저 **0초 포스터 세 줄**을 쓴다.
      - `주제 제목:` 화면에 쓸 대상·장소 이름이나 주제 문구 그대로.
      - `후킹:` 가장 큰 글자가 될 볼 이유 — 놀라운 결과·반전·구체 값·통념 반박의 짧은 구절 그대로. 무엇이 놀라운지는 말하고 왜·어떻게는 남긴다. 주제 이름을 품어도 된다.
      - `키 비주얼:` 약속하는 장면·사물 하나(반전·비교가 그림 안에 있는 구도)와 무대·맥락 재료, 이 영상의 색·재질.
      
      한 장만 봐도 주제·볼 이유·영상의 디자인이 읽히는 포스터로 설계한다(「최우선」 0.0초 포스터 행 — 서로 다른 3안과 비교는 ④ 「0초 포스터」). 이어 README 「첫 3초 비트」 네 행(0.0초 포스터·0~1초 첫 움직임·정점 — 핵심어·~3초 정착)을 화면(원칙 1·2·3·5)·움직임(원칙 4·6)·말/자막/소리로 채우고, `핵심어:`에 정점에서 들릴 첫 발화의 핵심어를 대사 표기 그대로 적는다. 0초의 값·주장은 ① 확정 팩트에서만 가져오고, 숫자가 없는 주제면 결과 상태 자체를 보인다.
   3. **대사:** cut-01의 say는 첫 발화부터 그 핵심어로 간다. `node pipeline/hook-check.mjs <p> --plan`으로 비트 빈칸과 핵심어의 무료 추정 시각을 보고, 3초를 넘으면 대사 순서를 고친다.
   4. **에셋:** 0초 포스터의 키 비주얼 에셋(주연·무대·맥락 재료)을 생성 순서의 맨 앞에 두고 주제 제목·후킹 글자가 앉을 자리를 `Composition`에 적는다. 주인공을 멀리 잡아 하늘을 비우지 말고, 근접 구도의 단색 면·무대 쪽이나 장면 속 간판에 둔다. 0초~정점에 따로 움직일 부품(쟁반·뚜껑·가격표)은 별도 레이어나 편집 쌍으로 요청한다(래스터 안의 부품은 따로 움직이지 못한다). **주연이 생성 사진 한 장이면 0~3초에 주연 자체가 변할 수단을 여기서 같이 정한다** — 편집 쌍·분리 레이어, 셰이더 표면(docs/14 §16 대응표), 앞뒤 층 달리(docs/11 「줌 vs 달리」), 3D 카메라 투영 중 하나. 정지 사진 위에 코드 덧칠(획·도장·고리)만으로 정점을 만들지 않는다(2026-10-21 감사: 6편 전부 그랬다).

   포스터는 0초에 이미 완성된 한 장이다 — 로고·제목·혜택을 순차로 들여보내지 않고, 완성된 채 멈춰 있지도 않는다(0~1초에 주연이 움직인다). 조건·근거의 작은 글씨까지 포스터에 몰아넣지 않는다. 본문이 그 약속을 사실로 갚는지 다시 확인한다. ④의 STORYBOARD 첫 행은 `0초 결과 | 3초 안 사건·정착 | 본문 근거·조건`이며 이 비트를 구현 시각으로 옮긴다. 그 표 아래 한 줄 `서명 동작 — <이 소재의 물리 이름> (F01·F04) · 이징 <snap|elastic|slowfast|stepped|circular|soft> · 카메라 <줌|달리|트랙|궤도>`을 둔다 — 「디자인 방향」의 값을 프레임 번호와 함께 적는 자리이고 `node pipeline/motion-signature.mjs check <p>`가 읽는다.
5. **완결:** 약속한 답과 행동 방법을 준다. 첫 장면과 연결되는 결말은 자연스러울 때 선택한다.

한 영상의 중심 메시지는 하나다. 길이·컷 수·섹션 수는 전달과 읽기 시간에 맞춘다.

STORYBOARD는 채널05 §3-1의 공통 형식으로 쓴다. 각 블록이 무엇을 새로 이해시키며 주연의 어떤 상태를 바꾸는지 정하고, 핵심 발화의 자막·화면·소리 강조를 함께 설계한다. “이미지 확대·숫자 등장”만으로 설명을 대신하지 않는다. 대사마다 컷을 갈거나 같은 결론을 새 카드로 반복하지 않으며, 가격·단위·비교 대상은 함께 바뀌는 한 상태로 묶는다.

길이를 채우려고 사실을 늘리거나 초 수를 맞추려고 필요한 조건을 빼지 않는다. 기존 영상의 대본을 고치면 바뀐 컷만 재합성한다(③ `--only`).

## 채널 문체와 사실

**대본을 쓰기 전에 캐스트부터 정한다**(채널04 §4 「캐스팅」). **YBMECC 기본은 한국어 성인 내레이터 한 명**이다 — 2인 대화는 사용자가 그 편에 요청할 때만, 원생처럼 들리는 AI 아이 목소리·실존 인물(원장·선생님·학부모) 흉내·가짜 후기 대화는 쓰지 않는다. 아래 ABMEN 원문(남녀 성인·어른+아이·영어 대화)은 사용자가 대화형을 요청한 편에만 참고한다. 정한 캐스트는 README `캐스팅:` 한 줄과 cuts.json `voice.speakers`(표의 화자 키·voice_id)에 바로 기록한다. 어른+아이 편은 첫 초안부터 아이의 역할·말투로 쓰며, 성인용 대본의 화자만 바꾸지 않는다. 그다음 채널04 §3~4를 적용해 **학부모에게 하는 한국어로 쓴다**(ABMEN: 2인 대화를 영어로 직접 썼다). 시작·질문·설명 역할을 성별·나이에 고정하거나 독백을 번갈아 읽지 않는다. 새 발화는 정보·선택·상황을 진전시킨다. 화자 표시·연기 지시는 TTS가 읽을 say에 넣지 않는다.

첫마디는 고른 훅의 핵심을 곧바로 말하고 근거·조건은 본문에서 갚는다. 채널04 §2의 각도는 표현 선택지이지 빈칸에 근거 없는 수치·권위·체험을 채우는 공식이 아니다. 헤드라인과 음성은 문구가 달라도 의미와 강조 시각이 같아야 한다.

(대화형 편만) 쉬운 말과 화면의 상황만으로 이해되는 유머를 살리되 설명을 늘리거나 핵심 답을 늦추면 고치거나 뺀다. 앞 농담을 회수하는 결말은 자연스러울 때만 쓴다. 최근 편과 같은 첫·끝 대사를 자동 복제하지 않는다. 선택한 발화는 실제 cuts[].say에 반영하며 기획만으로 유료 합성을 실행하지 않는다.

[효과음 운영](../../../../resources/sfx/README.md)의 **② 선택**에 따라 **대사와 별개로 장면별 화면 상황 목록**(등장·이동·전환·카메라·충돌·착지·흐름·칩 등장)을 만들고 각 사건의 소리 역할·기존 후보를 적는다. 후보는 화면의 재질·사물로 먼저 찾는다(`node pipeline/sfx-fit.mjs --find <상황 단어>` — 신규 사용 중단 파일은 나오지 않는다). 발화 강조음은 그 목록의 일부다. ③의 발화 실측으로 사건 시각을 보충하고 ④에서 파일 내부 동기화 지점과 대사 대비 크기를 맞춰 구현한다. 기획은 기존 README 또는 실사용 STORYBOARD 한 곳에 둔다. **BGM 정서도 여기서 정한다** — README 「디자인 방향」 BGM 정서 줄에 칸과 이유를 쓰고 ⛳A에 한 줄로 보인다(곡은 ④에서 고르고 자른다 · 정서 어휘는 `resources/music/CREDITS.md` 「정서」 열 · 칸이 비면 새 곡 반입이 ④보다 먼저다).

금액은 **달러를 주, 원화를 보조로** 쓴다 — 큰 글자 `$1.10`, 작은 글자 `≈ ₩1,500`(형식 예시이며 환율은 제작 시점에 확인한다). 대사도 달러를 먼저 읽는다. 원화를 빼지는 않는다. 기준일·환율·반올림은 README 에 적고, 확인하지 못했으면 병기를 생략한다 (정본 `docs/channel/03-data-sources.md` §3).
가격·할인·대상·마감은 ①에서 확인한 범위 안에서만 쓴다. 최대 혜택의 조건·계산은 본문에서 이해할 수 있게 풀어주며 첫 문장에 모두 나열할 의무는 없다. 원금 포함 총액을 정부 지급액으로 바꾸는 등 핵심 사실을 왜곡하지 않는다.
불확실한 정보를 단언으로 바꾸거나 직접 경험을 지어내지 않는다. 문장 길이·유머 횟수 자체를 금지하지 않는다.

## cuts.json과 그림 주문

새 모션 프로젝트는 pipeline/templates/cuts-motion.json을 따른다. new.sh가 기본 HyperFrames 골격을 만든다. 실사 레거시는 `new.sh --photo`로만 시작한다.

- **say:** TTS가 읽을 발음 표기. 원음 한 문장이 여러 컷을 관통하면 앵커 컷에만 둔다.
- **text·headline:** 실제 화면의 정확한 수치·표기. 음성과 모순되지 않게 유지한다.
- **concept:** 그림과 모션으로 설명할 의미. 모든 프레임에 같은 효과를 붙이는 주문으로 쓰지 않는다.
- **dur:** 표시 초. 여기서는 초안이고 ③의 실측으로 확정한다. 새 프로젝트의 timing.version=1과 speed가 시간 정본이다.
- **voice_offset_s:** 컷 시작 후 음성 시작까지 표시 초. 생략하면 0.
- **assets:** 생성 요청/기존 외부 에셋의 ID·사용 컷·생성 상태를 기록한다.

### 인스타 CTA — 학원을 찾아가는 편은 자동, 안내·상담 링크는 요청한 편만 (2026-10-22)

공용 SKILL 「인스타 CTA 판」의 판정을 여기서 한다. 이 편이 학원을 찾아가는 내용(오시는 길·지점 소개·주변 랜드마크 — 네이버 지도·카카오맵·구글맵에서 핀이 나온다)이면 **사용자가 요청하지 않아도** cuts.json 맨 위에 `"ig_cta": {"link":"map"}`(키워드 기본 「지도」, 칸의 뜻은 그 절 표)을 두고, README 「인스타 판」 줄에 `map — <학원·랜드마크>`, 「지도 핀」 줄에 장소 이름·주소·네이버 지도·카카오맵·구글맵 URL을 쓴다. 프로그램·커리큘럼 편은 `없음 — 프로그램 편`이고 `ig_cta`를 두지 않는다(학원 위치는 매 편 같다 — 찾아가는 내용일 때만 스티커). **학원 안내·상담·설명회 신청 페이지(`info`)는 사용자가 이 편에 요청했을 때만** — 줄에 「(사용자 요청 <날짜>)」을 적고, 종류를 말하지 않은 요청은 `info`. `stage-gate 2`가 README 줄과 cuts.json을 대조한다(비면 경고, 다르면 하드). **컷을 더하지 않는다** — 대본·컷·음성은 다른 편과 같고, 스티커는 납품 뒤 `ig-cta`가 얹는다. 근거 조사는 다시 하지 않는다(근거 장부 K02 — ABMEN 기록). ⛳A 보고에 「인스타 판: 댓글에 「<키워드>」 <reward> · 보낼 것(학원 안내·상담 링크/지점 지도)」 한 줄을 넣고, README ⑥에 DM 본문 초안·링크 종류를 남긴다. 학원은 제휴 링크가 없어 `ad`(「광고」 칩)는 해당 없다. 엔딩 카드(법정 표시)가 영상을 닫는 구조는 그대로다.

```bash
node pipeline/tts.mjs <p> --measure
node pipeline/stage-gate.mjs <p> 2
```

무료 길이 측정은 macOS say의 추정치다. 관통 문장은 앵커 하나의 dur가 아니라 **유닛 전체**와 비교한다.
유료 TTS 호출로 길이를 시험하지 않는다.

절정의 혜택과 보조 조건의 위계를 구분한다. 레퍼런스가 필요하면 docs/12 「외부 디자인 자료의 선별 적용」 중 이 결정에 도움이 되는 자료만 본다. Inspo가 연결돼 있으면 소재·보상·원하는 시각 관계로 `search_screens`를 질의하고, 후보의 실제 캡처와 `get_screen`을 대조한다. 연결되지 않았으면 웹 아카이브를 볼 수 있다. 색·폰트만 복사하지 말고 영상의 피사체·시선·상태 변화로 바꾼다. 웹의 작은 라벨·스크롤/호버 동작·정적 페이지 구도를 그대로 주문하지 않는다.

## 이미지 생성 요청

에셋의 제작 경로를 공용 SKILL의 기준으로 비교한다. **메인이 전부 직접 만들 수 있는지가 아니라 어떤 결과가 영상 품질에 유리한지** 판단한다. 외부 사진·저작자 표시 소재는 후보가 아니다 — 이미지가 필요하면 이 요청으로 낸다.
생성이 더 유리한 에셋만 골라 기존 README의 `## 에셋 생성 요청`에 아래 **고정 형식**으로 쓰고, **메인이 `asset-prompts --generate`로 생성한다**(Codex 내장 image_gen · 사용자 ChatGPT 구독, 2026-10-02 사용자 지시). 요청이 없으면 그 절에 `없음 — <이유>` 한 줄만 쓴다. **메타는 한글, 프롬프트는 영문**이다. **실재 대상은 프롬프트를 쓰기 전에 아래 「실물 대조」로 실제 사진부터 본다.** 형식의 근거(OpenAI 공식 가이드·생성 실측·실물 대조)는 `docs/08-prompting.md` §1.

### 실물 대조 — 생성 전에 실제 사진을 본다

**2026-10-06 사용자 지시:** 「리서치해서 실제 이미지 찾아서 재생성해 — 너무 사실성 없고 실제 이미지와 너무 달라서 현실감이 없어」. 이름만 적은 프롬프트는 모델이 그 종류의 일반형을 그린다. 00051에서는 이름난 타워조차 사진 대조 없이 만든 3D가 실물보다 훨씬 가늘었다(pitfalls §176 — 원인이 같다). 실재하는 장소·건물·음식·제품·탈것·사람·거리를 그리는 에셋은 전부 이 순서다.

```bash
node pipeline/ref-photos.mjs <p> <refs-id> --search "<영문 이름>"     # Wikimedia Commons → output/refs/<refs-id>/ + 후보 시트
node pipeline/ref-photos.mjs <p> <refs-id> --url <이미지 URL> …        # WebSearch로 찾은 공식 사이트·보도 사진
#   후보 시트를 열어 대상이 아니거나 시점이 겹치는 파일을 지우고 서로 다른 시점·시간대 3장 이상을 남긴다
node pipeline/ref-photos.mjs <p> <refs-id> --sheet                    # 남긴 실물만 한 장으로 — 식별 특징을 읽는다
#   … 프롬프트 작성 → asset-prompts --generate …
node pipeline/ref-photos.mjs <p> <refs-id> --sheet <생성 이미지> …     # 위 실물 · 아래 생성 → output/review/ref-<refs-id>.png
```

1. **모은다:** 검색은 엉뚱한 사진도 준다(00051 실측 — 「Lotte World Tower (2)」가 타워 없는 거리) — 후보 시트를 보고 고른다. Commons에 없는 시점(밤·내부·공식 전경)은 WebSearch로 공식 사이트·관광공사·보도 페이지를 찾아 그 **페이지 주소**를 `--url`에 넣는다(대표 이미지 og:image를 받는다). 같은 대상의 에셋 여럿(낮·밤 편집 쌍)과 3D는 refs 하나를 함께 쓴다 — 대조 기록은 파일별로 쌓인다.
2. **읽는다:** 사진에서 **식별 특징 3~6개**를 쓴다 — 형태·비율(높이:폭, 가늘어지는 모양), 재질·색, 그 대상만의 디테일(무늬·띠·지붕·간판 자리·꼭대기), 주변 맥락, **흔히 틀리는 것**(모델이 그리기 쉬운 일반형). 현지인이 보고 「거기다」라고 알아볼 특징이 기준이다.
3. **옮긴다:** 식별 특징은 `Subject`·`Details`에 생김새로, 흔히 틀리는 것은 `Constraints`에 금지로 옮긴다. 실재 대상의 Style은 사진풍이다(아래 공통 Style).
4. **대조한다(A 보고 전에):** 생성 뒤 `--sheet <생성 이미지>`로 실물과 나란히 놓고 식별 특징을 한 줄씩 본다. `### 수령 검수`에 `<id>: 식별 특징 n/N 일치 — 어긋난 것`을 적는다. **형태·비율·고유 디테일이 어긋나면 다시 만든다**(편집 형식으로 그 특징만, 안 되면 프롬프트 수정 후 `--only --force`). 휴대폰 크기에서 안 보이는 작은 차이만 이유와 함께 남긴다. 시트가 없으면 stage-gate ②가 경고하고, `--accept`는 지금 파일이 든 시트와 이 줄(n<N이면 이유)이 없으면 거부한다. 원본을 다시 만들면 그 편집 쌍도 다시 만들고 대조한다.

🔴 **실물 사진은 분석 전용이다.** `output/refs/`(gitignore)에만 두고 — 생성기에 첨부하지 않고(`참조 첨부`는 우리가 만든 에셋·공식 원본만), `assets/`·`resources/`로 복사하지 않고, 영상·문안에 출처를 쓰지 않는다. 남의 사진을 편집 원본으로 붙이면 그 사진의 2차 저작물을 표시 없이 내보내게 된다 — 저작자 표시 소재 금지(2026-10-02)가 막으려는 것이다. 생성물은 실제 장소의 모습을 재현하는 장면이며, 실제 CI·제품·증빙 화면을 대신하지 않는다.
실재 대상이 아닌 에셋(상징 소품·추상 배경·반복 재질의 일반형)은 메타에 `실물 대조: 해당 없음 — <이유>`라고 쓴다. 이 선언은 `--lint`가 목록으로 출력하고 A 보고에 그대로 보인다 — 실재 장소·건물·음식을 「해당 없음」으로 넘기지 않는다. 실재 대상의 「사람」은 복장·직업·장소의 유형만 참고한다 — 특정 실존 인물의 얼굴을 재현하지 않는다.
진행 중인 옛 골격(`asset_prompt_format: 1`)에 적용하려면 cuts.json 값을 `2`로 올리고 메타 「실물 대조」(3D는 `실물 형상:`)를 채운다 — 사용자가 재제작·수정을 요청한 편에만 한다.

### README 골격

````markdown
## 에셋 생성 요청

생성 순서: lwt-lake-hero (0초 포스터 키 비주얼 — 첫 장으로 룩 확정 후) → lwt-lake-dusk (lwt-lake-hero를 첨부해 편집)
코드로 만들 것: 주제 제목·높이 값·층 고리·낙하선·자막·모든 글자와 숫자
공통 Style: Photorealistic travel photograph, natural lens perspective, true-to-life proportions and materials, high detail, not stylized, not CGI.

### lwt-lake-hero · 석촌호수 건너 롯데월드타워 — `assets/images/lwt-lake-hero.png`
- 사용: cut-01 0초 포스터 키 비주얼·0~3초 배경 · 최대 표시 1080×1920px
- 생성 이유: 타워 전신·호수·성이 한 장에 들어와 주제가 바로 읽힌다. 세로로 긴 타워가 주인공이라 그 곁의 하늘에 로고(y228~340)와 후킹·제목(y360~620)을 둔다 — 주인공을 멀리 잡아 하늘을 만든 것이 아니다
- 실물 대조: Lotte World Tower · refs lwt · 사진 3장(석촌호수 위 아침·호수 건너 낮·한강 건너 밤) · 식별 특징: 밑동이 가장 넓고 꼭대기까지 줄곧 가늘어지는 매끈한 원뿔(보이는 부분 높이:밑폭 약 5:1) · 은회색 유리에 가는 세로선과 일정 간격의 어두운 가로띠 · 꼭대기가 세로 틈으로 갈라진 두 끝 · 호수 섬의 흰 벽·파란 지붕 성 · 흔히 틀리는 것: 바늘처럼 가는 실루엣, 첨탑 안테나
- 참조 첨부: 없음
- 수령 예상: 9:16 → 약 941×1672 · 최대 표시 1.15배

```text
Use: …
```
````

- 제목의 첫 토큰은 cuts.json `assets[].id`와 같게 쓴다. 메타 다섯 줄(사용·생성 이유·실물 대조·참조 첨부·수령 예상)을 모두 쓴다(2026-10-06 전 골격 `asset_prompt_format: 1`은 실물 대조 없이 네 줄).
- **실재 대상의 공통 Style은 사진풍이다**(2026-10-06 사용자 지시 — 위 「실물 대조」). 채널의 그래픽 층(제목·값·칩·포인터·도식)은 코드가 그 위에 얹는다. 일러스트 Style은 실물을 재현하지 않는 상징 소품·도식 재료에만 쓰고 이유를 메타에 적는다. UV 텍스처에 완성 장면의 구도·명암을 강제하지 않는다(docs/16 §5-1).
- 생성 순서에 편집 관계(어느 원본을 첨부하는지)를 적는다. 룩이 불확실하면 `--only=<첫 장>`으로 한 장을 먼저 만들어 보고 나머지를 생성한다.
- 생성 결과의 크기·차이 기록은 이 절 끝의 경로 없는 `### 수령 검수` 제목 아래에 둔다.

### 영문 프롬프트 — 새로 생성

라벨 10개를 **이 순서로 모두** 쓴다. 해당이 없으면 라벨을 지우지 않고 `none`이라고 쓴다.

```text
Use: Full-screen opening background (the poster frame) of a vertical explainer short about Lotte World Tower in Seoul. A big title (in the band 19-32% down, below the channel logo), a height value beside the tower and captions are added by code.
Scene: Seoul, South Korea, on a clear late-autumn afternoon, seen across Seokchon Lake.
Subject: Lotte World Tower, a 555-meter supertall skyscraper: one smooth cone that is widest at its base and narrows steadily all the way up, its pointed top split into two tips by a thin vertical slit, rising behind a low, wide shopping-mall podium.
Details: Pale silver-grey glass curtain wall with fine vertical lines and a few thin darker horizontal bands at intervals up the height; a fairy-tale castle with white walls and blue roofs on a small island in the lake in front; autumn trees along the shore; mid-rise towers on both sides, far shorter than the tower.
Composition: Eye-level telephoto view from the far shore. The tower stands slightly right of center from 33% to 80% of the frame height, about 17% of the frame width at its base. The lake fills the bottom 20%. Keep the sky from the top edge to 32% down clear and calm for the logo and title.
Lighting: Soft late-afternoon sun from the left, gentle reflections on the glass and the water, no lens flare.
Color: Natural daylight color: pale blue sky, silver-grey glass, blue-green lake, orange and yellow autumn trees.
Style: Photorealistic travel photograph, natural lens perspective, true-to-life proportions and materials, high detail, not stylized, not CGI.
Output: 9:16 vertical. Opaque full-bleed image.
Constraints: No text, letters, numbers, logos, signs or watermark. Do not make the tower thinner or more needle-like than described; no antenna or spire on top; no other building of similar height.
```

| 라벨 | 쓰는 법 |
|---|---|
| Use | 영상 안의 용도와 코드로 얹을 것. 모델은 여기서 완성도와 비워 둘 곳을 판단한다 |
| Scene | 장소·시간·환경. 컷아웃은 `none — isolated object` |
| Subject | 주연 하나를 구체적인 명사·개수·상태로. 사람은 잘리는 위치·시선·사물을 쥐는 방식까지. 실재 대상은 영어 이름 뒤에 실물 대조의 식별 특징을 생김새로 풀어 쓴다(`Lotte World Tower, …: one smooth cone that is widest at its base…`) — 이름만으로는 일반형이 나온다 |
| Details | 재질·표면·구별되는 작은 특징. 코드가 자를 선(층·판·칸)이 있으면 또렷하게 |
| Composition | 시점·각도, 주연의 위치와 화면 대비 크기(%), 코드로 얹을 빈 구역을 % 범위로 |
| Lighting | 광원의 방향·질·대비를 고른 재질 경로에 맞춘다. UV 텍스처는 대체로 균일한 빛·강한 반사/그림자 없는 표면을 요청한다. 사진 매핑용 상세는 docs/16 §5-1 |
| Color | 채널 팔레트 hex를 역할과 함께 — Ivory #FFF7EE · Plum Ink #2B1420 · Burgundy #A51D4D · Orange #F69321 · Gold #FFC23D (`brand.json` colors) |
| Style | 매체를 말로. 공통 Style 문장을 그대로 쓴다. 특정 스튜디오·작가 이름 대신 면·선·질감을 설명한다 |
| Output | 비율(`9:16`·`2:3`·`1:1`·`4:3`·`3:2`·`2:1`)과 배경. 투명은 `Transparent background, PNG with a real alpha channel, clean edges, no checkerboard, no backdrop, no ground shadow.` **픽셀 수는 쓰지 않는다** |
| Constraints | `No text, letters, numbers, logos, signs or watermark.` + 이 에셋에 끼면 안 되는 것(사람·차량·실제 상표·다른 소재)과 실물 대조의 **흔히 틀리는 것**. 매핑용이면 불필요한 원근·굽힌 표면·그림자도 지정한다 |

한 블록은 복사 한 번으로 완결된다. 공통 규칙을 “위 참고”로 빼지 않는다. 실제 로고·CI·제품·증빙은 생성하지 않는다. 글자도 이미지에 그리지 않는다 — 자막·라벨·숫자는 코드(Pretendard)로 얹어 발화와 맞추고 고친다. 🔴 YBMECC: 생성 프롬프트에 사람·아이·교실을 넣지 않는다(`no people, no children`) — 원생·교실은 학원 사진만(채널05 §4). 핵심과 무관한 형용사·장식 지시를 쌓지 않는다.

### 영문 프롬프트 — 편집 (두 번째 상태·수정)

같은 물체의 두 상태나 생성된 이미지의 수정은 **새로 생성하지 않고 원본을 첨부해 편집**한다(메타 「참조 첨부」에 원본 id를 쓰면 `--generate`가 그 파일을 붙인다). ABM 00040은 첫 결과를 참조로 붙여 둘째 장을 새로 생성했는데도 각도·위치가 어긋나 1.06배·24px 보정했다. 한 번에 한 가지만 바꾸고, 보존할 것은 매번 다시 적는다. “same as before”만으로는 유지되지 않는다.

```text
Edit: Image 1 is lwt-lake-hero (attached). Change only: make it the same view at dusk, with a deep blue sky, the tower's glass lit softly from inside and warm lights along the shore and on the castle.
Keep unchanged: camera angle, framing, the tower's shape, proportions and position, the castle, the lake, the clear sky area in the top 32%, photographic style.
Output: Same aspect ratio as Image 1. Opaque full-bleed image.
Constraints: No text, letters, numbers, logos, signs or watermark. Do not make the tower thinner or add an antenna.
```

### 생성 크기

생성기(Codex image_gen·ChatGPT 모두)는 요청한 비율을 따르고 픽셀 수는 약 157만 화소로 준다: 9:16 → 941×1672 · 2:3 → 1024×1536 · 1:1 → 1254×1254 · 4:3 → 1448×1086 · 3:2 → 1536×1024 · 2:1 → 1774×887. 00030은 `at least 2160x3840`·`2400x2400`을 적었지만 941×1672·1254×1254를 받았고, 00042 Codex 생성도 1254×1254·941×1672였다. 메타의 수령 예상과 cuts.json `min_width/min_height`는 이 크기 이하에서 **표시에 필요한 최소**로 적는다. 더 큰 표시가 필요하면 픽셀을 더 달라고 쓰지 않고 확대 폭·크롭 범위 같은 구도를 바꾼다.

투명 오브젝트는 `assets/scene/`, 배경·장면용 이미지는 `assets/images/` 등 용도에 맞는 프로젝트 경로를 지정한다.

```bash
node pipeline/asset-prompts.mjs <p> --lint                 # 형식만
node pipeline/asset-prompts.mjs <p> --generate             # 형식 검사 → 새 이미지 병렬 생성 → 편집 → 제목 경로로 복사 → status received
node pipeline/asset-prompts.mjs <p> --generate --only=<id> --force   # 한 장 다시
```

형식(한글 없음·라벨 순서·비율·픽셀 수 없음·메타 줄·실물 대조의 사진 수·식별 특징·편집의 참조 id)을 먼저 검사하고(README 제목 경로가 cuts.json과 다르면 경고하고 cuts.json 경로에 저장한다), 실패하면 아무것도 생성하지 않는다. 이미 있는 파일은 건너뛴다. 실재 대상인데 `output/refs/<refs-id>/`에 실물 사진이 3장 미만이면 생성하지 않는다. 생성은 장당 수 분이라 백그라운드로 돌리고 그동안 다른 준비를 한다. 끝나면 **실제 이미지를 열고** 실재 대상은 「실물 대조」 4번(대조 시트·식별 특징 n/N)을 하고, 문제 있는 것만 프롬프트(또는 편집 프롬프트)를 고쳐 `--only`로 다시 만든다. 실패 로그는 `output/image-gen/<id>.log`다. Codex가 ChatGPT로 로그인되어 있지 않거나 같은 실패가 반복되면 같은 프롬프트 블록을 사용자에게 넘기고 코드 베이스라인으로 진행한다. 형식 검사·생성은 `cuts.json`에 `asset_prompt_format`이 있는 프로젝트(2026-09-27 이후 new.sh 골격)에만 적용하고, 실물 대조는 `2`(2026-10-06 이후 골격)부터 필수다.

A 보고에서는 팩트·선택한 대본·핵심 시각 방향·**생성한 실제 이미지(파일 경로와 한 장 대조 시트 — 0초 포스터의 키 비주얼을 맨 앞에)와 실재 대상의 실물 대조 시트(`output/review/ref-<id>.png`·식별 특징 n/N)**와 **「훅 선택」 표·`선택:` 한 줄·0초 포스터 세 줄·「첫 3초 비트」 네 행과 `hook-check --plan`의 핵심어 추정 시각**을 맨 앞에 함께 보여준다. `--lint`가 출력한 「실물 대조 해당 없음」 목록과 이유도 함께 보인다. **캐스트(`캐스팅:` 한 줄 — 어른+아이면 아이가 맡은 역할 한 줄 포함)와 3D 적용 대상·범위·매핑 선택도 한 줄씩 보여준다**(사용하지 않으면 구체적인 이유, 실재 구조물이면 `실물 형상:` 사양과 실물 사진 시트). 판단이 README 안에만 있으면 사용자가 볼 수 없다(pitfalls §124). 별도 승인 단계가 아니라 A 보고 안의 한 줄이다. **실제 첫 훅과 본문의 답·조건 설명, 끝 대사를 함께 제시**해 후킹·자연스러운 영어 대화·앞뒤 연결·반복 여부를 확인한다. 일반 소개에 그치면 훅을 다시 쓰고, 과장 표현 자체를 이유로 약하게 고치지 않는다. 조크가 있다면 문화권 사전 지식 없이 이해되고 사실·설명 흐름에 어울리는지도 함께 본다. 별도 훅/유머 승인 단계나 마무리 멘트 의무를 만들지 않는다.
A를 올린 턴에 ③ 유료 음성을 바로 합성한다 — /video 제작 요청이 곧 승인이다(2026-10-22). 여기서 멈추는 것은 교차검증 실패·저작권 문제·기본값 없는 갈림길뿐이다(공용 SKILL 「제작 흐름」).

에셋 추적은 cuts.json의 assets 배열을 쓴다. 예:

```json
{"id":"calendar-paper","kind":"cutout","cuts":["cut-01"],"file":"assets/scene/calendar-paper.png","render_file":"assets/scene/calendar-paper.png","status":"requested","min_width":900,"min_height":900}
```

kind는 cutout/background/official, status는 requested/received/approved다. min_width/min_height는 위 「생성 크기」 이하에서 표시에 필요한 최소로 정한다. `--generate`가 received로 바꾸고, 시각 검수와 렌더 경로 복사를 마치면 ④의 accept로 승인 지문을 기록한다.
