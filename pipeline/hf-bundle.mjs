#!/usr/bin/env node
// hf-bundle.mjs — 숏츠 묶음 롱폼(1920×1080) 조립·검증. 원본 숏츠 프로젝트는 읽기만 한다.
//
//   node pipeline/hf-bundle.mjs <p> plan              # 원본 봉인·길이·음량 확인 → cuts.json 시간축과 YouTube 챕터
//   node pipeline/hf-bundle.mjs <p> build             # 원본 복사(chNN/) + 1920×1080 index.html 조립
//   node pipeline/hf-bundle.mjs <p> verify            # 렌더 전: 묶음 무대 = 원본 무대인지 스냅샷 SSIM 대조
//   node pipeline/hf-bundle.mjs <p> verify --video <mp4>   # 렌더 후: 해상도·fps·길이·챕터별 음량
//   node pipeline/hf-bundle.mjs <p> loudness [--apply] [--keep <mp4>]   # 렌더 전: 1fps 측정 렌더로 묶음 믹스의 챕터 음량·트루피크·피크 지점 (납품 아님)
//   node pipeline/hf-bundle.mjs <p> snap <출력폴더> <t1,t2,…>   # 조립 + 그 시각 스냅샷(1920×1080) — 워커·감독 공용
//   node pipeline/hf-bundle.mjs <p> sheet [--out <폴더>]         # 조립 + 전 프레임 3시점·전환·정리 시트(챕터별 jpg) — B 분류·감독 검수 입력
//   build·verify(무대)·loudness·snap·sheet는 묶음 잠금 안에서 돈다(워커 여럿이 동시에 불러도 서로의 조립을 덮지 않는다). 렌더 중에는 거부한다.
//   node pipeline/hf-bundle.mjs <p> thumb frames <t1,t2,…>   # 조립본 스냅샷 → cards/assets/frame-<초>.jpg(1920×1080) — 썸네일·0초 포스터 타일 재료 (렌더 전)
//   node pipeline/hf-bundle.mjs <p> thumb check [--html <파일> [--alt]]   # cards/thumbnail.html → output/thumbnail.jpg + 글자·위계·배지 자리·챕터 배지 검사 (08 §8.1). --alt = 한 장면 A/B 후보(챕터 배지 누락을 경고로)
//     cards/thumbnail.html 은 0초 포스터의 원본이기도 하다 — build 가 매번 compositions/bundle/poster.html 로 옮긴다(08 §3.1)
//   node pipeline/hf-bundle.mjs <p> chapters          # 설명란 챕터 타임스탬프
//   node pipeline/hf-bundle.mjs <p> lines [챕터]      # 챕터별 대사 문장·시각 — 보강 효과음 큐 시각을 문장에 맞출 때
//   node pipeline/hf-bundle.mjs catalog [--loudness] [--headlines] [--views]  # 묶을 수 있는 숏츠 전수. --headlines는 컷 제목(연도·사건)까지 — 이야기 연결 찾기. --views는 공개 조회수(챕터 1 = 최고 조회)
//
// 정본: docs/channel/08-longform.md. 설계 근거(2026-09-26 스크래치 실측):
//   · 원본 프레임 컴포지션을 수정 없이 1920×1080 루트에 얹으면 무대가 원본 스냅샷과 SSIM 0.999998로 같다.
//   · 챕터 사이 요소 ID(#f1 등)가 겹쳐도 모션은 깨지지 않았다. 겹치면 안 되는 것은 **컴포지션 ID**다
//     (자막 `captions`가 19편 공통 — 타임라인 레지스트리 키가 충돌한다). 그래서 컴포지션 ID만 cNN- 접두사.
//   · 소스는 **납품 렌더의 봉인(srcman)과 일치할 때만** 복사한다. 숏츠에서 검증된 품질을 그대로 가져오는 조건이다.
import {readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync, cpSync, copyFileSync, mkdtempSync, statSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolveProject, ROOT} from './lib/project.mjs';
import {installedHyperframes, resolveHyperframes} from './lib/hyperframes-cli.mjs';
import {manifest, HASH_VERSION} from './lib/src-hash.mjs';
import {readTiming} from './lib/timing.mjs';
import {BRAND, brandCss, lockupStyle} from './lib/brand.mjs';
import {rootCaptionChunks} from './hf-export.mjs';
import {sfxLicenseError} from './lib/sfx-tracks.mjs';
import {loadSfxCatalog} from './lib/sfx-catalog.mjs';
import {shaderUse, installShaders} from './lib/shaders.mjs';

const W = 1920, H = 1080;
const SFX_CAT = loadSfxCatalog(ROOT);
const LAYOUT = {                       // 원본 1080×1920 좌표 → 가로 화면 (08 §4.2·§7.1 실측)
  cc:   {left: 420, top: -320, scale: 1,  cap: null},
  burn: {left: 474, top: -304, scale: .9, cap: {left: 420, top: -463}},
};
const STAGE = {x: 0, y: 360, w: 1080, h: 1000};   // 원본 정보 정착 구역을 포함하는 무대 띠
const LOCKUP = {left: 48, top: 40};
// 롱폼 좌상단 로고(2026-09-26 사용자: "좌상단 로고 …로고.png 로 사용해줘 배경투명하게해서 앞으로 계속 롱폼에서는 이거 사용하게").
//   원본 로고의 Navy 배경을 뺀 3단 스택(KOREA, / MADE / CLEAR). 밝은 장면(크림 화면)에서도 읽히게 Navy 윤곽 그림자를 준다.
//   파일이 없으면 예전 한 줄 텍스트 락업으로 돌아간다. 숏츠의 락업(채널05 §2)은 그대로다.
// 전환·완주·정리 화면 밑에 까는 배경 곡(2026-09-26 감독: 전환 BGM 공백·정리 화면 10초 무음). 챕터 BGM 파일은 챕터 길이로 잘려 있어 늘릴 수 없다.
//   모든 롱폼에 같은 곡을 쓴다(채널 기억). CC0 — resources/music/CREDITS.md. 도입부를 피해 48초부터, −24 LUFS로 맞춘 사본.
const LONG_BED = {file: 'resources/music/cc0/funshine.mp3', title: 'Funshine', composer: 'Kevin MacLeod', license: 'CC0', start: 48, len: 70, lufs: -24};
const LONG_LOGO = {file: BRAND.logo.file, left: 48, top: 34, height: 100};
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const r6 = n => Number(n).toFixed(6);
const pad = n => String(n).padStart(2, '0');
const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const fail = m => { console.error(`✗ ${m}`); process.exit(1); };
const AUDIO_LEN = new Map();   // 오디오 파일의 실제로 들리는 길이 캐시
function audibleLen(fp, fallback) {   // 파일 길이에서 끝의 무음(−40 dB, 0.2초 이상 — 2026-10-09 L11 감독: −50이면 BGM 페이드 꼬리 −42~−50 dB를 소리로 세어 전환 직전 0.3~0.6초 구멍)을 뺀 길이
  const len = Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', fp]).stdout) || fallback;
  if (len < 2) return len;
  const log = run('ffmpeg', ['-v', 'info', '-i', fp, '-af', 'silencedetect=n=-40dB:d=0.2', '-f', 'null', '-']).stderr || '';
  const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map(m => +m[1]), ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map(m => +m[1]);
  const last = starts.at(-1);
  return last != null && (ends.length < starts.length || ends.at(-1) >= len - 0.05) ? Math.min(len, last) : len;
}
const run = (cmd, args, opt = {}) => spawnSync(cmd, args, {encoding: 'utf8', maxBuffer: 1 << 26, ...opt});
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));

// ── 원본 한 편 ────────────────────────────────────────────────────────────
function source(ch) {
  const {dir, name} = resolveProject(ch.project);
  const hf = path.join(dir, 'hyperframes');
  const index = readFileSync(path.join(hf, 'index.html'), 'utf8');
  const root = attrs(index.match(/<div\b[^>]*\bid="root"[^>]*>/)?.[0] || '');
  if (root['data-width'] !== '1080' || root['data-height'] !== '1920') fail(`${name}: 1080×1920 세로 숏츠가 아니다`);
  const duration = Number(root['data-duration']);
  const slots = [...index.matchAll(/<div\b[^>]*class="[^"]*\bframe-slot\b[^"]*"[^>]*><\/div>/g)].map(m => {
    const a = attrs(m[0]);
    return {id: a.id, comp: a['data-composition-id'], src: a['data-composition-src'], start: +a['data-start'], dur: +a['data-duration']};
  });
  if (!slots.length) fail(`${name}: frame-slot이 없다`);
  const audio = [...index.matchAll(/<audio\b[^>]*>(?:<\/audio>)?/g)].map(m => attrs(m[0]));
  const captions = /data-composition-src="compositions\/captions\.html"/.test(index);
  // 자막을 프레임 안에 구운 편(class="clip caption" — 00037·00039): 자막 트랙이 없어도 burn 묶음에 넣는다. 자막은 무대(0.9배) 안에서 그대로 보인다
  const frameCaps = !captions && slots.some(s => { const f = path.join(hf, s.src); return existsSync(f) && /class="clip caption"/.test(readFileSync(f, 'utf8')); });
  // 루트에 직접 얹은 클립(프레임 슬롯·자막·루트 락업 밖) — 00040 위치 지도(location-N 하위 컴포지션)·이음 소품(autumn-seam). 2026-10-08 L8에서
  //   묶음이 이것을 빠뜨려 위치 지도와 이음 전환이 사라지고, 지도 밑에 숨긴 카메라 다이브가 드러났다. 묶음도 함께 싣는다(rootExtras).
  const rootSubs = [], rootInline = [];
  for (const m of index.matchAll(/<div\b[^>]*class="[^"]*\bclip\b[^"]*"[^>]*>/g)) {
    const a = attrs(m[0]);
    if (/\bframe-slot\b/.test(a.class || '') || a.id === 'el-captions' || a.id === 'el-root-lockup' || a['data-composition-src'] === 'compositions/captions.html') continue;
    if (a['data-composition-src']) { rootSubs.push({id: a.id, comp: a['data-composition-id'], src: a['data-composition-src'], start: +a['data-start'], dur: +a['data-duration'], z: (a.style || '').match(/z-index:\s*(\d+)/)?.[1] || '20'}); continue; }
    // 인라인 클립: 같은 깊이의 </div>까지 통째로
    let i = m.index + m[0].length, depth = 1;
    const re = /<div\b[^>]*>|<\/div>/g; re.lastIndex = i;
    for (let t; depth && (t = re.exec(index));) { depth += t[0] === '</div>' ? -1 : 1; i = re.lastIndex; }
    rootInline.push(index.slice(m.index, i));
  }
  const rootCss = index.match(/<style[^>]*>([\s\S]*?)<\/style>/i)?.[1] || '';
  const rootJs = [...index.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('\n');
  return {dir, name, hf, index, duration, slots, audio, captions, frameCaps, rootSubs, rootInline, rootCss, rootJs};
}

// 납품 렌더의 봉인과 지금 소스가 같은가. 참조되지 않은 추가 파일만 경고로 둔다(00006 callout.js 사례).
// 묶음이 원본에서 쓰는 것의 지문 — 슬롯(프레임 파일·시각)·오디오 트랙(속성, data-hf-id 제외)·자막 컴포지션(+ 루트에서 옮기는 자막 CSS).
//   루트 락업·브랜드 로고처럼 묶음이 쓰지 않는 부분이 바뀌어도 이 지문은 그대로다.
function bundleDigest(src) {
  const cap = src.captions ? withRootCaptionCss(readFileSync(path.join(src.hf, 'compositions/captions.html'), 'utf8'), src.index, '', true) : null;
  const audio = src.audio.map(a => Object.fromEntries(Object.entries(a).filter(([k]) => k !== 'data-hf-id').sort()));
  return createHash('sha256').update(JSON.stringify({slots: src.slots.map(s => [s.src, s.comp, s.start, s.dur]), audio, cap})).digest('hex').slice(0, 16);
}
const LOCKUP_ONLY = k => k === 'index.html' || k.startsWith('assets/brand/');
// 2026-09-27: 다른 작업이 기존 숏츠 9편(00017~00025)의 루트 락업을 이미지 로고로 바꿔 봉인이 깨졌다 — 묶음이 쓰는 부분은 그대로였다.
//   바뀐 파일이 루트 index.html·assets/brand/뿐이고 묶음 지문(bundleDigest)이 기록(chapters[].measured.digest)과 같으면 통과시킨다.
//   지문은 봉인이 맞을 때 plan이 적고, 이미 바뀐 편은 `reseal`이 변경 전 조립본과 대조한 뒤에만 적는다.
function sealCheck(src, render, ch = null) {
  const r = sealCheck0(src, render);
  if (r.ok || !ch?.measured?.digest || !r.hard.every(LOCKUP_ONLY)) return r;
  if (bundleDigest(src) !== ch.measured.digest) return {...r, why: `${r.why} — 묶음 지문도 다르다(슬롯·오디오·자막이 바뀌었다)`};
  return {...r, ok: true, lockupOnly: r.hard, why: ''};
}
function sealCheck0(src, render) {
  const man = path.join(src.dir, 'output', `${render}.srcman.json`);
  if (!existsSync(man)) return {ok: false, why: `봉인 없음: output/${render}.srcman.json`};
  const seal = JSON.parse(readFileSync(man, 'utf8'));
  if ((seal.hashVersion ?? 1) !== HASH_VERSION) return {ok: false, why: `봉인 규격 v${seal.hashVersion ?? 1} ≠ 현재 v${HASH_VERSION}`};
  const now = manifest(src.hf), files = seal.files || {};
  const diff = [...new Set([...Object.keys(files), ...Object.keys(now)])].filter(k => files[k] !== now[k]);
  const text = walkText(src.hf);
  const benign = diff.filter(k => !files[k] && k.startsWith('assets/') && !text.includes(path.basename(k)));
  const hard = diff.filter(k => !benign.includes(k));
  return {ok: hard.length === 0, hard, benign, why: hard.length ? `납품 후 바뀐 소스 ${hard.length}개: ${hard.slice(0, 5).join(', ')}` : ''};
}
function walkText(hf) {
  let s = '';
  const walk = d => { for (const e of readdirSync(d, {withFileTypes: true})) {
    if (e.name === 'node_modules' || e.name === 'snapshots') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else if (/\.(html|js)$/.test(e.name) && !/gsap/.test(e.name)) s += readFileSync(p, 'utf8');
  } };
  walk(hf); return s;
}
function loudness(mp4, from, dur) {
  const args = ['-hide_banner', '-nostats'];
  if (from != null) args.push('-ss', String(from), '-t', String(dur));
  args.push('-i', mp4, '-vn', '-af', 'ebur128', '-f', 'null', '-');
  const out = run('ffmpeg', args).stderr || '';
  const m = out.split('Summary:').pop().match(/I:\s+(-?[\d.]+) LUFS/);
  return m ? Number(m[1]) : null;
}

// ── 묶음 잠금 ─────────────────────────────────────────────────────────────
// 2026-09-27 L2: 챕터 워커 5명이 같은 묶음을 조립·스냅샷했다. build는 chNN/을 지우고 index.html을 다시 쓰므로, 잠금 없이 겹치면
//   남의 스냅샷이 반쯤 지워진 챕터를 찍는다. 세션 스크래치의 잠금 스크립트로 버텼던 것을 도구 안으로 옮겼다.
//   렌더 중(output/.render-lock)에는 조립을 거부한다 — 렌더 도중 소스가 바뀌면 hf-render.sh가 봉인 이탈로 산출을 버린다.
let lockHeld = null;
function withLock(dir, fn) {
  if (lockHeld) return fn();
  if (existsSync(path.join(dir, 'output', '.render-lock'))) fail('렌더 중이다(output/.render-lock) — 렌더가 끝난 뒤 다시 부른다. 렌더 도중 조립하면 봉인 이탈로 렌더가 버려진다');
  const lp = path.join(os.tmpdir(), `hf-bundle-lock-${path.basename(dir)}`), t0 = Date.now(), nap = new Int32Array(new SharedArrayBuffer(4));
  for (;;) {
    try { mkdirSync(lp); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - statSync(lp).mtimeMs > 30 * 60e3) { rmSync(lp, {recursive: true, force: true}); continue; } } catch {}
      if (Date.now() - t0 > 30 * 60e3) fail(`묶음 잠금 대기 30분 초과: ${lp}`);
      Atomics.wait(nap, 0, 0, 1000);
    }
  }
  lockHeld = lp;
  const release = () => { try { rmSync(lp, {recursive: true, force: true}); } catch {} };
  process.on('exit', release);
  try { return fn(); } finally { release(); lockHeld = null; }
}

// ── 명세와 시간축 ─────────────────────────────────────────────────────────
function readSpec(dir) {
  const project = JSON.parse(readFileSync(path.join(dir, 'cuts.json'), 'utf8'));
  const b = project.bundle;
  if (!b || b.version !== 1) fail('cuts.json에 bundle(version 1)이 없다 — docs/channel/08-longform.md §10');
  if (project.orientation !== 'landscape') fail('묶음 프로젝트는 orientation: landscape');
  if (!Array.isArray(b.chapters) || b.chapters.length < 2) fail('bundle.chapters는 2편 이상');
  if (!['burn', 'cc'].includes(b.captions)) fail('bundle.captions는 burn 또는 cc');
  return {project, b};
}
// 🔴 챕터 시작은 0.5초 격자에 맞춘다(2026-09-26 실측). HyperFrames 스냅샷은 30fps 단위로 찍어,
//    챕터 시작이 30fps 정수 프레임이 아니면(51.175·64.05·63.25·63.75) 챕터 전체가 반 프레임 어긋난 화면이 찍혀
//    빠른 카메라 구간이 거짓 불일치가 됐다(SSIM 0.56). 63.5·64.0은 0.9998. 60fps 렌더는 어긋나지 않았다(렌더 대조 0.994).
//    0.5초는 2진수로 정확하고 30·60fps 모두 정수 프레임이다. 늘어난 시간은 전환의 앞쪽 유지(hold)가 흡수한다.
const GRID = .5, snap = t => Math.round(Math.ceil(t / GRID - 1e-9) * GRID * 1e6) / 1e6;
// 0초 포스터(2026-10-08 사용자: "0초 첫장은 해당 영상들의 포스터 형식으로 클릭하고 싶게") — 썸네일과 같은 한 장(cards/thumbnail.html)이
//   0초부터 움직이고, 마지막 GROW초 동안 주연 그림(#t1 — 챕터 1 첫 화면)이 화면 전체로 커져 챕터 1의 첫 화면이 된다. 한 장은 대표 영상(챕터 1) 한 편의 포스터다(같은 날 네 칸 조합판 반려). 몽타주 미리보기(2026-09-26 폐지)와 달리
//   클립을 잇지 않는 한 장이다. bundle.poster_s(새 묶음 기본 1.5 — bundle-cuts.json)가 없는 옛 묶음(L1~L4)은 0초가 챕터 1 그대로다.
const POSTER = {grow: .5};
function timeline(b, durations) {
  const P = b.poster_s > 0 ? snap(b.poster_s) : 0, G = b.gap_s ?? 1.2, E = b.end_s ?? 10;
  let t = P; const ch = [];
  durations.forEach((d, i) => { ch.push({start: t, dur: d}); t = i < durations.length - 1 ? snap(t + d + G) : t + d; });
  // 노선 전환 묶음은 마지막 챕터 뒤에도 「YOUR TRIP · COMPLETE」 전환을 둔다(2026-09-26 감독: 택시→정리 화면이 뚝 끊김)
  const EG = b.end_gap_s ?? (b.chapters?.every?.(c => c.stop) ? 1.5 : 0);
  const endStart = snap(t + EG);
  ch.forEach((c, i) => { c.end = c.start + c.dur; c.gap = i < ch.length - 1 ? ch[i + 1].start - c.end : endStart - c.end; });
  return {P, G, E, hold: Math.min(.6, G / 2), ch, endStart, total: Math.round((endStart + E) * 1e6) / 1e6};
}

