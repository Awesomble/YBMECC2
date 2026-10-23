#!/usr/bin/env node
import { resolveHyperframes } from "./lib/hyperframes-cli.mjs";
// layout-scan.mjs — 조립본 전 구간 **레이아웃 전수 검사**. (2026-09-12 신설)
//
//   node pipeline/layout-scan.mjs <프로젝트> [--step 0.2] [--static] [--json] [--quiet]
//
// 왜 (2026-09-11~12 · 00009 에서 세 시간을 태우고 얻은 것):
//   사용자가 「겹치는 게 너무 많다」고 했을 때 나는 **글자끼리 겹치는 것만** 쟀고 「0건」이라 보고했다.
//   사용자가 곧바로 두 군데를 짚었는데 둘 다 내 검사가 구조적으로 못 보는 종류였다 —
//     ① 글자가 **선·막대·도형**에 걸침   → 항목 수집에서 svg·색면을 아예 뺐다
//     ② **컷마다 같은 요소의 위치가 다름** → 한 시점 안만 봤지 프레임 사이는 본 적이 없다
//   그래서 이 도구는 **여섯 유형을 한 번에** 본다. 한 유형이라도 빠지면 같은 일이 반복된다.
//
// 검사 (정적 4 · 렌더 4)
//   정적  ① 죽은 GSAP 선택자      매칭 0개인 트윈은 조용히 아무 일도 안 한다 (pitfalls §68)
//         ② 스튜디오 주입 잔재    gsap.set("[data-hf-id=…]") — 드래그가 소스에 박힌 것 (§72)
//         ③ 금지 이징             이징 서명 위반
//         ④ 프레임 간 좌표 불일치  같은 클래스가 프레임마다 다른 top/left/width
//   렌더  ⑤ 글자 ✕ 글자
//         ⑥ 글자 ✕ 도형          색면·svg·이미지. **z-순서를 보고** 글자가 위면 통과 (§71)
//         ⑦ 안전여백(72px) 이탈
//         ⑧ 헤드존 정렬 편차       컷이 넘어갈 때 제목이 튀는지
//
// ⚠️ 렌더 검사는 **조립본**에서만 뜻이 있다. 루트 락업·카메라가 index.html 에만 있기 때문에
//    프레임 단독으로는 재현이 안 된다 (00009 에서 헤드라인↔락업 충돌이 그렇게 숨어 있었다).

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveProject } from "./lib/project.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const num = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? +argv[i + 1] : d; };
const VALUED = new Set(["step"]);
const positional = argv.filter((a, i) => {
  if (a.startsWith("--")) return false;
  const p = argv[i - 1];
  return !(p && p.startsWith("--") && VALUED.has(p.slice(2)));
});
const STEP = num("step", 0.2);
const JSONOUT = flag("json"), QUIET = flag("quiet"), STATIC = flag("static");
if (!Number.isFinite(STEP) || STEP <= 0) { console.error("--step 은 양수여야 한다"); process.exit(1); }

const { dir, name } = resolveProject(positional[0]);
const HF = join(dir, "hyperframes");
const IDX = join(HF, "index.html");
const FRAMES = join(HF, "compositions", "frames");
if (!existsSync(IDX)) { console.error(`🔴 ${IDX} 가 없다 — 먼저 조립해라`); process.exit(1); }

const out = { project: name, at: new Date().toISOString(), renderChecked: false, hard: [], soft: [], info: [] };
const HARD = (type, msg, detail) => out.hard.push({ type, msg, detail });
const SOFT = (type, msg, detail) => out.soft.push({ type, msg, detail });

/* ══════════ 정적 검사 ══════════ */
const files = existsSync(FRAMES) ? readdirSync(FRAMES).filter((f) => f.endsWith(".html")).sort() : [];
const src = Object.fromEntries(files.map((f) => [f, readFileSync(join(FRAMES, f), "utf8")]));

