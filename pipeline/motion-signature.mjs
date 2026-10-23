#!/usr/bin/env node
// 모션 설계 자료 + 사후 감사.
//
//   node pipeline/motion-signature.mjs menu  [<p>]   ④ 전: 내용→모션 카탈로그 + 최근 이력 + 잠긴 것
//   node pipeline/motion-signature.mjs audit  <p>    ⑤:   실수로 이전 편을 복제했는지만 잰다
//   node pipeline/motion-signature.mjs history       지금까지 쓴 어휘
//
// ⚠️ 이 도구는 **고르지 않는다.** 무엇을 쓸지는 ④ 디자이너가 내용을 보고 정한다.
//    2026-09-08 사용자 지시: "컨셉은 유지하되 영상마다 크리에이티브와 해당 브랜드와 내용을
//    가장 잘 설명할수 있는 인터렉션을 추구하도록 자율성 보장해".
//    첫 판은 '최근에 안 쓴 룰을 돌려 뽑는' 제비뽑기였다 — 폐기했다. 신선함은 목표가 아니라
//    부산물이다. 목표는 그 문장을 가장 잘 설명하는 물리를 찾는 것이다.
//
// 왜 감사가 필요한가 (2026-09-08 실측):
//   00002 와 00003 의 frame.md 가 diff 0줄로 동일했고, 이징 power* 점유가 92.2% / 69.7% 였고,
//   룰 48개 중 스토리보드에 인용된 건 waterfall-entry 하나뿐이었다.
//   frame-packets-core.mjs:76 이 스토리보드의 `- rules:` 를 읽어 레시피 전문을 워커 패킷에
//   넣어 주는데 그 필드가 비어 있으면 독립 워커 10명이 전부 power2.out 으로 수렴한다.
//   감사는 그 '사고로 인한 복제'만 잡는다. 의도적 재사용은 이유만 대면 통과다.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, basename } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const PROJECTS = join(ROOT, "projects");
const die = m => { console.error(`✗ ${m}`); process.exit(1); };

function animationDir() {
  const c = [join(ROOT, ".claude/skills/hyperframes-animation"),
             join(ROOT, ".agents/skills/hyperframes-animation"),
             join(process.env.HOME || "", ".claude/skills/hyperframes-animation")];
  for (const x of c) if (existsSync(join(x, "rules"))) return x;
  die(`hyperframes-animation 스킬을 못 찾았다:\n  ${c.join("\n  ")}`);
}

