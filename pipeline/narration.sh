#!/bin/bash
# 나레이션 굽기 (모션 경로) — voice/<유닛>.m4a → 구절 레벨링(level-units.py) → 단일 atempo 배치(build-narration.mjs)
# 사용: pipeline/narration.sh <프로젝트> [실효배속=1.20]
#
# 🔴 기본값 1.20 — **HyperFrames 규약과 같은 값이다** (2026-09-13 통일).
#    옛 기본값은 1.10 이었는데 `CLAUDE.md`·`docs/14-hyperframes.md`·`/video` 스킬은 전부 1.20 이라,
#    인자를 생략하면 규약과 다른 나레이션이 구워졌다. 00013 이 실제로 걸렸다 (pitfalls §85).
#    ⚠️ Remotion 레거시(00002 v13~)는 1.10 으로 구웠다 — 그 판을 다시 구우려면 **인자로 1.10 을 명시**하라.
#   → projects/<p>/output/leveled/<유닛>.wav + projects/<p>/output/narration.wav   (유닛 표는 projects/<p>/motion/timeline.ts 의 UNITS)
# 배속을 바꾸면 timeline.ts 의 SPEED 도 같이 바꾼다. 근거: docs/02-pitfalls.md §11·§12.
set -euo pipefail
source "$(dirname "$0")/lib/resolve.sh"
DIR=$(resolve_project "${1:-}") || { echo "사용: pipeline/narration.sh <프로젝트> [실효배속]"; exit 1; }
PY=${ABM_PYTHON:-}
if [ -z "$PY" ]; then
  for c in "$HOME/.venvs/abm-whisper/bin/python" python3; do
    "$c" -c 'import numpy' >/dev/null 2>&1 && { PY=$c; break; }
  done
fi
[ -n "$PY" ] || { echo "✗ numpy 가 있는 python 이 없습니다. ABM_PYTHON=/path/to/python 으로 지정하세요 (예: ~/.venvs/abm-whisper/bin/python)"; exit 1; }
node "$ABM_ROOT/pipeline/tts.mjs" "$DIR" --status
"$PY" "$ABM_ROOT/pipeline/lib/level-units.py" "$DIR"
node --disable-warning=ExperimentalWarning "$ABM_ROOT/pipeline/lib/build-narration.mjs" "$DIR" ${2:+"$2"}
