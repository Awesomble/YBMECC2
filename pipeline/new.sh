#!/bin/bash
# 새 영상 프로젝트 — 영상 하나 = 폴더 하나 (projects/NNNNN-슬러그 · 롱폼은 projects/NNNNN-long-슬러그)
#
# 사용: pipeline/new.sh <슬러그> [--long] [--photo] [--bundle]
#   기본      세로 숏츠 9:16 + HyperFrames 로컬 골격
#   --long    가로 롱폼 16:9
#   --bundle  숏츠 묶음 롱폼 1920×1080 — cuts.json 명세 + README만. 조립은 hf-bundle (docs/channel/08-longform.md)
#   --photo   AI 실사 경로 (레거시·보류) — motion/ 없이 assets/ 만. 절차는 /video 스킬 A 경로
#
# 진행 단계는 pipeline/status.sh 가 파일 존재로 판정한다 (별도 상태 파일 없음).
set -euo pipefail
source "$(dirname "$0")/lib/resolve.sh"
cd "$ABM_ROOT"

SLUG=""; ORI=portrait; LABEL="숏츠·릴스 9:16"; PHOTO=0; BUNDLE=0
for a in "$@"; do
  case "$a" in
    --long)  ORI=landscape; LABEL="가로 롱폼 16:9" ;;
    --photo) PHOTO=1 ;;
    --bundle) BUNDLE=1 ;;
    --*) echo "알 수 없는 옵션: $a"; exit 1 ;;
    *) SLUG=$a ;;
  esac
done
[ -n "$SLUG" ] || { echo "사용: pipeline/new.sh <슬러그> [--long] [--photo] [--bundle]"; exit 1; }
case "$SLUG" in *[[:space:]/]*) echo "⚠️ 슬러그에 공백·슬래시를 쓰지 마세요."; exit 1;; esac

