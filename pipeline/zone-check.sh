#!/usr/bin/env bash
# 구역 참고 검사 — 샘플 프레임에서 UI 영역의 화소를 찾아 실제 화면 검토에 넘긴다.
# 화소만으로 장식·이동 궤적·읽을 정보를 구별할 수 없으므로 창작을 하드 차단하지 않는다.
#
# 왜 화소로 재나: 사용자 지시가 「실제 모션그래픽을 할 수 있는 영역(**움직임 포함**)을 딱 정해줘」다.
# CSS 좌표는 정지 상태만 말한다 — scale·translate·그림자·글로우가 어디까지 뻗는지는
# **렌더된 화소만 안다.** 00008 F01/F02 는 CSS top:360 인데 푸시인 배율 때문에 실제로는
# 프레임마다 다른 자리에 그려진다.
#
# 구역 정본은 docs/09-safezone.md §1 이다. 여기 숫자를 고치면 그 문서도 같이 고쳐라.
#
# 사용: pipeline/zone-check.sh <프로젝트> [영상.mp4] [--fps N]
#       (프로젝트는 순번으로 — 8 · 00008 · 00008-추석한우)
set -euo pipefail
source "$(dirname "$0")/lib/resolve.sh"
DIR=$(resolve_project "${1:-}") || { echo "사용: pipeline/zone-check.sh <프로젝트> [영상.mp4]" >&2; exit 1; }
shift
VIDEO=""; FPS=4
while [ $# -gt 0 ]; do
  case "$1" in
    --fps) FPS="$2"; shift 2 ;;
    *) VIDEO="$1"; shift ;;
  esac
done
if ! awk -v fps="$FPS" 'BEGIN { exit !(fps ~ /^[0-9]+([.][0-9]+)?$/ && fps > 0) }'; then
  echo "🔴 --fps 는 양수여야 한다" >&2; exit 1
fi
NAME=$(basename "$DIR")
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -n "$VIDEO" ] || VIDEO=$(ls -t "$DIR/output"/render-hf-*.mp4 2>/dev/null | head -1)
[ -f "$VIDEO" ] || VIDEO="$DIR/output/$VIDEO"
[ -f "$VIDEO" ] || { echo "🔴 영상이 없다: $VIDEO" >&2; exit 1; }

OUT=$(mktemp -d); trap 'rm -rf "$OUT"' EXIT
ffmpeg -v error -i "$VIDEO" -vf "fps=$FPS" -y "$OUT/f%05d.png" 2>/dev/null

# 락업 상자 — index.html 의 root-lockup 선언 + 자산 비율에서 유도한다 (하드코딩 금지)
LOCK=$(python3 - "$DIR" <<'PY'
import re,sys,io,os
d=sys.argv[1]; hf=os.path.join(d,"hyperframes")
h=io.open(os.path.join(hf,"index.html"),encoding="utf-8").read()
# 2026-09-27: 루트 락업은 <div id="el-root-lockup" style="left·top·height"><img src=로고></div> (좌상단 이미지 로고).
#   옛 편의 <div> 텍스트 락업(width 명시)·더 옛 <img id=…> 중앙 로고도 읽는다.
m=re.search(r'<(?:div|img)\b[^>]*id="el-root-lockup"[^>]*>', h)
top,ht,left,w,src=220,110,None,None,None
if m:
    tag=m.group(); st=(re.search(r'style="([^"]*)"', tag) or [None,''])[1]
    num=lambda k: (lambda r: int(r.group(1)) if r else None)(re.search(r'(?:^|;)\s*'+k+r':\s*(\d+)px', st))
    top=num('top') or top; ht=num('height') or ht; left=num('left'); w=num('width')
    inner=h[m.end():].split('</div>')[0] if tag.startswith('<div') else tag
    s2=re.search(r'<img[^>]*src="([^"]+)"', inner) or re.search(r'src="([^"]+)"', tag)
    src=s2.group(1) if s2 else None
if w is None:
    try:
        from PIL import Image
        candidates=([os.path.join(hf,src.lstrip('/'))] if src else []) + [os.path.join(os.path.dirname(d),"..","resources","brand","logo.png")]
        for p in candidates:
            if os.path.exists(p):
                iw,ih=Image.open(p).size; w=ht*iw/ih; break
    except Exception: pass
w = w or 356.0
x0 = left if left is not None else 540-w/2
print(f"{top} {top+ht} {x0:.0f} {x0+w:.0f}")
PY
)
read -r L_TOP L_BOT L_X0 L_X1 <<<"$LOCK"

python3 - "$OUT" "$L_TOP" "$L_BOT" "$L_X0" "$L_X1" "$NAME" "$(basename "$VIDEO")" "$FPS" <<'PY'
from PIL import Image, ImageChops
import glob, sys, os
from collections import Counter

OUT,L_TOP,L_BOT,L_X0,L_X1,NAME,VID = sys.argv[1], *map(int,sys.argv[2:6]), sys.argv[6], sys.argv[7]

