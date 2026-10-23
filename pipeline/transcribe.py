#!/usr/bin/env python3
import hashlib
# ③ 목소리 — **자막 생성기**. 대본 어절에 whisper 실측 온셋을 붙여 subtitles.tsx 의 SUBS 를 만든다.
# 사용: ~/.venvs/abm-whisper/bin/python pipeline/transcribe.py <프로젝트> [--apply] [--retranscribe]
#
# 지금까지 이 자리는 지시서에 `python -c "..."` 말줄임으로만 있었다. 매번 즉흥으로 짜면 재현성이 0이다.
#
# ⚠️ **글자는 whisper 가 아니라 `cuts.json` 의 `say` 에서 온다.**
#    whisper 는 고유명사·수사를 틀린다 (실측: 잘살아보세→"잘"+"살아보세"(어절 쪼갬) · 닷새간→"탓세간" · 온누리→"오늘이" · 십 프로→"10 %").
#    whisper 가 주는 것은 **시간**뿐이다. 대본 어절과 전사 어절을 정렬해 온셋만 가져온다.
#
# 하는 일
#   1. projects/<p>/output/narration.wav 를 faster-whisper 로 어절 단위 전사 (word_timestamps)
#   2. `cuts.json` 의 say 어절 ↔ 전사 어절을 DP 정렬 (수사·기호는 정규화해서 비교)
#      정렬이 안 된 어절은 앞뒤 앵커 사이에서 선형 보간한다 (줄 끝에 `~ 온셋 보간` 표시)
#   3. 표시 초 → **원음 초** 환산: m = t × SPEED   (narration.wav 에는 배속이 걸려 있다)
#   4. 유닛 경계·문장부호·휴지에서 2~4어절로 끊어 SUBS 출력. --apply 면 파일의 SUBS 를 갈아 끼운다
#
# ⚠️ 강조(<G>/<R>)는 **기존 파일에서 같은 문구를 찾아 옮길 뿐** 새로 고르지 않는다 — 청크당 1개, 사람이 정한다.
# ⚠️ 대본·음성이 바뀌면 반드시 다시 돌려라. 추정으로 때우지 마라.
import re, sys, json, difflib, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

CHUNK_MAX = 4      # 청크 최대 어절 수 (docs/11-motion.md)
GAP = 0.26         # 이만큼 쉬면 끊는다 (표시 초)
GAP_SOLO = 0.30    # 한 어절만으로 청크를 만들 수 있는 휴지


def resolve(q):
    q = (q or '').rstrip('/')
    if q and (pathlib.Path(q) / 'cuts.json').exists():
        return pathlib.Path(q).resolve()
    if q and (ROOT / 'projects' / q).is_dir():
        return ROOT / 'projects' / q
    names = sorted(p.name for p in (ROOT / 'projects').iterdir() if not p.name.startswith('.'))
    n = q.zfill(5) if q.isdigit() else None
    hit = (next((x for x in names if n and x.startswith(n + '-')), None)
           or next((x for x in names if q and q in x), None))
    if not hit:
        sys.exit(f'✗ 프로젝트를 찾지 못했습니다: {q}   (예: 2 · 00002 · 00002-온누리적립)')
    return ROOT / 'projects' / hit


# ── 수사 정규화 — "십 프로" 와 "10 %" 가 같은 말임을 알아야 정렬이 붙는다 ────────────
_D = {'영': 0, '공': 0, '일': 1, '이': 2, '삼': 3, '사': 4, '오': 5, '육': 6, '륙': 6, '칠': 7, '팔': 8, '구': 9}
_S = {'십': 10, '백': 100, '천': 1000}
_B = {'만': 10 ** 4, '억': 10 ** 8}
_TAIL = '일월시분초년'          # "이십일" = 21 인가 "20일" 인가 — 둘 다 후보로 낸다
_SYM = [('%', '프로'), ('tv', '티비')]


