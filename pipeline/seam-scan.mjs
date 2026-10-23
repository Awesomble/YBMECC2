#!/usr/bin/env node
// seam-scan.mjs — 컷 이음매를 조립본에서 잰다 (2026-09-09 신설)
//
//   node pipeline/seam-scan.mjs <프로젝트> [영상.mp4]
//   (영상을 안 주면 output/<p>/ 의 가장 새로운 render-hf-*.mp4 를 쓴다)
//   가로(1920×1080) 묶음(hf-bundle): 경계 = cuts.json 챕터·전환(gap) 앞뒤 + 조립본 슬롯 시작, 락업·자막 띠도 가로 좌표로 뺀다.
//
// 왜 필요한가 (docs/02-pitfalls.md):
//   00003 에서 프레임 워커들이 이음매를 **격리 하네스로** 재다가 사고가 났다 —
//   남의 프레임을 얹어 재면 값이 달라져 상대를 틀렸다고 지목하게 되고,
//   클립의 첫·마지막 프레임은 조립본과 어긋난다. **이음매는 조립본에서만 잰다.**
//
// 측정 표준 (docs/14-hyperframes.md §3-b ④)
//   · 프레임 경계는 audio_meta.json 의 duration_s 누적 (표시 초)
//   · 컷에 맞닿은 스텝끼리 비교한다 — 앞의 마지막 프레임 ↔ 뒤의 첫 프레임
//   · 🔴 배경색을 상수로 박지 마라. 비네트·그라디언트가 있으면 팔레트 값이 화면에
//     그대로 안 나온다 (00003 실측: #14532D 규격인데 렌더 배경은 #0B3C1E).
//     **영상 전체의 최빈색**을 그라운드로 삼는다 — 팔레트가 바뀌어도 산다.
//     ⚠️ 프레임마다 최빈색을 새로 뽑으면 안 된다. 카드가 화면 절반을 넘는 프레임에서
//     전경·배경이 뒤집힌다 (실측: F9→F10 이 −4.5% 대신 +178% 로 나왔다).
//   · 자막존과 채널 락업은 빼고 센다 (자막은 늘 바뀌고 락업은 늘 있다)
//
// ⚠️ 판정 기준은 **방향**이다. 크기는 참고 기록으로만 써라 —
//    「물체의 속도」는 단일 값이 아니고 추정기에 따라 0.50~1.76 배로 흩어진다.
//    화소 Δ 가 큰 이음매가 전부 결함인 것도 아니다 (희박한 화면 → 꽉 찬 카드는 구조적 차이).
import { spawnSync, spawn } from "node:child_process";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveProject } from "./lib/project.mjs";

const argv = process.argv.slice(2);
const { dir, name, out } = resolveProject(argv[0], { usage: "node pipeline/seam-scan.mjs <프로젝트> [영상.mp4]" });

// ── 영상 고르기 ──
let file = argv[1];
if (!file) {
  const cands = existsSync(out)
    ? readdirSync(out).filter((f) => /^render.*\.mp4$/.test(f)).map((f) => join(out, f))
    : [];
  if (!cands.length) { console.error(`✗ ${out} 에 render*.mp4 가 없다`); process.exit(2); }
  file = cands.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}
if (!existsSync(file)) { console.error(`✗ 영상이 없다: ${file}`); process.exit(2); }

// ── 캔버스 — 묶음 롱폼(hf-bundle)은 1920×1080 가로다. 경계·제외 밴드·읽기 방식이 달라진다 ──
const idxPath = join(dir, "hyperframes", "index.html");
const idx = existsSync(idxPath) ? readFileSync(idxPath, "utf8") : "";
const at = (tag, k) => (tag.match(new RegExp(`${k}="([^"]*)"`)) || [])[1];
const rootTag = (idx.match(/<div\b[^>]*\bid="root"[^>]*>/) || [""])[0];
const LAND = +at(rootTag, "data-width") > +at(rootTag, "data-height");