# ── 구역 정본 (docs/09-safezone.md §1) ────────────────────────────
KEEPOUT   = 10                      # 락업 아래 절대 금지
STAGE_T   = 360                     # 백지 무대 상단 (docs/09 §1 밴드 구조 · 2026-09-15)
# 🔴 MOTION_T 는 **무대 상단**이어야 한다. 2026-09-15 밴드 개정에서 MOTION_B 만 1360 으로 고치고
# 상단은 옛 계산(락업 하단+10=340)이 남았다. 그 20px 이 상단 딥그린 밴드라, 좌우 세이프존과
# 무대 여백 상 박스가 밴드를 물고 **36초 내내 위반**으로 나왔다 (00017 · pitfalls §102).
# 락업 키프아웃 검사는 L_BOT~MOTION_T 구간을 그대로 본다 — 그쪽은 영향이 없다.
MOTION_T  = max(L_BOT + KEEPOUT, STAGE_T)   # 모션 상단 = 무대 상단
MOTION_B  = 1360                    # 무대 하단 (자막 2줄 상단 1372 − 갭 12) — 2026-09-15 밴드 구조 (docs/09 §1)
MOTION_L, MOTION_R = 60, 960        # 좌우 세이프존
GAP_B     = 1372                    # 갭 끝 = 자막 상단 (2줄 h168 · 바닥 1540)
CAP_B     = 1540                    # 자막 밴드 끝 = 하단 플랫폼 UI 시작
STAGE_PAD = 56                      # 배치 참고 여백. 무대 내부를 잘라내는 하드 경계가 아니다.
W, H      = 1080, 1920

fs = sorted(glob.glob(os.path.join(OUT, "*.png")))
if not fs:
    print("🔴 프레임 추출 실패"); sys.exit(1)

# 🔴 그라운드 색은 **프레임마다** 뽑는다. 영상 하나에 고정하면 오탐이 쏟아진다 —
#    00008 은 F01 그라운드가 (25,90,48), F15 가 (16,84,41) 로 프레임마다 다르고,
#    한 프레임 기준으로 전체를 재면 밝은 프레임의 **빈 배경이 전부 「콘텐츠」로 잡혔다**.
#    그라운드에는 비네팅 그라데이션도 있다(실측 G 62~90) — TOL 은 그보다 넉넉해야 한다.
TOL = 38

def ground(im):
    """🔴 화면 전체의 최빈색을 쓰면 안 된다 — 큰 카드가 배경을 이긴다.
       00008 t=6.75s 는 크림 카드가 480,622px, 그라운드가 126,428px 라
       최빈색이 **카드 색**으로 잡히고 그 순간 배경 전체가 「콘텐츠」로 오탐됐다.
       네 모서리는 구역상 아무것도 둘 수 없는 자리라 항상 그라운드다."""
    W, H = im.size
    k = 40
    px = []
    for x0, y0 in ((0, 0), (W-k, 0), (0, H-k), (W-k, H-k)):
        px += list(im.crop((x0, y0, x0+k, y0+k)).getdata())
    return Counter(px).most_common(1)[0][0]

def zone_ground(im, box):
    """무대 좌우 띠(x0~60·x960~1080, y360~1360)는 **크림 무대** 위라 모서리 그라운드(딥그린)와 다르다 (2026-09-15 밴드 구조).

       🔴 **띠 자체의 최빈색을 쓰면 안 된다** (2026-09-15 · 00017 · pitfalls §102).
       옛 주석은 「띠는 원래 비어 있으므로 최빈색이 곧 무대색」이라고 가정했는데,
       무대 하단 여백 띠(y1304~1360)처럼 **얇은 띠에 큰 흰 카드가 걸치면 그 가정이 깨진다** —
       최빈색이 카드 흰색으로 잡혀 **크림 배경 전체가 「콘텐츠」로 뒤집혔다** (전폭 x0~1080 오탐 76프레임).
       `ground()` 가 모서리 4곳으로 푸는 것과 같은 문제다. 여기서는 **무대 전체**의 최빈색을 쓴다 —
       카드가 아무리 커도 1080×1000 안에서는 무대색이 이기고, 반전 비트(딥그린 무대)도 그대로 맞는다."""
    return Counter(im.crop((0, STAGE_T, im.size[0], MOTION_B)).getdata()).most_common(1)[0][0]

def ink(im, box, c):
    """box 안에서 그라운드와 TOL 이상 다른 화소의 bbox (전부 C 연산)"""
    crop = im.crop(box)
    if crop.size[0] <= 0 or crop.size[1] <= 0: return None
    masks = [ch.point(lambda v, b=c[i]: 255 if abs(v-b) > TOL else 0)
             for i, ch in enumerate(crop.split()[:3])]
    m = ImageChops.lighter(ImageChops.lighter(masks[0], masks[1]), masks[2])
    bb = m.getbbox()
    if not bb: return None
    return (bb[0]+box[0], bb[1]+box[1], bb[2]+box[0], bb[3]+box[1])

