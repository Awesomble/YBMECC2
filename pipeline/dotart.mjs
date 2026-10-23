#!/usr/bin/env node
// dotart.mjs — 실사 사진을 **브랜드 팔레트 도트아트 SVG** 로 바꾼다.
//
//   node pipeline/dotart.mjs <이미지> [옵션]
//     --w 96            가로 픽셀 수 (도트 해상도). 기본 96
//     --out <경로>       SVG 출력. 기본 <입력>.dot.svg
//     --mode lum|near   lum = 휘도 램프(사진용·기본) · near = 최근접 RGB(이미 팔레트에 가까운 그림용)
//     --levels 4        휘도 단계 수 (2~6). 기본 4
//     --bg <hex>        배경으로 간주해 투명 처리할 색 (예: ffffff)
//     --bg-tol 48       배경 색 허용 오차 (0~255). 기본 48
//     --alpha           입력 PNG 의 알파를 배경 판정에 쓴다 (--bg 보다 우선)
//     --trim            투명 여백을 잘라낸다
//     --preview         같은 이름의 .png 미리보기도 만든다 (눈으로 확인용)
//     --id <접두사>      SVG 안 클래스·id 접두사. 기본 파일명
//
// 왜 SVG 인가 (2026-09-11):
//   래스터로 넣으면 위치·크기 변형만 남는다. **색별로 <path> 를 나눠 두면**
//   픽셀 덩어리 단위로 GSAP 트윈이 걸린다 — 채우기·부분 강조·색 전이가 전부 된다.
//   (00009 에서 F19 「익히면 붉어진다」가 정확히 이 동작이다.)
//
// 출력 구조 — 색마다 path 하나. 워커가 이 id 로 트윈을 건다.
//   <svg viewBox="0 0 W H" shape-rendering="crispEdges">
//     <path id="<접두사>-c0" fill="#8A1C1C" d="M.."/>   ← 어두운 단계
//     <path id="<접두사>-c1" fill="#F2C230" d="M.."/>
//     ...
//
// ⚠️ 도트 해상도가 낮으면 **가는 것이 사라진다** — 새우 수염이 대표다.
//    변환 뒤 반드시 `--preview` 로 눈검사하고, 수염이 끊기면 --w 를 올려라.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { basename, extname, join, dirname } from "node:path";
import { tmpdir } from "node:os";

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d;
};
const has = (n) => argv.includes(`--${n}`);
const SRC = argv.find((a) => !a.startsWith("--") && !argv[argv.indexOf(a) - 1]?.startsWith("--"));

if (!SRC || !existsSync(SRC)) {
  console.error(`사용: node pipeline/dotart.mjs <이미지> [--w 96] [--mode lum|near] [--levels 4]
                      [--bg ffffff] [--bg-tol 48] [--alpha] [--trim] [--preview] [--out x.svg]`);
  process.exit(1);
}

const W = +flag("w", 96);
const MODE = flag("mode", "lum");
const LEVELS = Math.max(2, Math.min(6, +flag("levels", 4)));
const BG = flag("bg", null);
const BGTOL = +flag("bg-tol", 48);
const USE_ALPHA = has("alpha");
const TRIM = has("trim");
const PREVIEW = has("preview");
const STEM = basename(SRC, extname(SRC)).replace(/[^a-zA-Z0-9_-]/g, "-");
const PREFIX = flag("id", STEM);
const OUT = flag("out", join(dirname(SRC), `${STEM}.dot.svg`));

// ── 브랜드 팔레트 (docs/12-brand.md) — 어두운 → 밝은 순서. 휘도 램프가 이 순서를 쓴다
const RAMP = [
  { hex: "#8A1C1C", name: "관보레드" },
  { hex: "#0B3D1F", name: "진초록" },
  { hex: "#2E7D4F", name: "초록" },
  { hex: "#F2C230", name: "골드" },
  { hex: "#F2E8D5", name: "크림" },
];
// levels 개수에 맞춰 램프에서 고르게 뽑는다 (양 끝은 항상 포함)
const pick = (n) => {
  if (n >= RAMP.length) return RAMP;
  if (n === 2) return [RAMP[0], RAMP[4]];
  if (n === 3) return [RAMP[0], RAMP[3], RAMP[4]];
  if (n === 4) return [RAMP[0], RAMP[2], RAMP[3], RAMP[4]];
  return RAMP.slice(0, n);
};
// 🔴 `--tones "#8A1C1C,#F2C230,#F2E8D5"` 로 램프를 직접 지정한다 (어두운 → 밝은 순서).
//    자동 선택은 중간톤에 초록을 넣는데, 딥그린 배경 위에서 **구멍처럼** 보이는 경우가 있다.
//    같은 피사체 둘을 구별해야 할 때도 쓴다 — 대하는 따뜻하게(레드·골드), 흰다리는 차갑게(크림 위주).
const TONES = flag("tones", null);
const PAL = TONES
  ? TONES.split(",").map((h) => ({ hex: h.trim().startsWith("#") ? h.trim() : `#${h.trim()}`, name: "지정" }))
  : pick(LEVELS);

