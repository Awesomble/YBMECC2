// layout-probe.js — 조립본 안에서 도는 측정기. `layout-scan.mjs` 가 문자열로 주입한다.
//
// 🔴 네 가지를 한 번에 본다. 하나라도 빼면 2026-09-11 의 일이 반복된다
//    (글자끼리만 재고 「겹침 0」이라 보고했다가 사용자가 두 군데를 바로 짚었다).
//      ⑤ 글자 ✕ 글자
//      ⑥ 글자 ✕ 도형 — 색면·svg·이미지. z-순서를 보고 **글자가 위면 통과**
//      ⑦ 안전여백(72px) 이탈
//      ⑧ 헤드존 정렬 편차 — 컷 사이 일관성. 한 시점만 보면 절대 안 잡힌다
//
// ⚠️ 좌표는 **조상의 overflow:hidden 으로 잘린 뒤**를 쓴다. 안 그러면 크롭 이미지처럼
//    박스가 화면 밖까지 뻗은 요소가 전부 오탐으로 나온다 (00009 F18 이 그랬다).

// A host's DOM id is not its timeline key. Support both the legacy .scene hosts
// and canonical .clip.frame-slot hosts, including roots named other than #root.
function layoutProbeContext() {
  const root = document.querySelector('[data-composition-id="main"]:not([data-composition-src])')
    || document.getElementById("root");
  const candidates = root ? [...root.querySelectorAll(".scene, .clip.frame-slot[data-composition-src]")] : [];
  const scenes = candidates.filter(el => !candidates.some(parent => parent !== el && parent.contains(el)));
  const hosts = root ? [...new Set([...scenes, ...root.querySelectorAll("[data-composition-src]")])] : [];
  return { root, scenes, hosts };
}

