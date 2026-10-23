# 로고 출처 기록

로고를 새로 넣을 때마다 **한 줄씩** 추가한다. 출처를 못 적을 파일은 화면에 올리지 않는다.
규격 검사는 `node pipeline/logo-check.mjs`.

| 파일 | 출처 URL | 받은 날짜 | 규격 |
|---|---|---|---|
| `onnuri-digital.png` | <https://www.onnuri.gift/news/media/detail?no=27> (소진공 미디어자료실, 2026-04-28 게시) | 2026-09-07 | ✅ 3508×2481 rgba |
| `burgerking.png` | <https://commons.wikimedia.org/wiki/File:Burger_King_2020.svg> (위키미디어 커먼즈, 2021 리브랜딩 현행판) | 2026-09-08 | ✅ 1920×2092 rgba |
| `whopper-wordmark.png` | <https://commons.wikimedia.org/wiki/File:Whopper_logo_2021.svg> (위키미디어 커먼즈) | 2026-09-08 | ✅ 3840×570 pal8(알파 O) |
| `bbq-red.svg` | ⚠️ **미기록** — 00015 작업 중 들어옴 | 2026-09-14 (파일 타임스탬프) | ✅ SVG 벡터 · 원본색 |
| `bbq-white.svg` | ⚠️ **미기록** — 위의 백색판 | 2026-09-14 (파일 타임스탬프) | ✅ SVG 벡터 |
| `costco.png` | <https://www.costco.com/wcsstore/CostcoGLOBALSAS/images/Costco-Wholesale-US.svg> (costco.com 헤더가 직접 서빙하는 공식 SVG) | 2026-09-09 | ✅ 2710×797 rgba |
| `burgerking-old.png` | ⚠️ **미기록** — 위 교체분의 백업 | 2026-09-07 (파일 타임스탬프) | ❌ 342×340 rgb24 · 쓰지 마라 |
| `kfc.png` | ⚠️ **미기록** | 2026-09-07 (파일 타임스탬프) | ❌ 631×235 rgb24 |
| `parisbaguette.png` | ⚠️ **미기록** | 2026-09-07 (파일 타임스탬프) | ❌ 354×356 rgb24 |
| `touslesjours.png` | ⚠️ **미기록** | 2026-09-07 (파일 타임스탬프) | ❌ 478×329 rgb24 |

⚠️ `kfc` · `parisbaguette` · `touslesjours` · `burgerking-old` 는 이 문서가 생기기 전에 들어온 파일이라 출처가 없다. **규격도 전부 불합격이다**
(`resources/logos/README.md` 실측표). 쓰려면 공식 브랜드 리소스·보도자료에서 투명 PNG 로
다시 받고 이 표를 채워라. **버거킹은 2026-09-08 에 교체 완료** (아래 절).

---

## 온누리상품권 BI — **확보 완료** (2026-09-07, 사용자 승인)

공식 홈페이지는 `onnurigift.or.kr` 이 아니라 **`onnuri.gift`** 다 (옛 주소는 DNS 해석 불가).
그 **미디어자료실**에 BI 원본이 공개돼 있다 — 2026-04-28 소진공 게시글 "온누리상품권 BI(로고) 공유":
<https://www.onnuri.gift/news/media/detail?no=27>

**받은 것**: `resources/logos/onnuri-digital.png` (3508×2481 rgba, `logo-check.mjs` 통과) ·
가이드북은 `projects/00002-온누리적립/assets/refs/온누리상품권-BI가이드북-2026.pdf`

### 🔴 공식 BI 가이드북이 정한 규정 — 쓸 때 반드시 지킨다

가이드북 표지: *"본 매뉴얼에 수록된 내용 중 **허용된 부분을 제외한 어떠한 부분도 임의로 변경하여 사용할 수 없습니다**."*

**사용금지규정 (가이드북 6면) — 8가지, "이런 사용은 절대로 금한다":**
임의 투명도 · 비례 왜곡 · **색상 임의 변경** · 로고 임의 분리·조합 ·
**복잡한 배경 위 적용** · 로고 테두리 적용 · 컬러 반전 · 자간 임의 확대

**배경색 규정 (가이드북 5면)**: *"배경색의 색상활용에 따라 로고의 색상을 다양하게 활용하여 사용할 수 있다.
명확하고 식별 가능하도록 하는 것이 중요하며, **배경색과의 명도대비가 클수록 선명하게 보인다**."*
승인된 조합에 **어두운 배경 → 흰색 단색(또는 오렌지+흰색)** 이 포함된다.

⚠️ **우리에게 걸리는 두 가지**
1. 우리 그라운드는 **주사선 + 그레인 + 플리커**가 있다 → "복잡한 배경 위 적용" 위험.
   **평평한 갱지 크림 카드 위에 올려라.** 그라운드에 직접 얹지 마라