// ── 프레임 경계 ──
const bounds = [], names = [];   // names: 가로 묶음 전용 경계 이름
if (!LAND) {
  const metaPath = join(dir, "hyperframes", "audio_meta.json");
  if (!existsSync(metaPath)) { console.error(`✗ audio_meta.json 이 없다: ${metaPath}`); process.exit(2); }
  const voices = JSON.parse(readFileSync(metaPath, "utf8")).voices || [];
  if (voices.length < 2) { console.error("✗ 프레임이 2개 미만이다"); process.exit(2); }
  let acc = 0;
  for (const v of voices.slice(0, -1)) { acc += v.duration_s; bounds.push(+acc.toFixed(4)); }
} else {
  // 묶음에는 audio_meta 가 없다. 경계 = cuts.json 의 챕터·전환(gap) 앞뒤 + 조립본 무대 슬롯(track 1) 시작 + 전환 덮개 시작.
  // 같은 시각이면 먼저 넣은 cuts.json 이름(챕터 단위)이 남는다 (안정 정렬 + 아래 프레임 중복 제거).
  const cand = [];
  const cs = JSON.parse(readFileSync(join(dir, "cuts.json"), "utf8")).cuts || [];
  let t = 0;
  cs.slice(0, -1).forEach((c, i) => { t = Math.round((t + +c.dur) * 1e6) / 1e6; cand.push({ t, name: `${c.id}→${cs[i + 1].id}` }); });
  const seq = {};
  const scenes = [...idx.matchAll(/<div\b[^>]*class="[^"]*\bscene\b[^"]*"[^>]*>/g)].map((m) => m[0])
    .filter((tg) => at(tg, "data-composition-src") && at(tg, "data-track-index") === "1")
    .map((tg) => ({ id: at(tg, "data-composition-id") || "", start: +at(tg, "data-start"), dur: +at(tg, "data-duration") }))
    .sort((a, b) => a.start - b.start)
    .map((s) => {
      const m = /^c(\d\d)-/.exec(s.id);
      if (!m) return { ...s, tag: s.id.replace(/^bundle-/, "") };
      seq[m[1]] = (seq[m[1]] || 0) + 1;
      return { ...s, tag: `ch${m[1]} F${seq[m[1]]}` };
    });
  scenes.forEach((s, i) => {
    if (!i) return;
    const p = scenes[i - 1], pe = Math.round((p.start + p.dur) * 1e6) / 1e6;
    if (pe < s.start - 1e-3) cand.push({ t: pe, name: `${p.tag} 끝→빈 무대` });   // 슬롯 사이 구멍
    cand.push({ t: s.start, name: `${p.tag}→${s.tag}` });
  });
  for (const m of idx.matchAll(/<div\b[^>]*\bid="gap-(\d+)"[^>]*>/g)) cand.push({ t: +at(m[0], "data-start"), name: `gap${m[1]} 덮개` });
  cand.sort((a, b) => a.t - b.t);
  for (const c of cand) { bounds.push(c.t); names.push(c.name); }
  if (!bounds.length) { console.error("✗ 묶음 경계를 못 찾았다 — cuts.json·index.html 확인"); process.exit(2); }
}

// ── fps 는 영상에서 읽는다 (손으로 넘기면 시간축이 통째로 어긋난다) ──
const pr = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0",
  "-show_entries", "stream=r_frame_rate", "-of", "default=nw=1:nk=1", file], { encoding: "utf8" });
const fm = (pr.stdout || "").trim().match(/^(\d+)\s*\/\s*(\d+)/);
const fps = fm && +fm[2] ? +fm[1] / +fm[2] : 60;

// 경계 t 의 새 컷 첫 프레임 (아래 루프 주석 참고). 가로는 51.2*60 같은 부동소수 초과로 한 칸 밀리지 않게 1e-6 을 깎는다.
const kOf = (t) => LAND ? Math.ceil(t * fps - 1e-6) : Math.ceil(t * fps);

