#!/usr/bin/env bash
# render-gate.sh — 렌더 직후 전수 검사 3종을 한 번에 (2026-09-09 신설)
#
#   pipeline/render-gate.sh <프로젝트> [영상.mp4]
#
# 왜 (docs/02-pitfalls.md · 00003 실측):
#   검사를 따로, 늦게 돌렸다. 그 결과 **빈 화면 결함이 v1 부터 있었는데 v8 까지 살아남았고**
#   사용자에게 한 번 나갔다. lint 는 v9 직전에야 처음 돌려서 `.frame-solo.html` 을 잡았다 —
#   그게 없었으면 진입점이 둘이 되어 오디오가 겹친 영상을 납품할 뻔했다.
#
#   렌더가 35초다. 여기에 40초를 더 쓰는 것이 라운드 하나(수십 분·수백만 토큰)보다 싸다.
#   **결함을 v1 에서 잡으면 워커가 아직 살아 있어 라운드가 안 늘어난다.**
#
# 판정
#   lint          0 errors 여야 한다 — 실패면 렌더 자체가 오염됐을 수 있다 (임시 파일·중복 진입점)
#   motion-audit  「빈 화면 0프레임」은 하드 · 「0.7초+ 무변화」는 경고(봐야 할 곳 — 합불이 아니다)
#   seam-scan     게이트가 아니다. 🔴 표시는 **봐야 할 곳**이지 합불이 아니다
#
# ⚠️ 60fps 영상에서 motion-audit 의 「0.7초+ 정지」는 **얇은 선이 자라는 모션을 못 본다.**
#    걸리면 반드시 프레임을 뽑아 눈으로 대조하라 (docs/14-hyperframes.md §10).
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
source pipeline/lib/resolve.sh

DIR=$(resolve_project "${1:-}") || exit 1
NAME=$(basename "$DIR")
OUT=$(project_out "$DIR")
VIDEO="${2:-}"
if [ -z "$VIDEO" ]; then
  VIDEO=$(ls -t "$OUT"/render*.mp4 2>/dev/null | head -1)
  [ -n "$VIDEO" ] || { echo "✗ $OUT 에 render*.mp4 가 없다" >&2; exit 2; }
elif [ ! -f "$VIDEO" ]; then
  # 🔴 2026-09-10: 파일명만 주면(`render-hf-v4.mp4`) 예전엔 그대로 썼다. 없는 경로라
  #    `[ -nt ]` 가 전부 참이 되어 **소스 23개가 새롭다**는 거짓 반려가 나왔다.
  #    검사가 대상도 없이 「판정」을 내놓는 것이 가장 나쁘다 — 이제 풀어 주고, 못 찾으면 멈춘다.
  [ -f "$OUT/$VIDEO" ] || { echo "✗ 영상을 못 찾았다: $VIDEO · $OUT/$VIDEO" >&2; exit 2; }
  VIDEO="$OUT/$VIDEO"
fi

HF="$DIR/hyperframes"
fail=0

echo
echo "  ══ 렌더 게이트 — $NAME · $(basename "$VIDEO") ══"

