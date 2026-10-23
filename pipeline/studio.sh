#!/bin/bash
# Remotion 스튜디오 (미리보기) — 스테이징 후 실행. 사용: pipeline/studio.sh <프로젝트>
set -euo pipefail
source "$(dirname "$0")/lib/resolve.sh"; source "$(dirname "$0")/lib/stage.sh"
DIR=$(resolve_project "${1:-}") || { echo "사용: pipeline/studio.sh <프로젝트>"; exit 1; }
stage_project "$DIR"
cd "$ABM_ROOT/pipeline/motion" && exec npx remotion studio src/index.ts
