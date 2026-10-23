#!/usr/bin/env node
// 프레임 하나만 렌더한다 — 모션 수정 반복용.
//
//   node pipeline/frame-solo.mjs <프로젝트> <프레임> [--captions] [--no-audio] [--fps 60] [--quality draft]
//   node pipeline/frame-solo.mjs 00002 04          # 04-save-90k 만 렌더
//   node pipeline/frame-solo.mjs 00002 --list      # 프레임 목록과 위상 오차
//
// 실측 (2026-09-08, 00002 프레임 04 · 2.76초):
//   전체 렌더            25.6초
//   프레임 하나 (이 도구) 4.9초    ← 5.2배
//   `render -c frames/NN.html`  95초 + 실패
//
// ⚠️ `hyperframes render -c compositions/frames/NN.html` 는 **우리 구조에선 안 된다.**
//    프레임 파일이 `<template>` 안에 있어서 단독 루트로 열면 아무것도 인스턴스화되지 않고,
//    sub_timeline_readiness_timeout 45초를 버린 뒤 빈 결과가 나온다. 그래서 하네스로 우회한다.
//
// 정확도 검증 (00002 프레임 04 · 전체 렌더의 같은 시각과 PSNR):
//   모션 영역 y0~1300   45.4 dB  ← 사실상 동일 (h264 잡음 수준)
//   자막 밴드 y1330~    18.6 dB  ← 기본적으로 자막을 뺀다 (--captions 로 포함)
//   하단  y1540~        inf      ← 픽셀 동일
//
// ⚠️ 격리 렌더와 조립본이 어긋나 보이면 **먼저 두 산출물의 mtime 을 비교하라.**
//    2026-09-08 에 "클립 첫 프레임이 조립본과 다르다"고 결론냈다가 철회했다 —
//    두 렌더가 워커의 편집을 사이에 두고 갈라져 있었을 뿐이다. 하네스는 무죄였다.
//    (`docs/02-pitfalls.md` 「같은 파일인데 다르다고 말하기 전에」)
//
// ⚠️ 격리 렌더 꼬리의 검정 프레임은 결함이 아니다 — 컴포지션보다 컨테이너가 길면
//    인코더가 검정으로 채운다. 프레임 수를 컴포지션 길이에 맞춰 자르고 재라.

import { resolveHyperframes } from "./lib/hyperframes-cli.mjs";
import { readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const die = m => { console.error(`✗ ${m}`); process.exit(1); };

const argv = process.argv.slice(2);
const flag = n => argv.includes(n);
const opt  = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const pos  = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && ["--fps","--quality"].includes(argv[i-1])));

if (!pos[0]) die("프로젝트를 지목해라 — node pipeline/frame-solo.mjs 00002 04");

const all = readdirSync(join(ROOT, "projects")).filter(d => /^\d{5}-/.test(d)).sort();
const hit = all.filter(p => p === pos[0] || p.startsWith(String(pos[0]).padStart(5,"0")+"-") || p.includes(pos[0]));
if (hit.length !== 1) die(`프로젝트 지목 실패: "${pos[0]}"\n  있는 것: ${all.join(" ")}`);
const proj = hit[0];
const HF = join(ROOT, "projects", proj, "hyperframes");
if (!existsSync(join(HF, "index.html"))) die(`${proj} 에 hyperframes/index.html 이 없다`);

const src = readFileSync(join(HF, "index.html"), "utf8");
const fps = Number(opt("--fps", (src.match(/data-fps="(\d+)"/) || [])[1] || 30));

// 씬 목록 + 위상 오차
const scenes = [...src.matchAll(/<div[^>]*data-composition-id="([^"]+)"[^>]*data-composition-src="([^"]+)"[^>]*data-start="([\d.]+)"[^>]*data-duration="([\d.]+)"[^>]*>/g)]
  .map(m => ({ id: m[1], src: m[2], start: +m[3], dur: +m[4] }))
  .filter(s => s.id !== "captions");   // 자막 트랙은 프레임이 아니다
if (!scenes.length) die("index.html 에서 씬을 못 찾았다");

const phase = s => +(s.start - Math.floor(s.start * fps) / fps).toFixed(5);

if (flag("--list") || !pos[1]) {
  console.log(`\n${proj} — 프레임 ${scenes.length}개 (fps ${fps})\n`);
  console.log("  #   프레임                 시작      길이    위상오차");
  scenes.forEach((s, i) => {
    const p = phase(s);
    console.log(`  ${String(i+1).padStart(2)}  ${s.id.padEnd(22)}${String(s.start).padStart(7)}s ${String(s.dur).padStart(7)}s   ${(p*1000).toFixed(1)}ms${p > 0.5/fps ? "  ⚠️" : ""}`);
  });
  console.log(`\n  ⚠️ 위상오차 = data-start 가 프레임 격자에 안 맞는 정도. 하네스는 start=0 으로 두므로`);
  console.log(`     그만큼 전체 렌더와 어긋난다. 눈검사는 무관, **이음매 속도 측정에는 보정하라.**`);
  console.log(`     (00003 세션 실측: 이걸 무시하면 위상이 33%까지 틀린다)\n`);
  process.exit(0);
}

