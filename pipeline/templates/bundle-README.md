# {{NAME}} — 숏츠 묶음 롱폼 (1920×1080)

생성 {{DATE}} · 정본 `docs/channel/08-longform.md` · 조립 `node pipeline/hf-bundle.mjs {{NUM}} <plan|build|verify|chapters>`

## 약속

> (제목이 약속하는 시청자의 질문 한 줄. 모든 챕터가 이 약속의 한 조각이다)

제목 후보(⛳A): 1. 2. 3. · 썸네일 = 0초 포스터(챕터 1 한 장) — 볼 이유(가장 큰 글자)·주제 제목 후보(08 §8.1):

## 챕터

`plan` 출력의 시각·음량을 그대로 옮긴다. 원본은 **납품 렌더 봉인과 일치할 때만** 묶인다.

| # | 원본 프로젝트 | 승인 렌더 | 길이 | 시작 | 라벨(승인 영어 제목) | 챕터 1 선택 근거 / 보강(§7.4) |
|---|---|---|---:|---:|---|---|
| 01 | | | | 0:00 | | |

## 프레임 방식 (08 §4.3)

전 프레임을 B로 찍은 시트에서 세로 기둥(1080폭 배경)과 가장자리에 드러난 대기 요소를 고른다. 고칠 프레임은 `hyperframes/override/chNN/compositions/frames/`에서 배경만 좌우 끝까지 넓힌다(B 확장). C(색면 칼럼)는 쓰지 않는다.

| 챕터 | 프레임 | 시트에서 본 것 | 결정(B/B 확장/R) | 한 일 |
|---|---|---|---|---|

## 검증 기록

- `verify`(렌더 전 무대 동일성):
- `render-gate`:
- `verify --video`(규격·챕터 음량 차이):
- 수정 묶음(fix-batch): 지적 전수 → 한 번 수정 → 재검수

## 썸네일 = 0초 포스터 (08 §3.1·§8.1)

대표 영상(챕터 1 = 공개 조회수가 가장 높은 편) 한 장. ④에서 렌더 전에 만든다: `thumb frames <poster_s>`(챕터 1 첫 화면) → `cards/thumbnail.html`(틀 `pipeline/templates/thumbnail-long.html`, #t1 `data-frame`·`data-box`가 상자 기록) → `thumb check` 통과 → `output/thumbnail.jpg` → `verify`(0초 = 썸네일 · 주연 그림 = 챕터 1 첫 화면).

- 챕터 1 조회수(catalog --views, 읽은 날): · 볼 이유(가장 큰 글자): · 주제 제목: · +N MORE:
- `thumb check`: · `verify` 포스터: · 휴대폰 그림(360×202·168×94)에서 읽힌 것:
- 업로드 뒤 YouTube Studio 인트로(30초 유지 비율): 

## 공개

- 설명란 챕터: `node pipeline/hf-bundle.mjs {{NUM}} chapters`
- Related video 연결: 챕터 1 숏츠부터
- 업로드 기록(처음 30초 유지율·챕터 경계 이탈):
