#!/usr/bin/env node
// review-page.mjs — 렌더 하나를 **한 장으로** 보게 만든다 (2026-09-09 신설)
//
//   node pipeline/review-page.mjs <프로젝트> [영상.mp4]
//   → output/<p>/review.html  (자체 완결 · 이미지 내장 · 폰에서 열린다)
//
// 왜 (2026-09-08 실측):
//   사용자가 v4 를 보고 「앞쪽 모션이 약간 어색하고 뒤로 갈수록 잘맞는데 원인분석좀 해봐」라고 했다.
//   정확한 관찰이었지만 **어디인지 짚을 방법이 없어서** 원인을 찾는 데 몇 시간이 들었다.
//   이 페이지는 이음매마다 앞뒤 프레임과 수치를 나란히 놓는다 — 사용자가 「16.0초 여기」라고
//   말할 수 있으면 그 몇 시간이 사라진다.
//
// ⚠️ **이건 판정 도구가 아니다.** 합불은 `render-gate.sh` 가 낸다.
//    이 페이지는 **사람이 눈으로 보고 짚기 위한 것**이다.
//
// 벽시계 실측 근거: 영상 하나에 도구가 쓴 시간은 전체의 6% 뿐이었다.
//   도구를 더 빠르게 만드는 건 답이 아니고, **사람이 판단하는 왕복을 줄이는 것**이 답이다.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { resolveProject } from "./lib/project.mjs";

const argv = process.argv.slice(2);
const { dir, name, out } = resolveProject(argv[0], { usage: "node pipeline/review-page.mjs <프로젝트> [영상.mp4]" });

let file = argv[1];
if (!file) {
  // 봉인 MP4(.srcman.json 동반)도 납품 후보 — stage-gate 5·hf-export 와 같은 규칙 (00117 ig-reels-v1.mp4)
  const c = existsSync(out) ? readdirSync(out).filter((f) => /\.mp4$/.test(f) && (/^render/.test(f) || existsSync(join(out, f + '.srcman.json')))).map((f) => join(out, f)) : [];
  if (!c.length) { console.error(`✗ ${out} 에 render*.mp4 또는 봉인 MP4가 없다`); process.exit(2); }
  file = c.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}
if (!existsSync(file)) { console.error(`✗ 영상이 없다: ${file}`); process.exit(2); }

// ── 프레임 경계 ──
const metaPath = join(dir, "hyperframes", "audio_meta.json");
const voices = existsSync(metaPath) ? (JSON.parse(readFileSync(metaPath, "utf8")).voices || []) : [];
const bounds = []; let acc = 0;
for (const v of voices.slice(0, -1)) { acc += v.duration_s; bounds.push(+acc.toFixed(4)); }

const probe = (k) => (spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0",
  "-show_entries", `stream=${k}`, "-of", "default=nw=1:nk=1", file], { encoding: "utf8" }).stdout || "").trim();
const fm = probe("r_frame_rate").match(/^(\d+)\s*\/\s*(\d+)/);
const fps = fm && +fm[2] ? +fm[1] / +fm[2] : 60;

// ── 저해상도 1패스 디코드 → 밀도 곡선 + 빈 화면 ──
const W = 135, H = 240, FR = W * H * 3;
const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vf",
  `scale=${W}:${H}:flags=neighbor,format=rgb24`, "-f", "rawvideo", "-"],
  { maxBuffer: 1_500_000_000, encoding: "buffer" });
if (r.status !== 0) { console.error("ffmpeg 실패"); process.exit(2); }
const buf = r.stdout, N = Math.floor(buf.length / FR);
const yLock0 = Math.round(232 / 1920 * H), yLock1 = Math.round(350 / 1920 * H), yCap = Math.round(1260 / 1920 * H);

