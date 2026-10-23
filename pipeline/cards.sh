#!/bin/bash
# 인포그래픽 카드 렌더 — projects/<p>/cards/<컷id>.html → projects/<p>/assets/images/<컷id>.png (2160×3840, 2x)
# 사용: pipeline/cards.sh <프로젝트> [컷id ...]   (컷id 생략 시 전부)
# assets/images/ 는 '이미지 슬롯' — 카드 렌더든 image2 생성물이든 여기 있으면 조립·export 가 그대로 쓴다.
set -euo pipefail
source "$(dirname "$0")/lib/resolve.sh"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "✗ Chrome 이 없습니다: $CHROME"; exit 1; }

DIR=$(resolve_project "${1:-}") || { echo "사용: pipeline/cards.sh <프로젝트> [컷id ...]"; exit 1; }
[ -d "$DIR/cards" ] || { echo "✗ $DIR/cards 가 없습니다"; exit 1; }
shift || true

OUT="$DIR/assets/images"
mkdir -p "$OUT"

# 대상 목록: 인자로 받은 컷id 또는 cards/*.html 전부
if [ $# -gt 0 ]; then
  FILES=()
  for id in "$@"; do FILES+=("$DIR/cards/$id.html"); done
else
  FILES=("$DIR"/cards/cut-*.html)
fi

N=0
for f in "${FILES[@]}"; do
  [ -f "$f" ] || { echo "✗ 없음: $f"; exit 1; }
  id=$(basename "$f" .html)
  # 한글 경로 안전: file:// URL 은 퍼센트 인코딩해서 넘긴다
  url="file://$(python3 -c 'import urllib.parse,sys,os;print(urllib.parse.quote(os.path.abspath(sys.argv[1])))' "$f")"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=2 --window-size=1080,1920 \
    --screenshot="$OUT/$id.png" "$url" >/dev/null 2>&1
  sz=$(sips -g pixelWidth -g pixelHeight "$OUT/$id.png" 2>/dev/null | awk '/pixel/{printf "%s ", $2}')
  echo "✔ $id.png  (${sz% })"
  N=$((N+1))
done
echo "— ${N}장 → $OUT"
