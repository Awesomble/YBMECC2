# resources/brand/ 출처

- `ybmecc-mark.svg` · **YBM ECC 공식 마크**(ECC Plus 컬러 — 버건디 #A51D4D·오렌지 #F69321, viewBox 142.63×116.67) · https://www.ybmecc.com/images/com/ecc_logo_color.svg (ybmecc.com 헤더 `<img alt="YBM ECC">`) · 2026-10-20 내려받음 — ABMEN `resources/logos/ybmecc.svg`(2026-10-18)와 바이트 동일 · 원본 그대로. 상표 — 재채색·늘이기·효과·잘라 쓰기 금지. 가맹본부 CI 가이드 미확인(docs/channel/02-platform-rules.md §1-8).
- `ybmecc-daechi-tab.png` · **기본 로고(C 탭형)** 1396×440 투명 · 흰 캡슐(공식 마크 무변형) + 버건디 캡슐(흰 Pretendard Black 「대치점」), 이음매 오렌지 6px 줄. 영상 좌상단 x80·y228·높이 112(폭 약 355) — `pipeline/templates/brand.json` `logo`.
- `ybmecc-daechi-plate.png` · A 가로형 1380×432 투명 · 흰 캡슐 안 마크 │ 오렌지 세로줄 │ 버건디 「대치점」.
- `ybmecc-daechi-clear.png` · A′ 판 없는 가로형 1124×368 투명 · 밝은 단색 카드·엔딩 카드용.
- `ybmecc-daechi-stack.png` · B 세로 스택 1014×1158 투명 · 흰 판 위 마크, 아래 버건디 띠 「대치점」.
- `ybmecc-daechi.html` · 위 네 PNG의 원본(2026-10-20 Claude 조판 — Pretendard Black SIL OFL, 공식 마크는 `<img>`로 무변형). **다시 뽑기:** Chrome 헤드리스로 이 파일을 열어(`--allow-file-access-from-files`) 배경을 투명으로 두고(`Emulation.setDefaultBackgroundColorOverride` a=0) `#t`·`#h`·`#hc`는 deviceScaleFactor 4, `#s`는 6으로 요소 스크린샷 → 위 파일명. 판 모서리 반지름은 `logo-check` 컷아웃 기준(투명 3% 이상)을 넘기는 값이다(캡슐·40px).

「대치점」은 2026-10-20 사용자 지시 표기다(공식 지점 표기는 「대치」·「ECC대치」 — docs/channel/07-evidence.md Y01). 로고를 바꿀 때는 **새 파일명**으로 들이고 `brand.json` `logo.file`·`asset`만 바꾼다 — 게이트 4가 프로젝트 사본과 이 폴더 원본의 해시를 대조하므로 제자리에서 덮어쓰지 않는다. 디자인 기준 docs/channel/05-brand-pipeline.md §2-1.