// 읽기 멈춤 호흡(2026-09-27 L2 사용자: "잠깐씩 멈추는 곳이 있는데 모션좀 부드럽게 종합적으로 개선해줘 하드하게는 하지 말고").
//   초기 숏츠(00001~00005)는 값을 보여 준 뒤 0.7~5초 완전히 멈춘다(L2 49곳 — 원본 motion-audit와 같은 자리). 프레임 코드는 두고
//   묶음이 무대 슬롯(.lf-stage)에 느린 카메라 줌을 준다: chapters[].drift = 진폭(예 0.03). 정보 구역 중심(540,860) 기준, 배율 ≥ 1만
//   (B 확장 배경 밖이 드러나지 않는다). 프레임마다 방향을 번갈아(짝수 1→1+A, 홀수 1+A→1, sine.inOut) 컷 앞뒤 배율이 이어진다 —
//   이어지는 요소가 있는 컷(00005 F1→F2 등)에서 튀지 않는다. 챕터 첫 프레임은 1.0에서 시작한다(훅 그대로).
const DRIFT_O = {x: 540, y: 860};
function driftSlots(ch, src, T) {   // 슬롯마다 [시작, 길이, s0, s1] — build 트윈과 verify 역산이 같은 값을 쓴다
  const A = Number(ch.drift) || 0, modes = ch.frames || {};
  if (!(A > 0)) return [];
  let k = 0;
  return src.slots.map((sl, j) => {
    const mode = modes[sl.comp] || 'B';
    if (mode !== 'B' && !mode.startsWith('C')) return null;
    const last = j === src.slots.length - 1, even = (k++ % 2) === 0;
    return {id: sl.id, start: T.start + sl.start, dur: sl.dur + (last ? T.gap : 0), s0: even ? 1 : 1 + A, s1: even ? 1 + A : 1};
  }).filter(Boolean);
}
function driftAt(slots, t) {   // 묶음 시각 t의 무대 배율
  const d = slots.find(x => t >= x.start - 1e-6 && t < x.start + x.dur - 1e-6);
  if (!d) return 1;
  const p = Math.min(1, Math.max(0, (t - d.start) / d.dur));
  return d.s0 + (d.s1 - d.s0) * (0.5 - 0.5 * Math.cos(Math.PI * p));
}
const driftXY = (L, s) => ({x: L.scale * DRIFT_O.x * (1 - s), y: L.scale * DRIFT_O.y * (1 - s)});
// 무대 비교용 크롭 — 배율 s의 무대를 원본 크롭 크기(0.9배)로 되돌린다. 평면 벡터 가장자리의 반화소 오차를 줄이려 4배로 키워 정수 위치에서 자른다.
function stageCrop(L, s = 1) {
  if (Math.abs(s - 1) < 1e-9) return `crop=${Math.round(STAGE.w * L.scale)}:${Math.round(STAGE.h * L.scale)}:${L.left + STAGE.x * L.scale}:${L.top + STAGE.y * L.scale}`;
  const {x, y} = driftXY(L, s), K = 4;
  const X = (L.left + x + L.scale * s * STAGE.x) * K, Y = (L.top + y + L.scale * s * STAGE.y) * K, Wd = L.scale * s * STAGE.w * K, Hd = L.scale * s * STAGE.h * K;
  return `scale=iw*${K}:ih*${K}:flags=bicubic,crop=${Math.round(Wd)}:${Math.round(Hd)}:${Math.round(X)}:${Math.round(Y)},scale=${Math.round(STAGE.w * L.scale)}:${Math.round(STAGE.h * L.scale)}:flags=bicubic`;
}

function plan(dir) {
  const {project, b} = readSpec(dir);
  const rows = [], problems = [];
  for (const [i, ch] of b.chapters.entries()) {
    const src = source(ch);
    const render = path.join(src.dir, 'output', ch.render || '');
    if (!ch.render || !existsSync(render)) { problems.push(`ch${pad(i + 1)} ${src.name}: 납품 렌더(render) 지정 필요`); continue; }
    const seal = sealCheck(src, ch.render, ch);
    if (!seal.ok) problems.push(`ch${pad(i + 1)} ${src.name}: ${seal.why}`);
    if (seal.lockupOnly) console.log(`  △ ch${pad(i + 1)} ${src.name}: 납품 뒤 루트 락업·브랜드 자산만 바뀜(${seal.lockupOnly.join(', ')}) — 묶음 지문 동일`);
    if (seal.benign?.length) console.log(`  △ ch${pad(i + 1)} ${src.name}: 참조되지 않은 추가 파일 ${seal.benign.join(', ')} — 렌더 영향 없음`);
    const lufs = loudness(render);
    if (lufs == null) problems.push(`ch${pad(i + 1)} ${src.name}: 음량 측정 실패`);
    ch.source = src.name;
    ch.measured = {duration: src.duration, lufs, digest: seal.lockupOnly ? ch.measured.digest : bundleDigest(src)};
    rows.push([i + 1, src.name, src.duration, lufs, src.slots.length, src.captions, seal.ok]);
  }
  if (problems.length) { problems.forEach(p => console.error(`  🔴 ${p}`)); fail('원본을 확정한 뒤 다시 plan'); }
  const tl = timeline(b, b.chapters.map(c => c.measured.duration));
  // 음량은 **줄이는 방향으로만** 맞춘다(2026-09-26 실측): 원본 숏츠 믹스는 이미 약 −1.8dBFS에서 눌려 있어
  // 올리면 잘리고, <hf-audio-group> 버스 gain은 렌더에서 오히려 −1.9dB가 됐다. data-volume 배율만 쓴다.
  // 기준은 챕터 음량의 중앙값 — 그보다 큰 챕터만 내린다. 조용한 원본은 §7.4 보강 대상으로 보고한다.
  const sorted = b.chapters.map(c => c.measured.lufs).sort((x, y) => x - y);
  const target = b.loudness_lufs ?? sorted[Math.floor((sorted.length - 1) / 2)];
  b.loudness_target = target;
  // gain_override_db: 첫 렌더 실측(verify --video 배율 제안)으로 다시 잡은 값 — plan 을 다시 돌려도 유지한다
  b.chapters.forEach(c => { c.gain_db = c.gain_override_db ?? Math.max(-12, Math.min(0, Math.round((target - c.measured.lufs) * 10) / 10)); });
  project.fps = project.fps || 60;
  project.timing = {version: 1, speed: 1};
  project.cuts = tl.P > 0 ? [{id: 'poster', dur: tl.P, bundle: 'poster'}] : [];
  b.chapters.forEach((c, i) => {
    project.cuts.push({id: `ch${pad(i + 1)}`, dur: c.measured.duration, bundle: 'chapter', source: c.source});
    if (i < b.chapters.length - 1) project.cuts.push({id: `gap${pad(i + 1)}`, dur: Math.round(tl.ch[i].gap * 1e6) / 1e6, bundle: 'gap'});
  });
  project.cuts.push({id: 'end', dur: Math.round((tl.total - tl.ch.at(-1).end) * 1e6) / 1e6, bundle: 'end'});
  writeFileSync(path.join(dir, 'cuts.json'), JSON.stringify(project, null, 2) + '\n');
  readTiming(dir);   // 시간축 계약 검사 — hf-render·render-gate가 같은 값을 읽는다
  console.log(`\n  묶음 계획 — ${path.basename(dir)} · 캡션 ${b.captions} · 음량 기준 ${target} LUFS(이보다 큰 챕터만 내린다)\n`);
  for (const [n, name, d, l, f, cap, ok] of rows)
    console.log(`  ch${pad(n)} ${mmss(tl.ch[n - 1].start).padStart(5)}  ${name.padEnd(34)} ${d.toFixed(2).padStart(6)}s  ${String(l).padStart(6)} LUFS → ${b.chapters[n - 1].gain_db >= 0 ? '+' : ''}${b.chapters[n - 1].gain_db} dB  프레임 ${f}${cap ? '' : ' · 자막 트랙 없음'}${ok ? '' : ' 🔴'}`);
  console.log(`\n  총 ${tl.total.toFixed(1)}초 (${mmss(tl.total)}) = ${tl.P ? `0초 포스터 ${tl.P} + ` : ''}원본 ${b.chapters.reduce((s, c) => s + c.measured.duration, 0).toFixed(1)} + 전환 ${tl.ch.slice(0, -1).map(c => c.gap.toFixed(2)).join('·')} + 정리 ${(tl.total - tl.ch.at(-1).end).toFixed(2)} (챕터 시작은 0.5초 격자)`);
  if (tl.total < 180 || tl.total > 240) console.log(`  ⚠️  3~4분 범위 밖 — 이야기 우선 예외는 ⛳A에서 사용자가 정한다 (08 §2.2)`);
  if (!tl.P) console.log(`  ⚠️  bundle.poster_s 없음 — 0초가 챕터 1 화면 그대로다. 새 묶음은 0초 포스터(1.5)를 쓴다 (08 §3.1)`);
  // 챕터 1 = 조회수가 가장 높은 편(2026-10-08) — 0초 포스터가 그 편의 포스터다. 이야기 순서로 바꿨으면 README에 근거를 적는다(경고만)
  const vs = b.chapters.map(c => c.views);
  if (vs.every(Number.isFinite)) { const top = vs.indexOf(Math.max(...vs)); if (top > 0) console.log(`  ⚠️  챕터 1 조회 ${vs[0]} < ch${pad(top + 1)} ${b.chapters[top].source} ${vs[top]} — 조회수가 가장 높은 편을 챕터 1로 두거나 README에 순서 근거를 적는다 (08 §2.4)`); }
  else console.log(`  △ chapters[].views 없음 — catalog --views의 공개 조회수를 적으면 챕터 1 순서를 확인한다 (08 §2.4)`);
  chapters(dir);
}

function chapters(dir) {
  const {b} = readSpec(dir);
  if (!b.chapters.every(c => c.measured)) fail('먼저 plan');
  const tl = timeline(b, b.chapters.map(c => c.measured.duration));
  console.log(`\n  설명란 챕터 (${tl.P ? '0:00은 0초 포스터 포함 · ' : ''}YouTube 챕터 최소 10초)`);
  b.chapters.forEach((c, i) => console.log(`  ${i ? mmss(tl.ch[i].start) : '0:00'} ${c.label || c.source}`));
}