2. 딥그린 위 오렌지는 명도대비 **2.97:1**, 크림 위는 **2.53:1** (실측). 가이드북이 승인한
   **흰색 단색 버전이 어두운 배경엔 더 맞지만 우리에겐 흰색 PNG 가 없다** — 색을 우리가 바꾸는 건
   위 금지규정 3번이다. 필요하면 `.ai` 원본에서 추출하거나 소진공에 요청한다

**최소 크기**: 가로 10mm (인쇄 기준). 화면에서는 여유 있다.
**여백(clear space)**: 락업 50×26mm 기준 상하좌우 3mm. 받은 PNG 는 캔버스에 이미 여백이 들어 있다
(글자 영역 2449×1278, 좌우 529 · 상하 601) — **크롭하지 말고 그대로 써라.**

| 파일 | 규격 (HTTP Range 로 PNG IHDR 만 읽어 실측) | 우리 기준 |
|---|---|---|
| 디지털 온누리상품권 BI (PNG) | **3508×2481 · 알파 O** | ✅ 통과 — 이게 최적 |
| 온누리상품권 BI 기본형 (PNG) | 1181×701 · 알파 O | ✅ 통과 |
| 디지털형·슬로건형 벡터 | `.ai` | 벡터라 더 좋다 |
| **BI 가이드북 PDF (2026년판)** | 사용 규정 본문 | 받기 전에 읽어야 한다 |

### 🔴 이용조건이 우리를 덮지 않는다 — 받기 전에 확인할 것

- 게시글에 **공공누리 표시가 없다.** 본문의 허락 문구는 *"온누리 사용 구역의 **상인회 및 가맹점주** 분들은
  첨부된 홍보물을 다운받아 자율적으로 활용하실 수 있습니다"* — **대상이 상인회·가맹점으로 한정**돼 있다.
  우리는 제3자 정보 채널이지 가맹점이 아니다
- 소진공 저작권정책: **공공누리 미부착 자료는 사전 협의 필수** (홍보실 042-363-7531)
  <https://www.semas.or.kr/web/USE01/USE0103.kmdc>
- 문의처: 소진공 온누리상품권부 **1533-0100** / `onnuriadmin@semas.or.kr`

⚠️ 우리 내부 규칙(`README.md`)은 "어떤 브랜드의 행사인지 알리려고 **원본 로고를 그대로 표시**"를 허용한다.
권리자 쪽 문구는 그보다 좁다. **둘이 어긋나므로 사용자 판단 사항이다.** 특히 정부기관 계열 표장이라
**공식 채널·제휴로 오인될 배치**는 우리 규칙에서도 금지다.

### 기관 로고 (참고)

- 소진공 CI: <https://www.semas.or.kr/web/ORG01/ORG0105.kmdc> — `.ai` 만, PNG·SVG 없음. 공공누리 미부착 → 사전 협의
- 중기부 로고 ZIP: <https://www.mss.go.kr/site/smba/contents/view.do?menuCd=20801030000002024122947&siteCd=smba>
  — **정부상징**이라 함께 걸린 「정부상징 가이드」 규정을 따라야 한다
- 캐릭터 '온누리즈' 소스도 같은 자료실에 공개("온누리상품권 홍보 시 활용 가능"): <https://www.onnuri.gift/news/media/detail?no=4>

---

## 버거킹 CI — **확보 완료** (2026-09-08)

버거킹은 공식 브랜드 리소스 페이지·프레스킷을 일반에 열어 두지 않는다 (`burgerking.co.kr` 은 Vue SPA 라
정적 fetch 로 이미지 경로가 안 나오고, 노출된 API 호스트 `web-prd.burgerking.co.kr` 의 엔드포인트도
번들에 안 남아 있다). **위키미디어 커먼즈**에서 받았다.

