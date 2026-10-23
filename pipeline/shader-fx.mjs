#!/usr/bin/env node
// shader-fx.mjs — 셰이더 효과(shaders.com, MIT · WebGPU)를 HyperFrames 프레임에 쓰는 통로 (2026-10-08 도입).
// 정본 docs/14-hyperframes.md §16 · 함정 docs/02-pitfalls.md §181.
//
//   node pipeline/shader-fx.mjs list [--category <분류>] [--json]   번들에 든 효과 — 종류·움직임·prop
//   node pipeline/shader-fx.mjs <p> install                         assets/vendor 복사 + <head> 두 줄 + 루트 data-requires-webgpu
//   node pipeline/shader-fx.mjs <p> check                           설치·사용 검사 (stage-gate ④ 가 같은 판정을 부른다)
//   node pipeline/shader-fx.mjs <p> remove                          쓰는 프레임이 없을 때 설치를 걷는다
//   node pipeline/shader-fx.mjs shot <html> [--at 0,0.5] [-o <png>] [--hf <hyperframes/>]  WebGPU 로 정적 HTML(포스터 안)을 찍는다
//   node pipeline/shader-fx.mjs selftest [--only A,B] [--full]        번들 효과의 시간 결정성 회귀 시험 (--full: 1080×1920 · --variant: 꺼진 기능을 켠 변형)
//   node pipeline/shader-fx.mjs build                               (관리) 고정 버전에서 번들 재생성 → selftest → manifest
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveProject } from './lib/project.mjs';
import { TPL, MANIFEST, EXCLUDE, ROOT, readManifest, sha256, checkShaders, installShaders, removeShaders } from './lib/shaders.mjs';
import { openGpuPage, seekPage } from './lib/gpu-page.mjs';

const PIN = { shaders: '4.0.2', typegpu: '0.12.3', esbuild: '0.24.2' };
const argv = process.argv.slice(2);
const flag = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const CMDS = ['list', 'shot', 'selftest', 'build'];
const usage = () => { console.error(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 12).join('\n')); process.exit(argv.length && argv[0] !== 'help' && !argv[0].startsWith('-') ? 1 : 0); };
if (!argv.length || ['-h', '--help', 'help'].includes(argv[0])) usage();

if (CMDS.includes(argv[0])) await ({ list, shot, selftest: selftestCmd, build })[argv[0]]();
else {
  const { dir } = resolveProject(argv[0], { usage: 'node pipeline/shader-fx.mjs <p> install|check|remove' });
  const hf = path.join(dir, 'hyperframes');
  if (!fs.existsSync(path.join(hf, 'index.html'))) { console.error(`✗ ${hf}/index.html 이 없다`); process.exit(2); }
  const sub = argv[1];
  if (sub === 'install') {
    const done = installShaders(hf);
    console.log(done.length ? `  ✅ 설치 — ${done.join(' · ')}` : '  ✅ 이미 설치돼 있다');
    console.log('     프레임에서: ABMShaders.mount(\'#<canvas id>\', { layers:[…], at:(t)=>({…}) }) — docs/14-hyperframes.md §16');
  } else if (sub === 'remove') {
    try { const done = removeShaders(hf); console.log(done.length ? `  ✅ 걷었다 — ${done.join(' · ')}` : '  ✅ 설치돼 있지 않다'); }
    catch (e) { console.error(`  ✗ ${e.message}`); process.exit(1); }
  } else if (sub === 'check') {
    const r = checkShaders(hf);
    for (const m of r.oks) console.log(`  ✅ ${m}`);
    for (const m of r.warns) console.log(`  ⚠️  ${m}`);
    for (const m of r.errors) console.log(`  🔴 ${m}`);
    if (!r.used && !r.warns.length) console.log('  — 셰이더를 쓰는 프레임이 없다');
    process.exit(r.errors.length ? 1 : 0);
  } else usage();
}