// ── 프레임을 한 번에 읽는다 (프레임마다 seek 하면 느리고 한 칸씩 밀린다) ──
const W = LAND ? 480 : 270, H = LAND ? 270 : 480, FR = W * H * 3;
let buf, N, slot = (n) => n;   // slot: 프레임 번호 → 버퍼 칸
if (!LAND) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vf",
    `scale=${W}:${H}:flags=neighbor,format=rgb24`, "-f", "rawvideo", "-"],
    { maxBuffer: 2_000_000_000, encoding: "buffer" });
  if (r.status !== 0) { console.error("ffmpeg 실패:", r.stderr?.toString().slice(0, 300)); process.exit(2); }
  buf = r.stdout; N = Math.floor(buf.length / FR);
} else {
  // 🔴 롱폼은 통째로 못 읽는다 — 105초만 돼도 480×270 rgb24 가 2.45GB 로 maxBuffer 를 넘는다.
  //    한 번 디코드하되 select 로 경계 앞뒤 + 그라운드 표본만 꺼낸다. n 은 디코드 순번이라 seek 오차가 없다.
  const pj = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries",
    "stream=nb_frames:format=duration", "-of", "json", file], { encoding: "utf8" }).stdout || "{}");
  N = +pj.streams?.[0]?.nb_frames || Math.floor(+pj.format?.duration * fps);
  const want = new Set();
  for (let n = 0; n < N; n += Math.max(1, Math.floor(N / 60))) want.add(n);
  for (const t of bounds) { const k = kOf(t); if (k >= 1 && k < N) { want.add(k - 1); want.add(k); } }
  const list = [...want].sort((a, b) => a - b);
  // 🔴 select=eq(n,…)+… 를 한 줄로 만들면 4분 묶음(경계 60여 곳·표본 120여 장)에서 ffmpeg 식 파서가 실패했다
  //    (2026-09-26 L1: "Error while parsing expression"). 한 번 디코드하며 스트림에서 필요한 번호만 남긴다 — 메모리는 한 프레임 분량.
  const keep = new Set(list);
  buf = await new Promise((res, rej) => {
    const p = spawn("ffmpeg", ["-v", "error", "-i", file, "-vf", `scale=${W}:${H}:flags=neighbor,format=rgb24`, "-f", "rawvideo", "-"]);
    const out = []; let acc = Buffer.alloc(0), n = 0, err = "";
    p.stdout.on("data", (d) => {
      acc = acc.length ? Buffer.concat([acc, d]) : d;
      while (acc.length >= FR) { if (keep.has(n)) out.push(Buffer.from(acc.subarray(0, FR))); acc = acc.subarray(FR); n++; }
    });
    p.stderr.on("data", (d) => { err += d; });
    p.on("close", (c) => (c === 0 ? res(Buffer.concat(out)) : rej(new Error(err.slice(0, 300)))));
  }).catch((e) => { console.error("ffmpeg 실패:", e.message); process.exit(2); });
  if (Math.floor(buf.length / FR) !== list.length) { console.error(`✗ 프레임 ${list.length}장을 골랐는데 ${Math.floor(buf.length / FR)}장이 나왔다`); process.exit(2); }
  const pos = new Map(list.map((n, i) => [n, i]));
  slot = (n) => pos.get(n);
}

// 제외 밴드 (원본 1080×1920 기준 → 이 해상도로 환산). 세로 락업은 전폭 띠라 x 는 전체다.
let y0 = Math.round(232 / 1920 * H), y1 = Math.round(350 / 1920 * H);   // 채널 락업
let yCap = Math.round(1260 / 1920 * H);                                  // 자막존
let x0 = 0, x1 = W - 1;
const BURN = LAND && /\blf-cap\b/.test(idx);
if (LAND) {
  // 가로 묶음 (1920×1080): 락업 사각형 x48~352·y40~86 (±1칸), 캡션 굽기면 아래 자막 띠 y930~ 제외.
  // 챕터 라벨(왼쪽 여백 y106 부근)은 챕터 시작의 실제 화면 변화라 포함한다.
  x0 = Math.floor(48 / 1920 * W) - 1; x1 = Math.ceil(352 / 1920 * W) + 1;
  y0 = Math.floor(40 / 1080 * H) - 1; y1 = Math.ceil(86 / 1080 * H) + 1;
  yCap = BURN ? Math.floor(930 / 1080 * H) : H;
}

// ── 배경색은 **영상 전체**의 최빈색으로 한 번만 정한다 ──────────────────────
// 🔴 프레임마다 최빈색을 새로 뽑으면 안 된다. 크림 카드가 화면의 절반을 넘는 프레임에서는
//    최빈색이 카드가 되어 **전경과 배경이 뒤집힌다** (2026-09-09 실측: F9→F10 이
//    −0.2% 에서 +178% 로 뒤집혔다). 우리 규격은 「그라운드 고정」(docs/11-motion.md)이라
//    영상 전체의 최빈색이 곧 그라운드다. 팔레트를 상수로 박지 않으면서 뒤집히지도 않는다.
//    ⚠️ 그라운드를 의도적으로 바꾸는 연출(00003 F5 의 #0B3C1E→#0F3D22)은 tol 12 안에
//    들어오므로 문제없다. 그라운드를 크게 바꾸는 영상이면 이 도구를 쓰기 전에 다시 생각하라.
const gh = new Map();
for (let n = 0; n < N; n += Math.max(1, Math.floor(N / 60))) {
  const base = slot(n) * FR;
  for (let y = 0; y < yCap; y += 2) {
    for (let x = 0; x < W; x += 2) {
      if (y >= y0 && y <= y1 && x >= x0 && x <= x1) continue;
      const o = base + (y * W + x) * 3;
      const k = ((buf[o] >> 4) << 8) | ((buf[o + 1] >> 4) << 4) | (buf[o + 2] >> 4);
      gh.set(k, (gh.get(k) || 0) + 1);
    }
  }
}
let gbest = 0, gk = 0;
for (const [k, v] of gh) if (v > gbest) { gbest = v; gk = k; }
const br = ((gk >> 8) & 15) * 17, bg = ((gk >> 4) & 15) * 17, bb = (gk & 15) * 17;

