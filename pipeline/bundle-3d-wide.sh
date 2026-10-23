#!/bin/bash
# 롱폼 묶음 B 확장 — 원본 숏츠의 3D webm(Blender)을 가로 2280으로 넓힌다 (docs/channel/08-longform.md §4.3)
#
#   pipeline/bundle-3d-wide.sh <묶음> <원본> <장면> [표본 수=24]
#
#   원본 projects/<원본>/assets/scene/<장면>.py 를 ABM3D_WIDE_W=2280(세로 화각 그대로, 가로만 넓힘)으로 열고
#   ABM3D_BORDER 로 왼쪽 600·오른쪽 600 띠만 렌더한 뒤, 가운데 1080은 원본 webm 화소를 그대로 붙인다(원본 프로젝트는 고치지 않는다).
#   → projects/<묶음>/hyperframes/compositions/bundle/assets/<원본 번호>/<장면>-wide.webm (2280×1920, VP9 yuva420p)
#   프레임 HTML 에서는 left:-600px; width:2280px; height:1920px 로 원본 <video> 자리에 쓴다.
#
#   2026-10-08 L9·L11 실측: 세 입력을 시각(ms 단위 webm PTS vs 정확한 n/60 PNG)으로 붙이면 가운데가 1~2프레임 밀렸다
#   (verify 0.38~0.96) → 모든 입력을 프레임 번호로 다시 매겨(setpts=N/60/TB) 같은 번호끼리 붙인다.
#   땅·바닥 상자가 좁아 넓힌 시야에서 끝이 보이면, 장면 스크립트를 스크래치에 복사해 그 상자만 넓혀 3번째 인자 대신 경로로 준다.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
source pipeline/lib/resolve.sh
BUN=$(resolve_project "${1:?묶음}") || exit 1
SRC=$(resolve_project "${2:?원본}") || exit 1
NAME="${3:?장면 이름 또는 .py 경로}"; SMP="${4:-24}"
if [[ "$NAME" == *.py ]]; then SCN="$(cd "$(dirname "$NAME")" && pwd)/$(basename "$NAME")"; NAME=$(basename "$NAME" .py); NAME=${NAME%-wide}; else SCN="$SRC/assets/scene/$NAME.py"; fi
[ -f "$SCN" ] || { echo "✗ 장면 스크립트 없음: $SCN" >&2; exit 2; }
ORIG="$SRC/hyperframes/assets/3d/$NAME.webm"
[ -f "$ORIG" ] || { echo "✗ 원본 webm 없음: $ORIG" >&2; exit 2; }
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
OUTD="$BUN/hyperframes/compositions/bundle/assets/$(basename "$SRC" | cut -c1-5)"; mkdir -p "$OUTD"
TMP="$BUN/output/3d-wide/$NAME"; rm -rf "$TMP"; mkdir -p "$TMP/L" "$TMP/R" "$TMP/C"
for side in L:0,0.2631578947 R:0.7368421053,1; do
  s=${side%%:*}; b=${side#*:}
  (cd "$SRC" && ABM3D_WIDE_W=2280 ABM3D_SAMPLES=$SMP ABM3D_BORDER=$b "$BLENDER" -b --factory-startup --python-exit-code 3 --python "$SCN" -- \
     --lib "$ROOT/pipeline/blender" --out "$TMP/$s" --anchors "$TMP/a$s.json" > "$TMP/$s.log" 2>&1) || { echo "✗ Blender 실패($s) — $TMP/$s.log" >&2; exit 3; }
done
N=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$ORIG")
# 가운데도 PNG 번호열로 풀어 세 입력을 같은 image2 방식으로 붙인다 — webm 입력을 PNG 띠와 hstack 하면 setpts=N/60/TB 로도
#   가운데가 2프레임 늦었다(2026-10-09 L13 00031 f06·f07 실측: 늦춘 2프레임에서 SSIM 0.9998, 그대로 0.976)
ffmpeg -v error -y -c:v libvpx-vp9 -i "$ORIG" -fps_mode passthrough -pix_fmt rgba -start_number 1 "$TMP/C/f_%04d.png"
ffmpeg -v error -y -framerate 60 -start_number 1 -i "$TMP/L/f_%04d.png" -framerate 60 -start_number 1 -i "$TMP/C/f_%04d.png" -framerate 60 -start_number 1 -i "$TMP/R/f_%04d.png" -filter_complex \
  "[0:v]scale=600:1920,format=yuva420p[l];[1:v]format=yuva420p[c];[2:v]scale=600:1920,format=yuva420p[r];[l][c][r]hstack=inputs=3,format=yuva420p[v]" \
  -map "[v]" -frames:v "$N" -r 60 -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 20 -row-mt 1 -auto-alt-ref 0 -deadline good -cpu-used 2 "$OUTD/$NAME-wide.webm"
# 정렬 검사 — 넓힌 판의 가운데 1080 이 원본과 같은 번호에서 가장 닮아야 한다(전 프레임 — 앞부분이 정지 화면이면 앞만으로는 못 가른다, 0·1·2프레임 늦춰 비교)
best=$(for off in 0 1 2; do ffmpeg -v error -c:v libvpx-vp9 -i "$OUTD/$NAME-wide.webm" -c:v libvpx-vp9 -i "$ORIG" -filter_complex \
  "[0:v]setpts=N/60/TB,crop=1080:1920:600:0,trim=start_frame=$off,setpts=N/60/TB,format=yuv420p,scale=270:480[a];[1:v]setpts=N/60/TB,format=yuv420p,scale=270:480[b];[a][b]ssim=stats_file=-" \
  -f null - 2>&1 | awk -v o=$off '{for(i=1;i<=NF;i++) if($i ~ /^All:/){split($i,a,":"); s+=a[2]; n++}} END{printf "%s %.4f\n", o, (n?s/n:0)}'; done | sort -k2,2nr -k1,1n | head -1)
echo "  가운데 정렬: 늦춤 ${best% *}프레임에서 SSIM ${best#* }"
[ "${best% *}" = 0 ] || { echo "✗ 가운데가 원본보다 ${best% *}프레임 늦다 — 산출을 쓰지 마라" >&2; exit 4; }
rm -rf "$TMP"
echo "✔ $(realpath --relative-to="$PWD" "$OUTD/$NAME-wide.webm" 2>/dev/null || echo "$OUTD/$NAME-wide.webm") · ${N}프레임 · 배치 left:-600px; width:2280px; height:1920px"