# ── ① 렌더에 들어간 소스가 지금 소스와 같은가 (가장 싸고 가장 자주 걸린다) ──
# 🔴 2026-09-10: 예전엔 **mtime** 으로 봤다. 산출 mtime 은 렌더가 소스를 **읽은** 시각이
#    아니라 **다 굽고 닫은** 시각이라, 렌더 도중의 수정을 원리적으로 못 잡는다.
#    00006 v2 실측 — F04 수정 12:48:24 · v2 산출 12:48:51(더 늦다) · 그런데 v2 엔 옛 값.
#    이제 `hf-render.sh` 가 렌더 **전에** 찍어 둔 의미 지문과 대조한다.
# 🔴 2026-09-10: 그 전엔 compositions/frames/ 가 있을 때만 검사해서, 평면 구조
#    (compositions/*.html) 프로젝트에서는 **아무 줄도 안 찍고 조용히 건너뛰었다.**
echo
echo "  ① 소스 최신성"
MAN="$VIDEO.srcman.json"
if [ -f "$MAN" ]; then
  mode=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).mode||"?")' "$MAN")
  # 🔴 옛 규격으로 찍은 봉인은 파일을 덜 담는다 (v1 은 폰트·락업 3개를 놓쳤다).
  #    그대로 대조하면 그 3개가 「+ 추가됨」으로 보여 **진짜 변경과 구분이 안 된다.**
  sv=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).hashVersion??1)' "$MAN")
  cv=$(node --input-type=module -e 'import{HASH_VERSION}from"./pipeline/lib/src-hash.mjs";console.log(HASH_VERSION)' 2>/dev/null)
  if [ "$sv" != "$cv" ]; then
    echo "     🔴 봉인 규격이 다르다 (봉인 v$sv · 현재 v$cv) — 이 대조는 의미가 없다"
    echo "        옛 규격은 담는 파일이 적다. 다시 굽거나(pipeline/hf-render.sh) 근거를 남기고 재봉인하라"
    fail=1
  fi
  node pipeline/lib/src-hash.mjs "$HF" > "$OUT/.srcman-now.json" || exit 1
  drift=$(node -e '
    const fs=require("fs");
    const sealed=JSON.parse(fs.readFileSync(process.argv[1])).files||{};
    const now=JSON.parse(fs.readFileSync(process.argv[2]));
    const keys=[...new Set([...Object.keys(sealed),...Object.keys(now)])].sort();
    for (const k of keys) if (sealed[k]!==now[k])
      console.log((!sealed[k]?"+ ":!now[k]?"- ":"~ ")+k);
  ' "$MAN" "$OUT/.srcman-now.json")
  rm -f "$OUT/.srcman-now.json"
  if [ -n "$drift" ]; then
    cnt=$(echo "$drift" | grep -c '.')
    echo "     🔴 렌더 이후 소스가 $cnt 개 바뀌었다 — 이 렌더는 옛 판이다"
    echo "$drift" | sed 's/^/        /'
    # 🔴 **재렌더가 첫 반응이 되면 안 된다** (2026-09-13 · 00010 실측).
    #    납품이 끝난 뒤 `pipeline/hf-compile.mjs` 가 다른 세션에서 갱신됐고, 재컴파일만으로
    #    6개 프레임의 의미 해시가 갈라져 여기서 하드 실패가 났다. 소스가 **나빠진 게 아니라 좋아진** 경우다.
    #    그때 필요한 것은 굽기가 아니라 **판정**이다 — 이미 사용자에게 간 바이트인가?
    echo ""
    echo "        ⓒ 굽기 전에 판정하라 — 이 렌더가 **이미 사용자에게 간 납품본**인가?"
    echo "           · 납품본이다   → 다시 굽지 마라. **사용자에게 올려 판단을 받아라.**"
    echo "                            (무엇이 바뀌었고 왜 바뀌었는지 · 다시 구우면 뭐가 나아지는지)"
    echo "           · 작업 중이다  → 굽는다. 단 지적을 **모아서** 고친 뒤 한 번만 (pipeline/fix-batch.mjs)"
    echo "        ⓒ 공용 도구(hf-compile·layout-probe·src-hash)가 바뀌어서 갈라진 것이라면"
    echo "           **그 프로젝트가 잘못된 게 아니다.** 납품 끝난 건은 그대로 두고 다음 영상부터 적용하라."
    fail=1
  else
    echo "     ✅ 렌더에 봉인된 지문과 현재 소스가 일치 (mode=$mode)"
    [ "$mode" = "pre-render" ] || { echo "     🔴 렌더 전 봉인이 아니다 — 납품 최신성을 확인할 수 없다"; fail=1; }
  fi
else
  # 지문이 없다 = hf-render.sh 를 안 거친 렌더. mtime 으로 **약하게** 본다.
  echo "     🔴 지문 없음 ($(basename "$MAN")) — 납품 최신성 미검증. 아래 mtime은 참고값이다"
  fail=1
  echo "        mtime 은 렌더 도중 수정을 못 잡는다. 다음부터 pipeline/hf-render.sh 로 구워라"
  if [ -d "$HF/compositions" ] || [ -f "$HF/index.html" ]; then
    srcs=$(find "$HF/compositions" -name '*.html' 2>/dev/null; [ -f "$HF/index.html" ] && echo "$HF/index.html")
    newer=$(echo "$srcs" | grep -v '^$' | while read -r f; do [ "$f" -nt "$VIDEO" ] && echo "$f"; done)
    cnt=$(echo "$newer" | grep -vc '^$')
    total=$(echo "$srcs" | grep -vc '^$')
    if [ "$cnt" != "0" ]; then
      echo "     🔴 렌더보다 새로운 소스 $cnt 개 — 이 렌더는 옛 판이다"
      echo "$newer" | grep -v '^$' | sed "s|$HF/||" | sed 's/^/        /'
      fail=1
    else
      echo "     △ 렌더가 소스 $total 개보다 뒤다 (약식 — 내용은 안 봤다)"
    fi
  else
    echo "     🔴 소스를 못 찾았다 ($HF/compositions · index.html) — 경로를 확인하라"
    fail=1
  fi
fi

# ── ①-b fps ──
#  HyperFrames 기본값이 30 이다. 우리 규격은 60 — 빠른 컷에서 한 프레임에 196px 건너뛴다
#  (docs/14-hyperframes.md §10). 00002 는 v1~v4 가 전부 30fps 로 나갔다.
FPS=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of default=nw=1:nk=1 "$VIDEO" 2>/dev/null | awk -F/ '{if($2)printf "%d",$1/$2; else printf "%s",$1}')
EXPECTED_FPS=$(node --input-type=module -e 'import{readTiming}from"./pipeline/lib/timing.mjs";console.log(readTiming(process.argv[1]).fps)' "$DIR") || exit 1
if [ "$FPS" = "$EXPECTED_FPS" ]; then
  echo "     ✅ ${FPS}fps"
