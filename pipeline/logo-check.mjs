#!/usr/bin/env node
// ① 분석 — **화면 자산 규격 검사기**. 로고·아이콘을 화면에 올리기 전에 통과 여부를 재서 낸다.
// 사용: node pipeline/logo-check.mjs [프로젝트]
//   인자 없음 → resources/brand · logos · icons 라이브러리 전체
//   프로젝트   → 그 프로젝트의 projects/<p>/assets/scene/ 까지 함께
//
// 두 가지가 실제로 사고를 냈다 (docs/12-brand.md · resources/logos/README.md):
//   · 알파 없음(rgb24) → 딥그린 배경 위에 **흰 사각형**이 그대로 뜬다
//   · 1000px 미만 → 1080 폭 화면에서 확대 여유가 없다 (CLAUDE.md '자산을 넣을 때')
// 눈으로는 둘 다 안 보인다. 재야 보인다.
//
// SVG(아이콘)는 잣대가 다르다 — 래스터 검사(알파·픽셀수)가 의미가 없다. 대신 세 가지를 본다:
//   · viewBox 없음        → 크기를 바꿀 수 없다. 화면 배치가 불가능해진다
//   · 래스터 임베드        → `<image href="data:image/png…">`. **벡터인 척하는 비트맵**이라 확대하면 깨진다
//   · 색이 하드코딩        → 우리 팔레트(딥그린 위 크림)로 칠할 수 없다. `currentColor` 나 단색이어야 한다
import { readdirSync, existsSync, statSync, readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {assetFiles, validateAssets} from './lib/asset-state.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MIN_PX = 1000;   // 1080 × 1.15(완만한 줌) ≈ 1250 이 이상적. 1000 을 하한으로 둔다
const EXT = /\.(png|jpe?g|webp|gif|avif)$/i;
const SVG = /\.svg$/i;

const probe = (f) => {
  const o = execFileSync('ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,pix_fmt', '-of', 'csv=p=0', f],
    { encoding: 'utf8' }).trim().split(',');
  return { w: +o[0], h: +o[1], fmt: o[2] };
};

/** 좌상단 1픽셀 색 — 알파가 없을 때 "배경이 뭐냐"를 말해 준다 */
const corner = (f) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-vf', 'crop=1:1:0:0', '-frames:v', '1',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 16 });
  const b = r.stdout;
  return b && b.length >= 3 ? [b[0], b[1], b[2]] : null;
};

/** 투명 화소 비율 — 알파 채널만 있고 배경이 안 뚫린 파일을 거른다.
    🔴 옛 판은 좌상단 1픽셀만 봤다 → **모서리만 둥근 사각 사진**(bbq 황올, 검정 스튜디오 배경)이 통과했다 (2026-09-15).
    64×64 로 줄여 알파 평면을 세면 3ms 다. */
const transparentRatio = (f) => {
  /* 🔴 **줄이지 마라.** `scale=64:64` 로 재면 알파 가장자리가 평균돼 완전투명 화소가 줄어든다 —
     실측(2026-09-15): costco 19%→14% · whopper 28%→13%. 그 편차가 임계 위아래를 갈라 **로고가 줄줄이 불합격**했다. */
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-vf', 'format=rgba,extractplanes=a', '-frames:v', '1',
    '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 26 });
  const b = r.stdout; if (!b || !b.length) return 0;
  let n = 0; for (const v of b) if (v < 16) n++;
  return n / b.length;
};
/* 가르려는 것은 「배경이 통째로 든 사진」 하나다. 실측: bbq 황올 **0.4%** ↔ 가장 빽빽한 로고(버거킹) 15% · 코스트코 19% · 워드마크 28% · 요거트컵 34%.
   3% 면 그 하나만 잡고 로고는 전부 통과한다. 15% 로 뒀더니 로고 4개가 오탐이었다 (2026-09-15 자기발견). */
const CUTOUT_MIN = 0.03;

/** SVG 검사 — 래스터와 잣대가 다르다 (viewBox · 래스터 임베드 · 색 하드코딩)
 *  🔴 색 잣대는 **아이콘에만** 건다 (2026-09-15). `resources/icons/` 는 우리 팔레트로 칠하는 픽토그램이라
 *  색이 박히면 안 되지만, `resources/logos/` 의 브랜드 CI 는 **원본 색 그대로가 규칙**이다
 *  (resources/logos/README.md 「원본 그대로 · 변형 합성 금지」). 둘에 같은 잣대를 대면
 *  한국관광공사 CI(5색)처럼 **정상인 원본이 불합격**한다 — docs/02-pitfalls.md */