// ── list ───────────────────────────────────────────────────────────────
function list() {
  const man = readManifest();
  if (!man) { console.error('✗ manifest 가 없다 — node pipeline/shader-fx.mjs build'); process.exit(2); }
  const cat = flag('--category');
  const cats = [...new Set(Object.values(man.components).map((c) => c.category))];
  const rows = Object.entries(man.components).filter(([, c]) => !cat || c.category.toLowerCase() === cat.toLowerCase());
  if (cat !== null && !rows.length) { console.error(`✗ 분류 「${cat}」가 없다 — ${cats.join(' · ')}`); process.exit(1); }
  if (argv.includes('--json')) { console.log(JSON.stringify(Object.fromEntries(rows), null, 1)); return; }
  console.log(`\n  shaders@${man.version} — 번들 ${Object.keys(man.components).length}종 (시간 결정성 실측 ${man.selftest?.date || '미실행'} · ${man.selftest?.adapter || ''})`);
  console.log('  종류: 생성 = 혼자 그린다 · 효과 = 앞 레이어들(또는 children)에 건다 · 전환 = progress 0 에서 children, 1 에서 앞 레이어가 보인다(실측 2026-10-08)');
  console.log('  움직임: 기본 prop 으로 시간이 흐르면 화면이 변하는지(selftest 실측 — 효과는 정지 사진에 걸어 잰다). 정지 효과도 at(t) 로 prop 을 움직인다');
  console.log('  ×2: 한 프레임 늦게 반영돼 브리지가 같은 t 를 두 번 그린다 — 그 레이어가 든 캔버스는 렌더 비용도 두 배다');
  console.log('  ⛔기본값만: 켜면 렌더 순서에 따라 결과가 갈리는 prop — 브리지가 바꾼 값을 거부한다\n');
  const by = {};
  for (const [n, c] of rows) (by[c.category] ||= []).push([n, c]);
  for (const [k, l] of Object.entries(by)) {
    console.log(`  ── ${k} (${l.length})`);
    for (const [n, c] of l) console.log(`     ${n.padEnd(22)} ${c.kind.padEnd(3)} ${c.animates === true ? '움직임' : c.animates === false ? '정지  ' : '진행도'}${c.settle ? ` ×${c.settle}` : '   '}  ${Object.keys(c.props).slice(0, 9).join(', ')}${c.defaultOnly ? `  ⛔기본값만: ${c.defaultOnly.join(', ')}` : ''}`);
  }
  console.log(`\n  제외 ${Object.keys(man.excluded).length}종: ${Object.keys(man.excluded).join(', ')}`);
  console.log('     이유: node pipeline/shader-fx.mjs list --json 이 아니라 pipeline/templates/hyperframes/shaders-manifest.json 의 excluded\n');
}

