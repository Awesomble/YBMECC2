#!/bin/bash
# 잘 되는 숏츠를 뜯어 구조를 역산한다. ① 시나리오 쓰기 전에 돌린다.
# 사용: ref.sh <URL> [언어]        기본 언어 en (ABMEN 참고작은 영어권). 어느 디렉터리에서 불러도 된다.
#
# 자막을 받아 타임스탬프별 대본과 리듬 수치(컷 리듬·말 속도·정보 밀도)를 낸다.
# ⚠️ 가져오는 건 구조지 내용이 아니다. 문장을 베끼면 그 채널의 AI 티까지 같이 온다.
set -uo pipefail
URL=${1:-}; LANG_=${2:-en}
[ -z "$URL" ] && { echo "사용: ref.sh <URL> [언어]"; exit 1; }
command -v yt-dlp >/dev/null || { echo "⚠️ yt-dlp 가 없습니다."; exit 1; }

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

# 한 호출로 메타 출력 + 자막 저장 (--print 는 기본이 시뮬레이션이라 --no-simulate 필수)
if ! yt-dlp --skip-download --no-simulate \
       --write-auto-subs --write-subs \
       --sub-langs "$LANG_,${LANG_}-orig" --sub-format "vtt/best" \
       --print "제목: %(title)s" --print "길이: %(duration)s초" \
       -o "$TMP/s.%(ext)s" "$URL" 2>"$TMP/err"; then
  echo "⚠️ 영상에 접근하지 못했습니다 (네트워크·비공개·삭제·요청 제한 여부 확인):"
  { grep -i "^ERROR" "$TMP/err" || tail -1 "$TMP/err"; } | tail -2 | sed 's/^/    /'
  exit 1
fi
echo

V=$(ls "$TMP"/s.*.vtt 2>/dev/null | head -1)
[ -z "$V" ] && { echo "⚠️ 영상은 열리지만 '$LANG_' 자막이 없습니다. 다른 언어를 넣어 보세요: ref.sh <URL> ko"; exit 1; }

python3 - "$V" <<'PY'
import re, sys
lines = open(sys.argv[1], encoding='utf-8').read().split('\n')
cues, ts, last = [], None, ''
for l in lines:
    m = re.match(r'^(\d\d):(\d\d):(\d\d)\.(\d\d\d) -->', l)
    if m:
        h, mi, s, ms = map(int, m.groups()); ts = h*3600 + mi*60 + s + ms/1000; continue
    if '-->' in l or l.startswith(('WEBVTT','Kind:','Language:','NOTE')) or not l.strip(): continue
    t = re.sub(r'<[^>]+>', '', l).strip()
    if not t or t == last: continue
    cues.append((ts, t)); last = t

if not cues: print("⚠️ 자막을 읽지 못했습니다."); sys.exit(1)

print("── 대본 ──")
for t, x in cues: print(f"  [{int(t)//60:02d}:{t%60:05.2f}] {x}")

gaps = [b[0]-a[0] for a, b in zip(cues, cues[1:]) if 0 < b[0]-a[0] < 15]
chars = sum(len(x) for _, x in cues)
span = cues[-1][0] - cues[0][0] or 1
hook = [x for t, x in cues if t <= 3.0]
rhythm = f"평균 {sum(gaps)/len(gaps):.2f}초 (최단 {min(gaps):.2f} · 최장 {max(gaps):.2f})" if gaps else "측정 불가"
print(f"""
── 수치 ──
  자막 {len(cues)}줄 · 본문 {span:.1f}초
  자막 간격 {rhythm}   ← 자막 온셋 간격이며 실제 컷 길이는 아님
  말 속도   {chars/span:.1f}자/초   ← 이 참조 영상의 관측값
  정보 밀도 {span/len(cues):.2f}초마다 새 자막

── 훅 (0~3초) ──
  {' '.join(hook) if hook else '(없음)'}

  ▸ 훅의 중심이 수치인가 · 결과 선언인가 · 반전인가?
  ▸ 0·1·2·3초 화면의 주연·관계·암시 단서·정점은? (자막만으로는 모른다 — 영상을 보고 video SKILL 「최우선 — 첫 1·2·3초」로 대조)
  ▸ 마지막 줄이 첫 줄로 되돌아오는가?
  ▸ 구조만 가져온다. 문장은 베끼지 않는다 (docs/07-script.md §1)""")
PY
