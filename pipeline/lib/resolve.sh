# 프로젝트 찾기 (bash) — 순번(2·00002) / 폴더명 / 부분일치 / 경로. source 해서 쓴다.
#   source "$(dirname "$0")/lib/resolve.sh"; DIR=$(resolve_project "$1") || exit 1
# ABM_ROOT = 저장소 루트 (pipeline/ 의 부모). Node 쪽은 lib/project.mjs 가 같은 규칙.
ABM_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

resolve_project() {
  local q="${1:-}" d="" n="" pat
  [ -z "$q" ] && return 1
  q="${q%/}"
  if [ -f "$q/cuts.json" ]; then d="$(cd "$q" && pwd)"
  elif [ -d "$ABM_ROOT/projects/$q" ]; then d="$ABM_ROOT/projects/$q"
  else
    case "$q" in *[!0-9]*) ;; *) n=$(printf '%05d' "$((10#$q))") ;; esac
    # 같은 번호의 폴더가 둘이면 멈춘다 (lib/project.mjs 와 같은 규칙 — 2026-10-21)
    local hits=() pat
    for pat in "$ABM_ROOT/projects/${n:-$q}-"*; do [ -d "$pat" ] && hits+=("$pat"); done
    if [ ${#hits[@]} -eq 0 ]; then for pat in "$ABM_ROOT/projects/"*"$q"*; do [ -d "$pat" ] && hits+=("$pat"); done; fi
    if [ ${#hits[@]} -gt 1 ]; then
      local list; list=$(printf '%s · ' "${hits[@]##*/}"); list="${list% · }"
      echo "✗ 「${q}」에 맞는 프로젝트가 ${#hits[@]}개다 — 폴더명 전체로 지목한다: ${list}" >&2; return 1
    fi
    [ ${#hits[@]} -eq 1 ] && d="${hits[0]}"
  fi
  [ -n "$d" ] || { echo "✗ 프로젝트를 찾지 못했습니다: $q   (예: 2 · 00002 · 00002-온누리적립)" >&2; return 1; }
  printf '%s\n' "$d"
}

# 산출물 폴더 — output/<프로젝트명>/ (없으면 만든다)
project_out() { local o="$1/output"; mkdir -p "$o"; printf '%s\n' "$o"; }   # 2026-09-16: 프로젝트 안으로
