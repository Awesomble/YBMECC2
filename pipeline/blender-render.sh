#!/usr/bin/env bash
# Blender 3D 장면 → 알파 WebM + 라벨 앵커 (ABMEN 3D 경로, 2026-09-23)
#
#   pipeline/blender-render.sh <p> <장면이름> [--preview]
#
#   장면 스크립트:  projects/<p>/assets/scene/<장면이름>.py   (import abm3d — pipeline/blender/abm3d.py)
#   프레임 PNG:     projects/<p>/output/3d/<장면이름>/f_0001.png …   (재생성 산출물)
#   HyperFrames:    projects/<p>/hyperframes/assets/3d/<장면이름>.webm  (VP9 yuva420p — 알파 유지 실측)
#                   projects/<p>/hyperframes/assets/3d/<장면이름>.anchors.json (3D 기준점의 화면 좌표, 프레임별)
#   --preview       540×960, 6프레임마다 한 장만 렌더 → output/3d/<장면이름>-preview/ (배치 확인용, 인코딩 없음)
#   --stills 0,1.5  지정 시각(초)만 1080×1920 PNG → output/3d/<장면이름>-stills/t_<초>.png (시안·검수용)
#   --anchors-only  라벨 기준점(anchors.js/json)만 다시 내보낸다. 영상·PNG는 그대로 (빈 오브젝트 추가는 렌더를 바꾸지 않는다)
#   --review        형태 검수 시트 — Workbench 무작위 색으로 장면 카메라·정면·우측·위·3/4 → output/3d/<장면이름>-review/sheet.png (룩이 아니라 형태·맞물림·떨어진 조각 확인, 2026-10-22)
#   모든 모드에서 T.run() 이 먼저 형태 QA(ABM3D_QA — 겹침·뒤집힌 법선·떠 있는 조각·빠진 이미지)를 로그에 남긴다. ABM3D_QA_STRICT=1 이면 오류에서 멈춘다
#   렌더 전에 장면의 T.run() 이 카메라 제약 유효성과 제목·자막 구역 침범(화면 좌표)을 먼저 출력한다
#
# 실측(2026-09-23, M1 Max): EEVEE 1080×1920 프레임당 0.2~0.3초. HyperFrames 렌더에서 알파·프레임 대응 일치
# (렌더 0기준 프레임 n = 블렌더 n+1번 파일). 하위 컴포지션 안의 <video> 도 같다.
set -euo pipefail
cd "$(dirname "$0")/.."
source pipeline/lib/resolve.sh
DIR=$(resolve_project "${1:?프로젝트}") || exit 1
NAME="${2:?장면 이름 (assets/scene/<이름>.py)}"
MODE="${3:-}"; STILLS="${4:-}"
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
[ -x "$BLENDER" ] || { echo "✗ Blender 없음: $BLENDER (brew install --cask blender)" >&2; exit 2; }
SCENE="$DIR/assets/scene/$NAME.py"
[ -f "$SCENE" ] || { echo "✗ 장면 스크립트 없음: $SCENE" >&2; exit 2; }
OUT="$DIR/output/3d/$NAME"; HFA="$DIR/hyperframes/assets/3d"
case "$MODE" in --anchors-only) OUT="$OUT-anchors" ;; --preview) OUT="$OUT-preview" ;; --review) OUT="$OUT-review" ;; --stills) OUT="$OUT-stills"; [ -n "$STILLS" ] || { echo "✗ --stills 0,1.5 형식" >&2; exit 2; } ;; esac
rm -rf "$OUT"; mkdir -p "$OUT" "$HFA"
LOG="$DIR/output/3d/$NAME.log"
set +e
"$BLENDER" -b --factory-startup --python-exit-code 3 --python "$SCENE" -- \
  --lib "$PWD/pipeline/blender" --out "$OUT" --anchors "$HFA/$NAME.anchors.json" ${MODE:+$MODE} ${STILLS:+$STILLS} >"$LOG" 2>&1
rc=$?
set -e
grep -E "ABM3D_|Error|Traceback|line [0-9]+" "$LOG" | tail -12 || true
[ $rc -eq 0 ] || { echo "✗ Blender 실패 (exit $rc) — 로그 $LOG" >&2; exit $rc; }
if [ "$MODE" = "--anchors-only" ]; then rm -rf "$OUT"; echo "✓ 기준점만 → $HFA/$NAME.anchors.js"; exit 0; fi
if [ "$MODE" = "--review" ]; then
  cd "$OUT"
  if [ -f v_camera.png ]; then
    ffmpeg -v error -y -i v_camera.png -i v_front.png -i v_right.png -i v_top.png -i v_three_quarter.png \
      -filter_complex "[1][2]hstack[a];[3][4]hstack[b];[a][b]vstack[g];[0][g]hstack" sheet.png
  else
    ffmpeg -v error -y -i v_front.png -i v_right.png -i v_top.png -i v_three_quarter.png -filter_complex "[0][1]hstack[a];[2][3]hstack[b];[a][b]vstack" sheet.png
  fi
  echo "✓ 검수 시트 $OUT/sheet.png (왼쪽 장면 카메라 · 오른쪽 정면/우측/위/3/4 — 물체마다 다른 색) · 형태 QA 는 위 ABM3D_QA 줄"
  exit 0
fi
n=$(ls "$OUT"/*.png 2>/dev/null | wc -l | tr -d ' ')
[ "$n" -gt 0 ] || { echo "✗ 프레임 0장" >&2; exit 4; }
if [ -n "$MODE" ]; then echo "✓ ${MODE#--} ${n}장 → $OUT"; exit 0; fi
ffmpeg -v error -y -framerate 60 -i "$OUT/f_%04d.png" -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 20 \
  -row-mt 1 -auto-alt-ref 0 -deadline good -cpu-used 2 "$HFA/$NAME.webm"
echo "✓ ${n}프레임 → $HFA/$NAME.webm ($(du -h "$HFA/$NAME.webm" | cut -f1)) · 앵커 $HFA/$NAME.anchors.json"