// ── 1. ffmpeg 로 디코딩 + 리사이즈 → raw RGBA
const raw = join(tmpdir(), `dotart-${process.pid}.raw`);
const probe = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0",
  "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", SRC], { encoding: "utf8" }).trim();
const [sw, sh] = probe.split("x").map(Number);
const H = Math.max(1, Math.round((sh / sw) * W));
execFileSync("ffmpeg", ["-v", "error", "-i", SRC, "-vf", `scale=${W}:${H}:flags=area`,
  "-pix_fmt", "rgba", "-f", "rawvideo", "-y", raw]);
const buf = readFileSync(raw);
unlinkSync(raw);

// ── 2. 픽셀 → 팔레트 인덱스 (-1 = 투명)
const bgRGB = BG ? [0, 2, 4].map((i) => parseInt(BG.replace("#", "").slice(i, i + 2), 16)) : null;
const hexRGB = (h) => [0, 2, 4].map((i) => parseInt(h.slice(1 + i, 3 + i), 16));
const palRGB = PAL.map((p) => hexRGB(p.hex));

const idx = new Int8Array(W * H).fill(-1);
const lums = [];
for (let i = 0; i < W * H; i++) {
  const r = buf[i * 4], g = buf[i * 4 + 1], b = buf[i * 4 + 2], a = buf[i * 4 + 3];
  if (USE_ALPHA && a < 128) continue;
  if (bgRGB && Math.abs(r - bgRGB[0]) + Math.abs(g - bgRGB[1]) + Math.abs(b - bgRGB[2]) < BGTOL * 3) continue;
  lums.push([i, 0.2126 * r + 0.7152 * g + 0.0722 * b, r, g, b]);
}
if (!lums.length) { console.error("🔴 남은 픽셀이 0개다 — 배경 판정(--bg/--bg-tol/--alpha)이 너무 넓다"); process.exit(1); }

if (MODE === "lum") {
  // 휘도 히스토그램을 균등 분위로 잘라 램프에 매핑 (사진마다 노출이 달라 고정 임계값은 못 쓴다)
  const sorted = lums.map((l) => l[1]).sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  // 🔴 기본은 등분이지만 사진은 등분이 나쁘다 — 어두운 칸에 픽셀의 1/N 이 무조건 들어가
  //    **중간 그림자까지 검게 뭉쳐** 얼룩이 된다(00009 실측). `--split "0.15,0.55"` 로 분위를 직접 준다.
  const SPLIT = flag("split", null);
  const cuts = SPLIT
    ? SPLIT.split(",").map((v) => q(+v))
    : Array.from({ length: PAL.length - 1 }, (_, k) => q((k + 1) / PAL.length));
  for (const [i, L] of lums) {
    let k = 0; while (k < cuts.length && L > cuts[k]) k++;
    idx[i] = k;
  }
} else {
  for (const [i, , r, g, b] of lums) {
    let best = 0, bd = Infinity;
    palRGB.forEach(([pr, pg, pb], k) => {
      const d = (r - pr) ** 2 * 0.3 + (g - pg) ** 2 * 0.59 + (b - pb) ** 2 * 0.11;
      if (d < bd) { bd = d; best = k; }
    });
    idx[i] = best;
  }
}

// ── 2-a-b. 강조 영역 — **원본 좌표 상자 안은 지정한 색 하나로** 칠한다
//   `--accent-box "x0,y0,x1,y1" --accent-tone "#2E7D4F"` (원본 픽셀 좌표)
//   🔴 왜 필요한가: 휘도 램프는 색상을 버린다. 그런데 **색 자체가 정보인 부위**가 있다 —
//      00009 의 대하 꼬리(녹색)·흰다리새우 꼬리(붉은빛)가 식약처 구분 기준 1순위다.
//      최근접 RGB 모드로 바꾸면 회백색 몸통까지 초록에 붙어 화면이 통째로 초록이 된다(실측).
//      → **몸통은 휘도 램프, 지정 부위만 실제 색**. 그리고 그 부위가 **별도 path** 로 나와
//        「꼬리만 색이 변한다」를 트윈으로 만들 수 있다.
const ABOX = flag("accent-box", null);
const ATONE = flag("accent-tone", null);
let ACCENT_K = -1;
if (ABOX && ATONE) {
  const [ax0, ay0, ax1, ay1] = ABOX.split(",").map(Number);
  const sx = W / sw, sy = H / sh;                 // 원본 → 도트 격자 축척
  const bx0 = Math.round(ax0 * sx), bx1 = Math.round(ax1 * sx);
  const by0 = Math.round(ay0 * sy), by1 = Math.round(ay1 * sy);
  ACCENT_K = PAL.length;
  PAL.push({ hex: ATONE.startsWith("#") ? ATONE : `#${ATONE}`, name: "강조" });
  palRGB.push(hexRGB(PAL[ACCENT_K].hex));
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    if (idx[y * W + x] >= 0) idx[y * W + x] = ACCENT_K;
  }
}

