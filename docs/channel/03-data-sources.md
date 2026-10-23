# 03. 자료 — 학원에서 받을 것과 받는 방법

개정일 2026-10-20. 이 채널의 1차 자료는 **지점이 가진 사실과 사진**이다. 인터넷 조사는 법규·본사 공식 표기 확인에만 쓴다.

## 1. 편마다 받을 것 (① 분석 입력)

| 자료 | 누가 | 어디에 | 비고 |
|---|---|---|---|
| 원생 수업·행사 사진(가능하면 세로·자연광·여러 장면) | 원장·담임 | `projects/<p>/photos-in/` → `photo-intake` | 보호자 서면 동의 목록과 함께. 동의 없는 아이는 처음부터 빼고 받는다 |
| 짧은 실제 영상 클립(선택) | 원장·담임 | `projects/<p>/photos-in/`에 같이 두고 README에 메모 | 클립도 동의 장부에 올린다. 클립 접수 도구는 아직 없다 — 사용자에게 알리고 수동 처리 |
| 이 편이 말할 사실 — 활동 이름·과정명·대상 연령·일정·장소 | 원장 | README `## 확정 팩트` (원장 확인 날짜) | 행사 날짜·설명회 시간·정원은 **원장 확인값만** |
| 실적·수상·후기를 쓰고 싶을 때 그 근거 | 원장 | README 확정 팩트 + 근거 원본은 `assets/refs/` | 조사 주체·기간·기준이 없으면 쓰지 않는다 (02 §1-3) |
| 교습과정·교습비 5항목(지점 공통) | 원장 | `pipeline/templates/brand.json` `academy` | 바뀌면 그날 고치고 07 Y01에 날짜를 적는다 |

## 2. 원생 사진 접수 순서

```bash
node pipeline/photo-intake.mjs <p>            # photos-in/ 없으면 만든다 → 사진을 넣고 다시
node pipeline/photo-intake.mjs <p>            # 회전·축소·메타데이터 삭제 → assets/photos/NN-*.jpg, README 「## 사진 동의」 줄 추가, output/photos/sheet.png
# README 「## 사진 동의」에서 보호자 동의를 확인한 줄만 ✅ 로 바꾼다 (범위·기간 칸도)
node pipeline/photo-intake.mjs <p> --check    # ✅ 없는 사진이 있으면 exit 1
```

- 사진은 **git 밖**이다(`.gitignore` — photos-in·assets/photos). 컴퓨터를 옮기면 학원 원본에서 다시 들인다.
- 생성기(Codex image_gen 등)·외부 업로드 서비스에 원생 사진을 넣지 않는다. 배경 제거가 필요하면 로컬 도구만(`hyperframes remove-background`, CoreML).
- 번호 시트를 보고 식별 정보(이름표·교복 학교명·셔틀 번호)가 보이면 비고 칸에 적고 화면에서 가린다.

## 3. 공식 자료 (한 번 확인하고 재사용)

| 자료 | 위치 | 용도 |
|---|---|---|
| 지점 상호·등록번호·주소·대표번호 | https://www.ybmecc.com/daechi 하단 | brand.json `academy` (07 Y01) |
| 프로그램명·대상 연령·슬로건 | ybmecc.com 홈·지점 홈 | 과정명 표기 (07 Y01) |
| YBM ECC 마크 | `resources/brand/ybmecc-mark.svg` (ybmecc.com 헤더 원본) | 로고 락업 (05 §2-1) |
| 법규 원문 | 법제처 국가법령정보 공동활용 API | 02 §1 (07 Y02~Y07) |

본사 홈페이지 문구(「모국어처럼」「결과로 증명」)는 본사의 브랜드 주장이다 — 지점 영상 대사로 그대로 옮기지 않는다.
