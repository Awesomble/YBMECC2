---
name: ss
description: 영상의 **정지 화면 시안 + 대본**을 번호 매긴 이미지 시트로 올리는 보고 지점이다(video ④의 B·C 보고 — 올리고 같은 턴에 대표 동작 검증·안무로 계속, 멈추지 않는다 2026-10-22). 사용자가 "/ss", "/ss 00009", "시안 보여줘", "정지 화면 확인", "컷 이미지로 보여줘", "검수 시트", "대본이랑 시안 컨펌", "수정할 거 볼 수 있게" 같은 요청을 하거나, 안무를 시작하기 전 화면 구도를 눈으로 확인받아야 할 때 사용한다. 렌더 후 마감 확인(`--from`)도 이 스킬로 한다. ⚠️ 영상 제작 전체는 /video, 업로드 문안은 /review 다.
---

# 시안·검수 시트 — B·C 보고와 렌더 후 확인

> *"시안과 대본 컨펌 후 모션과 대사 입히는 것으로 넘어가게"* — 2026-09-15 사용자

이 스킬은 공용 video 절차의 **시트 보고 입구**다(올리고 같은 턴에 계속 — 멈추는 곳이 아니다, 2026-10-22). 판정 기준과 순서의 정본은 `.claude/skills/video/stages/4-designer.md`(「골격과 정지 화면」 6번 = B 보고, 「검증과 C 보고」)와 `.claude/skills/video/SKILL.md` 「제작 흐름과 컨펌」이다. 여기서는 시트를 만들고, 보이고, 지적을 받는 절차만 다룬다.

프로젝트를 안 줬으면 가장 최근 폴더(`ls -td projects/*/ | head -1`)를 고르고 **어느 것인지 밝히고** 진행한다(인자 없는 `status.sh`는 전 프로젝트를 조회한다 — 쓰지 않는다). 같은 번호의 폴더가 둘이면 도구가 멈추니 폴더명 전체로 지목한다.

## 1. 시트를 만든다 — 실제 root에서

```bash
node pipeline/hf-cli.mjs <p> lint
node pipeline/layout-scan.mjs <p>                    # 하드가 남으면 보내지 않는다 — 내가 아는 결함을 사용자가 찾게 하지 않는다
node pipeline/review-sheet.mjs <p>                   # → projects/<p>/output/review/sheet-N.png + index.json(시트/칸 → 컷 → 프레임)
node pipeline/review-sheet.mjs <p> --from <영상.mp4>  # 렌더 후 마감 확인 — 실제 납품 화소. 어느 판인지 말로도 밝힌다
node pipeline/poster-sheet.mjs <p> <고른 안.html> <안2.html> <안3.html>   # B 맨 앞 — 0초 포스터 3안 비교 시트 → output/review/poster-sheet.png (4-designer 「0초 포스터」)
node pipeline/hf-cli.mjs <p> snapshot --at 0 --no-end -o ../output/stills/frame0   # B 맨 앞 — 0.0초 화면 (review-sheet 는 정착 시각을 뽑는다)
node pipeline/hook-check.mjs <p>                     # C 맨 앞(시트 0) — 첫 3초 훅 잠금 시트 + 시각 대조
node pipeline/hook-check.mjs <p> --from <영상.mp4>    # 렌더 후 — 최종 MP4의 첫 3초 시트
```

시트는 `projects/<p>/hyperframes/`의 실제 프레임에서 뽑는다. `hf-compile`의 컴파일 시안은 골격 초안일 뿐이며, 직접 그린 프레임을 재컴파일로 덮지 않는다. 시트는 보고 직전에 한 번 만든다. 브라우저를 실행할 수 없는 환경이면 정적 검사까지만 하고 시트는 미검증으로 넘긴다 — 오래된 시트를 최신인 척 보내지 않는다.

## 2. 보인다 — 경로가 아니라 이미지