else
  echo "     🔴 ${FPS}fps — 현재 프로젝트 시간축은 ${EXPECTED_FPS}fps"
  fail=1
fi

# ── ② lint ──
echo
echo "  ② lint"
if [ -d "$HF" ]; then
  # ⚠️ 2026-09-09 버그 수정 2건 (00005 감독이 잡았다):
  #   ① CLI 는 「0 error(s)」 를 찍는데 여기서 「0 errors」 를 찾고 있었다 → 항상 실패로 판정
  #   ② 버전이 0.8.31 로 굳어 있었다. 프로젝트가 쓰는 판(package.json 의 핀)과 달라지면
  #      lint 규칙이 어긋난다 — 프로젝트 핀을 읽고, 없으면 0.8.32 로 떨어진다
  #   ③ 2026-09-09 재수정: `scripts.lint` 만 보면 안 된다 — 00003 의 package.json 에는
  #      lint 스크립트가 없어서(dev/check/render/publish 뿐) 추출이 실패하고 0.8.32 로 떨어졌다.
  #      **프로젝트는 0.8.31 핀인데 게이트가 0.8.32 로 재서** 없던 경고 21개가 떴다.
  #      스크립트 전체에서 핀을 찾는다.
  LINT=$(cd "$HF" && node "$ABM_ROOT/pipeline/hf-cli.mjs" "$DIR" lint 2>&1)
  LINT_RC=$?
  #   ④ 출력 형식이 판마다 다르다 — 0.8.31 은 `0 errors`, 0.8.32 는 `0 error(s)`.
  #      둘 다 받는다. `[^0-9]` 로 앞을 막지 않으면 「10 errors」 가 통과한다.
  echo "$LINT" | grep -E "✗|[0-9]+ errors?(\(s\))?" | sed 's/^/     /'
  echo "$LINT" | grep -qE "(^|[^0-9])0 errors?(\(s\))?" || { echo "     🔴 lint 실패"; fail=1; }
  [ "$LINT_RC" -eq 0 ] || { echo "     🔴 lint 실행 실패 (rc=$LINT_RC)"; fail=1; }