// 그라운드 = 영상 전체 최빈색 (팔레트 상수를 박지 않는다 · 프레임별로 뽑으면 뒤집힌다)
const gh = new Map();
for (let n = 0; n < N; n += Math.max(1, Math.floor(N / 60)))
  for (let y = 0; y < yCap; y += 2) { if (y >= yLock0 && y <= yLock1) continue;
    for (let x = 0; x < W; x += 2) { const o = n * FR + (y * W + x) * 3;
      const k = ((buf[o] >> 4) << 8) | ((buf[o + 1] >> 4) << 4) | (buf[o + 2] >> 4);
      gh.set(k, (gh.get(k) || 0) + 1); } }
let gb = 0, gk = 0; for (const [k, v] of gh) if (v > gb) { gb = v; gk = k; }
const BR = ((gk >> 8) & 15) * 17, BG = ((gk >> 4) & 15) * 17, BB = (gk & 15) * 17;

const dens = new Array(N).fill(0);
for (let n = 0; n < N; n++) { let c = 0;
  for (let y = 0; y < yCap; y++) { if (y >= yLock0 && y <= yLock1) continue;
    for (let x = 0; x < W; x++) { const o = n * FR + (y * W + x) * 3;
      if ((Math.abs(buf[o] - BR) + Math.abs(buf[o + 1] - BG) + Math.abs(buf[o + 2] - BB)) / 3 >= 12) c++; } }
  dens[n] = c; }
const maxD = Math.max(...dens, 1);
const blanks = dens.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
const blankRuns = [];
for (const i of blanks) { const L = blankRuns[blankRuns.length - 1];
  if (L && i === L[1] + 1) L[1] = i; else blankRuns.push([i, i]); }

// ── 필요한 프레임만 1패스로 뽑는다 (프레임마다 seek 하면 느리고 한 칸씩 밀린다) ──
const want = [];
// Match seam-scan: the incoming clip starts on the first sample at/after its boundary.
for (const b of bounds) { const k = Math.ceil(b * fps); if (k >= 1 && k < N) want.push(k - 1, k); }
for (const [a] of blankRuns) { if (!want.includes(a)) want.push(a); }
const uniq = [...new Set(want)].sort((a, b) => a - b);
const sel = uniq.map((n) => `eq(n\\,${n})`).join("+");
const TH = 260;
const rr = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vf",
  `select='${sel}',scale=${TH}:-1`, "-vsync", "0", "-q:v", "6", "-f", "image2pipe", "-vcodec", "mjpeg", "-"],
  { maxBuffer: 400_000_000, encoding: "buffer" });
// JPEG 스트림을 SOI(FFD8)~EOI(FFD9) 로 자른다
const imgs = []; let p = 0;
while (p < rr.stdout.length - 1) {
  if (rr.stdout[p] === 0xFF && rr.stdout[p + 1] === 0xD8) {
    let q = p + 2;
    while (q < rr.stdout.length - 1 && !(rr.stdout[q] === 0xFF && rr.stdout[q + 1] === 0xD9)) q++;
    imgs.push(rr.stdout.slice(p, q + 2)); p = q + 2;
  } else p++;
}
const byFrame = new Map();
uniq.forEach((n, i) => { if (imgs[i]) byFrame.set(n, `data:image/jpeg;base64,${imgs[i].toString("base64")}`); });

// ── 게이트 (있으면 실행해 결과만 담는다) ──
const audit = spawnSync("node", [join(import.meta.dirname, "motion-audit.mjs"), file], { encoding: "utf8" }).stdout || "";
const mAudit = (re) => (audit.match(re) || [])[1] || "—";

// ── HTML ──
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const fmtT = (n) => `${Math.floor(n / fps / 60)}:${String(Math.floor((n / fps) % 60)).padStart(2, "0")}.${String(Math.round((n / fps % 1) * 100)).padStart(2, "0")}`;