function checkSvg(p, isIcon) {
  const t = readFileSync(p, 'utf8');
  const bad = [];
  const vb = t.match(/viewBox\s*=\s*["']([^"']+)["']/i);
  if (!vb) bad.push('viewBox 없음 — 크기를 바꿀 수 없다');
  if (/<image[^>]+(href|xlink:href)\s*=\s*["']data:image\//i.test(t)) bad.push('래스터 임베드 — 벡터인 척하는 비트맵이다');
  if (/<(script|foreignObject)\b/i.test(t)) bad.push('script/foreignObject 포함 — 렌더러마다 다르게 나온다');
  // 색: currentColor 도 없고 fill/stroke 색이 두 종류 넘게 박혀 있으면 팔레트 적용이 어렵다
  const hasCurrent = /currentColor/i.test(t);
  const colors = new Set([...t.matchAll(/(?:fill|stroke)\s*=\s*["'](#[0-9a-f]{3,8}|rgb[^"']*)["']/gi)].map((m) => m[1].toLowerCase()));
  colors.delete('none');
  if (isIcon && !hasCurrent && colors.size > 2) bad.push(`색 ${colors.size}종 하드코딩 — 우리 팔레트로 칠하기 어렵다`);
  const size = vb ? vb[1].trim().split(/[\s,]+/).slice(2).join('×') : '—';
  const tint = !isIcon && colors.size ? ` 원본색 ${colors.size}종` : '';
  return { spec: `SVG ${size}${hasCurrent ? ' currentColor' : ''}${tint}`, bad };
}

const rows = [];
// ABMEN: approved, hash-checked assets use their declared maximum display size.
// Unplanned library assets retain the existing 1000px default.
const plannedSizes = new Map();
const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (arg) {
  const {resolveProject} = await import('./lib/project.mjs');
  const {dir} = resolveProject(arg);
  const file = path.join(dir, 'cuts.json');
  if (existsSync(file)) {
    const project = JSON.parse(readFileSync(file, 'utf8'));
    const validation = validateAssets(dir, project);
    if (validation.errors.length) {
      console.error('❌ 에셋 계획: ' + validation.errors.join(' · '));
      process.exit(1);
    }
    for (const asset of project.assets || []) {
      if (asset.status !== 'approved') continue;
      for (const file of Object.values(assetFiles(dir, asset))) plannedSizes.set(path.resolve(file), asset);
    }
  }
}
function scan(dir, label, minPx = MIN_PX) {
  if (!existsSync(dir)) return;
  const files = readdirSync(dir).filter((f) => (EXT.test(f) || SVG.test(f)) && statSync(path.join(dir, f)).isFile()).sort();
  if (!files.length) { rows.push({ label, name: '(비어 있음)', note: '—', ok: null }); return; }
  for (const f of files) {
    const p = path.join(dir, f);
    if (SVG.test(f)) {
      let r; try { r = checkSvg(p, /\/icons$/.test(label)); } catch (e) { r = { spec: '읽기 실패', bad: [String(e.message || e)] }; }
      rows.push({ label, name: f, spec: r.spec, note: r.bad.join(' · ') || '통과', ok: !r.bad.length });
      continue;
    }
    let s;
    try { s = probe(p); } catch { rows.push({ label, name: f, spec: '읽기 실패', note: '이미지가 아니다', ok: false }); continue; }
    // ⚠️ /a|pal8/ 로 재면 'gray' 가 통과한다 (이름에 a 가 들어서) — 2026-09-08 재현.
    //    포맷 이름을 정확히 보고, 알파가 있어도 **실제로 투명한 픽셀이 있는지**까지 확인한다.
    const alpha = /(^|[^a-z])(rgba|bgra|argb|abgr|ya|ya8|ya16|yuva\w*|pal8)([^a-z]|$)/.test(s.fmt)
      || /a$/.test(s.fmt.replace(/\d+(le|be)?$/, ''));
    const plan = plannedSizes.get(path.resolve(p));
    const big = plan ? s.w >= plan.min_width && s.h >= plan.min_height : Math.max(s.w, s.h) >= minPx;
    const bad = [];
    if (alpha) { const tr = transparentRatio(p); if (tr < CUTOUT_MIN) bad.push(`알파는 있으나 투명 화소 ${Math.round(tr * 100)}% — 배경이 통째로 든 사진 — 크림 무대 위에 사각형이 그대로 뜬다. 컷아웃으로 바꿔라`); }
    if (!alpha) {
      const c = corner(p);
      const white = c && c[0] > 245 && c[1] > 245 && c[2] > 245;
      bad.push(`알파 없음(${s.fmt})${white ? ' · 모서리 흰색 → 그린 위 흰 사각형' : c ? ` · 모서리 rgb(${c})` : ''}`);
    }
    if (!big) bad.push(plan ? `${s.w}×${s.h} < 표시 요구 ${plan.min_width}×${plan.min_height}` : `${Math.max(s.w, s.h)}px < ${minPx}px`);
    rows.push({ label, name: f, spec: `${s.w}×${s.h} ${s.fmt}`, note: bad.join(' · ') || '통과', ok: !bad.length });
  }
}

// 채널 로고는 좌상단 높이 brand.json logo.height(112px) 표시다 — 1000px 잣대가 아니라 표시 높이의 2배(완만한 줌·레티나)면 충분 (2026-10-21 ABMEN 감사에서 이식 — 그쪽 로고가 1000px 잣대에 늘 불합격으로 나왔다)
const LOGO_H = JSON.parse(readFileSync(path.join(ROOT, 'pipeline/templates/brand.json'), 'utf8')).logo?.height ?? 112;
scan(path.join(ROOT, 'resources', 'brand'), 'resources/brand', LOGO_H * 2);
scan(path.join(ROOT, 'resources', 'logos'), 'resources/logos');
scan(path.join(ROOT, 'resources', 'icons'), 'resources/icons');
let projName = null;
if (arg) {
  const { resolveProject } = await import('./lib/project.mjs');
  const { dir, name } = resolveProject(arg, { usage: '사용: node pipeline/logo-check.mjs [프로젝트]' });
  projName = name;
  scan(path.join(dir, 'assets', 'scene'), `projects/${name}/assets/scene`);
  // 🔴 실제로 화면에 올라가는 건 hyperframes/assets/product 다 — scene 만 보면 검사가 헛돈다 (2026-09-15)
  scan(path.join(dir, 'hyperframes', 'assets', 'product'), `projects/${name}/hyperframes/assets/product`);
}

const W = (k, min) => Math.max(min, ...rows.map((r) => [...String(r[k] ?? '')].length));
const pad = (s, n) => String(s ?? '') + ' '.repeat(Math.max(0, n - [...String(s ?? '')].length));
const [w0, w1, w2] = [W('label', 6), W('name', 6), W('spec', 6)];
console.log(`\n  화면 자산 규격 — 래스터: 투명 배경(알파) + 최장변 ${MIN_PX}px 이상 · SVG: viewBox + 벡터 + 팔레트 적용 가능\n`);
let last = null, fail = 0;
for (const r of rows) {
  if (r.label !== last) { console.log(`  ${r.label}/`); last = r.label; }
  if (r.ok === null) { console.log(`    ${r.name}`); continue; }
  if (!r.ok) fail++;
  console.log(`    ${r.ok ? '✅' : '❌'} ${pad(r.name, w1)} ${pad(r.spec, w2)}  ${r.note}`);
}
console.log(`\n  ${fail ? '❌' : '✅'} 불합격 ${fail} · 합격 ${rows.filter((r) => r.ok).length}`);
if (fail) {
  console.log(`  → 통과 못 한 파일은 **화면에 올리지 마라.** 공식 브랜드 리소스·보도자료에서 투명 PNG 를 다시 받고,`);
  console.log(`     받은 URL·날짜를 resources/logos/SOURCES.md 에 남긴다. 못 구하면 멈추고 사용자에게 요청한다`);
  console.log(`     (.claude/skills/video/stages/1-analyst.md 6번 · resources/logos/README.md).`);
  console.log(`  ⚠️ 배경을 키잉해 알파를 만들지 마라 — 남의 상표를 손대는 것이다. 원본을 다시 받는 게 맞다.`);
}
/* ── 회수 검사 — 프로젝트에서 구한 로고가 라이브러리로 올라왔나 (2026-09-16 사용자 지시) ──────
   실측(2026-09-16): 프로젝트에만 남아 있던 **규격 통과 로고 3종**이 있었다 —
   bbq-logo.png(1400×620 rgba) · pb-wordmark.png(2000×144 rgba) · apple.png(843×1000 rgba).
   라이브러리엔 SVG 만 있어서 래스터가 필요한 다음 영상은 **또 구해야 한다.**
   🔴 회수 대상은 **규격을 통과한 것만**이다 — traders(668×259 rgb24)·yogurtworld(637×288 rgb24) 처럼
   불합격인 프로젝트 판본을 올리면 라이브러리가 더러워진다. */
if (!arg) {
  const { execFileSync: _x } = await import('node:child_process');
  const md5 = (f) => _x('md5', ['-q', f], { encoding: 'utf8' }).trim();
  const libHash = new Set();
  for (const d of ['resources/logos', 'resources/brand', 'resources/images']) {   // 사진은 images/ 로 회수하라고 안내한다 — 여기서도 세야 한다 (2026-09-25 · 00020)
    const abs = path.join(ROOT, d);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs)) {
      const fp = path.join(abs, f);
      if (statSync(fp).isFile() && (EXT.test(f) || SVG.test(f))) libHash.add(md5(fp));
    }
  }
  const walk = (d) => !existsSync(d) ? [] : readdirSync(d, { withFileTypes: true })
    .flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const pend = [], seen = new Set();   // 같은 파일이 assets/scene 과 hyperframes/assets 에 둘 다 있다 — 해시로 한 번만
  const projRoot = path.join(ROOT, 'projects');
  for (const proj of (existsSync(projRoot) ? readdirSync(projRoot) : []).filter((d) => /^\d{5}/.test(d))) {
    for (const f of [...walk(path.join(projRoot, proj, 'assets/scene')),
                     ...walk(path.join(projRoot, proj, 'hyperframes/assets'))]) {
      if (!EXT.test(f) && !SVG.test(f)) continue;
      if (/\/(icons|fonts|vendor|bgm|audio)\//.test(f)) continue;
      if (libHash.has(md5(f))) continue;
      /* 🔴 probe 는 {w,h,fmt} 를 낸다 — {width,height,pix_fmt} 로 읽었다가 NaN 이 돼
         「회수할 자산 없음」이라는 **거짓 통과**가 나왔다 (2026-09-16 자기발견). 필드 이름을 확인하고 써라. */
      const r = SVG.test(f) ? checkSvg(f, false) : (() => {
        let d; try { d = probe(f); } catch { return { ok: false }; }
        if (!d || !d.w) return { ok: false };
        return { ok: /a$|rgba|pal8|ya8/.test(d.fmt) && transparentRatio(f) >= CUTOUT_MIN && Math.max(d.w, d.h) >= MIN_PX };
      })();
      if (r.ok) { const h = md5(f); if (!seen.has(h)) { seen.add(h); pend.push([proj, path.relative(projRoot, f)]); } }
    }
  }
  if (pend.length) {
    console.log(`  📦 라이브러리에 없는 **규격 통과** 프로젝트 자산 ${pend.length}개 — 회수하면 다음 영상이 다시 안 구한다`);
    for (const [proj, rel] of pend) console.log(`     ${rel}`);
    console.log(`     → 로고·CI 는 resources/logos/<슬러그>.png · 제품 사진은 resources/images/ 로 올리고 SOURCES.md 에 한 줄`);
    console.log(`     🔴 **출처를 적을 수 있는 것만 회수한다.** 내가 배경을 키운 파일(golden-olive-cut 류)은 올리지 마라 — 원본이 아니다\n`);
  } else console.log('  📦 회수할 자산 없음 — 프로젝트 자산이 전부 라이브러리에 있거나 규격 미달이다\n');
}

if (arg && !rows.some((r) => r.label.startsWith('projects/')))
  console.log(`  ℹ️ projects/${projName}/assets/scene/ 이 없다 — 이 영상엔 브랜드 자산이 안 들어간다`);
console.log('');
process.exit(fail ? 1 : 0);
