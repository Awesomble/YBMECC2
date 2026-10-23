#!/usr/bin/env bash
# hf-render.sh — HyperFrames 렌더 + 소스 지문 봉인 (2026-09-10 신설)
#
#   pipeline/hf-render.sh <프로젝트> [출력파일명]
#
# 왜 이 래퍼가 필요한가 (00006 v2 실측, 감독 지적):
#   render-gate ① 은 mtime 으로 「소스가 렌더보다 새로운가」를 봤다.
#     F04 소스 수정  12:48:24
#     v2 산출 mtime  12:48:51   ← 소스보다 **27초 늦다** → 게이트 통과
#     그런데 v2 에는 옛 transformOrigin 이 들어 있었다.
#   산출 mtime 은 **렌더 완료 시각**이지 렌더가 소스를 읽은 시각이 아니다.
#   렌더가 56초 걸리는 동안 소스를 고치면, 고친 것이 안 들어갔는데도
#   산출이 더 새로워 보인다. **시각 비교로는 원리적으로 못 잡는다.**
#
# 그래서 렌더 **전에** 지문을 찍고, 렌더 **후에** 다시 찍어 대조한 뒤 봉인한다.
#   렌더 도중 소스가 바뀌었으면 그 산출은 무엇을 담았는지 알 수 없다 → 🔴 폐기.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
source pipeline/lib/resolve.sh

DIR=$(resolve_project "${1:-}") || exit 1
NAME=$(basename "$DIR")
OUT=$(project_out "$DIR")
HF="$DIR/hyperframes"
[ -d "$HF" ] || { echo "✗ $HF 가 없다 — HyperFrames 프로젝트가 아니다" >&2; exit 2; }

# ── 🔴 수정 묶음 가드 (2026-09-13 사용자 필수 요건) ────────────────────────────
#    "수정할때 하나하나 하고 확인하지 말고 할때마다 전체 집계후 한번에 하도록 강제해"
#    지적을 한 건 고치고 굽고 또 확인받는 흐름을 **물리적으로 막는다.**
node pipeline/fix-batch.mjs guard "$DIR" || { echo "  → 렌더를 막았다. 묶음을 닫고 다시 불러라." >&2; exit 3; }

