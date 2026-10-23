#!/usr/bin/env node
// motion-audit.mjs — 영상이 실제로 움직이는지 잰다 (2026-09-08 신설)
//
//   node pipeline/motion-audit.mjs <영상.mp4> [--json] [--from <초> --to <초>]
//   (fps 는 영상에서 자동으로 읽는다. --fps 는 강제 지정용이고 어긋나면 경고한다)
//
// 왜 필요한가: 2026-09-08 에 이음매·컷 정렬은 전부 통과했는데 사용자가
// "목소리만 빨라진 것 같다"고 했다. 재 보니 **영상의 64.9%가 정지 화면**이었다.
// 컷과 싱크만 재고 **프레임 내부 전개를 재지 않아서** 놓친 결함이다.
// 프레임 간 픽셀 변화량으로 정지 구간을 찾는다. 자막 띠는 빼고 잰다(자막은 늘 바뀌므로).
//
// 판정 기준 (docs/11-motion.md)
//   · 0.7초 이상 연속 정지  → 0곳이어야 한다
//   ⚠️ 60fps 영상은 프레임 간격이 절반이라 **얇은 선이 자라는 모션·moving hold 가 안 잡힌다**
//      (00003 세션 실측: 같은 영상이 30fps 0곳 / 60fps 1곳 — 눈으로 보니 헤어라인이 화면 폭 40%만큼
//      자라고 있던 거짓 실패였다). 60fps 영상은 `--from/--to` 로 30fps 상당 구간을 함께 보거나,
//      걸린 구간을 반드시 눈으로 대조하라.
//   · 유의미한 움직임(>1.0) → 40% 이상
//   · **빈 화면 0프레임** (2026-09-08 추가) — 화면이 배경 단색만 남은 프레임.
//     ⚠️ 이건 위의 "정지 구간"으로 안 잡힌다. 빈 프레임이 2~3개면 0.7초에 한참 못 미치고,
//     컷 **양쪽이 다 비면** 이음매 화소 Δ 도 0 으로 나온다. 어느 잣대로도 안 보이는 사각지대라
//     따로 센다. 00003 v7 에서 이걸로 세 군데(117ms·17ms·50ms)를 찾았다.
//   ⚠️ 반대쪽 함정: 그레인·플리커·상시 드리프트로 수치를 올리지 마라. 그건 idle wobble 이고
//      2026-08-24 폐기 사유다. 이 도구는 "움직임의 양"만 재지 "의미"는 못 잰다 — 눈으로 같이 봐라.
import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith("--"));
if (!file) { console.error("usage: motion-audit.mjs <영상.mp4> [--fps 30] [--json]"); process.exit(2); }
// ⚠️ fps 를 손으로 넘기지 마라 — 틀리면 시간축이 통째로 어긋난다 (2026-09-08, 00003 세션 지적).
//    60fps 영상을 30 으로 재면 34.6초 영상에 "61~68초 정지"가 찍힌다. 영상에서 직접 읽는다.
function probeFps(f) {
  const r = spawnSync("ffprobe", ["-v","error","-select_streams","v:0",
    "-show_entries","stream=r_frame_rate","-of","default=nw=1:nk=1", f], { encoding: "utf8" });
  const m = (r.stdout || "").trim().match(/^(\d+)\s*\/\s*(\d+)/);
  return m && +m[2] ? +m[1] / +m[2] : null;
}
const fpsArg = argv.indexOf("--fps") >= 0 ? Number(argv[argv.indexOf("--fps") + 1]) : null;
const fpsReal = probeFps(file);
const fps = fpsArg || fpsReal || 30;
// 가로 롱폼 묶음(1920×1080, docs/channel/08-longform.md)은 락업·자막 띠 좌표가 다르다. 세로는 기존 크롭 그대로.
const dims = (spawnSync("ffprobe", ["-v","error","-select_streams","v:0","-show_entries","stream=width,height","-of","csv=p=0", file], { encoding: "utf8" }).stdout || "").trim().split(",").map(Number);
const LANDSCAPE = dims[0] > dims[1];
// 가로는 원본 무대가 놓이는 가운데 1080×900만 잰다. 좌우 840px 여백(칼럼 방식의 단색 면)까지 세면
// 한 색 비율이 부풀어, 원본에서 통과한 장면이 「빈 화면」으로 잡혔다(00026 00014 62.9초, 2026-09-26).
const CROP_BODY  = LANDSCAPE ? "crop=1080:900:420:20" : "crop=1080:1200:0:180";   // 가로: 자막 띠(y930~) 제외
const CROP_THUMB = LANDSCAPE ? "crop=1080:900:420:20" : "crop=1080:1030:0:360";
if (fpsArg && fpsReal && Math.abs(fpsArg - fpsReal) > 0.01)
  console.error(`  ⚠️ --fps ${fpsArg} 를 줬지만 영상은 ${fpsReal}fps 다 — 시간축이 어긋난다`);