// ① 죽은 GSAP 선택자
for (const [f, s] of Object.entries(src)) {
  const body = s.includes("<template") ? s.split("<template", 2)[1].split("<script", 1)[0] : s;
  const ids = new Set([...body.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const cls = new Set();
  for (const m of body.matchAll(/\sclass="([^"]+)"/g)) m[1].split(/\s+/).forEach((c) => c && cls.add(c));
  const dead = new Set();
  for (const m of s.matchAll(/(?:tl|gsap)\.\w+\(\s*(?:P\s*\+\s*)?["']([^"']+)["']\s*(\+)?/g)) {
    if (m[2]) continue;                                   // 문자열 결합은 판정 불가
    for (const part of m[1].split(",")) {
      const bits = part.trim().split(/\s+/); const last = bits[bits.length - 1] || "";
      for (const tok of last.match(/[#.][A-Za-z0-9_-]+/g) || []) {
        if (tok[0] === "#" && !ids.has(tok.slice(1))) dead.add(part.trim());
        if (tok[0] === "." && !cls.has(tok.slice(1))) dead.add(part.trim());
      }
    }
  }
  // 정규식은 동적 DOM·선택자·다른 컴포지션을 해석하지 못한다. 런타임에서 확인한다.
  if (dead.size) SOFT("선택자 확인", `${f} — 정적 HTML에서 찾지 못했다`, [...dead].join(", "));
}

// ② 스튜디오 주입 잔재
for (const [f, s] of Object.entries(src)) {
  const n = (s.match(/gsap\.set\("\[data-hf-id/g) || []).length;
  if (n) HARD("스튜디오 주입", `${f} — 드래그 기록이 소스에 박혔다 (${n}건)`, 'gsap.set("[data-hf-id=…]") 줄을 지워라');
}

// ③ 이징 서명 밖의 이징
// 🔴 예전엔 `power2.*` 를 통째로 금지했는데, 그건 **00009 의 서명**(주 power3.in · 보조 power4.out)을
//    하드코딩한 것이었다. 영상마다 서명이 다르다(②에서 확정한다) — 00010 은 주 expo.out · 보조 back.out(1.7).
//    프로젝트에서 실제로 쓰인 이징 분포를 보고, **지배적인 두 계열 밖의 소수 이징**만 잡는다.
{
  const tally = new Map();
  for (const s of Object.values(src)) {
    for (const m of s.matchAll(/ease:\s*["']([^"']+)["']/g)) tally.set(m[1], (tally.get(m[1]) || 0) + 1);
  }
  const total = [...tally.values()].reduce((a, b) => a + b, 0);
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  out.info.push({ type: "이징 분포", msg: `${total}건 · ${ranked.length}종`,
    detail: ranked.map(([e, n]) => `${e} ${n}`).join(" · ") });
}

// ④ 프레임 간 좌표 불일치
{
  const rules = new Map();                                 // class → Map(sig → [frames])
  for (const [f, s] of Object.entries(src)) {
    const css = s.includes("<style") ? s.split("<style", 2)[1].split("</style>", 1)[0] : "";
    for (const m of css.matchAll(/\.([a-zA-Z][\w-]*)\s*\{([^}]*)\}/g)) {
      const sel = m[1], b = m[2];
      if (!/position:\s*absolute/.test(b)) continue;
      const keep = ["top", "left", "width", "height", "font-size"]
        .map((k) => { const v = b.match(new RegExp(`(?<![\\w-])${k}:\\s*([^;]+)`)); return v ? `${k}:${v[1].trim()}` : null; })
        .filter(Boolean).join(" ");
      if (!keep) continue;
      if (!rules.has(sel)) rules.set(sel, new Map());
      const v = rules.get(sel);
      v.set(keep, [...(v.get(keep) || []), basename(f, ".html").slice(0, 2)]);
    }
  }
  for (const [sel, variants] of rules) {
    const frames = [...variants.values()].reduce((a, b) => a + b.length, 0);
    if (variants.size < 2 || frames < 3) continue;
    out.info.push({ type: "프레임별 배치", msg: `.${sel} — ${variants.size}가지 좌표`,
      detail: [...variants].map(([sig, fs]) => `[${fs.join(",")}] ${sig}`).join("  ·  ") });
  }
}

/* ══════════ 렌더 검사 (CDP) ══════════ */
if (STATIC) {
  out.info.push({ type: "정적 검사", msg: "브라우저 검사는 실행하지 않았다" });
  report();
  // 정적 결과로 완전한 scan.json 을 덮어쓰지 않는다.
  process.exit(out.hard.length ? 1 : 0);
}
const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium"].find((p) => existsSync(p));
if (!CHROME) { HARD("검사 미완료", "Chrome 이 없다 — 정적 검사만 돌았다"); report(); process.exit(1); }

// 🔴 **file:// 도 평범한 정적 서버도 안 된다** (2026-09-12 · 이 도구를 만들자마자 걸렸다).
//    `index.html` 에는 로더가 **없다** — `data-composition-src` 선언만 있고, 서브 컴포지션을
//    실제로 마운트하는 건 하이퍼프레임 **런타임**이다(프리뷰 서버·렌더러가 주입한다).
//    그래서 생짜로 열면 씬 24개가 **빈 껍데기**로 뜨고 검사가 「0건」을 낸다 — 조용한 통과다.
//    → 프리뷰 서버를 쓴다. 떠 있으면 재사용하고, 없으면 띄웠다가 **우리가 띄운 것만** 끈다.

const hf = (...a) => execFileSync(process.execPath, [resolveHyperframes(HF).cli, "preview", HF, ...a],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
/* 🔴 **`localhost` 가 아니라 `127.0.0.1` 이다** (2026-09-14 실측으로 찾은 헛점).
   `--status` 실제 출력:  `Studio    http://127.0.0.1:3002/#project/hyperframes`
   이 정규식이 `localhost:` 만 찾아서 **기존 서버를 영영 못 찾았다.** 결과가 둘이었고 둘 다 사용자가 겪었다:
     ① 매번 `--background` 를 불러 서버가 쌓였다 ("왜 자꾸 뜨냐" · 실측 4개 + 크롬 34개)
     ② `weStarted=true` 가 **거짓말**이 돼서, 끝에 `--stop` 으로 **사용자가 열어 둔 서버를 껐다**
        ("띄워준거 확인해도 바로 꺼져서 확인도 못해")
   포트 표기 하나 때문에 도구가 남의 서버를 제 것으로 알았다. */
const PORT_RE = /(?:localhost|127\.0\.0\.1):(\d+)/;
let PREV = null, weStarted = false;
try { PREV = +(hf("--status").match(PORT_RE) || [])[1] || null; } catch {}
if (!PREV) {
  // 🔴 --no-open 없이 부르면 서버가 없을 때마다 **브라우저 탭이 열린다** (2026-09-15 사용자 재지적). 검사 도구는 창을 열지 않는다.
  try { PREV = +(hf("--background", "--no-open").match(PORT_RE) || [])[1] || null; weStarted = true; }
  catch (e) { SOFT("프리뷰 서버", "띄우지 못했다", String(e.message || e).slice(0, 120)); }
}
let PROJID = "hyperframes";
if (PREV) {
  try {
    const pj = await (await fetch(`http://127.0.0.1:${PREV}/api/projects`)).json();
    const hit = (pj.projects || []).find((x) => x.dir && x.dir.replace(/\/$/, "") === HF.replace(/\/$/, ""));
    if (hit) PROJID = hit.id;
    else SOFT("프리뷰 서버", `포트 ${PREV} 가 다른 프로젝트를 물고 있다`, (pj.projects || []).map((x) => x.dir).join(" "));
  } catch {}
}

const PORT = 9500 + (process.pid % 400);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--mute-audio",
  "--allow-file-access-from-files", "--no-first-run", "--window-size=1080,1920",
  `--remote-debugging-port=${PORT}`, "about:blank"], { stdio: "ignore" });
process.on("exit", () => { try { chrome.kill(); } catch {} });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, msgId = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++msgId; pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
  setTimeout(() => { if (pending.delete(id)) rej(new Error(`${method} 타임아웃`)); }, 120000);
});

try {
  let list = null;
  for (let i = 0; i < 60 && !list; i++) {
    try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { await sleep(250); }
  }
  const page = (list || []).find((t) => t.type === "page");
  if (!page) throw new Error("페이지 타깃을 못 찾았다");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  };
  await send("Page.enable");
  await send("Runtime.enable");
  if (!PREV) throw new Error("프리뷰 서버가 없다 — 렌더 검사를 못 한다");
  await send("Page.navigate", { url: `http://127.0.0.1:${PREV}/api/projects/${PROJID}/preview/comp/index.html` });
  await sleep(1500);
  await sleep(2500);
  await send("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true });

  // 🔴 **로드 검증** — 씬이 비어 있는데 「0건」을 내는 게 이 도구의 최악 실패다. 먼저 막는다.
  const SCAN = readFileSync(join(ROOT, "pipeline", "lib", "layout-probe.js"), "utf8");
  const chk = await send("Runtime.evaluate", { returnByValue: true, expression:
    `${SCAN}\n;(()=>{const {root,scenes,hosts}=layoutProbeContext();
      return {root:!!root, scenes:scenes.length,
        empty:hosts.filter(x=>!x.querySelector('*:not(style):not(script):not(template)')).length,
        missing:hosts.map(x=>x.dataset.compositionId||(x.id||'').replace(/^el-/,''))
          .filter(id=>!(window.__timelines&&window.__timelines[id])),
        tl:!!(window.__timelines&&window.__timelines['main'])};})()` });
  if (chk.exceptionDetails) throw new Error(chk.exceptionDetails.text + " " + (chk.exceptionDetails.exception?.description || ""));
  const L = chk.result.value;
  if (!L.tl) throw new Error("루트 타임라인이 없다 — GSAP 로드 실패");
  if (!L.root) throw new Error("루트 컴포지션(main 또는 #root)이 없다");
  if (!L.scenes) throw new Error("씬 호스트(.scene 또는 .clip.frame-slot)가 0개다");
  if (L.empty) throw new Error(`컴포지션 호스트 ${L.empty}개가 비었다 — 서브 컴포지션이 안 실렸다 (검사 무효)`);
  if (L.missing.length) throw new Error(`서브 타임라인이 없다: ${L.missing.join(", ")} (검사 무효)`);

  const r = await send("Runtime.evaluate", {
    expression: `${SCAN}
;layoutProbe(${STEP});`, returnByValue: true, awaitPromise: true, timeout: 110000,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
  const R = r.result.value;
  if (R.error) throw new Error(R.error);

  for (const o of R.textText) SOFT("글자 ✕ 글자", `${o.sc} — ${o.a} ✕ ${o.b}`, `${o.t0}~${o.t1}s · 최대 ${o.f}`);
  // 🔴 가림도 **지속으로 가른다** (2026-09-13). 진입 임계 시점을 표본에 넣자 「1시점(0.02초)만
  //    걸리는 순간 겹침」이 기존 납품본 3편에서 하드로 떴다 — 진입 애니메이션 중 스쳐 지나는 것이라
  //    눈에 보이지 않는다. **표본 1개는 순간, 2개 이상이면 최소 STEP 만큼 머문 것**이다.
  for (const o of R.underShape) {
    /* 🔴 **표본 수가 아니라 이어진 시간 폭**으로 가른다 (2026-09-15 · 00017 · pitfalls §102).
       바로 아래 여백 이탈 루프는 이미 이 규칙을 쓰는데 가림만 `o.n >= 2` 로 남아 있었다.
       진입 임계 표본이 격자보다 촘촘해서 **0.04초 스침이 3시점**으로 잡히고 하드가 됐다 —
       그 루프의 주석이 경고한 바로 그 오류다. 판이 글자 위를 지나 화면 밖으로 나가는
       퇴장 궤적은 눈에 보이지 않는다. `zone-check` 와 같은 0.5초 체류 기준으로 맞춘다. */
    const ots = (o.ts || []).slice().sort((a, b) => a - b);
    let os = 0, obest = 0;
    for (let i = 1; i <= ots.length; i++) {
      if (i === ots.length || ots[i] - ots[i - 1] > STEP + 1e-6) { obest = Math.max(obest, ots[i - 1] - ots[os] + STEP); os = i; }
    }
    const oheld = ots.length > 0 ? obest >= 0.5 : o.n >= 2;
    // 바운딩 박스는 SVG 내부·마스크·의도적 가림을 판별하지 못한다. 눈검사 후보로 남긴다.
    SOFT(oheld ? "글자 가림 확인" : "글자 가림 확인 (스침)",
      `${o.sc} — ${o.a} ← ${o.b}`, `${o.t0}~${o.t1}s · ${o.n}시점 · 최장 ${obest.toFixed(2)}초 · 면적비 ${o.f}`);
  }
  // 🔴 **`zone-check` 와 같은 기준으로 가른다** (2026-09-13 · 00013).
  //    예전엔 이탈을 전부 SOFT 로 냈다. 그래서 `layout-scan` 은 「하드 0」인데 렌더 뒤
  //    `zone-check`(화소)가 세이프존 위반 17프레임을 하드로 잡았고, **렌더를 다섯 번 버렸다.**
  //    `zone-check` 의 규칙은 「연속 0.5초 이상 머물면 하드, 짧은 통과는 ⚠️」다
  //    (docs/09-safezone.md §1 — 0.25초 지나가는 화소는 가려도 잃을 정보가 없다).
  //    같은 규칙을 여기서도 쓴다 — 그래야 **렌더 전에** 걸린다.
  // 🔴 글자 ↔ 자기 상자 여백 (pitfalls §169). f = −(가장 좁은 안쪽 여백 px). 상자 밖으로 0.5초 이상 머물면 하드.
  for (const o of R.textPad || []) {
    const ts = (o.ts || []).slice().sort((a, b) => a - b);
    let s0 = 0, best = 0;
    for (let i = 1; i <= ts.length; i++) if (i === ts.length || ts[i] - ts[i - 1] > STEP + 1e-6) { best = Math.max(best, ts[i - 1] - ts[s0] + STEP); s0 = i; }
    const minPad = -o.f, outside = minPad < -1, held = best >= 0.5, far = minPad < -4;
    const msg = `${o.sc} — ${o.a} in ${o.b}`;
    const det = `${o.t0}~${o.t1}s · 최소 여백 ${minPad}px(글자 ${o.fs}px · 기준 ${Math.max(4, Math.round(o.fs * 0.12))}px) · 최장 ${best.toFixed(2)}초`;
    if (far && held) HARD("글자가 상자 밖", msg, det);
    else SOFT(outside ? (held ? "글자가 상자 밖 (4px 이하)" : "글자가 상자 밖 (스침)") : "글자 상자 여백 부족", msg, det);
  }
  for (const o of R.edge) {
    // 표본은 STEP 격자라 실제 체류는 마지막 표본 뒤로도 이어진다 — 격자 하나를 더한 값이 실측에 가깝다.
    // 00013 실측: 실제 이탈 0.78초인데 3시점(t1-t0=0.40)만 잡혔다. +STEP 하면 0.60 으로 맞는다.
    /* 🔴 **연속성을 봐야 한다** (2026-09-14 · abm-49 실측). 옛 판정 `(t1-t0+STEP) >= 0.5 && n >= 3` 은
       구간 **폭**만 봐서 3.5초에 흩어진 표본 3개(각각 0.2초 통과)도 하드로 냈다 — 스냅샷엔 아무것도 없었다.
       `zone-check.sh` 의 `longest_run` 과 같은 규칙으로 맞춘다: 격자 간격으로 이어진 **최장 연속 구간**이 0.5초 이상. */
    /* ⚠️ 표본 수 × STEP 로 재면 안 된다 — 진입 임계 표본(+0.02초)이 격자보다 촘촘해서 5표본이 0.4초일 수 있다.
       **이어진 사슬의 시간 폭**으로 잰다. 끝 표본 뒤로 격자 하나를 더한다 (그 뒤로도 이어지므로). */
    const ts = (o.ts || []).slice().sort((a, b) => a - b);
    let start = 0, best = 0;
    for (let i = 1; i <= ts.length; i++) {
      if (i === ts.length || ts[i] - ts[i - 1] > STEP + 1e-6) { best = Math.max(best, ts[i - 1] - ts[start] + STEP); start = i; }
    }
    // 움직이며 구역을 지나는 것과 같은 자리에서 읽어야 하는 정보를 구별한다.
    const boxes = o.boxes || [];
    let anchor = null, since = 0, prev = -Infinity, settled = 0;
    for (const b of boxes) {
      if (!anchor || b.t - prev > STEP + 1e-6 ||
          ["l", "r", "top", "bottom"].some((k) => Math.abs(b[k] - anchor[k]) > 2)) {
        anchor = b; since = b.t;
      }
      settled = Math.max(settled, b.t - since);
      prev = b.t;
    }
    const held = /\(도형\)$/.test(o.a) ? best >= 0.5 : settled >= 0.5 - 1e-6;
    /* 🔴 **도형 이탈은 하드가 아니다** (2026-09-15 · 00017 · docs/02-pitfalls.md §101).
       `docs/09-safezone.md` §1 이 금지를 이렇게 정의한다 —
         「금지 = **정보가** 구역 밖에 머무르는 것 — 플랫폼 UI 가 가리는 자리에 **읽을 것**을 두는 일」
       판(카드·티켓·밴드)이 무대 경계를 넘어 잘리는 것은 **블리드**이고, 히어로 패턴이 요구하는 구도다
       (「중앙 숫자 + 아래 오브젝트 블리드」). 그 판 **안의 글자**는 이 루프가 따로 잡는다.
       00017 에서 남은 하드 7건이 전부 도형이었고, 고치려면 의도한 블리드를 없애야 했다. */
    const isShape = /\(도형\)$/.test(o.a);
    (held && !isShape ? HARD : SOFT)(
      held ? (isShape ? "안전여백 이탈 (도형 · 블리드)" : "안전여백 이탈 (체류)") : "안전여백 이탈 (통과)",
      `${o.sc} — ${o.a}`, `${o.t0}~${o.t1}s · ${o.n}시점 · 정착 ${settled.toFixed(2)}초 · x ${o.x}`);
  }
  out.info.push({ type: "제목 이동 범위", msg: `${R.headSpread}px (연출 참고값)`, detail: R.headTops.join(" ") });
  out.info.push({ type: "표본", msg: `${R.samples}시점 · step ${STEP}s + 진입 임계 ${R.critical ?? 0}개 · 컷 ${R.cuts}개` });
  out.renderChecked = true;
} catch (e) {
  HARD("렌더 검사 미완료", String(e.message || e), "정적 검사 결과만 유효하다 — 검수 통과로 처리하지 않는다");
} finally { try { chrome.kill(); } catch {} }
/* 🔴 **우리가 띄운 서버만 끈다** (2026-09-13 개정 · abm-a7 이 원인을 찾았다).
   옛 규칙은 「우리가 띄웠어도 그대로 둔다」였다 — 2026-09-12 에 남의 서버를 꺼서 사용자 탭이
   죽은 사고 때문이다. 그런데 **`weStarted` 를 이미 계산해 두고 쓰지 않았다.**
   부작용이 둘이었다:
     ① 사용자가 *"하이퍼프레임을 왜 자꾸 여는거야"* 라고 할 만큼 유령 서버가 쌓였다.
        실측: 프리뷰 4개 + 헤드리스 크롬 34개 동시 기동, 포트가 3002~3005 로 밀려
        어느 URL 이 어느 영상인지 분간이 안 됐다
     ② **살아 있는 서버가 프로젝트 경로를 다시 만든다.** abm-a7 이 임시 사본
        `99999-clamptest` 를 지우고 `ls` 로 확인까지 했는데 되살아났다 — 서버가 되만든 것이다
        (디렉터리 mtime 이 삭제 직후, 내용은 `hyperframes/` 만).
   ⇒ **우리가 띄운 것만** 끈다. 사용자가 열어 둔 서버(`weStarted=false`)는 그대로 둔다 —
      원래 우려는 그대로 막히고, 뒷문은 닫힌다.
   🔴 스튜디오를 **여는** 통로는 `pipeline/preview.sh <p> <user|final>` 하나다. 이 도구는 검사용이다. */
if (PREV && weStarted) {
  try { hf("--stop"); } catch {}
  out.info.push({ type: "프리뷰", msg: "이 도구가 띄운 서버는 껐다", detail: "사용자용은 pipeline/preview.sh <p> user" });
} else if (PREV) {
  out.info.push({ type: "프리뷰", msg: `http://localhost:${PREV}/#project/${PROJID}`, detail: "사용자가 열어 둔 서버 — 건드리지 않았다" });
}

report();
const O = join(dir, "output", "review");
mkdirSync(O, { recursive: true });
writeFileSync(join(O, "scan.json"), JSON.stringify(out, null, 2));
if (!QUIET) console.log(`\n  → projects/${name}/output/review/scan.json`);
process.exit(out.hard.length ? 1 : 0);

function report() {
  if (JSONOUT) { console.log(JSON.stringify(out, null, 2)); return; }
  if (QUIET) return;
  console.log(`\n  ══ 레이아웃 스캔 — ${name} ══`);
  const show = (arr, mark) => {
    const by = new Map();
    for (const o of arr) by.set(o.type, [...(by.get(o.type) || []), o]);
    for (const [t, xs] of by) {
      console.log(`\n  ${mark} ${t}  (${xs.length})`);
      for (const x of xs.slice(0, 12)) console.log(`     ${x.msg}${x.detail ? `\n        ${x.detail}` : ""}`);
      if (xs.length > 12) console.log(`     … 외 ${xs.length - 12}건 (scan.json 참조)`);
    }
  };
  show(out.hard, "🔴"); show(out.soft, "⚠️");
  for (const i of out.info) console.log(`\n  ℹ️ ${i.type} — ${i.msg}`);
  console.log(`\n  하드 ${out.hard.length} · 소프트 ${out.soft.length}`);
  if (out.hard.length) console.log("  🔴 하드가 있으면 사용자에게 검수 시트를 보내지 마라 — 먼저 고친다.\n");
  else if (out.renderChecked) console.log("  ✅ 하드 없음 — 가림 후보는 화면에서 확인한다.\n");
  else console.log("  ℹ️ 정적 검사 완료 — 실제 화면은 아직 검증하지 않았다.\n");
}
