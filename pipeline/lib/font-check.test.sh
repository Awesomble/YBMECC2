#!/usr/bin/env bash
# font-check.test.sh — font-check.mjs 변이 시험 (2026-09-10 신설)
#
#   pipeline/lib/font-check.test.sh [프로젝트=00006]
#
# 왜 (docs/02-pitfalls.md §44): 코드 읽기는 「무엇을 안 보나」를 잡고,
#   변이 시험은 「보면서도 못 잡나」를 잡는다. 둘은 겹치지 않는다.
#   실제로 이 검사기의 첫 판은 **0바이트 폰트 파일을 통과시켰다** — 코드로는 안 보였다.
#
# 🔴 **사본에서만 돌린다.** 실제 프로젝트를 변이시키지 않는다.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1
SRC=$(ls -d projects/${1:-00006}* 2>/dev/null | head -1)/hyperframes
[ -d "$SRC" ] || { echo "✗ $SRC 없음" >&2; exit 2; }
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
cp -R "$SRC" "$T/hf"; HF="$T/hf"; # 🔴 `**` 글롭은 이 셸에서 안 먹는다 — find 로 찾는다. 비어 있으면 sed 가 조용히 아무것도 안 하고
#    시험이 「통과」로 보인다 (첫 판이 그랬다).
F=$(find "$HF/compositions" -name '*.html' 2>/dev/null | sort | head -1)
[ -n "$F" ] || { echo "✗ 프레임 HTML 을 못 찾았다" >&2; exit 2; }
run(){ node pipeline/lib/font-check.mjs "$HF" >/dev/null 2>&1; echo $?; }
pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  ✅ $1"; pass=$((pass+1)); else echo "  🔴 $1 (기대 $3, 실제 $2)"; fail=$((fail+1)); fi; }

echo "  변이 시험 — $(basename "$(dirname "$SRC")")"
chk "기준선: 무변경은 통과" "$(run)" 0

# 🔴 `"$HF"/fonts/*` 로 고르면 안 된다 — 00005 는 폰트가 `assets/fonts/` 에 있어 **빈 대상**이 되고
#    변이가 아무것도 안 한다. 경로 규약이 프로젝트마다 달라서, 어디에 있든 **선언이 가리키는 것**을 쓴다.
#    (첫 판이 이걸로 00005 에서 3건 실패했다 — 기대값을 1로 둔 덕에 「통과」로 새지 않고 드러났다.)
FONT=$(node pipeline/lib/font-check.mjs "$HF" --declared-files | head -1)
if [ -n "$FONT" ]; then
  mv "$FONT" "$FONT.bak";        chk "선언 O · 파일 X"        "$(run)" 1; mv "$FONT.bak" "$FONT"
  cp "$FONT" "$T/keep"; : > "$FONT"; chk "파일이 0바이트"      "$(run)" 1; cp "$T/keep" "$FONT"
  cp "$FONT" "$T/keep2"; head -c 4096 /dev/zero > "$FONT"; chk "머리가 폰트가 아니다" "$(run)" 1; cp "$T/keep2" "$FONT"
  # 🔴 머리는 정상인데 **뒤가 잘린** 파일 — 중단된 curl·복사가 만드는 현실적인 형태다.
  #    크기 하한과 매직바이트를 둘 다 통과하므로 이 시험이 없으면 구멍인 줄 모른다 (감독 발견).
  # 🔴 **선언된** 폰트만 자른다. 00003 은 Pretendard Bold·ExtraBold 를 파일만 두고 선언은 Black 뿐이라,
  #    선언 안 된 것을 잘라 놓고 「검사기가 놓쳤다」고 세면 시험 쪽이 틀린 것이다 (실제로 그랬다).
  for f in $(node pipeline/lib/font-check.mjs "$HF" --declared-files); do
    cp "$f" "$T/keep3"; sz=$(stat -f %z "$T/keep3")
    head -c $((sz / 8)) "$T/keep3" > "$f"
    chk "잘린 폰트 ($(basename "$f") $((sz/8))/$sz 바이트)" "$(run)" 1
    cp "$T/keep3" "$f"
  done
fi
# 🔴 기존 family 이름을 바꾸면 안 된다 — 검사기는 선언을 **모든 파일에서 모아** 본다
#    (합성 렌더에서는 전부 한 문서에 들어가므로 그게 맞다). 한 파일만 고치면 다른 21개가
#    여전히 선언하고 있어 오류가 안 난다. **어디에도 선언되지 않은 이름을 새로 넣는다.**
cp "$F" "$T/o1"; sed -i '' '1s/^/<div style="font-family:GhostFont,sans-serif">x<\/div>/' "$F"
chk "@font-face 없는 family 사용" "$(run)" 1; cp "$T/o1" "$F"
cp "$F" "$T/o2"; sed -i '' '1s/^/<!-- 시험용 주석 -->/' "$F"
chk "무시해야 함: 주석만 수정"   "$(run)" 0; cp "$T/o2" "$F"
chk "복원 후 다시 통과"          "$(run)" 0

echo "  ── 통과 $pass · 실패 $fail"
[ "$fail" -eq 0 ]