const asJson = argv.includes("--json");

// ── 구간만 재기 ──  --from <초> --to <초>  (프레임 하나만 검산할 때)
const from = Number(argv[argv.indexOf("--from") + 1]);
const to   = Number(argv[argv.indexOf("--to")   + 1]);


const W = 192, H = 214, FR = W * H * 3;   // 작은 요소 변화를 놓치지 않을 해상도 · RGB(3채널)
// 상단 로고(0~180)와 하단 자막띠(1380~)를 뺀 본문만 — 자막 교체가 모션으로 잡히면 안 된다
// ⚠️ **흑백으로 재지 마라.** 우리 팔레트의 딥그린(#14532D 휘도 59.8)과 관보레드(#8A1C1C 휘도 60.9)는
//    휘도가 거의 같다 — 화면 전체를 덮는 색면 이동이 변화량 0 으로 잡힌다 (2026-09-08 실측).
const r = spawnSync("ffmpeg", ["-v","error","-i",file,"-vf",
  `${CROP_BODY},scale=${W}:${H},format=rgb24`,"-f","rawvideo","-"],
  // 롱폼 묶음(3~4분·60fps)은 원시 프레임이 1GB를 넘는다(227초 ≈ 1.7GB) — 한도를 영상 길이에 맞게 둔다
  { maxBuffer: Math.max(1 << 30, Math.ceil((Number(spawnSync("ffprobe", ["-v","error","-show_entries","format=duration","-of","csv=p=0", file], { encoding: "utf8" }).stdout) || 0) * fps * W * H * 3 * 1.1)), encoding: "buffer" });
if (r.status !== 0) { console.error("ffmpeg 실패:", r.stderr?.toString().slice(0,400)); process.exit(2); }
const buf = r.stdout, n = Math.floor(buf.length / FR);
if (n < 2) { console.error("프레임을 못 읽었다"); process.exit(2); }

// ⚠️ 전체 평균 변화량으로 재면 **작은 요소의 변화를 놓친다** (2026-09-08 실측:
//    라벨 하나가 회색→잉크로 바뀌는 프레임을 "정지"로 잡아 64.9% 라는 과장된 수치가 나왔다).
//    "몇 픽셀이 눈에 띄게 바뀌었나"로 센다. 크기가 아니라 **변화의 유무**가 기준이다.
const PIX = 12;      // 세 채널 중 하나라도 이만큼 바뀌면 그 픽셀은 변한 것
const MIN = 40;      // 그런 픽셀이 이 개수 이상이면 "화면이 바뀌었다"
const changed = [];
for (let i = 1; i < n; i++) {
  let c = 0;
  for (let k = 0; k < FR; k += 6) {          // 픽셀 2개당 1개 표본 (RGB 3바이트 × 2)
    const o = (i-1)*FR + k, p2 = i*FR + k;
    if (Math.abs(buf[o] - buf[p2]) > PIX || Math.abs(buf[o+1] - buf[p2+1]) > PIX || Math.abs(buf[o+2] - buf[p2+2]) > PIX) c++;
  }
  changed.push(c);
}
let visible = changed.map((c) => c >= MIN);
let offset = 0;
if (Number.isFinite(from) && Number.isFinite(to)) {   // 구간 한정
  offset = Math.max(0, Math.round(from * fps));
  visible = visible.slice(offset, Math.round(to * fps));
}
const real = visible.filter(Boolean).length;
const still = visible.length - real;

// 변화가 아예 없는 구간이 0.7초를 넘으면 죽은 시간이다
const runs = [];
let s = null;
for (let i = 0; i < visible.length; i++) {
  if (!visible[i]) { if (s === null) s = i; }
  else { if (s !== null && (i - s) / fps >= 0.7) runs.push([+((s+offset)/fps).toFixed(2), +((i+offset)/fps).toFixed(2), +((i-s)/fps).toFixed(2)]); s = null; }
}
if (s !== null && (visible.length - s) / fps >= 0.7) runs.push([+((s+offset)/fps).toFixed(2), +((visible.length+offset)/fps).toFixed(2), +((visible.length-s)/fps).toFixed(2)]);
const diff = changed;

