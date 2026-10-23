#!/usr/bin/env node
/**
 * hf-compile.mjs — 안무 스펙(choreo.json) → HyperFrames 프레임 HTML
 *
 * 왜 있나: 00002~00010 까지 프레임 HTML 을 워커가 손으로 25번씩 다시 썼다.
 * 그 결과 매 영상마다 같은 종류의 사고가 되풀이됐다 —
 *   ① 범용 클래스명 충돌(.card 가 다섯 파일에 · 합본에서 마지막 규칙이 이김)
 *   ② 자막 좌표 드리프트(프레임마다 top/width 가 달라짐)
 *   ③ 세이프존 역행(옛 영상 CSS 를 복사 → 개정된 데드존 위반)
 *   ④ 대비 위반(크림 위 골드 1.38:1 · 초록 위 관보레드 1.02:1)
 *   ⑤ 컷 경계에서 트윈이 잘림(트윈 끝 > 컷 길이)
 *   ⑥ 정지 화면(트윈이 없는 요소)
 * 이 여섯은 사람이 조심할 문제가 아니라 컴파일러가 보증할 문제다. 전부 여기서 막는다.
 *
 * 사용: node pipeline/hf-compile.mjs <프로젝트> [--check]
 *   입력  projects/<p>/hyperframes/choreo.json   ← 안무만 적는다 (좌표·색·폰트 안 적는다)
 *         projects/<p>/hyperframes/index.html    ← 컷 순서·시작·길이의 유일한 출처
 *         projects/<p>/hyperframes/audio_meta.json ← 자막·어절 온셋의 유일한 출처
 *   출력  projects/<p>/hyperframes/compositions/frames/NN-slug.html
 */
import fs from 'node:fs';
import path from 'node:path';
import {BRAND,FONT_STACK,fontFace,hasChannelLockup} from './lib/brand.mjs';
import {resolveProject as resolveSharedProject} from './lib/project.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/* 컴파일러가 구운 파일에만 들어가는 표지. 이게 없는 파일은 워커가 손으로 쓴 것이므로 덮지 않는다. */
const GEN_MARK = 'pipeline/hf-compile.mjs 가 choreo.json 에서 생성했다';
const FORCE = process.argv.includes('--force');
const keptFiles = [];

// ───────────────────────── 브랜드 상수 (docs/12-brand.md) ─────────────────────────
// Legacy choreo keys remain aliases, so old scene descriptions still parse.
const C = {...BRAND.colors, green:BRAND.colors.ink, greenDeep:BRAND.colors.ink,
  gold:BRAND.colors.warm, red:BRAND.colors.accent, dim:BRAND.colors.line};
const lightInk = {body:C.ink, accent:C.accent, mute:C.muted, strike:C.accent};
const darkInk = {body:C.paper, accent:C.warm, mute:C.line, strike:C.warm};
const INK = {paper:lightInk, white:lightInk, warm:lightInk, green:darkInk,
  ink:darkInk, accent:darkInk};
const FONT = {head:FONT_STACK, amount:FONT_STACK, body:FONT_STACK};

// ───────────────── 화면 구조 (docs/09-safezone.md 2026-09-15 개정 — 밴드 + 백지 무대) ─────────────────
// 상단 딥그린 밴드 y0~360 (락업 y220~330 h110 · 무대와 30px) · ⭐ 백지 무대 y360~1360 전폭(머무는 자리 x60~960)
// · 갭 12 · 하단 딥그린 밴드 y1372~1920 (자막 ≤2줄 · 바닥 1540)
//   사용자: "초록색 배경으로 모션을 하려니 제약이 많고 어렵다 — 상하는 우리 컨셉, 가운데 모션 영역은 백지에서 자유롭게"
const G = {
  W: 1080, H: 1920,
  safeX: 60, safeW: 900, safeY: 360, safeH: 1000,
  stage: { y: 360, h: 1000, pad: 56 }, // 백지 무대 — 전폭. 🔴 안쪽 여백 56 — **정착한** 콘텐츠는 가장자리에 붙지 않는다 (모션 통과는 자유 · 2026-09-15 사용자 지시)
  zone: {
    head:   { y: 380,  h: 84  },   // 킥커 / 헤드라인
    stage:  { y: 486,  h: 534 },   // 주무대 — 카드·표·제품
    amount: { y: 1040, h: 152 },   // 대형 금액
    note:   { y: 1214, h: 122 },   // 소자·배지
  },
  caption: { x: 120, w: 840, bottom: 380, minH: 88, fs: 56 },   // 하단 밴드 안 · ≤2줄 (2줄 h168 → 상단 y1372)
};
// 🔴 배치는 세이프존보다 8px 안쪽에 한다 — 미세 부유(±6px)가 존을 밀어내면 zone-check 하드 실패다.
//    검증은 여전히 세이프존(60~960 · 360~1370) 으로 한다.
const PAD_F = 8;
G.cx = G.safeX + PAD_F; G.cw = G.safeW - PAD_F * 2;
G.cy = G.safeY + G.stage.pad; G.ch = G.safeH - G.stage.pad * 2;   // 세로는 무대 여백 56 (y416~1304) — 밴드 경계에 붙지 않게
const CX = G.cx + G.cw / 2;

/** 쓰지 않는 존을 주무대가 흡수한다.
 *  🔴 고정 격자를 쓰면 amount 가 없는 컷에서 화면 아래 152px 이 통째로 빈다(00010 사용자 지적). */
function computeZones(s) {
  // 🔴 note 는 2026-09-15 에 삭제됐다(캡션과 중복되는 회색 잔글씨). 구역도 예약하지 않는다 —
  //    남겨 두면 122px 띠가 빈 채 남고 주무대가 그만큼 작아진다. 그 높이는 stage 가 흡수한다.
  const FIXED = { head: 84, amount: 152 }, GAP = 26;
  const use = { head: !!s.head, amount: !!s.amount };
  let fixed = 0, n = 1;                       // stage 는 언제나 쓴다
  for (const k of ['head', 'amount']) if (use[k]) { fixed += FIXED[k]; n++; }
  const PAD = 20;                              // 키프아웃 바로 아래 여유
  const stageH = G.ch - PAD - fixed - GAP * (n - 1);
  const Z = {}; let y = G.cy + PAD;
  if (use.head)   { Z.head   = { y, h: FIXED.head };   y += FIXED.head + GAP; }
  Z.stage = { y, h: stageH }; y += stageH + GAP;
  if (use.amount) { Z.amount = { y, h: FIXED.amount }; }
  return Z;
}      // 510 — 캔버스 540 이 아니다

// ───────────────────────── 기본 이징 — 샷마다 자유롭게 덮어쓴다 ─────────────────────────
const EASE = { primary: 'expo.out', secondary: 'back.out(1.7)', micro: 'sine.inOut', press: 'expo.in' };

// 🔴 **프레임당**이다. 영상 전체 한도가 아니다 (2026-09-12 사고).
//    00011 에서 이 값을 「영상 전체 4회」로 읽고 코덱스에 그렇게 지시했더니, 이동 동사(in·shift·wipe)가
//    22프레임 중 4곳에만 허용돼 나머지 18프레임이 제자리 확대(punch)와 색 변화(tint)만 하게 됐다 —
//    **이동 중앙값 0px**. 사용자가 "딱딱하고 단순하다"고 반려했다. 660행이 프레임별로 검사한다.

// ───────────────────────── 유틸 ─────────────────────────
const die = (m) => { console.error('🔴 ' + m); process.exit(1); };
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const px = (n) => `${Math.round(n * 100) / 100}px`;

function resolveProject(arg) { return resolveSharedProject(arg).dir; }