fi

# ── ②-b 모션 소스 참고 통계 — 호출 수로 연출을 제한하지 않는다 ──
echo
echo "  ②-b 모션 소스 참고 통계"
if [ -d "$HF/compositions" ]; then
  node - "$HF/compositions" <<'JS'
const fs = require('node:fs'), path = require('node:path');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.name.endsWith('.html') ? [p] : [];
  });
}
const files = walk(process.argv[2]);
const count = files.reduce((n, f) => n + (fs.readFileSync(f, 'utf8').match(/\.(to|from|fromTo|set)\(/g) || []).length, 0);
console.log(`     GSAP 형태 호출 ${count}개 / HTML ${files.length}개 — 개수·비율로 합불을 정하지 않는다`);
JS
fi

# ── ②-c 폰트 — 선언 없는 family 는 **조용히 시스템 폰트로 떨어진다** ──
# 🔴 2026-09-10 사용자 지적: 00006 은 자막·라벨·본문이 전부 배민 한나체로 나갔다.
#    docs/12-brand.md 는 그 자리를 **Pretendard** 로 정해 뒀는데 프로젝트에 파일조차 없었다.
#    화면에 글자는 멀쩡히 보이니 아무 검사도 안 걸렸다 — 폰트를 보는 도구가 없었다.
echo
echo "  ②-c 폰트"
if [ -f "$HF/index.html" ]; then
  node pipeline/lib/font-check.mjs "$HF" || fail=1
else
  echo "     △ HyperFrames 프로젝트가 아니다 — 건너뛴다"
fi

# ── ②-e 구역 강제 — 🔴 **움직임을 포함한** 화소 검사 (2026-09-11 사용자 지시) ──
#  「실제 모션그래픽을 할 수 있는 영역(움직임포함)을 딱정해줘 … 강제해 영역만큼은 확실하게」
#  CSS 좌표는 정지 상태만 말한다. 00008 F01 의 충격파 링은 CSS 상 카드 안인데
#  scale 0.6→1.55 로 퍼지면서 **y1793 까지** 내려가 플랫폼 하단 UI 를 침범했다 —
#  lint · hyperframes check · 감독 심사 · 스냅샷 눈검사가 전부 통과시킨 것을 이 검사가 잡았다.
echo
if node -e 'const j=require(process.argv[1]);process.exit(j.bundle&&j.orientation==="landscape"?0:1)' "$DIR/cuts.json" 2>/dev/null; then
  # 가로 롱폼 묶음(docs/channel/08-longform.md): 무대 안은 원본 숏츠에서 이미 구역 검사를 통과했고
  # hf-bundle verify(렌더 전)가 원본과 같은 무대임을 SSIM으로 확인한다. 여기서는 렌더 규격·챕터별 음량을 본다.
  echo "  ②-e 묶음 렌더 — 세로 구역 검사 대신 hf-bundle verify --video"
  node pipeline/hf-bundle.mjs "$DIR" verify --video "$VIDEO" 2>&1 | sed 's/^/   /'
  [ "${PIPESTATUS[0]}" = "0" ] || fail=1
else
  pipeline/zone-check.sh "$DIR" "$VIDEO" || fail=1
fi

# ── ③ 모션 총량 + 빈 화면 ──
#  🔴 두 판정을 갈라서 쓴다. 「빈 화면」은 거짓 양성이 없어 하드 실패로 잡고,
#     「0.7초+ 정지」는 60fps 에서 얇은 선이 자라는 모션을 못 봐 **문서화된 거짓 실패**가 있다
#     (docs/14-hyperframes.md §10). 후자로 게이트를 떨구면 사람이 게이트를 무시하게 된다.
echo
echo "  ③ 모션·빈 화면"
AUDIT=$(node pipeline/motion-audit.mjs "$VIDEO" 2>&1)
echo "$AUDIT" | sed 's/^/   /'
if node -e 'const j=require(process.argv[1]);process.exit(j.bundle&&j.orientation==="landscape"?0:1)' "$DIR/cuts.json" 2>/dev/null; then
  # 가로 롱폼 묶음: 원본 챕터 본문 안의 빈 화면은 원본 숏츠 게이트와 렌더 대조(verify --video)가 이미 보증한다.
  # 묶음이 새로 만든 구간(0초 포스터·전환·정리)과 챕터 경계 ±0.3초의 빈 화면만 하드 실패로 본다(2026-09-26 00026 실측:
  # 00014의 라임 단색 연출 박자가 가로 판정 영역에서 한 색 98.5%를 살짝 넘었다 — 원본과 같은 화면).
  # 🔴 pipefail 이라 motion-audit 의 종료 코드(정지·빈 화면이 하나라도 있으면 1)가 파이프 전체를 실패로 만든다 —
  #    분류가 ✅ 를 내도 게이트가 떨어졌다(2026-09-26 L1 v2). JSON 을 먼저 받아 두고 분류 결과만 판정에 쓴다.
  AJSON=$(node pipeline/motion-audit.mjs "$VIDEO" --json 2>/dev/null || true)
  printf '%s' "$AJSON" | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s.slice(s.indexOf("{")));const c=require(process.argv[1]);
    let t=0;const seg=c.cuts.map(x=>{const r={id:x.id,kind:x.bundle,a:t,b:t+x.dur};t+=x.dur;return r});
    const own=(x)=>{const g=seg.find(q=>x>=q.a&&x<q.b)||seg.at(-1);return g.kind!=="chapter"||x-g.a<.3||g.b-x<.3?g.id:null};
    const hard=[],soft=[];for(const [a0,b0] of a.blank_runs||[]){const where=own(a0)||own(b0-1e-3);(where?hard:soft).push(`${a0}~${b0}${where?" "+where:""}`)}
    if(soft.length)console.log("     ℹ️ 챕터 본문 안 빈 화면 "+soft.length+"구간 — 원본 숏츠와 같은 화면인지는 verify --video 무대 대조가 판정한다: "+soft.join(", "));
    if(hard.length){console.log("     🔴 묶음이 만든 구간·챕터 경계의 빈 화면 — 하드 실패: "+hard.join(", "));process.exit(1)}
    console.log("     ✅ 묶음이 만든 구간·챕터 경계에 빈 화면 없음")})' "$DIR/cuts.json" || fail=1