// 프레임 n 의 (전경 화소수, 전경 평균휘도)
function stat(n) {
  const base = slot(n) * FR;
  let cnt = 0, lum = 0;
  for (let y = 0; y < yCap; y++) {
    for (let x = 0; x < W; x++) {
      if (y >= y0 && y <= y1 && x >= x0 && x <= x1) continue;
      const o = base + (y * W + x) * 3;
      const R = buf[o], G = buf[o + 1], B = buf[o + 2];
      if ((Math.abs(R - br) + Math.abs(G - bg) + Math.abs(B - bb)) / 3 < 12) continue;
      cnt++; lum += 0.299 * R + 0.587 * G + 0.114 * B;
    }
  }
  return { cnt, lum: cnt ? lum / cnt : 0 };
}

console.log(`\n  ${name}  ${file.split("/").pop()}  ${fps}fps · ${N}프레임${LAND ? " · 가로 묶음 (챕터·전환 경계 포함)" : ""}`);
console.log(`  그라운드 #${[br,bg,bb].map((v)=>v.toString(16).padStart(2,"0")).join("").toUpperCase()} (영상 전체 최빈색) · tol 12 · ${LAND ? `락업${BURN ? "·자막 띠" : ""} 제외 · 챕터 라벨 포함` : "자막존/락업 제외"}\n`);
console.log(LAND ? "  이음매                      시각      마지막(전)      첫(후)      화소 Δ     휘도 Δ"
                 : "  이음매      마지막(전)      첫(후)      화소 Δ     휘도 Δ");
let flagged = 0;
const seen = new Set();   // 가로: 같은 프레임에 떨어진 경계는 한 번만
for (let i = 0; i < bounds.length; i++) {
  // 🔴 2026-09-11 정정 — 여기가 Math.round 였다. 경계 t 의 소수부가 0.5 미만이면
  //    k 와 k-1 이 **둘 다 이전 컷 안**에 남아 실제 경계를 한 번도 비교하지 않는다.
  //    00008 실측: 24개 경계 중 **15개(63%)** 가 이 케이스였고 전부 「0.0% ✓」로 통과했다
  //    (같은 컷의 두 프레임이니 당연하다). 그 사이에 F11→F12 의 바 차트 리와인드가
  //    숨어 있었고 감독이 프레임을 직접 뽑아서야 잡았다.
  //    프레임 n 은 [n/fps, (n+1)/fps) 를 덮고 n/fps 시점으로 샘플링되므로,
  //    새 컷의 첫 프레임은 ceil(t·fps) 이고 이전 컷의 마지막은 그 -1 이다.
  const k = kOf(bounds[i]);
  if (k < 1 || k >= N) continue;
  if (LAND) { if (seen.has(k)) continue; seen.add(k); }
  const a = stat(k - 1), b = stat(k);
  const d = a.cnt ? (b.cnt - a.cnt) / a.cnt * 100 : NaN;
  // ⚠️ 이 표시는 "봐야 할 곳"이지 합불이 아니다. 눈으로 확인하고 판단해라.
  const mark = !a.cnt || !b.cnt ? "🔴 한쪽이 비었다" : Math.abs(d) >= 55 ? "🔴" : Math.abs(d) >= 25 ? "△" : "✓";
  if (mark.startsWith("🔴")) flagged++;
  const fa = LAND ? `${names[i].padEnd(22)} ${bounds[i].toFixed(3).padStart(8)}s` : `F${i + 1}→F${i + 2}`.padEnd(9);
  console.log(`  ${fa} ${String(a.cnt).padStart(9)}  ${String(b.cnt).padStart(9)}  ${(isFinite(d) ? d.toFixed(1) + "%" : "—").padStart(9)}  ${(b.lum - a.lum).toFixed(2).padStart(8)}  ${mark}`);
}
console.log(`\n  🔴 ${flagged}곳 — 프레임을 뽑아 눈으로 보고 판단해라. 수치만으로 반려하지 마라.\n`);
process.exit(0);   // 게이트가 아니다 — 판정은 사람이 한다
