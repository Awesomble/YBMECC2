#!/usr/bin/env python3
# 유닛 구절 레벨링 v1 (2026-09-05) — Old radio 가 문두 구절을 0.5~1.5초에 걸쳐 3~8dB 낮게 까는
# 운율(원본 실측)을, 창 단위 RMS 를 유닛 중앙값으로 펴는 결정론 AGC 로 굽는다.
# dynaudnorm(80ms 창)은 이 스케일을 운율로 보고 보존해서 못 잡았다 — docs/02-pitfalls §12.
# 입력 projects/<p>/voice/<유닛>.m4a → 출력 projects/<p>/output/leveled/<유닛>.wav (48k s16 mono). 타이밍 불변.
# 유닛 = cuts.json 에서 say 가 있는 컷 (앵커 컷). 사용: python3 level-units.py <프로젝트경로>  (보통은 pipeline/narration.sh)
import subprocess, sys, pathlib, json, hashlib
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
def resolve(q):
    q = (q or '').rstrip('/')
    if q and (pathlib.Path(q) / 'cuts.json').exists(): return pathlib.Path(q).resolve()
    if q and (ROOT / 'projects' / q).is_dir(): return ROOT / 'projects' / q
    n = q.zfill(5).lstrip('0').zfill(5) if q.isdigit() else None
    names = sorted(p.name for p in (ROOT / 'projects').iterdir() if not p.name.startswith('.'))
    hit = next((x for x in names if n and x.startswith(n + '-')), None) or next((x for x in names if q and q in x), None)
    if not hit: sys.exit(f'✗ 프로젝트를 찾지 못했습니다: {q}')
    return ROOT / 'projects' / hit

DIR = resolve(sys.argv[1] if len(sys.argv) > 1 else '')
VOICE = DIR / 'voice'
OUT = DIR / 'output' / 'leveled'
OUT.mkdir(parents=True, exist_ok=True)
PROJECT = json.load(open(DIR / 'cuts.json', encoding='utf-8'))
UNITS = [c['id'] for c in PROJECT['cuts'] if c.get('say')]
ASSETS = PROJECT.get('voice', {}).get('assets', {})
def source(u):
    name = ASSETS.get(u, {}).get('file', f'{u}.m4a')
    if pathlib.Path(name).name != name: sys.exit('잘못된 voice 파일명')
    return VOICE / name
missing = [u for u in UNITS if not source(u).is_file()]
if missing: sys.exit(f'✗ voice 파일 없음: {", ".join(missing)}')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
STATE = OUT / 'state.json'
try: cache = json.loads(STATE.read_text())
except (OSError, ValueError): cache = {}

SR = 48000
WIN = int(0.20 * SR)   # RMS 창
HOP = int(0.05 * SR)
GATE_DB = -45          # 이 아래는 무음 — 게인 0dB
MAX_UP, MAX_DOWN = 12.0, 4.0  # dB
SMOOTH_SIGMA = 2       # 홉 단위 (100ms) 가우시안

def db(v): return 20 * np.log10(v + 1e-9)

for u in UNITS:
    fingerprint = sha(source(u))
    prior = cache.get(u, {})
    target_file = OUT / f'{u}.wav'
    if prior.get('version') == 2 and prior.get('sourceHash') == fingerprint and target_file.exists() and prior.get('fileHash') == sha(target_file):
        print(f'{u}: 레벨링 캐시 재사용')
        continue
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', str(source(u)),
                          '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                         capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    if not len(x) or not np.isfinite(x).all(): sys.exit(f'✗ {u}: 빈/손상 음성')
    n_hops = max(1, (len(x) - WIN) // HOP + 1)
    env = np.array([db(np.sqrt(np.mean(x[i * HOP:i * HOP + WIN] ** 2))) for i in range(n_hops)])
    speech = env > GATE_DB
    if not np.any(speech): sys.exit(f'✗ {u}: 발화를 찾지 못했다')
    target = np.median(env[speech])
    gain = np.where(speech, np.clip(target - env, -MAX_DOWN, MAX_UP), 0.0)
    # 가우시안 스무딩 — 펌핑 방지
    k = np.exp(-0.5 * (np.arange(-3 * SMOOTH_SIGMA, 3 * SMOOTH_SIGMA + 1) / SMOOTH_SIGMA) ** 2)
    k /= k.sum()
    gain = np.convolve(np.pad(gain, (len(k)//2, len(k)//2), mode='edge'), k, mode='valid')
    # 홉 → 샘플 보간 (창 중심 기준)
    centers = np.arange(n_hops) * HOP + WIN // 2
    g_samp = np.interp(np.arange(len(x)), centers, gain)
    y = x * 10 ** (g_samp / 20)
    peak = np.max(np.abs(y))
    if peak > 0.95:
        y *= 0.95 / peak  # 균일 스케일 — 레벨링 형태 보존
    pcm = np.clip(y * 32767, -32768, 32767).astype(np.int16).tobytes()
    p = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ac', '1', '-ar', str(SR),
                        '-i', '-', str(OUT / f'{u}.wav')], input=pcm, check=True)
    cache[u] = {'version': 2, 'sourceHash': fingerprint, 'fileHash': sha(target_file)}
    STATE.write_text(json.dumps(cache, indent=2)+'\n')
    # 검증 출력: 0.5초 창 램프 (0-0.5 대비 1.5-2.5)
    w = [db(np.sqrt(np.mean(y[int(k5 * 0.5 * SR):int((k5 + 1) * 0.5 * SR)] ** 2))) for k5 in range(5)]
    valid = [v for v in w[3:5] if v > -100]
    ramp = (np.mean(valid) - w[0]) if valid else 0.0
    print(f'{u}: target {target:.1f}dB peak보정 {"O" if peak > 0.95 else "-"} 램프 {ramp:+.1f}dB')
print(f'✔ {OUT}/  ({len(UNITS)}유닛)')