# 롱폼(가로 --long · 숏츠 묶음 --bundle)은 폴더 이름에 번호 뒤 long 을 붙인다 — projects/NNNNN-long-<슬러그> (2026-10-08 사용자 지시)
if [ "$ORI" = landscape ] || [ "$BUNDLE" = 1 ]; then SLUG="long-${SLUG#long-}"; fi
# 순번 — 동시 세션이 같은 번호를 받지 않게 폴더를 먼저 만들고, 같은 번호가 둘이 됐으면 물러나 다음 번호로 (00115~00120 중복 · 2026-10-21)
for try in 1 2 3 4 5; do
  LAST=$(ls projects 2>/dev/null | grep -oE '^[0-9]{5}' | sort -n | tail -1 || true)
  NUM=$(printf "%05d" $(( 10#${LAST:-0} + 1 )))
  NAME="$NUM-$SLUG"; DIR="projects/$NAME"
  mkdir "$DIR" 2>/dev/null || { echo "이미 있습니다: $DIR"; exit 1; }
  [ "$(ls -d projects/$NUM-* 2>/dev/null | wc -l)" -eq 1 ] && break
  rmdir "$DIR"; sleep 1
done
[ -d "$DIR" ] || { echo "✗ 순번을 받지 못했다 — projects/ 의 같은 번호 폴더를 확인한다"; exit 1; }

# 숏츠 묶음 롱폼 — 원본 숏츠를 읽어 조립하므로 voice/·assets/·HF 골격을 만들지 않는다 (hf-bundle build가 만든다)
if [ "$BUNDLE" = 1 ]; then
  mkdir -p "$DIR"
  node -e 'const fs=require("fs");const [d,slug]=process.argv.slice(1);const j=JSON.parse(fs.readFileSync("pipeline/templates/bundle-cuts.json","utf8"));j.title=slug;fs.writeFileSync(d+"/cuts.json",JSON.stringify(j,null,2)+"\n")' "$DIR" "$SLUG"
  sed -e "s/{{NAME}}/$NAME/g" -e "s/{{NUM}}/$NUM/g" -e "s/{{DATE}}/$(date +%Y-%m-%d)/g" pipeline/templates/bundle-README.md > "$DIR/README.md"
  echo "✔ $DIR — 숏츠 묶음 롱폼"
  echo "  ① cuts.json bundle.chapters(원본·승인 렌더·라벨)와 promise를 채운다 → node pipeline/hf-bundle.mjs $NUM plan"
  echo "  ② README 약속·챕터·팩트 재확인 → A 보고"
  echo "  ④ node pipeline/hf-bundle.mjs $NUM build → verify(무대 동일성·좌우 경계) → 경계 프레임 B 확장(override) → 검수 시트 B·C"
  echo "  ⑤ hf-render(1회) → render-gate → hf-export  (미리보기는 기본 없음 — 08 §3.1)"
  exit 0
fi

# 🔴 HyperFrames(기본) 경로가 쓰는 것만 만든다 — clips·images·refs 는 AI 실사 레거시 전용이라
#    --photo 일 때만 판다. 2026-09-11 실측: 아홉 프로젝트에 빈 폴더 12개가 남아 있었다.
mkdir -p "$DIR/assets/scene" "$DIR/assets/audio" "$DIR/voice"
[ "$PHOTO" = 1 ] && mkdir -p "$DIR/assets/clips" "$DIR/assets/images" "$DIR/assets/refs"
python3 - "$DIR" "$SLUG" "$ORI" "$PHOTO" <<'PY'
import json, sys
d, slug, ori, photo = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4] == '1'
J = json.load(open('pipeline/templates/cuts.json' if photo else 'pipeline/templates/cuts-motion.json', encoding='utf-8'))
J['title'] = slug; J['orientation'] = ori; J['fps'] = 30 if photo else 60
# YBMECC: 화면 정체성은 pipeline/templates/brand.json, 한국어 학부모 대상(docs/channel/04-format-voice.md).
J['language'] = 'ko'
J['voice'] = {"engine": "typecast", "voice_id": "", "model": "ssfm-v30", "voice": "한국어 목소리 선택 전 — 학부모 대상 차분한 성인 목소리(채널04 §4)",
              "language": "kor", "say_voice": "Yuna", "rate": 200, "lead": 0.12,
              "speed": 1.0, "seed": 1970, "target_lufs": -14, "assets": {}}
json.dump(J, open(f'{d}/cuts.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
PY
[ "$PHOTO" = 1 ] || node pipeline/hf-project.mjs "$DIR" init

if [ "$PHOTO" = 1 ]; then
STEPS="① 폴더        ✔
② 시나리오     cuts.json 작성 → node pipeline/tts.mjs $NUM --measure 로 길이 확인
③ 배경        node pipeline/prompts.mjs $NUM → projects/$NAME/output/PROMPTS.md → image2 (격자로 먼저 승인)
④ 오버레이     글자가 틀린 컷만 수정 → assets/images/<컷id>.final.png
⑤ 영상        움직일 컷만 i2v → assets/clips/<컷id>.mp4  (컷 하나 ≈ 크레딧 8개)
⑥ 목소리      node pipeline/tts.mjs $NUM
⑦ 조립·자막    node pipeline/export.mjs $NUM → projects/$NAME/output/ 을 내 프로그램에서 조립"
else
STEPS="① 분석        README 확정 팩트·refs → cross-verify 패킷 → video-verify 검증·record → stage-gate 1
② 구조        cuts.json 대본·0초 포스터·시각 기획 → 실물 사진(ref-photos) → 이미지 요청 → asset-prompts --generate → 실물 대조 시트 → A 보고 (대본+실제 이미지 — 멈추지 않고 ③)
③ 목소리      A 보고 뒤 바로 tts → measure → timing → narration → transcribe
④ 디자인      0.0초 포스터 시안 B → 훅 잠금(hook-check) → 대표 본문 → 프레임·CC0 효과음 → hf-audio → hf-project sync → 검수 시트 C(시트 0 = 훅)
⑤ 감독        hf-render → render-gate → hf-export → stage-gate 5 → 최종본 D
⑥ 문안        ⑤ 뒤 멈추지 않고 review 지시서 → publish.md → publish-check → stage-gate 6 (D 와 함께 보고)
   최종       사용자: 업로드. 성과가 들어오면 아래에 비교·다음 가설 기록"

fi

cat > "$DIR/README.md" <<EOF2
# $NUM $SLUG

$LABEL · 생성 $(date +%Y-%m-%d)

## 한 줄

> (이 영상이 시청자에게 주는 것 한 문장)

## 대상과 보상

| 대상 시청자 | 끝에서 줄 보상 |
|---|---|
| | |

## 인스타 판 — 댓글 키워드 → DM (video SKILL 「인스타 CTA 판」)

<!-- 2026-10-22 사용자: 학원을 찾아가는 편(오시는 길·지점 소개·주변 랜드마크)이면 요청 없이 map — cuts.json 맨 위 "ig_cta": {"link":"map"}, 스티커 「댓글에 지도 남기시면 DM으로 지도를 보내 드립니다」는 납품 뒤 ig-cta 가 자막 아래에 얹는다. 학원 안내·상담·설명회 신청 페이지(info)는 사용자가 이 편에 요청했을 때만 — 「info — <페이지> (사용자 요청 <날짜>)」. 프로그램 편은 「없음 — 프로그램 편」. stage-gate 2 가 이 줄과 cuts.json 을 대조한다 -->
인스타 판(댓글 → DM):
지도 핀(장소 이름 · 주소 · 네이버 지도·카카오맵·구글맵 URL — ⑥ 자동 DM 「링크 버튼」에 사용자가 넣는다):

## 훅 선택 — 첫 3초 (구성 전체에서 가장 강한 것)

🔴 가이드 전체에서 가장 중요한 결정이다 (video SKILL 「최우선 — 첫 1·2·3초」). 블록 설계를 마친 뒤 모든 블록에서 후보를 뽑아 비교하고, 가장 강한 하나가 cut-01이 된다. 「디자인」 칸은 그 장면의 주연 상태·구도·색면이고, 승자 장면의 정점 디자인이 0초 포스터의 바탕이 된다(별도 제목판을 짜지 않는다). 선택 줄에 블록과 이유를 쓴다.

| 후보 (블록·각도) | 가장 놀라운 결과 (내용) | 0초에 크게 보일 것 (디자인) | 3초 안 주연의 사건·정점 (모션) | 첫 발화 / 다음 반응 (대사) | 본문이 갚을 것 |
|---|---|---|---|---|---|
| | | | | | |

선택:

### 첫 3초 비트

승자를 네 행으로 설계한다 — 합격 조건·6원칙은 video SKILL 「최우선 — 첫 1·2·3초」. 확인: \`node pipeline/hook-check.mjs <p> --plan\`(②·③) → \`hook-check <p>\`(④ 훅 잠금) → \`hook-check <p> --from <mp4>\`(⑤).

| 행 | 화면 — 상황·관계·거리·단서 (원칙 1·2·3·5) | 움직임 — 시선의 한 점·순서 (원칙 4·6) | 말 · 자막 · 소리 |
|---|---|---|---|
| 0.0초 포스터 | | | |
| 0~1초 첫 움직임 | | | |
| 정점 — 핵심어 | | | |
| ~3초 정착 | | | |

<!-- 핵심어: 정점에서 들릴 첫 발화의 말을 대사 표기 그대로. 전사가 숫자로 적는 값은 | 로 함께 — 예: seventy-four dollars | \$74 -->
핵심어:

<!-- 0초 포스터: 멈춘 첫 장면 한 장에 주제·디자인·후킹이 모두 (video SKILL 「최우선」 0.0초 포스터). 주제 제목·후킹은 화면에 쓸 글자 그대로 — hook-check 가 첫 장면 소스에서 찾고, 둘 중 작은 글자도 1080 기준 110px 이상인지 잰다(2026-10-21) -->
주제 제목:
후킹:
키 비주얼:

## 디자인 방향

<!-- 브랜드(YBM ECC 대치점 팔레트·Pretendard·0초 제목 Hahmlet·로고)는 pipeline/templates/brand.json 에 고정돼 있다 — 여기에는 이 편에서 고른 것만 이 소재의 말로 쓴다 (2026-10-21). 형용사·골격 문장 금지.
     원생 사진은 \`node pipeline/photo-intake.mjs $NUM\` 로 들이고 README 「## 사진 동의」가 전부 ✅ 일 때만 화면에 쓴다(\`node pipeline/academy-check.mjs $NUM\`). -->
이 소재가 실제로 하는 일(예: 아이가 손을 든다 · 칠판에 쓴다 · 교실 문이 열린다 · 발표한다 · 상장을 받는다):
주연 표현(원생 사진 / 생성 배경·소품 / 코드 / 3D — 어느 블록에 무엇):
카메라(줌 / 달리 / 트랙 / 궤도 — 0~3초와 본문 대표 구간, 사진 속 아이 표정·손으로):
빛 층(docs/14 §16 대응표의 셰이더 효과 이름 — 예: 교실 창빛·조명·칠판 표면, 또는 없음 — 이유):
이징 성격(snap / elastic / slowfast / stepped / circular / soft — motion-signature menu ③):
BGM 정서(차분·사색 / 애잔·그리움 / 긴장·미스터리 / 따뜻·향수 / 경쾌 / 활기·행진 — 이 편의 정서 한 단어와 이유):

## 에셋 경로 판단

| 소재 | 경로(공식 원본 / 코드 / 이미지 생성 / Blender 3D) | 이유 |
|---|---|---|
| | | |

3D 비교 — 의미 블록 단위(docs/16-blender.md §1). **3D가 이기는 곳:** 0~3초에 주연 사물(교재·상장·트로피·교구)이 돌거나 펼쳐지거나 카메라가 그 둘레·속을 지날 때(사진은 한 시점뿐), 두께·가동 부품·단면·층 관계가 설명 그 자체일 때(예: 교재 단계가 쌓이는 층), 건물·교실 배치의 형태가 정보일 때. 원생·선생님·수업 장면은 3D로 만들지 않는다(학원 사진만). 소품은 실사로 보일 때만 3D, 아니면 사진풍. 도식 단면·흐름은 v7 룩. 후보 블록을 아래 표에 적고, 하나도 없으면 표를 지우고 「3D: 해당 블록 없음 — 」 뒤에 위 어느 경우도 아닌 이유를 **이 소재의 말로** 적는다(「회전해도 새 정보 없음」·「2D로 다 보인다」 같은 공식 문장은 비교가 아니다 — 2026-10-21 감사: 68편 전부 같은 문장).

| 블록·대상 | 3D 범위·얻는 이점 | 표면·매핑·사진 출처 | 선택·검증할 것 |
|---|---|---|---|
| | | | |

<!-- 실물 형상: 실재 건물·구조물을 3D로 만들면 실제 사진 여러 장으로 형상 사양을 먼저 쓴다 (docs/16-blender.md §4-1).
     「실물 형상: <대상> · refs <id> · 사진 N장(시점) · 사양: 높이·밑폭·높이:밑폭·테이퍼·평면·외피·꼭대기·고유 디테일·흔히 틀리는 것」
     실재 구조물을 3D로 만들지 않으면 「실물 형상: 해당 없음 — 이유」. ④ 대조 뒤 아래에 「실물 형상 대조: <refs-id> n/N 일치 — 어긋난 사양·남긴 이유」(다 맞으면 이유 없이 n/N) -->
실물 형상:

## 확정 팩트

| 항목 | 확인한 값·조건 | 근거 URL | 등급 |
|---|---|---|---|

## 확인이 필요한 사실

- [ ] (수치·가격·정책처럼 틀리면 신뢰를 잃는 것 — 근거 링크와 함께)

## 진행

\`\`\`
$STEPS
\`\`\`

## 제작 측정

| 단계 | 시작·종료 | 실제 작업 시간 | 승인·에셋·환경 대기 | 재작업 원인 |
|---|---|---|---|---|

## 업로드 기록

| 날짜 | 플랫폼 | 게시물·영상 버전 | 길이·훅 유형·첫 화면 | 조회·유지·완주·공유(기간 포함) | 이탈 구간 | 다음 편의 가설 |
|---|---|---|---|---|---|---|

관측하지 않은 수치는 비워 둔다. 같은 플랫폼·관측 기간·비슷한 주제/길이끼리 비교하고 원인을 단정하지 않는다.
EOF2

echo "✔ $DIR"
echo
echo "  다음: cuts.json 에 시나리오를 씁니다 (첫 컷이 훅 — docs/07-script.md §7)"
[ "$PHOTO" = 1 ] || echo "        HyperFrames 골격 준비. cuts.json 작성 후 timing.mjs, 프레임 작성 후 hf-project.mjs sync"