// index.html 이 컷 순서·시작·길이의 유일한 출처다. choreo 가 dur 을 적지 못하게 한다.
function readTracks(hfDir) {
  const html = fs.readFileSync(path.join(hfDir, 'index.html'), 'utf8');
  const out = [];
  const re = /data-composition-id="([^"]+)"\s+data-composition-src="compositions\/frames\/([^"]+)"\s+data-start="([\d.]+)"\s+data-duration="([\d.]+)"/g;
  let m;
  while ((m = re.exec(html))) out.push({ comp: m[1], file: m[2], start: +m[3], dur: +m[4] });
  return out;
}

// ───────────────────────── 엘리먼트 빌더 ─────────────────────────
// 반환: {id, css:[[선택자접미, 선언]], html}
class Frame {
  constructor(n, comp, dur, ground) {
    this.n = String(n).padStart(2, '0');
    this.P = `#f${this.n}`;
    this.comp = comp; this.dur = dur;
    this.ground = ground || 'paper';     // 🔴 무대 기본 = 크림(백지). 'green' 은 강조용 반전 (2026-09-15)
    this.css = []; this.html = []; this.tw = [];
    this.stack = []; this.parent = {}; this.groups = new Set();
    this.moved = new Set();       // 트윈이 붙은 요소 — 나머지는 hold 를 자동 부여
    this.impacts = 0;
    this.boxes = {};              // 겹침 검사용
  }
  ink(role, on) { return INK[on || this.ground][role]; }
  origin() { return this.stack.length ? this.boxes[this.stack[this.stack.length - 1]] : { x: 0, y: 0 }; }
  /** box 는 언제나 절대좌표. 그룹 안에 있으면 emit 할 때만 부모 기준으로 환산한다.
   *  🔴 이게 없으면 카드 판만 움직이고 그 안의 글자는 제자리에 남는다(00010 실측 사고). */
  el(id, box, extra, inner, tag, attrs) {
    const o = this.origin();
    const decl = `position:absolute;left:${px(box.x - o.x)};top:${px(box.y - o.y)};width:${px(box.w)};` +
      (box.h != null ? `height:${px(box.h)};` : '') + (extra || '');
    this.css.push([`#f${this.n}-${id}`, decl]);
    const T = tag || 'div';
    const pad = '  '.repeat(this.stack.length + 1);
    this.html.push(`${pad}<${T} id="f${this.n}-${id}" data-hf-id="f${this.n}-${id}"${attrs || ''}>${inner || ''}${T === 'img' ? '' : `</${T}>`}`);
    this.boxes[id] = box;
    this.parent[id] = this.stack[this.stack.length - 1] || null;
    return id;
  }
  group(id, box, extra, fn) {
    const o = this.origin();
    const decl = `position:absolute;left:${px(box.x - o.x)};top:${px(box.y - o.y)};width:${px(box.w)};height:${px(box.h)};` + (extra || '');
    this.css.push([`#f${this.n}-${id}`, decl]);
    const pad = '  '.repeat(this.stack.length + 1);
    this.html.push(`${pad}<div id="f${this.n}-${id}" data-hf-id="f${this.n}-${id}">`);
    this.boxes[id] = box; this.parent[id] = this.stack[this.stack.length - 1] || null;
    this.groups.add(id);
    this.stack.push(id);
    fn();
    this.stack.pop();
    this.html.push(`${pad}</div>`);
    return id;
  }
  isAncestor(a, b) { let p = this.parent[b]; while (p) { if (p === a) return true; p = this.parent[p]; } return false; }
  at(t, target, vars, dur, ease) {
    // 저자가 지정한 타이밍을 보존한다. 짧은 히트·컷 경계를 통과하는 트윈도 유효하다.
    if (!Number.isFinite(t) || t < 0 || !Number.isFinite(dur ?? 0) || (dur ?? 0) < 0)
      die(`F${this.n}: 트윈 시작·길이는 유한한 0 이상의 초여야 한다`);
    const v = { ...vars, duration: dur ?? 0 };
    if (ease) v.ease = ease;
    this.tw.push(`  tl.to(P+" #f${this.n}-${target}",${JSON.stringify(v).replace(/"([a-zA-Z]\w*)":/g, '$1:')},${t});`);
    this.moved.add(target);
    this.last = this.last || {}; this.used = this.used || {};
    this.last[target] = Math.max(this.last[target] || 0, t + (dur || 0));
    (this.used[target] = this.used[target] || new Set());
    for (const k of Object.keys(vars)) this.used[target].add(k);
  }
  set(target, vars) {
    this.tw.push(`  gsap.set(P+" #f${this.n}-${target}",${JSON.stringify(vars).replace(/"([a-zA-Z]\w*)":/g, '$1:')});`);
  }
}

// ───────────────────────── 슬롯 렌더러 ─────────────────────────
function slotText(F, id, spec, box, opt = {}) {
  const s = typeof spec === 'string' ? { t: spec } : spec;
  const on = opt.on || F.ground;
  const fs = s.fs || opt.fs || 34;
  const font = s.font || opt.font || FONT.body;
  const color = s.color ? (C[s.color] || s.color) : F.ink(opt.role || 'body', on);
  const extra = (box.h ? 'display:flex;align-items:center;justify-content:center;' : '') +
    `text-align:center;font-family:${font};font-size:${px(fs)};font-weight:${s.w || opt.w || (id === 'amount' ? BRAND.type.numberWeight : id === 'head' ? BRAND.type.headlineWeight : BRAND.type.bodyWeight)};font-variant-numeric:tabular-nums lining-nums;` +
    `color:${color};line-height:1.22;word-break:normal;letter-spacing:${s.ls ?? -0.5}px`;
  return F.el(id, box, extra, esc(s.t));
}
/* 판 색 — 무대가 크림이면 흰 카드 + 딥그린 3px 테, 무대가 반전(딥그린)이면 크림 카드 (2026-09-15) */
function plateCss(F, r = 24) {
  return F.ground === 'green' ? `background:${C.paper};border-radius:${px(r)}`
                              : `background:${C.white};border:3px solid ${C.greenDeep};border-radius:${px(r)}`;
}
function slotPlate(F, id, box, r = 24) {
  return F.el(id, box, plateCss(F, r));
}
// 🔴 애플 CDN PNG 는 제품이 캔버스의 28~41%뿐이라 contain 으로 맞추면 깨알이 된다(00010 실측).
//    알파를 잘라낸 -fit 판이 있으면 자동으로 그걸 쓴다.
let PRODDIR = [], PRODDIRPATH = null;
const _ar = {};
/** PNG IHDR 에서 가로세로를 직접 읽는다 — 이미지 비율을 모르면 제품이 상자 안에서 위아래로 뜬다. */
function aspect(file) {
  if (file in _ar) return _ar[file];
  try {
    const b = fs.readFileSync(path.join(PRODDIRPATH, file));
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    return (_ar[file] = h / w);
  } catch { return (_ar[file] = 1); }
}
function prodFile(src) { return PRODDIR.includes(`${src}-fit.png`) ? `${src}-fit` : src; }
/** 폭에 맞췄을 때의 자연 높이. 상자를 이보다 크게 잡으면 그만큼 빈다. */
function prodNaturalH(src, w) { return Math.round(w * aspect(prodFile(src) + '.png')); }
function slotProduct(F, id, src, box) {
  /* 안쪽 여백 8% — 없으면 `contain` 이 상자 가장자리까지 채운다. bbq 마지막 컷의 로고가 「박스에 꽉 찼다」(2026-09-15). */
  return F.el(id, box, 'display:flex;align-items:center;justify-content:center;overflow:hidden;box-sizing:border-box;padding:8%',
    `<img data-hf-id="f${F.n}-${id}-img" src="assets/product/${prodFile(src)}.png" alt="" style="width:100%;height:100%;object-fit:contain">`);
}
const iconTint = F => (['green','ink','accent'].includes(F.ground) ? 'brightness(0) invert(1)' : 'brightness(0)');
/* 🔴 모티프 — 주제에서 온 형태 하나가 프레임마다 변주된다 (2026-09-15 · docs/13 다이소 규칙 2).
   사용자 지적: "화면이 폰트/박스/아이콘/로고 밖에 없잖아?" — 컴파일러에 도형 슬롯이 아예 없었다.
   다이소는 로고의 원(○)을 다섯 번 변주했고, 창작자 노하우는 **"모티프를 이름으로 지정하지 않으면 밋밋하게 나온다"** 였다.
   장식이므로 그라운드 바로 위(내용 뒤)에 깔고, 겹침·세이프존 검사에서 제외한다 — 프레임 밖으로 넘치는 것이 설계다. */
function slotMotif(F, m) {
  if (!m) return;
  const list = Array.isArray(m) ? m : [m];
  list.forEach((d, i) => {
    const size = d.size || 420, half = size / 2;
    const col = C[d.color] || d.color || C.gold;
    const op = d.opacity ?? 0.14, rot = d.rot || 0;
    /* 🔴 모티프도 세이프존 안에 둔다 (2026-09-15 · zone-check 336프레임 위반).
       프레임 밖 걸침이 멋있어 보였지만 ① 하단 모티프가 자막존(y1350~1450)을 덮었고
       ② zone-check 는 화소만 보므로 장식과 정보를 구분하지 못한다. 안쪽에 온전히 두면 잘리지도 않는다. */
    const shape = d.shape || 'half';
    const H = shape === 'bar' ? (d.weight || 26) : (shape === 'half' ? half : size);
    /* 🔴 회전 반경만큼 여유를 둔다 (2026-09-15 · zone-check 실측 336→14프레임 추적).
       반원이 θ 회전하면 바운딩 반폭 = (w/2)|cosθ| + (h/2)|sinθ| — 최대 size*0.75.
       배치만 존 안에 넣어도 회전하면 넘는다. 크기의 3/8 을 여유로 잡으면 어떤 각도에서도 안전하다. */
    const M = Math.round(size * 0.5) + 20;   // 회전 최대 반경(≈size*0.5)을 통째로 여유로 잡는다
    const X0 = G.cx + M, X1 = G.cx + G.cw - size - M;
    const Y0 = G.cy + M, Y1 = G.cy + G.ch - H - M;          // 정착 자리는 무대 여백 안 — 회전으로 넘는 건 통과다
    const POS = {
      tl: [X0, Y0],            tr: [X1, Y0],
      bl: [X0, Y1],            br: [X1, Y1],
      c:  [(G.W - size) / 2, Math.round((Y0 + Y1) / 2)],
      cl: [X0, Math.round((Y0 + Y1) / 2)], cr: [X1, Math.round((Y0 + Y1) / 2)],
    };
    const [x, y] = POS[d.pos] || POS.tr;
    let css;
    if (shape === 'ring')      css = `border:${d.weight || 18}px solid ${col};border-radius:50%`;
    else if (shape === 'dot')  css = `background:${col};border-radius:50%`;
    else if (shape === 'bar')  css = `background:${col};border-radius:${px(size)}`;
    else /* half */            css = `background:${col};border-radius:${px(half)} ${px(half)} 0 0`;
    F.el('motif' + (i || ''), { x: Math.round(x), y: Math.round(y), w: size, h: H },
      `${css};opacity:${op};transform:rotate(${rot}deg);pointer-events:none`);
  });
}
function slotIcon(F, id, name, box, tint) {
  return F.el(id, box, `filter:${tint || iconTint(F)}`, '', 'img', ` src="assets/icons/${name}.svg" alt=""`);
}
// 카드 = 판 + 내용물을 한 덩어리로 묶는다. 카드를 움직이면 안의 글자도 같이 간다.
function slotCard(F, id, c, box, S, shared) {
  // 위에서부터 쌓고, 남는 높이는 제품 사진이 먹는다 → 카드가 커져도 내부가 비지 않는다
  const padT = S.padT, gap = S.gap, padB = S.padB;
  const lblH = c.label ? S.lblH : 0, priH = c.amount ? S.priH : 0, bgH = c.badge ? S.bgH : 0;
  let fixed = padT + padB;
  for (const h of [lblH, priH, bgH]) if (h) fixed += h + gap;
  const prodW = box.w - S.prodX * 2;
  // 🔴 남는 높이를 제품에 다 주면 이미지가 비율대로만 커져서 위아래가 빈다(00010 실측).
  //    자연 높이로 잡고, 남는 만큼은 내용 블록을 가운데로 밀어 균형을 맞춘다.
  const prodH = shared ? shared.prodH : (c.product ? Math.min(Math.max(120, box.h - fixed), prodNaturalH(c.product, prodW)) : 0);
  const contentH = fixed + (prodH ? prodH + gap : 0) - gap;
  const slack = shared ? shared.slack : Math.max(0, box.h - contentH);
  // 🔴 판 색을 크림으로 못 박으면 **검은 배경 제품 사진**이 카드 안에서 사각형으로 튄다
  //    (2026-09-13 · 00012: Apple 보도자료 사진은 배경이 검다. 배경 제거는 저작권 변형이라 금지).
  //    `bg` 를 주면 그 색으로 칠하고 글자를 밝은 쪽으로 뒤집는다. 안 주면 종전대로 크림.
  const cardBg = c.bg || (F.ground === 'green' ? C.paper : C.white), onRole = c.bg ? 'green' : 'paper';
  F.group(id, box, `background:${cardBg};border-radius:24px;opacity:${c.opacity ?? 1}`, () => {
    const sfx = id.replace(/^card/, '');
    let y = box.y + padT + Math.round(slack / 2);
    if (c.label)   { slotText(F, 'label' + sfx, c.label, { x: box.x + S.padX, y, w: box.w - S.padX * 2, h: lblH }, { on: onRole, fs: S.lblFs, w: 800 }); y += lblH + gap; }
    if (c.product) { slotProduct(F, 'prod' + sfx, c.product, { x: box.x + S.prodX, y, w: prodW, h: prodH }); y += prodH + gap; }
    if (c.amount)  {
      slotText(F, 'price' + sfx, c.amount, { x: box.x + 8, y, w: box.w - 16, h: priH }, { on: onRole, fs: c.fs || S.priFs, font: FONT.amount, w: BRAND.type.numberWeight });
      if (c.icon) slotIcon(F, 'icon' + sfx, c.icon, { x: box.x + box.w - 52, y: box.y + 24, w: 36, h: 36 }, 'none');
      y += priH + gap;
    }
    if (c.badge)   {
      // 색면 알약 — 글자만 뜨면 화면 변화가 너무 작아 모션이 안 읽힌다(00010 실측 0.1%).
      F.el('badge' + sfx, { x: box.x + S.bgX, y, w: box.w - S.bgX * 2, h: bgH },
        `background:${C.red};border-radius:${px(bgH / 2)};display:flex;align-items:center;justify-content:center;` +
        `text-align:center;font-family:${FONT.body};font-size:${px(S.bgFs)};font-weight:800;color:${C.paper};letter-spacing:0px`,
        esc(typeof c.badge === 'string' ? c.badge : String(c.badge)));
    }
  });
}
const head = (F, s) => s.head && slotText(F, 'head', s.head, { x: G.cx, y: F.Z.head.y, w: G.cw, h: F.Z.head.h }, { fs: 34, w: BRAND.type.headlineWeight, role: 'mute' });
const tail = (F, s, defFs) => {
  if (s.amount) slotText(F, 'amount', s.amount, { x: G.cx, y: F.Z.amount.y, w: G.cw, h: F.Z.amount.h }, { fs: s.amountFs || defFs || 132, font: FONT.amount, role: 'accent', w: BRAND.type.numberWeight });
  /* 🔴 `note` 슬롯을 **삭제했다** (2026-09-15 · bbq 시트 실측). 프레임마다 32px 회색 줄이 하나 더 붙어
     「락업 / 캡션 / 요소 / 큰 숫자 / 라벨 / note / 자막」 **7단 세로 쌓기**가 됐고 사용자가 「초보 텍스트 모션」이라 했다.
     note 는 자막(나레이션 전사)과 같은 말을 한 번 더 하는 자리였다 — 「9월 17일까지」가 note 에도 자막에도 있었다.
     프로 문법(docs/13 다이소 8규칙 ③)은 **큰 한글 하나 + 작은 영문 캡션 하나, 한 쌍**이다. 줄을 빼야 포스터가 된다.
     choreo 에 note 가 남아 있어도 조용히 무시한다 — 컴파일을 깨지 않는다. */
};

// ───────────────────────── 레이아웃 템플릿 ─────────────────────────
// 자유 좌표가 없다. 슬롯만 채운다 → 겹침·걸침이 구조적으로 불가능하다.
/** 나란히 선 카드들이 같은 행 높이를 쓰게 한다 — 안 그러면 제품 비율 차이로 가격이 어긋난 높이에 선다. */
function sharedCard(cards, cw, boxH, S) {
  const prodW = cw - S.prodX * 2;
  let fixed = S.padT + S.padB;
  const any = (k) => cards.some((c) => c[k]);
  if (any('label'))  fixed += S.lblH + S.gap;
  if (any('amount')) fixed += S.priH + S.gap;
  if (any('badge'))  fixed += S.bgH + S.gap;
  const natural = cards.filter((c) => c.product).map((c) => prodNaturalH(c.product, prodW));
  const prodH = natural.length ? Math.min(Math.max(120, boxH - fixed), Math.min(...natural)) : 0;
  const contentH = fixed + (prodH ? prodH + S.gap : 0) - S.gap;
  return { prodH, contentH, slack: Math.max(0, boxH - contentH) };
}

const DUO_S  = { padX: 16, padT: 24, padB: 22, gap: 14, lblH: 76, lblFs: 30, prodX: 46, priH: 92, priFs: 66, bgX: 50, bgH: 74, bgFs: 30 };
const TRIO_S = { padX: 10, padT: 20, padB: 18, gap: 12, lblH: 72, lblFs: 26, prodX: 34, priH: 78, priFs: 46, bgX: 18, bgH: 56, bgFs: 24 };

const LAYOUT = {
  anchor(F, s) {
    const Z = F.Z; head(F, s);
    if (s.days) {
      const gap = 20, w = (G.cw - gap * 3) / 4, h = 150;
      // 🔴 그룹 높이 = 칸 높이. 전엔 Z.stage.h 라 686px 그룹에 150px 칸만 있었다 (2026-09-15)
      F.group('plate', { x: G.cx, y: Z.stage.y, w: G.cw, h }, '', () => {
        s.days.forEach((day, i) => {
          const box = { x: G.cx + i * (w + gap), y: Z.stage.y, w, h };
          F.group('day' + i, box, plateCss(F), () => {
            slotText(F, 'date' + i, String(day), box, { on: 'paper', fs: 56 });
          });
        });
      });
    } else if (s.stage) {
      const pw = 620, x = CX - pw / 2;
      const lh = s.stage.label ? 92 : 0;
      /* 🔴 판 높이 = 내용 높이 (2026-09-15 · "bbq 로고 블랙 판이 로고보다 훨씬 크다").
         전엔 ph = Z.stage.h 라 686px 판에 내용이 13% 만 찼다. */
      const _need = s.stage.product ? prodNaturalH(s.stage.product, pw - 140)
                                    : Math.round((s.stage.fs || 56) * 1.9);
      const ph = Math.min(Z.stage.h, _need + 48 + lh);
      // `bg` — 검은 배경 제품 사진을 담을 때 판을 어둡게 (slotCard 와 같은 규약)
      const pBg = s.stage.bg || (F.ground === 'green' ? C.paper : C.white), pOn = s.stage.bg ? 'green' : 'paper';
      F.group('plate', { x, y: Z.stage.y, w: pw, h: ph }, `background:${pBg};border-radius:24px`, () => {
        const inH = ph - 48 - lh;
        const naH = s.stage.product ? Math.min(inH, prodNaturalH(s.stage.product, pw - 140)) : inH;
        const naY = Z.stage.y + 24 + Math.round((inH - naH) / 2);
        if (s.stage.product) slotProduct(F, 'product', s.stage.product, { x: x + 70, y: naY, w: pw - 140, h: naH });
        if (s.stage.text)    slotText(F, 'stagetext', s.stage.text, { x: x + 40, y: Z.stage.y + 24, w: pw - 80, h: inH }, { on: pOn, fs: s.stage.fs || 56, w: BRAND.type.headlineWeight, font: FONT.head });
        if (s.stage.label)   slotText(F, 'stagelabel', s.stage.label, { x, y: Z.stage.y + 24 + inH, w: pw, h: lh }, { on: pOn, fs: 38, w: 800 });
      });
    }
    tail(F, s, 150);
  },
  duo(F, s) {
    const Z = F.Z, gap = 60, cw = Math.floor((G.cw - gap) / 2); head(F, s);
    const xs = { L: G.cx, R: G.cx + cw + gap };
    const sh = sharedCard(['L', 'R'].map((k) => s['card' + k]).filter(Boolean), cw, Z.stage.h, DUO_S);
    /* 🔴 카드 높이 = 내용 높이 (2026-09-15 · bbq 시트 사용자 지적 "박스가 3배 크다").
       전엔 Z.stage.h 로 늘려 놓고 slack 을 반으로 나눠 내용을 가운데로 밀었다 — 판만 크고 속은 비었다. */
    const CARD_PAD = 72;                                   // 🔴 내용에 맞추되 숨 쉴 틈은 남긴다 (2026-09-15 · "너무 타이트하게 붙어있어")
    const cardH = Math.min(Z.stage.h, sh.contentH + CARD_PAD);
    const sh2 = { ...sh, slack: Math.max(0, cardH - sh.contentH) };
    for (const side of ['L', 'R']) {
      const c = s['card' + side]; if (!c) continue;
      slotCard(F, 'card' + side, c, { x: xs[side], y: Z.stage.y, w: cw, h: cardH }, DUO_S, sh2);
    }
    tail(F, s);
  },
  trio(F, s) {
    const Z = F.Z, gap = 30, cw = Math.floor((G.cw - gap * 2) / 3); head(F, s);
    const sh = sharedCard(['A','B','C'].map((k) => s['card' + k]).filter(Boolean), cw, Z.stage.h, TRIO_S);
    const cardH3 = Math.min(Z.stage.h, sh.contentH + 72);     // 판 = 내용 높이 + 여백 (위 duo 와 같은 규칙)
    const sh3 = { ...sh, slack: Math.max(0, cardH3 - sh.contentH) };
    ['A', 'B', 'C'].forEach((k, i) => {
      const c = s['card' + k]; if (!c) return;
      slotCard(F, 'card' + k, c, { x: G.cx + i * (cw + gap), y: Z.stage.y, w: cw, h: cardH3 }, TRIO_S, sh3);
    });
    tail(F, s);
  },
  table(F, s) {
    /* 🔴 삭제 (2026-09-15 · 00016 「최악」). 이 레이아웃이 만든 것 = 크림 판에 38px 회색 행 4줄 —
       게이트 B 의 반려 열(「회색 잔글씨 3~4줄 = 슬라이드」)을 컴파일러가 직접 굽고 있었다.
       00016 은 이 판 하나가 12.85초를 차지했고 행이 2.75초부터 하나씩 트리클돼 **빈 판 → 정지 표**가 됐다.
       표의 행은 각각 비트다 — `stat`(값 하나) 또는 `duo`(둘 비교)로 쪼개고, 판은 워커가 그림으로 만든다. */
    console.error(`  ⚠️ F${F.n}: table 레이아웃 — 보고용이다 (2026-09-16 제약 해제)`);
    const Z = F.Z, rows = s.rows || []; head(F, s);
    const padY = 30, hdrH = (s.colA || s.colB) ? 62 : 0;
    const rowH = Math.max(104, Math.min(150, (Z.stage.h - padY * 2 - hdrH) / Math.max(1, rows.length)));
    const need = padY * 2 + hdrH + rowH * Math.max(1, rows.length);
    const plateH = Math.min(Z.stage.h, Math.max(need, Math.round(Z.stage.h * 0.6)));
    const plateY = Z.stage.y + Math.round((Z.stage.h - plateH) / 2);
    const rowsY = plateY + hdrH + Math.round((plateH - hdrH - rowH * Math.max(1, rows.length)) / 2);
    F.group('plate', { x: G.cx, y: plateY, w: G.cw, h: plateH }, `background:${C.paper};border-radius:24px;${s.border ? `border:4px solid ${C[s.border] || s.border};` : ''}`, () => {
      if (s.colA) slotText(F, 'colA', s.colA, { x: G.cx + 500, y: plateY + 14, w: 180, h: 56 }, { on: 'paper', fs: 26, w: 800, role: 'mute' });
      if (s.colB) slotText(F, 'colB', s.colB, { x: G.cx + 690, y: plateY + 14, w: 190, h: 56 }, { on: 'paper', fs: 26, w: 800, role: 'mute' });
      rows.forEach((r, i) => {
        const y = rowsY + i * rowH, h = rowH - 10;
        slotText(F, `rl${i}`, r.label, { x: G.cx + 30, y, w: 450, h }, { on: 'paper', fs: 38, w: 800 });
        const mark = (v) => (v === true ? '✓' : v === false ? '✕' : v);
        if (r.a !== undefined) slotText(F, `ra${i}`, String(mark(r.a)), { x: G.cx + 500, y, w: 180, h }, { on: 'paper', fs: typeof r.a === 'boolean' ? 62 : 36, w: 800, role: r.a === false ? 'accent' : 'body' });
        if (r.b !== undefined) slotText(F, `rb${i}`, String(mark(r.b)), { x: G.cx + 690, y, w: 190, h }, { on: 'paper', fs: typeof r.b === 'boolean' ? 62 : 36, w: 800, role: r.b === false ? 'accent' : 'body' });
        if (r.strike) F.el(`rs${i}`, { x: G.cx + 30, y: y + h / 2 - 3, w: 450, h: 6 }, `background:${C.red};transform-origin:left center`);
      });
    });
    tail(F, s);
  },
  stat(F, s) {
    const Z = F.Z; head(F, s);
    if (s.icon) slotIcon(F, 'icon', s.icon, { x: CX - 56, y: Z.stage.y + 20, w: 112, h: 112 });
    const top = s.product ? Math.min(240, Math.round(Z.stage.h * 0.4)) : 140;
    if (s.product) {
      const h = top - 20, w = Math.min(500, Math.round(h / aspect(prodFile(s.product) + '.png')));
      F.group('plate', { x: CX - w / 2, y: Z.stage.y, w, h }, `background:#111;border-radius:24px;overflow:hidden`, () => {
        slotProduct(F, 'product', s.product, { x: CX - w / 2, y: Z.stage.y, w, h });
      });
    }
    const vH = Z.stage.h - top - (s.label ? 120 : 10);
    slotText(F, 'value', s.value, { x: G.cx, y: Z.stage.y + top, w: G.cw, h: vH }, { fs: s.fs || 200, font: FONT.amount, role: 'accent', w: BRAND.type.numberWeight });
    if (s.label) slotText(F, 'vlabel', s.label, { x: G.cx, y: Z.stage.y + top + vH + 16, w: G.cw, h: 100 }, { fs: 42, font: FONT.head, w: 700 });
    tail(F, s, 120);
  },
  verdict(F, s) {
    const Z = F.Z; head(F, s);
    const pH = Math.round(Z.stage.h * 0.34);
    F.group('plate', { x: G.cx, y: Z.stage.y, w: G.cw, h: pH }, plateCss(F), () => {
      slotText(F, 'who', s.who, { x: G.cx + 40, y: Z.stage.y + 24, w: G.cw - 80, h: pH - 48 }, { on: 'paper', fs: 58, font: FONT.head, w: 800 });
    });
    const iy = Z.stage.y + pH + 40;
    if (s.icon) slotIcon(F, 'icon', s.icon, { x: CX - 52, y: iy, w: 104, h: 104 });
    const cy = iy + (s.icon ? 128 : 0);
    slotText(F, 'call', s.call, { x: G.cx, y: cy, w: G.cw, h: Z.stage.y + Z.stage.h - cy }, { fs: s.fs || 72, font: FONT.head, role: 'accent', w: BRAND.type.headlineWeight });
    tail(F, s, 120);
  },
  statement(F, s) {
    const Z = F.Z; head(F, s);
    const pw = s.productWidth || 500;
    const ph = s.product ? Math.min(Math.round(Z.stage.h * 0.62), prodNaturalH(s.product, pw)) : 0;
    if (s.product) {
      const draw = () => slotProduct(F, 'product', s.product, { x: CX - pw / 2, y: Z.stage.y, w: pw, h: ph });
      if (s.productBg) F.group('productPlate', { x: CX - pw / 2 - 16, y: Z.stage.y, w: pw + 32, h: ph }, `background:${C[s.productBg] || s.productBg};border-radius:16px`, draw);
      else draw();
    }
    slotText(F, 'line', s.line, { x: G.cx, y: Z.stage.y + ph + (s.product ? 24 : 0), w: G.cw, h: Z.stage.h - ph - (s.product ? 24 : 0) },
      { fs: s.fs || 72, font: FONT.head, w: BRAND.type.headlineWeight });
    tail(F, s, 150);
  },
};


/** 슬롯 → 내용 지문. 앞 컷과 **내용까지 같은** 요소는 이미 화면에 있으므로 다시 등장시키지 않는다.
 *  🔴 00010 실측: 이런 재등장이 23건이었다 — 컷이 바뀔 때마다 같은 물건이 또 튀어 들어와 끊겨 보인다. */
function slotSig(spec) {
  const m = {}, s = spec.slots || {};
  const put = (k, v) => { if (v !== undefined && v !== null && v !== '') m[k] = String(v); };
  for (const [k, v] of Object.entries(s)) {
    if (k === 'rows') {
      (v || []).forEach((r, i) => { put(`rl${i}`, r.label); put(`ra${i}`, r.a); put(`rb${i}`, r.b); put(`rs${i}`, r.strike && r.label); });
    } else if (k.startsWith('card')) {
      const x = k.slice(4);
      put(k, JSON.stringify(v));
      put('label' + x, v.label); put('prod' + x, v.product); put('price' + x, v.amount); put('badge' + x, v.badge);
    } else if (k === 'stage') {
      put('plate', JSON.stringify(v));
      put('product', v.product); put('stagelabel', v.label); put('stagetext', v.text);
    } else if (k === 'label') { put('vlabel', v); }
    else if (k === 'who' || k === 'call') { put(k, v); put('plate', (s.who || '') + '|' + (s.call || '')); }
    else put(k, v);
  }
  return m;
}

// ───────────────────────── 샷 동사 → GSAP ─────────────────────────
const DIR = { up: ['y', -1], down: ['y', 1], left: ['x', -1], right: ['x', 1] };
const BIG = new Set(['in', 'slam', 'shift', 'wipe', 'roll', 'fill']);

const ENTER = new Set(['in', 'rise', 'pop', 'slam', 'wipe', 'fill', 'strike']);

/** 🔴 컷 첫 프레임이 비면 경계에서 화면이 깜빡인다(00010 render-gate 6곳 검출).
 *  모든 슬롯이 진입 애니메이션이면, 가장 크고 가장 먼저 들어오는 하나를 **보이는 채로** 등장시킨다.
 *  움직임은 그대로 두고 투명도만 뺀다 — 앞 컷에서 이어지는 느낌이 살아난다. */
function guardFirstFrame(F, shots) {
  const slots = Object.keys(F.boxes);
  if (!slots.length) return null;
  const entering = new Set(shots.filter((x) => ENTER.has(x.verb)).map((x) => x.el));
  if (slots.some((id) => !entering.has(id) && !F.parent[id])) return null;   // 이미 하나는 보인다
  let cand = shots.filter((x) => ENTER.has(x.verb));
  const onStage = cand.filter((x) => !SIDE.has(x.el) && F.boxes[x.el]);
  if (onStage.length) cand = onStage;              // 🔴 헤드존 글자만 남으면 화면은 여전히 비어 보인다
  if (!cand.length) return null;
  const tMin = Math.min(...cand.map((x) => +x.t));
  const early = cand.filter((x) => +x.t <= tMin + 0.15);
  const area = (id) => { const b = F.boxes[id]; return b ? b.w * (b.h || 60) : 0; };
  const keeper = early.sort((a, b) => area(b.el) - area(a.el))[0];
  keeper._visible = true;
  return keeper.el;
}

/** 🔴 주무대가 컷 앞부분에서 오래 비면 숏폼에선 그대로 이탈이다(00010 render-gate: F16 이 1.45초 공백).
 *  헤드·소자만 있고 주역이 늦게 들어오는 컷은, 주역의 **등장만** 앞으로 당긴다.
 *  강조 펀치는 어절 온셋에 그대로 둔다 — 「먼저 보여주고, 말할 때 때린다」가 정석이다. */
const SIDE = new Set(['head', 'note', 'colA', 'colB']);
function guardEmptyStage(F, shots, limit = 0.45) {
  const stage = Object.keys(F.boxes).filter((id) => !SIDE.has(id) && !F.parent[id]);
  if (!stage.length) return null;
  const area = (id) => { const b = F.boxes[id]; return b ? b.w * (b.h || 60) : 0; };
  const maxA = Math.max(...stage.map(area));
  const major = stage.filter((id) => area(id) >= maxA * 0.25);        // 주역급만 센다
  const ent = shots.filter((x) => ENTER.has(x.verb) && stage.includes(x.el));
  if (major.some((id) => !ent.some((x) => x.el === id))) return null; // 주역 하나가 처음부터 있다
  const majorEnt = ent.filter((x) => major.includes(x.el));
  if (!majorEnt.length) return null;
  const t0 = Math.min(...majorEnt.map((x) => +x.t));
  if (t0 <= limit) return null;
  const delta = t0 - 0.12;                                            // 무대 등장을 통째로 당긴다
  for (const x of ent) x.t = Math.max(0, +x.t - delta);               // 내부 스태거는 보존
  return `F${F.n} 무대등장 −${delta.toFixed(2)}s (${majorEnt.map((x) => x.el).join(',')})`;
}

/** 판(그룹)이 들어올 때 그 안의 내용물이 조금씩 늦게 따라 들어온다 — 고전적 오버래핑 액션.
 *  덩어리 하나가 '쿵' 하고 멈추는 대신 흐름이 이어져 스타카토가 줄어든다.
 *  🔴 왕복 진동이 아니다. 한 방향으로 한 번만 간다. */
function cascade(F, groupId, at, base) {
  const kids = Object.keys(F.boxes).filter((id) => F.parent[id] === groupId);
  if (!kids.length) return;
  kids.sort((a, b) => (F.boxes[a].y - F.boxes[b].y) || (F.boxes[a].x - F.boxes[b].x));
  kids.forEach((id, i) => {
    const t = at + base * 0.55 + i * 0.06;
    if (t + 0.34 > F.dur) return;
    F.set(id, { y: 14, opacity: 0 });
    F.at(t, id, { y: 0, opacity: 1 }, 0.34, EASE.primary);
  });
}

function applyShot(F, sh) {
  const t = +sh.t, el = sh.el, v = sh.verb;
  const VIS = sh._visible;
  if (BIG.has(v)) F.impacts++;
  const E = sh.ease || EASE.primary;
  switch (v) {
    case 'in': {
      const [ax, sign] = DIR[sh.dir || 'left'];
      const b = F.boxes[el] || {};
      const off = ax === 'x'
        ? (sign < 0 ? (b.x ?? 0) + (b.w ?? 0) : G.W - (b.x ?? 0))
        : (sign < 0 ? (b.y ?? 0) + (b.h ?? 0) : G.H - (b.y ?? 0));
      // 생략 시에만 기본값을 고른다. 명시한 거리·길이는 보존한다.
      const allow = sh.dist ?? Math.min(420, Math.max(0, off));
      const d = allow * sign;
      if (sh.cascade && F.groups.has(el)) cascade(F, el, t, sh.dur ?? 0.52);
      F.set(el, VIS ? { [ax]: d } : { [ax]: d, opacity: 0 });
      F.at(t, el, VIS ? { [ax]: 0 } : { [ax]: 0, opacity: 1 }, sh.dur ?? 0.52, E);
      break;
    }
    case 'rise': {
      F.set(el, VIS ? { y: sh.dist ?? 36 } : { y: sh.dist ?? 36, opacity: 0 });
      F.at(t, el, VIS ? { y: 0 } : { y: 0, opacity: 1 }, sh.dur ?? 0.40, sh.ease || EASE.secondary);
      break;
    }
    case 'pop': {
      if (sh.cascade && F.groups.has(el)) cascade(F, el, t, sh.dur ?? 0.38);
      F.set(el, VIS ? { scale: sh.from ?? 0.6 } : { scale: sh.from ?? 0.6, opacity: 0 });
      F.at(t, el, VIS ? { scale: 1 } : { scale: 1, opacity: 1 }, sh.dur ?? 0.38, sh.ease || EASE.secondary);
      break;
    }
    case 'punch': {
      // 🔴 예전 구현은 0.05초 트윈 3연타였다 — 60fps 에서 3프레임짜리라 「뚝」 하고 튄다(50개 검출).
      //    정점(t)까지 매끄럽게 올라갔다가 스프링으로 내려온다. 명시한 길이는 그대로 쓴다.
      const a = sh.amp ?? 1.05;
      F.at(Math.max(0, t - 0.13), el, { scale: a }, 0.13, 'power2.out');
      F.at(t, el, { scale: 1 }, sh.dur ?? 0.44, EASE.secondary);
      break;
    }
    case 'slam': {
      const a = sh.amp ?? 1.14;
      if (sh.cascade && F.groups.has(el)) cascade(F, el, t, 0.18);
      F.set(el, VIS ? { scale: a * 1.25 } : { scale: a * 1.25, opacity: 0 });
      F.at(t, el, VIS ? { scale: a } : { scale: a, opacity: 1 }, 0.18, EASE.primary);
      F.at(t + 0.18, el, { scale: 1 }, sh.dur ?? 0.40, EASE.secondary);
      break;
    }
    case 'shift': F.at(t, el, { x: sh.dx ?? 0, y: sh.dy ?? 0 }, sh.dur ?? 0.56, E); break;
    case 'out': {
      /* 🔴 2026-09-14 사용자 지시로 **세이프존 클램프를 걷어냈다**:
           *"모션영역 안에서는 어떠한 모션도 허용하고, 시그니처모션이나 크리에이티브를 위해서는
            모션영역 밖에서 안으로 들어오는 모션도 허용"*
         옛 코드는 퇴장 거리를 **세이프존 안**으로 묶어(`dist ?? 120` · `room-2`) 요소가
         화면을 **한 번도 벗어나지 못했다.** 제자리에서 흐려질 뿐이라 퇴장이 퇴장으로 안 보였다.
         `in` 과 대칭으로 **화면 밖까지** 내보낸다.
         ⚠️ 구역 규칙은 **머무는 자리**에만 적용된다 (`docs/09-safezone.md`). 통과·진입·퇴장은 자유다 —
            그 원칙은 `docs/11-motion.md` 에 원래 있었고 코드만 안 지키고 있었다. */
      const [ax, sign] = DIR[sh.dir || 'down'];
      const b = F.boxes[el] || {};
      const off = ax === 'x'
        ? (sign < 0 ? (b.x ?? 0) + (b.w ?? 0) : G.W - (b.x ?? 0))
        : (sign < 0 ? (b.y ?? 0) + (b.h ?? 0) : G.H - (b.y ?? 0));
      F.at(t, el, { [ax]: Math.max(0, sh.dist ?? off) * sign, opacity: 0 }, sh.dur ?? 0.34, E);
      break;
    }
    case 'wipe': {
      F.set(el, { clipPath: 'inset(0 100% 0 0)' });
      F.at(t, el, { clipPath: 'inset(0 0% 0 0)' }, sh.dur ?? 0.52, E);
      break;
    }
    case 'strike': {
      F.set(el, { scaleX: 0 });
      F.at(t, el, { scaleX: 1 }, sh.dur ?? 0.26, E);
      break;
    }
    case 'fill': {
      F.set(el, { scaleX: 0 });
      F.at(t, el, { scaleX: (sh.pct ?? 100) / 100 }, sh.dur ?? 0.58, E);
      break;
    }
    case 'tint': F.at(t, el, { color: C[sh.color] || sh.color }, sh.dur ?? 0.24, 'power2.out'); break;
    case 'dim':  F.at(t, el, { opacity: sh.to ?? 0.38 }, sh.dur ?? 0.26, 'power2.out'); break;
    case 'shake': {
      const a = sh.amp ?? 8;
      F.at(t, el, { x: a }, 0.13, 'power2.out');
      F.at(t + 0.13, el, { x: -a * .6 }, 0.14, 'power2.out');
      F.at(t + 0.27, el, { x: 0 }, 0.18, EASE.secondary);
      break;
    }
    /* ─────────────────────────────────────────────────────────────────────
       🔴 raw — **탈출구.** 임의의 GSAP 속성을 그대로 통과시킨다. (2026-09-14 사용자 지시)

       왜 필요했나 (실측으로 확인한 모순):
         `docs/11-motion.md` 는 「**카탈로그에 없는 모션을 발명해도 된다**」고 적어 두고,
         이 함수 맨 아래 `default: die()` 가 **발명을 빌드 실패로 만들고 있었다.**
         자율성을 주는 문장과 그걸 금지하는 코드가 5일간 동시에 있었다.
         결과: 전 프로젝트 애니메이션의 **86%가 y·opacity·scale·x** 넷이고,
         컴파일러 경로는 그 외 속성이 **1~3종**뿐이었다 (손으로 쓴 판은 6~13종).
         `clipPath` 1.6% · `rotation` 1.1% · `skewX` 0.03% · 패스 모핑·3D 원근 **0건**.
         → 진폭(거리)을 풀어도 안 변한 이유다. **기저가 그대로면 스칼라만 커진다.**

       쓰는 법 (choreo.json):
         { "el":"value", "verb":"raw", "t":0.4, "dur":0.52, "ease":"power4.out",
           "from": { "clipPath":"inset(0 100% 0 0)", "rotationY":-90 },
           "to":   { "clipPath":"inset(0 0% 0 0)",   "rotationY":0 } }

       계약 (이건 지킨다):
         · `to` 필수 · `from` 은 선택(있으면 gsap.set 으로 초기값)
         · 이징은 자유 — 연속 이음매를 의도한 경우 실제 경계 상태를 확인한다
         · **결정론** — JSON 이라 함수가 못 들어오지만, 문자열로 숨겨 오는 것도 막는다
         · 이동/배율은 참고 통계로만 센다. 상한은 없다 */
    case 'raw': {
      const to = sh.to, from = sh.from;
      if (!to || typeof to !== 'object' || !Object.keys(to).length)
        die(`F${F.n}: raw 에 to 가 없다 — { "to": { "<속성>": <값> } } 가 필요하다`);
      const bad = /\b(random|Date|now|eval|Function|requestAnimationFrame)\s*\(/;
      for (const [k, val] of Object.entries({ ...(from || {}), ...to })) {
        if (typeof val === 'string' && bad.test(val))
          die(`F${F.n}: raw ${k} 에 비결정 표현이 있다 ("${val}") — 렌더가 재현되지 않는다`);
      }
      /* 🔴 **큐 전에는 숨긴다** (2026-09-15 · bbq 실측으로 잡은 내 설계 결함).
         옛 raw 는 `from` 을 프레임 시작에 그대로 적용하고 **숨기지 않았다.** 기본 동사(in·pop·rise)는
         큐 전까지 `opacity:0` 을 주는데 raw 만 빠져 있었다. 결과 — 「글자가 찌그러진 채 1.78초 보이다가
         펴진다 · 상자가 빈 채 2.02초 있다가 채워진다」 39건, 그중 1초 이상 14건. 사용자 말대로 **오류로 보인다.**
         `from` 이 있으면 **등장**이다 → 큐 전엔 안 보여야 한다. 기본 동사와 같은 VIS 분기를 탄다.
         상태 변화(이미 보이는 요소가 바뀐다)는 `from` 없이 `to` 만 쓴다 — 그러면 CSS 정지 상태에서 출발한다. */
      if (from) F.set(el, (VIS || t === 0) ? from : { ...from, opacity: 0 });
      const toFinal = (from && !(VIS || t === 0) && to.opacity === undefined && to.autoAlpha === undefined)
        ? { ...to, opacity: 1 } : to;
      /* 임팩트 판정 — motion-vocab 과 같은 기준(화면폭 20% 이동 · 배율 1.5배)으로 센다 */
      const mv = Math.max(Math.abs(+to.x || 0), Math.abs(+to.y || 0),
                          Math.abs(+(from || {}).x || 0), Math.abs(+(from || {}).y || 0));
      const sc = Math.max(+to.scale || 0, +(from || {}).scale || 0);
      if (mv >= G.W * 0.20 || sc >= 1.5) F.impacts++;
      if (sh.cascade && F.groups.has(el)) cascade(F, el, t, sh.dur ?? 0.52);
      F.at(t, el, toFinal, sh.dur ?? 0.52, E);
      break;
    }
    default: die(`F${F.n}: 모르는 동사 "${v}"`);
  }
}

// 요청하지 않은 반복을 자동으로 추가하지 않는다. 작성자가 넣은 반복은 허용한다.
function autoHold() { /* 의도적으로 비어 있다 */ }

// ① 겹침 후보 — 의도적 합성·마스크가 가능하므로 박스 교차만으로 멈추지 않는다
function checkOverlap(F) {
  const ids = Object.keys(F.boxes);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = F.boxes[ids[i]], b = F.boxes[ids[j]];
    if (!a.h || !b.h) continue;
    if (F.groups.has(ids[i]) || F.groups.has(ids[j])) continue;        // 그룹은 담는 그릇이다
    if (F.isAncestor(ids[i], ids[j]) || F.isAncestor(ids[j], ids[i])) continue;
    if (/^rs\d+$/.test(ids[i]) || /^rs\d+$/.test(ids[j])) continue;    // 취소선은 라벨 위에 긋는 게 설계다
    if (/^motif/.test(ids[i]) || /^motif/.test(ids[j])) continue;      // 모티프는 장식 — 뒤에 깔린다
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ox > 2 && oy > 2) console.warn(`F${F.n}: ${ids[i]} ✕ ${ids[j]} 가 ${Math.round(ox)}×${Math.round(oy)}px 겹친다`);
  }
  for (const [id, b] of Object.entries(F.boxes)) {          // ③ 세이프존 이탈
    if (/^motif/.test(id)) continue;                       // 모티프는 프레임 밖으로 걸치는 것이 설계다
    if (b.x < G.safeX - 1 || b.x + b.w > G.safeX + G.safeW + 1 || b.y < G.safeY - 1 || b.y + (b.h || 0) > G.safeY + G.safeH + 1)
      console.warn(`F${F.n}: ${id} — 배치 확인: 세이프존을 벗어난 상자 (${b.x},${b.y} ${b.w}×${b.h})`);
  }
}