// ── 차트 좌표 (라벨이 들어갈 여백을 viewBox 안에 남긴다) ──
const CW = 1000, CH = 150, PL = 46, PR = 10, PT = 10, PB = 22;
const px = (n) => PL + (n / (N - 1)) * (CW - PL - PR);
const py = (v) => PT + (1 - v / maxD) * (CH - PT - PB);
const step = Math.max(1, Math.floor(N / 700));
const pts = []; for (let n = 0; n < N; n += step) pts.push(`${px(n).toFixed(1)},${py(dens[n]).toFixed(1)}`);
pts.push(`${px(N - 1).toFixed(1)},${py(dens[N - 1]).toFixed(1)}`);
const area = `${PL},${py(0).toFixed(1)} ${pts.join(" ")} ${px(N - 1).toFixed(1)},${py(0).toFixed(1)}`;
const secStep = (N / fps) > 45 ? 10 : 5;
const ticks = []; for (let t = 0; t <= N / fps; t += secStep) ticks.push(t);

const seams = bounds.map((b, i) => {
  const k = Math.ceil(b * fps);
  if (k < 1 || k >= N) return null;
  const a = dens[k - 1], c = dens[k];
  const d = a ? (c - a) / a * 100 : NaN;
  const st = !a || !c ? "bad" : Math.abs(d) >= 55 ? "bad" : Math.abs(d) >= 25 ? "warn" : "ok";
  return { i, k, a, c, d, st, label: !a || !c ? "한쪽이 비었다" : `${d > 0 ? "+" : ""}${d.toFixed(1)}%` };
}).filter(Boolean);
const nBad = seams.filter((s) => s.st === "bad").length;
const stillN = +mAudit(/0\.7초\+ 연속 정지\s+(\d+)곳/).replace(/\D/g, "") || 0;

const chip = (state, text) => `<span class="chip ${state}">${text}</span>`;