const key = pos[1];
const cand = scenes.filter((s, i) => s.id === key || s.id.startsWith(key + "-") || String(i+1) === String(+key) || s.id.includes(key));
if (cand.length !== 1) die(`프레임 지목 실패: "${key}" → ${cand.length ? cand.map(c=>c.id).join(", ") : "없음"}\n  --list 로 목록을 봐라`);
const sc = cand[0];

// ── 하네스 조립 ──────────────────────────────────────────────────────────────
const keepCaptions = flag("--captions");
const keepAudio    = !flag("--no-audio");
// ⚠️ **줄 단위로 거르지 마라** (2026-09-08 실측). 조립기가 내는 index.html 은 속성을 한 줄에
//    하나씩 적는다 — `<audio\n  id="…"\n  src="…"\n></audio>`. 줄 필터는 `<audio` 줄만 지우고
//    **속성과 `></audio>` 를 텍스트 노드로 남긴다.** 게다가 `data-composition-src=` 와
//    `data-composition-id=` 가 서로 다른 줄이라 `l.includes(id)` 가 영원히 거짓이 되어
//    **프레임이 하나도 마운트되지 않는다.** 그런데도 렌더는 "성공"으로 끝난다 —
//    크림 배경에 audio 태그 속성이 글자로 쏟아진 95초짜리 영상이 나왔고, 거기에
//    motion-audit 을 걸면 「빈 화면 168개」라는 거짓 실패가 나온다.
//    → **요소 블록 단위로** 거른다. 속성값에 `>` 가 없다는 전제 하에 여는 태그를 통째로 잡는다.
const keepEl = (el) => {
  if (/^<audio/.test(el))               return keepAudio && el.includes(`${sc.id}-voice`);
  if (el.includes('id="el-captions"'))  return keepCaptions;
  if (/data-composition-src=/.test(el)) return el.includes(`data-composition-id="${sc.id}"`);
  return true;
};
let out = src
  .replace(/(<div[^>]*data-composition-id="main"[^>]*data-duration=")[\d.]+/, `$1${sc.dur}`)
  .replace(/<(div|audio)\b[^>]*><\/\1>/g, (m) => (keepEl(m) ? m : ""))
  // 남긴 씬과 오디오를 t=0 으로 당긴다
  .replace(new RegExp(`(data-composition-id="${sc.id}"[^>]*data-start=")[\\d.]+`), "$10")
  .replace(new RegExp(`(id="el-${sc.id}-voice"[^>]*data-start=")[\\d.]+`), "$10");

// 🔴 자가검증 — 하네스가 깨졌으면 렌더하지 말고 여기서 죽어라.
//    2026-09-08 에 이 도구가 **빈 하네스를 95초 동안 굽고 "성공"이라고 찍었다.**
//    워커가 그 결과로 자기 프레임을 "전 프레임 빈 화면"이라고 판정할 뻔했다.
{
  const mounted = (out.match(/data-composition-src=/g) || []).length;
  const want = 1 + (keepCaptions ? 1 : 0);
  const orphan = /^\s*(id|src|data-[a-z-]+)="/m.test(out.replace(/<[^>]*>/g, ""));
  if (mounted !== want)
    die(`하네스가 깨졌다 — 마운트된 컴포지션 ${mounted}개 (기대 ${want}개).\n` +
        `  index.html 의 요소 표기가 바뀌었을 수 있다. 렌더하지 않는다.`);
  if (orphan)
    die(`하네스가 깨졌다 — 태그 밖에 속성 텍스트가 남았다 (요소가 반쪽만 지워졌다).\n` +
        `  렌더하면 크림/검정 단색 영상이 나오고 판정이 전부 거짓이 된다.`);
}

const harness = join(HF, ".frame-solo.html");
const outDir  = join(ROOT, "projects", proj, "output");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `solo-${sc.id}.mp4`);
writeFileSync(harness, out);

const args = [resolveHyperframes(HF).cli, "render", "-c", ".frame-solo.html",
  "-o", outFile, "--fps", String(fps), "-q", opt("--quality", "standard"), "--quiet", "."];
console.log(`\n  ${proj} / ${sc.id}  ${sc.dur}초 · fps ${fps} · 자막 ${keepCaptions?"포함":"제외"} · 음성 ${keepAudio?"포함":"제외"}`);
const t0 = Date.now();
const r = spawnSync(process.execPath, args, { cwd: HF, encoding: "utf8" });
try { unlinkSync(harness); } catch {}

if (r.status !== 0) {
  console.error((r.stderr || r.stdout || "").split("\n").slice(-12).join("\n"));
  die(`렌더 실패 (exit ${r.status})`);
}
const p = phase(sc);
console.log(`  ✔ ${((Date.now()-t0)/1000).toFixed(1)}초 → ${outFile.replace(ROOT + "/", "")}`);
if (p > 0.5 / fps)
  console.log(`  ⚠️ 위상오차 ${(p*1000).toFixed(1)}ms — 이음매 속도를 재려면 전체 렌더에서 재라`);
if (!keepCaptions)
  console.log(`  ⚠️ 자막이 빠져 있다 — 자막 겹침·가림은 이걸로 판단하지 마라 (--captions)`);
console.log();