- 보내기 전에 시트를 **직접 열어 본다**(이미지 읽기). 훅·절정·조건·마무리의 위계, 잘림·가림·폰트·CI·자막을 확인하고 이미 보이는 결함은 먼저 고친다.
- 파일 전송 도구(`SendUserFile` — Remote Control·클라우드 세션)가 있으면 시트 전부를 **한 메시지로** 보낸다. 없으면 시트 경로 전부를 한 메시지에 적고 `open <시트 경로들>`로 띄운다.
- 함께 보낼 것 — **B:** 맨 앞에 `output/review/poster-sheet.png`(0초 포스터 고른 안 크게·나머지 작게, 4-designer 「0초 포스터」)와 고른 이유, 0.0초 화면과 README 「첫 3초 비트」·0초 포스터 세 줄, video SKILL 「최우선 — 첫 1·2·3초」 0.0초 포스터 행(주제 제목·후킹·키 비주얼을 한 줄씩)·원칙 1·2·3·5에 따른 판정, 대본 전문(컷별 대사 + 실측 `dur`). **C:** 맨 앞(시트 0)에 최신 `node pipeline/hook-check.mjs <p>`의 `output/review/hook-sheet.png`와 대조 출력, 이어서 최신 번호 시트와 검증 결과.
- 지목 방법은 「시트-칸」(예: `3-2 숫자가 작다`). **모아서 받는다** — 한 건씩 고치지 않는다.
- 스튜디오는 사용자가 요청할 때만 `pipeline/preview.sh <p> user`로 열고 끝나면 `pipeline/preview.sh --stop-all`. `npx hyperframes preview`를 직접 부르지 않는다.

## 3. 지적을 받으면 — 손대기 전에 장부부터

```bash
node pipeline/fix-batch.mjs open <p> "1-8 숫자가 작다" "2-3 겹침" "4-1 여백이 죽었다"   # 메시지의 지적 전부
node pipeline/fix-batch.mjs type <p> 1 "위계 — 숫자 크기" 4                             # 항목마다 유형 + 전수 적중수
node pipeline/fix-batch.mjs close <p>                                                   # 전부 고친 뒤
```

장부가 열려 있으면 렌더·시트·단계 게이트가 exit 3으로 막힌다. 「이 한 칸」이 아니라 **「이 종류가 몇 컷에 있나」**를 세어 전부 고친다. 같은 유형으로 왕복이 2회를 넘으면 멈추고, 검사기가 그 유형을 못 보는 원인을 보고한다.

## 4. 통과 뒤

B 통과는 첫 프레임의 주연·결과와 대본의 확인이다. 본문의 구도·움직임까지 동결하지 않고, 첫 3초의 동작 검증을 대신하지 않는다. 이후(훅 잠금 `hook-check` → 대표 본문 → 워커 분담 → 조립 → C 보고)는 4-designer를 따른다. 안무 중 구도를 크게 바꾸면 **바꿨다고 말하고** 바뀐 칸의 시트를 다시 보인다.

## 하지 않는 것

- **파일 경로만 알려주기** — 전송 도구가 없어도 경로 전부와 `open`으로 이미지를 띄운다
- **글 표로 보고하기** — 시트 없이 `scene·focal·roles`만 보내면 화면이 좋은지 알 수 없다 (ABM에서 표 승인 후 "초보 텍스트 모션" 반려)
- **정지 프레임으로 모션·이음매를 판정하기** — 재생으로 본다 (와이프·스태거의 중간 상태는 원래 어색하다)
- **B 통과 전에 본문 안무를 확장하기** — 순서는 B → 훅 잠금(0~3초 안무·`hook-check`) → 대표 본문 → 팬아웃이다(video ④)
- `layout-scan` 하드를 남긴 채 보내기 · 한 건씩 고치기 · 시트를 `projects/<p>/output/review/` 밖에 만들기

번호 시트를 쓰는 이유: `docs/02-pitfalls.md` §73.