// ── 내용 → 모션. 이 표가 이 도구의 본체다 ────────────────────────────────────
// 축은 "무슨 룰이 있나"가 아니라 **"이 컷의 문장이 무슨 일을 하는가"** 다.
// 한 룰이 여러 칸에 나오는 건 정상이다 — 쓰임이 여럿이라는 뜻이다.
const JOBS = [
  ["비교 — A와 B를 나란히 놓는다", [
    ["split-tilt-cards",       "두 카드가 서로 반대로 기울어 마주본다"],
    ["scale-swap-transition",  "한쪽이 줄며 사라지고 다른 쪽이 튀어나온다"],
    ["reactive-displacement",  "들어오는 것이 있던 것을 물리적으로 밀어낸다"],
    ["theme-crossfade-morph",  "앵커 하나를 고정한 채 나머지 전부가 다른 판으로 갈린다"],
  ]],
  ["증감·수치 — 숫자가 커지거나 채워진다", [
    // 카운트업·슬롯 롤러(counting-dynamic-scale·vertical-spring-ticker)는 뺐다 — 말에 없는 중간값을 보여
    // 00043·00072에서 반려됐고, counting 레시피는 seek에서 「0」에 얼어붙는 onUpdate를 쓴다.
    // 숫자는 말한 값에 꽂히고 바뀐 자리만 교체한다 — resources/motion M4 · 4-designer 「모든 컷의 안무」.
    ["stat-bars-and-fills",    "막대가 자라고 링이 차고 별이 부분만 칠해진다"],
    ["chart-scrub-readout",    "이미 그려진 차트 위를 재생헤드가 훑으며 값을 읽는다"],
  ]],
  ["분해·구성 — 덩어리를 쪼개거나 조립한다", [
    ["depth-scatter-assemble", "3D 로 흩어졌다가 평면 배치로 모인다"],
    ["center-outward-expansion","중앙에 뭉쳐 있다가 제자리로 퍼진다"],
    ["anchored-layout-expand", "한 변을 붙박은 채 한 축으로만 늘어나고 뒤가 밀린다"],
    ["3d-text-depth-layers",   "같은 글자를 겹쳐 쌓아 두께를 만든다"],
  ]],
  ["경로·절차 — 순서대로 따라간다", [
    ["svg-path-draw",          "선이 스스로 그려진다 (경로·서명·게이지)"],
    ["nudge-curve",            "느리게-빠르게-느리게 한 덩어리가 자리를 옮긴다"],
    ["viewport-change",        "화면 전체가 카메라처럼 밀리고 확대된다"],
    ["multi-phase-camera",     "당겨보기→집중→밀어넣기 3단 카메라"],
    ["coordinate-target-zoom", "화면 구석의 특정 요소로 정확히 줌인한다"],
    ["3d-camera-flight",       "원근 공간을 실제로 통과해 날아간다"],
  ]],
  ["전환·반전 — 뜻이 뒤집히거나 형태가 바뀐다", [
    ["hacker-flip-3d",         "글자가 한 자씩 3D 로 돌며 다른 글자로 해독된다"],
    ["discrete-text-sequence", "글이 통째로 다른 상태로 갈아치워진다 (오타·정정·백스페이스)"],
    ["gradient-text-sweep",    "글자 안쪽으로 그라데이션이 훑고 지나간다"],
  ]],
  ["강조·경고 — 여기서 멈춰 세운다", [
    ["kinetic-beat-slam",      "짧은 구절이 박자에 맞춰 서로 다른 방식으로 내리꽂힌다"],
    ["chromatic-glitch",       "RGB 가 갈라져 떨다가 딱 붙는다"],
    ["particle-burst",         "결정론적 파티클이 터졌다 중력으로 떨어진다"],
    ["css-marker-patterns",    "형광펜·동그라미·밑줄·취소선을 손으로 그은 듯 친다"],
    ["physics-press-reaction", "눌렸다 튀어오른다 (도장·버튼·확인)"],
    ["press-release-spring",   "압축 후 스프링 복귀 + 색·그림자 변화"],
  ]],
  ["관계·연결 — 무엇이 무엇에 걸려 있다", [
    ["orbit-3d-entry",         "3D 로 뒤집혀 들어와 타원 궤도를 돈다"],
    ["svg-icon-enrichment",    "아이콘 내부가 움직인다 (바늘·날개·점멸·흐름선)"],
    ["sine-wave-loop",         "숨쉬듯 미세하게 계속 흔들린다"],
  ]],
];
// 모션 카탈로그 — 전부 선택 가능. 취향에 따른 제외·승인 목록은 두지 않는다.