# 락업 상자는 자산 비율에서 계산한 값이라 렌더 글리프의 안티에일리어싱이 1~2px 삐져나온다.
# 실측(00008): 계산 x349 vs 렌더 x348. 그 1px 을 위반으로 세면 전 프레임이 빨개진다.
AA = 3

ZONES = [
    ("플랫폼 상단 UI",   (0, 0, W, L_TOP),            "🔴"),
    ("락업 띠 좌",       (0, L_TOP, L_X0-AA, L_BOT),  "🔴"),
    ("락업 띠 우",       (L_X1+AA, L_TOP, W, L_BOT),  "🔴"),
    ("락업 키프아웃",    (0, L_BOT, W, MOTION_T),     "🔴"),
    # 화소만으로 글자와 배경·도형을 구분할 수 없다. 무대 안의 블리드는 허용한다.
    # 읽을 글자의 좌우 UI 침범은 layout-scan 의 정착 검사와 화면 검수에서 판정한다.
    ("세이프존 좌",      (0, MOTION_T, MOTION_L, MOTION_B), "⚠️ "),
    ("세이프존 우",      (MOTION_R, MOTION_T, W, MOTION_B), "⚠️ "),
    ("무대 여백 상",     (0, MOTION_T, W, MOTION_T+STAGE_PAD), "⚠️ "),
    ("무대 여백 하",     (0, MOTION_B-STAGE_PAD, W, MOTION_B), "⚠️ "),
    ("자막 갭",          (0, MOTION_B, W, GAP_B),     "⚠️ "),
    ("플랫폼 하단 UI",   (0, CAP_B, W, H),            "🔴"),
]

hits = {}
for f in fs:
    im = Image.open(f).convert("RGB")
    c = ground(im)                      # ← 프레임마다
    n = int(os.path.basename(f)[1:-4]) - 1      # ffmpeg 는 f00001 을 t=0 으로 낸다
    for label, box, sev in ZONES:
        bb = ink(im, box, zone_ground(im, box) if label.startswith(("세이프존", "무대")) else c)
        if bb:
            hits.setdefault((label, sev), []).append((n, bb))

FPS = float(sys.argv[8])
print(f"\n  ══ 구역 강제 — {NAME} · {VID} ══")
print(f"     프레임 {len(fs)}장 (fps {FPS:g}) · 그라운드 프레임별 산출 · tol {TOL}")
print(f"     락업 y{L_TOP}~{L_BOT} x{L_X0}~{L_X1} · 키프아웃 {KEEPOUT}px")
print(f"     ⭐ 모션 영역  x0~{W}  y{MOTION_T}~{MOTION_B}   ({W}×{MOTION_B-MOTION_T})")
print(f"     읽을 정보의 정착 x{MOTION_L}~{MOTION_R} · 무대 안 화소는 검토용 (배경·도형 허용)")
print(f"     자막 밴드 y{GAP_B}~{CAP_B} · 하단 플랫폼 예약 {H-CAP_B}px\n")

# 지속 시간은 검토 우선순위다. 화소만으로 가독성 위반을 판정하지 않는다.

def longest_run(frames):
    """연속 표본의 최대 길이(초)"""
    if not frames: return 0.0
    best = cur = 1
    for a, b in zip(frames, frames[1:]):
        cur = cur + 1 if b == a + 1 else 1
        best = max(best, cur)
    return best / FPS

findings = 0
for label, box, sev in ZONES:
    v = hits.get((label, sev))
    if not v:
        print(f"     ✅ {label}")
        continue
    run = longest_run([n for n, _ in v])
    findings += len(v)
    sev = "⚠️ "
    xs = [b[0] for _, b in v]; xe = [b[2] for _, b in v]
    ys = [b[1] for _, b in v]; ye = [b[3] for _, b in v]
    t0, t1 = v[0][0]/FPS, v[-1][0]/FPS
    print(f"     {sev} {label} — {len(v)}프레임 · {t0:.2f}~{t1:.2f}s · 최장 지속 {run:.2f}초" + "  (화소 후보 — 실제 가림 여부 검토)")
    print(f"        침범 범위  x {min(xs)}~{max(xe)}  y {min(ys)}~{max(ye)}")
    for n, b in v[:4]:
        print(f"        {n/FPS:7.2f}s  x{b[0]}~{b[2]} y{b[1]}~{b[3]}")
    if len(v) > 4: print(f"        … 외 {len(v)-4}프레임")

print()
if findings:
    print(f"  ⚠️ 구역 화소 후보 {findings}건. 실제 정보·락업·자막의 가림을 화면에서 확인한다.")
else:
    print("  ✅ 샘플의 구역 화소 후보 없음. 전체 가독성을 보증하지 않는다.")
print("     읽을 정보의 정착은 layout-scan과 화면 검수로 판정. 경계 돌파·블리드는 허용한다.")
PY