// ───────────────────────── 방출 ─────────────────────────
function emit(F, caption) {
  const n = F.n, P = `#f${n}`;
  const fonts = fontFace('fonts/', {poster: !!BRAND.posterFont && fs.existsSync(path.join(path.dirname(chPath), 'fonts', BRAND.posterFont.file))});
  const cap = G.caption;
  const css = [
    `${P}{position:absolute;inset:0;width:1080px;height:1920px;color:${INK[F.ground].body};font-family:${FONT.body};font-optical-sizing:auto;line-height:1.2}`,
    `${P} *{box-sizing:border-box}`,
    /* 🔴 배경 반전 — ground 는 프레임마다 바뀐다 (2026-09-15).
       INK 는 원래 ground 를 따랐는데 배경 div 만 C.green 하드코딩이라 「딥그린 글자 위 딥그린 배경」이 됐다.
       강조는 새 색이 아니라 **배경 반전**이다 (docs/13-astra-agent-motion.md 다이소 규칙 1).
       ground 미지정이면 'green' — 기존 영상은 그대로다. */
    `${P}-ground{position:absolute;inset:0;width:1080px;height:1920px;background:${C.paper}}`,
    /* ⭐ 백지 무대 — 전폭 크림 y360~1360. F.ground='green' 이면 반전(강조 비트). 밴드는 항상 딥그린 (2026-09-15) */
    `${P}-stage{position:absolute;left:0;top:${px(G.stage.y)};width:1080px;height:${px(G.stage.h)};background:${C[F.ground]}}`,
    ...F.css.map(([sel, decl]) => `${sel}{${decl}}`),
    `${P}-caption{position:absolute;left:${px(cap.x)};bottom:${px(cap.bottom)};width:${px(cap.w)};min-height:${px(cap.minH)};` +
    `display:flex;justify-content:center;align-items:flex-end;text-align:center;font-size:${px(cap.fs)};line-height:1.25;` +
    `padding:14px 20px;word-break:normal;font-weight:${BRAND.type.captionWeight};z-index:9999;color:${C.ink}}`,   // 밴드가 딥그린이라 필(배경 상자)은 없다
  ].join('\n');

  return `<template>
<style>
${fonts}
${css}
</style>
<div id="f${n}" data-hf-id="f${n}" data-composition-id="${F.comp}" data-start="0" data-duration="${F.dur}" data-width="1080" data-height="1920">
  <div id="f${n}-ground" data-hf-id="f${n}-ground" class="clip" data-start="0" data-duration="${F.dur}" data-track-index="0"></div>
  <div id="f${n}-stage" data-hf-id="f${n}-stage" class="clip" data-start="0" data-duration="${F.dur}" data-track-index="0"></div>
${F.html.join('\n')}
  <div id="f${n}-caption" data-hf-id="f${n}-caption" class="clip caption" data-start="0" data-duration="${F.dur}" data-track-index="9"><span data-hf-id="f${n}-caption-t">${esc(caption)}</span></div>
</div>
<script>(()=>{
  // 🤖 pipeline/hf-compile.mjs 가 choreo.json 에서 생성했다. 손으로 고치지 마라 — 다음 컴파일에 덮인다.
  const P="${P}", DUR=${F.dur}; const tl=gsap.timeline({paused:true});
${F.tw.join('\n')}
  window.__timelines=window.__timelines||{};window.__timelines["${F.comp}"]=tl;
})();</script>
</template>
`;
}