const html = `<title>${esc(name.replace(/^\d+-/, ""))} 렌더 리뷰</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+KR:wght@400;500;600&display=swap">
<style>
  :root{
    --paper:#F5F3ED; --raise:#FFFFFF; --ink:#1B2A20; --mut:#6B7A6E; --line:#DDD9CE;
    --ok:#14532D; --warn:#8A6400; --bad:#8A1C1C;
    --ok-bg:#E4EDE5; --warn-bg:#F6EEDA; --bad-bg:#F5E3E1;
    --sans:"IBM Plex Sans KR",-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif;
    --mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  }
  @media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
    --paper:#12150F; --raise:#1B1F17; --ink:#E8E6DC; --mut:#8D9A8B; --line:#2C332A;
    --ok:#5FAE72; --warn:#D3A22C; --bad:#E0736A;
    --ok-bg:#1B2A1E; --warn-bg:#2C2513; --bad-bg:#2E1A18;
  }}
  :root[data-theme="dark"]{
    --paper:#12150F; --raise:#1B1F17; --ink:#E8E6DC; --mut:#8D9A8B; --line:#2C332A;
    --ok:#5FAE72; --warn:#D3A22C; --bad:#E0736A;
    --ok-bg:#1B2A1E; --warn-bg:#2C2513; --bad-bg:#2E1A18;
  }
  *{box-sizing:border-box}
  body{background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:15px;line-height:1.6;margin:0;padding:28px 18px 72px}
  .wrap{max-width:900px;margin:0 auto;display:flex;flex-direction:column;gap:26px}
  header h1{font-size:23px;font-weight:600;letter-spacing:-.02em;margin:0 0 5px;text-wrap:balance}
  header p{margin:0;color:var(--mut);font-size:12.5px;font-family:var(--mono);font-variant-numeric:tabular-nums}
  .status{display:flex;flex-wrap:wrap;gap:7px}
  .chip{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;font-size:12.5px;font-weight:500;border:1px solid transparent}
  .chip::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor;flex:none}
  .chip.ok{color:var(--ok);background:var(--ok-bg);border-color:var(--ok-bg)}
  .chip.warn{color:var(--warn);background:var(--warn-bg);border-color:var(--warn-bg)}
  .chip.bad{color:var(--bad);background:var(--bad-bg);border-color:var(--bad-bg)}
  .chip b{font-family:var(--mono);font-weight:500}
  section>h2{font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);margin:0 0 10px}
  .chart{overflow-x:auto}
  .chart svg{display:block;width:100%;min-width:620px;height:190px}
  .cap{color:var(--mut);font-size:13px;margin:10px 0 0;max-width:64ch}
  .seams{display:flex;flex-direction:column;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:10px;overflow:hidden}
  .seam{background:var(--raise);display:grid;grid-template-columns:3px 1fr;gap:14px;align-items:start;padding:0}
  .stripe{background:var(--ok)} .seam.warn .stripe{background:var(--warn)} .seam.bad .stripe{background:var(--bad)}
  .body{padding:13px 15px 15px 1px;display:flex;flex-direction:column;gap:10px}
  .hd{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
  .hd .nm{font-weight:600;font-size:14px}
  .hd .tc{font-family:var(--mono);font-size:12.5px;color:var(--mut);font-variant-numeric:tabular-nums}
  .hd .dv{margin-left:auto;font-family:var(--mono);font-size:13px;font-weight:500;font-variant-numeric:tabular-nums}
  .seam.ok .dv{color:var(--ok)} .seam.warn .dv{color:var(--warn)} .seam.bad .dv{color:var(--bad)}
  .pair{display:flex;gap:9px;flex-wrap:wrap}
  figure{margin:0;display:flex;flex-direction:column;gap:5px}
  figure img{display:block;width:132px;border-radius:4px;border:1px solid var(--line)}
  figcaption{color:var(--mut);font-size:11px;font-family:var(--mono);font-variant-numeric:tabular-nums}
  .note{background:var(--raise);border:1px solid var(--line);border-radius:10px;padding:13px 15px;color:var(--mut);font-size:13.5px;max-width:66ch}
  .note b{color:var(--ink);font-weight:600}
  @media (prefers-reduced-motion:no-preference){.chip{transition:none}}
</style>
<div class="wrap">
<header>
  <h1>${esc(name.replace(/^\d+-/, ""))} 렌더 리뷰</h1>
  <p>${esc(basename(file))} · ${(N / fps).toFixed(1)}초 · ${fps}fps · ${N}프레임 · 그라운드 #${[BR, BG, BB].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}</p>
</header>

<div class="status">
  ${chip(blanks.length ? "bad" : "ok", `빈 화면 <b>${blanks.length}</b>프레임`)}
  ${chip(nBad ? "warn" : "ok", `살펴볼 이음매 <b>${nBad}</b>/${seams.length}`)}
  ${chip(stillN ? "warn" : "ok", `0.7초+ 정지 <b>${stillN}</b>곳`)}
  ${chip("ok", `화면 변화 <b>${esc(mAudit(/화면이 바뀌는 프레임\s+([\d.]+)%/))}</b>%`)}
</div>

<section>
  <h2>프레임별 밀도</h2>
  <div class="chart">
  <svg viewBox="0 0 ${CW} ${CH}" preserveAspectRatio="none" role="img" aria-label="시간에 따른 화면 잉크 밀도">
    <line x1="${PL}" y1="${py(maxD)}" x2="${CW - PR}" y2="${py(maxD)}" stroke="var(--line)" stroke-width="1"/>
    <line x1="${PL}" y1="${py(maxD / 2)}" x2="${CW - PR}" y2="${py(maxD / 2)}" stroke="var(--line)" stroke-width="1"/>
    <line x1="${PL}" y1="${py(0)}" x2="${CW - PR}" y2="${py(0)}" stroke="var(--line)" stroke-width="1"/>
    <text x="${PL - 7}" y="${py(maxD) + 4}" fill="var(--mut)" font-size="11" font-family="var(--mono)" text-anchor="end">${maxD.toLocaleString()}</text>
    <text x="${PL - 7}" y="${py(maxD / 2) + 4}" fill="var(--mut)" font-size="11" font-family="var(--mono)" text-anchor="end">${Math.round(maxD / 2).toLocaleString()}</text>
    <text x="${PL - 7}" y="${py(0) + 4}" fill="var(--mut)" font-size="11" font-family="var(--mono)" text-anchor="end">0</text>
    ${seams.map((s) => `<line x1="${px(s.k).toFixed(1)}" y1="${PT}" x2="${px(s.k).toFixed(1)}" y2="${py(0)}" stroke="var(--${s.st === "ok" ? "line" : s.st})" stroke-width="${s.st === "ok" ? 1 : 1.5}" stroke-dasharray="${s.st === "ok" ? "3 3" : "none"}"/>`).join("")}
    <polygon points="${area}" fill="var(--ok)" fill-opacity="0.13" stroke="none"/>
    <polyline points="${pts.join(" ")}" fill="none" stroke="var(--ok)" stroke-width="1.4" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    ${ticks.map((t) => `<text x="${px(t * fps).toFixed(1)}" y="${CH - 6}" fill="var(--mut)" font-size="11" font-family="var(--mono)" text-anchor="middle">${t}s</text>`).join("")}
  </svg>
  </div>
  <p class="cap">세로선이 컷 경계다 — 실선은 살펴볼 곳. 세로축은 배경이 아닌 화소 수이고 최댓값이 <b>${maxD.toLocaleString()}</b>다.
  <b>바닥에 닿는 구간</b>은 화면이 빈 곳, <b>평평한 구간</b>은 정지다. 다만 얇은 선이 자라는 모션은 여기서도 평평해 보이니 프레임을 봐야 한다.</p>
</section>

${blankRuns.length ? `<section>
  <h2>빈 화면</h2>
  <div class="pair">${blankRuns.map(([a, b]) => `<figure><img src="${byFrame.get(a) || ""}" alt="${fmtT(a)} 프레임"><figcaption>${fmtT(a)} · ${b - a + 1}f (${Math.round((b - a + 1) / fps * 1000)}ms)</figcaption></figure>`).join("")}</div>
  <p class="cap">배경·락업·자막만 남은 프레임이다. <b>컷 양쪽이 다 비면 이음매 Δ 가 0 으로 나와</b> 이음매 검사로는 안 보인다.</p>