/* 🔴 **썸네일 정지** (2026-09-15 · 00016 「최악」). 위의 0.7초 정지는 화소 변화량이라
   38px 행이 y:14 로 흔들리거나 brightness 가 0.72→1 로 바뀌는 **미세 트윈**이 있으면 통과한다.
   00016 은 표 하나가 8초 넘게 서 있었는데 정지 0곳이었다 — 18장 격자를 눈으로 보고서야 잡았다.
   구도 수준으로 내려 잰다: 자막 띠를 빼고 27×26 회색으로 줄여 0.5초 간격 평균 차 < 2.0 인 연속 구간.
   실측 최장: 승인본 00003 3.5 · 00004 4.0 · 00009 3.5 · 00013 3.0 · 00015 3.5  ·  반려 00016 **7.5**. 하드 5초. */
const THUMB_STILL_S = 5;
let thumbRuns = [];
try {
  const raw = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `fps=2,${CROP_THUMB},scale=27:26,format=gray`,
    '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 26 }).stdout;
  const N = 27 * 26, fr = []; for (let i = 0; i + N <= raw.length; i += N) fr.push(raw.subarray(i, i + N));
  let s = null;
  for (let i = 1; i <= fr.length; i++) {
    let d = 0; if (i < fr.length) { for (let j = 0; j < N; j++) d += Math.abs(fr[i][j] - fr[i - 1][j]); d /= N; }
    if (i < fr.length && d < 2.0) { if (s === null) s = i - 1; }
    else { if (s !== null && (i - s) * 0.5 >= THUMB_STILL_S) thumbRuns.push([s * 0.5, i * 0.5, (i - s) * 0.5]); s = null; }
  }
} catch {}

// ── 빈 화면 검사 (2026-09-08 신설) ────────────────────────────────────────
// 「화면에 배경밖에 없는 프레임」을 센다. 위의 정지 검사와 다른 것을 잡는다 —
// 정지는 **변화가 없는** 것이고 이건 **내용이 없는** 것이다. 빈 프레임 3개는
// 정지 0.7초에 한참 못 미치고, 컷 양쪽이 다 비면 이음매 Δ 도 0 이 나온다.
//
// ⚠️ 배경색을 상수로 박지 마라. 렌더에 비네트·그라디언트가 들어가면 팔레트 값
//    (#14532D)이 화면에 그대로 나오지 않는다 — 00003 실측 배경은 #0B3C1E 였다.
//    **프레임 자신의 최빈색**을 배경으로 삼는다. 그러면 팔레트가 바뀌어도 산다.
// ⚠️ 채널 락업은 늘 화면에 있으므로 빼고 센다. crop 이 y180 에서 시작하니
//    락업 y232~350 은 스케일 후 행 9~31 이다.
const LOCK0 = Math.round((232 - 180) / 1200 * H), LOCK1 = Math.round((350 - 180) / 1200 * H);
const BLANK_SHARE = 0.985;        // 단일 색이 이 비율을 넘으면 "빈 화면"
const blankFrames = [];
for (let i = 0; i < n; i++) {
  const hist = new Map();
  let tot = 0;
  for (let y = 0; y < H; y++) {
    if (y >= LOCK0 && y <= LOCK1) continue;
    for (let x = 0; x < W; x++) {
      const o = i*FR + (y*W + x)*3;
      const key = ((buf[o] >> 4) << 8) | ((buf[o+1] >> 4) << 4) | (buf[o+2] >> 4);
      hist.set(key, (hist.get(key) || 0) + 1); tot++;
    }
  }
  let top = 0; for (const v of hist.values()) if (v > top) top = v;
  if (top / tot >= BLANK_SHARE) blankFrames.push(i);
}

