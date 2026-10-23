#!/usr/bin/env node
// motion-vocab.mjs — 모션의 **크기와 어휘**를 잰다 (2026-09-10 신설)
//
//   node pipeline/motion-vocab.mjs <프로젝트> [<비교 프로젝트> ...]
//
// 왜 (docs/02-pitfalls.md §46 · 사용자 지적):
//   §28 뒤에 「화면당 트윈 20~25개」라는 **개수 하한**을 넣었다. 00006 은 그걸 24.3 으로 채우고
//   게이트를 통과했는데 **사용자 눈에는 이전 편들보다 더 단순했다.**
//   재 보니 트윈은 531개인데 **최대 이동거리가 100px** 이었다 — 화면 폭의 9%.
//   납품된 세 편은 924~1088px, 즉 **화면을 가로지르는 제스처**가 있었다.
//
//   ⇒ 개수는 「정지 화면인가」만 가른다.
//
// 🔴 2026-09-10 사용자 재교정 — **처방을 뒤집었다.**
//   *"임팩트있는 모션그래픽은 지양하지만 제자리에서 살짝살짝 작아졌다커졌다 반복되는건 안했으면 좋겠어"*
//   첫 판은 「이동 ≥216px 하한」을 요구했다. **그건 임팩트 지향이라 사용자 방향과 정반대다.**
//   진짜 문제는 크기가 아니라 **제자리 펄스의 빈도**였다:
//
//       제자리 확대·축소   00003 버거킹 1.42회/초 · 00002 온누리 1.49 · 00004 섬여행 1.92
//                        00006 아이폰 **2.30회/초**   ← 60% 잦다
//       그리고 그것 말고 볼 게 없다 — 최대 이동 81px (납품본 924~1088px)
//
//   ⇒ 재는 것은 둘이다: **제자리 펄스 빈도(상한)** 와 **이동의 존재(하한)**.
//     큰 이동을 요구하지 않는다. **방향과 뜻이 있는 이동**이면 중간 크기로 충분하다.
//
// 🔴 이 수치를 목표로 채우지 마라 (`metric-not-a-target`). 판단은 눈이 한다.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const walk = (d) => fs.existsSync(d)
  ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(d, e.name)) : /\.html$/i.test(e.name) ? [path.join(d, e.name)] : [])
  : [];
const strip = (t) => t.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const W = 1080;                       // 화면 폭 — 「크다」의 기준
const BIG_PX = Math.round(W * 0.20);  // 216px — 「대형」의 경계. **요구가 아니라 참고**다 (임팩트는 4회 상한)
// 제자리 확대·축소 **초당 상한**. 🔴 선은 **승인된 판 전부의 위**에 긋는다 —
// 1.9 로 잡았더니 납품·승인된 00004(1.92)가 걸렸다. 승인본을 떨어뜨리는 선은 틀린 선이다.
//   00003 1.42 · 00002 1.49 · 00004 1.92 (전부 통과)   vs   00006 2.30 (사용자 지적)
const PULSE_MAX = 2.0;
/* ── 🔴 횡단 밀도 기준 — 11편 전수 실측에서 유도했다 (2026-09-13). 감으로 정하지 않았다.
   사용자 지시: *"초기영상들처럼 모션그래픽 제작할때 크리에이티브와 인터렉션 보장해"*

     승인 납품본   00003 2.00 · 00002 1.55 · 00009 1.12 · 00004 0.92 · 00008 0.72
     최근 판       00011 0.45 · 00012 0.15 · 00013 0.10
     🔴 반려본     00006 0.00 · 00010 0.00   ← 둘 다 사용자가 「너무 단순하다」고 지적한 판

   TRAVERSE_MIN(하드) 은 **죽은 화면을 잡는 선**이지 목표가 아니다. 목표대는 초기 납품본 범위다.
   ⚠️ 이 수치를 **의미 없는 큰 슬라이드**로 채우면 P6(전면 크로스페이드 금지)과 같은 실패가 된다.
      이동은 「이 문장이 무슨 일을 하는가」의 물리여야 한다 (docs/11-motion.md 「모션은 내용의 논증이다」). */