// ── shot: 정적 HTML(세션 스크래치의 포스터 안)을 WebGPU 로 찍는다 ────────────────
async function shot() {
  const html = path.resolve(argv[1] || '');
  if (!argv[1] || !fs.existsSync(html)) { console.error('사용: node pipeline/shader-fx.mjs shot <html> [--at 0,0.5] [-o <png>]'); process.exit(1); }
  const times = String(flag('--at', '0')).split(',').map(Number);
  const out = path.resolve(flag('-o', html.replace(/\.html?$/i, '.png')));
  if (/["'(]file:\/\//.test(fs.readFileSync(html, 'utf8')))
    console.error('  ⚠️ file:// 경로는 이 촬영(http)에서 읽히지 않는다 — 절대 경로(/Users/…) 나 시안 기준 상대 경로로 쓴다');
  // --hf <프로젝트 hyperframes/>: 그 프로젝트가 고정한 HyperFrames 의 브라우저로 찍는다(poster-sheet 가 넘긴다)
  const g = await openGpuPage({ hf: flag('--hf'), allow: [path.dirname(html)] });
  try {
    await g.page.goto(g.url(html), { waitUntil: 'load' });
    await g.page.evaluate(() => document.fonts.ready);
    const outs = [];
    for (const t of times) {
      await seekPage(g.page, t);
      const st = await g.page.evaluate(() => window.__abmShaders ? { gpu: window.__abmShaders.gpu, errors: window.__abmShaders.errors } : null);
      if (st && st.errors.length) throw new Error(st.errors.join(' / '));
      if (st && st.gpu === 'none') throw new Error('WebGPU 어댑터가 없다 — GPU 없는 환경에서는 셰이더 안을 찍을 수 없다');
      const o = times.length > 1 ? out.replace(/\.png$/i, `-${t}.png`) : out;
      await g.page.screenshot({ path: o });
      outs.push(o);
    }
    console.log(outs.join('\n'));
  } catch (e) {
    console.error(`✗ ${e.message}\n${g.logs.filter((l) => /error|abm-shaders/i.test(l)).slice(0, 8).join('\n')}`);
    process.exitCode = 1;
  } finally { await g.close(); }
}

// ── selftest: 같은 t 를 ① 새 렌더러 ② 다른 시각을 거친 렌더러 ③ 또 다른 새 렌더러로 그려 화소를 대조한다 ──
//    HyperFrames 렌더는 워커마다 다른 순서로 seek 한다. 셋이 같아야 워커 수와 무관하게 같은 MP4 가 나온다.
async function selftest(names, core = path.join(TPL, 'shaders-core.js'), mode = 'regress', settle = {}, size = [270, 480]) {
  const [W, H] = size;
  const IMG = path.join(ROOT, 'resources/images/art-college-studio.png');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shader-selftest-'));
  const page = path.join(tmp, 'index.html');
  fs.writeFileSync(page, `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000">
<div id="host" data-composition-id="selftest" data-composition-file="selftest.html" data-start="0" data-hf-authored-duration="10" style="position:relative;width:${W}px;height:${H}px"></div>
<script src="${core}"></script><script src="${path.join(TPL, 'abm-shaders.js')}"></script>
<script>
const IMG = ${JSON.stringify(IMG)};
async function hashOf(c) {
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const d = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function seek(t) {
  const w = []; window.dispatchEvent(new CustomEvent('hf-seek', { detail: { time: t, waitUntil: (p) => w.push(p) } }));
  await Promise.all(w);
}
function layersFor(name, props = {}) {
  // 입력은 움직이는 MeshGradient — 정지 이미지로는 「한 프레임 늦음」이 첫 프레임에만 드러나 놓친다(2026-10-08 실측)
  const def = ShadersCore.components[name];
  // ImageTexture 단독: 같은 사진을 여러 렌더러가 차례로 읽는 경로(마운트별 이미지 완료 판정)를 잰다
  if (name === 'ImageTexture') return [{ type: 'ImageTexture', props: { url: IMG, objectFit: 'cover' } }];
  const src = { type: 'MeshGradient', props: { speed: 3 } };
  if (def.category === 'Transitions') return [src, { type: name, props: { ...('progress' in def.props ? { progress: 0.5 } : {}), ...props }, children: [{ type: 'ImageTexture', props: { url: IMG, objectFit: 'cover' } }] }];
  if (def.requiresChild) return [src, { type: name, props }];
  return [{ type: name, props }];
}
// 기본값에서 꺼진 기능을 켠 변형 — FilmGrain animated·FilmStock weave·Form3D spin 은 켜면 CPU 누산기가 돌고,
// 그 누산기는 시계를 0 으로 되돌려도 초기화되지 않았다(2026-10-08 실측). 불린은 뒤집고, 0 인 수치는 범위 중간으로
function variantOf(name) {
  const def = ShadersCore.components[name], out = {};
  for (const [k, pc] of Object.entries(def.props)) {
    if (['url', 'progress', 'seed'].includes(k)) continue;
    const d = pc.default, ui = pc.ui || {};
    if (typeof d === 'boolean') out[k] = !d;
    else if ((d === 0 || d === null) && /range/.test(JSON.stringify(ui.type || ''))) out[k] = ui.max > 0 ? (Math.max(ui.min || 0, 0) + ui.max) / 2 : 1;
  }
  return out;
}
let blank = null;
async function one(name, k, props) {
  const host = document.getElementById('host');
  const mk = () => { host.innerHTML = ''; const c = document.createElement('canvas'); c.width = ${W}; c.height = ${H}; host.appendChild(c); return c; };
  const run = async (c, ts) => { const m = ABMShaders.mount(c, { layers: layersFor(name, props), renders: k }); for (const t of ts) await seek(t); const h = await hashOf(c); ABMShaders.unmount(m); return h; };
  if (!blank) { const c = mk(); blank = await hashOf(c); }
  const a = await run(mk(), [1.37]);
  const b = await run(mk(), [0.2, 2.9, 11, 0.75, 1.37]);   // 11초 = 슬롯(10초) 밖 — 렌더러를 놓았다가 다시 만드는 경로
  const c = await run(mk(), [1.37]);
  // 움직임: 생성은 그대로, 효과는 정지 사진에 걸어 효과 자체가 시간에 따라 변하는지 잰다(입력의 움직임과 섞지 않는다). 전환은 progress 로 움직인다
  const def = ShadersCore.components[name];
  let animates = null;
  if (def.category !== 'Transitions' && !props) {
    const still = def.requiresChild && name !== 'ImageTexture' ? [{ type: 'ImageTexture', props: { url: IMG, objectFit: 'cover' } }, { type: name }] : layersFor(name);
    const at = async (t) => { const c = mk(); const m = ABMShaders.mount(c, { layers: still, renders: k }); await seek(t); const h = await hashOf(c); ABMShaders.unmount(m); return h; };
    animates = (await at(1.37)) !== (await at(2.9));
  }
  return { same: a === b && b === c, blank: a === blank, animates, h: [a, b, c].map((x) => x.slice(0, 6)).join(' ') };
}
// mode 'probe': 같은 t 를 1·2·3번 다시 그려 보며 안정되는 최소 횟수(settle)를 잰다(build)
//      'regress': 번들에 적힌 settle 그대로 · 'variant': 꺼진 기능을 켠 변형 → 갈리면 prop 하나씩 좁혀 unsafe 를 찾는다
window.runAll = async (names, mode, settle = {}) => {
  const out = {};
  for (const n of names) {
    window.__abmShaders.errors.length = 0;
    try {
      if (mode === 'probe') { for (const k of [1, 2, 3]) { out[n] = { ...(await one(n, k)), settle: k }; if (out[n].same) break; } }
      else if (mode === 'variant') {
        const v = variantOf(n), keys = Object.keys(v), k = settle[n] || 1;
        if (!keys.length) { out[n] = { same: true, skipped: true }; continue; }
        const r = await one(n, k, v);
        if (r.same) { out[n] = { same: true, varied: keys }; continue; }
        const unsafe = [];
        for (const p of keys) if (!(await one(n, k, { [p]: v[p] })).same) unsafe.push(p);
        out[n] = { same: false, unsafe: unsafe.length ? unsafe : keys, h: r.h };
      } else out[n] = await one(n, undefined);
    } catch (e) { out[n] = { error: String(e && e.message || e).slice(0, 200) }; }
  }
  return out;
};
</script>`);
  const g = await openGpuPage({ width: W, height: H });
  try {
    await g.page.goto(g.url(page), { waitUntil: 'load' });
    const adapter = await g.adapter();                    // about:blank 은 보안 컨텍스트가 아니라 navigator.gpu 가 없다 — 로드 뒤에 묻는다
    if (!adapter) throw new Error('WebGPU 어댑터가 없다 — GPU 환경에서 돌린다');
    const res = {};
    for (let i = 0; i < names.length; i += 12) {          // 묶음마다 결과를 받아 긴 evaluate 하나가 멈추지 않게
      Object.assign(res, await g.page.evaluate((ns, md, st) => window.runAll(ns, md, st), names.slice(i, i + 12), mode, settle));
      process.stdout.write(`\r  selftest ${Math.min(i + 12, names.length)}/${names.length}`);
    }
    process.stdout.write('\n');
    return { adapter, res };
  } finally { await g.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
}

async function selftestCmd() {
  const man = readManifest();
  if (!man) { console.error('✗ manifest 가 없다 — build 부터'); process.exit(2); }
  const only = flag('--only');
  const names = only ? only.split(',') : Object.keys(man.components);
  // 번들에 적힌 settle 그대로 돌리는 회귀 시험. --probe 는 1·2·3회를 다시 재 본다(진단용)
  const mode = argv.includes('--probe') ? 'probe' : argv.includes('--variant') ? 'variant' : 'regress';
  const full = argv.includes('--full');                    // 1080×1920 캔버스 — 기본 270×480 보다 느리다
  const { adapter, res } = await selftest(names, flag('--core') ? path.resolve(flag('--core')) : undefined, mode, man.settle || {}, full ? [1080, 1920] : undefined);
  report(res);
  if (full && !only && mode === 'regress' && !flag('--core')) {
    man.selftest.full = { date: new Date().toISOString().slice(0, 10), adapter, size: '1080x1920', failed: Object.entries(res).filter(([, r]) => r.error || !r.same).map(([n]) => n) };
    fs.writeFileSync(MANIFEST, JSON.stringify(man, null, 1) + '\n');
  }
  console.log(`  어댑터 ${adapter} · 번들에 적힌 안정 횟수: ${Object.entries(man.settle || {}).map(([n, k]) => `${n}×${k}`).join(', ') || '없음'}`);
  if (Object.values(res).some((r) => r.error || !r.same)) {
    console.log('  🔴 불일치가 있다 — 브리지·번들을 고쳤으면 node pipeline/shader-fx.mjs build 로 다시 재고 묶는다');
    process.exitCode = 1;
  }
}
function report(res) {
  const bad = Object.entries(res).filter(([, r]) => r.error || (!r.same && !r.unsafe));
  const blank = Object.entries(res).filter(([, r]) => !r.error && r.blank).map(([n]) => n);
  console.log(`  ✅ 일치 ${Object.keys(res).length - bad.length} · 🔴 불일치·오류 ${bad.length}${blank.length ? ` · 빈 화면(입력·크기 의존) ${blank.join(', ')}` : ''}`);
  for (const [n, r] of bad) console.log(`     🔴 ${n}: ${r.error || '같은 t 인데 렌더 순서에 따라 화소가 다르다'}${r.h ? ` [${r.h}]` : ''}`);
  const st = Object.entries(res).filter(([, r]) => r.same && r.settle > 1).map(([n, r]) => `${n}×${r.settle}`);
  if (st.length) console.log(`     ↻ 같은 t 를 다시 그려야 안정되는 효과(한 프레임 늦음): ${st.join(', ')}`);
  const un = Object.entries(res).filter(([, r]) => r.unsafe).map(([n, r]) => `${n}.${r.unsafe.join('/')}`);
  if (un.length) console.log(`     ⛔ 켜면 렌더 순서에 따라 갈리는 prop(기본값만 허용): ${un.join(', ')}`);
}

// ── build (관리): 고정 버전 설치 → 허용 효과만 IIFE 번들 → selftest → 불일치는 빼고 다시 묶는다 ───────────
async function build() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'shader-build-'));
  const sh = (cmd, args) => execFileSync(cmd, args, { cwd: work, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
  console.log(`  ① npm i shaders@${PIN.shaders} typegpu@${PIN.typegpu} esbuild@${PIN.esbuild} (${work})`);
  fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({ name: 'abm-shader-build', private: true, type: 'module' }));
  sh('npm', ['i', '--no-audit', '--no-fund', `shaders@${PIN.shaders}`, `typegpu@${PIN.typegpu}`, `esbuild@${PIN.esbuild}`]);
  const nm = path.join(work, 'node_modules');
  const reg = await import(path.join(nm, 'shaders/dist/registry.js'));
  const all = reg.getAllShaders().map((s) => (s.definition || s).name);
  const excluded = Object.fromEntries(Object.entries(EXCLUDE).filter(([n]) => all.includes(n)));
  const esm = await import(path.join(nm, 'esbuild/lib/main.js'));
  const esbuild = esm.build ? esm : esm.default;
  const lic = ['shaders', 'typegpu', 'typed-binary', 'tinyest', 'tsover-runtime'].filter((p) => fs.existsSync(path.join(nm, p)))
    .map((p) => { const d = path.join(nm, p), v = JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8'));
      const f = fs.readdirSync(d).find((x) => /^licen[cs]e/i.test(x));
      return `── ${p}@${v.version} (${v.license}) ──\n${f ? fs.readFileSync(path.join(d, f), 'utf8').trim() : '(라이선스 파일 없음 — package.json: ' + v.license + ')'}`; });
  const bundle = async (names, settle = {}, unsafe = {}) => {
    const entry = path.join(work, 'entry.js');
    fs.writeFileSync(entry, [
      `import { shaderRendererGPU, createGpuUniformsMap, rootPassthrough, getNaturalSize } from 'shaders/core';`,
      ...names.map((n, i) => `import c${i} from 'shaders/core/${n}';`),
      `window.ShadersCore = window.ShadersCore || { version: ${JSON.stringify(PIN.shaders)}, shaderRendererGPU, createGpuUniformsMap, rootPassthrough, getNaturalSize,`,
      `  settle: ${JSON.stringify(settle)}, unsafe: ${JSON.stringify(unsafe)},`,
      `  components: { ${names.map((n, i) => `${JSON.stringify(n)}: c${i}`).join(', ')} } };`].join('\n'));
    const out = path.join(TPL, 'shaders-core.js');
    await esbuild.build({ entryPoints: [entry], bundle: true, format: 'iife', minify: true, legalComments: 'none', outfile: out, absWorkingDir: work, logLevel: 'error',
      banner: { js: `/*! shaders@${PIN.shaders} core + ${names.length} components (MIT, https://github.com/paper-design/shaders — see LICENSE-shaders.txt). Built by pipeline/shader-fx.mjs build — do not edit. */` } });
    return out;
  };
  let names = all.filter((n) => !excluded[n]);
  console.log(`  ② 번들 ${names.length}종 (제외 ${Object.keys(excluded).length})`);
  await bundle(names);
  fs.writeFileSync(path.join(TPL, 'LICENSE-shaders.txt'), `Third-party licenses for shaders-core.js\n\n${lic.join('\n\n')}\n`);
  console.log('  ③ selftest — 같은 t 를 세 경로(새 렌더러 · 다른 시각을 거친 렌더러 · 또 새 렌더러)로 그려 대조, 안 맞으면 2·3번 다시 그려 본다');
  const st = await selftest(names, undefined, 'probe');
  report(st.res);
  const bad = Object.entries(st.res).filter(([, r]) => r.error || !r.same);
  for (const [n, r] of bad) excluded[n] = `selftest(${new Date().toISOString().slice(0, 10)}): ${r.error || '같은 t 를 3번 다시 그려도 렌더 순서에 따라 화소가 다르다'}`;
  const settle = Object.fromEntries(Object.entries(st.res).filter(([, r]) => r.same && r.settle > 1).map(([n, r]) => [n, r.settle]));
  names = names.filter((n) => !excluded[n]);
  console.log('  ④ 변형 — 기본값에서 꺼진 기능(불린·0 인 수치)을 켜고 같은 대조, 갈리면 prop 하나씩 좁힌다');
  const va = await selftest(names, undefined, 'variant', settle);
  report(va.res);
  const vbad = Object.entries(va.res).filter(([, r]) => r.error);
  if (vbad.length) throw new Error(`변형 시험 오류 ${vbad.map(([n, r]) => `${n}: ${r.error}`).join(' / ')}`);
  const unsafe = Object.fromEntries(Object.entries(va.res).filter(([, r]) => r.unsafe).map(([n, r]) => [n, r.unsafe]));
  console.log(`  ⑤ 불일치 ${bad.length}종 제외 · 다시 그리기 ${Object.keys(settle).length}종 · 기본값만 허용 ${Object.keys(unsafe).length}종 → ${names.length}종으로 다시 묶는다`);
  await bundle(names, settle, unsafe);
  console.log('  ⑥ 회귀 — 묶은 번들 그대로(다시 그리기 포함) 한 번 더');
  const re = await selftest(names);
  report(re.res);
  const reBad = Object.entries(re.res).filter(([, r]) => r.error || !r.same);
  if (reBad.length) throw new Error(`회귀 불일치 ${reBad.map(([n]) => n).join(', ')} — 타이밍에 따라 갈리는 효과다. EXCLUDE 에 더하고 다시 build`);
  // 정의 메타데이터는 작업 폴더 안에서 패키지 exports('shaders/core/<Name>')로 읽는다
  fs.writeFileSync(path.join(work, 'dump.mjs'), `const out = {};
for (const n of ${JSON.stringify(names)}) { const d = (await import('shaders/core/' + n)).default;
  out[n] = { category: d.category, kind: d.category === 'Transitions' ? '전환' : d.requiresChild ? '효과' : '생성',
    props: Object.fromEntries(Object.entries(d.props).map(([k, p]) => [k, p.default ?? null])) }; }
console.log(JSON.stringify(out));`);
  const defs = JSON.parse(sh(process.execPath, ['dump.mjs']));
  for (const n of Object.keys(defs)) { defs[n].animates = re.res[n] ? re.res[n].animates : null; if (settle[n]) defs[n].settle = settle[n]; if (unsafe[n]) defs[n].defaultOnly = unsafe[n]; }
  const core = path.join(TPL, 'shaders-core.js');
  const man = { package: 'shaders', version: PIN.shaders, typegpu: PIN.typegpu, esbuild: PIN.esbuild, bundle: 'shaders-core.js',
    sha256: sha256(core), bytes: fs.statSync(core).size, built: new Date().toISOString().slice(0, 10),
    selftest: { date: new Date().toISOString().slice(0, 10), adapter: st.adapter, input: 'MeshGradient speed 3 (움직이는 입력)', failed: Object.fromEntries(bad.map(([n, r]) => [n, r.error || '시각 재현 불일치'])) },
    settle, defaultOnly: unsafe, excluded, components: defs };
  fs.writeFileSync(MANIFEST, JSON.stringify(man, null, 1) + '\n');
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`  ✅ ${path.relative(ROOT, core)} ${(man.bytes / 1e6).toFixed(2)} MB · ${names.length}종 · manifest 기록`);
}
