#!/usr/bin/env bash
# 정지 화면 검출 — 프레임마다 3시점(12%·50%·88%)을 찍고 화면 변화량을 잰다.
#
# 왜 필요한가: render-gate ②-b 는 **트윈 개수**를 센다. F01 은 트윈 13개,
# F24 는 15개를 갖고도 화면이 정지였다 — brightness(1.11→1.18)·scale(1.0→1.006) 처럼
# 눈에 안 보이는 프로퍼티였기 때문이다. 개수로는 절대 안 잡힌다.
#
# 재는 것: 헤드존+페이로드(y350~1340) 의 그레이스케일 절대차 평균(YAVG).
#          자막존(y1350~)은 제외한다 — 자막은 루트 트랙이라 프레임과 무관하게 바뀐다.
#
# 🔴 **면적 지표라 얇은 선을 못 읽는다.** 00008 F08 은 9.12→9.24 눈금자가 900px 를 가로질러
#    제대로 자라는데도 1.008 로 ⚠️ 가 떴다 — 3px 선이 바뀌는 화소가 너무 적어서다.
#    반대로 큰 색면 하나만 켜지면 아무 서사 없이도 수치가 뛴다.
#    **수치는 「어디를 눈으로 볼지」 고르는 데만 쓰고, 판정은 스냅샷으로 해라.**
#
# 사용: pipeline/still-scan.sh <프로젝트>            전 프레임
#       pipeline/still-scan.sh <프로젝트> 1 2 24     프레임 지정
#   (프로젝트는 순번으로 지목한다 — 8 · 00008 · 00008-추석한우 전부 됨)
set -euo pipefail
source "$(dirname "$0")/lib/resolve.sh"
DIR=$(resolve_project "${1:-}") || { echo "사용: pipeline/still-scan.sh <프로젝트> [프레임 …]" >&2; exit 1; }
[ -d "$DIR/hyperframes" ] || { echo "HyperFrames 프로젝트가 아니다: $DIR" >&2; exit 1; }
shift
cd "$DIR/hyperframes"
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT

# macOS 기본 bash 는 3.2 라 mapfile 이 없다 — while read 로 담는다
ROWS=()
while IFS= read -r line; do ROWS+=("$line"); done < <(node -e '
const h=require("fs").readFileSync("index.html","utf8");
const re=/id="el-(\d+)[^"]*" class="scene[^"]*"[^>]*data-start="([\d.]+)" data-duration="([\d.]+)"/g;
let m; while((m=re.exec(h))) console.log(+m[1], +m[2], +m[3]);
')

WANT=" $* "
TS=(); NUMS=()
for r in "${ROWS[@]}"; do
  read -r n s d <<<"$r"
  [ $# -gt 0 ] && [[ "$WANT" != *" $((10#$n)) "* ]] && continue
  NUMS+=("$n")
  for f in 0.12 0.50 0.88; do
    TS+=("$(python3 -c "print(f'{$s+$d*$f:.2f}')")")
  done
done
[ ${#TS[@]} -eq 0 ] && { echo "대상 프레임 없음"; exit 1; }

node "$ABM_ROOT/pipeline/hf-cli.mjs" "$DIR" snapshot --at "$(IFS=,; echo "${TS[*]}")" --no-end -o "$OUT" >/dev/null 2>&1

diff2() {
  ffmpeg -v error -i "$1" -i "$2" -filter_complex \
    "[0:v]crop=1080:990:0:350,format=gray[a];[1:v]crop=1080:990:0:350,format=gray[b];\
     [a][b]blend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" \
    -f null - 2>/dev/null | grep -o 'YAVG=[0-9.]*' | cut -d= -f2 | head -1
}

# 🔴 `sort -t- -k2 -n` 을 쓰지 마라 — 구분자가 **경로 전체**의 대시에 걸린다.
#    작업 경로에 대시가 있으면(예: /tmp/claude-501/-Users-…-project-ABM/) 필드 2가
#    프레임 번호가 아니라 디렉터리 조각이 되어 **조용히 어긋난 결과**를 낸다.
#    파일명만 떼어 번호로 정렬한다.
PNG=()
while IFS= read -r line; do PNG+=("${line#* }"); done < <(
  for f in "$OUT"/*.png; do
    b=$(basename "$f"); n=${b#frame-}; n=${n%%-*}
    printf '%05d %s\n' "$((10#$n))" "$f"
  done | sort -n)
printf "프레임  전반→중반  중반→후반   판정\n"
bad=0
for i in "${!NUMS[@]}"; do
  a=${PNG[$((i*3))]}; b=${PNG[$((i*3+1))]}; c=${PNG[$((i*3+2))]}
  d1=$(diff2 "$a" "$b"); d2=$(diff2 "$b" "$c")
  d1=${d1:-0}; d2=${d2:-0}
  v=$(python3 -c "
m=max($d1,$d2)
print('🔴 정지' if m<1.0 else ('⚠️  약함' if m<3.0 else 'ok'))")
  [[ "$v" != ok ]] && bad=$((bad+1))
  printf "F%s   %8.3f  %8.3f   %s\n" "${NUMS[$i]}" "$d1" "$d2" "$v"
done
echo
echo "🔴/⚠️  ${bad}개"
echo "⚠️  이 수치는 **금지선이지 목표가 아니다.** 숫자를 올리려고 안 보이는 곳에 트윈을 넣지 마라 —"
echo "   그건 00008 F01 이 이미 한 실수다(트윈 13개 · 화면 정지)."
echo "⚠️  **면적 지표라 얇은 선을 못 읽는다** — 눈금자·분할선이 제대로 자라도 ⚠️ 로 뜬다(00008 F08)."
echo "🔴 **이 도구는 앞 컷을 모른다.** 앞 컷 화면을 그대로 이어받는 \"연속 투샷\"의 뒤 컷은"
echo "   **원래 안 바뀌는 게 정답**이라 반드시 낮게 찍힌다. 그걸 고치라고 시키면 그래프가"
echo "   되감기고 요소가 사라졌다 나타난다 — 정지보다 훨씬 큰 결함이다(00008 F12, pitfalls §65)."
echo "   👉 고치기 전에 **STORYBOARD 의 roles 에 「cut-NN 유지」가 적혀 있는지 먼저 보고,"
echo "      앞 컷 마지막 프레임과 이 컷 첫 프레임을 나란히 놓고 봐라.**"
echo "   🔴 안 보이는 결함은 고치지 않는다."