async function layoutProbe(step) {
  const tl = window.__timelines && window.__timelines["main"];
  if (!tl) return { error: "window.__timelines.main 이 없다 — 조립본이 아니거나 런타임이 안 떴다" };
  const context = layoutProbeContext(), root = context.root;
  if (!root) return { error: "루트 컴포지션(main 또는 #root)이 없다" };

  const scenes = context.scenes.map(function (s) {
    return { el: s, id: s.dataset.compositionId || (s.id || "").replace(/^el-/, ""), start: +s.dataset.start,
             dur: +(s.dataset.hfAuthoredDuration || s.dataset.duration) };
  }).filter(function (s) { return s.dur > 0; }).sort(function (a, b) { return a.start - b.start; });
  if (!scenes.length) return { error: "씬 호스트(.scene 또는 .clip.frame-slot)를 못 찾았다" };
  const player = window.__player;
  const runtimeSeek = player && (typeof player.renderSeek === "function" ? player.renderSeek : player.seek);
  if (typeof runtimeSeek !== "function") return { error: "HyperFrames 런타임 seek API가 없다 — 클립 가시성을 검증할 수 없다" };
  // data-duration owns the render length; the final held frame may outlast all tweens.
  const TOTAL = +(root.dataset.hfAuthoredDuration || root.dataset.duration)
    || (typeof player.getDuration === "function" && player.getDuration()) || tl.duration();
  if (!Number.isFinite(TOTAL) || TOTAL <= 0) return { error: "유효한 루트 재생 길이가 없다" };
  const originalTime = typeof player.getTime === "function" ? player.getTime() : tl.time();

  // The runtime seeks child timelines AND gates every clip, including root captions.
  // Do not replace that state with display writes or disable the authored camera.
  async function seek(t) {
    await runtimeSeek.call(player, +t.toFixed(3));
    if (typeof window.__hfWaitForSeekCompletion === "function") await window.__hfWaitForSeekCompletion();
    const actual = typeof player.getTime === "function" ? player.getTime() : t;
    return Number.isFinite(actual) ? actual : t;
  }

  function eff(el) {
    var o = 1, n = el;
    while (n && n !== document.body) {
      var c = getComputedStyle(n);
      if (c.display === "none" || c.visibility === "hidden") return 0;
      o *= parseFloat(c.opacity || "1"); n = n.parentElement;
    }
    return o;
  }
  function zi(el) {
    var n = el;
    while (n && n !== document.body) { var v = parseInt(getComputedStyle(n).zIndex); if (!isNaN(v)) return v; n = n.parentElement; }
    return 0;
  }
  function clipped(el) {                      // 조상 overflow 로 잘린 실제 가시 박스
    var r = el.getBoundingClientRect(), n = el.parentElement;
    var b = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    while (n && n !== document.body) {
      var c = getComputedStyle(n);
      if (c.overflow !== "visible" || c.overflowX !== "visible" || c.overflowY !== "visible") {
        var p = n.getBoundingClientRect();
        b.l = Math.max(b.l, p.left); b.t = Math.max(b.t, p.top);
        b.r = Math.min(b.r, p.right); b.b = Math.min(b.b, p.bottom);
      }
      // SVG clipPath is not CSS overflow. A text node outside a rectangular
      // reel mask has a DOM box, but paints no pixels and must not fail safezone.
      var ref = n.getAttribute?.("clip-path")?.match(/^url\(["']?#([^"')]+)["']?\)$/);
      if (ref && n.getScreenCTM) {
        var mask = n.ownerSVGElement?.querySelector("#" + CSS.escape(ref[1]));
        var rect = mask?.children.length === 1 ? mask.firstElementChild : null;
        if (rect?.tagName.toLowerCase() === "rect" && !rect.hasAttribute("transform") && mask.getAttribute("clipPathUnits") !== "objectBoundingBox") {
          var m = n.getScreenCTM();
          if (m) {
            var x = +rect.getAttribute("x") || 0, y = +rect.getAttribute("y") || 0;
            var w = +rect.getAttribute("width") || 0, h = +rect.getAttribute("height") || 0;
            var pts = [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].map(([px,py]) => new DOMPoint(px,py).matrixTransform(m));
            b.l = Math.max(b.l, Math.min(...pts.map(p => p.x)));
            b.t = Math.max(b.t, Math.min(...pts.map(p => p.y)));
            b.r = Math.min(b.r, Math.max(...pts.map(p => p.x)));
            b.b = Math.min(b.b, Math.max(...pts.map(p => p.y)));
          }
        }
      }
      n = n.parentElement;
    }
    return b;
  }
  function lab(el) {
    if (el.id) return "#" + el.id;
    var cl = el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className;
    return "." + String(cl || el.tagName).trim().split(/\s+/)[0];
  }
  function sceneOf(el) {
    var n = el;
    while (n) {
      var scene = scenes.find(s => s.el === n);
      if (scene) return scene.id;
      n = n.parentElement;
    }
    return inCaption(el) ? "자막" : "루트";
  }
  function inCaption(el) {            // 자막대는 무대와 별도 구역으로 검사한다
    var n = el;
    // 섹션 모델의 자막 컴포지션(compositions/captions.html · .cap · #captions-root)도 자막대다 (2026-09-15 · 00015 에서 24개 오탐)
    while (n && n !== document.body) { if (n.classList && (n.classList.contains("caption") || n.classList.contains("cap"))) return true; if (n.id === "captions-root" || n.dataset?.compositionId === "captions") return true; n = n.parentElement; }
    return false;
  }
  // 🔴 **지속 락업은 무대 정보가 아니다** (2026-09-19 · 00002).
  //    `docs/09-safezone.md` §1 이 락업 자리를 x80·y238·w166·h42 로 **명시**하는데, 이 검사는
  //    자막만 예외로 두고 락업은 무대 구역(y360~1360)으로 재서 하드로 냈다.
  //    00001 은 락업이 <img> 라 이 루프를 타지 않아 드러나지 않았고, 채널명을 텍스트 락업으로
  //    바꾸자마자 27시점 전부 하드가 됐다. 자막과 같은 방식으로 **별도 구역**에서 검사한다.
  function inLockup(el) {
    var n = el;
    while (n && n !== document.body) { if (n.id === "el-root-lockup" || inBand(n)) return true; n = n.parentElement; }
    return false;
  }
  // 🔴 **로고 옆 맥락 라벨(키커)도 락업 띠다** (2026-10-04 · 00048).
  //    00043 사용자 지적(「첫화면이 허전해」)으로 로고 오른쪽 y228~340에 장소·주제 라벨을 두는 것이
  //    승인된 구도가 됐는데, 이 검사는 무대 구역으로 재서 키커마다 하드를 냈다(00048 키커 5건).
  //    `data-lockup-band`를 단 요소만 락업 띠 규칙으로 재고, 로고 상자(x80~237)를 넘으면 이탈로 본다.
  function inBand(n) { return !!(n.hasAttribute && n.hasAttribute("data-lockup-band")); }
  function inBandTree(el) { var n = el; while (n && n !== document.body) { if (inBand(n)) return true; n = n.parentElement; } return false; }
  function isect(A, B) {
    var x = Math.min(A.r, B.r) - Math.max(A.l, B.l), y = Math.min(A.b, B.b) - Math.max(A.t, B.t);
    return (x > 1 && y > 1) ? x * y : 0;
  }
  const area = (q) => (q.r - q.l) * (q.b - q.t);

  const TT = new Map(), US = new Map(), ED = new Map(), PB = new Map();
  /* 🔴 **글자 ↔ 자기 상자 여백** (2026-10-04 · ABMEN 00046 · pitfalls §169). 칩·도장·단말기 화면처럼
     배경을 칠했거나 네 변 테두리가 있는 가장 가까운 조상을 「상자」로 보고, 글자 글리프 띠가 그 상자 안에서
     얼마나 떨어져 있는지 잰다. 「글자 ✕ 글자」·「가림」·구역 검사 어느 것도 이걸 보지 않아
     「TAP CARD」가 화면 테두리에 0px로 붙고 「LATER」가 도장 밖으로 5px 나간 채 렌더·감독 2회를 통과했고 사용자가 찾았다. */
  function padBox(el) {
    let n = el;
    while (n && n !== document.body && !(n.classList && n.classList.contains("clip"))) {
      const c = getComputedStyle(n), r = n.getBoundingClientRect();
      // 글자를 일부러 잘라 보이는 상자(플립시계 반쪽·마스크)는 「밖으로 나감」이 아니다 — 건너뛴다(00045 실측 오탐)
      if (c.overflowX !== "visible" || c.overflowY !== "visible" || (c.clipPath && c.clipPath !== "none")) return null;
      const bg = c.backgroundColor, img = c.backgroundImage;
      const filled = (bg && bg !== "rgba(0, 0, 0, 0)" && !/,\s*0(\.\d+)?\)$/.test(bg)) || (img && img !== "none");
      const vis = (s) => parseFloat(c["border" + s + "Width"]) > 0 && !/,\s*0(\.\d+)?\)$/.test(c["border" + s + "Color"]);
      const framed = vis("Top") && vis("Right") && vis("Bottom") && vis("Left");
      if ((filled || framed) && r.width * r.height < 1080 * 1920 * 0.3 && r.width > 20 && r.height > 16) return n;
      n = n.parentElement;
    }
    return null;
  }
  const bump = (m, k, t, f, x, box) => {
    const v = m.get(k) || { n: 0, t0: Infinity, t1: 0, f: 0, x: "", ts: [], boxes: [] };
    v.n++; v.t0 = Math.min(v.t0, t); v.t1 = Math.max(v.t1, t); v.f = Math.max(v.f, f);
    v.ts.push(t);   // 🔴 최장 **연속** 체류를 재려면 표본 시각이 있어야 한다 (2026-09-14 · abm-49 지적)
    if (box) v.boxes.push({ t, l: box.l, r: box.r, top: box.t, bottom: box.b });
    // 🔴 x 범위를 **키가 아니라 값**에 둔다 (2026-09-13). 키에 넣으면 이동 중 매 시점이
    //    별개 항목(n=1·t0==t1)이 되어 「연속 몇 초 이탈했나」를 셀 수 없다 —
    //    `zone-check` 는 0.5초 체류를 하드로 보는데 여기서는 영영 통과였다.
    if (x !== undefined) v.x = v.x ? (v.x.split("~")[0] + "~" + x.split("~")[1]) : x;
    m.set(k, v);
  };
  const headTops = new Set();
  let samples = 0;

  /* 🔴 **균일 격자만 보면 진입 순간을 통째로 놓친다** (2026-09-13 · 00013).
     `slam` 은 `amp × 1.25` 배에서 출발해 0.18초 만에 1 로 내려온다. step 0.2s 격자로는
     그 구간에 표본이 안 걸려 `layout-scan` 이 **하드 0** 을 냈고, 렌더 뒤 `zone-check`(화소)가
     세이프존 위반 17프레임을 잡았다 — 그래서 렌더를 다섯 번 버렸다.
     **렌더 후에만 재는 검사가 있으면 「렌더 3회 상한」이 물리적으로 불가능하다.**
     → GSAP 타임라인에서 이동·확대 트윈의 **시작 직후**를 임계 시점으로 뽑아 격자에 더한다.
     choreo.json 을 읽지 않는다 — 손으로 쓴 프레임에도 그대로 걸린다. */
  const times = [];
  for (let t = 0; t <= TOTAL - 0.01; t += step) times.push(+t.toFixed(3));
  let critical = 0;
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i], sub = window.__timelines[s.id];
    if (!sub || !sub.getChildren) continue;
    let ch = [];
    try { ch = sub.getChildren(true, true, false); } catch (e) { continue; }
    for (let j = 0; j < ch.length; j++) {
      const v = ch[j].vars || {};
      // 상자를 움직이는 트윈만 — 색·투명도 변화는 레이아웃을 바꾸지 않는다
      if (v.scale === undefined && v.scaleX === undefined && v.x === undefined && v.y === undefined) continue;
      let st = 0; try { st = ch[j].startTime(); } catch (e) { continue; }
      const at = s.start + st + 0.02;                       // 시작값이 아직 살아 있는 순간
      if (at > 0 && at < TOTAL - 0.01) { times.push(+at.toFixed(3)); critical++; }
    }
  }
  times.sort(function (a, b) { return a - b; });
  const uniq = [];
  for (let i = 0; i < times.length; i++) if (!i || times[i] - uniq[uniq.length - 1] > 0.005) uniq.push(times[i]);

  const sampledTimes = new Set();
  try {
  for (const requestedTime of uniq) {
    // renderSeek snaps to the runtime frame grid. Count and report actual sample
    // times so nearby critical points cannot inflate a sustained-overlap result.
    const t = +(await seek(requestedTime)).toFixed(6);
    if (sampledTimes.has(t)) continue;
    sampledTimes.add(t); samples++;
    const texts = [], shapes = [];
    const all = root.querySelectorAll("*");
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (eff(el) < 0.4) continue;
      const cs = getComputedStyle(el), cb = clipped(el);
      const rr = el.getBoundingClientRect();
      const q = { l: Math.max(rr.left, cb.l), t: Math.max(rr.top, cb.t), r: Math.min(rr.right, cb.r), b: Math.min(rr.bottom, cb.b) };
      const big = (q.r - q.l) > 3 && (q.b - q.t) > 3;
      if (big) {
        const bg = cs.backgroundColor;
        const filled = bg && bg !== "rgba(0, 0, 0, 0)" && !/,\s*0(\.\d+)?\)$/.test(bg)
          && area(q) < 1080 * 1920 * 0.3 && !el.classList.contains("clip");
        const tag = el.tagName.toLowerCase();
        const svgShape = ["line", "rect", "path", "polyline", "circle", "ellipse"].indexOf(tag) >= 0;
        // ⚠️ 화면을 거의 덮는 색면은 **배경 워시**다 (tide 등). 내용이 아니므로 구역 판정에서 뺀다.
        const wash = (q.r - q.l) > 900 || (q.b - q.t) > 1600;
        // 🔴 **속이 빈 SVG 도형은 가리지 않는다** (2026-09-12). `fill="none"` 인 rect·path 는
        //    윤곽선일 뿐인데 박스 전체를 가림으로 세면, 그 안에 있는 모든 글자가 오탐이 된다
        //    (00009 F14 의 수조 윤곽 800×630 이 앞 컷 카드의 숫자를 전부 「가림」으로 냈다).
        //    게다가 stroke-dasharray 로 아직 그려지지도 않은 선까지 가림으로 센다.
        //    ⚠️ 구역(edge) 판정에서는 빼지 않는다 — 선이 구역을 넘는 건 여전히 위반이다.
        const fillNone = svgShape && (() => {
          const f = cs.fill || el.getAttribute("fill");
          return !f || f === "none" || f === "transparent" || /,\s*0(\.\d+)?\)$/.test(f);
        })();
        if (!wash && (filled || svgShape || el.tagName === "IMG")) {
          if (!fillNone) shapes.push({ q, z: zi(el), el, l: lab(el) });
          // ⚠️ **이미지는 빼라.** PNG 박스에는 투명 여백이 들어 있어 박스 기준으로는 늘 이탈로 나온다.
          //    이미지의 실제 화소가 구역을 넘는지는 render-gate 의 구역 검사가 본다.
          // 🔴 세로는 **무대 안쪽 여백** y416~1304 (2026-09-15 사용자 지시: 정착한 콘텐츠가 상하좌우에 딱 붙지 않게).
          //    체류 0.5초 규칙은 layout-scan 이 같은 ED 버킷에 적용한다 — 통과는 소프트, 머물면 하드.
          if (el.tagName !== "IMG" && !inCaption(el) && !inLockup(el) && (q.l < 60 || q.r > 960 || q.t < 360 || q.b > 1360))
            bump(ED, JSON.stringify([sceneOf(el), lab(el) + "(도형)"]), +t.toFixed(2), 0, Math.round(q.l) + "~" + Math.round(q.r) + " y" + Math.round(q.t) + "~" + Math.round(q.b));
        }
      }
      // 🔴 글자는 **텍스트 노드의 라인박스**로 잡는다. 블록 박스로 재면 여백까지 겹침으로 세어진다.
      for (let k = 0; k < el.childNodes.length; k++) {
        const nd = el.childNodes[k];
        if (nd.nodeType !== 3 || !nd.textContent.trim()) continue;
        const rg = document.createRange(); rg.selectNodeContents(nd);
        const rcs = rg.getClientRects();
        for (let j = 0; j < rcs.length; j++) {
          const r0 = rcs[j];
          const qq = { l: Math.max(r0.left, cb.l), t: Math.max(r0.top, cb.t), r: Math.min(r0.right, cb.r), b: Math.min(r0.bottom, cb.b) };
          if ((qq.r - qq.l) <= 3 || (qq.b - qq.t) <= 3) continue;
          const txt = nd.textContent.trim().slice(0, 14);
          texts.push({ q: qq, z: zi(el), el, l: lab(el), txt });
          // 🔴 경계는 **render-gate 의 구역**과 같아야 한다 (2026-09-12).
          //    디자인 여백(72px)이 아니라 플랫폼 UI 구역이다 — 우측은 120px 이다 (docs/09-safezone.md).
          //    이 값이 어긋나 있어서 스캔은 통과하고 렌더 게이트에서 하드 실패가 났다.
          const outside = inCaption(el)
            ? qq.l < 120 || qq.r > 960 || qq.t < 1372 || qq.b > 1540
            : inLockup(el)
            ? qq.l < (inBandTree(el) ? 250 : 60) || qq.r > 960 || qq.t < 200 || qq.b > 360
            : qq.l < 60 || qq.r > 960 || qq.t < 360 || qq.b > 1360;
          if (outside)
            bump(ED, JSON.stringify([sceneOf(el), lab(el) + "“" + txt + "”"]), +t.toFixed(2), 0, Math.round(qq.l) + "~" + Math.round(qq.r) + " y" + Math.round(qq.t) + "~" + Math.round(qq.b), qq);
        }
        if (rcs.length && !inCaption(el)) {
          let ul = Infinity, ut = Infinity, ur = -Infinity, ub = -Infinity;
          for (let j = 0; j < rcs.length; j++) { const r0 = rcs[j]; if (r0.width < 1) continue; ul = Math.min(ul, r0.left); ut = Math.min(ut, r0.top); ur = Math.max(ur, r0.right); ub = Math.max(ub, r0.bottom); }
          const pb = ul < ur ? padBox(el) : null;
          if (pb) {
            const h = ub - ut; ut += h * 0.18; ub -= h * 0.18;            // 라인박스 → 대문자 글리프 띠
            const R2 = pb.getBoundingClientRect(), fs = parseFloat(cs.fontSize) || 20;
            const m = Math.min(ul - R2.left, R2.right - ur, ut - R2.top, R2.bottom - ub);
            const thr = Math.max(4, fs * 0.12);
            if (m < thr) bump(PB, JSON.stringify([sceneOf(el), lab(el) + "“" + nd.textContent.trim().slice(0, 14) + "”", lab(pb), Math.round(fs)]), +t.toFixed(2), +(-m).toFixed(1));
          }
        }
      }
      if (el.classList && el.classList.contains("title") && eff(el) > 0.9) headTops.add(Math.round(rr.top));
    }
    for (let a = 0; a < texts.length; a++) {
      const A = texts[a];
      for (let b = a + 1; b < texts.length; b++) {
        const B = texts[b];
        if (A.el === B.el || A.el.contains(B.el) || B.el.contains(A.el)) continue;
        // Runtime gating has already removed inactive chunks; two visible captions
        // that overlap now are a real review candidate, not a reason to skip them.
        const inter = isect(A.q, B.q); if (inter < 250) continue;
        const f = inter / Math.min(area(A.q), area(B.q)); if (f < 0.25) continue;
        bump(TT, JSON.stringify([sceneOf(A.el), A.l + "“" + A.txt + "”", B.l + "“" + B.txt + "”"]), +t.toFixed(2), +f.toFixed(2));
      }
      for (let b = 0; b < shapes.length; b++) {
        const S = shapes[b];
        if (A.el === S.el || A.el.contains(S.el) || S.el.contains(A.el)) continue;
        if (A.z > S.z) continue;                      // 글자가 위면 안 가려진다
        /* 🔴 z 가 같으면 **DOM 순서**가 정한다 — 뒤에 오는 형제가 위에 그려진다 (CSS 페인팅 규칙).
           z-index 만 보던 탓에, 흰 판(SVG) 위에 글자를 얹는 정상 배치가 전부 「가림」으로 떴다.
           00017 실측: 하드 19건 중 13건이 이 오탐이었다 (docs/02-pitfalls.md §101).
           DOCUMENT_POSITION_PRECEDING(2) = S 가 A 보다 앞선다 = A 가 나중에 그려진다 = A 가 위. */
        if (A.z === S.z && (A.el.compareDocumentPosition(S.el) & 2)) continue;
        const inter = isect(A.q, S.q); if (!inter) continue;
        const f = inter / area(A.q); if (f < 0.3) continue;
        bump(US, JSON.stringify([sceneOf(A.el), A.l + "“" + A.txt + "”", S.l]), +t.toFixed(2), +f.toFixed(2));
      }
    }
  }
  } finally {
    await seek(originalTime);
  }

  const dump = (m, keys) => [...m].map(function (e) {
    const k = JSON.parse(e[0]), v = e[1], o = { n: v.n, t0: v.t0, t1: v.t1, f: v.f, ts: v.ts, boxes: v.boxes };
    if (v.x) o.x = v.x;
    keys.forEach(function (kk, i) { o[kk] = k[i]; });
    return o;
  }).sort(function (x, y) { return y.f - x.f || y.n - x.n; });

  const tops = [...headTops].sort(function (a, b) { return a - b; });
  return {
    samples: samples, cuts: scenes.length, step: step, critical: critical,
    textText: dump(TT, ["sc", "a", "b"]),
    underShape: dump(US, ["sc", "a", "b"]),
    edge: dump(ED, ["sc", "a"]),
    textPad: dump(PB, ["sc", "a", "b", "fs"]),
    headTops: tops,
    headSpread: tops.length ? tops[tops.length - 1] - tops[0] : 0,
  };
}
layoutProbe;