// 이징 서명 + **경계 속도** (GSAP 3.14.2 실측, 2026-09-08).
// 이음매 정합은 앞 컷의 t=D 속도와 뒤 컷의 t=0 속도를 맞추는 일이라, 그 값이 유한하지 않으면
// 해석적으로 맞출 수 없다. 서명을 고를 때 이 열을 반드시 봐라.
const EASE_SIGS = [
  ["snap",     "급제동·오버슈트",       "expo.out",            "back.out(1.7)",  "빠르게 들어와 딱 멈춘다 — 마감·경고",
   "진입 6.93·d/D · 이탈 ≈0 — 정합 쉬움"],
  ["elastic",  "탄성",                 "elastic.out(1,0.55)", "power4.inOut",   "튕긴다 — 가볍고 즐거운 주제",
   "진동형 — 연속 이음매를 의도하면 실제 경계 상태를 대조한다"],
  ["slowfast", "슬로우-패스트-슬로우",   "power3.in",           "power4.out",     "무게감·설명형 (nudge-curve 3단)",
   "이탈 4·d/D · 진입 5·d/D — 차수가 달라도 (N+1) 식만 맞으면 정확히 맞는다"],
  ["stepped",  "스텝·기계적",           "steps(6)",            "none",           "딱딱 끊긴다 — 절차·규칙 나열",
   "계단 — 속도가 정의되지 않는다. 이음매는 none(1·d/D)으로 받아라"],
  ["circular", "원호·되감김",           "circ.out",            "back.in(1.2)",   "호를 그리며 감속 — 전환·반전",
   "진입 기울기가 큰 커브 — 연속 이음매를 의도하면 실제 경계 상태를 대조한다"],
  ["soft",     "부드러움",              "sine.inOut",          "power2.out",     "00003 이 쓴 것",
   "양끝 0 — 정지에서 정지. 관통 컷에는 부적합"],
  ["default",  "기본형",                "power2.out",          "power3.out",     "HyperFrames 기본값 = 00002 가 쓴 것",
   "진입 3·d/D — 정합 쉬움"],
];

// powerN 은 t^(N+1) 이다 (GSAP 규약 — power1=quad, power4=quint). 실측 확인.
//   powerN.in  종단 속도 = (N+1)·d/D      powerN.out t=0 속도 = (N+1)·d/D
// ⚠️ N 으로 쓰면 차수가 같은 이음매에선 오차가 상쇄되지만, 차수가 다르면 어긋난다.
const powerV = n => n + 1;

// ── 프로젝트 스캔 ────────────────────────────────────────────────────────────
const projects = () => existsSync(PROJECTS)
  ? readdirSync(PROJECTS).filter(d => /^\d{5}-/.test(d)).sort() : [];
function resolveProject(a) {
  const all = projects();
  const numeric = /^\d+$/.test(a);
  const h = all.filter(p => numeric
    ? p.startsWith(String(Number(a)).padStart(5,"0")+"-")
    : p === a || p.includes(a));
  if (h.length !== 1) die(`프로젝트 지목 실패: "${a}" → ${h.length ? h.join(", ") : "없음"}\n  있는 것: ${all.join(" ")}`);
  return h[0];
}
const sbPath     = p => join(PROJECTS, p, "hyperframes/STORYBOARD.md");
const framesDir  = p => join(PROJECTS, p, "hyperframes/compositions/frames");
const framePath  = p => join(PROJECTS, p, "hyperframes/frame.md");

const AD = animationDir();
const RULES = new Set(readdirSync(join(AD,"rules")).filter(f => f.endsWith(".md")).map(f => basename(f,".md")));

