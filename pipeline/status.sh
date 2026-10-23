#!/bin/bash
# 모든 영상의 진행 단계 — 파일 존재로 판정한다 (별도 상태 파일 없음)
# 사용: pipeline/status.sh [<p>] [--resume]
#   <p>       지정 프로젝트만 조회 (생략하면 전체)
#   --resume  README 현재 상태·실행 흔적만 읽음. 유료 음성/검사/렌더를 실행하지 않음. <p> 필수.
#   모션 경로 (projects/<p>/motion/ 있음):  ① 분석 → ② 구조 → ③ 목소리 → ④ 디자인 → ⑤ 감독 → ⑥ 문안  (/video 스킬 번호와 같다)
#   AI 실사 경로 (레거시):                 ① → ② 프롬프트 → ③ 배경 → ④ 오버레이 → ⑤ 영상 → ⑥ 목소리 → ⑦ 조립 대기
set -uo pipefail
source "$(dirname "$0")/lib/resolve.sh"
QUERY=""; RESUME=0
usage() { echo "사용: pipeline/status.sh [<p>] [--resume]  (--resume은 프로젝트 필수)"; }
for arg in "$@"; do
  case "$arg" in
    --resume) RESUME=1 ;;
    --help|-h) usage; exit 0 ;;
    -*) usage >&2; exit 2 ;;
    *)
      [ -z "$QUERY" ] || { usage >&2; exit 2; }
      QUERY="$arg" ;;
  esac
done
if [ "$RESUME" -eq 1 ] && [ -z "$QUERY" ]; then usage >&2; exit 2; fi
if [ -n "$QUERY" ]; then
  TARGET=$(resolve_project "$QUERY") || exit 1
  PROJECT_DIRS=("$TARGET")
