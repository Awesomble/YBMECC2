#!/usr/bin/env node
// hf-export.mjs — HyperFrames 렌더에서 **실제로 구운 자막**으로 SRT·타임라인을 만든다.
//
//   node pipeline/hf-export.mjs <프로젝트>
//
// 🔴 `export.mjs` 를 HyperFrames 프로젝트에 돌리지 마라. 그건 레거시 Remotion 경로의
//    `motion/subtitles.tsx` 를 읽는다 (docs/02-pitfalls.md §22). 00006 에서 돌리면
//    30청크 SRT 가 「여기에 자막을」 3청크로 덮인다 — 2026-09-10 에 실제로 그랬다.
//    이 스크립트는 `hyperframes/index.html` + 프레임의 caption 클립에서 되만든다.
//
// ⚠️ 자막 클립의 data-start 는 **프레임 로컬 시각**이다. 절대시각 = 슬롯 start + 클립 start.
//
// 묶음 롱폼(cuts.json orientation:landscape + bundle, hf-bundle 조립)은 챕터 캡션을 챕터 시작만큼 옮겨
// 이어 붙인 SRT(captions:cc 여도 만든다 — CC 업로드용)·챕터 표·설명란 챕터(output/chapters.txt)를 쓴다.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { resolveProject } from './lib/project.mjs';
import {manifest,HASH_VERSION} from './lib/src-hash.mjs';
import {digest,fileHash} from './lib/workflow-state.mjs';

// Decode caption markup once so exported subtitles match the browser's visible text.
function decodeCaptionEntities(text) {
  const named = {amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ',
    ndash:'–', mdash:'—', hellip:'…', lsquo:'‘', rsquo:'’', ldquo:'“', rdquo:'”'};
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, key) => {
    if (!key.startsWith('#')) return named[key] ?? whole;
    const hex = key[1].toLowerCase() === 'x';
    const code = parseInt(key.slice(hex ? 2 : 1), hex ? 16 : 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code) : '\uFFFD';
  });
}

// 유튜브 커버 = 납품 MP4의 0초 한 장(0초 포스터) → output/cover.jpg (2026-10-10 사용자 지시 — 유튜브는 영상에서 원하는
// 프레임을 고를 수 없어 커버 이미지를 올린다). 유튜브 맞춤 썸네일 상한 2MB 안에 들 때까지 화질을 낮춘다. 롱폼도 같다(1920×1080 — 0초 = thumb check 로 맞춘 포스터, 2026-10-10).
function writeCover(vid) {
  const cover = path.join(path.dirname(vid), 'cover.jpg');
  for (const q of [2, 3, 4, 5, 6, 8]) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', vid, '-frames:v', '1', '-q:v', String(q), cover]);
    if (fs.statSync(cover).size < 2 * 1024 * 1024) break;
  }
  console.log(`   커버 cover.jpg ← ${path.basename(vid)} 0초 (${(fs.statSync(cover).size / 1048576).toFixed(2)}MB)`);
}

const capAttr = (tag, key) => tag.match(new RegExp(`\\b${key}\\s*=\\s*(["'])(.*?)\\1`))?.[2];
const capClasses = (tag) => (capAttr(tag, 'class') ?? '').split(/\s+/);
const capSeconds = (tag, key) => {
  const value = capAttr(tag, key);
  return value?.trim() ? Number(value) : NaN;
};
const capMarkup = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');