// ───────────────────────── 메인 ─────────────────────────
const arg = process.argv[2];
if (!arg) die('사용: node pipeline/hf-compile.mjs <프로젝트>');
const pdir = resolveProject(arg);
const hf = path.join(pdir, 'hyperframes');
const chPath = path.join(hf, 'choreo.json');
// 🔴 **굽기 전에 골격을 본다** (2026-09-12 사고 · docs/02-pitfalls.md §76).
//    `hyperframes init --example=blank` 은 브랜드 폰트·채널 락업을 깔지 않는다. 00011 에서 셋이 빠진 채로
//    22프레임을 굽고 **검수 시트까지 사용자에게 나갔다** — 락업이 전 프레임에서 사라지고 글자는 시스템 폰트였다.
//    컴파일러는 ④ 에서 반드시 도는 도구다. 여기서 막으면 그 사고가 구조적으로 불가능해진다.
function requireSkeleton(hfDir) {
  const missing = [];
  for (const f of [BRAND.font.file, BRAND.font.license])
    if (!fs.existsSync(path.join(hfDir, 'fonts', f))) missing.push(`fonts/${f}`);
  const master=path.join(hfDir,'index.html');
  if (!fs.existsSync(master) || !hasChannelLockup(fs.readFileSync(master,'utf8'))) missing.push(`${BRAND.name} 루트 채널 로고`);
  if (!missing.length) return;
  console.error(`\n✗ 프로젝트 골격이 없다 — 이 상태로 구우면 폰트와 락업이 화면에서 조용히 사라진다:`);
  for (const m of missing) console.error(`     ${m}`);
  console.error(`\n   채우는 법:`);
  console.error(`     cp resources/fonts/{${BRAND.font.file},${BRAND.font.license}} ${path.relative(ROOT, hfDir)}/fonts/`);
  console.error(`     node pipeline/root-lockup.mjs <프로젝트>      # 좌상단 채널 로고를 루트에 적용한다`);
  console.error(`   검사:  node pipeline/stage-gate.mjs <프로젝트> 4\n`);
  process.exit(2);
}
requireSkeleton(path.dirname(chPath));