else
  echo "$AUDIT" | grep -q "빈 화면 (배경만 남은 프레임)  0개" || { echo "     🔴 빈 화면이 있다 — 하드 실패"; fail=1; }
fi
echo "$AUDIT" | grep -q "썸네일 정지 (구도가 안 바뀜)  0곳" || echo "     ℹ️  5초+ 같은 구도 — 보고용이다. 막지 않는다 (2026-09-16 제약 해제)"
echo "$AUDIT" | grep -q "0.7초+ 연속 정지  0곳" || {
  echo "     ⚠️ 정지 구간 — **프레임을 뽑아 눈으로 대조하라.** 얇은 선이 자라는 모션이면 거짓 실패다"
  echo "     ℹ️ 정지·반복·부유도 연출 선택이다. 수치 대신 내용 전달과 실제 움직임을 확인한다."
  echo "        00010 에서 그렇게 9곳→1곳을 만들었고 트윈의 59%가 진동이 됐다. 지표만 좋아지고 화면은 나빠진다."
  echo "        답은 진짜 모션·변화 확대·컷 병합 셋 중 하나다. 셋 다 아니면 **남겨 두고 보고**하라."
}

# ── ④ 이음매 (참고 — 합불 아님) ──
echo "  ④ 이음매 (참고)"
node pipeline/seam-scan.mjs "$DIR" "$VIDEO" 2>&1 | sed 's/^/   /'

echo
if [ "$fail" = "0" ]; then
  echo "  ✅ 게이트 통과 — 🔴 로 표시된 이음매는 프레임을 뽑아 눈으로 확인하라"
else
  echo "  🔴 게이트 실패 — 위 항목을 고치고 다시 굽는다"
fi
echo
exit "$fail"