function citedRules(p) {
  if (!existsSync(sbPath(p))) return [];
  const t = readFileSync(sbPath(p), "utf8");
  return [...RULES].filter(r => new RegExp(`\\b${r}\\b`).test(t)).sort();
}
function easingOf(p) {
  const d = framesDir(p), out = new Map();
  if (!existsSync(d)) return out;
  for (const f of readdirSync(d).filter(x => x.endsWith(".html")))
    for (const m of readFileSync(join(d,f),"utf8").matchAll(/ease\s*:\s*["']([^"']+)["']/g))
      out.set(m[1], (out.get(m[1])||0)+1);
  return out;
}
// "power2.out" → "power" · "back.out(1.7)" → "back" · "sine.inOut" → "sine"
// ⚠️ 숫자 접미사를 벗기지 않으면 "power2" 가 되어 "power" 와 영원히 불일치한다 (2026-09-08 실측 버그)
const familyOf = e => e.replace(/\(.*/,"").replace(/\.(out|in|inOut)$/,"").replace(/\d+$/,"");

// 한글·CJK 는 터미널에서 2칸을 먹는다. padEnd 는 코드유닛을 세므로 표가 깨진다.
const dw = s => [...s].reduce((n,c)=>n+(/[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(c)?2:1),0);
const pad = (s,w) => s + " ".repeat(Math.max(0, w - dw(s)));

function stats(p) {
  const ez = easingOf(p), total = [...ez.values()].reduce((a,b)=>a+b,0);
  const sorted = [...ez.entries()].sort((a,b)=>b[1]-a[1]);
  const powerShare = sorted.filter(([e])=>familyOf(e)==="power").reduce((a,[,n])=>a+n,0)/(total||1);
  return { cited: citedRules(p), ez, total, sorted, powerShare,
           fams: new Set([...ez.keys()].map(familyOf)),
           frameMd: existsSync(framePath(p)) ? readFileSync(framePath(p),"utf8") : null };
}

// ── 명령 ─────────────────────────────────────────────────────────────────────
const [,,cmd,arg] = process.argv;
const all = projects();

if (cmd === "history" || !cmd) {
  console.log(`\n모션 어휘 이력 — 룰 ${RULES.size}개 보유 (전부 선택 가능)\n`);
  const used = new Set();
  for (const p of all) {
    const s = stats(p);
    s.cited.forEach(r => used.add(r));
    console.log(`  ${p}`);
    console.log(`    인용 룰 ${s.cited.length}개${s.cited.length ? ": "+s.cited.join(", ") : "  ← 직접 작성한 모션도 허용"}`);
    console.log(`    이징 ${s.total}회 · power* ${(s.powerShare*100).toFixed(1)}% · 상위: ${s.sorted.slice(0,3).map(([e,n])=>`${e}×${n}`).join(" ")||"—"}`);
  }
  console.log(`\n  사용 이력 ${used.size}/${RULES.size}개${used.size?" — "+[...used].sort().join(", "):""}\n`);
  process.exit(0);
}

if (cmd === "menu") {
  const p = arg ? (all.includes(arg) ? arg : (/^\d+$/.test(arg) && !all.some(x=>x.startsWith(String(arg).padStart(5,"0")+"-"))
        ? `${String(arg).padStart(5,"0")}-(미생성)` : resolveProject(arg))) : null;
  console.log(`\n${p ?? "새 영상"} 모션 설계 자료 — 고르는 건 너다\n`);
  console.log(`  이 도구는 후보를 보여줄 뿐 정하지 않는다. 컷마다 "이 문장이 무슨 일을 하는가"를`);
  console.log(`  먼저 적고, 그 일을 **물리로 보여주는** 것을 아래에서 고른다. 신선함이 기준이 아니다.\n`);
  console.log(`━━ ① 내용이 하는 일 → 그 일의 물리 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  for (const [job, items] of JOBS) {
    console.log(`\n  ${job}`);
    for (const [id, desc] of items) {
      if (!RULES.has(id)) { console.log(`     ⚠️ ${id} — 라이브러리에 없다 (스킬 갱신됨?)`); continue; }
      console.log(`        ${pad(id,25)}${desc}`);
    }
  }
  console.log(`\n━━ ② 주제 브랜드의 물리에서 끌어와라 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`
  그 브랜드가 실제로 하는 동작이 곧 모션 언어다. 카탈로그를 훑기 전에 이걸 먼저 답해라.

    · 이 브랜드/기관이 물리적으로 하는 동작은 무엇인가?
        수업        → 아이가 손을 든다 · 칠판에 쓴다 · 발표한다 · 책장을 넘긴다 · 짝과 묻고 답한다
        교실·지점   → 교실 문이 열린다 · 불이 켜진다 · 자리가 채워진다 · 복도를 걸어 들어간다
        행사·성장   → 상장을 받는다 · 무대에 선다 · 박수가 퍼진다 · 키 재기 선이 올라간다
        과정·일정   → 단계 칸이 채워진다 · 일정 띠가 넘어간다 · 도장을 찍는다
        계절        → 눈이 날린다 · 잎이 진다 · 방학 달력이 넘어간다
    · 그 동작을 위 카탈로그의 어떤 물리로 옮길 수 있나?
    · 그 영상에서 딱 한 컷만 기억된다면 어느 컷이어야 하나? 거기에 예산을 몰아라.

  ⚠️ 주제와 무관한 화려함은 정보형에서 역효과다. "왜 이 모션인가"에 한 줄로 답 못 하면 빼라.`);

  console.log(`\n━━ ③ 이징 서명 — 영상의 가속 성격을 하나로 잡아라 ━━━━━━━━━━━━━━━━━━━`);
  const usedFams = new Set(all.flatMap(x => [...stats(x).fams]));
  for (const [id,label,pri,acc,note,seam] of EASE_SIGS) {
    const seen = usedFams.has(familyOf(pri));
    console.log(`   ${seen?"·":" "} ${pad(label,22)}주 ${pad(pri,23)}보조 ${pad(acc,18)}${note}`);
    console.log(`     ${pad("",22)}이음매: ${seam}`);
  }
  console.log(`     ('·' = 이전 편이 이미 쓴 계열. 사용 이력이며 재사용 제한은 없다)`);

  console.log(`\n━━ ④ 최근 이력 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  for (const x of all.slice(-3)) {
    const s = stats(x);
    console.log(`     ${pad(x,24)}룰 ${s.cited.length}개${s.cited.length?": "+s.cited.join(", "):""} · power* ${(s.powerShare*100).toFixed(1)}%`);
  }

  const listed = new Set(JOBS.flatMap(([, items]) => items.map(([id]) => id)));
  const extra = [...RULES].filter((id) => !listed.has(id)).sort();
  console.log(`\n━━ ⑤ 추가 재료 — 모두 사용 가능 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  for (const id of extra) console.log(`     ${id}`);
  console.log(`\n  무대 x0~1080 · y360~1360. 이징·확대·회전·모프·블러·글로우·전환 모두 자유.`);
  console.log(`  읽을 정보는 x60~960 안에 정착. 밴드·락업·자막과 렌더 재현성은 유지한다.`);
  console.log(`  카탈로그 인용·개수·조합에 의무는 없다. 없는 모션은 직접 작성한다.\n`);
  process.exit(0);
}

if (cmd === "audit") {
  if (!arg) die("프로젝트를 지목해라 — node pipeline/motion-signature.mjs audit 00002");
  const p = resolveProject(arg), s = stats(p);
  console.log(`\n${p} 모션 참고 통계 — 품질 합불이나 제작 제한으로 쓰지 않는다\n`);
  console.log(`  인용 룰 ${s.cited.length}개 · 이징 ${s.total}회 · power* ${(s.powerShare*100).toFixed(1)}%`);
  for (const [e, n] of s.sorted) console.log(`    ${n}회  ${e}`);
  for (const o of all.filter((x) => x !== p)) {
    const os = stats(o), shared = s.cited.filter((r) => os.cited.includes(r));
    console.log(`  vs ${o}: 공통 룰 ${shared.length}개 (재사용 허용)`);
  }
  console.log("\n  통계 산출 완료. 직접 작성·이징 혼합·의도적 반복은 자유이며, 품질은 화면에서 판단한다.\n");
  process.exit(0);
}

// check 는 선택한 서명 동작의 선언을 참고용으로 읽는다. 횟수·형식으로 제작을 막지 않는다.
if (cmd === "check") {
  if (!arg) die("사용: node pipeline/motion-signature.mjs check <프로젝트>");
  const proj = resolveProject(arg);
  const sbFile = sbPath(proj);
  if (!existsSync(sbFile)) { console.log(`ℹ️ 서명 선언 없음 — 자유 작성 가능 (${sbFile})`); process.exit(0); }
  const sb = readFileSync(sbFile, "utf8");

  console.log(`\n  ══ 서명 동작 참고 — ${proj} ══\n`);

  // ① 선언 — 「서명 동작 — <이름>」
  const decl = sb.match(/서명\s*동작\s*[—\-–]\s*([^\n*(]{2,40})/);
  if (!decl) {
    console.log("  ℹ️ 서명 동작 선언 없음 — 직접 작성 가능. 주제와 모션의 관계는 화면에서 판단한다.\n");
    process.exit(0);
  }
  const sigName = decl[1].trim().replace(/\*+$/, "");
  console.log(`     ✅ 선언  「${sigName}」`);

  // ② 어느 프레임인가 — 선언 문단 안의 F숫자
  /* ⚠️ **선언 문단까지만 본다.** 처음엔 900자 창으로 잡았더니 다음 절(헤드존 규칙)의
     프레임 목록까지 삼켜 00009 가 「F01·F02·…·F25 9곳」으로 나왔다 — 실제 선언은 F14·F22 둘이다.
     빈 줄이 문단의 끝이다. */
  const at = sb.indexOf(decl[0]);
  const rest = sb.slice(at);
  const para = rest.slice(0, (rest.indexOf("\n\n") + 1 || rest.length + 1) - 1);
  const frames = [...new Set([...para.matchAll(/\bF(\d{1,2})\b/g)].map((m) => +m[1]))].sort((a, b) => a - b);
  if (!frames.length) {
    console.log(`\n  ℹ️ 「${sigName}」이 **어느 프레임**에 들어가는지 안 적혀 있다.`);
    console.log("     「어딘가에 있다」는 선언이 아니다 — F14·F22 처럼 프레임 번호를 적어라.\n");
    process.exit(0);
  }
  console.log(`     ✅ 프레임  ${frames.map((n) => "F" + String(n).padStart(2, "0")).join(" · ")}  (${frames.length}곳)`);

  // ③ 그 프레임에 진짜로 있는가 — 선언만 하고 구현 안 한 것을 잡는다
  const fdir = framesDir(proj);
  if (!existsSync(fdir)) { console.log("\n     △ 프레임이 아직 없다 — 작성 후 다시 돌려라\n"); process.exit(0); }
  const files = readdirSync(fdir).filter((f) => f.endsWith(".html"));
  let missing = [], dead = [];
  for (const n of frames) {
    const nn = String(n).padStart(2, "0");
    const f = files.find((x) => x.startsWith(nn + "-"));
    if (!f) { missing.push("F" + nn); continue; }
    const html = readFileSync(join(fdir, f), "utf8");
    const tweens = (html.match(/\.(to|from|fromTo)\(/g) || []).length;
    if (tweens < 1) dead.push("F" + nn);
  }
  if (missing.length) {
    console.log(`\n  ℹ️ 선언한 프레임이 없다: ${missing.join(" · ")}`);
    console.log("     STORYBOARD 의 서명 선언과 실제 프레임 번호가 어긋났다.\n");
    process.exit(0);
  }
  if (dead.length) {
    console.log(`\n  ℹ️ 선언한 프레임에 트윈이 없다: ${dead.join(" · ")}`);
    console.log("     정적 GSAP 호출을 찾지 못했다. 다른 런타임·헬퍼 구현 여부를 화면에서 확인한다.\n");
    process.exit(0);
  }
  console.log(`     ✅ 구현  선언한 ${frames.length}개 프레임 전부에 트윈이 있다`);

  console.log(`\n  참고: 「${sigName}」 ${frames.length}곳. 횟수 제한은 없다.\n`);
  console.log("  ℹ️ **「주제에 맞나」는 코드가 판정하지 못한다.** 사람이 본다 —");
  console.log("     이 동작이 그 주제가 **실제로 하는 일**인가? 아니면 아무 영상에나 붙는 장식인가?\n");
  process.exit(0);
}

die(`모르는 명령: ${cmd}\n  menu [<p>] | check <p> | audit <p> | history`);