if (!fs.existsSync(chPath)) die(`안무 스펙이 없다: ${path.relative(ROOT, chPath)}`);

const choreo = JSON.parse(fs.readFileSync(chPath, 'utf8'));
const tracks = readTracks(hf);
const meta = JSON.parse(fs.readFileSync(path.join(hf, 'audio_meta.json'), 'utf8'));
const VOICE = Object.fromEntries(meta.voices.map((v) => [v.frame, v]));

PRODDIRPATH = path.join(hf,'assets','product');
PRODDIR = fs.existsSync(PRODDIRPATH) ? fs.readdirSync(PRODDIRPATH) : [];
const outDir = path.join(hf, 'compositions', 'frames');
fs.mkdirSync(outDir, { recursive: true });

let warn = [], guarded = [], staged = [], carried = [];
for (const tr of tracks) {
  const n = +tr.comp.slice(0, 2);
  const spec = (choreo.frames || []).find((f) => +f.n === n);
  if (!spec) die(`안무에 F${String(n).padStart(2, '0')} 가 없다 (index.html 은 ${tracks.length}컷을 기대한다)`);
  const F = new Frame(n, tr.comp, tr.dur, spec.ground);
  F.Z = computeZones(spec.slots || {});
  slotMotif(F, spec.slots && spec.slots.motif);   // 🔴 내용보다 먼저 = 뒤에 깔린다
  const fn = LAYOUT[spec.layout];
  if (!fn) die(`F${F.n}: 모르는 레이아웃 "${spec.layout}" — ${Object.keys(LAYOUT).join('·')} 중 하나여야 한다`);
  fn(F, spec.slots || {});
  checkOverlap(F);
  // ── 앞 컷에서 이어지는 요소는 다시 등장시키지 않는다 ──
  const prev = (choreo.frames || []).find((x) => +x.n === n - 1);
  let persisted = 0;
  if (spec.carry === true && prev && prev.layout === spec.layout) {
    const pc = slotSig(prev), cc = slotSig(spec);
    for (const sh of (spec.shots || [])) {
      if (ENTER.has(sh.verb) && pc[sh.el] !== undefined && pc[sh.el] === cc[sh.el]) { sh._persist = true; persisted++; }
    }
  }
  if (persisted) carried.push(`F${F.n}×${persisted}`);
  /* 🔴 note 슬롯이 삭제됐으므로 note 를 겨냥한 샷은 **입구에서 조용히 뺀다** (2026-09-15).
     가드 셋(빈 무대·빈 첫프레임·본 루프)이 전부 이 배열을 읽으니 여기서 한 번만 거른다.
     안 거르면 옛 안무(bbq)가 「샷이 없는 슬롯을 가리킨다」로 죽어 재컴파일이 막힌다. */
  const dropped = (spec.shots || []).filter((x) => x.el === 'note').length;
  if (dropped) { spec.shots = spec.shots.filter((x) => x.el !== 'note'); warn.push(`F${F.n}: note 슬롯 샷 ${dropped}개 무시 (note 는 삭제됐다 — 자막과 중복)`); }
  const pulled = spec.autoEntry === true && guardEmptyStage(F, (spec.shots || []).filter((x) => !x._persist));
  if (pulled) staged.push(pulled);
  const kept = spec.autoEntry === true && guardFirstFrame(F, (spec.shots || []).filter((x) => !x._persist));
  if (kept) guarded.push(`F${F.n}:${kept}`);
  for (const sh of (spec.shots || [])) {
    if (!(sh.el in F.boxes)) die(`F${F.n}: 샷이 없는 슬롯을 가리킨다 "${sh.el}" — 있는 슬롯: ${Object.keys(F.boxes).join(', ')}`);
    if (sh.t >= F.dur) die(`F${F.n}: 샷 시각 ${sh.t} 가 컷 길이 ${F.dur} 를 넘는다`);
    if (sh._persist) continue;                       // 앞 컷에서 그대로 이어진다 — 등장 금지
    applyShot(F, sh);
  }
  autoHold(F);
  const cap = (VOICE[n] || {}).caption || '';
  /* 🔴 워커가 그린 프레임을 덮지 마라 (2026-09-15 · 00017 · docs/02-pitfalls.md §100).
     컴파일러는 **시안 초안**까지만 굽는다 — 최종 프레임은 워커·코덱스가 raw GSAP 으로 그린다
     (stages/4-designer.md ①-00). 그런데 이 줄이 그 산출물을 조건 없이 덮었다.
     00017 에서 `--check` 한 번에 **5프레임 전부**(svg 34·path 89)가 날아갔다.
     판별: 컴파일러가 구운 파일에는 아래 MARK 주석이 들어간다. 없으면 사람·워커가 쓴 것이다. */
  const outPath = path.join(outDir, tr.file);
  if (!FORCE && fs.existsSync(outPath) && !fs.readFileSync(outPath, 'utf8').includes(GEN_MARK)) {
    keptFiles.push(`F${F.n} ${tr.file}`);
    continue;
  }
  fs.writeFileSync(outPath, emit(F, cap));
}