// ── 2-b. 정리 — 고립 픽셀 제거 (다수결 필터)
//    도트아트는 **정돈돼야 의도로 읽힌다.** 한 칸짜리 튄 색이 남으면 압축 노이즈처럼 보인다.
//    이웃 8칸의 최빈값으로 바꾸되, 자기 색이 이웃에 2개 이상 있으면 지킨다(가는 선 보존).
const CLEAN = +flag("clean", 1);
for (let pass = 0; pass < CLEAN; pass++) {
  const src = Int8Array.from(idx);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, me = src[i];
    const cnt = new Map();
    let same = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const v = src[ny * W + nx];
      cnt.set(v, (cnt.get(v) || 0) + 1);
      if (v === me) same++;
    }
    if (same >= 2) continue;                       // 🔴 가는 선(수염)을 지우지 않는다
    let best = me, bn = 0;
    for (const [v, n] of cnt) if (n > bn) { bn = n; best = v; }
    if (bn >= 5) idx[i] = best;                    // 이웃 8칸 중 5칸 이상이 같은 색일 때만 갈아탄다
  }
}

// ── 3. 여백 자르기
let x0 = 0, y0 = 0, x1 = W - 1, y1 = H - 1;
if (TRIM) {
  const filled = (x, y) => idx[y * W + x] >= 0;
  while (x0 < x1 && ![...Array(H).keys()].some((y) => filled(x0, y))) x0++;
  while (x1 > x0 && ![...Array(H).keys()].some((y) => filled(x1, y))) x1--;
  while (y0 < y1 && ![...Array(W).keys()].some((x) => filled(x, y0))) y0++;
  while (y1 > y0 && ![...Array(W).keys()].some((x) => filled(x, y1))) y1--;
}
const OW = x1 - x0 + 1, OH = y1 - y0 + 1;

// ── 4. 색마다 가로 런 병합 → path
const paths = PAL.map((p, k) => {
  const d = [];
  for (let y = y0; y <= y1; y++) {
    let run = -1;
    for (let x = x0; x <= x1 + 1; x++) {
      const on = x <= x1 && idx[y * W + x] === k;
      if (on && run < 0) run = x;
      else if (!on && run >= 0) { d.push(`M${run - x0} ${y - y0}h${x - run}v1h-${x - run}z`); run = -1; }
    }
  }
  return { ...p, d: d.join(""), n: d.length };
}).filter((p) => p.n > 0);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${OW} ${OH}" shape-rendering="crispEdges" role="img" aria-label="${PREFIX}">
${paths.map((p, k) => `  <path id="${PREFIX}-c${k}" class="${PREFIX}-dot" data-tone="${p.name}" fill="${p.hex}" d="${p.d}"/>`).join("\n")}
</svg>
`;
writeFileSync(OUT, svg);

// ── 5. 미리보기 PNG (눈검사용 — 도트가 뭉개졌는지 사람이 본다)
if (PREVIEW) {
  const png = OUT.replace(/\.svg$/, ".png");
  const scale = Math.max(1, Math.round(720 / OW));
  const rgba = Buffer.alloc(OW * OH * 4);
  for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
    const k = idx[(y + y0) * W + (x + x0)];
    const o = (y * OW + x) * 4;
    if (k < 0) { rgba[o + 3] = 0; continue; }
    const [r, g, b] = palRGB[k]; rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
  }
  const tmp = join(tmpdir(), `dotart-prev-${process.pid}.raw`);
  writeFileSync(tmp, rgba);
  execFileSync("ffmpeg", ["-v", "error", "-f", "rawvideo", "-pix_fmt", "rgba",
    "-s", `${OW}x${OH}`, "-i", tmp, "-vf", `scale=${OW * scale}:${OH * scale}:flags=neighbor`,
    "-y", png]);
  unlinkSync(tmp);
  console.log(`  미리보기 ${png}  (${OW * scale}×${OH * scale})`);
}

const total = paths.reduce((s, p) => s + p.n, 0);
console.log(`✔ ${OUT}`);
console.log(`  도트 ${OW}×${OH} · 모드 ${MODE} · 단계 ${PAL.length} · 런 ${total}개`);
paths.forEach((p, k) => console.log(`    ${PREFIX}-c${k}  ${p.hex}  ${p.name.padEnd(5)} 런 ${p.n}`));
console.log(`
  워커에게: 색마다 path 가 나뉘어 있으니 **덩어리 단위로 트윈**을 걸 수 있다.
    - 등장:  path 별 clip-path inset 으로 좌→우 채우기 (스태거 60~80ms)
    - 강조:  특정 tone 만 fill 을 골드로 (수염·이마뿔 강조)
    - 전이:  전체 fill 을 관보레드로 (F19 「익히면 붉어진다」)
  🔴 미리보기 PNG 를 눈으로 보고 **가는 것(수염)이 살아 있는지** 먼저 확인하라.`);