def _num_prefix(w):
    """앞머리의 수 표현을 (값, 남은 글자, 마지막으로 먹은 글자) 로. 못 읽으면 None"""
    total = sec = cur = 0
    i, seen, had_digit = 0, False, False
    while i < len(w):
        c = w[i]
        if c.isdigit():
            j = i
            while j < len(w) and w[j].isdigit():
                j += 1
            cur = int(w[i:j]); i = j; seen = True; had_digit = True; continue
        if c in _D and not had_digit:
            cur = _D[c]
        elif c in _S:
            sec += (cur or 1) * _S[c]; cur = 0
        elif c in _B:
            total += ((sec + cur) or 1) * _B[c]; sec = cur = 0
        else:
            break
        i += 1; seen = True; had_digit = False
    if not seen:
        return None
    return total + sec + cur, w[i:], w[i - 1] if i else ''


def variants(w):
    """비교용 정규형 후보. 수사는 정수로, 기호는 한글 읽기로 통일한다"""
    s = re.sub(r'[^0-9A-Za-z가-힣%]', '', w).lower()
    for a, b in _SYM:
        s = s.replace(a, b)
    if not s:
        return ['']
    out = []
    p = _num_prefix(s)
    if p:
        n, rest, last = p
        out.append(f'{n}{rest}')
        # "이십일" 은 21 로도, "20"+"일" 로도 읽힌다. 둘 다 후보에 넣는다
        if last in _TAIL and not rest and len(s) > 1:
            base = _num_prefix(s[:-1])
            if base and not base[1]:
                out.append(f'{base[0]}{last}')
    out.append(s)
    return out


def sim(a, b):
    return max(difflib.SequenceMatcher(None, x, y).ratio()
               for x in variants(a) for y in variants(b))


MIN_SIM = 0.34   # 이 아래는 정렬로 인정하지 않는다 (아래 주석 참조)


