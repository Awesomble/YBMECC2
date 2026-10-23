#!/bin/bash
# 모션 렌더 — 스테이징(리소스·나레이션·프로젝트 선택) 후 Remotion 렌더 → projects/<p>/output/render.mp4
# 사용: pipeline/render.sh <프로젝트> [출력파일명=render.mp4] [remotion 추가 인자…]
#   pipeline/render.sh 2                              → projects/00002-온누리적립/output/render.mp4
#   pipeline/render.sh 2 check.mp4 --frames=0-120     첫 2초만 빠르게
#   pipeline/render.sh 2 stills --sequence --image-format=png --frames=0-2   PNG 스틸 (해시 검증용)
#   COMP=Kit pipeline/render.sh 2 kit.png --frames=0-0   에셋 검증 시트
# 규격은 docs/11-motion.md — 소프트웨어 h264 CRF18 (결정론), concurrency 10.
set -euo pipefail
source "$(dirname "$0")/lib/resolve.sh"; source "$(dirname "$0")/lib/stage.sh"
DIR=$(resolve_project "${1:-}") || { echo "사용: pipeline/render.sh <프로젝트> [출력파일명] [remotion 인자…]"; exit 1; }
shift
OUTNAME=render.mp4
if [ $# -gt 0 ] && [[ "$1" != --* ]]; then OUTNAME=$1; shift; fi
OUT=$(project_out "$DIR")
case "$OUTNAME" in /*) TARGET=$OUTNAME ;; *) TARGET="$OUT/$OUTNAME" ;; esac   # 절대경로면 그대로
stage_project "$DIR"
# 나레이션이 없으면 Remotion 이 staticFile 404 스택으로 죽는다 — 원인이 안 보인다. 여기서 끊는다.
if [ ! -f "$OUT/narration.wav" ]; then
  echo "✗ $OUT/narration.wav 없음 — 렌더는 이 파일을 반드시 읽는다 (Main.tsx 의 Audio)"
  echo "  먼저: node pipeline/tts.mjs $(basename "$DIR")  →  pipeline/narration.sh $(basename "$DIR")"
  echo "  화면만 먼저 보려면: TTS_ENGINE=say node pipeline/tts.mjs $(basename "$DIR") (무료) 또는 pipeline/studio.sh"
  exit 1
fi
cd "$ABM_ROOT/pipeline/motion"
npx remotion render src/index.ts "${COMP:-Main}" "$TARGET" --codec=h264 --crf=18 --concurrency=10 "$@"
echo "✔ $TARGET"
