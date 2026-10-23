# resources/icons/ — 픽토그램 (SVG)

**정보형 인포그래픽에서 아이콘 하나가 문장 하나를 대신한다.** 00003 에서 워커가 배달 오토바이를
`<div>` 와 `border-radius` 로 직접 그렸다 — 그 시간이 아이콘 한 장이면 끝났다.

## 출처와 라이선스

| | |
|---|---|
| 출처 | [google/material-design-icons](https://github.com/google/material-design-icons) — Material Symbols Outlined |
| 라이선스 | **Apache License 2.0** — 상업적 이용·수정·재배포 가능. 저작자 표시 의무 없음 |
| 받은 날 | 2026-09-09 |
| 받은 방법 | `symbols/web/<이름>/materialsymbolsoutlined/<이름>_24px.svg` |

⚠️ **다른 곳에서 받은 아이콘을 여기 섞지 마라.** 라이선스가 섞이면 어느 것이 안전한지 알 수 없게 된다.
다른 출처가 필요하면 **폴더를 나누고 이 표를 그 폴더에도 만들어라.**

## 왜 SVG 인가

- **무한 확대해도 안 깨진다.** 1080 폭 화면에 어떤 크기로 넣어도 된다 (PNG 는 `CLAUDE.md` 「자산을 넣을 때」 계산이 필요하다)
- **색을 우리가 칠한다.** 이 파일들은 `fill` 속성이 없어서 CSS 가 정한 색을 그대로 따른다

```css
/* 딥그린 위 크림 · 강조는 골드 */
.icon { width: 96px; height: 96px; fill: #F2E8D5; }
.icon--accent { fill: #F2C230; }
```

```html
<!-- HyperFrames 프레임 안에서 -->
<img src="/icons/warning.svg" class="icon" alt="">
```

⚠️ `<img>` 로 넣으면 **CSS `fill` 이 안 먹는다.** 색을 바꾸려면 SVG 를 인라인으로 붙여 넣거나
`filter` 를 쓴다. 색이 하나뿐이면 `<img>` + `filter: brightness()` 로 충분하다.

## 지금 들어 있는 것 — 정보 종류에 맞춰 골랐다

`docs/13-astra-agent-motion.md` §6 「정보 종류 → 모션 사전」의 분류를 그대로 따랐다.
**추측으로 고르지 않았다.**

| 정보 종류 | 아이콘 |
|---|---|
| 마감·경고 | `calendar_month` · `schedule` · `warning` |
| 조건·단서 | `info` · `block` · `check_circle` · `description` |
| 금액·할인 | `payments` · `sell` · `percent` |
| 대상 | `person` · `group` · `how_to_reg` |
| 장소·이동 | `storefront` · `location_on` · `local_shipping` · `directions_boat` |
| 음식·장보기 | `restaurant` · `shopping_cart` · `scale` · `set_meal` · `ramen_dining` · `local_convenience_store` | (2026-09-11 추가 · 뒤 셋 2026-09-27 롱폼 L3 노선 정거장 — 같은 출처·같은 받는 방법) |
| 장소·문화 | `local_cafe` · `sports_esports` · `hot_tub` · `bathtub` | (2026-09-29 롱폼 L4 노선 정거장 — 같은 출처·같은 받는 방법) |
| 교통약자·좌석 | `pregnant_woman` · `elderly` · `accessible` · `stroller` · `directions_bus` · `visibility` | (2026-09-24 추가 · 00015 · 채움형 `<이름>_fill1_24px.svg`)
| 미용·서비스 | `content_cut` · `lock` · `water_drop` · `receipt_long` · `spa` · `face` | (2026-10-07 추가 · 00061 미용실 — 같은 출처·같은 받는 방법) |
| 거리 질서 | `wc` · `volume_up` · `sports_bar` · `delete` · `local_taxi` | (2026-10-08 추가 · 00073 범칙금 — 같은 출처·같은 받는 방법) |
| 이동·결제·노을 | `directions_walk` · `credit_card` · `credit_card_off` · `wb_twilight` | (2026-10-14 추가 · 00115 스카이캡슐 — 같은 출처·같은 받는 방법) |
| 롱폼 정거장(L5~L14) | `grass` · `forest` · `compost` · `home` · `subway` · `event_seat` · `apartment` · `account_balance` · `hiking` · `rice_bowl` · `festival` · `local_mall` · `local_drink` · `soup_kitchen` · `bakery_dining` · `room_service` · `kitchen` · `museum` · `cabin` · `music_note` · `landscape` · `location_city` · `fort` · `water` | (2026-10-08 추가 · 롱폼 묶음 00077~ 노선 정거장 — 같은 출처·같은 받는 방법) |

## 새로 받을 때

1. [fonts.google.com/icons](https://fonts.google.com/icons) 에서 **Material Symbols** 로 찾는다
2. 위 URL 규칙으로 받거나 사이트에서 SVG 를 내려받아 이 폴더에 둔다
3. **규격을 잰다** — 통과 못 하면 화면에 올리지 마라:

```bash
node pipeline/logo-check.mjs
```

검사 항목 (래스터와 잣대가 다르다):

| | 왜 |
|---|---|
| `viewBox` 있음 | 없으면 크기를 바꿀 수 없다 |
| 래스터 임베드 없음 | `<image href="data:image/png…">` 은 **벡터인 척하는 비트맵**이라 확대하면 깨진다 |
| `script`·`foreignObject` 없음 | 렌더러마다 다르게 나온다 |
| 색이 안 박혀 있음 | 우리 팔레트로 칠할 수 없다 |

## 🔴 하지 말 것

- **남의 상표를 아이콘으로 흉내 내지 마라.** 브랜드 마크는 `resources/logos/` 의 원본 CI 를
  그대로 쓰는 것만 허용된다 (`resources/logos/README.md`). 비슷하게 그린 픽토그램으로 대신하는 것은
  **변형 합성**이고 금지다
- **아이콘으로 화면을 채우지 마라.** 「한 화면 한 메시지」가 먼저다. 아이콘은 글자를 줄이는 수단이지
  글자 옆에 장식을 더하는 수단이 아니다
- **데드존을 잊지 마라.** 우측 x960 · 자막존 y1260 (`docs/09-safezone.md`)