// ── 조립 ──────────────────────────────────────────────────────────────────
// 복사본에서만 바꾸는 것: 루트 기준 자산 경로(assets·fonts·.media) → chNN/…, 컴포지션 ID → cNN-….
function rewrite(html, nn, compIds) {
  let s = html.replace(/(["'(])(assets|fonts|\.media)\//g, `$1ch${nn}/$2/`);
  for (const id of compIds) {
    const q = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp(`data-composition-id=(["'])${q}\\1`, 'g'), `data-composition-id="c${nn}-${id}"`)
         .replace(new RegExp(`__timelines\\[(["'])${q}\\1\\]`, 'g'), `__timelines["c${nn}-${id}"]`);
    if (/^[A-Za-z_]\w*$/.test(id)) s = s.replace(new RegExp(`__timelines\\.${q}\\b`, 'g'), `__timelines["c${nn}-${id}"]`);
  }
  return scopeSelectorArrays(renameSvgDefs(s, nn));
}
// 🔴 선택자 **배열**도 자기 컴포지션 안에서 찾게 한다(2026-09-26 L3 실측).
//    HyperFrames의 스크립트 격리(__hfScopedGsap)는 첫 인자가 문자열 하나일 때만 범위를 좁히고, 배열 속 문자열은 그대로 넘긴다.
//    00014 f6의 gsap.set(['#f6-fa',…,'#f6-all',…],{opacity:0})가 문서 전체의 #f6-all을 숨겨, 뒤에 오는 00022 f6
//    (장면 전체를 감싸는 #f6-all) 이 통째로 사라졌다(SSIM 0.36). 쇼츠 11편·129곳에 같은 배열 호출이 있다.
//    그래서 각 스크립트 안의 gsap(런타임이 준 범위 한정 gsap)을 한 겹 더 감싸, 배열 속 선택자 문자열을
//    범위 한정 document로 찾은 요소로 바꾼다. 색상 코드 문자열(#FFF5DF)은 그대로 둔다. ID 이름은 바꾸지 않는다.
const ARRAY_SCOPE = `{const __hfg=gsap;{const __hfa=t=>Array.isArray(t)?t.flatMap(x=>typeof x==='string'&&!/^#[0-9a-fA-F]{3,8}$/.test(x)?Array.from(document.querySelectorAll(x)):[x]):t;` +
  `const __hfm=['to','from','fromTo','set'];const gsap=new Proxy(__hfg,{get(t,k){const v=t[k];` +
  `if(__hfm.includes(k))return (a,...r)=>v.call(t,__hfa(a),...r);` +
  `if(k==='timeline')return (...g)=>{const tl=v.apply(t,g);for(const m of __hfm){const o=tl[m];tl[m]=(a,...r)=>o.call(tl,__hfa(a),...r);}return tl;};` +
  `if(k==='utils')return new Proxy(t.utils,{get(u,q){const w=u[q];return q==='toArray'?(a,...r)=>w.call(u,__hfa(a),...r):(typeof w==='function'?w.bind(u):w);}});` +
  `return typeof v==='function'?v.bind(t):v;}});\n`;
function scopeSelectorArrays(html) {
  return html.replace(/(<script\b(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/g, (m, open, body, close) =>
    /\bgsap\b/.test(body) ? `${open}${ARRAY_SCOPE}${body}\n}}${close}` : m);
}
// 🔴 챕터 사이 ID 충돌 — SVG 정의 ID만 챕터 접두사를 붙인다(2026-09-26 L3 실측).
//    HyperFrames 런타임은 이미 컴포지션마다 스크립트를 격리한다: gsap.timeline()의 to/from/fromTo/set,
//    gsap.utils.toArray, document.getElementById·querySelector가 자기 컴포지션 안에서만 찾는다
//    (hyperframe-runtime.js의 __hfScopedGsap·__hfScopedDocument). 그래서 요소 ID가 겹쳐도 스크립트는 안전하다.
//    격리되지 않는 것은 브라우저가 문서 전체에서 첫 번째 같은 ID를 찾는 SVG url(#…)·<use href="#…"> 참조다.
//    00022가 00013과 ID 29개가 겹쳐 다른 챕터의 마스크·심볼을 가져다 쓰면서 한 장면이 비었다(SSIM 0.36).
//    요소 ID 전체에 접두사를 붙이면 원본 코드가 ID 문자열을 해석하는 곳이 깨진다(00022 f7 `el.id.slice(4)`, SSIM 0.77).
//    스크립트를 따로 감싸면 런타임 격리와 겹쳐 모든 장면이 깨진다. 둘 다 하지 않는다.
function renameSvgDefs(html, nn) {
  const defs = [...new Set([...html.matchAll(/url\(\s*['"]?#([A-Za-z][\w-]*)/g), ...html.matchAll(/(?:xlink:)?href=["']#([A-Za-z][\w-]*)["']/g)].map(m => m[1]))]
    .filter(id => new RegExp(`\\sid=["']${id}["']`).test(html));
  let s = html;
  for (const id of defs) s = s.replace(new RegExp(`(\\sid=["'])${id}(["'])`, 'g'), `$1c${nn}-${id}$2`).replace(new RegExp(`#${id}(?![\\w-])`, 'g'), `#c${nn}-${id}`);
  // 2026-09-27 L3 ch04: 스크립트가 이 id를 문자열로 이어 붙여 고르면(P+'-flagsA') 이름이 바뀐 요소를 못 찾아 트윈이 조용히 사라진다(pitfalls §154)
  for (const id of defs) { const tail = id.includes('-') ? id.slice(id.indexOf('-')) : null;
    if (tail && new RegExp(`['"\`]${tail.replace(/[-]/g, '\\-')}['"\`]`).test(html)) console.log(`  ⚠️ ch${nn}: SVG 참조 id ${id}를 c${nn}-${id}로 바꿨는데 스크립트가 '${tail}'를 이어 붙여 고르는 것 같다 — 그 요소의 트윈이 사라질 수 있다. <use>는 트윈이 없는 래퍼를 참조한다 (pitfalls §154)`); }
  return s;
}
// 자막 스타일이 원본 루트 index.html에만 있는 편(00005: .production-caption{position:absolute;top:1393px…})은
//   자막 컴포지션만 복사하면 위치·크기를 잃고 화면 밖으로 사라진다(2026-09-27 L2 ch04 실측 — 자막 0줄).
//   captions.html이 쓰는 클래스 중 captions.html 안에 규칙이 없는 것을 루트 <style>에서 찾아 자막 컴포지션 <style> 앞에 넣는다.
function withRootCaptionCss(cap, index, who, quiet = false) {
  const used = new Set([...cap.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)).filter(Boolean));
  const own = (cap.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || []).join('');
  const missing = [...used].filter(c => !new RegExp(`\\.${c.replace(/[-]/g, '\\-')}(?![\\w-])`).test(own));
  if (!missing.length) return cap;
  const rootCss = [...index.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
  const rules = [...rootCss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({sel: m[1].trim(), body: m[2]})).filter(r => !r.sel.startsWith('@'))
    .filter(r => missing.some(c => new RegExp(`\\.${c.replace(/[-]/g, '\\-')}(?![\\w-])`).test(r.sel)));
  if (!rules.length) return cap;
  if (!quiet) console.log(`  ↺ ${who}: 루트 index.html의 자막 스타일 ${rules.length}규칙을 자막 컴포지션에 옮김 (${rules.map(r => r.sel).join(', ')})`);
  const css = rules.map(r => `${r.sel}{${r.body}}`).join('');
  return /<template>\s*<style[^>]*>/.test(cap) ? cap.replace(/(<template>\s*<style[^>]*>)/, `$1${css}`) : cap.replace('<template>', `<template><style>${css}</style>`);
}
function frameBg(html) {   // 프레임 루트 배경색(칼럼 방식 좌우 색면용). 못 찾으면 Navy
  const rootId = html.match(/<div\b[^>]*\bid="([^"]+)"[^>]*data-composition-id=/)?.[1];
  const rule = rootId && html.match(new RegExp(`#${rootId}\\s*\\{([^}]*)\\}`))?.[1];
  return rule?.match(/background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,8})/)?.[1] || BRAND.colors.paper;
}
function writeIfMissing(file, text) { if (!existsSync(file)) { mkdirSync(path.dirname(file), {recursive: true}); writeFileSync(file, text); return true; } return false; }

function build(dir) { return withLock(dir, () => build0(dir)); }
function build0(dir) {
  const {project, b} = readSpec(dir);
  if (!b.chapters.every(c => c.measured && Number.isFinite(c.gain_db))) fail('먼저 plan');
  const hf = path.join(dir, 'hyperframes');
  mkdirSync(hf, {recursive: true});
  const L = LAYOUT[b.captions];
  const tl = timeline(b, b.chapters.map(c => c.measured.duration));
  if (Math.abs(tl.total - readTiming(dir).total) > 1e-3) fail('cuts.json 시간축이 bundle과 다르다 — plan을 다시 실행');
  // 공용 런타임·폰트·핀 버전
  const cli = installedHyperframes()[0]; if (!cli) fail('로컬 HyperFrames가 없다');
  for (const [from, to] of [[`resources/fonts/${BRAND.font.file}`, `fonts/${BRAND.font.file}`], [`resources/fonts/${BRAND.font.license}`, `fonts/${BRAND.font.license}`], ...(BRAND.posterFont ? [[`resources/fonts/${BRAND.posterFont.file}`, `fonts/${BRAND.posterFont.file}`], [`resources/fonts/${BRAND.posterFont.license}`, `fonts/${BRAND.posterFont.license}`]] : []), ['pipeline/templates/hyperframes/gsap.min.js', 'assets/vendor/gsap.min.js']]) {   // brandCss 가 포스터 서체 @font-face 도 싣는다 — 파일도 함께
    mkdirSync(path.dirname(path.join(hf, to)), {recursive: true}); copyFileSync(path.join(ROOT, from), path.join(hf, to));
  }
  const pin = JSON.parse(readFileSync(path.join(source(b.chapters[0]).hf, 'package.json'), 'utf8')).abm?.hyperframesVersion || cli.version;
  const scripts = Object.fromEntries(['lint', 'check', 'render', 'snapshot'].map(c => [c, `node ../../../pipeline/hf-cli.mjs .. ${c}`]));
  writeFileSync(path.join(hf, 'package.json'), JSON.stringify({name: 'abm-' + path.basename(dir).slice(0, 5), private: true, abm: {hyperframesVersion: pin}, scripts}, null, 2) + '\n');
  writeFileSync(path.join(hf, 'hyperframes.json'), JSON.stringify({$schema: 'https://hyperframes.heygen.com/schema/hyperframes.json'}, null, 2) + '\n');
  resolveHyperframes(hf);

  const tracks = [], firstBg = [], drifts = [], audEnd = [];   // audEnd[i] = 챕터 i에서 실제로 들리는 마지막 소리의 끝(묶음 초)
  // 노선 전환이 다음 챕터 제목을 크게 보여 주므로 2번째 챕터부터는 좌상단 라벨을 겹치지 않는다(챕터 1은 0초라 라벨이 필요하다)
  const route = b.chapters.every(c => c.stop);
  for (const [i, ch] of b.chapters.entries()) {
    const nn = pad(i + 1), src = source(ch), T = tl.ch[i];
    const seal = sealCheck(src, ch.render, ch);
    if (!seal.ok) fail(`ch${nn} ${src.name}: ${seal.why} — 납품본과 같은 소스만 묶는다 (루트 락업만 바뀐 편이면 node pipeline/hf-bundle.mjs <p> reseal ${i + 1})`);
    if (seal.lockupOnly) console.log(`  △ ch${nn} ${src.name}: 납품 뒤 루트 락업·브랜드 자산만 바뀜 — 묶음 지문 동일, 조립 계속`);
    if (Math.abs(src.duration - ch.measured.duration) > 1e-3) fail(`ch${nn}: 원본 길이가 plan 이후 바뀌었다 — plan 재실행`);
    // 복사 — chNN/은 매번 새로 만든다(파생물). 손으로 쓰는 묶음 전용 파일은 compositions/bundle/에 둔다.
    const out = path.join(hf, `ch${nn}`);
    rmSync(out, {recursive: true, force: true});
    for (const d of ['assets', 'fonts', '.media']) if (existsSync(path.join(src.hf, d)))
      cpSync(path.join(src.hf, d), path.join(out, d), {recursive: true, filter: p => !p.includes(`${path.sep}vendor`)});
    const files = [...src.slots.map(s => s.src), ...(src.captions ? ['compositions/captions.html'] : []), ...src.rootSubs.map(r => r.src)];
    const compIds = [...new Set(files.map(f => readFileSync(path.join(src.hf, f), 'utf8')).flatMap(t => [...t.matchAll(/data-composition-id=["']([^"']+)["']/g)].map(m => m[1])))];
    // §7.4 보강·B 확장: hyperframes/override/chNN/<원본 경로>가 있으면 원본 대신 쓴다(예: 자막 효과를 넣은 captions.html).
    //   원본과 같은 경로 규칙으로 작성하고, 조립이 같은 방식으로 경로·컴포지션 ID를 바꾼다. 원본 프로젝트는 그대로다.
    // 보강 사본은 compositions/ 밖에 둔다 — HyperFrames lint가 compositions/ 아래 모든 HTML을 훑어, 접두사가 붙기 전 원본 경로를
    //   missing_local_asset 오류로 잡는다(2026-09-26 L1·L3 실측, 렌더에는 영향 없음)
    const ovr = path.join(hf, 'override', `ch${nn}`);
    if (existsSync(path.join(hf, 'compositions/bundle/override', `ch${nn}`))) fail(`ch${nn}: 보강 사본을 hyperframes/override/ch${nn}/ 로 옮긴다 (compositions/bundle/override 는 lint 가 오류로 잡는다)`);
    for (const f of files) {
      const dest = path.join(out, f); mkdirSync(path.dirname(dest), {recursive: true});
      const from = existsSync(path.join(ovr, f)) ? path.join(ovr, f) : path.join(src.hf, f);
      if (from.startsWith(ovr)) console.log(`  ↺ ch${nn} 보강 파일 사용: ${f}`);
      let text = readFileSync(from, 'utf8');
      if (f === 'compositions/captions.html') text = withRootCaptionCss(text, src.index, `ch${nn} ${src.name}`);
      writeFileSync(dest, rewrite(text, nn, compIds));
    }
    firstBg.push(frameBg(readFileSync(path.join(src.hf, src.slots[0].src), 'utf8')));
    // 프레임 슬롯
    tracks.push(`    <!-- ch${nn} ${src.name} · ${mmss(T.start)} -->`);
    // 루트 클립(위치 지도·이음 소품)도 그 시각 프레임과 같은 줌을 따른다 — verify가 그 시각 배율로 무대를 되돌려 비교한다
    const ovSel = [...src.rootSubs.map(r => `#c${nn}-${r.id}`), ...(src.rootInline.length ? [`#c${nn}-root-extra`] : [])].join(',');
    for (const d of driftSlots(ch, src, T)) { drifts.push({...d, sel: `#c${nn}-${d.id}`}); if (ovSel) drifts.push({...d, sel: ovSel, ir: false}); }
    const modes = ch.frames || {};
    src.slots.forEach((s, k) => {
      const mode = modes[s.comp] || 'B';
      const last = k === src.slots.length - 1;
      const start = T.start + s.start, dur = s.dur + (last ? T.gap : 0);   // 마지막 화면을 다음 시작(전환·정리)까지 유지 — 빈 프레임 방지
      if (mode === 'R') {
        const wide = `compositions/bundle/wide/c${nn}-${s.comp}.html`;
        if (!existsSync(path.join(hf, wide))) fail(`ch${nn} ${s.comp}: R 방식인데 ${wide}가 없다 (1920×1080 재구성본)`);
        tracks.push(`    <div id="c${nn}-${s.id}" class="scene clip lf-wide" data-composition-id="c${nn}-w-${s.comp}" data-composition-src="${wide}" data-start="${r6(start)}" data-duration="${r6(dur)}" data-track-index="1" data-width="${W}" data-height="${H}"></div>`);
        return;
      }
      if (mode.startsWith('C')) {
        const color = mode.split(':')[1] || frameBg(readFileSync(path.join(src.hf, s.src), 'utf8'));
        tracks.push(`    <div id="c${nn}-fill-${s.comp}" class="clip lf-fill" data-start="${r6(start)}" data-duration="${r6(dur)}" data-track-index="0" style="background:${esc(color)}"></div>`);
      }
      tracks.push(`    <div id="c${nn}-${s.id}" class="scene clip frame-slot lf-stage${mode === 'B' ? ' lf-bleed' : ''}" data-composition-id="c${nn}-${s.comp}" data-composition-src="ch${nn}/${s.src}" data-start="${r6(start)}" data-duration="${r6(dur)}" data-track-index="1" data-width="1080" data-height="1920"></div>`);
    });
    // 루트 클립(위치 지도·이음 소품) — 원본 루트와 같은 시각·z 순서로 무대 위에 싣는다(source() 주석)
    src.rootSubs.forEach((r, k) => tracks.push(`    <div id="c${nn}-${r.id}" class="scene clip lf-stage lf-bleed" data-composition-id="c${nn}-${r.comp}" data-composition-src="ch${nn}/${r.src}" data-start="${r6(T.start + r.start)}" data-duration="${r6(r.dur)}" data-track-index="${601 + k}" data-width="1080" data-height="1920" style="z-index:${r.z}"></div>`));
    if (src.rootInline.length) {
      const extra = `compositions/root-extra.html`, id = `c${nn}-root-extra`;
      const own = new Set(src.rootInline.join('').match(/\bid="([^"]+)"/g)?.map(x => x.slice(4, -1)) || []);
      const css = src.rootCss.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<=^|\})\s*(html|body|#root|#root-bg)(\s*,\s*[^{]+)?\s*\{[^}]*\}/g, '');   // 뒤보기 — 연달아 있는 규칙(html,body → #root → #root-bg)을 모두 뺀다
      // 원본 루트 스크립트: 메인 타임라인 등록만 이 컴포지션 이름으로. 이 컴포지션에 없는 #id를 글자 그대로 부르는 줄(#root-bg 등)은 뺀다
      const js = src.rootJs.split('\n').filter(l => !(l.match(/(?<!\+\s*)["']#([A-Za-z][\w-]*)["'](?!\s*\+)/g) || []).some(q => !/^["']#[0-9a-fA-F]{3,8}["']$/.test(q) && !own.has(q.slice(2, -1))))
        .join('\n').replace(/window\.__timelines\.main\s*=/g, `window.__timelines["${id}"]=`).replace(/window\.__timelines\[(["'])main\1\]\s*=/g, `window.__timelines["${id}"]=`);
      const gen = `<!doctype html><html lang="${BRAND.language || 'en'}"><body><template><style>
#root{position:absolute;inset:0;width:1080px;height:1920px;overflow:visible}
${css}
</style>
<div id="root" data-composition-id="${id}" data-start="0" data-duration="${r6(src.duration)}" data-width="1080" data-height="1920">
${src.rootInline.join('\n')}
</div>
<script>
${js}
</script></template></body></html>
`;
      // 손질은 override/chNN/compositions/root-extra.html (이 생성본을 복사해 고친다 — 예: 소품 출발점을 가로 창 밖으로)
      const ovf = path.join(ovr, extra), text = existsSync(ovf) ? readFileSync(ovf, 'utf8') : gen;
      if (existsSync(ovf)) console.log(`  ↺ ch${nn} 보강 파일 사용: ${extra}`);
      writeFileSync(path.join(out, extra), rewrite(text, nn, compIds));
      tracks.push(`    <div id="${id}" class="scene clip lf-stage lf-bleed" data-composition-id="${id}" data-composition-src="ch${nn}/${extra}" data-start="${r6(T.start)}" data-duration="${r6(src.duration)}" data-track-index="600" data-width="1080" data-height="1920" style="z-index:25"></div>`);
    }
    if (src.rootSubs.length || src.rootInline.length) console.log(`  ↳ ch${nn} 루트 클립 ${src.rootSubs.length + src.rootInline.length}개 함께 싣는다(${[...src.rootSubs.map(r => r.id), ...(src.rootInline.length ? [`인라인 ${src.rootInline.length} → root-extra.html`] : [])].join(' · ')})`);
    if (b.captions === 'burn') {
      if (!src.captions && !src.frameCaps) fail(`ch${nn} ${src.name}: 자막 컴포지션이 없다 — burn 불가`);
      if (!src.captions) console.log(`  △ ch${nn} ${src.name}: 자막이 프레임 안에 있다(class="clip caption") — 자막 띠 없이 무대(0.9배) 안 자막 그대로, SRT는 프레임 자막에서 만든다`);
      else tracks.push(`    <div id="c${nn}-el-captions" class="clip lf-cap" data-composition-id="c${nn}-captions" data-composition-src="ch${nn}/compositions/captions.html" data-start="${r6(T.start)}" data-duration="${r6(T.dur)}" data-track-index="9" data-width="1080" data-height="1920"></div>`);
    }
    // 오디오 — 음성·효과음·BGM에 챕터 배율(data-volume)을 곱한다. BGM은 전환 동안 페이드아웃.
    const k = 10 ** (ch.gain_db / 20);
    // 원본 큐 손질(묶음 복사본에서만): chapters[].audio_edit = {"<원본 audio id>": {"at": <챕터 로컬 초>, "volume": <원본 대신>, "mute": true}}
    //   2026-09-27 L2 ch01: 00001 confirm(10.52)의 정점이 "$2.16"의 "two" 위에서 1~4kHz로 대사보다 5.5dB 컸다(L1 "$3.40" 가림과 같은 유형)
    const edits = ch.audio_edit || {};
    for (const id of Object.keys(edits)) if (!src.audio.some(a => a.id === id)) fail(`ch${nn} audio_edit: 원본에 없는 audio id ${id}`);
    for (const a0 of src.audio) {
      const ed = edits[a0.id] || {};
      if (ed.mute) { console.log(`  ↺ ch${nn} 원본 큐 뺌: ${a0.id}`); continue; }
      const a = {...a0};
      // 사용자가 싫어해 중단한 효과음은 묶음에서 자동으로 바꾼다(catalog files[].swap — 2026-10-08 rumble → vroom:
      //   "차량 이동 소리가 너무 시끄러워서 대사가 안 들린다"). 납품된 원본 숏츠는 그대로 둔다
      const swap = SFX_CAT.files[path.basename(a.src || '')]?.swap;
      if (swap) {
        const to = `ch${nn}/assets/sfx-extra/${swap}`;
        mkdirSync(path.join(hf, path.dirname(to)), {recursive: true}); copyFileSync(path.join(ROOT, 'resources/sfx/pick', swap), path.join(hf, to));
        const len = Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(ROOT, 'resources/sfx/pick', swap)]).stdout) || 1;
        console.log(`  ↺ ch${nn} 원본 큐 교체: ${a.id} ${path.basename(a.src)} → ${swap}`);
        a.src = to.replace(`ch${nn}/`, ''); a['data-duration'] = String(Math.min(len, Number(a['data-duration'] || len)));
      }
      if (ed.at != null) { console.log(`  ↺ ch${nn} 원본 큐 이동: ${a.id} ${a['data-start']} → ${ed.at}`); a['data-start'] = String(ed.at); }
      if (ed.volume != null) a['data-volume'] = String(ed.volume);
      const isBgm = a.id === 'el-bgm';
      const start = T.start + Number(a['data-start'] || 0);
      let dur = Number(a['data-duration'] || 0), extra = '';
      a['data-volume'] = String(Math.round(Number(a['data-volume'] ?? 1) * k * 1e4) / 1e4);
      if (isBgm && i < b.chapters.length - 1) {
        // BGM 음원은 챕터 길이만큼이라 슬롯을 늘리면 잘린다(check clip_media_fit) — 마지막 0.5초 안에서 줄인다
        const vol = Number(a['data-volume']), fade = Math.min(.5, dur / 4);
        extra = ` data-automation='${JSON.stringify({version: 1, lanes: [{target: 'volume', points: [{t: 0, v: vol}, {t: dur - fade, v: vol}, {t: dur, v: 0}]}]})}'`;
      }
      const src2 = /^(https?:|data:)/.test(a.src) ? a.src : `ch${nn}/${a.src}`;
      const keep = Object.entries(a).filter(([k]) => !['id', 'src', 'data-start', 'data-duration', 'data-hf-id', 'data-track-index', 'data-audio-group'].includes(k)).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
      tracks.push(`    <audio id="c${nn}-${a.id}" src="${esc(src2)}" data-start="${r6(start)}" data-duration="${r6(dur)}" data-track-index="${a['data-track-index'] || 10}"${keep}${extra}></audio>`);
      // 실제로 들리는 끝(파일 길이 − media-start 와 클립 길이 중 짧은 쪽) — 배경 곡이 이어받을 자리
      //   음성 파일은 끝에 무음이 붙어 있다(00060 cut-06 8.56초 중 마지막 약 1.6초) — 파일 길이가 아니라 마지막 소리의 끝(−50 dB 무음 감지)을 쓴다
      const fp = path.join(hf, src2), fd = /^(https?:|data:)/.test(src2) ? dur : (AUDIO_LEN.get(fp) ?? (AUDIO_LEN.set(fp, audibleLen(fp, dur)), AUDIO_LEN.get(fp)));
      audEnd[i] = Math.max(audEnd[i] ?? 0, start + Math.min(dur, fd - Number(a['data-media-start'] || 0)));
    }
    // §7.4 보강 효과음: chapters[].sfx = [{file:"resources/sfx/…", at:<챕터 로컬 초>, volume}] — chNN/assets/sfx-extra/로 복사
    for (const [j, x] of (ch.sfx || []).entries()) {
      const f = path.join(ROOT, x.file || '');
      if (!x.file || !existsSync(f) || !(x.at >= 0 && x.at < T.dur)) fail(`ch${nn} sfx[${j}]: file(저장소 기준 경로)·at(0~${T.dur.toFixed(2)})를 확인`);
      // 숏츠 root 와 같은 권리 검사 — pick/ 의 CREDITS CC0 행 + catalog 신규 사용 중단 (2026-09-26 저작권 검수)
      const lic = x.file.startsWith('resources/sfx/pick/') ? sfxLicenseError(ROOT, path.basename(f), dir) : 'resources/sfx/pick/ 밖의 파일';
      if (lic) fail(`ch${nn} sfx[${j}]: ${lic}`);
      const rel = `ch${nn}/assets/sfx-extra/${path.basename(f)}`;
      mkdirSync(path.join(hf, path.dirname(rel)), {recursive: true}); copyFileSync(f, path.join(hf, rel));
      const len = Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).stdout) || .5;
      tracks.push(`    <audio id="c${nn}-sfx-add-${j}" src="${esc(rel)}" data-start="${r6(T.start + x.at)}" data-duration="${r6(Math.min(len, T.dur - x.at))}" data-track-index="${900 + j}" data-volume="${Math.round((x.volume ?? .6) * k * 1e4) / 1e4}"></audio>`);
    }
    // 챕터 라벨 — 새 편 훅 위 왼쪽 여백 (노선 전환이면 챕터 1만). 0초 포스터가 있으면 챕터 1 라벨은 두지 않는다 —
    //   포스터의 주연 그림이 커져 그 화면이 되므로 주제가 이미 읽혔고, 첫 3초의 글 층(챕터 1 자체 글자·자막)에 하나를 더 얹지 않는다(H03)
    const labeled = (!route || i === 0) && !(i === 0 && tl.P > 0);
    if (labeled) tracks.push(`    <div id="c${nn}-label" class="clip" data-composition-id="bundle-label-${nn}" data-composition-src="compositions/bundle/label-${nn}.html" data-start="${r6(T.start)}" data-duration="3.2" data-track-index="4" data-width="${W}" data-height="${H}" style="position:absolute;inset:0;z-index:35;pointer-events:none"></div>`);
    if (labeled) writeIfMissing(path.join(hf, `compositions/bundle/label-${nn}.html`), labelTemplate(nn, i + 1, ch.label || src.name));
  }
  // 전환 — 챕터마다 stop(짧은 정거장 이름)이 있으면 **노선 전환**(08 §6, 2026-09-26 사용자 "화면전환 잘하고"):
  //   펀치라인 뒤 0.25초 숨 → 비스듬한 남색 패널이 덮는다 → 노선 위 표시가 다음 정거장으로 달리고 정거장이 튄다 → 다음 챕터 제목
  //   → 패널이 왼쪽으로 빠지며 다음 훅이 드러난다(챕터 시작 뒤 0.35초까지 겹침). 없으면 예전 단색 와이프.
  const stops = route ? b.chapters.map(c => ({stop: c.stop, icon: iconPath(c.icon)})) : null;
  const sfxDir = 'compositions/bundle/assets/sfx';
  for (const f of [...(route || tl.P > 0 ? ['whoosh-stereo.wav'] : []), ...(route ? ['confirm.wav'] : []), ]) {
    mkdirSync(path.join(hf, sfxDir), {recursive: true}); copyFileSync(path.join(ROOT, 'resources/sfx/pick', f), path.join(hf, sfxDir, f));
  }
  for (let i = 0; i < b.chapters.length - 1; i++) {
    const nn = pad(i + 1), T = tl.ch[i];
    if (route) {
      const hold = Math.min(.25, Math.max(0, T.gap - 1.3)), OV = .25, start = T.end + hold, dur = T.gap - hold + OV;
      tracks.push(`    <div id="gap-${nn}" class="clip" data-composition-id="bundle-gap-${nn}" data-composition-src="compositions/bundle/gap-${nn}.html" data-start="${r6(start)}" data-duration="${r6(dur)}" data-track-index="2" data-width="${W}" data-height="${H}" style="position:absolute;inset:0;z-index:45"></div>`);
      tracks.push(`    <audio id="gap-${nn}-whoosh" src="${sfxDir}/whoosh-stereo.wav" data-start="${r6(start)}" data-duration="0.9" data-track-index="${800 + i * 2}" data-volume="0.5"></audio>`);
      tracks.push(`    <audio id="gap-${nn}-arrive" src="${sfxDir}/confirm.wav" data-start="${r6(start + ROUTE.arrive)}" data-duration="0.4" data-track-index="${801 + i * 2}" data-volume="0.45"></audio>`);
      writeIfMissing(path.join(hf, `compositions/bundle/gap-${nn}.html`), routeTemplate(nn, dur, OV, i + 1, stops, b.chapters[i + 1].label || b.chapters[i + 1].source, false, b.route_kicker ?? 'YOUR TRIP'));
      continue;
    }
    // 와이프는 0.6초로 고정하고, 격자 때문에 늘어난 전환 시간은 앞쪽 유지(직전 마지막 화면)가 흡수한다
    const dur = Math.min(.6, T.gap);
    tracks.push(`    <div id="gap-${nn}" class="clip" data-composition-id="bundle-gap-${nn}" data-composition-src="compositions/bundle/gap-${nn}.html" data-start="${r6(T.end + T.gap - dur)}" data-duration="${r6(dur)}" data-track-index="2" data-width="${W}" data-height="${H}" style="position:absolute;inset:0;z-index:20"></div>`);
    writeIfMissing(path.join(hf, `compositions/bundle/gap-${nn}.html`), gapTemplate(nn, dur, firstBg[i + 1], i + 2, b.chapters[i + 1].label || b.chapters[i + 1].source));
  }
  if (route) {
    // 완주 전환 — 마지막 챕터 펀치라인 뒤 0.25초 숨 → 네 정거장이 모두 켜진 노선 → 패널이 빠지며 정리 화면
    const T = tl.ch.at(-1), OV = .25, start = T.end + Math.min(.25, T.gap / 4), dur = tl.endStart + OV - start;
    tracks.push(`    <div id="gap-end" class="clip" data-composition-id="bundle-gap-end" data-composition-src="compositions/bundle/gap-end.html" data-start="${r6(start)}" data-duration="${r6(dur)}" data-track-index="2" data-width="${W}" data-height="${H}" style="position:absolute;inset:0;z-index:45"></div>`);
    tracks.push(`    <audio id="gap-end-whoosh" src="${sfxDir}/whoosh-stereo.wav" data-start="${r6(start)}" data-duration="0.9" data-track-index="890" data-volume="0.5"></audio>`);
    tracks.push(`    <audio id="gap-end-arrive" src="${sfxDir}/confirm.wav" data-start="${r6(start + ROUTE.run[0] + .3)}" data-duration="0.4" data-track-index="891" data-volume="0.45"></audio>`);
    writeIfMissing(path.join(hf, 'compositions/bundle/gap-end.html'), routeTemplate('end', dur, OV, b.chapters.length, stops, b.finale_title ?? 'Trip complete.', true, b.route_kicker ?? 'YOUR TRIP'));
  }
  // 배경 곡 — 챕터 BGM이 없는 곳(0초 포스터·전환·완주·정리)에만 깐다. 앞 BGM의 마지막 0.5초 페이드와 겹쳐 이어지고, 다음 챕터 첫 0.35초 안에서 빠진다
  if ((route || tl.P > 0) && existsSync(path.join(ROOT, LONG_BED.file))) {
    const bedRel = 'compositions/bundle/assets/bed.m4a', bedOut = path.join(hf, bedRel);
    if (!existsSync(bedOut)) {
      mkdirSync(path.dirname(bedOut), {recursive: true});
      const r = run('ffmpeg', ['-v', 'error', '-ss', String(LONG_BED.start), '-t', String(LONG_BED.len), '-i', path.join(ROOT, LONG_BED.file), '-vn', '-af', `loudnorm=I=${LONG_BED.lufs}:TP=-2:LRA=11`, '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-y', bedOut]);
      // mp3 앨범 이미지가 영상 스트림으로 잡히면 m4a 머리를 못 쓴다 — -vn (2026-09-26 funshine.mp3)
      if (r.status !== 0 || !statSync(bedOut).size) { rmSync(bedOut, {force: true}); fail(`배경 곡 준비 실패: ${(r.stderr || '').slice(-300)}`); }
    }
    const bed = (id, a, z, off, fadeOut, fadeIn = .3) => {   // 0초 포스터는 첫 프레임부터 소리가 있게 fadeIn 0
      const d = z - a, pts = [{t: 0, v: fadeIn ? 0 : 1}, {t: fadeIn || .01, v: 1}, {t: Math.max((fadeIn || .01) + .01, d - fadeOut), v: 1}, {t: d, v: 0}];
      tracks.push(`    <audio id="${id}" src="${bedRel}" data-start="${r6(a)}" data-duration="${r6(d)}" data-media-start="${r6(off)}" data-track-index="${700 + tracks.length % 90}" data-volume="1" data-automation='${JSON.stringify({version: 1, lanes: [{target: 'volume', points: pts}]})}'></audio>`);
    };
    // 사양(08 §6): 앞 BGM의 마지막 0.5초와 겹쳐 들어온다. 처음 구현은 끝 −0.15라, BGM 파일 자체가 끝에서 페이드하는 편(00001: 33.0초 −41 dB)에서
    //   펀치라인 직후 0.3초 무음 구멍이 났다(2026-09-27 L2 감독, gap-01 32.85~33.15 RMS −46~−57 dBFS)
    if (tl.P > 0) bed('bed-poster', 0, tl.ch[0].start + .35, 31, .35, 0);
    //   챕터 끝이 아니라 **실제로 들리는 마지막 소리의 끝** −0.5에서 들어온다 — BGM 파일이 챕터보다 일찍 끝나는 편(00060 funshine 41.8초 · 00057 페이드)은
    //   챕터 끝 −0.5에 두면 0.35~0.9초 무음 구멍이 났다(2026-10-08 L10 감독, 238.0~238.4 디지털 무음)
    const tail = i => Math.min(tl.ch[i].end, audEnd[i] ?? tl.ch[i].end) - .5;
    if (route) for (let i = 0; i < b.chapters.length - 1; i++) bed(`bed-gap-${pad(i + 1)}`, tail(i), tl.ch[i + 1].start + .35, i * 7, .35);
    if (route) bed('bed-end', tail(b.chapters.length - 1), tl.total, 24, 1.8);
  }
  // 0초 포스터 — cards/thumbnail.html 에서 **매 조립마다** 다시 만든다(썸네일을 고치면 포스터도 따라온다 — 실수 13 방지).
  //   소리: 배경 곡이 0초부터, 그림(#t1)이 챕터 1로 돌아갈 때 노선 전환과 같은 whoosh.
  if (tl.P > 0) {
    const ps = posterComposition(dir, hf, tl.P, b);
    tracks.unshift(`    <div id="el-poster" class="scene clip" data-composition-id="bundle-poster" data-composition-src="compositions/bundle/poster.html" data-start="0" data-duration="${r6(tl.P)}" data-track-index="1" data-width="${W}" data-height="${H}" style="position:absolute;inset:0;z-index:45"></div>`,
      `    <audio id="poster-whoosh" src="${sfxDir}/whoosh-stereo.wav" data-start="${r6(tl.P - POSTER.grow)}" data-duration="0.9" data-track-index="881" data-volume="0.5"></audio>`);
    console.log(ps.placeholder ? `  △ 0초 포스터 자리표시 — ${ps.placeholder} (verify가 막는다. 썸네일을 만들면 다음 조립에 들어간다, 08 §8.1)` : `  0초 포스터 ← cards/thumbnail.html (${tl.P}초, 마지막 ${POSTER.grow}초에 챕터 1 타일이 화면이 된다)`);
  }
  tracks.push(`    <div id="el-end" class="scene clip" data-composition-id="bundle-end" data-composition-src="compositions/bundle/end.html" data-start="${r6(tl.endStart)}" data-duration="${r6(tl.E)}" data-track-index="1" data-width="${W}" data-height="${H}" style="position:absolute;inset:0"></div>`);
  // 정리 화면 장면 카드: 챕터 원본 승인 렌더의 무대 위쪽 16:9(헤드라인이 잘리지 않게) (still_at 초, 기본 = 첫 프레임의 60% · still_y = 자를 윗변, 기본 무대 위 y360)
  const stills = b.chapters.map((c, i) => {
    const src = source(c), rel = `compositions/bundle/assets/end-ch${pad(i + 1)}.jpg`, out = path.join(hf, rel);
    if (!existsSync(out)) {
      mkdirSync(path.dirname(out), {recursive: true});
      const at = c.still_at ?? (src.slots[0].start + src.slots[0].dur * .6);
      run('ffmpeg', ['-v', 'error', '-ss', String(at), '-i', path.join(src.dir, 'output', c.render), '-frames:v', '1', '-vf', `crop=1080:608:0:${c.still_y ?? 360},scale=640:360`, '-q:v', '3', '-y', out]);
    }
    return existsSync(out) ? rel : null;
  });
  writeIfMissing(path.join(hf, 'compositions/bundle/end.html'), endTemplate(tl.E, b.promise || '', b.chapters.map(c => c.label || c.source), stills.every(Boolean) ? stills : []));

  // 락업은 전환 패널(z 45)·자막(z 40) 위에 남는다. 0초 포스터 동안은 두지 않는다 — 포스터는 썸네일과 같은 그림이고, 주연 그림이 커지며
  //   타일 속 로고(스냅샷에 찍힌 것)가 제자리에 오는 순간 이 락업이 이어받는다
  const lock = lockupStyle().replace(/top:\d+px/, `top:${LOCKUP.top}px`).replace(/left:\d+px/, `left:${LOCKUP.left}px`).replace(/z-index:\d+/, 'z-index:50');
  const logoSrc = path.join(ROOT, LONG_LOGO.file), logoRel = `compositions/bundle/assets/${path.basename(LONG_LOGO.file)}`;
  if (existsSync(logoSrc)) { mkdirSync(path.join(hf, path.dirname(logoRel)), {recursive: true}); copyFileSync(logoSrc, path.join(hf, logoRel)); }
  const logoTag = existsSync(logoSrc)
    ? `<div id="el-root-lockup" class="clip" data-start="${tl.P ? r6(tl.P) : 0}" data-duration="${r6(tl.total - tl.P)}" data-track-index="3" style="position:absolute;left:${LONG_LOGO.left}px;top:${LONG_LOGO.top}px;height:${LONG_LOGO.height}px;z-index:50;pointer-events:none"><img src="${logoRel}" alt="Korea, Made Clear" style="display:block;height:100%;width:auto;filter:drop-shadow(0 0 1.6px #111B35) drop-shadow(0 0 1.6px #111B35) drop-shadow(0 0 1.6px #111B35) drop-shadow(0 2px 6px rgba(17,27,53,.6))"></div>`
    : `<div id="el-root-lockup" class="clip" data-start="${tl.P ? r6(tl.P) : 0}" data-duration="${r6(tl.total - tl.P)}" data-track-index="3" style="${lock}">${BRAND.lockup.text}</div>`;
  const stage = `left:${L.left}px;top:${L.top}px;width:1080px;height:1920px${L.scale !== 1 ? `;transform:scale(${L.scale});transform-origin:0 0` : ''}`;
  const html = `<!DOCTYPE html>
<html lang="${BRAND.language || 'en'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=${W}, height=${H}">
  <title>${esc(project.title || path.basename(dir))}</title>
  <script src="assets/vendor/gsap.min.js"></script>
  <style>
    ${brandCss()}
    * {box-sizing:border-box}
    html,body {margin:0;width:${W}px;height:${H}px;overflow:hidden;background:var(--abmen-paper)}
    #root {position:relative;width:${W}px;height:${H}px;overflow:hidden;font-family:Inter,sans-serif;color:var(--abmen-ink);font-weight:550;font-optical-sizing:auto}
    #root-bg {position:absolute;inset:0;background:var(--abmen-paper)}
    /* hf-bundle: 원본 1080×1920 프레임을 무대로 얹는다 (08 §4). 캡션 ${b.captions} */
    .lf-stage {position:absolute;${stage}}
    .lf-stage.lf-bleed > div {overflow:visible!important}
    .lf-fill {position:absolute;inset:0}
    .lf-wide {position:absolute;inset:0}
    ${L.cap ? `.lf-cap {position:absolute;left:${L.cap.left}px;top:${L.cap.top}px;width:1080px;height:1920px;z-index:40;pointer-events:none}` : ''}
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${r6(tl.total)}" data-width="${W}" data-height="${H}">
    <div id="root-bg"></div>
    <!-- ABMEN:bundle:start — hf-bundle build가 매번 다시 쓴다. 손으로 고치지 않는다 -->
${tracks.join('\n')}
    <!-- ABMEN:bundle:end -->
    ${logoTag}
  </div>
  <script>
    window.__timelines=window.__timelines||{};
    window.__timelines.main=gsap.timeline({paused:true});${drifts.length ? `
    // 읽기 멈춤 호흡(chapters[].drift) — 무대 슬롯의 느린 카메라 줌. 배율·위치는 verify가 같은 식으로 역산한다
    (function(tl){${drifts.map(d => { const a = driftXY(L, d.s0), z = driftXY(L, d.s1);
      return `\n      tl.fromTo('${d.sel}',{scale:${r6(L.scale * d.s0)},x:${r6(a.x)},y:${r6(a.y)}},{scale:${r6(L.scale * d.s1)},x:${r6(z.x)},y:${r6(z.y)},duration:${r6(d.dur)},ease:'sine.inOut'${d.ir === false ? ',immediateRender:false' : ''}},${r6(d.start)});`; }).join('')}
    })(window.__timelines.main);` : ''}
  </script>
</body>
</html>
`;
  writeFileSync(path.join(hf, 'index.html'), html);
  // 셰이더를 쓴 챕터가 있으면 묶음에도 번들·브리지·루트 data-requires-webgpu 를 깐다 — 원본 복사는 assets/vendor 를 빼므로(docs/14 §16)
  const shaderCh = b.chapters.map((c, i) => shaderUse(source(c).hf).files.length ? `ch${pad(i + 1)}` : null).filter(Boolean);
  if (shaderCh.length) console.log(`  셰이더 챕터 ${shaderCh.join('·')} — ${installShaders(hf).join(' · ') || '번들 설치 그대로'}`);
  console.log(`✔ 조립 — ${b.chapters.length}챕터 · ${tl.total.toFixed(2)}초 · 캡션 ${b.captions} · hyperframes/index.html`);
  console.log(`  원본 봉인 일치 ${b.chapters.length}/${b.chapters.length} · 복사 ch01~ch${pad(b.chapters.length)} (파생물, 매번 새로 만든다)`);
  if (drifts.length) console.log(`  읽기 멈춤 호흡: ${b.chapters.map((c, i) => c.drift ? `ch${pad(i + 1)} ${c.drift}` : null).filter(Boolean).join(' · ')} (슬롯 ${drifts.length}개)`);
  console.log(`  손으로 다듬을 파일: compositions/bundle/ (gap·label·end, R 방식 wide/) — 없을 때만 기본판을 만든다. poster.html은 cards/thumbnail.html에서 매번 만든다`);
}

// ── 기본 템플릿 — 작동하는 최소판. 디자인은 ④에서 이 파일을 직접 다듬는다 ──
const tplHead = (id, dur, css) => `<!doctype html><html lang="${BRAND.language || 'en'}"><body><template><style>
#root{position:absolute;inset:0;width:${W}px;height:${H}px;font-family:Inter,sans-serif;overflow:hidden}
${css}
</style>
<div id="root" data-composition-id="${id}" data-start="0" data-duration="${dur}" data-width="${W}" data-height="${H}">`;
const tplTail = (id, body) => `</div>
<script>
window.__timelines=window.__timelines||{};
(function(){const tl=gsap.timeline({paused:true});
${body}
window.__timelines["${id}"]=tl;})();
</script></template></body></html>
`;
function labelTemplate(nn, n, text) {
  // 휴대폰 가로 재생에서도 읽히는 크기(2026-09-26 L1: 26px 제목은 폰에서 약 11px). 배경이 넓어진 사진 위에 올라도 받침이 글자를 지킨다.
  const id = `bundle-label-${nn}`;
  return tplHead(id, 3.2, `#lb{position:absolute;left:${LOCKUP.left}px;top:150px;width:392px;box-sizing:border-box;padding:14px 20px 16px;border-radius:12px;background:rgba(17,27,53,.88);color:#FFF5DF;opacity:0}
#lb b{display:block;font-size:26px;font-weight:800;letter-spacing:.12em;color:#C8F477}
#lb span{display:block;margin-top:4px;font-size:36px;font-weight:780;line-height:1.14;letter-spacing:-.015em}`) +
`<div id="lb"><b>${pad(n)}</b><span>${esc(text)}</span></div>` +
  tplTail(id, `tl.fromTo('#lb',{opacity:0,x:-24},{opacity:1,x:0,duration:.35,ease:'power3.out'},.45);
tl.to('#lb',{opacity:0,x:-16,duration:.3,ease:'power2.in'},2.85);`);
}
function gapTemplate(nn, dur, color, n, label) {
  // 덮개가 단색이면 빈 화면으로 잡힌다(render-gate ③, 2026-09-26 실측) — 다음 챕터 번호·제목을 얹는다
  const id = `bundle-gap-${nn}`;
  return tplHead(id, r6(dur), `#wp{position:absolute;left:0;top:0;width:${W}px;height:${H}px;background:${color};transform-origin:100% 50%}
#wt{position:absolute;left:0;right:0;top:470px;text-align:center;color:#FFF5DF;opacity:0}
#wt b{display:block;font-size:30px;font-weight:800;letter-spacing:.14em;color:#C8F477}
#wt span{display:block;margin-top:8px;font-size:64px;font-weight:800;letter-spacing:-.03em}`) +
`<div id="wp"></div><div id="wt"><b>${pad(n)}</b><span>${esc(label)}</span></div>` +
  tplTail(id, `tl.fromTo('#wp',{scaleX:0},{scaleX:1,duration:${(dur * .55).toFixed(3)},ease:'power3.inOut'},0);
tl.set('#wt',{opacity:1},${(dur * .3).toFixed(3)});
tl.fromTo('#wt',{x:60},{x:0,duration:${(dur * .5).toFixed(3)},ease:'power3.out'},${(dur * .3).toFixed(3)});`);
}
// 노선 전환 — 정거장 n개가 가로로 놓이고, k번째에서 k+1번째로 표시가 달린다. 모든 묶음이 같은 동작·소리를 쓴다(채널 기억).
const ROUTE = {enter: .38, run: [.42, .98], arrive: .98};
function iconPath(name) {
  if (!name) return null;
  const f = path.join(ROOT, 'resources/icons', `${name}.svg`);
  if (!existsSync(f)) fail(`아이콘 없음: resources/icons/${name}.svg`);
  const t = readFileSync(f, 'utf8');
  return {viewBox: t.match(/viewBox="([^"]+)"/)?.[1] || '0 -960 960 960', d: [...t.matchAll(/<path[^>]*\bd="([^"]+)"/g)].map(m => m[1])};
}
function routeTemplate(nn, dur, ov, k, stops, label, finale = false, kicker = 'YOUR TRIP') {
  // k = 방금 끝난 챕터 번호(1부터). 표시는 정거장 k → k+1. 제목은 다음 챕터.
  // 2026-09-26 사용자 "무슨 이미지지 애매한데" → 정지 화면만으로 여정 지도로 읽히게: 「YOUR TRIP · k+1 OF n」 머리글,
  //   큰 정거장(150px)·이름(34px), 도착 정거장에 NOW 표시.
  const id = `bundle-gap-${nn}`, n = stops.length, x0 = 330, x1 = W - 330, gapX = (x1 - x0) / Math.max(1, n - 1), Y = 720, R = 75;
  // finale: 마지막 챕터 뒤 정리 화면으로 — 네 정거장이 모두 켜진 노선(표시 이동 없음), 「YOUR TRIP · n OF n」 + 「Trip complete.」(bundle.finale_title)
  // 머리글은 묶음 약속에 맞춘다(bundle.route_kicker, 기본 YOUR TRIP — L2 돈 묶음은 WHAT IT COSTS)
  const X = i => Math.round(x0 + i * gapX), exitAt = r6(dur - ov), done = finale ? n - 1 : k - 1, next = finale ? n - 1 : k;
  const node = (s, i) => `<div class="nd${i <= done ? ' on' : ''}" id="nd${i}" style="left:${X(i) - R}px;top:${Y - R}px">${s.icon
    ? `<svg viewBox="${s.icon.viewBox}" aria-hidden="true">${s.icon.d.map(d => `<path d="${d}"/>`).join('')}</svg>` : `<i>${pad(i + 1)}</i>`}</div><div class="sw${i <= done ? ' on' : ''}" id="sw${i}" style="left:${X(i) - 170}px;top:${Y + R + 22}px">${esc(s.stop)}</div>`;
  return tplHead(id, r6(dur), `#pn{position:absolute;left:-260px;top:-40px;width:${W + 520}px;height:${H + 80}px;background:#111B35;transform:skewX(-12deg);transform-origin:50% 50%}
#pn i{position:absolute;left:0;top:0;bottom:0;width:18px;background:#C8F477}
#ct{position:absolute;inset:0}
#tt{position:absolute;left:160px;right:160px;top:250px;text-align:center;color:#FFF5DF;opacity:0;text-wrap:balance}
#tt b{display:block;font-size:30px;font-weight:800;letter-spacing:.16em;color:#C8F477}
#tt span{display:block;margin-top:12px;font-size:78px;font-weight:800;letter-spacing:-.03em;line-height:1.02}
.ln{position:absolute;top:${Y - 7}px;height:14px;border-radius:7px}
#lb0{left:${X(0)}px;width:${X(n - 1) - X(0)}px;background:#2A3A6B}
#lb1{left:${X(0)}px;width:${X(next) - X(0)}px;background:#C8F477;transform-origin:0 50%}
.nd{position:absolute;width:${R * 2}px;height:${R * 2}px;border-radius:50%;background:#111B35;border:8px solid #2A3A6B;box-sizing:border-box;display:flex;align-items:center;justify-content:center;color:#6B7BAA}
.nd svg{width:84px;height:84px;fill:currentColor}
.nd i{font-style:normal;font-size:44px;font-weight:800}
.nd.on{background:#C8F477;border-color:#C8F477;color:#111B35}
.sw{position:absolute;width:340px;text-align:center;font-size:34px;font-weight:800;letter-spacing:.1em;color:#6B7BAA}
.sw.on{color:#FFF5DF}
#now{position:absolute;left:${X(next) - 60}px;top:${Y - R - 64}px;width:120px;height:46px;border-radius:23px;background:#C8F477;color:#111B35;font-size:26px;font-weight:900;letter-spacing:.14em;display:flex;align-items:center;justify-content:center;opacity:0}
#mk{position:absolute;left:${X(done) - 20}px;top:${Y - 20}px;width:40px;height:40px;border-radius:50%;background:#FFF5DF;box-shadow:0 0 0 10px rgba(200,244,119,.35)}`) +
`<div id="pn"><i></i></div><div id="ct"><div id="tt"><b>${esc(kicker)} · ${finale ? n : k + 1} OF ${n}</b>${label ? `<span>${esc(label)}</span>` : ''}</div><div class="ln" id="lb0"></div><div class="ln" id="lb1"></div><div id="mk"></div>${stops.map(node).join('')}${finale ? '' : '<div id="now">NOW</div>'}</div>` +
  tplTail(id, finale ? `tl.fromTo('#pn',{x:${W + 700}},{x:0,duration:${ROUTE.enter},ease:'power3.inOut'},0);
tl.fromTo('#ct',{x:${W + 700}},{x:0,duration:${ROUTE.enter},ease:'power3.inOut'},0);
tl.set('#mk',{opacity:0},0);
tl.fromTo('.nd',{scale:1},{scale:1.14,duration:.16,ease:'power2.out',yoyo:true,repeat:1,stagger:.1},${r6(ROUTE.run[0])});
tl.fromTo('#tt',{opacity:0,y:28},{opacity:1,y:0,duration:.34,ease:'power3.out'},${r6(ROUTE.run[0] + .1)});
tl.to('#pn,#ct',{x:${-(W + 700)},duration:${r6(ov)},ease:'power3.in'},${exitAt});` : `const L=${X(done) - X(0)}/${Math.max(1, X(next) - X(0))};
tl.fromTo('#pn',{x:${W + 700}},{x:0,duration:${ROUTE.enter},ease:'power3.inOut'},0);
tl.fromTo('#ct',{x:${W + 700}},{x:0,duration:${ROUTE.enter},ease:'power3.inOut'},0);
tl.fromTo('#lb1',{scaleX:L},{scaleX:1,duration:${r6(ROUTE.run[1] - ROUTE.run[0])},ease:'power2.inOut'},${ROUTE.run[0]});
tl.fromTo('#mk',{x:0},{x:${X(next) - X(done)},duration:${r6(ROUTE.run[1] - ROUTE.run[0])},ease:'power2.inOut'},${ROUTE.run[0]});
tl.set('#nd${next}',{backgroundColor:'#C8F477',borderColor:'#C8F477',color:'#111B35'},${ROUTE.arrive});
tl.set('#sw${next}',{color:'#FFF5DF'},${ROUTE.arrive});
tl.fromTo('#nd${next}',{scale:.82},{scale:1,duration:.42,ease:'back.out(3)'},${ROUTE.arrive});
tl.fromTo('#now',{opacity:0,y:14},{opacity:1,y:0,duration:.26,ease:'back.out(2.4)'},${r6(ROUTE.arrive + .06)});
tl.fromTo('#tt',{opacity:0,y:28},{opacity:1,y:0,duration:.34,ease:'power3.out'},${r6(ROUTE.run[0] + .22)});
// 퇴장은 클립 끝에서 정확히 끝난다 — 0.05초 길면 패널이 반쯤 덮은 채 한 프레임에 사라진다(2026-09-26 감독)
tl.to('#pn,#ct',{x:${-(W + 700)},duration:${r6(ov)},ease:'power3.in'},${exitAt});`);
}
// ── 0초 포스터(2026-10-08 사용자: "0초 첫장은 해당 영상들의 포스터 형식으로 클릭하고 싶게") ──
//   원본은 cards/thumbnail.html(1280×720 CSS) 하나다 — 썸네일과 0초 포스터가 같은 그림이어야 클릭한 약속이 첫 화면에서 확인된다
//   (L02 Galloway "썸네일 장면을 인트로에서 다시", YouTube 「인트로」 지표는 썸네일·제목 약속과의 일치로 해석한다 — 07 L04).
//   한 장은 대표 영상(챕터 1 = 조회수가 가장 높은 편)의 포스터다 — 주연 그림 #t1·볼 이유·주제 제목·「+N MORE」(2026-10-08 사용자: 네 칸 조합은 복잡해 눈길이 안 간다).
//   0초 = 썸네일 그대로(검증: verify가 0초 스냅샷과 output/thumbnail.jpg를 대조) → 장면이 천천히 다가온다(글자를 튀기는 기교는 쓰지 않는다 — 같은 날 「기교 빼고」)
//   → 마지막 GROW초에 주연 그림(#t1)이 화면 전체로 커지고 나머지는 빠진다. #t1의 프레임은 챕터 1 첫 화면(묶음 poster_s초)의 스냅샷이라
//   커진 끝 화면 = 챕터 1의 첫 화면이다(검증: verify가 그 프레임과 poster_s초 스냅샷을 대조).
const tileBox = attrs => {
  const fr = attrs.match(/\bdata-frame="([^"]+)"/)?.[1], v = (attrs.match(/\bdata-box="([^"]+)"/)?.[1] || '').split(',').map(Number);
  return fr && v.length === 4 && v.every(Number.isFinite) && v[2] > v[0] && v[3] > v[1] ? {fr, v} : null;
};
// 타일 안 프레임(1920×1080) 배치 — 타일 크기에 대한 %. 템플릿 thumbnail-long.html의 스크립트와 같은 식이다(둘을 함께 고친다)
const frameStyle = ([x0, y0, x1, y1]) => {
  const w = x1 - x0, h = y1 - y0, p = n => `${Math.round(n * 1e4) / 1e4}%`;
  return `left:${p(-x0 / w * 100)};top:${p(-y0 / h * 100)};width:${p(W / w * 100)};height:${p(H / h * 100)}`;
};
function posterComposition(dir, hf, P, b) {
  const file = path.join(dir, 'cards/thumbnail.html'), out = path.join(hf, 'compositions/bundle/poster.html');
  const adir = path.join(hf, 'compositions/bundle/assets/poster'), id = 'bundle-poster', G = Math.min(POSTER.grow, P / 3);
  rmSync(adir, {recursive: true, force: true}); mkdirSync(adir, {recursive: true});
  let why = existsSync(file) ? null : 'cards/thumbnail.html 없음', css = '', body = '';
  if (!why) {
    const src = readFileSync(file, 'utf8'), todo = src.replace(/<!--[\s\S]*?-->/g, '').match(/TODO-[\w-]*/);
    if (todo) why = `cards/thumbnail.html에 ${todo[0]} 자리표시가 남았다`;
  }
  if (!why) {
    const src = readFileSync(file, 'utf8');
    const asset = u => {   // cards/ 기준 경로 → 조립본 경로. 서체는 hyperframes/fonts/, 그림은 포스터 전용 폴더(매번 새로)
      if (/^(data:|https?:|#)/.test(u)) return u;
      const abs = path.resolve(path.dirname(file), u);
      if (!existsSync(abs)) fail(`0초 포스터: cards/thumbnail.html이 참조하는 ${u}가 없다`);
      if (/\.(woff2?|ttf|otf)$/i.test(abs)) {
        const f = path.join(hf, 'fonts', path.basename(abs));
        if (!existsSync(f)) { mkdirSync(path.dirname(f), {recursive: true}); copyFileSync(abs, f); }
        return `fonts/${path.basename(abs)}`;
      }
      copyFileSync(abs, path.join(adir, path.basename(abs)));
      return `compositions/bundle/assets/poster/${path.basename(abs)}`;
    };
    // 썸네일 선택자는 #pw 안으로 묶는다 — 묶음 index에 모든 컴포지션 CSS가 한 문서로 들어가 썸네일의 `*{margin:0;padding:0}`이
    //   챕터 프레임의 h2 기본 여백을 지웠다(2026-10-09 L9 ch02 08-end 제목 42px 상승, verify 0.956). html·body 규칙은 뺀다
    const scope = sel => sel.split(',').map(s => (s = s.trim()) && (s === ':root' ? '#pw' : /^(from|to|[\d.]+%)$/.test(s) ? s : `#pw ${s}`)).join(',');
    css = (src.match(/<style[^>]*>([\s\S]*?)<\/style>/i)?.[1] || '').replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\})\s*html\s*,\s*body\s*\{[^}]*\}/g, '$1')
      .replace(/(^|\})(\s*)([^{}]+)\{/g, (m, a, ws, sel) => sel.trim().startsWith('@') ? m : `${a}${ws}${scope(sel)}{`)
      .replace(/url\(\s*['"]?([^'")]+?)['"]?\s*\)/g, (_, u) => `url('${asset(u)}')`);
    body = (src.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\b(src|data-frame)="([^"]+)"/g, (_, a, u) => `${a}="${asset(u)}"`)
      .replace(/<div\b([^>]*\bclass="[^"]*\btile\b[^"]*"[^>]*)>/g, (m, attrs) => { const t = tileBox(attrs); return t && !/\bid="t1"/.test(attrs) ? `${m}<img class="fr" src="${t.fr}" alt="" style="${frameStyle(t.v)}">` : m; });   // #t1의 그림은 아래 커지는 층이 맡는다
    if (!tileBox(body.match(/<div\b([^>]*\bid="t1"[^>]*)>/)?.[1] || '')) why = '#t1(주연 그림)에 data-frame·data-box가 없다 — 챕터 1 첫 화면의 스냅샷이어야 커지며 이어진다(thumb frames)';
  }
  const t1 = why ? null : tileBox(body.match(/<div\b([^>]*\bid="t1"[^>]*)>/)[1]);
  if (why) {
    writeFileSync(out, tplHead(id, r6(P), `#pp{position:absolute;inset:0;background:#111B35}
#pt{position:absolute;left:160px;right:160px;top:420px;text-align:center;color:#FFF5DF;font-size:76px;font-weight:800;letter-spacing:-.03em}`) +
      `<div id="pp" data-poster="placeholder"></div><div id="pt">${esc(b.promise || 'POSTER')}</div>` +
      tplTail(id, `tl.fromTo('#pt',{scale:1},{scale:1.04,duration:${r6(P)},ease:'none'},0);`));
    return {placeholder: why};
  }
  // 커지는 층(#gx): 챕터 1 프레임 전체를 담고 0초부터 #t1 자리·배율로 보인다(썸네일의 #t1 그림과 같은 식 — 0초 화면이 썸네일과 같다).
  //   마지막 GROW초에 창(clip-path)은 타일 → 화면 전체로, 그림은 타일 배율 → 1로 간다. left/top·width/height 트윈은 정수 화소로 끊겨 HyperFrames lint가 막는다 —
  //   변환(x·y·scale)과 clip-path만 쓴다. 타일 자리는 템플릿마다 다를 수 있어 조립 시점이 아니라 화면에서 잰다(offsetLeft·offsetWidth — #pz 기준, 변환 무관)
  //   칸(.tile)은 흐리지 않는다 — 상자가 프레임 밖으로 나간 쪽은 #t1 바탕색(벽·하늘을 잇는 색)이 채우고, 그림이 돌아가는 동안 그 띠가 남색으로 번쩍이지 않게
  const has = re => re.test(body), at = r6(P - G), [x0, y0, x1] = t1.v, f = 1280 / W;
  const js = [`const R=document.querySelector('[data-composition-id="${id}"]')||document,T=R.querySelector('#t1');
const tx=T.offsetLeft,ty=T.offsetTop,tw=T.offsetWidth,th=T.offsetHeight,s=tw/(${x1 - x0}*${f});`,
    `tl.fromTo('#pw',{scale:1},{scale:1.03,duration:${at},ease:'sine.inOut'},0);`,
    `tl.fromTo('#gx',{clipPath:\`inset(\${ty}px \${1280-tx-tw}px \${720-ty-th}px \${tx}px)\`},{clipPath:'inset(0px 0px 0px 0px)',duration:${r6(G)},ease:'power3.inOut'},${at});`,
    `tl.fromTo('#gf',{x:tx-s*${r6(x0 * f)},y:ty-s*${r6(y0 * f)},scale:s},{x:0,y:0,scale:1,duration:${r6(G)},ease:'power3.inOut'},${at});`,
    `tl.to('#pw',{scale:1,duration:${r6(G)},ease:'power3.inOut'},${at});`,
    `tl.to('#pz > *:not(#gx):not(.tile)',{opacity:0,duration:${r6(G * .5)},ease:'power2.in'},${at});`].filter(Boolean).join('\n');
  writeFileSync(out, `<!-- hf-bundle build가 cards/thumbnail.html에서 매번 다시 만든다. 손으로 고치지 않는다 — 썸네일을 고친다 -->\n` +
    tplHead(id, r6(P), `#pw{position:absolute;inset:0;background:#111B35;transform-origin:50% 50%}
#pz{position:absolute;left:0;top:0;width:1280px;height:720px;transform:scale(1.5);transform-origin:0 0;overflow:hidden}
.tile{overflow:hidden}
.tile>.fr{position:absolute;display:block;max-width:none}
#gx{position:absolute;left:0;top:0;width:1280px;height:720px;overflow:hidden;z-index:30}
/* 글자·가림판은 그림 층 위(z 31)에서 사라진다 — 층 아래로 한 프레임에 꺼지지 않게(스냅샷 실측). 썸네일의 인라인 z-index(가림판 z 1 등)도
   그림 층 아래로 숨지 않게 !important — 그 사이 순서는 썸네일의 문서 순서를 따른다(2026-10-08: 가림판이 숨어 잘린 원이 0초에 드러났다) */
#pz>*:not(.tile):not(#gx){z-index:31!important}
#gf{position:absolute;left:0;top:0;width:1280px;height:720px;display:block;max-width:none;transform-origin:0 0}
${css}`) + `<div id="pw"><div id="pz">${body}<div id="gx"><img id="gf" src="${t1.fr}" alt=""></div></div></div>` + tplTail(id, js));
  return {placeholder: null};
}
function endTemplate(dur, promise, labels, stills = []) {
  // 0초부터 약속·목록이 보인다(빈 화면 방지). 오른쪽 절반은 YouTube 엔드스크린 요소 자리로 비운다(08 §8).
  // 🔴 흐름 배치 — 절대 top으로 줄을 쌓으면 두 줄 제목이 첫 줄을 덮는다(2026-09-26 L1 실측).
  //    stills가 있으면 챕터마다 원본 승인 렌더에서 뽑은 장면 카드(2열)를 쓴다. 천천히 밀어 넣어 10초 정지를 피한다.
  //    5챕터 이상은 3열 — 2열 3줄은 1080 높이를 넘겨 좌상단 로고(y34~134)를 덮는다(2026-09-27 L2 계산). 오른쪽 절반(x960~)은 비운다.
  //    내용은 y170~1040 안에서만 가운데 정렬 — 약속 문구가 4줄이면 위로 밀려 로고를 덮었다(2026-10-08 L8 감독). 약속은 제목처럼 짧게(한두 줄)
  const id = 'bundle-end', cards = stills.length === labels.length, cols = labels.length > 4 ? 3 : 2;
  return tplHead(id, r6(dur), `#eb{position:absolute;inset:0;background:#111B35}
#ec{position:absolute;left:120px;top:170px;bottom:40px;width:${cards ? (cols === 3 ? 840 : 800) : 760}px;display:flex;flex-direction:column;justify-content:center}
#et{color:#C8F477;font-size:52px;font-weight:800;letter-spacing:-.025em;line-height:1.05;text-wrap:balance;margin-bottom:${cards ? 36 : 28}px}
.er{color:#FFF5DF;font-size:34px;font-weight:700;line-height:1.2;margin-top:24px}
.er b{color:#C8F477;margin-right:16px;font-variant-numeric:tabular-nums}
#eg{display:grid;grid-template-columns:repeat(${cols},1fr);gap:${cols === 3 ? '28px 22px' : '26px 28px'}}
.ec .im{position:relative;width:100%;aspect-ratio:16/9;border-radius:14px;overflow:hidden;background:#1C2A52;border:2px solid rgba(255,245,223,.18)}
.ec img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.ec .t{margin-top:10px;color:#FFF5DF;font-size:${cols === 3 ? 21 : 24}px;font-weight:750;line-height:1.18;letter-spacing:-.01em}
.ec .t b{color:#C8F477;margin-right:10px;font-variant-numeric:tabular-nums}`) +
`<div id="eb"></div><div id="ec"><div id="et">${esc(promise)}</div>${cards
    ? `<div id="eg">${labels.map((l, k) => `<div class="ec er-c" id="er${k}"><div class="im"><img src="${esc(stills[k])}" alt=""></div><div class="t"><b>${pad(k + 1)}</b>${esc(l)}</div></div>`).join('')}</div>`
    : labels.map((l, k) => `<div class="er" id="er${k}"><b>${pad(k + 1)}</b>${esc(l)}</div>`).join('')}</div>` +
  tplTail(id, `tl.fromTo('#et',{x:-30},{x:0,duration:.45,ease:'power3.out'},0);
tl.fromTo('${cards ? '.ec' : '.er'}',{x:-24},{x:0,duration:.4,ease:'power3.out',stagger:.1},0);${cards ? `
tl.fromTo('.ec img',{scale:1},{scale:1.08,duration:${r6(dur)},ease:'none'},0);` : ''}`);
}

// ── 대사 문장 목록: 보강 효과음 큐를 문장 경계에 맞춘다 (자막 = 실제로 들리는 문장·시각) ──
function sentences(src) {
  const cues = rootCaptionChunks(src.hf);
  const out = []; let cur = null;
  for (const c of cues) {
    if (!cur) cur = {start: c.start, end: c.end, text: c.text};
    else { cur.end = c.end; cur.text += ' ' + c.text; }
    if (/[.!?…]["”’)]?$/.test(c.text.trim())) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}
function lines(dir, which) {
  const {b} = readSpec(dir);
  b.chapters.forEach((ch, i) => {
    if (which && Number(which) !== i + 1) return;
    const src = source(ch);
    console.log(`\n  ch${pad(i + 1)} ${src.name} — 문장(챕터 로컬 초). 보강 효과음(chapters[].sfx[].at)은 핵심어를 가리지 않게 이 시각을 보고 놓는다`);
    for (const x of sentences(src)) console.log(`   ${x.start.toFixed(2).padStart(6)}–${x.end.toFixed(2).padStart(6)} (${(x.end - x.start).toFixed(2)}s)  ${x.text}`);
  });
}

// ── 검증 ──────────────────────────────────────────────────────────────────
function snapshot(hf, times) {
  const {cli} = resolveHyperframes(hf);
  rmSync(path.join(hf, 'snapshots'), {recursive: true, force: true});
  const r = run(process.execPath, [cli, 'snapshot', '.', '--at', times.map(t => t.toFixed(3)).join(',')], {cwd: hf});
  if (r.status !== 0) fail(`snapshot 실패: ${hf}\n${(r.stderr || r.stdout).slice(-600)}`);
  const dirS = path.join(hf, 'snapshots');
  const files = readdirSync(dirS).filter(f => /^frame-.*\.png$/.test(f));
  return t => { const f = files.find(x => Math.abs(Number(x.match(/at-([\d.]+)s/)[1]) - t) < 6e-4); return f && path.join(dirS, f); };
}
function ssim(a, b, fa, fb) {
  const r = run('ffmpeg', ['-hide_banner', '-i', a, '-i', b, '-lavfi', `[0:v]${fa}[x];[1:v]${fb}[y];[x][y]ssim`, '-f', 'null', '-']);
  return Number((r.stderr || '').match(/All:([\d.]+)/)?.[1] ?? NaN);
}
// 안쪽 대조 — 무대 좌우 60px(원본 좌표) 띠를 뺀 x60~1020. 정보 정착 구역(x60~960, docs/09-safezone §1)은 전부 안쪽에 든다.
//   2026-09-27 L3 ch01(00013): 카메라가 .82배로 줄어든 구간은 원본 1080 안 가장자리에 남색 띠가 보이고, B 확장이 그 자리를 식탁으로
//   채워 전체 대조가 0.950이 됐다(안쪽 ≥ 0.991). 전체 대조가 기준 아래일 때만 안쪽으로 다시 재서 「가장자리만 다름」을 가린다.
const EDGE = 60;
const innerOf = (L, f) => `${f},crop=iw-${2 * Math.round(EDGE * L.scale)}:ih:${Math.round(EDGE * L.scale)}:0`;
// 좌우 여백 판정(08 §4.3) — B(블리드) 프레임에서 원본 배경이 1080폭뿐이면 좌우가 루트 Navy로 남아
// 경계가 생긴다(00013 실측) → 'edge'. C(기둥)는 가로에서 세로 영상을 붙인 것처럼 보여 쓰지 않는다(2026-09-26 사용자) — override로 배경을 넓힌다.
// 바깥 끝까지 그림이 이어지면 'bleed' — 이어진 배경(00021)이지만 화면 밖 대기 요소(00011 컵)가 드러날 수 있어 눈으로 본다.
function sideState(png, L) {
  const x0 = L.left, x1 = L.left + Math.round(1080 * L.scale), y0 = 300, h = 600;
  const px = (x, w) => {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-i', png, '-vf', `crop=${w}:${h}:${x}:${y0},scale=16:24,format=rgb24`, '-f', 'rawvideo', '-'], {maxBuffer: 1 << 20});
    const b = r.stdout, n = b.length / 3, m = [0, 0, 0];
    for (let i = 0; i < b.length; i += 3) for (let c = 0; c < 3; c++) m[c] += b[i + c] / n;
    let v = 0; for (let i = 0; i < b.length; i += 3) for (let c = 0; c < 3; c++) v += (b[i + c] - m[c]) ** 2 / n / 3;
    return {m, sd: Math.sqrt(v)};
  };
  const bg = [17, 27, 53], dist = (a, c) => Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]);
  const navy = r => dist(r.m, bg) < 8 && r.sd < 6;
  // 캔버스 바깥 끝(좌우 200px)이 루트 Navy면 배경이 끝까지 이어지지 않은 것. 그 안쪽에 무언가 있으면 경계가 보인다.
  // 카메라 확대로 배경이 무대 밖까지 일부 나오는 프레임(00013 f1)도 이 방식으로 잡힌다.
  // 🔴 경계는 무대 가장자리 바로 안쪽(x0+4~44)에서 본다 — 예전에는 무대 바깥(x200~462)을 봐서, 0.9배 무대(x474~1446)에 딱 맞는
  //    1080폭 패널을 놓쳤다(2026-09-27 L2: 00005 파랑·크림 패널 5프레임이 전부 clean으로 나옴)
  const side = (far, mid) => !navy(far) ? 'bleed' : navy(mid) ? 'clean' : 'edge';
  return [side(px(0, 200), px(x0 + 4, 40)), side(px(W - 200, 200), px(x1 - 44, 40))];
}
function verifyStage(dir, only = null) {
  const {b} = readSpec(dir);
  const hf = path.join(dir, 'hyperframes');
  const tl = timeline(b, b.chapters.map(c => c.measured.duration));
  const L = LAYOUT[b.captions];
  const plans = b.chapters.map((ch, i) => {
    const src = source(ch), modes = ch.frames || {};
    const samples = src.slots.filter(s => (modes[s.comp] || 'B') !== 'R').flatMap(s => [s.start + Math.min(.9, s.dur / 3), s.start + s.dur * .6]);
    // 샘플은 0.05초 격자 + 반 프레임(프레임 중간)에서 찍는다 — 경계에서의 반올림 차이를 비교에서 뺀다.
    //   의도한 편차 구간(chapters[].verify_skip_s = [[챕터 초, 챕터 초], …], 이유는 verify_skip_note): 좌우를 넓히며 전환 거리가 원본과 달라진
    //   구간(예: 00012 08 밀기 1080→2400)은 가운데 화소가 같을 수 없어 표본에서 뺀다. 제외한 구간은 아래에서 △로 계속 보인다.
    const skip = ch.verify_skip_s || [], inSkip = x => skip.some(([a, z]) => x >= a && x <= z);
    const all = [...new Set(samples.map(x => Math.round((Math.round(x / .05) * .05 + 1 / 120) * 1000) / 1000))].filter(x => x < src.duration);
    return {src, samples: all.filter(x => !inSkip(x)), skipped: all.filter(inSkip), skip, note: ch.verify_skip_note, T: tl.ch[i], i};
  }).filter(p => !only || p.i + 1 === only);   // --chapter N: 워커가 자기 챕터만 확인
  const posterOn = tl.P > 0 && (!only || only === 1);
  const bundleAt = snapshot(hf, [...(posterOn ? [0, tl.P] : []), ...plans.flatMap(p => p.samples.map(s => p.T.start + s))]);
  const cropO = `crop=${STAGE.w}:${STAGE.h}:${STAGE.x}:${STAGE.y}` + (L.scale !== 1 ? `,scale=${Math.round(STAGE.w * L.scale)}:${Math.round(STAGE.h * L.scale)}:flags=bicubic` : '');
  const threshold = b.verify_ssim ?? (L.scale === 1 ? .999 : .97);
  let worst = 1, bad = 0;
  console.log(`\n  무대 동일성 — 묶음 스냅샷 vs 원본 스냅샷 (SSIM ≥ ${threshold}, 레이아웃 ${b.captions})`);
  for (const p of plans) {
    const i = p.i;
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'hf-bundle-src-'));
    cpSync(p.src.hf, tmp, {recursive: true, filter: s => !s.includes(`${path.sep}snapshots`) && !s.includes('node_modules')});
    const origAt = snapshot(tmp, p.samples);
    const ds = driftSlots(b.chapters[i], p.src, p.T);   // 읽기 멈춤 호흡이 있으면 그 시각의 배율로 무대를 되돌려 비교한다
    const scores = p.samples.map(s => { const a = bundleAt(p.T.start + s), o = origAt(s), cb = stageCrop(L, driftAt(ds, p.T.start + s));
      const v = ssim(a, o, cb, cropO); if (v >= threshold) return {s, v};
      const inner = ssim(a, o, innerOf(L, cb), innerOf(L, cropO)); return {s, v: inner >= threshold ? inner : v, raw: v, edge: inner >= threshold}; });
    rmSync(tmp, {recursive: true, force: true});
    const low = scores.filter(x => !(x.v >= threshold)), edge = scores.filter(x => x.edge);
    worst = Math.min(worst, ...scores.map(x => x.v));
    bad += low.length;
    console.log(`  ch${pad(i + 1)} ${p.src.name.padEnd(34)} ${scores.length}시점 · 최저 ${Math.min(...scores.map(x => x.v)).toFixed(6)}${low.length ? `  🔴 ${low.map(x => `${x.s.toFixed(2)}s=${x.v.toFixed(4)}`).join(' ')}` : '  ✅'}`);
    if (p.skipped.length) console.log(`     △ 의도한 편차 구간 ${p.skip.map(w => w.join('~')).join(' · ')}s(챕터 초)에서 표본 ${p.skipped.length}개 제외${p.note ? ` — ${p.note}` : ''}`);
    if (edge.length) console.log(`     △ 가장자리 60px만 다름(안쪽 x60~1020은 같다) — 원본 가장자리 배경을 넓힌 배경이 채운 자리: ${edge.map(x => `${(p.T.start + x.s).toFixed(2)}s 전체 ${x.raw.toFixed(3)}→안쪽 ${x.v.toFixed(3)}`).join(' · ')}`);
    // 좌우 여백 — 프레임별로 모아 B/C 판정을 제안한다(판정은 사람이 cuts.json bundle.chapters[].frames에 적는다)
    const modes = b.chapters[i].frames || {};
    for (const sl of p.src.slots) {
      const mode = modes[sl.comp] || 'B';
      if (mode === 'R') continue;
      const st = p.samples.filter(x => x >= sl.start && x < sl.start + sl.dur).map(x => sideState(bundleAt(p.T.start + x), L));
      if (!st.length) continue;
      // 양쪽 모두 끝까지 이어지지 않고 경계가 있으면 B 확장 대상. 한쪽이라도 끝까지 이어지면 눈으로 본다.
      const verdict = st.some(([l, r]) => l === 'edge' && r === 'edge') ? 'edge' : st.some(x => x.includes('bleed')) ? 'bleed' : st.some(x => x.includes('edge')) ? 'bleed' : 'clean';
      if (verdict === 'clean') continue;
      const hint = verdict === 'edge' ? '경계 — 배경이 1080폭이라 세로 기둥으로 보인다 → override로 좌우 끝까지 넓힌다(B 확장, 08 §4.3)' : `여백에 그림 — 이어진 배경인지, 화면 밖 대기 요소가 드러났는지 눈으로 (${p.samples.filter(x => x >= sl.start && x < sl.start + sl.dur).map(x => (p.T.start + x).toFixed(2) + 's').join(' ')})`;
      console.log(`     ${sl.comp.padEnd(24)} ${mode}  ${hint}`);
    }
  }
  console.log(bad ? `\n  🔴 원본과 다른 무대 ${bad}시점 — 프레임을 열어 확인` : `\n  ✅ 모든 챕터 무대가 원본과 같다 (최저 SSIM ${worst.toFixed(6)})`);
  if (posterOn) bad += verifyPoster(dir, hf, tl, bundleAt);
  rmSync(path.join(hf, 'snapshots'), {recursive: true, force: true});   // 렌더 봉인에 섞이지 않게 치운다
  return bad === 0;
}
// 0초 포스터(08 §3.1) — ① 자리표시가 아닌가 ② 0초 화면 = output/thumbnail.jpg(같은 그림이어야 클릭한 약속이 확인된다)
//   ③ 주연 그림(#t1) = 챕터 1 첫 화면(poster_s초) — 커진 끝 화면이 챕터 1로 끊김 없이 이어진다. 비교는 960×540으로 줄여 글자 안티에일리어싱 차이를 뺀다
const POSTER_SSIM = {thumb: .95, frame: .98};
function verifyPoster(dir, hf, tl, at) {
  const html = readFileSync(path.join(hf, 'compositions/bundle/poster.html'), 'utf8'), thumb = path.join(dir, 'output/thumbnail.jpg'), half = 'scale=960:540:flags=bicubic';
  console.log(`\n  0초 포스터 — 썸네일과 같은 그림 · 챕터 1로 이어짐`);
  if (html.includes('data-poster="placeholder"')) { console.log('  🔴 자리표시 포스터다 — cards/thumbnail.html을 채우고 thumb check를 통과시킨 뒤 다시 verify (08 §8.1)'); return 1; }
  let n = 0;
  const src = path.join(dir, 'cards/thumbnail.html');
  if (!existsSync(thumb)) { console.log('  🔴 output/thumbnail.jpg 없음 — node pipeline/hf-bundle.mjs <p> thumb check'); n++; }
  else if (statSync(src).mtimeMs > statSync(thumb).mtimeMs) { console.log('  🔴 cards/thumbnail.html이 output/thumbnail.jpg보다 새롭다 — 고친 썸네일을 thumb check로 다시 검사·촬영한다(포스터는 이미 새 HTML이다)'); n++; }
  else {
    const v = ssim(at(0), thumb, half, half);
    console.log(`  0초 ↔ output/thumbnail.jpg  SSIM ${v.toFixed(4)}${v >= POSTER_SSIM.thumb ? '  ✅' : `  🔴 ${POSTER_SSIM.thumb} 미만 — thumbnail.html을 고친 뒤 thumb check를 다시 안 했거나 포스터 변환이 어긋났다`}`);
    if (!(v >= POSTER_SSIM.thumb)) n++;
  }
  const fr = html.match(/<img id="gf" src="([^"]+)"/)?.[1];   // 커지는 층의 챕터 1 프레임
  const v = fr ? ssim(at(tl.P), path.join(hf, fr), half, half) : NaN;
  console.log(`  주연 그림(#t1) ↔ ${tl.P}초(챕터 1 첫 화면)  SSIM ${Number.isFinite(v) ? v.toFixed(4) : '-'}${v >= POSTER_SSIM.frame ? '  ✅' : `  🔴 ${POSTER_SSIM.frame} 미만 — #t1 프레임을 thumb frames ${tl.P} 로 다시 뽑는다(커진 끝 화면이 챕터 1과 달라 튄다)`}`);
  if (!(v >= POSTER_SSIM.frame)) n++;
  return n;
}
function verifyVideo(dir, video) {
  const {b} = readSpec(dir);
  const tl = timeline(b, b.chapters.map(c => c.measured.duration));
  const probe = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate:format=duration', '-of', 'json', video]);
  const j = JSON.parse(probe.stdout || '{}'), st = j.streams?.[0] || {};
  const fps = st.r_frame_rate ? eval(st.r_frame_rate) : 0, dur = Number(j.format?.duration);
  let ok = st.width === W && st.height === H && Math.round(fps) === 60 && Math.abs(dur - tl.total) < .1;
  console.log(`\n  렌더 규격 ${st.width}×${st.height} · ${Math.round(fps)}fps · ${dur.toFixed(2)}초 (계획 ${tl.total.toFixed(2)}) ${ok ? '✅' : '🔴'}`);
  const ls = tl.ch.map(T => loudness(video, T.start, T.dur));
  const spread = Math.max(...ls) - Math.min(...ls);
  console.log(`  챕터별 통합 음량 — 챕터 간 차이 ≤ 2 LU (08 §7.2)`);
  tl.ch.forEach((T, i) => console.log(`  ch${pad(i + 1)} ${mmss(T.start).padStart(5)} ${String(ls[i]).padStart(6)} LUFS (원본 ${b.chapters[i].measured.lufs}, 배율 ${b.chapters[i].gain_db} dB)`));
  if (ls.some(l => l == null) || spread > 2) ok = false;
  console.log(`  차이 ${spread.toFixed(1)} LU ${spread > 2 ? '🔴 — 조용한 원본은 §7.4 보강 대상' : '✅'} · 전체 ${loudness(video)} LUFS`);
  // 원본 숏츠 렌더에서 잰 음량과 묶음 안에서 다시 섞인 음량이 챕터마다 다르다(2026-09-26 L1: 00002 원본 −16.8 → 묶음 −20.9, 배율 −1.8dB 포함).
  //   그래서 첫 렌더 뒤에는 실측으로 배율을 다시 잡는다 — 내리는 방향만(0dB 상한). 올려야 맞는 챕터는 §7.4 보강 대상으로 남는다.
  if (spread > 2) {
    const tgt = b.loudness_target ?? [...ls].sort((x, y) => x - y)[Math.floor((ls.length - 1) / 2)];
    console.log(`  → 배율 제안(기준 ${tgt} LUFS, 0dB 상한): ` + b.chapters.map((c, i) => `ch${pad(i + 1)} ${c.gain_db} → ${Math.max(-12, Math.min(0, Math.round((c.gain_db + tgt - ls[i]) * 10) / 10))} dB`).join(' · '));
  }
  // 최종 기준: 렌더된 MP4의 챕터 무대 = 원본 숏츠 MP4의 무대 (스냅샷 verify는 렌더 전 선별용)
  const L = LAYOUT[b.captions], th = L.scale === 1 ? .98 : .95;
  const cropO = `crop=${STAGE.w}:${STAGE.h}:${STAGE.x}:${STAGE.y}` + (L.scale !== 1 ? `,scale=${Math.round(STAGE.w * L.scale)}:${Math.round(STAGE.h * L.scale)}:flags=bicubic` : '');
  console.log(`  무대 = 원본 숏츠 MP4 (렌더 대조, SSIM ≥ ${th})`);
  for (const [i, T] of tl.ch.entries()) {
    const ch = b.chapters[i], src = source(ch), orig = path.join(src.dir, 'output', ch.render);
    const modes = ch.frames || {};
    const skip = ch.verify_skip_s || [], inSkip = x => skip.some(([a, z]) => x >= a && x <= z);   // 의도한 편차 구간(verifyStage와 같은 필드)
    const all = src.slots.filter(sl => (modes[sl.comp] || 'B') !== 'R').map(sl => Math.round((sl.start + sl.dur / 2) * 60) / 60 + 1 / 120);
    const ts = all.filter(t => !inSkip(t)), skipped = all.filter(inSkip);
    const ds = driftSlots(ch, src, T);
    const vals = ts.map(t => {
      const cropB = stageCrop(L, driftAt(ds, T.start + t));
      const m = (fa, fb) => Number((run('ffmpeg', ['-hide_banner', '-ss', String(T.start + t), '-i', video, '-ss', String(t), '-i', orig, '-frames:v', '1', '-lavfi', `[0:v]${fa}[x];[1:v]${fb}[y];[x][y]ssim`, '-f', 'null', '-']).stderr || '').match(/All:([\d.]+)/)?.[1] ?? NaN);
      const v = m(cropB, cropO); if (v >= th) return {t, v};
      const inner = m(innerOf(L, cropB), innerOf(L, cropO)); return {t, v: inner >= th ? inner : v, raw: v, edge: inner >= th};
    });
    const low = vals.filter(x => !(x.v >= th)), edge = vals.filter(x => x.edge);
    if (low.length) ok = false;
    console.log(`  ch${pad(i + 1)} ${src.name.padEnd(34)} ${vals.length}시점 · 최저 ${Math.min(...vals.map(x => x.v)).toFixed(4)}${low.length ? '  🔴 ' + low.map(x => `${x.t.toFixed(2)}s=${x.v.toFixed(3)}`).join(' ') : '  ✅'}`);
    if (skipped.length) console.log(`     △ 의도한 편차 구간 ${skip.map(w => w.join('~')).join(' · ')}s(챕터 초)에서 표본 ${skipped.length}개(${skipped.map(x => x.toFixed(2) + 's').join(' ')}) 제외${ch.verify_skip_note ? ` — ${ch.verify_skip_note}` : ''}`);
    if (edge.length) console.log(`     △ 가장자리 60px만 다름(안쪽 같음): ${edge.map(x => `${x.t.toFixed(2)}s 전체 ${x.raw.toFixed(3)}→안쪽 ${x.v.toFixed(3)}`).join(' · ')}`);
  }
  return ok;
}

// ── 스냅샷·시트 — 워커·감독·B 분류의 공용 입력 (2026-09-27 L2에서 도구로 옮김) ──────────
function snapShots(dir, out, times) {
  const ts = String(times || '').split(',').filter(x => x.trim()).map(Number).filter(Number.isFinite);
  if (!out || !ts.length) fail('snap <출력 폴더> <시각,시각,…> (묶음 초)');
  return withLock(dir, () => {
    build(dir);
    const hf = path.join(dir, 'hyperframes'), at = snapshot(hf, ts);
    mkdirSync(out, {recursive: true});
    for (const f of readdirSync(out)) if (/^at-.*\.png$/.test(f)) rmSync(path.join(out, f));
    let n = 0;
    for (const t of ts) { const f = at(t); if (f) { copyFileSync(f, path.join(out, `at-${Number(t.toFixed(3))}s.png`)); n++; } else console.log(`  △ ${t}s 스냅샷 없음`); }
    rmSync(path.join(hf, 'snapshots'), {recursive: true, force: true});
    console.log(`✔ ${n}시점 → ${out}/at-<초>s.png (1920×1080)`);
  });
}
// 전 프레임 3시점(시작+0.35·가운데·끝−0.3 — 동작 중간을 포함해야 한다: L1은 카메라 이동 중에 드러난 화면 밖 요소를 놓쳤다) + 전환·완주·정리.
//   챕터마다 3열 시트 한 장. 글자를 그리는 필터가 없어(ffmpeg drawtext 미포함) 칸 설명은 콘솔에 찍는다.
function sheet(dir, outOpt) {
  const {b} = readSpec(dir);
  const tl = timeline(b, b.chapters.map(c => c.measured.duration));
  const out = outOpt || path.join(os.tmpdir(), `hf-bundle-sheet-${path.basename(dir).slice(0, 5)}`);
  const q = t => Math.round(t * 30) / 30;
  const groups = b.chapters.map((ch, i) => {
    const src = source(ch), T = tl.ch[i];
    return {name: `ch${pad(i + 1)}`, rows: src.slots.map(sl => { const a = T.start + sl.start, e = Math.min(a + sl.dur, T.end);
      return {label: sl.comp, ts: [q(a + .35), q((a + e) / 2), q(e - .3)]}; })};
  });
  // 0초 포스터가 있으면 첫 줄 = 포스터(0초 = 썸네일 · 커지기 직전 · 커지는 중), 없으면 챕터 1 라벨
  const P = tl.P, gs = P - Math.min(POSTER.grow, P / 3);
  const extra = [P > 0 ? {label: 'poster', ts: [0, q(gs - .05), q(gs + (P - gs) / 2)]} : {label: 'label', ts: [q(.6), q(1.5), q(3.0)]}];
  tl.ch.slice(0, -1).forEach((T, i) => { const g = T.end + Math.min(.25, T.gap / 4); extra.push({label: `gap-${pad(i + 1)}`, ts: [q(g + .2), q(g + 1.1), q(tl.ch[i + 1].start + .26)]}); });
  extra.push({label: 'finale·end', ts: [q(tl.ch.at(-1).end + .9), q(tl.endStart + .5), q(tl.total - .5)]});
  groups.push({name: 'transitions', rows: extra});
  const all = [...new Set(groups.flatMap(g => g.rows.flatMap(r => r.ts)))].sort((x, y) => x - y);
  return withLock(dir, () => {
    build(dir);
    const hf = path.join(dir, 'hyperframes'), at = snapshot(hf, all);
    mkdirSync(out, {recursive: true});
    for (const g of groups) {
      const tmp = mkdtempSync(path.join(os.tmpdir(), 'hf-bundle-tile-'));
      let k = 0;
      for (const r of g.rows) for (const t of r.ts) { const f = at(t); copyFileSync(f || at(all[0]), path.join(tmp, `c-${String(k++).padStart(3, '0')}.png`)); }
      const file = path.join(out, `sheet-${g.name}.jpg`);
      const r = run('ffmpeg', ['-v', 'error', '-i', path.join(tmp, 'c-%03d.png'), '-vf', `scale=640:360,tile=3x${g.rows.length}:padding=6:color=0x282828`, '-frames:v', '1', '-q:v', '4', '-y', file]);
      rmSync(tmp, {recursive: true, force: true});
      if (r.status !== 0) fail(`시트 합성 실패: ${(r.stderr || '').slice(-300)}`);
      console.log(`\n  ${file}`);
      g.rows.forEach((row, j) => console.log(`   행${String(j + 1).padStart(2)} ${row.label.padEnd(26)} ${row.ts.map(t => t.toFixed(2)).join(' · ')}`));
    }
    rmSync(path.join(hf, 'snapshots'), {recursive: true, force: true});
    console.log(`\n✔ 시트 ${groups.length}장 — 칸마다 좌→우 = 시작·가운데·끝. 세로 기둥·가장자리에 드러난 대기 요소·자막 띠(챕터마다 글자가 있는가)를 본다 (08 §4.3)`);
  });
}

// ── 썸네일(2026-09-28 신설 — 08 §8.1) ──────────────────────────────────────
//   L1·L2 커버를 만들며 겪은 것: 한 장면판은 반려("롱폼인데 조합해서"), 배지가 영상 속 숫자(43 min·+60%·PAID 줄)를 덮음,
//   0.3~0.45배로 줄인 영상 속 글자는 휴대폰에서 안 읽힘, 로고·자막이 타일에 섞임, 펀치라인이 재생시간 배지 자리에 떨어짐.
//   frames = 고른 시각의 조립본 스냅샷을 cards/assets/에 저장. check = cards/thumbnail.html을 찍고 기계로 막을 수 있는 것을 막는다 —
//   읽히는 크기·캔버스 밖·글자 겹침·재생시간 배지 자리·챕터 배지 누락·폰트·참조 파일·타일 비율·규격. 위계(가장 큰 글자가 볼 이유인가)는 경고,
//   훅이 강한지는 사람(감독)이 본다. 2026-10-08부터 이 HTML이 0초 포스터의 원본이다(build → poster.html).
const THUMB = {w: 1280, h: 720, k: 1.5, maxBytes: 2 * 1024 * 1024, badge: {x: 1120, y: 640}, lineMax: 1240, titleMin: 72, hooksMax: 2};
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// 장면 재료 — 렌더 전 조립본 스냅샷(좌우 확장이 끝난 가로 화면 = 납품 렌더와 같은 화면, verify가 SSIM으로 보증한다).
//   0초 포스터가 렌더 안에 들어가므로 납품 MP4를 기다리지 않는다(2026-10-08 — 예전에는 렌더 뒤 MP4에서 골랐다).
//   썸네일 = 0초 포스터는 챕터 1 한 장이라 보통 챕터 1 첫 화면(포스터 길이 초) 하나면 된다 — 포스터가 그 그림을 키워 챕터 1로 들어간다.
//   다른 시각도 받는다(A/B 후보판 재료).
function thumbFrames(dir, times) {
  const {b} = readSpec(dir);
  if (!b.chapters.every(c => c.measured)) fail('먼저 plan');
  const tl = timeline(b, b.chapters.map(c => c.measured.duration)), first = tl.ch[0].start;
  const ts = String(times || '').split(',').filter(x => x.trim()).map(Number).filter(Number.isFinite);
  if (!ts.length) {
    console.log(`\n  thumb frames <초,…> — 묶음 초. 썸네일 = 0초 포스터의 주연 그림(#t1)은 ${first}초(챕터 1 첫 화면)${tl.P ? ' — 0초 포스터가 이 그림을 키워 챕터 1로 들어간다' : ''}. 다른 시각은 A/B 후보판 재료다.`);
    tl.ch.forEach((T, i) => console.log(`   ch${pad(i + 1)} ${(b.chapters[i].stop || b.chapters[i].label || '').padEnd(16)} ${T.start.toFixed(2)}~${T.end.toFixed(2)}초`));
    fail(`시각을 적는다 (예: thumb frames ${first})`);
  }
  const out = path.join(dir, 'cards/assets');
  return withLock(dir, () => {
    build(dir);
    const hf = path.join(dir, 'hyperframes'), at = snapshot(hf, ts);
    mkdirSync(out, {recursive: true});
    for (const t of ts) {
      const f = at(t), name = `frame-${Number(t.toFixed(3))}.jpg`;
      if (!f) { console.log(`  △ ${t}초 스냅샷 없음`); continue; }
      const r = run('ffmpeg', ['-v', 'error', '-i', f, '-q:v', '2', '-y', path.join(out, name)]);
      if (r.status !== 0) fail(`JPEG 변환 실패: ${(r.stderr || '').slice(-300)}`);
      console.log(`  ✔ cards/assets/${name}${Math.abs(t - first) < 1e-3 ? '  ← 주연 그림(#t1)' : ''}`);
    }
    rmSync(path.join(hf, 'snapshots'), {recursive: true, force: true});
    console.log(`\n  타일마다 data-frame="assets/frame-<초>.jpg" data-box="x0,y0,x1,y1"(1920×1080 프레임 px, 타일 비율 — 넓은 칸 2.28·좁은 칸 1.51)를 적는다(08 §8.1 ③)`);
  });
}
function thumbCheck(dir, htmlOpt, alt = false) {
  const {b} = readSpec(dir);
  const def = path.join(dir, 'cards/thumbnail.html'), html = htmlOpt ? path.resolve(htmlOpt) : def, main = html === def;
  if (!existsSync(html)) fail(`${path.relative(ROOT, html)} 없음 — pipeline/templates/thumbnail-long.html을 복사해 채운다(08 §8.1)`);
  if (!existsSync(CHROME)) fail(`Chrome 없음: ${CHROME}`);
  const src = readFileSync(html, 'utf8'), base = path.dirname(html), errs = [], warns = [];
  for (const m of src.matchAll(/url\(\s*['"]?([^'")]+?)['"]?\s*\)|\b(?:src|data-frame)="([^"]+)"/g)) {
    const u = m[1] || m[2];
    if (!/^(data:|https?:|#)/.test(u) && !existsSync(u.startsWith('file://') ? decodeURIComponent(u.slice(7)) : path.resolve(base, u))) errs.push(`참조 파일 없음: ${u}`);
  }
  const todo = [...new Set(src.replace(/<!--[\s\S]*?-->/g, '').match(/TODO-[\w-]*/g) || [])];
  if (todo.length) errs.push(`템플릿 자리표시 ${todo.length}곳이 남았다: ${todo.slice(0, 6).join(' ')}${todo.length > 6 ? ' …' : ''}`);
  // 배치 측정 — 사본(스크래치)에 <base>와 측정 스크립트를 넣어 --dump-dom으로 받는다. 원본 HTML은 건드리지 않는다
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'hf-bundle-thumb-'));
  const probe = path.join(tmp, 'probe.html'), shot = path.join(tmp, 'shot.png');
  const measure = `<script>document.fonts.ready.then(()=>{const o=[],X=document.createElement('canvas').getContext('2d'),w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
while((n=w.nextNode())){const s=n.textContent.trim(),e=n.parentElement;if(!s||/^(SCRIPT|STYLE|PRE)$/.test(e.tagName))continue;const c=getComputedStyle(e);
if(c.display==='none'||c.visibility==='hidden'||+c.opacity===0)continue;const r=document.createRange();r.selectNodeContents(n);
const k=e.closest('[id]'),rs=!!e.closest('.reason');X.font=c.fontStyle+' '+c.fontWeight+' '+c.fontSize+' '+c.fontFamily;
const mt=X.measureText(c.textTransform==='uppercase'?s.toUpperCase():s),up=mt.fontBoundingBoxAscent-mt.actualBoundingBoxAscent,ih=mt.actualBoundingBoxAscent+mt.actualBoundingBoxDescent;
for(const q of r.getClientRects())o.push({t:s,x:q.left,y:q.top+up,w:q.width,h:ih,fs:parseFloat(c.fontSize),ff:c.fontFamily,el:k?'#'+k.id:e.tagName.toLowerCase(),rs});}
const p=document.createElement('pre');p.id='__tc';p.style.display='none';
const tiles=[...document.querySelectorAll('.tile[data-box]')].map(t=>{const r=t.getBoundingClientRect();return{id:t.id,x:r.left,y:r.top,w:r.width,h:r.height,box:t.dataset.box};});
p.textContent=JSON.stringify({loaded:[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family.replace(/["']/g,'')),boxes:o,tiles});document.body.appendChild(p);});</script>`;
  const withBase = /<head[^>]*>/i.test(src) ? src.replace(/<head[^>]*>/i, h => `${h}<base href="file://${base}/">`) : `<base href="file://${base}/">${src}`;
  writeFileSync(probe, /<\/body>/i.test(withBase) ? withBase.replace(/<\/body>/i, `${measure}</body>`) : withBase + measure);
  const chrome = extra => run(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--force-device-scale-factor=${THUMB.k}`,
    `--window-size=${THUMB.w},${THUMB.h}`, '--virtual-time-budget=3000', ...extra], {timeout: 60000});
  const dom = chrome(['--dump-dom', `file://${probe}`]).stdout || '';
  const raw = dom.match(/<pre id="__tc"[^>]*>([\s\S]*?)<\/pre>/)?.[1];
  if (!raw) { rmSync(tmp, {recursive: true, force: true}); fail('배치 측정 실패 — Chrome이 페이지를 읽지 못했다'); }
  const m = JSON.parse(raw.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  // 쓰인 서체가 모두 실렸는가 — 제목 Hahmlet·본문 Inter(@font-face 경로 ../../../resources/fonts/). 안 실리면 대체 서체로 찍힌다
  const unloaded = [...new Set(m.boxes.map(q => q.ff.split(',')[0].replace(/["']/g, '').trim()))].filter(f => !/^(serif|sans-serif|monospace)$/i.test(f) && !m.loaded.includes(f));
  if (unloaded.length) errs.push(`서체가 로드되지 않았다: ${unloaded.join(' · ')} — @font-face 경로(../../../resources/fonts/)`);
  // 타일 비율 = data-box 비율이어야 프레임이 늘어나지 않는다(넓은 칸 2.28·좁은 칸 1.51)
  for (const t of m.tiles) { const [x0, y0, x1, y1] = t.box.split(',').map(Number), a = (x1 - x0) / (y1 - y0), r = t.w / t.h;
    if (!(Math.abs(a / r - 1) <= .02)) errs.push(`#${t.id} data-box 비율 ${Number.isFinite(a) ? a.toFixed(3) : '?'} ≠ 타일 ${r.toFixed(3)} — 상자를 타일 비율로(그림이 늘어난다)`); }
  // 글자 상자는 잉크 높이다 — canvas measureText의 실제 잉크(actualBoundingBox, 대문자 변환 반영)로 잰다. 예전의 줄 상자 비율(20%~97%)은
  //   행간을 좁힌 Hahmlet 제목(0.88)에서 다음 줄과 거짓 겹침을 냈다(2026-10-08 — 카드 검수 card-probe와 같은 방식)
  const seen = new Set(), boxes = m.boxes.filter(q => { const key = `${q.t}|${Math.round(q.x)}|${Math.round(q.y)}`; return seen.has(key) ? false : seen.add(key); });
  const tag = q => `"${q.t.length > 24 ? q.t.slice(0, 23) + '…' : q.t}"`, E = .5;
  for (const q of boxes) {
    if (q.x < -E || q.y < -E || q.x + q.w > THUMB.w + E || q.y + q.h > THUMB.h + E) errs.push(`캔버스 밖: ${tag(q)} (${q.el})`);
    if (q.x + q.w > THUMB.badge.x && q.y + q.h > THUMB.badge.y) errs.push(`재생시간 배지 자리(x>${THUMB.badge.x}·y>${THUMB.badge.y})에 글자: ${tag(q)}`);
    if (q.w > THUMB.lineMax) errs.push(`한 줄이 ${Math.round(q.w)}px — ${THUMB.lineMax} 이하로(문구를 줄인다): ${tag(q)}`);
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], c = boxes[j];
    if (a.el === c.el) continue;   // 한 요소의 여러 줄·조각
    const inside = (p, r) => p.x >= r.x - 1 && p.y >= r.y - 1 && p.x + p.w <= r.x + r.w + 1 && p.y + p.h <= r.y + r.h + 1;
    if ((a.t.includes(c.t) && inside(c, a)) || (c.t.includes(a.t) && inside(a, c))) continue;   // 윤곽 층과 채움 층(같은 글자)
    const ix = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x), iy = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
    if (ix > 2 && iy > 2) errs.push(`글자 겹침: ${tag(a)} ↔ ${tag(c)}`);
  }
  // 글자 덩어리: 같은 요소의 줄·조각과 겹치는 층(윤곽·채움)을 하나로 묶는다. #title(없으면 가장 넓은 덩어리) = 제목, 나머지 36px 이상 = 훅
  const groups = [];
  for (const q of boxes.filter(q => q.fs >= 36)) {
    const hit = groups.filter(g => g.some(p => p.el === q.el || (Math.min(p.x + p.w, q.x + q.w) > Math.max(p.x, q.x) && Math.min(p.y + p.h, q.y + q.h) > Math.max(p.y, q.y))));
    const g = hit.flat().concat(q); hit.forEach(h => groups.splice(groups.indexOf(h), 1)); groups.push(g);
  }
  const span = g => Math.max(...g.map(p => p.x + p.w)) - Math.min(...g.map(p => p.x));
  const title = groups.find(g => g.some(p => p.el === '#title')) || [...groups].sort((x, y) => span(y) - span(x))[0], hooks = groups.filter(g => g !== title);
  const titleFs = title ? Math.max(...title.map(p => p.fs)) : 0;
  if (titleFs < THUMB.titleMin) warns.push(`제목(#title) ${titleFs}px — ${THUMB.titleMin}px 이상(휴대폰 칸에서 읽히는 크기), 넘치면 문구를 줄인다(08 §8.1)`);
  if (hooks.length > THUMB.hooksMax) warns.push(`훅 글자(36px 이상, 제목 제외) ${hooks.length}곳 ${hooks.map(g => tag(g[0])).join(' ')} — ${THUMB.hooksMax}곳 이하(08 §8.1)`);
  // 위계(07 H03 · video SKILL 0.0초 포스터): 가장 큰 글자는 볼 이유다. 볼 이유를 품은 덩어리에 class="reason"을 달고(후킹이 주제 이름을 품으면
  //   Hahmlet 제목 한 덩어리가 곧 볼 이유다), 가장 큰 글자가 그 밖이면 경고한다 — 분류명 제목만 크고 볼 이유가 작은 둘째 줄이던 L1·L3·L4 썸네일
  const top = Math.max(0, ...boxes.map(q => q.fs));
  if (!alt && !boxes.some(q => q.rs)) warns.push('볼 이유를 품은 덩어리(class="reason")가 없다 — 제목이 후킹을 품으면 #title에, 아니면 후킹 줄에 달고 그 줄을 가장 크게(08 §8.1 ②)');
  else if (!alt && !boxes.some(q => q.rs && q.fs === top)) warns.push(`가장 큰 글자(${top}px)가 볼 이유 덩어리(.reason) 밖이다 — 분류명 제목이 이기고 있다(07 H03)`);
  const small = [...new Set(boxes.filter(q => q.fs < 20).map(tag))];
  if (small.length) warns.push(`20px 미만 글자 ${small.join(' ')} — 휴대폰에서 읽히지 않는다(장식이면 그대로)`);
  // 대표 영상 한 장(2026-10-08 사용자: "4개로 분할하지 말고 대표 영상의 포스터 형식으로, 여지라면 3개 더 있다 정도") — 0초 포스터의 조건.
  //   #t1 = 챕터 1로 돌아가는 그림, #more(있으면) = 나머지 챕터 수. A/B 후보(--alt, 예: 옛 네 칸 조합판)는 포스터가 아니므로 보지 않는다
  if (!alt) {
    if (!m.tiles.some(t => t.id === 't1')) errs.push('#t1(주연 그림 — data-frame·data-box)이 없다 — 0초 포스터가 이 그림을 키워 챕터 1로 들어간다(08 §3.1)');
    const more = boxes.filter(q => q.el === '#more').map(q => q.t).join(' '), n = b.chapters.length - 1;
    if (more && !new RegExp(`\\+\\s*${n}\\b`).test(more)) errs.push(`#more가 「+${n} MORE」가 아니다(나머지 챕터 ${n}편) — 지금: "${more}"`);
  }
  chrome([`--screenshot=${shot}`, `file://${html}`]);
  const outJpg = main ? path.join(dir, 'output/thumbnail.jpg') : path.join(dir, 'output', path.basename(html).replace(/\.html$/, '.jpg'));
  const view = path.join(os.tmpdir(), `hf-bundle-thumb-${path.basename(dir).slice(0, 5)}`);
  mkdirSync(view, {recursive: true});
  const py = run('python3', ['-c', `import sys,os
from PIL import Image
im=Image.open(sys.argv[1]).convert('RGB'); print(im.size[0], im.size[1])
full=os.path.join(sys.argv[2],'check-full.jpg'); im.save(full,quality=92); print(os.path.getsize(full))
a=im.resize((360,202),Image.LANCZOS); b=im.resize((168,94),Image.LANCZOS)
c=Image.new('RGB',(560,214),(255,255,255)); c.paste(a,(4,6)); c.paste(b,(380,6)); c.save(os.path.join(sys.argv[2],'check-phone.png'))`, shot, view]);
  if (py.status !== 0) { rmSync(tmp, {recursive: true, force: true}); fail(`촬영·변환 실패: ${(py.stderr || '').slice(-300)}`); }
  const [wh, bytes] = py.stdout.trim().split('\n'), [pw, ph] = wh.split(' ').map(Number);
  if (pw !== THUMB.w * THUMB.k || ph !== THUMB.h * THUMB.k) errs.push(`규격 ${pw}×${ph} — 1920×1080이어야 한다`);
  if (Number(bytes) > THUMB.maxBytes) errs.push(`${(bytes / 1048576).toFixed(2)} MB — 2 MB 이하(YouTube 썸네일 제한)`);
  rmSync(tmp, {recursive: true, force: true});
  console.log(`\n  썸네일 검사 — ${path.relative(ROOT, html)} (글자 ${boxes.length}줄)`);
  for (const q of [...boxes].sort((x, y) => y.fs - x.fs)) console.log(`   ${String(q.fs).padStart(4)}px  ${tag(q).padEnd(28)} x${Math.round(q.x)}–${Math.round(q.x + q.w)} y${Math.round(q.y)}–${Math.round(q.y + q.h)}  ${q.el}`);
  warns.forEach(w => console.log(`  △ ${w}`));
  errs.forEach(e => console.log(`  ✗ ${e}`));
  console.log(`\n  보기: ${path.join(view, 'check-full.jpg')} · 휴대폰 크기 ${path.join(view, 'check-phone.png')}(360×202 · 168×94)`);
  if (errs.length) { console.log(`\n✗ 실패 ${errs.length} — ${path.relative(ROOT, outJpg)}는 쓰지 않았다`); return false; }
  copyFileSync(path.join(view, 'check-full.jpg'), outJpg);
  console.log(`\n✔ ${path.relative(ROOT, outJpg)} (1920×1080 · ${(bytes / 1024).toFixed(0)} KB) — 휴대폰 크기 그림으로 제목·훅이 읽히는지, 배지가 영상 속 숫자·주연을 덮지 않는지 눈으로 본다. 훅의 힘은 검사하지 못한다`);
  return true;
}

// ── 렌더 전 음량 측정(2026-09-27 신설) — 묶음 안에서 다시 섞인 음량은 원본 숏츠 렌더에서 잰 값과 다르다 ──
//   L1(00028): 00002 원본 −16.8 → 묶음 −20.9(배율 −1.8 포함). 그래서 plan의 배율로 굽고, 렌더 뒤 verify --video에서 차이 2.3 LU를
//   보고 두 번째 렌더를 했다. 이 명령은 **납품 렌더가 아니다** — 같은 index.html을 1fps·draft로 스크래치에 구워(오디오 믹스는 fps와 무관,
//   렌더 엔진 그대로) 챕터 음량·트루피크만 잰다. output/·렌더 횟수·봉인에 남기지 않는다. 보강 효과음·배경 곡을 넣은 **뒤에** 잰다.
//   배율 제안(줄이기만): 챕터마다 0dB일 때의 음량 u를 추정하고, 가장 조용한 챕터 +0.5 LU 위로는 내린다(L1 결과 0.6 LU 수준.
//   처음엔 +1.5였으나 L2 측정에서 1.5 LU 계단이 그대로 남아 2026-09-27 좁혔다).
function truePeak(mp4) {
  const out = run('ffmpeg', ['-hide_banner', '-nostats', '-i', mp4, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr || '';
  const m = out.split('Summary:').pop().match(/True peak:\s+Peak:\s+(-?[\d.]+|-inf)/);
  return m ? Number(m[1]) : null;
}
function loudnessProbe(dir, keep, apply) { return withLock(dir, () => { build(dir); return loudnessProbe0(dir, keep, apply); }); }
// 트루피크 높은 지점(0.1초 창, 4배 오버샘플 피크). 렌더 엔진은 AAC 트루피크가 −1 dBFS를 넘으면 **파일 전체**를 줄인다(pitfalls §147).
//   보강으로 넣은 클릭(tick-xloud·select-loud 등 volume 1)이 맨 위에 있으면 낮춘다. 원본 숏츠의 큐는 승인된 균형이라 그대로 둔다.
function peakSpots(mp4, tl, th = -2.5) {
  const r = run('ffmpeg', ['-hide_banner', '-nostats', '-i', mp4, '-vn', '-af', 'aresample=192000,asetnsamples=n=19200:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.Peak_level', '-f', 'null', '-']);
  const txt = r.stderr || '', out = [];
  for (const m of txt.matchAll(/pts_time:([\d.]+)[\s\S]*?Peak_level=(-?[\d.]+|-inf)/g)) { const t = +m[1], v = +m[2]; if (v > th) out.push([t, v]); }
  return out.sort((x, y) => y[1] - x[1]).slice(0, 6).map(([t, v]) => { const i = tl.ch.findIndex(T => t >= T.start && t < T.start + T.dur);
    return `${t.toFixed(1)}s ${v.toFixed(1)} dB${i >= 0 ? ` (ch${pad(i + 1)} ${(t - tl.ch[i].start).toFixed(2)}s)` : ' (전환·정리)'}`; });
}
function loudnessProbe0(dir, keep, apply) {
  const {project, b} = readSpec(dir);
  const hf = path.join(dir, 'hyperframes');
  const tl = timeline(b, b.chapters.map(c => c.measured.duration));
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'hf-bundle-probe-'));
  const out = keep ? path.resolve(keep) : path.join(tmp, 'probe.mp4');
  const {cli} = resolveHyperframes(hf);
  console.log(`  음량 측정 렌더(1fps·draft, 납품 아님) → ${out}`);
  const t0 = Date.now();
  // 1fps 측정 렌더는 영상 클립을 몇 프레임만 뽑아 렌더러의 영상 포착률 검사(95%)가 9/10 같은 반올림으로 거짓 실패한다
  //   (2026-10-09 L13 00032 f2-3d 9/10). 소리만 재는 렌더라 이 검사만 끈다 — 납품 렌더(60fps)는 그대로 검사한다
  const r = run(process.execPath, [cli, 'render', '--fps', '1', '--quality', 'draft', '--quiet', '--output', out], {cwd: hf, maxBuffer: 1 << 28, env: {...process.env, HF_VIDEO_COVERAGE_THRESHOLD: '0', FFMPEG_PROCESS_TIMEOUT_MS: process.env.FFMPEG_PROCESS_TIMEOUT_MS || '1800000'}});   // 오디오 440개 혼합이 고부하에서 기본 300초를 넘었다(L6, hf-render.sh와 같은 값)
  if (r.status !== 0 || !existsSync(out)) { rmSync(tmp, {recursive: true, force: true}); fail(`측정 렌더 실패\n${(r.stderr || r.stdout || '').slice(-800)}`); }
  const ls = tl.ch.map(T => loudness(out, T.start, T.dur));
  const u = ls.map((l, i) => l - b.chapters[i].gain_db);   // 0dB 배율일 때의 음량(믹스는 선형)
  const floor = Math.min(...u) + 0.5;
  const sug = u.map(x => Math.max(-12, Math.min(0, Math.round((floor - x) * 10) / 10)));
  const spread = Math.max(...ls) - Math.min(...ls), all = loudness(out), tp = truePeak(out);
  console.log(`\n  묶음 믹스 실측 (${((Date.now() - t0) / 1000).toFixed(0)}초) — 챕터 간 차이 ≤ 2 LU (08 §7.2)`);
  tl.ch.forEach((T, i) => console.log(`  ch${pad(i + 1)} ${mmss(T.start).padStart(5)} ${String(ls[i]).padStart(6)} LUFS  (원본 ${b.chapters[i].measured.lufs}, 배율 ${b.chapters[i].gain_db} dB → 제안 ${sug[i]} dB)`));
  // 렌더 엔진은 AAC 트루피크가 −1 dBFS를 넘으면 파일 전체를 줄인다(enforceAacTruePeak, 목표 −1.5) — 전체 수준은 이 보정에 따라 최대 약 2 dB 달라지고,
  //   챕터 간 차이는 그대로다(pitfalls §147). 날카로운 클릭의 AAC 피크는 인코딩마다 ±2 dB 흔들린다.
  console.log(`  차이 ${spread.toFixed(1)} LU ${spread > 2 ? '🔴' : '✅'} · 전체 ${all} LUFS · 트루피크 ${tp} dBTP${tp != null && tp > -2.5 ? ' (−1 dBFS 근처 — 렌더 엔진이 파일 전체를 줄이는 보정이 걸릴 수 있다)' : ''}`);
  console.log('  (전체 음량은 렌더 엔진의 AAC 트루피크 보정에 따라 최대 약 2 dB 달라진다 — 챕터 간 차이만 이 값으로 맞추고, 절대 음량은 납품본 verify --video로 잰다)');
  const spots = peakSpots(out, tl);
  if (spots.length) console.log(`  피크 −2.5 dB 초과 지점(보정을 부르는 후보): ${spots.join(' · ')} — 묶음이 넣은 클릭이면 volume을 낮춘다`);
  if (apply) {
    b.chapters.forEach((c, i) => { c.gain_override_db = sug[i]; c.gain_db = sug[i]; });
    writeFileSync(path.join(dir, 'cuts.json'), JSON.stringify(project, null, 2) + '\n');
    console.log(`  ✔ gain_override_db 적용 — build 후 한 번 더 잰다`);
  } else if (spread > 2) console.log(`  → --apply 로 제안 배율을 gain_override_db 에 적고 build 후 다시 잰다`);
  if (!keep) rmSync(tmp, {recursive: true, force: true});
  return spread <= 2;
}

// ── reseal — 봉인 뒤 루트 락업만 바뀐 원본을 변경 전 조립본과 대조해 묶음 지문을 기록한다 (2026-09-27) ──
//   증명: ① 바뀐 파일이 루트 index.html·assets/brand/뿐 ② 묶음 index.html이 그 변경보다 먼저 조립됐다(변경 전 원본으로 만든 줄)
//   ③ 그 조립본의 이 챕터 슬롯·오디오 줄(파일·시각·음량)이 지금 원본에서 계산한 값과 같다 ④ 자막 컴포지션 사본이 같다.
//   하나라도 어긋나면 거부한다 — 원본을 새로 납품한 렌더로 묶는다.
function reseal(dir, which) {
  const {project, b} = readSpec(dir);
  const i = Number(which) - 1, ch = b.chapters[i];
  if (!ch) fail('reseal <챕터 번호>');
  const nn = pad(i + 1), src = source(ch), strict = sealCheck0(src, ch.render);
  if (strict.ok) { ch.measured.digest = bundleDigest(src); writeFileSync(path.join(dir, 'cuts.json'), JSON.stringify(project, null, 2) + '\n'); console.log(`✔ ch${nn} 봉인 일치 — 지문만 기록 ${ch.measured.digest}`); return; }
  if (!strict.hard.every(LOCKUP_ONLY)) fail(`ch${nn}: 바뀐 파일이 루트 락업·브랜드 자산 밖이다(${strict.hard.join(', ')}) — 새로 납품한 렌더로 묶는다`);
  const idx = path.join(dir, 'hyperframes', 'index.html');
  if (!existsSync(idx)) fail('묶음 index.html이 없다 — 변경 전 조립본과 대조할 수 없다');
  const changedAt = Math.min(...strict.hard.map(k => statSync(path.join(src.hf, k)).mtimeMs));
  if (statSync(idx).mtimeMs >= changedAt) fail('묶음 index.html이 원본 변경 뒤에 조립됐다 — 변경 전 조립본과 대조할 수 없다');
  const tl = timeline(b, b.chapters.map(c => c.measured.duration)), T = tl.ch[i], k = 10 ** (ch.gain_db / 20);
  const B = readFileSync(idx, 'utf8');
  const bSlots = [...B.matchAll(new RegExp(`<div id="c${nn}-[^"]*" class="scene clip frame-slot[^>]*>`, 'g'))].map(m => attrs(m[0])).map(a => `${a['data-composition-src'].replace(`ch${nn}/`, '')}@${(+a['data-start'] - T.start).toFixed(3)}`);
  const sSlots = src.slots.map(sl => `${sl.src}@${sl.start.toFixed(3)}`);
  const edits = ch.audio_edit || {};
  const bAud = [...B.matchAll(new RegExp(`<audio id="c${nn}-(?!sfx-add-)[^"]*"[^>]*>`, 'g'))].map(m => attrs(m[0])).map(a => `${a.id.slice(4)}|${a.src.replace(`ch${nn}/`, '')}|${(+a['data-start'] - T.start).toFixed(3)}|${(+a['data-volume']).toFixed(3)}`).sort();
  const sAud = src.audio.filter(a => !edits[a.id]?.mute).map(a => { const e = edits[a.id] || {};
    return `${a.id}|${a.src}|${(+(e.at ?? a['data-start'] ?? 0)).toFixed(3)}|${(Math.round(+(e.volume ?? a['data-volume'] ?? 1) * k * 1e4) / 1e4).toFixed(3)}`; }).sort();
  const bad = [];
  if (JSON.stringify(bSlots) !== JSON.stringify(sSlots)) bad.push(`슬롯 ${bSlots.length}/${sSlots.length}`);
  const onlyB = bAud.filter(x => !sAud.includes(x)), onlyS = sAud.filter(x => !bAud.includes(x));
  if (onlyB.length || onlyS.length) bad.push(`오디오 차이 ${onlyB.length}/${onlyS.length} (${[...onlyB, ...onlyS].slice(0, 3).join(' · ')})`);
  if (src.captions) {
    const old = path.join(dir, 'hyperframes', `ch${nn}`, 'compositions/captions.html');
    const compIds = [...new Set([...src.slots.map(sl => sl.src), 'compositions/captions.html'].map(f => readFileSync(path.join(src.hf, f), 'utf8')).flatMap(t => [...t.matchAll(/data-composition-id=["']([^"']+)["']/g)].map(m => m[1])))];
    const now = rewrite(withRootCaptionCss(readFileSync(path.join(src.hf, 'compositions/captions.html'), 'utf8'), src.index, '', true), nn, compIds);
    if (!existsSync(old) || statSync(old).mtimeMs >= changedAt) bad.push('자막 사본이 변경 전 조립본이 아니다');
    else if (readFileSync(old, 'utf8') !== now && !existsSync(path.join(dir, 'hyperframes', 'override', `ch${nn}`, 'compositions/captions.html'))) bad.push('자막 컴포지션이 다르다');
  }
  if (bad.length) fail(`ch${nn} ${src.name}: 변경 전 조립본과 다르다 — ${bad.join(' · ')}. 새로 납품한 렌더로 묶는다`);
  ch.measured.digest = bundleDigest(src);
  writeFileSync(path.join(dir, 'cuts.json'), JSON.stringify(project, null, 2) + '\n');
  console.log(`✔ ch${nn} ${src.name}: 바뀐 파일 ${strict.hard.join(', ')} — 슬롯 ${sSlots.length}·오디오 ${sAud.length}·자막이 변경 전 조립본과 같다. 묶음 지문 ${ch.measured.digest} 기록`);
}

// ── 소재 목록: 묶을 수 있는 숏츠 전수 (/long 키워드 구성의 입력) ─────────────
// ── 숏츠 공개 조회수(2026-10-08 사용자: "구성할 때 첫번째가 조회수 잘 나오는 걸로 순서를 정하고") ──
//   채널 숏츠 탭을 yt-dlp로 한 번 읽어(공개 조회수, 로그인 없음) 각 편 publish.md의 유튜브 제목(「## youtube」 절 첫 코드 블록 첫 줄)과 맞춘다.
//   여러 번 부르면 봇 확인에 걸린다(2026-10-06 실측) — 6시간 캐시. 못 읽으면 조회수 없이 계속한다.
const VIEWS_CACHE = path.join(os.tmpdir(), 'hf-bundle-views.json');
const normTitle = t => String(t || '').replace(/#[\p{L}\p{N}_]+/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
function channelViews() {
  try { const c = JSON.parse(readFileSync(VIEWS_CACHE, 'utf8')); if (Date.now() - c.at < 6 * 3600e3 && c.rows.length) return c; } catch {}
  const r = run('yt-dlp', ['--flat-playlist', '--print', '%(id)s\t%(view_count)s\t%(title)s', `https://www.youtube.com/${BRAND.handle}/shorts`], {timeout: 180000});
  const rows = (r.stdout || '').split('\n').map(l => l.split('\t')).filter(x => x.length >= 3 && /^\d+$/.test(x[1])).map(([id, v, ...t]) => ({id, views: +v, title: t.join(' ')}));
  if (!rows.length) return {at: 0, rows, error: (r.stderr || r.error?.message || '').split('\n').filter(Boolean).at(-1) || '응답 없음'};
  const c = {at: Date.now(), rows};
  try { writeFileSync(VIEWS_CACHE, JSON.stringify(c)); } catch {}
  return c;
}
function youtubeTitle(dir) {
  const f = path.join(dir, 'publish.md');
  const m = existsSync(f) && readFileSync(f, 'utf8').match(/^## youtube[^\n]*\n[\s\S]*?```[^\n]*\n([^\n]+)/m);
  return m ? m[1].trim() : null;
}
function viewsOf(dir, c) {
  const t = normTitle(youtubeTitle(dir));
  const hit = t && c.rows.find(r => { const u = normTitle(r.title); return u && (u === t || u.startsWith(t) || t.startsWith(u)); });
  return hit ? hit.views : null;
}
function catalog(withLoudness, withHeadlines, withViews) {
  const P = path.join(ROOT, 'projects');
  const used = {};
  for (const d of readdirSync(P).filter(x => /^\d{5}-/.test(x))) {
    const f = path.join(P, d, 'cuts.json'); if (!existsSync(f)) continue;
    const j = JSON.parse(readFileSync(f, 'utf8'));
    for (const c of j.bundle?.chapters || []) if (c.project) (used[String(c.project).slice(0, 5).padStart(5, '0')] ??= []).push(d.slice(0, 5));
  }
  const vc = withViews ? channelViews() : null, ranked = [];
  if (vc && !vc.rows.length) console.log(`\n  △ 조회수를 읽지 못했다(${vc.error}) — 조회수 없이 목록만 낸다. 잠시 뒤 다시 부른다`);
  console.log('\n  묶을 수 있는 숏츠 — 봉인 일치 렌더가 있는 세로 숏츠만 (08 §2)');
  console.log('  번호   길이   렌더           효과음/초 자막효과 ' + (withLoudness ? ' LUFS ' : '') + (vc ? '  조회 ' : '') + ' 묶음   제목 · 훅');
  for (const d of readdirSync(P).filter(x => /^\d{5}-/.test(x)).sort()) {
    const dir = path.join(P, d), hfd = path.join(dir, 'hyperframes');
    if (!existsSync(path.join(hfd, 'index.html')) || !existsSync(path.join(dir, 'cuts.json'))) continue;
    const j = JSON.parse(readFileSync(path.join(dir, 'cuts.json'), 'utf8'));
    if (j.bundle) continue;
    const idx = readFileSync(path.join(hfd, 'index.html'), 'utf8');
    if (!/id="root"[^>]*data-width="1080"[^>]*data-height="1920"/.test(idx)) continue;
    const dur = Number(idx.match(/id="root"[^>]*data-duration="([\d.]+)"/)?.[1]);
    const out = path.join(dir, 'output');
    const renders = existsSync(out) ? readdirSync(out).filter(f => /^render-hf-v.*\.mp4$/.test(f)).sort((a, b) => a.localeCompare(b, undefined, {numeric: true})).reverse() : [];
    const src = {dir, name: d, hf: hfd};
    const ok = renders.find(r => sealCheck(src, r).ok);
    const sfx = [...idx.matchAll(/<audio\b[^>]*>/g)].filter(m => !/-voice"|id="el-bgm"/.test(m[0])).length;
    const capf = path.join(hfd, 'compositions/captions.html');
    const capTw = existsSync(capf) ? (readFileSync(capf, 'utf8').match(/tl\.(to|from|fromTo|set)\(/g) || []).length : 0;
    const lufs = withLoudness && ok ? loudness(path.join(out, ok)) : null;
    const views = vc?.rows.length ? viewsOf(dir, vc) : null;
    const hook = j.cuts?.[0]?.headline || '';
    if (!ok) { console.log(`  ${d.slice(0, 5)}  묶음 불가 — ${renders.length ? '납품 렌더 봉인과 현재 소스가 다르다(작업 중)' : '렌더 없음'}`); continue; }
    const flags = [sfx / dur < .5 ? '효과음↓' : '', capTw ? '' : '자막정적'].filter(Boolean).join(' ');
    const heads = withHeadlines ? '\n         ' + (j.cuts || []).map(c => c.headline).filter(Boolean).join(' · ') : '';
    if (views != null) ranked.push([d.slice(0, 5), views]);
    console.log(`  ${d.slice(0, 5)}  ${dur.toFixed(1).padStart(5)}s  ${ok.padEnd(15)} ${(sfx / dur).toFixed(2).padStart(5)}  ${String(capTw).padStart(5)}  ${withLoudness ? String(lufs ?? '-').padStart(6) + ' ' : ''}${vc ? String(views ?? '-').padStart(6) + ' ' : ''} ${(used[d.slice(0, 5)] || []).join(',').padEnd(6)} ${(j.title && !/^[a-z0-9-]+$/.test(j.title) ? j.title : d.slice(6))} · ${hook}${flags ? `  [${flags} → §7.4]` : ''}${heads}`);
  }
  if (ranked.length) {
    console.log(`\n  공개 조회수 순(${new Date(vc.at).toISOString().slice(0, 16).replace('T', ' ')} UTC 읽음 · 숏츠 탭, 업로드 시기가 달라 대략치): ${ranked.sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n, v]) => `${n} ${v}`).join(' · ')}`);
    console.log('  🔴 챕터 1 = 묶을 편 중 조회수가 가장 높은 편이다 — 0초 포스터가 그 편의 포스터가 된다(08 §2.4·§3.1). cuts.json chapters[].views에 적으면 plan이 순서를 확인한다');
  }
  console.log('\n  길이 계산(노선 전환): 0초 포스터 1.5 + 원본 합 + 전환 약 1.9~2.4×(챕터−1) + 완주·정리 약 11.5 = 3~4분이면 원본 합 약 161~222초 (L2: 원본 210.5 → 3:51, 포스터 전)');
}

// ── CLI ───────────────────────────────────────────────────────────────────
if (process.argv[2] === 'catalog') { catalog(process.argv.includes('--loudness'), process.argv.includes('--headlines'), process.argv.includes('--views')); process.exit(0); }
const [q, cmd, ...rest] = process.argv.slice(2);
const USAGE = 'node pipeline/hf-bundle.mjs <p> plan|build|verify|loudness|snap|sheet|reseal|lines|chapters|thumb frames|thumb check';
if (!q || !cmd) { console.error(`사용: ${USAGE}`); process.exit(2); }
const {dir} = resolveProject(q, {usage: USAGE});
const opt = k => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : null; };
if (cmd === 'plan') plan(dir);
else if (cmd === 'build') build(dir);
else if (cmd === 'chapters') chapters(dir);
else if (cmd === 'lines') lines(dir, rest[0]);
else if (cmd === 'loudness') process.exit(loudnessProbe(dir, opt('--keep'), rest.includes('--apply')) ? 0 : 1);
else if (cmd === 'verify') process.exit((opt('--video') ? verifyVideo(dir, opt('--video')) : withLock(dir, () => { build(dir); return verifyStage(dir, Number(opt('--chapter')) || null); })) ? 0 : 1);
else if (cmd === 'snap') snapShots(dir, rest[0], rest[1]);
else if (cmd === 'sheet') sheet(dir, opt('--out'));
else if (cmd === 'reseal') reseal(dir, rest[0]);
else if (cmd === 'thumb' && rest[0] === 'frames') thumbFrames(dir, rest[1]);
else if (cmd === 'thumb' && rest[0] === 'check') process.exit(thumbCheck(dir, opt('--html'), rest.includes('--alt')) ? 0 : 1);
else if (cmd === 'thumb') fail('thumb frames <초,초,…> | thumb check [--html <파일> [--alt]]');
else fail(`모르는 명령: ${cmd}`);