def align(script, heard):
    """대본 어절 ↔ 전사 어절 단조 정렬 (Needleman-Wunsch). script[i] → heard 인덱스 또는 None

    ⚠️ 비용만으로는 **전혀 다른 음성도 정렬된다**: 유사도 0 의 점수는 -0.30 인데 양쪽 갭은 -0.70 이라
    엉뚱한 어절이 앵커로 남는다 (2026-09-08 산술 확인). 그래서 역추적 뒤 MIN_SIM 미만을 떼어낸다 —
    떼어낸 자리는 보간으로 넘어가고 보고에 잡힌다.
    """
    GAPP, FLOOR = -0.35, 0.30
    n, m = len(script), len(heard)
    sc = [[sim(script[i], heard[j]['t']) - FLOOR for j in range(m)] for i in range(n)]
    F = [[0.0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        F[i][0] = F[i - 1][0] + GAPP
    for j in range(1, m + 1):
        F[0][j] = F[0][j - 1] + GAPP
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            F[i][j] = max(F[i - 1][j - 1] + sc[i - 1][j - 1], F[i - 1][j] + GAPP, F[i][j - 1] + GAPP)
    out = [None] * n
    i, j = n, m
    while i > 0 and j > 0:
        if F[i][j] == F[i - 1][j - 1] + sc[i - 1][j - 1]:
            out[i - 1] = j - 1; i -= 1; j -= 1
        elif F[i][j] == F[i - 1][j] + GAPP:
            i -= 1
        else:
            j -= 1
    # 유사도가 바닥인 짝은 정렬로 치지 않는다 — 보간으로 넘긴다
    for k, jj in enumerate(out):
        if jj is not None and sim(script[k], heard[jj]['t']) < MIN_SIM:
            out[k] = None
    return out


APPLY = '--apply' in sys.argv
DIR = resolve(next((a for a in sys.argv[1:] if not a.startswith('--')), ''))
OUT = DIR / 'output'
WAV = OUT / 'narration.wav'
TSX = DIR / 'motion' / 'subtitles.tsx'
TL = DIR / 'motion' / 'timeline.ts'

if not WAV.exists():
    sys.exit(f'✗ {WAV} 없음 — 먼저 pipeline/narration.sh {DIR.name}')

# 실효 배속 — narration.wav 는 이 배속이 걸린 상태다 (pitfalls §11)
mm = re.search(r'export const SPEED\s*=\s*([\d.]+)', TL.read_text(encoding='utf-8')) if TL.exists() else None
SPEED = float(mm.group(1)) if mm else 1.2

# ── 대본 어절 (글자의 유일한 출처) ──────────────────────────────────────────
J = json.loads((DIR / 'cuts.json').read_text(encoding='utf-8'))
LANGUAGE = {'eng': 'en', 'kor': 'ko'}.get(J.get('voice', {}).get('language'), J.get('language', 'ko'))
S = [{'w': w, 'unit': c['id']} for c in J.get('cuts', []) if c.get('say') for w in c['say'].split()]
if not S:
    sys.exit('✗ say 가 있는 컷이 없다 — ② 구조 단계부터')

# 전사 캐시 — narration.wav 보다 새 것이면 다시 돌리지 않는다 (청킹만 손볼 때가 많다).
# output/ 밑이라 언제든 지워도 된다. --retranscribe 로 강제.
CACHE = OUT / 'whisper-words.json'
H = None
source_hash = hashlib.sha256(WAV.read_bytes()).hexdigest()
try: cached = json.loads(CACHE.read_text(encoding='utf-8'))
except (OSError, ValueError): cached = None
if isinstance(cached, dict) and cached.get('version') == 1 and cached.get('sourceHash') == source_hash and cached.get('language', 'ko') == LANGUAGE and cached.get('words') and '--retranscribe' not in sys.argv:
    H = cached['words']
    print(f'  전사 캐시 사용 — {len(H)}어절 (음성 SHA-256 일치)', file=sys.stderr)
else:
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        sys.exit('✗ faster_whisper 가 없다. numpy·faster_whisper 가 있는 python 으로 실행하라\n'
                 '  예: ~/.venvs/abm-whisper/bin/python pipeline/transcribe.py <프로젝트>')
    print(f'  전사 중 — {DIR.name} · SPEED {SPEED} · faster-whisper(small) · 대본 {len(S)}어절', file=sys.stderr)
    model = WhisperModel('small', device='cpu', compute_type='int8')
    segments, _ = model.transcribe(str(WAV), language=LANGUAGE, word_timestamps=True,
                                   vad_filter=False, beam_size=5)
    H = [{'t': w.word.strip(), 's': w.start, 'e': w.end}
         for seg in segments for w in (seg.words or []) if w.word.strip()]
    if H:
        CACHE.write_text(json.dumps({'version': 1, 'sourceHash': source_hash, 'model': 'small', 'language': LANGUAGE, 'words': H}, ensure_ascii=False), encoding='utf-8')
if not H:
    sys.exit('✗ 어절을 하나도 못 읽었다 — narration.wav 가 무음이거나 모델이 실패했다')

# ── 정렬 → 온셋 부여 ────────────────────────────────────────────────────
idx = align([x['w'] for x in S], H)
for k, x in enumerate(S):
    j = idx[k]
    x['s'] = H[j]['s'] if j is not None else None
    x['e'] = H[j]['e'] if j is not None else None
    x['est'] = j is None

anchors = [k for k, x in enumerate(S) if x['s'] is not None]
if len(anchors) < len(S) * 0.5:
    print(f'  ⚠️ 대본 {len(S)}어절 중 {len(anchors)}개만 붙었다 — narration.wav 가 이 대본의 음성이 맞나?', file=sys.stderr)
if not anchors:
    sys.exit('✗ 대본과 전사가 하나도 안 맞는다 — 음성과 대본을 확인하라')
END = H[-1]['e']
for k, x in enumerate(S):          # 못 붙은 어절은 앞뒤 앵커 사이 선형 보간
    if x['s'] is not None:
        continue
    lo = max([a for a in anchors if a < k], default=None)
    hi = min([a for a in anchors if a > k], default=None)
    a_t, a_i = (S[lo]['e'], lo) if lo is not None else (0.0, -1)
    b_t, b_i = (S[hi]['s'], hi) if hi is not None else (END, len(S))
    x['s'] = x['e'] = a_t + (b_t - a_t) * (k - a_i) / max(1, b_i - a_i)
S[0]['s'] = min(S[0]['s'], H[0]['s'])

# ── 청킹 — 경계를 DP 로 고른다 ────────────────────────────────────────────
# 4어절에서 기계적으로 끊으면 "백이십만 / 원까지" 처럼 수사와 단위가 갈라진다 (실측 사고).
# 유닛 경계와 문장 끝은 반드시 끊고, 수사-단위 사이는 절대 못 끊고, 나머지는 비용이 낮은 자리를 고른다.
_NUMEND = re.compile(r'[0-9영공일이삼사오육륙칠팔구십백천만억]$')
_UNITHEAD = ('원', '프로', '퍼센트', '개', '명', '일', '시', '분', '초', '년', '월',
             '배', '번', '차', '위', '장', '권', '건', '군데', '가지')


def hardbreak(a, b):
    return b is None or b['unit'] != a['unit'] or bool(re.search(r'[.!?…]$', a['w']))


_BIND = ('안', '못', '더', '좀', '잘', '막', '꽉', '덜', '갓')   # 뒷말에 붙는 부사


def nobreak(a, b):
    """수사 뒤 단위 명사, 부사 뒤 용언은 붙어 있어야 한다 — 갈라지면 뜻이 안 읽힌다"""
    ka = re.sub(r'[^0-9A-Za-z가-힣]', '', a['w'])
    kb = re.sub(r'[^0-9A-Za-z가-힣]', '', b['w'])
    if ka in _BIND:
        return True
    return bool(_NUMEND.search(ka)) and kb.startswith(_UNITHEAD)


def vis(ws):
    return len(re.sub(r'[^가-힣a-zA-Z0-9]', '', ' '.join(w['w'] for w in ws)))


def segment(seg):
    """한 문장(하드 경계 사이)을 2~4어절 청크로. dp[i] = 앞 i어절을 끊는 최소 비용"""
    n = len(seg)
    INF = float('inf')
    dp, bk = [0.0] + [INF] * n, [0] * (n + 1)
    for i in range(1, n + 1):
        for j in range(max(0, i - CHUNK_MAX), i):
            if dp[j] == INF or (j > 0 and nobreak(seg[j - 1], seg[j])):
                continue
            L = i - j
            c = dp[j] + abs(L - 3) + (1.6 if L == 1 else 0) + max(0, vis(seg[j:i]) - 22) * 0.5
            if i < n:                                   # 끊는 자리가 쉬는 자리일수록 싸다
                gap = seg[i]['s'] - seg[i - 1]['e']
                c -= min(gap, 0.6) * 2.5 + (0.8 if re.search(r'[,·]$', seg[i - 1]['w']) else 0)
            if c < dp[i]:
                dp[i], bk[i] = c, j
    if dp[n] == INF:                                    # 못 쪼개면 통째로 (수사-단위가 길게 붙은 경우)
        return [seg]
    out, i = [], n
    while i > 0:
        out.append(seg[bk[i]:i]); i = bk[i]
    return out[::-1]


chunks, seg = [], []
for k, x in enumerate(S):
    seg.append(x)
    if hardbreak(x, S[k + 1] if k + 1 < len(S) else None):
        chunks += segment(seg); seg = []
if seg:
    chunks += segment(seg)

lines = [{'m': round(ch[0]['s'] * SPEED, 3),          # 표시 초 → 원음 초
          'text': ' '.join(w['w'] for w in ch),
          'est': ch[0]['est'],                       # 청크의 m 은 첫 어절에서 나온다 — all() 로 재면 숨는다
          'est_any': any(w['est'] for w in ch)} for ch in chunks]

# ── 강조 이월 — 기존 파일의 <G>/<R> 를 같은 문구에 다시 얹는다 (새로 고르지 않는다) ──
marks, carried = [], 0
if TSX.exists():
    old = TSX.read_text(encoding='utf-8')
    marks = [(t, x) for t, x in re.findall(r'<([GR])>(.*?)</[GR]>', old, re.S) if x.strip()]
    marks.sort(key=lambda p: -len(p[1]))
seen = set()
for L in lines:
    for tag, phrase in marks:
        if phrase in L['text'] and phrase not in seen:
            L['text'] = L['text'].replace(phrase, f'<{tag}>{phrase}</{tag}>', 1)
            seen.add(phrase); carried += 1
            break
lost = [f'<{t}>{p}</{t}>' for t, p in marks if p not in seen]

body = 'export const SUBS: Sub[] = [\n'
for L in lines:
    body += f"  {{m: {L['m']}, node: <>{L['text']}</>}},{'  // ~ 온셋 보간' if L['est'] else ''}\n"
body += '];'

est_n = sum(1 for L in lines if L['est'])
est_any = sum(1 for L in lines if L['est_any'])
print(f"\n  ── motion/subtitles.tsx 의 SUBS ── ({len(lines)}청크 · 원음 초 · 글자는 cuts.json 의 say)\n")
print(body)
print(f'\n  시작 온셋 실측 {len(lines) - est_n}청크 · 시작 보간 {est_n}청크'
      + (f' · 내부에 보간 어절이 섞인 청크 {est_any}개' if est_any else '')
      + (' — 보간분은 눈으로 확인하라' if est_any else ''), file=sys.stderr)
if marks:
    print(f'  강조 이월 {carried}개'
          + (f' · 못 옮긴 것: {" ".join(lost)} ← 문구가 바뀌었다. 직접 넣어라' if lost else ''), file=sys.stderr)
else:
    print('  ⚠️ 강조(<G>·<R>)가 하나도 없다. **청크당 1개만** 사람이 고른다 (docs/11-motion.md)', file=sys.stderr)
over = [L['text'] for L in lines if len(re.sub(r'<[^>]+>|[^가-힣a-zA-Z0-9]', '', L['text'])) > 22]
if over:
    print(f'  긴 청크 {len(over)}개 — 예: "{over[0]}"', file=sys.stderr)

if APPLY:
    if not TSX.exists():
        sys.exit(f'✗ {TSX} 없음')
    src = TSX.read_text(encoding='utf-8')
    # ⚠️ new == src 로 판단하면 **결과가 기존과 같을 때** 거짓 실패한다 (2026-09-08). 치환 건수로 본다
    new, n_sub = re.subn(r'export const SUBS: Sub\[\] = \[[\s\S]*?\n\];', lambda _: body, src, count=1)
    if n_sub == 0:
        sys.exit('✗ subtitles.tsx 에서 SUBS 배열을 찾지 못했다 — 형식을 확인하라')
    if new == src:
        print('  ↺ 결과가 기존 SUBS 와 같다 — 파일은 그대로 둔다', file=sys.stderr)
    TSX.with_suffix('.tsx.bak').write_text(src, encoding='utf-8')
    TSX.write_text(new, encoding='utf-8')
    print(f'\n  ✔ {TSX.relative_to(ROOT)} 의 SUBS 를 갈아 끼웠다 (이전 판은 subtitles.tsx.bak)', file=sys.stderr)
    print('  다음: pipeline/render.sh · node pipeline/qc.mjs 로 자막 항목 확인', file=sys.stderr)
else:
    print('\n  --apply 를 주면 subtitles.tsx 의 SUBS 를 갈아 끼운다 (이전 판은 .tsx.bak)', file=sys.stderr)