const TEXT_MAX = 0.70;                // 표시용 — 게이트는 2026-09-16 에 삭제됐다
const TRAVERSE_MIN = 0.50;            // 하드 — 이 아래는 인터랙션이 죽은 것
const TRAVERSE_OK  = 0.90;            // 초기 승인본 최저(00004 0.92) — 여기까지 와야 「초기처럼」이다
const BIG_DEG = 15;                   // 이 아래는 기울임이지 회전이 아니다
const BIG_SCALE = 1.5;                // **끝값** ×1.5 이상. 🔴 |scale−1| 로 재면 `scale:0`(무에서
                                      //   튀어나오는 진입)이 「2.0배 확대」로 잡힌다 — 00006 의
                                      //   「큰 제스처 10/22」가 전부 **막대가 0에서 자라는 것**이었다.
                                      //   진입은 진입이지 스펙터클이 아니다 (2026-09-10 자기발견).

export function profile(dir) {
  const files = walk(path.join(dir, 'hyperframes', 'compositions'));
  const screens = files.filter((f) => !/caption/i.test(path.basename(f)));
  const per = [];
  // 🔴 CSS 를 긁으면 안 된다. `left:72px` 같은 **정적 레이아웃 값**이 이동거리로 잡혀
  //    00006 의 최대 이동이 100px 에서 1080px 로 부풀었다 (2026-09-10 자기발견).
  //    그래서 `.to(...)/.from(...)/.fromTo(...)` 의 **인자 안에서만** 읽는다.
  //
  // 🔴 `set` 을 빼면 컴파일러 산출물의 이동이 통째로 사라진다 (2026-09-12 · 00011 · pitfalls §79).
  //    손으로 쓴 프레임은 `to({x:960})` 처럼 트윈에 거리를 직접 쓰지만,
  //    `hf-compile` 은 **`set(시작점) → to(0)`** 구조를 굽는다:
  //        gsap.set("#f02-value",{y:-166,opacity:0});  tl.to("#f02-value",{y:0,...})
  //    `to` 의 목표값만 읽으면 이동이 **0** 으로 잡힌다. 실제로 00011 은 진입 14~250px 이 있었는데
  //    「이동 최대 10px」로 보고돼 컴파일러가 아니라 코덱스를 의심할 뻔했다.
  //    ⇒ `set` 안의 x/y 도 **진입 시작점**으로 센다. 정적 배치는 CSS 가 하므로
  //      `gsap.set` 에 x/y 가 있으면 그건 애니메이션 초기 상태다.
  const TWEEN = /\.(?:to|from|fromTo|set)\s*\(/g;
  const argsOf = (s, from) => {          // 여는 괄호부터 짝이 맞는 닫는 괄호까지
    let depth = 0;
    for (let i = from; i < s.length; i++) {
      if (s[i] === '(') depth++;
      else if (s[i] === ')') { if (--depth === 0) return s.slice(from + 1, i); }
    }
    return '';
  };
  const coreProps = new Set(), otherProps = new Set();
  /* 🔴 **트윈의 대상이 글자인가** (2026-09-15 · 00016 「최악」 실측).
     어휘·횡단·이동 비율을 전부 통과한 00016 을 가른 유일한 소스 지표다 —
       승인본  00009 35% · 00004 44% · 00003 45% · 00002 58%
       반려본  00016 76% · 00010 86% · 00012 87% · 00013 92%    ← 컴파일러 덱. 글자를 흔들어 어휘를 채웠다
     글자 = id 가 붙은 요소의 안이 텍스트뿐. 그림 = svg·img·path 를 품음. 도형 = 둘 다 아님(막대·선·판). */
  let textTweens = 0, targetTweens = 0;
  const kindOf = (h) => {
    const k = {};
    for (const m of h.matchAll(/<([a-z]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
      const rest = h.slice(m.index + m[0].length, m.index + m[0].length + 4000), e = rest.indexOf(`</${m[1]}>`), inner = e >= 0 ? rest.slice(0, e) : '';
      k[m[2]] = /^(svg|img|path|rect|circle|line|polygon)$/.test(m[1]) || /<svg\b|<img\b|<path\b/.test(inner) ? 'g'
              : inner.replace(/<[^>]+>/g, '').trim() ? 't' : 's';
    }
    return k;
  };
  for (const f of screens) {
    const s = strip(fs.readFileSync(f, 'utf8'));
    let body = '';
    const kinds = kindOf(s);
    for (const m of s.matchAll(/\.(?:to|from|fromTo)\s*\(/g)) {
      const sel = (argsOf(s, m.index + m[0].length - 1).match(/["']([^"']+)["']/) || [])[1] || '';
      for (const one of sel.split(',')) {
        const id = one.trim().split(/\s+/).pop().replace(/^#/, '');
        if (!(id in kinds)) continue;
        targetTweens++; if (kinds[id] === 't') textTweens++;
      }
    }
    for (const m of s.matchAll(TWEEN)) body += argsOf(s, m.index + m[0].length - 1) + '\n';
    // 트윈 인자 안이라도 첫 인자(선택자)는 문자열이라 숫자가 없다 — 그대로 둬도 안전하다
    const px  = [...body.matchAll(/[{,\s](?:x|y)\s*:\s*(-?[\d.]+)/g)].map((m) => Math.abs(+m[1]));
    // 🔴 xPercent/yPercent 는 **요소 자기 크기**의 퍼센트다. 화면 폭이 아니다.
    //    ×1080 으로 환산했더니 00006 의 `yPercent:100`(마스크 안에서 글자가 제 높이만큼 솟는 것,
    //    실제 ≈64px)이 **1080px 대형 제스처**로 잡혔다 — 정반대 결론이 나올 뻔했다 (2026-09-10 자기발견).
    //    자기 크기를 정적으로 알 수 없으므로 **px 와 섞지 않고 따로 센다.**
    const pct = [...body.matchAll(/[{,\s](?:xPercent|yPercent)\s*:\s*(-?[\d.]+)/g)].map((m) => Math.abs(+m[1]));
    const deg = [...body.matchAll(/[{,\s]rotat(?:e|ion)(?:X|Y|Z)?\s*:\s*(-?[\d.]+)/g)].map((m) => Math.abs(+m[1]));
    const sc  = [...body.matchAll(/[{,\s]scale(?:X|Y)?\s*:\s*([\d.]+)/g)].map((m) => +m[1]);
    /* 🔴 **속성 어휘** — 무엇을 움직이는가 (2026-09-14 신설).
       사용자 질문: *"자유도를 줬는데도 왜 매번 비슷하게 나오나"*. 실측 답:
       전 프로젝트 애니메이션 6,115건 중 **y·opacity·scale·x 가 86%**다.
       꼬리는 clipPath 1.6% · rotation 1.1% · strokeDashoffset 0.8% · skewX 0.03% ·
       패스 모핑·3D 원근 **0건**. 경로별로 갈린다 —
         손으로 쓴 판(raw GSAP)  핵심4 71~86% · 그 외 **6~13종**
         컴파일러 판             핵심4 88~97% · 그 외 **1~3종**   ← 13개 동사가 천장이었다
       **거리(진폭)를 풀어도 안 변하는 이유가 이것이다 — 기저가 그대로면 스칼라만 커진다.**
       ⚠️ 하드 게이트로 쓰지 마라. 반려본 00006 도 6종이라 **품질을 가르지 못한다.**
          이건 「어휘가 좁아졌나」를 보는 진단이지 목표가 아니다 (metric-not-a-target). */
    const CORE = new Set(['x', 'y', 'scale', 'opacity', 'autoAlpha']);
    for (const m of body.matchAll(/[{,\s]([a-zA-Z][\w]*)\s*:/g)) {
      const k = m[1];
      if (['duration', 'ease', 'delay', 'stagger', 'repeat', 'yoyo', 'onUpdate', 'onComplete',
           'paused', 'overwrite', 'immediateRender', 'transformOrigin'].includes(k)) continue;
      (CORE.has(k) ? coreProps : otherProps).add(k);
    }
    const move = px.filter((v) => v > 0);            // 절대 px 만. Percent 는 아래에 따로.
    const pctMove = pct.filter((v) => v > 0);
    per.push({
      name: path.basename(f).replace(/\.html$/, ''),
      tweens: (s.match(/\.(to|from|fromTo|set)\s*\(/g) ?? []).length,
      maxMove: move.length ? Math.max(...move) : 0,
      maxDeg: deg.length ? Math.max(...deg) : 0,
      maxScale: sc.length ? Math.max(...sc) : 0,
      popIn: sc.filter((v) => v === 0).length,
      big: move.filter((v) => v >= BIG_PX).length + deg.filter((v) => v >= BIG_DEG).length
         + sc.filter((v) => v >= BIG_SCALE).length,
      move, deg, sc, pctMove,
    });
  }
  // 제자리 확대·축소 — 이동 성분 없이 scale 만 바뀌는 트윈
  let pulses = 0;
  const argsOf2 = (s, from) => { let d = 0; for (let i = from; i < s.length; i++) { if (s[i] === '(') d++; else if (s[i] === ')') { if (--d === 0) return s.slice(from + 1, i); } } return ''; };
  // 🔴 「한 트윈 안에 scale 2개」만 세면 컴파일러 산출물의 펄스가 전부 새어 나간다
  //    (2026-09-12 · 00011 · pitfalls §79). `hf-compile` 은 왕복을 **트윈 두 개**로 굽는다:
  //        tl.to("#f01-head",{scale:1.035})   ← 커지고
  //        tl.to("#f01-head",{scale:1})       ← 돌아온다
  //    각각 scale 1개씩이라 옛 판정은 0 으로 봤다. 00011 훅 프레임은 이 왕복 **3쌍이 전부**였는데
  //    도구는 펄스 「?」를 찍었다. ⇒ 같은 선택자의 scale-only 트윈을 **쌍으로 묶어** 센다.
  for (const f of screens) {
    const t = strip(fs.readFileSync(f, 'utf8'));
    const scaleOnly = {};                                          // 선택자 → scale-only 트윈 수
    for (const m of t.matchAll(/\.(?:to|from|fromTo)\s*\(/g)) {
      const b = argsOf2(t, m.index + m[0].length - 1);
      if (/[{,\s]x\s*:|[{,\s]y\s*:|Percent/.test(b)) continue;      // 이동이 섞이면 제자리가 아니다
      const sc2 = b.match(/[{,\s]scale(?:X|Y)?\s*:\s*([\d.]+)/g);
      if (!sc2) continue;
      if (sc2.length >= 2) { pulses++; continue; }                 // 한 트윈 안에서 왕복
      const sel = (b.match(/^[^,]*/) ?? [''])[0].trim();           // 첫 인자 = 선택자
      scaleOnly[sel] = (scaleOnly[sel] ?? 0) + 1;
    }
    for (const k in scaleOnly) pulses += Math.floor(scaleOnly[k] / 2);
  }
  const all = per.flatMap((p) => p.move);
  const pctAll = per.flatMap((p) => p.pctMove);
  const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : 0);
  // 영상 길이 — 빈도의 분모. 없으면 화면 수로 근사한다
  let dur = 0;
  try {
    const out = path.join(dir, 'output');
    const v = fs.readdirSync(out).filter((f) => /^render.*\.mp4$/.test(f))
      .map((f) => path.join(out, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    if (v) dur = +execFileSync('ffprobe', ['-v','error','-show_entries','format=duration','-of','csv=p=0', v]).toString().trim();
  } catch {}
  return {
    name: path.basename(dir), screens: per.length, pulses, dur,
    pulseRate: dur > 0 ? pulses / dur : 0,
    tweens: per.reduce((a, p) => a + p.tweens, 0),
    medMove: med(all), maxMove: all.length ? Math.max(...all) : 0,
    bigScreens: per.filter((p) => p.big > 0).length,
    /* 🔴 **횡단 밀도** — 화면당 ≥216px 이동 횟수 (2026-09-13 신설).
       왜 이 지표인가 (11편 전수 실측):
         · **묶음과 무관하다.** 카드를 한 덩어리로 900px 옮겨도 900px 다 —
           「컴파일러가 묶어서 트윈 수가 적게 나온다」는 설명이 여기엔 안 통한다
         · **진동으로 못 채운다.** ±3px 흔들기로는 216px 에 영원히 도달하지 못한다.
           00010 에서 트윈 개수 하한을 미세 부유로 메운 그 수법이 여기선 안 먹는다
         · **승인본과 반려본을 실제로 가른다** (아래 BAND 주석) */
    travers: per.reduce((a, p) => a + p.move.filter((v) => v >= BIG_PX).length, 0),
    props: [...otherProps].sort(),          // 핵심4 밖의 애니메이션 속성 종류
    textShare: targetTweens ? textTweens / targetTweens : 0,   // 🔴 글자 대상 트윈 비율 — ≥0.70 이면 슬라이드 덱
    pct60: all.length ? all.filter((v) => v >= 60).length / all.length : 0,
    pctMoves: pctAll.filter((v) => v >= 100).length,
    zooms: per.reduce((a, p) => a + p.sc.filter((v) => v >= BIG_SCALE).length, 0),
    popIns: per.reduce((a, p) => a + p.popIn, 0),
    rots: per.reduce((a, p) => a + p.deg.filter((v) => v >= BIG_DEG).length, 0),
    per,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { resolveProject } = await import('./lib/project.mjs');
  const args = process.argv.slice(2);
  if (!args.length) { console.error('사용: node pipeline/motion-vocab.mjs <프로젝트> [비교...]'); process.exit(2); }
  const rows = args.map((a) => profile(resolveProject(a, { usage: '' }).dir));
  console.log();
  console.log('  프로젝트           화면  트윈/화면  이동중앙  이동최대  🔴글자트윈  🔴횡단/화면  🔴제자리펄스/초  어휘');
  for (const r of rows)
    console.log(`  ${r.name.padEnd(18)} ${String(r.screens).padStart(3)} ${(r.tweens / r.screens).toFixed(1).padStart(9)}` +
      `${(r.medMove.toFixed(0) + 'px').padStart(9)}${(r.maxMove.toFixed(0) + 'px').padStart(10)}` +
      `${(100 * r.textShare).toFixed(0).padStart(8)}%  ` +
      `${(r.travers / r.screens).toFixed(2).padStart(11)}${(r.travers / r.screens) < TRAVERSE_MIN ? ' 🔴' : ((r.travers / r.screens) < TRAVERSE_OK ? ' ⚠️' : ' ✅')}` +
      `${(r.pulseRate ? r.pulseRate.toFixed(2) : '?').padStart(12)}  ` +
      `${String(r.props.length + '종').padStart(5)}`);
  const t = rows[0];
  console.log();
  console.log('     「살짝 커졌다 작아졌다」가 잦으면 장식이 되고, 그것 말고 볼 게 없으면 화면이 납작해진다.');
  console.log(`  🔴 횡단/화면 — 화면당 ≥${BIG_PX}px 이동 횟수. 하드 ${TRAVERSE_MIN} · 「초기영상처럼」은 ${TRAVERSE_OK}+`);
  console.log('     승인본 00003 2.00 · 00002 1.55 · 00009 1.12 · 00004 0.92   반려본 00006 0.00 · 00010 0.00');
  console.log('     ⚠️ 묶음과 무관하고 **진동으로 못 채운다** — ±3px 흔들기로는 이 선에 도달하지 못한다.');
  console.log('     ⚠️ 대신 **의미 없는 큰 슬라이드**로 채우지 마라. 이동은 그 문장이 하는 일의 물리여야 한다.');
  console.log(`  ℹ️ 글자트윈 — 트윈 대상 중 글자인 비율. **상한 없음** (2026-09-16 삭제). 참고: 승인본 35~58%`);
  console.log('     00016 은 어휘 7종·횡단 1.00 을 **글자를 scaleX·filter·rotation 으로 흔들어** 채웠다. 글자는 등장·강조만 하고,');
  console.log('     움직이는 것은 **그림·도형·값**이어야 한다 (막대가 자라고 · 카드가 기울고 · 선이 그려진다).');
  console.log(`  어휘 — 핵심4(x·y·scale·opacity) 밖에서 움직이는 속성 종류. 손으로 쓴 판 6~13종 · 컴파일러 판 1~3종`);
  console.log(`     ${t.name}: ${t.props.length ? t.props.join(' · ') : '(없음 — 핵심4만 움직인다)'}`);
  console.log('     🔴 거리를 풀어도 안 변하면 여기를 봐라. **기저가 그대로면 스칼라만 커진다.**');
  console.log('        컴파일러 경로는 `raw` 동사로 임의 속성을 쓸 수 있다 (docs/11-motion.md).');
  console.log('  🔴 목표로 채우지 마라. 판단은 눈이 한다 (metric-not-a-target).');
}