// 자막 트랙 파일 하나의 cap 클립 → 절대초. 루트 트랙과 묶음 챕터 트랙이 같은 규칙을 쓴다.
function trackCues(hf, src, start, dur, compId) {
  const file = path.join(hf, src);
  if (!fs.existsSync(file)) return [];
  const html = capMarkup(fs.readFileSync(file, 'utf8'));
  if (![...html.matchAll(/<div\b[^>]*>/g)].some((m) => capAttr(m[0], 'data-composition-id') === compId)) return [];
  const out = [];
  for (const clip of html.matchAll(/<div\b[^>]*>/g)) {
    if (!['clip', 'cap'].every((c) => capClasses(clip[0]).includes(c))) continue;
    let st = capSeconds(clip[0], 'data-start'), du = capSeconds(clip[0], 'data-duration');
    // 렌더러는 음수 시작 클립을 0초부터 보여준다 — 버리지 말고 같은 방식으로 잘라 넣는다 (pitfalls §128)
    if (Number.isFinite(st) && st < 0 && Number.isFinite(du)) { du += st; st = 0; }
    if (!Number.isFinite(st) || st < 0 || !Number.isFinite(du) || du <= 0 || st >= dur) continue;
    const bodyStart = clip.index + clip[0].length, bodyEnd = html.indexOf('</div>', bodyStart);
    if (bodyEnd < 0) continue;
    const text = decodeCaptionEntities(html.slice(bodyStart, bodyEnd)
      .replace(/<\/span>\s*<span\b[^>]*\bclass="[^"]*\bcaption-line\b[^"]*"[^>]*>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')   // 줄바꿈은 화면에서 단어 경계다 — 지우면 "blooming<br>before"가 붙는다 (00040)
      .replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (text) out.push({ frame: 'captions', src, start: start + st, end: start + Math.min(st + du, dur), text });
  }
  return out;
}

// 루트 트랙은 파일 존재만으로 활성화되지 않는다. 검사와 export가 같은 마운트·시간 규약을 읽는다.
export function rootCaptionChunks(hf, index) {
  const idxPath = path.join(hf, 'index.html');
  if (index === undefined && !fs.existsSync(idxPath)) return [];
  const idx = capMarkup(index ?? fs.readFileSync(idxPath, 'utf8')).replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, '');
  const out = [];
  for (const mount of idx.matchAll(/<div\b[^>]*>/g)) {
    const tag = mount[0], src = capAttr(tag, 'data-composition-src');
    if (!capClasses(tag).includes('clip') || capAttr(tag, 'data-composition-id') !== 'captions'
        || !src || path.posix.normalize(src) !== 'compositions/captions.html') continue;
    const start = capSeconds(tag, 'data-start'), dur = capSeconds(tag, 'data-duration');
    if (!Number.isFinite(start) || start < 0 || !Number.isFinite(dur) || dur <= 0) continue;
    out.push(...trackCues(hf, src, start, dur, 'captions'));
  }
  return out.sort((a, b) => a.start - b.start);
}

// ── 묶음 롱폼 (hf-bundle · docs/channel/08-longform.md) ──
// 챕터 시작의 정본은 cuts.json dur 누적(hf-bundle plan). 챕터 자막(chNN/compositions/captions.html)은
// 챕터 로컬 시각이라 절대초 = 챕터 시작 + cue 시작이고, 챕터 길이에서 자른다. stage-gate 도 이 함수들을 쓴다.
export const isBundle = (spec) => spec?.orientation === 'landscape' && spec?.bundle?.version === 1;
export function bundleChapters(spec) {
  const at = {};
  let t = 0;
  for (const c of spec.cuts ?? []) { at[c.id] = { start: Math.round(t * 1e6) / 1e6, dur: +c.dur || 0 }; t += +c.dur || 0; }
  return (spec.bundle.chapters ?? []).map((ch, i) => {
    const nn = String(i + 1).padStart(2, '0'), T = at[`ch${nn}`];
    if (!T) throw new Error(`cuts.json 에 ch${nn} 이 없다 — hf-bundle plan 재실행`);
    return { nn, start: T.start, dur: T.dur, source: ch.source ?? ch.project, label: ch.label || ch.source };
  });
}
// 프레임 안에 자막을 구운 챕터(class="clip caption", 자막 트랙 없음 — 00037·00039)는 묶음 index의 그 챕터 프레임 슬롯에서 읽는다
export const bundleFrameCaps = (hf, nn) => {
  const dir = path.join(hf, `ch${nn}`, 'compositions', 'frames');
  return !fs.existsSync(path.join(hf, `ch${nn}`, 'compositions', 'captions.html')) && fs.existsSync(dir)
    && fs.readdirSync(dir).some((f) => f.endsWith('.html') && /class="clip caption"/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
};
export function bundleCaptionChunks(hf, chapters) {
  return chapters.flatMap((c) => {
    if (bundleFrameCaps(hf, c.nn)) {
      const at = (tag, k) => (tag.match(new RegExp(`${k}="([^"]*)"`)) ?? [])[1];
      const idx = fs.readFileSync(path.join(hf, 'index.html'), 'utf8');
      const slots = [...idx.matchAll(/<div[^>]*class="(?=[^"]*\bclip\b)(?=[^"]*\bframe-slot\b)[^"]*"[^>]*>/g)]
        .map((m) => ({ id: at(m[0], 'data-composition-id'), src: at(m[0], 'data-composition-src'), start: +at(m[0], 'data-start'), dur: +at(m[0], 'data-duration') }))
        .filter((s) => s.src?.startsWith(`ch${c.nn}/`));
      return captionChunks(hf, slots).filter((x) => x.start < c.start + c.dur)
        .map((x) => ({ ...x, end: Math.min(x.end, c.start + c.dur), frame: `ch${c.nn}` }));
    }
    return trackCues(hf, `ch${c.nn}/compositions/captions.html`, c.start, c.dur, `c${c.nn}-captions`).map((x) => ({ ...x, frame: `ch${c.nn}` }));
  }).sort((a, b) => a.start - b.start);
}
// hf-bundle chapters 와 같은 형식 — 첫 줄 0:00(미리보기 포함) = 챕터 1
const mmss = (t) => t >= 3600
  ? `${Math.floor(t / 3600)}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`
  : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
export const youtubeChapters = (chapters) => chapters.map((c, i) => `${i ? mmss(c.start) : '0:00'} ${c.label}`).join('\n') + '\n';

// 프레임에 구운 자막 클립을 읽는다. `export.mjs` 의 잠금도 이 함수를 쓴다 —
// 조건을 두 곳에 적으면 갈라진다 (docs/02-pitfalls.md §15).
export function captionChunks(hf, slots) {
  const at = (tag, k) => (tag.match(new RegExp(`${k}="([^"]*)"`)) ?? [])[1];
  if (!slots) {
    const idx = fs.readFileSync(path.join(hf, 'index.html'), 'utf8');
    slots = [...idx.matchAll(/<div[^>]*class="(?=[^"]*\bclip\b)(?=[^"]*\bframe-slot\b)[^"]*"[^>]*>/g)]
      .map((m) => ({ id: at(m[0], 'data-composition-id'), src: at(m[0], 'data-composition-src'), start: +at(m[0], 'data-start'), dur: +at(m[0], 'data-duration') }));
  }
  const out = [];
  for (const s of slots) {
    const f = path.join(hf, s.src);
    if (!fs.existsSync(f)) continue;
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/<div[^>]*class="clip caption"[^>]*>([\s\S]*?)<\/div>/g)) {
      const text = decodeCaptionEntities(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const st = +at(m[0], 'data-start'), du = +at(m[0], 'data-duration');
      out.push({ frame: s.id, src: s.src, start: s.start + st, end: s.start + st + du, text });
    }
  }
  if (out.length) return out.sort((a, b) => a.start - b.start);

  /* ── 규약 A-2: 루트 자막 트랙 `compositions/captions.html` (2026-09-15 · 00017) ──
     프레임을 워커가 raw GSAP 으로 쓰면 자막은 프레임이 아니라 **루트 트랙**이 갖는다
     (docs/14 자막 규약 · `index.html` 의 el-captions). 프레임에는 규약을 만족시키는
     **빈** caption 클립만 남으므로 위 루프가 0청크를 내고 `subtitles.srt` 가 0바이트로 나왔다.
     이 트랙의 시각은 프레임 로컬이 아니라 **절대초**다 — 루트가 0에서 시작하기 때문이다. */
  const rootChunks = rootCaptionChunks(hf);
  if (rootChunks.length) return rootChunks;

  // ── 규약 B: caption_groups.json (00002~00005) ─────────────────────────
  // 프레임에 클립을 굽기 전에는 자막을 이 파일로 관리했다. 시각은 **절대초**다.
  const cg = path.join(hf, 'caption_groups.json');
  if (fs.existsSync(cg)) {
    const j = JSON.parse(fs.readFileSync(cg, 'utf8'));
    for (const g of j.groups ?? []) {
      const text = String(g.text ?? '').replace(/\s+/g, ' ').trim();
      if (text) out.push({ frame: `f${String(g.frame ?? 0).padStart(2, '0')}`, src: null, start: +g.start, end: +g.end, text });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

function writeBundleOutputs({ name, HF, OUT, spec, chapters, chunks, total, ceiling }) {
  const count = (c) => chunks.filter((x) => x.frame === `ch${c.nn}`).length;
  const cap = spec.bundle.captions, yt = youtubeChapters(chapters);
  fs.writeFileSync(path.join(OUT, 'chapters.txt'), yt);
  const stamp = JSON.stringify({ sourceHash: digest(JSON.stringify(manifest(HF))), srtHash: fileHash(path.join(OUT, 'subtitles.srt')) });
  fs.writeFileSync(path.join(OUT, 'timeline.md'), `<!-- ABM export: ${stamp} -->
# ${name} — 묶음 타임라인

가로 1920×1080 · 챕터 ${chapters.length}편 · 자막 ${chunks.length}청크 (캡션 ${cap}) · ${total.toFixed(2)}초
SRT 는 챕터 캡션을 챕터 시작만큼 옮겨 이어 붙였다${cap === 'cc' ? ' — 화면에 굽지 않았으니 YouTube 자막(CC)으로 올린다' : ''}.
이 파일은 \`node pipeline/hf-export.mjs ${name}\` 이 만든다.

| # | 시작 | 끝 | 길이 | 원본 프로젝트 | 라벨 | 자막 |
|---|---|---|---|---|---|---|
${chapters.map((c, i) => `| ${i + 1} | ${mmss(c.start)} (${c.start.toFixed(2)}) | ${(c.start + c.dur).toFixed(2)} | ${c.dur.toFixed(2)} | \`${c.source}\` | ${c.label} | ${count(c)}청크 |`).join('\n')}

## YouTube 설명란 챕터 (output/chapters.txt)

\`\`\`
${yt}\`\`\`
`);
  fs.writeFileSync(path.join(OUT, 'timeline.csv'), '챕터,시작,끝,길이,원본,라벨,자막청크\n' +
    chapters.map((c, i) => `${i + 1},${c.start.toFixed(3)},${(c.start + c.dur).toFixed(3)},${c.dur.toFixed(3)},${c.source},"${String(c.label).replace(/"/g, '""')}",${count(c)}`).join('\n') + '\n');
  console.log(`✅ 묶음 챕터 ${chapters.length} · 자막 ${chunks.length}청크 · ${ceiling.toFixed(2)}초 · 캡션 ${cap}`);
  console.log(`   subtitles.srt · timeline.md · timeline.csv · chapters.txt → projects/${name}/output/`);
  console.log(`   설명란 챕터:\n${yt.trimEnd().split('\n').map((l) => `     ${l}`).join('\n')}`);
  const noCap = chapters.filter((c) => !count(c)).map((c) => `ch${c.nn}`);
  if (noCap.length) console.log(`   ⚠️ 자막 없는 챕터 ${noCap.length}개: ${noCap.join(' ')}`);
  if (chapters.length < 3) console.log('   ⚠️ YouTube 챕터는 3개 이상(각 10초 이상)이어야 표시된다 — docs/channel/08-longform.md §6');
}

// ── CLI ────────────────────────────────────────────────────────────
// 🔴 이 가드가 없으면 `export.mjs` 가 captionChunks 를 import 하는 순간 아래 본문이 통째로 돌아
//    엉뚱한 프로젝트를 해석하고 exit 한다 (2026-09-10 실제로 그랬다).
if (import.meta.url === `file://${process.argv[1]}`) {
  const { dir, name } = resolveProject(process.argv[2], { usage: '사용: node pipeline/hf-export.mjs <프로젝트>' });
  const HF = path.join(dir, 'hyperframes');
  const OUT = path.join(dir, 'output');
  fs.mkdirSync(OUT, { recursive: true });

  const idx = fs.readFileSync(path.join(HF, 'index.html'), 'utf8');
  const attr = (tag, k) => (tag.match(new RegExp(`${k}="([^"]*)"`)) ?? [])[1];

  // ── 슬롯 (프레임) ──
  // 🔴 조립기가 규약을 두 번 바꿨다 — 둘 다 받는다 (2026-09-11 · 00009 에서 SRT 0바이트로 드러남)
  //    구: <div class="clip frame-slot" …>     현행: <div class="scene" data-composition-src=… >
  const SLOT_RE = /<div[^>]*class="[^"]*\b(?:scene|frame-slot)\b[^"]*"[^>]*>/g;
  let slots = [...idx.matchAll(SLOT_RE)]
    .filter((m) => attr(m[0], 'data-composition-src'))
    .map((m) => ({
      id: attr(m[0], 'data-composition-id'),
      src: attr(m[0], 'data-composition-src'),
      start: +attr(m[0], 'data-start'),
      dur: +attr(m[0], 'data-duration'),
    }));
  // 규약 B 프로젝트는 frame-slot 이 없다 — 자막만 내고 컷 표는 cuts.json 으로 만든다
  const flat = !slots.length;

  // ── 자막 클립 ──
  // ⚠️ 이 규약(`class="clip caption"` + 프레임 로컬 data-start)은 00006 부터다.
  //    00002~00005 는 `caption-copy`·`caption-layer` 등 프로젝트마다 다른 이름을 썼고
  //    자막은 `motion/subtitles.tsx` 로 관리됐다 — 그쪽은 `export.mjs` 가 맞다.
  //    그래서 0청크가 나오면 **이 도구가 담당할 프로젝트가 아니다.**
  let spec = null;
  try { spec = JSON.parse(fs.readFileSync(path.join(dir, 'cuts.json'), 'utf8')); } catch {}
  const bundle = isBundle(spec);
  const chapters = bundle ? bundleChapters(spec) : null;
  // 묶음: index.html 이 cuts.json 시간축과 같은 판인가 (라벨·캡션 host 시작 = 챕터 시작)
  if (bundle) for (const c of chapters) for (const id of [`c${c.nn}-label`, `c${c.nn}-el-captions`]) {
    const host = idx.match(new RegExp(`<div\\b[^>]*\\sid="${id}"[^>]*>`))?.[0];
    if (!host) {
      if (id.endsWith('captions') && spec.bundle.captions === 'burn' && !bundleFrameCaps(HF, c.nn)) throw new Error(`ch${c.nn}: burn 인데 캡션 host(${id})가 없다 — hf-bundle build 재실행`);
      continue;
    }
    if (Math.abs(+attr(host, 'data-start') - c.start) > 1e-3) throw new Error(`${id}: index.html 시작 ${attr(host, 'data-start')} ≠ cuts.json 챕터 시작 ${c.start} — hf-bundle build 재실행`);
  }
  const chunks = bundle ? bundleCaptionChunks(HF, chapters) : captionChunks(HF, slots);

  // 🔴 길이의 정본은 **루트 컴포지션의 data-duration** 이다. 슬롯 합으로 잡으면 안 된다 —
  //    00006 은 마지막 슬롯이 42.44 까지 뻗는데 루트는 42.19 이고 렌더도 42.20 이다.
  //    슬롯 합을 쓰면 마지막 자막이 영상보다 0.24초 길게 나간다 (감독 지적 2026-09-10).
  const root = idx.match(/<div[^>]*data-composition-id="main"[^>]*>/)?.[0]
            ?? idx.match(/<div[^>]*id="main"[^>]*>/)?.[0];
  const cgPath = path.join(HF, 'caption_groups.json');
  const total = root ? +attr(root, 'data-duration')
    : slots.length ? Math.max(...slots.map((s) => s.start + s.dur))
    : (fs.existsSync(cgPath) ? +JSON.parse(fs.readFileSync(cgPath, 'utf8')).total_duration_s : 0);
  if (!root) console.log('   ⚠️ 루트 컴포지션을 못 찾아 슬롯 합으로 길이를 잡았다 — 자막 꼬리를 확인하라');
  // 🔴 천장은 **선언값이 아니라 실제 렌더**다. 선언값(루트 data-duration · total_duration_s)은
  //    소스가 렌더보다 앞서 가면 낡는다 — 00005 는 caption_groups 가 53.13 인데 최신 렌더가 49.17 이라
  //    선언값만 믿으면 4초 넘치는 SRT 가 나간다. 영상이 있으면 그걸 천장으로 쓰고 어긋남을 알린다.
  let ceiling = total;
  // 납품 후보 = hf-render 가 봉인한 MP4(.srcman.json 동반) — stage-gate 5 와 같은 규칙. 파일명이 render* 가 아니어도 찾는다
  // (00117 ig-reels-v1.mp4 — 이름 규칙만으로 찾다가 커버를 못 만들었다)
  const vid = fs.existsSync(OUT) && fs.readdirSync(OUT).filter((f) => /\.mp4$/.test(f) && (/^render/.test(f) || fs.existsSync(path.join(OUT, f + '.srcman.json'))))
    .map((f) => path.join(OUT, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (vid) {
    if (!process.argv.includes('--source-only')) {
      const seal=JSON.parse(fs.readFileSync(vid+'.srcman.json','utf8'));
      if(seal.hashVersion!==HASH_VERSION || seal.mode!=='pre-render' || seal.video!==path.basename(vid) || JSON.stringify(seal.files)!==JSON.stringify(manifest(HF))) {
        throw new Error('기존 MP4와 현재 소스가 다른 판이다. 소스 기준 준비용 산출은 --source-only; 실제 납품은 같은 판 MP4로 검사한다');
      }
      const d = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', vid]).toString().trim();
      if (!(d > 0) || Math.abs(d-total)>0.1) throw new Error(`소스/영상 길이 불일치: ${total} / ${d}초`);
        ceiling = Math.min(ceiling || d, d);
      writeCover(vid);
    } else console.log('   준비용: 기존 MP4 길이를 사용하지 않고 현재 소스에서 내보낸다');
  }
  for (const c of chunks) if (c.end > ceiling) c.end = ceiling;
  chunks.splice(0, chunks.length, ...chunks.filter((c) => c.end > c.start + 1e-3));

  const ts = (t) => {
    const ms=Math.round(t*1000);t=Math.floor(ms/1000);
    const h = String(Math.floor(t / 3600)).padStart(2, '0');
    const m = String(Math.floor(t / 60) % 60).padStart(2, '0');
    const s = String(Math.floor(t) % 60).padStart(2, '0');
    return `${h}:${m}:${s},${String(ms % 1000).padStart(3, '0')}`;
  };
  fs.writeFileSync(path.join(OUT, 'subtitles.srt'),
    chunks.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n'));

  // 묶음은 컷 표 대신 챕터 표·설명란 챕터를 쓴다. 아래 세로 타임라인은 건드리지 않는다.
  if (bundle) { writeBundleOutputs({ name, HF, OUT, spec, chapters, chunks, total, ceiling }); process.exit(0); }

  // ── 타임라인 ──
  const cuts = JSON.parse(fs.readFileSync(path.join(dir, 'cuts.json'), 'utf8')).cuts ?? [];
  const head = `# ${name} — 타임라인

  🔴 **\`export.mjs\` 를 이 프로젝트에 돌리지 마라.** 레거시 Remotion 경로의 \`motion/subtitles.tsx\` 를
  읽어 이 파일과 \`subtitles.srt\` 를 3청크 자리표시자로 덮는다 (docs/02-pitfalls.md §22).
  이 파일은 \`node pipeline/hf-export.mjs ${name}\` 이 HyperFrames 소스에서 만든다.

  컷 ${slots.length}개 · 자막 ${chunks.length}청크 · ${total.toFixed(2)}초

  | # | 프레임 | 컷 | 시작 | 끝 | 길이 | 자막 | 헤드라인 |
  |---|---|---|---|---|---|---|---|
  `;
  if (flat) {                                   // 규약 B — 컷 표를 cuts.json 에서 만든다
    let t = 0;
    slots = cuts.map((c, i) => { const st = t; t += c.dur || 0; return { id: `f${String(i + 1).padStart(2, '0')}`, src: null, start: st, dur: c.dur || 0 }; });
  }
  const inSlot = (c, s) => c.frame === 'captions'
    ? c.start >= s.start - 1e-6 && c.start < s.start + s.dur - 1e-6
    : flat ? c.start < s.start + s.dur - 1e-6 && c.end > s.start + 1e-6
      : c.frame === s.id;
  const rows = slots.map((s, i) => {
    const cut = cuts[i] ?? {};
    const caps = chunks.filter((c) => inSlot(c, s)).map((c) => c.text).join(' / ');
    return `| ${i + 1} | \`${s.id}\` | \`${cut.id ?? ''}\` | ${s.start.toFixed(2)} | ${(s.start + s.dur).toFixed(2)} | ${s.dur.toFixed(2)} | ${caps} | ${cut.headline ?? ''} |`;
  }).join('\n');
  const says = cuts.filter((c) => c.say).map((c) => `**${c.id}** ${c.say}`).join('\n\n');
  const exportStamp=JSON.stringify({sourceHash:digest(JSON.stringify(manifest(HF))),srtHash:fileHash(path.join(OUT,'subtitles.srt'))});
  fs.writeFileSync(path.join(OUT, 'timeline.md'), `<!-- ABM export: ${exportStamp} -->\n${head}${rows}\n\n## 나레이션 전문\n\n${says}\n`);
  fs.writeFileSync(path.join(OUT, 'timeline.csv'),
    '순번,프레임,컷,시작,끝,길이,자막\n' +
    slots.map((s, i) => {
      const caps = chunks.filter((c) => inSlot(c, s)).map((c) => c.text).join(' / ');
      return `${i + 1},${s.id},${cuts[i]?.id ?? ''},${s.start.toFixed(3)},${(s.start + s.dur).toFixed(3)},${s.dur.toFixed(3)},"${caps.replace(/"/g, '""')}"`;
    }).join('\n') + '\n');

  const noCap = slots.filter((s) => !chunks.some((c) => inSlot(c, s))).map((s) => s.id);
  console.log(`✅ 컷 ${slots.length} · 자막 ${chunks.length}청크 · ${ceiling.toFixed(2)}초`);
  console.log(`   subtitles.srt · timeline.md · timeline.csv → projects/${name}/output/`);
  if (noCap.length) console.log(`   ⚠️ 자막 없는 프레임 ${noCap.length}개: ${noCap.join(' ')}`);
}