| 파일 | 커먼즈 파일 | 라이선스 | 규격 |
|---|---|---|---|
| `burgerking.png` | [File:Burger King 2020.svg](https://commons.wikimedia.org/wiki/File:Burger_King_2020.svg) | **PD-textlogo** (미국 저작권 성립요건 미달) · **Restrictions: trademarked** | ✅ 1920×2092 rgba |
| `whopper-wordmark.png` | [File:Whopper logo 2021.svg](https://commons.wikimedia.org/wiki/File:Whopper_logo_2021.svg) | **Public domain** · **trademarked** · Artist: Burger King | ✅ 3840×570 pal8(알파 O) |

둘 다 SVG 원본을 **커먼즈 썸네일 렌더러로 PNG 변환**해 받았다 (`thumb.wikimedia.org/.../<w>px-....png`).
로컬에 SVG 변환 도구가 없다 — `rsvg-convert`·`inkscape`·`magick`·`cairosvg` 전부 없고 `sips`·`qlmanage` 만 있다.
**포맷 변환일 뿐 내용은 손대지 않았다.** 배경 키잉·재작도 안 했다.

🔴 **저작권이 아니라 상표로 걸린다.** 커먼즈가 PD 로 두는 건 저작권 얘기지 상표권이 아니다
(파일 페이지의 `Restrictions: trademarked`). 우리 규칙(`resources/logos/README.md`)대로
**어떤 브랜드 얘기인지 알리는 용도로 원본 그대로**만 쓴다. 공식 채널·제휴로 오인될 배치는 금지.

### 색 대비 실측 (계산기를 `docs/12-brand.md` 의 기재값 3개로 검증한 뒤 잼)

- **와퍼 워드마크 획 색 `#4D2512`** (실측, BK 2021 팔레트의 BBQ Brown 계열)
  - 딥그린 `#14532D` 위 **1.45:1** → 🔴 **직접 올리지 마라.** 관보 레드(1.02:1)와 같은 처방이다
  - 갱지 크림 `#F2E8D5` 위 **10.87:1** → ✅ AAA. **크림 카드 위에만 얹는다**
- `burgerking.png` 은 로고 자체가 크림색 외곽 셸을 갖고 있어 딥그린 위에서 그대로 읽힌다 (눈검사 확인)

### 와퍼 제품 사진

| 파일 | 출처 | 라이선스 | 규격 |
|---|---|---|---|
| `projects/00003-버거킹와퍼/assets/scene/whopper.jpg` | [File:Whopper.jpg](https://commons.wikimedia.org/wiki/File:Whopper.jpg) — 촬영 Tokfo, 빈 중앙역 버거킹 | **CC0** (저작권 포기 · 출처표기 의무 없음) | 4679×3128 yuvj444p |

**대안** — 보기엔 더 낫지만 라이선스 부담이 있어 채택하지 않았다. 사용자가 감수하겠다면 바꾼다:
[File:WHOPPER with Cheese, at Burger King (2014.05.04).jpg](https://commons.wikimedia.org/wiki/File:WHOPPER_with_Cheese,_at_Burger_King_(2014.05.04).jpg)
(3456×2592, 촬영 Lombroso) — 포장지 위 깨끗한 제품컷에 가깝지만 **CC BY-SA 3.0** 이라
출처표기 + **동일조건변경허락**이 붙는다. 영상에 넣으면 결과물 전체에 SA 가 미친다는 해석이 가능하다.

⚠️ 버거킹 공식 제품 사진(홈페이지·앱)은 **상업용 사진 저작물**이라 PD/CC 가 아니다. 언론 배포 이미지도
보도용이라 우리 채널에 그대로 쓰는 건 다른 얘기다. **공식 제품컷이 꼭 필요하면 버거킹에 사용 허락을 받아야 한다.**

---

## 코스트코 CI — **확보 완료** (2026-09-09)

코스트코는 공개 프레스킷·브랜드 리소스 페이지를 두지 않는다. **costco.com 헤더가 직접 서빙하는 공식 SVG**
를 받았다 (출처 규칙 3번 "공식 사이트가 직접 서빙하는 로고 에셋").

| 항목 | 값 |
|---|---|
| 원본 | <https://www.costco.com/wcsstore/CostcoGLOBALSAS/images/Costco-Wholesale-US.svg> (7,030 B · `image/svg+xml` · viewBox `0 0 271 79.7`) |
| 저장 | `resources/logos/costco.png` — **2710×797 rgba**, `logo-check.mjs` ✅ |
| 래스터화 | 로컬에 `rsvg-convert`·`inkscape`·`magick`·`cairosvg` 가 **없다.** headless Chrome 으로 정확히 **10배**(271×10, 79.7×10) 스크린샷 — `--default-background-color=00000000` 로 배경 투명 유지. 형태·색 불변, 크롭·재배색·키잉 없음 |

- SVG 는 흰색 외곽 헤일로(`.st0`, 단일 path) + 레드 `#E31837` 워드마크 + 블루 `#005DAA` "WHOLESALE" + ® 로 구성된다.
  흰 헤일로는 **로고 자체의 일부**(배경 사각형이 아니다) — 모서리 픽셀 알파 0 확인. 딥그린 위에서 키라인처럼 읽혀 오히려 유리하다
- **탈락시킨 후보**: `Costco-Logo-Registered.png` (costco.com Adobe DAM, `?width=2400` 을 줘도 **507×146 pal8** 고정) ·
  costco.co.kr 의 `costcologo.png` (507×146 pal8) · `Costco_C_logo.png` (**1024×1024 rgb24 — 알파 없음**, C 심볼 단독)

🔴 **상표 고지 — 원문 확인 실패.** `costco.com/terms-and-conditions-of-use.html` 과 `copyright-and-trademarks.html`
둘 다 봇 차단(403 / 타임아웃)이라 **문구를 옮겨 적지 못했다.** 저작권이 아니라 **상표**로 걸리는 건 버거킹과 같다 —
`resources/logos/README.md` 대로 **어떤 브랜드 얘기인지 알리는 용도로 원본 그대로**만 쓰고, 공식 채널·제휴로
오인될 배치는 금지. 고지 문구가 필요하면 사람 브라우저로 위 두 페이지를 열어야 한다.

---

## 트레이더스 홀세일 클럽 BI — 🔴 **못 구했다** (2026-09-09)

**규격(투명 PNG · 최장변 1000px+)을 만족하는 공식 파일이 공개돼 있지 않다.** 억지로 만들지 않았다.

### 찾은 것 — 전부 규격 미달 (실측)

| 후보 | 출처 | 실측 | 왜 안 되나 |
|---|---|---|---|
| **현행 BI 원본** | <https://eapp-cdn.emart.com/traders/common/logo-traders.png> (traders.co.kr 공식 CDN, `club/club.html` 이 참조) | **205×191 rgba** | 알파는 있으나 205px — 여백 빼면 실효 약 160×60 |
| 앱 영수증 CI | <https://eapp-cdn.emart.com/emartapp/mypage/receipt/ci-receipt-traders.png> (이마트 앱 `ern-emart.min.css`) | **208×32 rgba** | 너무 작다 |
| 보도자료 BI | <https://shinsegae-prd-data.s3.ap-northeast-2.amazonaws.com/wp-content/uploads/2025/08/emart-traders-wholesale-club-warehouse.png> (신세계그룹 뉴스룸 <https://www.shinsegaegroupnewsroom.com/90618/> — 2022 BI 교체 보도자료) | **900×330 rgb24** | **알파 없음**(흰 배경) · 900px. 뉴스룸이 업로드를 900px 로 리사이즈한다 (원본 없음) |
| 사업구조 도해 | <http://eapp-cdn.emart.com/emartCompany/ko/images/business/bg_struc_list-v2.png> (company.emart.com 사업소개) | 750×417 rgba | 6개 브랜드 **합성 이미지** — 크롭해야 하는데 금지 |

### 막힌 이유 · 뒤진 도메인

- `traders.co.kr` / `store.traders.co.kr` — 헤더가 `<h1 class="blind">` 텍스트다. **로고 이미지가 레이아웃에 없다.** CDN 직접 조회로 겨우 205px 짜리를 찾음
- `company.emart.com/ko/company/ci.do` — **공식 CI 페이지가 이마트 CI 만 다룬다.** 트레이더스 항목 자체가 없고 다운로드 링크도 없음
- `emart.ssg.com` — curl **403**. headless Chrome 으로 우회했으나 SSG 메인으로 리다이렉트, 트레이더스 로고 에셋 없음
- 신세계그룹 뉴스룸 — **CI/BI 다운로드 섹션이 없다.** MEDIA LIBRARY 는 사진·유튜브만. `wp-json/wp/v2/media` 로 traders PNG 전량 조회 → **최대 900px, 투명본 0건**. 계열사 로고 세트(`themes/shinsegae/assets/images/logo/`)에도 트레이더스는 없다(404), 이마트도 256×256
- **위키미디어 커먼즈 — 트레이더스 로고 파일이 없다** (`Emart Logo.svg` · `Emart 24 logo.svg` 만 존재)
- 이마트 ESG 보고서 PDF (`company.emart.com` → `/investor/down.do`, `brd_seq=5796`) — 페이지 내 로고가 **48×12 급 초소형 래스터**. 벡터 아님
- 이마트 IR 발표자료 PDF (`brd_seq=5842`) — 트레이더스 BI 미수록
- 스타필드(`starfield.co.kr`) `assets/images/newgate/gate_logo*.svg` — 전부 **스타필드 자체 로고**, 입점 브랜드 아님

### 사용자가 직접 구할 때 쓸 단서

1. **소스가 있는 곳은 사실상 이마트 홍보팀뿐이다.** 공개된 최대 해상도가 보도자료의 900×330 불투명 PNG다 — 공개 채널을 더 파도 안 나온다
2. `logo-traders.png`(205×191 **투명**)가 **유일한 공식 투명본**이다. 규격만 못 맞출 뿐 형태·색은 정확하니, 이마트에 요청할 때 "이 파일의 원본(AI/SVG 또는 1000px+ PNG)"이라고 특정하면 된다
3. 트레이더스는 별도 법인이 아니라 **㈜이마트의 브랜드**다 — 문의는 이마트 홍보팀. 본사 서울 중구 세종대로7길 37
4. 로컬에 SVG 래스터라이저가 없다(`rsvg-convert`·`inkscape`·`magick`·`cairosvg` 전무). **SVG 를 구해 오면 headless Chrome 으로 변환할 수 있다** — 코스트코를 그렇게 처리했다 (위 절 참고)
5. ⛔ 900×330 보도자료 PNG 의 **흰 배경을 지워 쓰는 건 금지**다 (`README.md` — 남의 상표에 손대는 것)

## 트레이더스 홀세일 클럽 BI (2026-09-09)

| 파일 | 출처 | 받은 날짜 |
|---|---|---|
| `traders.png` | **사용자 제공** (`~/Downloads/image.avif` → ffmpeg 로 PNG 변환. 포맷 변환만, 형태·색 불변) | 2026-09-09 |

⚠️ **원 출처 URL 미기록** — 사용자가 어디서 받았는지 확인 필요.

### `logo-check` 불합격인데 쓰기로 한 근거 (2026-09-09 실측)

```
캔버스 870×480 rgb24 (알파 없음) · 로고 박스 잉크 668×259
```

`logo-check` 는 **투명 PNG 1000px+** 를 요구하고 이 파일은 둘 다 미달이다. 그럼에도 쓰는 근거:

1. **알파가 필요 없는 로고다.** 이 BI 는 연두 바탕(rgb 147,219,0) 위 검정 라운드 박스가 **형태 자체**다.
   배경을 지우면 오히려 BI 가 깨진다 — 알파 요구는 「흰 사각형이 뜨는 것」을 막으려는 것인데 여기선 해당이 없다
2. **확대가 아니라 축소로 쓴다.** 화면에서 로고 폭 ~400px 로 쓰면 이미지는 521px 로 배치된다 (870px 원본의 60%).
   1000px 규칙은 확대 여유를 위한 것이고, 축소 사용에는 걸리지 않는다
3. **대비 실측**: 연두 배경은 딥그린 위 5.37:1 · 크림 위 1.40:1, 검정 박스는 연두 위 12.37:1.
   → **크림 판 위에 올린다**. 연두 테두리가 흐려져도 검정 박스가 선명해 판독에 지장이 없다
   (코스트코는 반대다 — 빨강 1.86 / 파랑 1.15 로 딥그린 위에서 죽으므로 **반드시 크림 판 위**)

🔴 **배경 키잉으로 알파를 만들지 마라.** 남의 상표에 손대는 것이다 (README).
공식 투명본은 `https://eapp-cdn.emart.com/traders/common/logo-traders.png` 이 유일한데 **잉크 149×57** 로 너무 작다.
1000px+ 원본이 필요하면 이마트 홍보팀에 「그 파일의 원본(SVG 또는 1000px+ PNG)」으로 특정해 요청해야 한다.

> **여백 크롭 기록 (2026-09-09)**: `projects/00005-추석위스키/hyperframes/traders.png` 는 원본 870×480 에서
> 배경 여백만 잘라낸 668×259 다 (실측 잉크 경계 x101~768 · y111~369). **로고의 형태·색·비율은 그대로**이고
> 재배색·합성·배경 키잉은 하지 않았다. 라이브러리 원본(`resources/logos/traders.png`)은 손대지 않았다.

## 2026-09-10 추가 — 00006 아이폰18가격

| 파일 | 출처 | 받은 날 | 비고 |
|---|---|---|---|
| `coupang.png` (white solid) | [쿠팡 뉴스룸 공식 BI · 디스플레이용](https://news.coupang.com/archives/1257/) → `01-Coupang-Logo-Display.zip` | 2026-09-10 | 1423×320 rgba. **원본 그대로, 무변경** |
| `coupang-black.png` (black solid) | 같은 zip | 2026-09-10 | 1422×320 rgba. 크림 카드 위에 쓸 때 |
| `apple.svg` (white) | [Wikimedia Commons `Apple_logo_white.svg`](https://commons.wikimedia.org/wiki/File:Apple_logo_white.svg) | 2026-09-10 | ⚠️ 아래 주의 |
| `apple-black.svg` | [Wikimedia Commons `Apple_logo_black.svg`](https://commons.wikimedia.org/wiki/File:Apple_logo_black.svg) | 2026-09-10 | ⚠️ 아래 주의 |

### 🔴 쿠팡 — 사용 조건 (공식 [미디어 자산 브랜드 가이드라인](https://news.coupang.com/media-assets-brand-guidelines-kr/))

쿠팡을 **지칭하는 범위에서** 인쇄·온라인·공개 매체에 쓸 수 있는 **무상·비독점·취소 가능** 라이선스가 부여돼 있다.

| 금지 |
|---|
| 색상·글꼴·음영·기울기 등 **어떠한 변경도 불가** |
| 🔴 **로고 자체를 장식으로 만드는 애니메이션 금지** — 제자리 펄스·진동·깜빡임·회전·왕복 |
| 문장의 일부로 사용 · 하이퍼링크/네비게이션 도구로 사용 |
| 쿠팡의 **후원·보증·상업적 관계를 암시**하는 방식 |
| 색 구성 모방 |

🔴 **「애니메이션 금지」의 범위 — 2026-09-13 사용자 정정**

> *"로고는 움직여도되는데 제자리에서 흔들리듯이 반복하는걸 하지 말라는거야"*

| 된다 | 안 된다 |
|---|---|
| 화면에 **들어오는 진입** (`in`·`rise`·`wipe`) | **제자리 펄스** (이동 없이 커졌다 작아지기) |
| 자리를 옮기는 **이동** (`shift`) | **진동·흔들기** (`shake`), 반복 왕복 |
| 담긴 **카드가 함께 움직이는 것** | **회전·기울이기·찌그러뜨리기** · 색 변화(`tint`)·깜빡임 |

로고가 화면에 등장하고 자리를 잡는 것은 통상적 사용이다. 가이드라인이 막는 것은
**로고를 장식 요소로 부려 쓰는 것** — 계속 흔들리거나 맥박치게 만드는 연출이다.

⚠️ 이 구분은 `pipeline/motion-vocab.mjs` 의 「제자리 펄스」 지표와 같은 것을 센다.

영상은 **가로 1920px 권장**. 우리 소스는 1423px이고 화면 표시는 ~300px이라 확대 여유는 충분하다.

### ⚠️ 애플 — 상표 상태를 알고 쓴다

- 저작권: 미국에서 **퍼블릭 도메인** (1931~1977 사이 저작권 표시 없이 공표). Rob Janoff 디자인
- 🔴 **상표는 살아 있다.** Commons 파일에도 `Trademarked` 태그가 붙어 있고,
  애플은 자사 상표 가이드라인에서 라이선스 없는 로고 사용을 금한다. **공식 배포처가 없다**
- 우리 용도는 **어떤 회사의 제품 가격인지 식별하는 보도·비교** 목적이다 —
  `resources/logos/README.md` 의 「된다」 칸(원본 그대로 표시)에 해당한다
- 🔴 **변형·재배색·우리 락업과 혼합·애플보다 우리 마크를 작게 두기는 금지**
- **손댄 것**: 원본에 `viewBox` 속성이 없어 크기 조절이 불가능했다. `viewBox="0 0 <width> <height>"`
  **항등값**만 추가했다 — 형태·색·비율은 한 픽셀도 바뀌지 않는다 (`logo-check` 통과 요건)

## 2026-09-10 — 00007 아이폰듀오 vs 갤Z폴드8
- `samsung.svg` · https://upload.wikimedia.org/wikipedia/commons/b/b4/Samsung_wordmark.svg · 2026-09-10 · Wikimedia Commons · **Public domain**(단순 문자 조합, 저작권 성립 안 함) · **상표 유효(trademarked)** · 원본 무변경(#1428a0 삼성 CI 블루 그대로) · 7051×1080 벡터
  - ⚠️ 색 변경 금지 — 딥그린 위에 직접 올리지 말고 **밝은 카드 위**에 배치할 것
  - ⚠️ `Samsung Galaxy logo ("Galaxy" logo only).svg` 는 **CC BY-SA 4.0** 이라 채택하지 않았다 (저작자 표시·동일조건 부담)
- `hanaromart.png` · 농협하나로유통 공식 CI 페이지 https://www.nhhanaro.co.kr/mbshome/mbs/nahh001/subview.do?id=nahh002_010800000000 → `https://www.nhhanaro.co.kr/hanaro_CI.zip` (세션 쿠키 필요) 내 `BS01 outline.ai` 벡터 원본을 투명 배경으로 래스터화 후 지면에서 워드마크 영역만 오려냄 · 3383×647 rgba · 2026-09-11 · ⚠️ 형태·색·비례 변경 금지(공식 규정). 지정색 PANTONE 354C — 화면 RGB 값은 색공간 변환 결과이므로 정답으로 쓰지 말 것. BS-02 는 길이 13mm 이하 사용 제한
- airpods5-hero.jpg · https://www.apple.com/newsroom/images/2026/09/apple-introduces-airpods-5-with-best-in-class-open-ear-active-noise-cancellation/article/Apple-AirPods-5-hero-260909_big.jpg.large_2x.jpg · 2026-09-12 (00010 전용, projects/ 에만 보관)
- airpods5-case.jpg · .../Apple-AirPods-5-Wireless-Charging-Case-260909_inline.jpg.large_2x.jpg · 2026-09-12 (00010 전용)
- airpods4-hero.jpg · https://www.apple.com/newsroom/images/2024/09/apple-introduces-airpods-4/article/Apple-AirPods-4-with-case-240909_big.jpg.large_2x.jpg · 2026-09-12 (00010 전용)
- `parisbaguette-wordmark.svg` · Wikimedia Commons "Paris Baguette logo.svg" https://commons.wikimedia.org/wiki/File:Paris_Baguette_logo.svg (원본 https://upload.wikimedia.org/wikipedia/commons/b/b7/Paris_Baguette_logo.svg) · 텍스트 로고타입(단순 도형/문자라 저작권 임계 미달, 상표권은 별도) · SVG viewBox 250×18, 네이비 #023586 단색 벡터 경로 · 2026-09-13 · ✅ `logo-check.mjs` 통과
  - ⚠️ 공식 원형 심볼("ⓑ" + PARIS BAGUETTE BOULANGERIE/BAKERY CAFÉ 링)은 공식 사이트(parisbaguette.com, WP 미디어 ID 44 `paris-baguette-mark.svg`)에서 실물을 확인했으나 마스터 해상도가 **720×720**(REST API `media_details` 확인, 더 큰 사이즈 없음)로 1000px 미달이라 채택하지 않음. 임의 업스케일은 로고 변형 금지 원칙에 위배되어 보류. 기존 `parisbaguette.png`(354×356, 알파 없음)는 그대로 둠
- 00013 제품 사진 2종 (`sandwich-duo.png`·`sandwich-close.png`) · 땡겨요 앱 파바데이 이벤트 배너 캡처 (사용자 제공 IMG_7767·IMG_7768) · 2026-09-13
- `nts.svg` — 국세청 CI (상징 MI, 태극문양 + "국세청 National Tax Service" 워드마크), 출처 https://hometax.go.kr/css/comm/bpr_portal_images/logo_nts.svg (홈택스 사이트 헤더가 직접 서빙하는 국세청 소유 원본 SVG. `nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=6738&cntntsId=8139` "국세청 상징" 페이지 배포 zip(`nts_ci(mi).zip`)의 AI 파일을 pdftocairo 로 변환한 결과와 동일 도안 확인) · SVG viewBox 252.7×98.9, Adobe Illustrator 내보내기의 비활성 `<switch><foreignObject requiredExtensions="&ns_ai;">` 폴백 스텁과 렌더링에 쓰이지 않는 Illustrator 전용 base64 왕복 편집 데이터(`<i:aipgf>`, 원본의 97.8%)만 제거 — 실제 벡터 경로·색상은 그대로, 로컬 서버로 띄워 원본과 픽셀 대조 완료 · 라이선스: 정부(국세청) 저작물, 상징(MI) 다운로드 목적 공개 배포 · 받은 날짜 2026-09-14 · ✅ `logo-check.mjs` 통과
- `hometax.svg` — 홈택스 CI (지붕/집 심볼 + "국세청홈택스 HomeTax" 워드마크), 출처 https://hometax.go.kr/css/comm/bpr_portal_images/logo_hometax.svg (홈택스 사이트 헤더가 직접 서빙하는 원본 SVG) · SVG viewBox 287.2×87, 위와 동일하게 비활성 AI `<switch>/<foreignObject>` 스텁과 `<i:aipgf>` 편집용 블롭만 제거(벡터 경로·색상 불변, 원본과 픽셀 대조 완료) · 라이선스: 정부(국세청) 저작물 · 받은 날짜 2026-09-14 · ✅ `logo-check.mjs` 통과

## baemin.png (2026-09-14)
- 배달의민족 워드마크 949×216 RGBA
- 출처: https://www.baemin.com/ 공식 사이트 헤더 (_next/static/media/baemin_logo.684531d5.png)
- ⚠️ 1000px 기준에 51px 미달. 화면 표시 폭 400px 이하에서만 쓴다 (2.4배 여유)

## ~~yogurtworld.png~~ (2026-09-14 폐기 — 벡터 SVG 로 대체)
- 요거트월드 워드마크 1080×1080 — 파란 바탕(#4A86EC)에 흰 글씨. **배경색이 브랜드 CI 의 일부**다
- 출처: 공식 인스타그램 @yogurtworld_official 프로필 이미지 (원본 1080×1080)
- 공식 홈페이지 /images/3_con01_17.png (브랜드 규정집) 과 **같은 워드마크**임을 대조 확인
- ⚠️ logo-check 는 '알파 없음'으로 불합격시킨다 — 그 검사는 '의도치 않은 흰 사각형'을 잡는 것이고,
  이 파일은 파란 배지 자체가 로고다. 딥그린 위에 그대로 얹는다

## yogurtworld.svg (2026-09-14) — 이걸 쓴다
- 벡터 SVG viewBox 0 0 240 22 · path 12개 순수 벡터 · fill=white (딥그린 배경에 원본 그대로 맞다)
- 출처: https://yogurtworldfran.co.kr/assets/img/common/footer-logo.svg (요거트월드 가맹 사이트 푸터)
## yogurt-cup.png (2026-09-14)
- 제품 사진 1698×1723 RGBA 배경 투명 · 워터마크·프로모션 문구 없음
- 출처: yogurtworld.co.kr 공식 메뉴 「믹스베리월드」 원본

## mcst.png · mcst-mono.png (2026-09-15)
- 문화체육관광부 상징(MI) 국문 좌우조합 — `mcst.png` 테두리형(정부상징 태극 컬러) 2154×477 RGBA,
  `mcst-mono.png` 단색형 1(1도, 검정) 2154×477 RGBA. 둘 다 알파 있음
- 출처: https://www.mcst.go.kr/site/s_about/intro/symbol.jsp 「문화체육관광부상징 2017.zip」 공식 배포본
  (`/servlets/eduport/front/upload/UplDownloadFile?pFileName=문화체육관광부상징 2017.zip&pRealName=mcst_logo_2017.zip&pPath=PORTAL.DOCUMENT.UPLOAD`)
- 원본 zip 그대로 추출 · 색·경로 손대지 않음 · 받은 날짜 2026-09-15
- ⚠️ 정부상징은 「정부상징 디자인 지침서 2017」 적용 대상 — 변형·재배치 금지, 원본 비율 그대로 표시

## kto.svg (2026-09-15)
- 한국관광공사 CI — 심볼(4색 곡선) + 「한국관광공사 KOREA TOURISM ORGANIZATION」 워드마크
- 벡터 SVG viewBox 0 0 139 46 · 순수 path · 원본색 5종(#E1002A·#F49C00·#FFF265·#EB83B2·#767575)
- 출처: https://knto.or.kr/humanframe/theme/kto/assets/image/_layout/logo_kto.svg (공사 공식 사이트 헤더가 직접 서빙하는 원본)
- 원본 그대로 · 색·경로 손대지 않음 · 받은 날짜 2026-09-15
- ⚠️ `logo-check` 의 「색 N종 하드코딩」 잣대는 **아이콘 전용**으로 바뀌었다 (2026-09-15).
  브랜드 CI 는 원본 색이 규칙이라 이 검사를 걸면 정상 원본이 불합격한다

## mafra.png (2026-09-16)
- 농림축산식품부 정부상징(MI) 국문 **좌우조합** — 4283×954 RGBA, 알파 있음
- 출처: https://www.mafra.go.kr/sites/home/download/signature.zip
  (「MI 및 상징물」 페이지 https://www.mafra.go.kr/home/5298/subview.do 가 직접 배포하는 공식 zip.
   16개 파일 = 국/영/혼합 × 상하/좌우 의 .ai + .jpg. 이 중 `농림축산식품부_국_좌우.ai` 를
   `pdftocairo -png -transp -r 600` 으로 변환 — 벡터 원본 그대로, 색·경로 손대지 않음)
- ⚠️ 정부상징은 「정부상징 디자인 지침서 2017」 적용 대상 — 변형·재배치 금지, 원본 비율 그대로 표시
- 받은 날짜 2026-09-16 · ✅ `logo-check.mjs` 통과

## handon.svg (2026-09-16)
- 한돈 공식 CI — 노란 원(#EDC429) 위 붓글씨 「한돈」(#231815) + KOREA POR K + 좌상단 「우리돼지」 관인(#D0121B)
- 벡터 SVG viewBox 0 0 80 80 · 원본색 3종 + 그라디언트 2종
- 출처: https://www.han-don.com/images/logo-dot-bk.svg (한돈자조금 공식 사이트가 직접 서빙하는 원본)
- 원본 그대로 · 색·경로 손대지 않음
- ⚠️ 같은 사이트의 `logo-dot-wh.svg` 는 **흰색 단색본**이라 크림 무대(#F2E8D5)에서 보이지 않는다.
  딥그린 밴드에는 우리 락업만 두므로 쓸 자리가 없다 — 컬러본(이 파일)을 쓴다
- ✅ `logo-check.mjs` 통과 (브랜드 CI 는 「색 N종」 잣대 제외 — 2026-09-15 개정)

| `kdca.svg` | https://www.kdca.go.kr/sites/kdca/images/layout/head_logo.svg | 2026-09-16 | 질병관리청 공식 웹사이트 CI. 원본 SVG, 색·비율 유지. |

- 2026-09-16 · seoul-official-horizontal.svg · 서울특별시 공식 CI 가로 조합. https://www.seoul.go.kr/seoul/emblem.do → https://www.seoul.go.kr/upload/seoul/emblem/ci.zip 의 PDF 호환 ci.ai를 pdftocairo SVG 변환 후 해당 조합의 원본 path만 추출(색·형상 불변). 정책 주체 식별용, 제휴·후원 표시 아님.

- kinfa.svg · 서민금융진흥원 공식 원본 SVG · https://www.kinfa.or.kr/images/does/common/img_header_logo.svg · 안내 https://www.kinfa.or.kr/introduce/kinfaCI.do · 2026-09-16 · 원본 색상·비례 보존, 정보 출처 식별용

- taean-halftrip.svg · 태안 반값여행 공식 누리집 헤더의 원본 SVG · https://taeantour.kr/theme/wering/img/logo.svg · 2026-09-17 · 원본 색상·비례 보존, 사업 식별용 · `logo-check.mjs` 프로젝트 자산 판정 통과

- gimcheon-gimbap-festival-2026.png · 2026 김천김밥축제 공식 로고(「2026 김천김밥축제」+녹색 「김밥특별시 Gimbap Metropolitan·Special City」 표지판, 1558×767 RGBA) · https://gimbapcity.kr/images/common/logo.png (공식 누리집 https://gimbapcity.kr/ 헤더) · 2026-09-29 · 원본 그대로. 행사 식별용, 제휴·후원 표시 아님
- 2026-10-08 · arisu.svg · arisu-ko-eng.svg · 서울아리수본부 공식 BI(영문 조합·한글영문 조합). https://arisu.seoul.go.kr/home/sub?menukey=7611 → /static/templates/project/home/download/bi.zip 의 PDF 호환 .ai를 pdftocairo SVG 변환 후 viewBox만 로고 경계로 자름(색·형상 불변). 서울 수돗물 브랜드 식별용, 제휴·후원 표시 아님.
- ybmecc.svg · https://www.ybmecc.com/images/com/ecc_logo_color.svg (YBM ECC 공식 홈페이지 헤더 로고 · ECC Plus 컬러 · viewBox 142.63×116.67) · 2026-10-18 · 원본 그대로(ABM resources/logos에서 복사). 상표 — 변형·효과 금지, 제휴·후원 표시 아님(ABMEN 00116)