else
  PROJECT_DIRS=("$ABM_ROOT"/projects/*/)
fi
if [ "$RESUME" -eq 0 ]; then
printf "  %-20s %-6s %-14s %s\n" "프로젝트" "경로" "단계" "비고"
printf "  %-20s %-6s %-14s %s\n" "──────────────────" "────" "──────────" "────────────────"
fi
rc=0
for d in "${PROJECT_DIRS[@]}"; do
  [ -d "$d" ] || continue
  python3 - "${d%/}" "$ABM_ROOT" "$RESUME" <<'PY'
import os, sys, json, glob, subprocess, re
d, root = sys.argv[1], sys.argv[2]
n = os.path.basename(d); out = f'{d}/output'
if sys.argv[3] == '1':
    print(f'  {n} — 이어하기 (읽기 전용 · 게이트/지문 검증 아님)')
    readme = f'{d}/README.md'
    try:
        with open(readme, encoding='utf-8') as f: text = f.read()
        state = re.search(r'^## 현재 작업 상태[^\n]*\n(.*?)(?=^#{1,2}\s|\Z)', text, re.M | re.S)
        if state and state[1].strip(): print('\n' + state[1].strip())
        else: print(f'\n  현재 작업 상태 기록 없음 — 인계 요약과 {readme}의 진행·승인 절을 확인한다.')
    except (OSError, UnicodeError) as e:
        print(f'\n  README 상태 미검증: {e}')
    renders = [p for p in glob.glob(f'{out}/render*.mp4') if os.path.isfile(p)]
    latest = max(renders, key=os.path.getmtime) if renders else None
    print('\n  최신 렌더 파일: ' + (latest or '없음') + ' (존재만 확인)')
    locked = os.path.isdir(f'{out}/.render-lock')
    print('  렌더 잠금: ' + ('있음 — 로그/프로세스를 확인하고 중복 렌더하지 않는다' if locked else '없음 — 다른 실행의 종료를 뜻하지 않음'))
    ledger = f'{out}/review/fix-batch.json'
    if os.path.exists(ledger):
        try:
            with open(ledger, encoding='utf-8') as f: record = json.load(f)
            rounds = record['rounds']
            if not isinstance(rounds, list) or any(not isinstance(r, dict) for r in rounds): raise ValueError('rounds 형식 오류')
            active = [str(r.get('n', '?')) for r in rounds if r.get('state') == 'open']
            print('  열린 수정 묶음: ' + (', '.join(active) if active else '없음'))
        except (OSError, UnicodeError, ValueError, KeyError, TypeError) as e:
            print(f'  수정 묶음 미검증: {e}')
    else: print('  수정 묶음 기록: 없음')
    sys.exit(0)
try: J = json.load(open(f'{d}/cuts.json', encoding='utf-8')) if os.path.exists(f'{d}/cuts.json') else {}
except (OSError, ValueError):
    print(f'{n}: 미검증 — cuts.json을 읽을 수 없다'); sys.exit(0)
cuts = J.get('cuts', []); N = len(cuts)
said = [c for c in cuts if c.get('say')]
voice_assets = J.get('voice', {}).get('assets', {})
nv = sum(1 for c in said if os.path.exists(f'{d}/voice/{voice_assets.get(c["id"], {}).get("file", c["id"]+".m4a")}'))
motion = os.path.isdir(f'{d}/motion') or os.path.isdir(f'{d}/hyperframes')
path = '모션' if motion else '실사'
if not N or not cuts[0].get('say'):
    label, note = '② 구조', 'cuts.json 작성 (① 분석 팩트 확정 후)'
elif motion:
    # 산출물은 Remotion(render.mp4) 또는 HyperFrames(render-hf-vN.mp4) 다 (2026-09-08 HyperFrames 기본 전환).
    # 둘 다 있으면 최신 것을 본다 — 경로를 갈아탄 프로젝트가 옛 렌더로 판정되면 안 된다.
    cands = [f'{out}/render.mp4'] + sorted(glob.glob(f'{out}/render-hf-*.mp4'))
    cands = [c for c in cands if os.path.exists(c)]
    render = max(cands, key=os.path.getmtime) if cands else f'{out}/render.mp4'
    narr = f'{out}/narration.wav'
    if said and nv == len(said):
        audit = subprocess.run(['node', os.path.join(root,'pipeline/tts.mjs'),d,'--status'],capture_output=True,text=True)
        if audit.returncode:
            print(f'{n}: ③ 목소리 — 대본·보이스 지문 미검증/변경 (tts.mjs --status)'); sys.exit(0)
    if nv < len(said):        label, note = '③ 목소리', f'voice {nv}/{len(said)} — node pipeline/tts.mjs {n}'
    elif not os.path.exists(narr): label, note = '③ 목소리', f'나레이션 — pipeline/narration.sh {n}'
    elif not os.path.exists(render):
        label, note = ('④ 디자인', f'hyperframes/ 프레임 작성 → pipeline/hf-render.sh {n}'
                       if os.path.isdir(f'{d}/hyperframes') else f'motion/ 씬 작성 → pipeline/render.sh {n}')
    else:
        rt = os.path.getmtime(render)
        # 렌더가 실제로 읽는 것만 본다 — cuts.json 은 렌더 입력이 아니라 설계도다 (motion/ 이 입력).
        # 설계도와 타임라인이 어긋난 건 node pipeline/qc.mjs 가 잡는다 (2026-09-07)
        # 🔴 HyperFrames 경로에서는 motion/ 이 렌더 입력이 아니다 (2026-09-10).
        #    자막은 hyperframes/index.html 에 구워져 있고 motion/subtitles.tsx 는
        #    export.mjs 가 읽는 **사본**이다 — 그걸 갱신할 때마다 「렌더가 옛 판」으로 오판했다.
        hf = os.path.isdir(f'{d}/hyperframes')
        # 🔴 2026-09-10: mtime 비교는 렌더 도중 수정을 원리적으로 못 잡고, **주석 한 줄만 고쳐도
        #    「옛 판」이라 한다** (docs/02-pitfalls.md §38). 지문 봉인이 있으면 그걸 쓴다.
        man = f'{render}.srcman.json'
        stale = []
        if hf and os.path.exists(man):
            try:
                sealed = json.load(open(man)).get('files', {})
                now = json.loads(subprocess.run(
                    ['node', os.path.join(root, 'pipeline/lib/src-hash.mjs'), f'{d}/hyperframes'],
                    capture_output=True, text=True, check=True).stdout)
                stale = sorted({k for k in set(sealed) | set(now) if sealed.get(k) != now.get(k)})
            except Exception:
                print(f'{n}: 미검증 — 소스 봉인을 읽거나 대조하지 못했다'); sys.exit(0)
        else:
            src = [p for p in (([] if hf else glob.glob(f'{d}/motion/**/*', recursive=True))
                   + glob.glob(f'{d}/hyperframes/compositions/**/*', recursive=True)
                   + glob.glob(f'{d}/hyperframes/*.html')
                   + [narr]) if os.path.isfile(p)]
            stale = [p for p in src if os.path.getmtime(p) > rt]
        if stale:
            cmd = f'pipeline/hf-render.sh {n}' if hf else f'pipeline/render.sh {n}'
            label, note = '④ 디자인', f'⚠️ 렌더보다 새로운 소스 {len(stale)}개 — {cmd}'
        elif not os.path.exists(f'{d}/publish.md'):
            gate = 'render-gate' if hf else 'qc'
            label, note = '⑤ 감독', f'{os.path.basename(render)} 준비 → {gate} 판정 후 /review {n}'
        else:
            # 문안이 렌더보다 오래됐으면 대본이 바뀐 뒤 문안을 안 고친 것이다
            stale_pub = False  # 시각 변경만으로 문안 재작성을 요구하지 않는다. 팩트·대본 변경을 대조한다.
            label = '⑥ 문안'
            note = (f'⚠️ publish.md 가 렌더보다 오래됐다 — /review {n} 다시' if stale_pub
                    else '문안 파일 있음 · 납품/문안 게이트 통과는 별도 확인 → 업로드는 사용자')
else:
    def cnt(sub, ext): return sum(1 for c in cuts if os.path.exists(f'{d}/{sub}/{c["id"]}{ext}'))
    need = [c for c in cuts if c.get('overlay')]
    nb = cnt('assets/images', '.png')
    nf = sum(1 for c in need if os.path.exists(f'{d}/assets/images/{c["id"]}.final.png'))
    nc = cnt('assets/clips', '.mp4')
    if nb == 0:          label, note = '② 프롬프트', f'output/{n}/PROMPTS.md → 배경 0/{N}'
    elif nb < N:         label, note = '③ 배경', f'{nb}/{N} 생성됨'
    elif nf < len(need): label, note = '④ 오버레이', f'{nf}/{len(need)} — 텍스트 얹기'
    elif nc < N:         label, note = '⑤ 영상', f'클립 {nc}/{N} (없는 컷은 이미지로)'
    elif nv < len(said): label, note = '⑥ 목소리', f'node pipeline/tts.mjs {n}'
    else:                label, note = '⑦ 조립 대기', f'output/{n}/ 자막·타임라인 준비됨'
print(f"  {n:<20} {path:<6} {label:<14} {note}")
PY
  result=$?
  [ "$result" -eq 0 ] || rc="$result"
done
exit "$rc"