FILE="${2:-}"
# 🔴 **파일명만** 받는다. 경로를 주면 output/<p>/output/<p>/… 로 중첩된다 (abm-30 실측 2026-09-13:
#    00011 에서 그 렌더를 통째로 버렸다). 사용법을 지키라고 말하는 대신 코드가 흡수한다.
case "$FILE" in */*) echo "  ⚠️  출력 인자는 **파일명만** 받는다 — '$FILE' → '$(basename "$FILE")' 로 처리한다"; FILE=$(basename "$FILE") ;; esac
if [ -z "$FILE" ]; then                      # 지정 안 하면 render-hf-vN 다음 번호
  n=1; while [ -e "$OUT/render-hf-v$n.mp4" ]; do n=$((n+1)); done
  FILE="render-hf-v$n.mp4"
fi
VIDEO="$OUT/$FILE"
[ -e "$VIDEO" ] && { echo "✗ $VIDEO 가 이미 있다 — 덮어쓰지 않는다" >&2; exit 2; }

# 이름 충돌·고정 CLI·필수 실행 파일을 먼저 검사한다. 실패는 예산을 쓰지 않는다.
CLI=$(node pipeline/hf-cli.mjs "$DIR" --resolve) || exit 2
FPS=$(node --input-type=module -e 'import{readTiming}from"./pipeline/lib/timing.mjs";console.log(readTiming(process.argv[1]).fps)' "$DIR") || exit 2
[ -s "$HF/index.html" ] || { echo "✗ index.html 이 없다" >&2; exit 2; }
command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null || { echo "✗ ffmpeg/ffprobe 없음" >&2; exit 2; }
LOCK="$OUT/.render-lock"
mkdir "$LOCK" 2>/dev/null || { echo "✗ 같은 프로젝트 렌더가 진행 중이거나 잠금이 남았다: $LOCK" >&2; exit 3; }
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT
# ── 🔴 렌더 횟수 상한 (abm-44 실측 2026-09-13: 00010 에서 **11회 굽고 10회 버렸다**) ──
#    매번 게이트가 낸 **지적 1건만** 고치고 다시 구웠다. 게이트는 전 항목을 한 번에 내는데도.
#    사용자가 끊고 3건을 묶으니 하드 0·소프트 0 이 **한 번에** 나왔다.
#    CLAUDE.md 상한은 3회다 — 글로만 있었고 **도구가 세지 않아** 아무도 안 지켰다. 이제 센다.
COUNTER="$OUT/.render-count"
mkdir -p "$OUT"
N=$(( $( [ -f "$COUNTER" ] && cat "$COUNTER" || echo 0 ) + 1 ))
if [ "$N" -gt 3 ]; then
  cat >&2 <<EOS

  🔴 렌더 $N 회째다 — 상한 3회를 넘었다. **굽지 않는다.**

     렌더가 3회를 넘으면 그건 렌더 문제가 아니라 **게이트 B·C 가 제 역할을 못 한 것**이다.
     00010 실측: 11회 굽고 10회 버렸다. 매번 지적 1건만 고쳤기 때문이다.

     지금 할 일 — 굽지 말고:
       1. render-gate·layout-scan 의 **전 항목**을 모은다 (첫 하드에서 멈추지 마라)
       2. node pipeline/fix-batch.mjs open $NAME "<항목1>" "<항목2>" …
       3. 유형별로 전수 수정 → close → 그때 한 번 굽는다

     사용자가 「이 횟수로 가겠다」고 하면 상한을 풀어라:
       rm $COUNTER

EOS
  exit 3
fi
[ "$N" -ge 3 ] && echo "  ⚠️  렌더 $N 회째 (상한 3). 다음 굽기는 막힌다 — 남은 지적을 전부 모아라"
mkdir -p "$OUT"

SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"; rmdir "$LOCK" 2>/dev/null || true' EXIT

echo
echo "  ══ HyperFrames 렌더 — $NAME → $FILE ══"

# ── ① 렌더 전 지문 ──────────────────────────────────────────────
node pipeline/lib/src-hash.mjs "$HF" > "$SCRATCH/before.json" 2> "$SCRATCH/hash.err" || { cat "$SCRATCH/hash.err" >&2; exit 1; }
# 🔴 참조가 끊긴 자산이 있으면 굽지 않는다 — 렌더러는 없는 <img>를 조용히 건너뛰고 산출을 낸다(2026-10-09 L10 v2: 정리 카드 스틸을
#    다시 만들려고 지운 뒤 build 없이 구워 카드 그림이 빠졌다, render-gate lint에서야 잡혔다). 예산을 쓰지 않는다
if grep -q "참조가 끊긴 자산" "$SCRATCH/hash.err"; then
  sed 's/^/     /' "$SCRATCH/hash.err" | grep -v "trace-warnings" >&2
  echo "  🔴 참조가 끊긴 자산 — 굽지 않는다. 묶음이면 node pipeline/hf-bundle.mjs <p> build 로 다시 만든 뒤 부른다" >&2
  exit 2
fi
# 🔴 audio_meta의 효과음이 index에 다 들어갔는지 — sync가 사용 중단 파일로 실패해도 index는 옛 판으로 남는다(pitfalls §192,
#    ABMEN 00108 v1 35개·00118 v1 39개 누락 재발: sfx-level은 audio_meta만 읽어 「묻힘 0」). 예산을 쓰지 않는다
if ! node -e '
  const fs=require("fs"),p=require("path"),hf=process.argv[1];
  const m=p.join(hf,"audio_meta.json"); if(!fs.existsSync(m)) process.exit(0);
  const sfx=(JSON.parse(fs.readFileSync(m,"utf8")).sfx||[]).map(s=>s.file).filter(Boolean);
  const idx=fs.readFileSync(p.join(hf,"index.html"),"utf8");
  const miss=[...new Set(sfx)].filter(f=>!idx.includes("assets/sfx/"+f));
  const n=(idx.match(/<audio[\s>][^>]*assets\/sfx\//g)||[]).length;
  if(miss.length||n<sfx.length){console.error(`  🔴 index 효과음 ${n}개 < audio_meta ${sfx.length}개${miss.length?" · 빠진 파일 "+miss.join(", "):""}`);process.exit(1)}
' "$HF"; then
  echo "  → node pipeline/hf-project.mjs <p> sync 를 exit 0까지 돌린 뒤 다시 불러라 (사용 중단 효과음이면 대체 후보로 바꾼다)" >&2
  exit 2
fi
echo "  ① 소스 지문 $(grep -c '":' "$SCRATCH/before.json") 개 봉인 — $(date '+%H:%M:%S')"

# ── ② 렌더 (프로젝트 package.json 의 핀 버전 · --fps 60) ────────
#    🔴 fps 를 빼면 30 으로 나온다 (docs/14-hyperframes.md §10).
#    🔴 2026-09-11 정정 — 여기 원래 「package.json 의 render 스크립트가 --fps 60 을
#       이미 들고 있다」고 적혀 있었다. **틀렸다.** 실측하니 8개 프로젝트 중
#       `--fps 60` 을 가진 건 00006 하나뿐이었고, 나머지는 전부 30fps 로 구워졌다.
#       00008 이 그렇게 한 번 구워지고 게이트 ①에서 잡혔다.
#       프로젝트 설정에 기대지 않는다 — **여기서 직접 넘긴다.** 이미 가진 프로젝트는
#       같은 값이 두 번 갈 뿐이라 무해하다.
# ── 디스크 — 프레임을 디스크에 쌓는 캡처는 RGBA 원본을 프레임마다 저장한다(1920×1080 ≈ 8.3 MB/프레임).
#    2026-09-26 L1 실측: 3분 57초 가로 = 14,220프레임 ≈ 118 GB 필요, 여유 44 GB → 「Disk capture may need …」로 두 번 실패.
#    예상치가 여유의 80%를 넘으면 --low-memory-mode(프레임을 바로 인코딩, 캡처 1워커 — 느리지만 디스크를 쓰지 않는다)로 굽는다.
EXTRA=""
NEED_MB=$(node -e '
  const fs=require("fs"); const h=fs.readFileSync(process.argv[1],"utf8");
  const w=+(h.match(/id="root"[^>]*data-width="(\d+)"/)||[])[1]||1080, ht=+(h.match(/id="root"[^>]*data-height="(\d+)"/)||[])[1]||1920;
  const d=+(h.match(/id="root"[^>]*data-duration="([\d.]+)"/)||[])[1]||0;
  console.log(Math.round(d*Number(process.argv[2])*w*ht*4/1e6));' "$HF/index.html" "$FPS")
FREE_MB=$(df -Pm "$OUT" | awk 'NR==2{print $4}')
if [ -n "$NEED_MB" ] && [ -n "$FREE_MB" ] && [ "$NEED_MB" -gt $(( FREE_MB * 8 / 10 )) ]; then
  EXTRA="--low-memory-mode"
  echo "  ⚠️  임시 프레임 약 ${NEED_MB} MB > 여유 ${FREE_MB} MB의 80% — --low-memory-mode 로 굽는다 (느림)"
fi
# ffmpeg 처리 시간 제한(렌더러 기본 300초)을 30분으로 — 롱폼 묶음은 오디오 클립이 440개를 넘어 고부하에서 혼합이 실시간보다 느려
#   300초에 끊겼다(2026-10-09 L6 00086 측정 렌더 `audio_processing_failed: ffmpeg_timeout`, 306초, pitfalls §187). 결과물은 바뀌지 않는다
export FFMPEG_PROCESS_TIMEOUT_MS="${FFMPEG_PROCESS_TIMEOUT_MS:-1800000}"
t0=$(date +%s)
( cd "$HF" && node "$CLI" render --fps "$FPS" --skill=faceless-explainer --quality high $EXTRA --output "$VIDEO" ) \
  < /dev/null
rc=$?
t1=$(date +%s)
[ $rc -eq 0 ] || { echo "  🔴 렌더 실패 (rc=$rc)"; exit $rc; }
[ -s "$VIDEO" ] || { echo "  🔴 산출이 비었다 — $VIDEO"; exit 1; }
# 실제 산출이 나온 렌더만 집계한다. 실행/환경 실패로는 차감하지 않는다.
echo "$N" > "$COUNTER"
echo "  ② 렌더 완료 $((t1-t0))초 · $(du -h "$VIDEO" | cut -f1)"

# ── ③ 렌더 후 지문 — 도중에 바뀐 파일이 있으면 이 산출은 못 믿는다 ──
node pipeline/lib/src-hash.mjs "$HF" > "$SCRATCH/after.json" || exit 1
drift=$(node -e '
  const fs=require("fs"), a=JSON.parse(fs.readFileSync(process.argv[1])), b=JSON.parse(fs.readFileSync(process.argv[2]));
  const keys=[...new Set([...Object.keys(a),...Object.keys(b)])];
  const d=keys.filter(k=>a[k]!==b[k]);
  console.log(d.join("\n"));
' "$SCRATCH/before.json" "$SCRATCH/after.json")
if [ -n "$drift" ]; then
  echo "  🔴 렌더 도중 소스가 바뀌었다 — 이 산출은 무엇을 담았는지 알 수 없다"
  echo "$drift" | sed 's/^/       /'
  echo "     → $VIDEO 를 지우고 소스를 동결한 뒤 다시 구워라"
  exit 1
fi

# ── ④ 봉인 ──────────────────────────────────────────────────────
# 🔴 hashVersion 을 반드시 싣는다. 없으면 게이트가 옛 규격(v1)으로 읽고
#    「이 대조는 의미가 없다」로 반려한다 — 첫 실사용에서 실제로 그랬다.
node --input-type=module -e '
  import fs from "node:fs"; import path from "node:path";
  import { HASH_VERSION } from "./pipeline/lib/src-hash.mjs";
  fs.writeFileSync(process.argv[2], JSON.stringify({
    mode:"pre-render", hashVersion:HASH_VERSION, sealedAt:new Date().toISOString(),
    video:path.basename(process.argv[3]),
    files:JSON.parse(fs.readFileSync(process.argv[1]))
  },null,2)+"\n");
' "$SCRATCH/before.json" "$VIDEO.srcman.json" "$VIDEO"
echo "  ③ 지문 봉인 → $(basename "$VIDEO").srcman.json  (mode=pre-render)"
echo
echo "  다음: pipeline/render-gate.sh $NAME $FILE"