</section>` : ""}

<section>
  <h2>이음매 ${seams.length}곳</h2>
  <div class="seams">
  ${seams.map((s) => `<div class="seam ${s.st}"><div class="stripe"></div><div class="body">
      <div class="hd"><span class="nm">F${s.i + 1} → F${s.i + 2}</span><span class="tc">${fmtT(s.k)}</span><span class="dv">${s.label}</span></div>
      <div class="pair">
        <figure><img src="${byFrame.get(s.k - 1) || ""}" alt="컷 직전"><figcaption>직전 · ${s.a.toLocaleString()}px</figcaption></figure>
        <figure><img src="${byFrame.get(s.k) || ""}" alt="컷 직후"><figcaption>직후 · ${s.c.toLocaleString()}px</figcaption></figure>
      </div></div></div>`).join("")}
  </div>
  <p class="note">화소 Δ 가 크다고 결함이 아니다 — 「글자 하나 → 꽉 찬 카드」는 구조적 차이다.
  볼 것은 <b>같은 요소가 같은 자리로 이어지는가</b> 하나다.
  이상하면 <b>그 시각을 알려 달라</b> — 「16.0초 여기」 한 마디면 원인을 찾는 시간이 사라진다.</p>
</section>
</div>`;

const outFile = join(out, "review.html");
writeFileSync(outFile, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`\n  ✓ ${outFile}  (${kb}KB · 이미지 ${byFrame.size}장 내장)`);
console.log(`    빈 화면 ${blanks.length}프레임 · 이음매 ${bounds.length}곳 · ${(N / fps).toFixed(1)}초\n`);