// ───────────────────────── 안무 감사 ─────────────────────────
// 00010 실측: 코덱스 1차 안무가 87샷 중 72개(83%)를 punch 로 채웠다 — 제자리 펄스뿐인 화면.
// 개수로는 안 잡히고 어휘 분포로만 잡힌다(docs/02-pitfalls.md §46 과 같은 자리).
function audit(choreo, tracks) {
  const V = {}, issues = [];
  let total = 0;
  for (const f of choreo.frames) {
    const sh = f.shots || [];
    for (const s of sh) { V[s.verb] = (V[s.verb] || 0) + 1; total++; }
    const dur = (tracks.find((t) => +t.comp.slice(0, 2) === +f.n) || {}).dur || 0;
    if (sh.length < 2 && dur > 1.2) issues.push(`F${String(f.n).padStart(2,'0')}: 샷 ${sh.length}개로 ${dur}s 를 채운다`);
    if (/잘살아보세/.test(f.slots.head || '')) issues.push(`F${String(f.n).padStart(2,'0')}: head 가 루트 브랜드락업과 중복된다`);
  }
  // 🔴 프레임 간 글자 위계 (2026-09-12 사고). 00011 에서 **절정 프레임을 trio 에 넣었더니**
  //    그 레이아웃의 금액 글자가 46px 고정이라 영상에서 **제일 작아졌고**, 곁가지(듀오 509만·stat 150px)가
  //    제일 커졌다. 레이아웃마다 최대 글자 크기가 다르다 — **어디에 넣느냐가 위계를 정한다.**
  //    도구는 순위만 찍는다. 절정이 위에 있는지는 사람이 본다.
  const FOCAL = {
    stat: (s) => Math.max(s.fs || 200, s.label?.fs || 0, s.amount ? (s.amountFs || 120) : 0), verdict: (s) => s.fs || 72, statement: (s) => s.fs || 72,
    table: (s) => Math.max(s.head?.fs || 34, s.amount ? (s.amountFs || 132) : 0, ...(s.rows || []).map(r => r.label?.fs || 38)),
    anchor: (s) => (s.amount ? (s.amountFs || 150) : (s.stage && s.stage.fs) || 56),
    trio: () => TRIO_S.priFs, duo: () => DUO_S.priFs,
  };
  const rank = choreo.frames
    .map((f) => ({ n: f.n, fs: (FOCAL[f.layout] || (() => 0))(f.slots || {}), lay: f.layout }))
    .sort((a, b) => b.fs - a.fs);
  console.log(`   글자 위계 — ${rank.slice(0, 5).map((r) => `F${String(r.n).padStart(2,'0')} ${r.fs}px(${r.lay})`).join(' > ')} … 최소 F${String(rank[rank.length-1].n).padStart(2,'0')} ${rank[rank.length-1].fs}px`);

  // ABMEN: the old Jalnan width coefficients do not describe Inter Latin text.
  // Validate actual wrapping with layout-scan / HyperFrames check after fonts load
  // (the original failure and its cause remain documented in pitfalls section 82).

  const punch = (V.punch || 0) / Math.max(1, total);
  const big = ['in','slam','shift','wipe','fill'].reduce((a,k)=>a+(V[k]||0),0);
  const dist = Object.entries(V).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`${k} ${n}(${Math.round(n/total*100)}%)`).join(' · ');
  console.log(`   샷 ${total}개 — ${dist}`);

  /* 🔴 **무대·어휘가 좁으면 무엇을 해도 닮는다** (2026-09-14 실측으로 확인).
     사용자: *"자유도를 줬는데도 왜 매번 비슷하게 나오나"*. 재 보니 자유를 준 축이 하나뿐이었다 —
       무대  레이아웃 7종 고정. 컴파일러 5편 쌍별 유사도 **평균 0.76**, 00012↔00013 은 **0.98**
       어휘  동사 13종 닫힘 (지금은 `raw` 로 열렸다)
       속성  y·opacity·scale·x 가 **86%**. 컴파일러 판은 그 외 1~3종 (손으로 쓴 판 6~21종)
     거리(진폭)만 풀면 **같은 동작이 더 멀리 갈 뿐**이다. 그래서 여기서 둘을 같이 센다. */
  const layCount = {};
  for (const f of choreo.frames || []) layCount[f.layout || '?'] = (layCount[f.layout || '?'] || 0) + 1;
  const nF = Math.max(1, (choreo.frames || []).length);
  const [topLay, topN] = Object.entries(layCount).sort((a, b) => b[1] - a[1])[0] || ['?', 0];
  console.log(`   레이아웃 ${Object.keys(layCount).length}종 — ` +
    Object.entries(layCount).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`${k} ${n}`).join(' · '));
  return issues;
}

console.log(`✅ ${tracks.length - keptFiles.length}개 프레임 컴파일 → ${path.relative(ROOT, outDir)}`);
if (keptFiles.length) {
  console.log(`   🛡  워커가 그린 프레임 ${keptFiles.length}개는 **건드리지 않았다** — ${keptFiles.join(' · ')}`);
  console.log(`      컴파일러는 시안 초안까지만 굽는다 (stages/4-designer.md ①-00). 정말 덮으려면 --force`);
}
console.log(`   지정한 타이밍·거리 보존 · 선택적 첫프레임 보정 ${guarded.length}개`);
if (staged.length) console.log(`   주무대 공백 방지 ${staged.length}개 — ${staged.join(' · ')}`);
if (carried.length) console.log(`   앞 컷에서 이어받아 재등장 생략 — ${carried.join(' · ')}`);
const issues = audit(choreo, tracks);
if (warn.length) console.log('⚠️  ' + warn.join('\n⚠️  '));
if (issues.length) { console.log(''); for (const i of issues) console.log('   ' + (i.startsWith('🔴') ? i : '⚠️  ' + i)); }