// ── 페이로드 빈 프레임 (2026-09-10 신설 · W7 제안) ───────────────────────
// 🔴 위의 「빈 화면」은 **프레임 전체 잉크**를 본다. 그래서 브랜드 락업 + 헤드존 제목만 있어도
//    임계를 넘어 통과한다 — 00006 F16 에서 **페이로드 0 이 3프레임 연속**인데 1프레임만 잡혔다.
//    (docs/02-pitfalls.md §33 — 거짓 양성은 없지만 **거짓 음성이 있다**)
// 페이로드존(y636~1340, docs/14 §3-b)만 따로 센다. crop 이 y180 시작이라 스케일 후 행 81~207.
const PAY0 = Math.round((636 - 180) / 1200 * H), PAY1 = Math.round((1340 - 180) / 1200 * H);
const payBlank = [];
for (let i = 0; i < n; i++) {
  const hist = new Map(); let tot = 0;
  for (let y = PAY0; y <= Math.min(PAY1, H - 1); y++) for (let x = 0; x < W; x++) {
    const o = i*FR + (y*W + x)*3;
    const key = ((buf[o] >> 4) << 8) | ((buf[o+1] >> 4) << 4) | (buf[o+2] >> 4);
    hist.set(key, (hist.get(key) || 0) + 1); tot++;
  }
  let top = 0; for (const v of hist.values()) if (v > top) top = v;
  if (top / tot >= BLANK_SHARE) payBlank.push(i);
}
const payRuns = [];
for (const i of payBlank) {
  const last = payRuns[payRuns.length - 1];
  if (last && i === last[1] + 1) last[1] = i; else payRuns.push([i, i]);
}

const blankRuns = [];
for (const i of blankFrames) {
  const last = blankRuns[blankRuns.length - 1];
  if (last && i === last[1] + 1) last[1] = i; else blankRuns.push([i, i]);
}


const res = {
  duration_s: +(n/fps).toFixed(2),
  frozen_pct: +(still/visible.length*100).toFixed(1),
  changing_pct: +(real/visible.length*100).toFixed(1),
  dead_runs: runs,
  dead_total_s: +runs.reduce((a, x) => a + x[2], 0).toFixed(2),
  blank_frames: blankFrames.length,
  thumb_still_runs: thumbRuns,
  blank_runs: blankRuns.map(([a,b]) => [+(a/fps).toFixed(3), +((b+1)/fps).toFixed(3), b-a+1]),
};
if (asJson) { console.log(JSON.stringify(res, null, 2)); }
else {
  console.log(`\n  ${file}  ${res.duration_s}초${Number.isFinite(from) ? `  [${from}~${to}초 구간만]` : ""}`);
  console.log(`  화면이 바뀌는 프레임  ${res.changing_pct}%`);
  console.log(`  0.7초+ 연속 정지  ${runs.length}곳 · 합계 ${res.dead_total_s}초 ${runs.length ? "🔴" : "✅"}`);
  for (const [a,b,l] of runs) console.log(`     ${a.toFixed(2)} ~ ${b.toFixed(2)}   ${l.toFixed(2)}초`);
  console.log(`  ${THUMB_STILL_S}초+ 썸네일 정지 (구도가 안 바뀜)  ${thumbRuns.length}곳 ${thumbRuns.length ? "🔴 같은 화면이 서 있다 — 미세 트윈으로 정지 검사만 피한 것" : "✅"}`);
  for (const [a,b,l] of thumbRuns) console.log(`     ${a.toFixed(1)} ~ ${b.toFixed(1)}   ${l.toFixed(1)}초`);
  console.log(`  빈 화면 (배경만 남은 프레임)  ${res.blank_frames}개 ${res.blank_frames ? "🔴" : "✅"}`);
  console.log(`  페이로드 빈 프레임 (헤드존만 남음)  ${payBlank.length}개 ${payBlank.length ? "⚠️ 경고 — 캡처해서 사람이 판단" : "✅"}`);
  for (const [a,b] of payRuns) console.log(`     ${(a/fps).toFixed(3)} ~ ${((b+1)/fps).toFixed(3)}   ${b-a+1}프레임 (${Math.round((b-a+1)/fps*1000)}ms)`);
  for (const [a,b,f] of res.blank_runs) console.log(`     ${a.toFixed(3)} ~ ${b.toFixed(3)}   ${f}프레임 (${Math.round(f/fps*1000)}ms)`);
  console.log();
}
// 판정 기준 둘 — "0.7초+ 무변화 구간 0곳" · "빈 화면 0프레임"
// 🔴 판정 셋의 등급이 다르다 (2026-09-10)
//   전체 빈 화면 — **하드**. 거짓 양성이 없다
//   0.7초+ 정지  — **하드**이되 60fps 얇은 선을 못 보는 거짓 실패가 있다 → 눈으로 대조
//   페이로드 빈  — ⚠️ **경고만.** 「답이 들어올 자리를 비워 둔 서식」처럼 **의도된 공백**이 있다
//                  (00006 F06: 317ms 를 눈으로 보고 승인했다 — docs/02-pitfalls.md §32)
//                  이 수치로 눈검사를 뒤집지 마라. 구간을 캡처해 사람이 판단한다
process.exit(runs.length === 0 && blankFrames.length === 0 && thumbRuns.length === 0 ? 0 : 1);
