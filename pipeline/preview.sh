#!/usr/bin/env bash
# preview.sh — 스튜디오를 여는 **유일한 통로**. (2026-09-13 사용자 지시로 신설)
#
#   > "하이퍼프레임을 왜 자꾸 여는거야? 너가 확인할려고 여는거야?
#   >  너가 확인용으로 여는건 아니면 내가 요청할때랑 영상으로 렌더링전 최종 컨펌때 1회만 열도록 강제해"
#
# 🔴 나는 스튜디오가 필요 없다. 내 확인은 전부 헤드리스다 —
#    `hyperframes snapshot` · `layout-scan` · `review-sheet` · `render-gate`.
#    스튜디오는 **사용자가 보는 물건**이다. 그러니 사용자 사유 없이는 열지 않는다.
#
# 실측 (2026-09-13, 이 규칙을 만든 이유): 프리뷰 서버 **4개**(00010·00011·00012·00013)와
#   헤드리스 크롬 **34개**가 동시에 떠 있었다. 전부 이전 세션이 켜 두고 안 끈 것이다.
#   `preview --background` 는 **세션이 끝나도 안 죽는다.** 포트가 3002~3005 로 밀려
#   사용자가 어느 URL 이 어느 영상인지 분간할 수 없었다.
#
# 사용:
#   pipeline/preview.sh <프로젝트> user     # 🔴 **사용자가 열어 달라고 했을 때만**
#   pipeline/preview.sh --stop-all          # 전부 끈다
#
# 🔴 2026-09-14 재개정 — `final`(렌더 전 최종 컨펌 자동 열기)을 **없앴다.**
#    *"하이퍼프레임을 내가 요청할때만 띄우도록해"*
#    렌더 전 확인은 **검수 시트**(`review-sheet.mjs`)로 한다. 시트는 이미지라 대화에 바로 뜨고,
#    칸 번호로 지목할 수 있어 스튜디오보다 지목이 쉽다. 스튜디오는 사용자가 부를 때만 연다.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

# 🔴 **SIGTERM 만으로는 안 죽는다** (2026-09-14 실측). `--background` 는 `preview --foreground`
#    자식을 띄우는데 그 프로세스가 SIGTERM 을 무시한다. 옛 판은 `kill` 을 보내고 **세지도 않고**
#    "정리했다"고 찍었다 — 보고와 현실이 달랐고, 그래서 유령이 남는데도 깨끗한 줄 알았다.
#    ⇒ TERM → 기다림 → 살아남은 것만 KILL → **실제로 남은 수를 세서 보고한다.**
alive() { ps -axo pid=,command= | grep -F ".bin/hyperframes" | grep -F " preview" | grep -v grep | awk '{print $1}'; }
stop_all() {
  local before after
  before=$(alive | wc -l | tr -d ' ')
  for pid in $(alive); do kill "$pid" 2>/dev/null; done
  sleep 2
  for pid in $(alive); do kill -9 "$pid" 2>/dev/null; done   # 버티는 것만 강제 종료
  sleep 1
  after=$(alive | wc -l | tr -d ' ')
  # 헤드리스 크롬은 프리뷰가 띄운 것으로, 부모가 죽어도 남는다 (실측 34개)
  local c=0
  for pid in $(pgrep -f "chrome-headless-shell" 2>/dev/null); do kill -9 "$pid" 2>/dev/null && c=$((c+1)); done
  if [ "$after" -gt 0 ]; then
    echo "  ⚠️  프리뷰 $((before-after))/$before 개 정리 · 크롬 $c 개 — 🔴 **$after 개가 안 죽었다**"
    ps -axo pid=,command= | grep -F ".bin/hyperframes" | grep -F " preview" | grep -v grep | sed 's/^/     /'
  else
    echo "  ⏹  프리뷰 $before 개 · 헤드리스 크롬 $c 개 정리 (남은 것 0)"
  fi
}

[ "${1:-}" = "--stop-all" ] && { stop_all; exit 0; }

source pipeline/lib/resolve.sh
DIR=$(resolve_project "${1:-}") || { echo "사용: pipeline/preview.sh <프로젝트> user  ·  --stop-all" >&2; exit 1; }
NAME=$(basename "$DIR"); HF="$DIR/hyperframes"; OUT="$DIR/output"
WHY="${2:-}"

if [ "$WHY" != "user" ]; then
  cat >&2 <<'EOS'

  🔴 스튜디오는 **사용자가 요청할 때만** 연다 (2026-09-14 사용자 지시).

     pipeline/preview.sh <p> user    ← 사용자가 "띄워줘"라고 했을 때. 이것뿐이다.

  🔴 렌더 전 확인은 **검수 시트**로 한다 — 스튜디오를 열지 마라:
       node pipeline/review-sheet.mjs <p>     # 이미지로 바로 보고 「1-8」로 지목한다

  🔴 **내가 확인하려고 여는 것은 금지다.** 내 확인 도구는 전부 헤드리스다:
       npx hyperframes snapshot --at <초,...>     한 시점 그림
       node pipeline/layout-scan.mjs  <p>         겹침·이탈 전수
       node pipeline/review-sheet.mjs <p>         컷별 번호 시트  ← 사용자 확인도 보통 이걸로 끝난다
       pipeline/render-gate.sh        <p>         렌더 후 전수

EOS
  exit 2
fi

mkdir -p "$OUT"

# ── 🔴 **이미 떠 있으면 손대지 않는다** (2026-09-14 개정) ─────────────────
#    옛 판은 열 때마다 `stop_all` 로 전부 죽이고 다시 띄웠다. 「항상 하나만」을 지키려던 건데,
#    유령이 쌓이던 진짜 원인은 `layout-scan` 의 포트 정규식 오류였다(localhost vs 127.0.0.1).
#    그걸 고쳤으니 **몰살은 불필요한 폭력**이다 — 사용자가 보고 있는 창을 껐다 켜면 그게 곧
#    *"띄워준거 확인해도 바로 꺼져서 확인도 못해"* 다.
STATUS=$( cd "$HF" && node "$ABM_ROOT/pipeline/hf-cli.mjs" "$DIR" preview . --status 2>/dev/null )
URL=$(printf '%s' "$STATUS" | grep -oE "https?://(localhost|127\.0\.0\.1):[0-9]+[^[:space:]]*" | head -1)
if [ -n "$URL" ]; then
  echo "  ✅ 이미 떠 있다 — 그대로 쓴다 (끄고 다시 띄우지 않는다)"
  echo "     $URL"
  printf '%s\n' "$URL" > "$OUT/.preview-url"
else
  # 다른 프로젝트 서버는 정리한다 — 포트가 밀리면 URL 이 어느 영상인지 말해 주지 않는다
  stop_all
  sleep 1
  ( cd "$HF" && node "$ABM_ROOT/pipeline/hf-cli.mjs" "$DIR" preview --background --no-open ) | tee "$OUT/.preview-url"
fi

echo
echo "  🔴 사용자에게 보낼 때 — URL 만 주지 마라. **검수 시트와 함께** 보낸다"
echo "     (URL 만 주면 지목할 좌표가 없다 — docs/02-pitfalls.md §73)"
echo "  ⏹  끝나면 반드시:  pipeline/preview.sh --stop-all"
