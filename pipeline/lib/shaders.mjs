// shaders.mjs — 셰이더(shaders.com) 번들의 설치·사용 검사 (2026-10-08 도입 · 정본 docs/14-hyperframes.md §16).
// shader-fx.mjs 와 stage-gate ④ 가 같은 판정을 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TPL = path.join(ROOT, 'pipeline/templates/hyperframes');
// 프로젝트 hyperframes/assets/vendor/ 로 복사하는 세 파일
export const VENDOR = ['shaders-core.js', 'abm-shaders.js', 'LICENSE-shaders.txt'];
export const MANIFEST = path.join(TPL, 'shaders-manifest.json');

// 번들에서 뺀 효과 — HyperFrames 는 아무 시각으로나 seek 하므로 「t 하나의 함수」가 아닌 것은 렌더 워커마다 다르게 나온다.
// 판별 기준(shaders 4.0.2 소스, 2026-10-08): std/sim(이전 프레임 상태 시뮬레이션)을 쓰거나, 포인터 입력이 동작을 만들거나,
// 화면 밖 자원(DOM 캡처·영상·카메라·원격 글꼴)을 읽는다. selftest 가 불일치로 잡은 것은 build 가 여기에 더해 manifest 에 남긴다.
const SIM = 'std/sim 시뮬레이션 — 이전 프레임 상태로 다음 프레임을 만든다(절대 시각 seek 로 재현 불가)';
const PTR = '포인터(커서) 입력이 동작을 만든다 — 렌더에는 커서가 없다';
export const EXCLUDE = {
  Boids: SIM, ChromaFlow: SIM, DataMosh: SIM, FloatingParticles: SIM, Fog: SIM, GridDistortion: SIM, InkFlow: SIM,
  Liquify: SIM, MagneticFilings: SIM, ParticleField: SIM, ParticleFlow: SIM, Particles: SIM, PixelSort: SIM,
  PixelThrow: SIM, ReactionDiffusion: SIM, Smoke: SIM, SmokeFill: SIM, SmokeFlow: SIM, TimeTrail: SIM,
  CursorRipples: PTR, CursorTrail: PTR, Shatter: PTR, Surface3D: PTR,
  HTMLInCanvas: 'DOM 캡처 — Brave/Canary 전용(drawElementImage), 기본 headless-shell 에서 안 된다',
  VideoTexture: '영상 텍스처 — 영상은 HyperFrames <video> 로 싣는다',
  WebcamTexture: '카메라 입력',
  Text: '글꼴을 Google Fonts 에서 원격으로 읽는다 — 글자는 HTML 로 얹는다',
};

// 인쇄 망점·종이결 계열 — 쓰면 stage-gate ④ 가 경고한다(전면 리소 처리 2026-09-15 기각)
export const PRINT_LIKE = ['Halftone', 'Dither', 'Paper', 'Engraving'];

export const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
export function readManifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { return null; }
}

const htmlFiles = (hf) => {
  const out = [path.join(hf, 'index.html')].filter((f) => fs.existsSync(f));
  const walk = (d) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.html')) out.push(p); } };
  walk(path.join(hf, 'compositions'));
  // 롱폼 묶음(hf-bundle)은 챕터 원본을 chNN/compositions/ 에 복사한다
  for (const d of fs.existsSync(hf) ? fs.readdirSync(hf) : []) if (/^ch\d+$/.test(d)) walk(path.join(hf, d, 'compositions'));
  return out;
};
const rootTag = (idx) => (idx.match(/<[^>]*\bdata-composition-id(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?[^>]*>/i) || [''])[0];
const HEAD_RE = /<script[^>]*src="assets\/vendor\/(shaders-core|abm-shaders)\.js"[^>]*><\/script>/g;

// ── 레이어 객체 읽기: { type: 'X', …, props: { a: …, b: … } } 에서 X 와 props 의 최상위 키 ───────────────
//    JS 를 실행하지 않고 괄호 짝만 맞춘다(문자열 안 괄호는 건너뛴다). 변수로 만든 props 는 못 읽는다 — 그건 브리지가 마운트 때 막는다
function skipStr(src, j) { const q = src[j]; for (j++; j < src.length && src[j] !== q; j++) if (src[j] === '\\') j++; return j; }
function enclosing(src, i) {
  let d = 0, start = -1;
  for (let j = i; j >= 0; j--) { const c = src[j]; if (c === '}') d++; else if (c === '{') { if (!d) { start = j; break; } d--; } }
  if (start < 0) return null;
  for (let j = start, e = 0; j < src.length; j++) {
    const c = src[j];
    if (c === '"' || c === "'" || c === '`') { j = skipStr(src, j); continue; }
    if (c === '{') e++; else if (c === '}' && !--e) return [start, j];
  }
  return null;
}
function topKeys(body) {
  const keys = []; let d = 0, tok = '';
  for (let j = 0; j < body.length; j++) {
    const c = body[j];
    if (c === '"' || c === "'" || c === '`') { j = skipStr(body, j); tok = ''; continue; }
    if ('{[('.includes(c)) { d++; tok = ''; continue; }
    if ('}])'.includes(c)) { d--; tok = ''; continue; }
    if (d) continue;
    if (/[\w$]/.test(c)) tok += c;
    else if (c === ':' && tok) { keys.push(tok); tok = ''; }
    else if (!/\s/.test(c)) tok = '';
  }
  return keys;
}
export function layerProps(src) {
  const out = [];
  for (const m of src.matchAll(/\btype\s*:\s*['"]([A-Za-z0-9]+)['"]/g)) {
    const obj = enclosing(src, m.index);
    if (!obj) continue;
    const text = src.slice(obj[0] + 1, obj[1]);
    const pm = /(^|[,{\s])props\s*:\s*\{/.exec(text);
    if (!pm) { out.push({ type: m[1], keys: [] }); continue; }
    const at = obj[0] + 1 + pm.index + pm[0].length - 1, pb = enclosing(src, at + 1);
    out.push({ type: m[1], keys: pb ? topKeys(src.slice(pb[0] + 1, pb[1])) : [] });
  }
  return out;
}

// 프레임 소스에서 ABMShaders.mount 호출과 그 안의 type 이름을 모은다
export function shaderUse(hf) {
  const files = [], types = new Map(), selfLoad = [], layers = [];
  for (const f of htmlFiles(hf)) {
    const s = fs.readFileSync(f, 'utf8');
    const rel = path.relative(hf, f);
    if (rel !== 'index.html' && /src="[^"]*(shaders-core|abm-shaders)\.js"/.test(s)) selfLoad.push(rel);
    if (!/ABMShaders\.mount\s*\(/.test(s)) continue;
    files.push(rel);
    for (const m of s.matchAll(/\btype\s*:\s*['"]([A-Za-z0-9]+)['"]/g)) {
      if (!types.has(m[1])) types.set(m[1], new Set());
      types.get(m[1]).add(rel);
    }
    for (const l of layerProps(s)) layers.push({ ...l, file: rel });
  }
  return { files, types, selfLoad, layers };
}

// 판정: { used, errors[], warns[], oks[] } — errors 는 stage-gate ④ 하드
export function checkShaders(hf) {
  const r = { used: false, errors: [], warns: [], oks: [] };
  const idxF = path.join(hf, 'index.html');
  const idx = fs.existsSync(idxF) ? fs.readFileSync(idxF, 'utf8') : '';
  const use = shaderUse(hf);
  const installed = VENDOR.some((f) => fs.existsSync(path.join(hf, 'assets/vendor', f))) || HEAD_RE.test(idx);
  HEAD_RE.lastIndex = 0;
  if (!use.files.length) {
    if (installed) r.warns.push('셰이더 번들이 설치됐는데 쓰는 프레임이 없다 — 페이지마다 3MB를 싣는다. node pipeline/shader-fx.mjs <p> remove');
    return r;
  }
  r.used = true;
  const man = readManifest();
  if (!man) { r.errors.push('pipeline/templates/hyperframes/shaders-manifest.json 이 없다 — 번들이 빌드되지 않았다 (node pipeline/shader-fx.mjs build)'); return r; }
  // ① 설치본 = 저장소 원본
  for (const f of VENDOR) {
    const p = path.join(hf, 'assets/vendor', f), src = path.join(TPL, f);
    if (!fs.existsSync(p)) r.errors.push(`assets/vendor/${f} 가 없다 — node pipeline/shader-fx.mjs <p> install`);
    else if (fs.existsSync(src) && sha256(p) !== sha256(src)) r.errors.push(`assets/vendor/${f} 가 저장소 원본과 다르다 — node pipeline/shader-fx.mjs <p> install 로 다시 복사`);
  }
  // ② index.html <head> 가 번들·브리지를 한 번 싣는다 (shaders-core → abm-shaders 순서)
  const a = idx.indexOf('assets/vendor/shaders-core.js'), b = idx.indexOf('assets/vendor/abm-shaders.js');
  if (a < 0 || b < 0 || b < a) r.errors.push('index.html 이 shaders-core.js → abm-shaders.js 를 싣지 않는다 — node pipeline/shader-fx.mjs <p> install');
  if (use.selfLoad.length) r.warns.push(`프레임이 번들을 따로 싣는다(${use.selfLoad.join(' · ')}) — index.html 이 한 번 싣는다. 프레임의 <script src> 를 지운다`);
  // ③ 루트 composition 에 data-requires-webgpu — 소프트웨어 GPU 로 떨어지면 HyperFrames 가 캡처 전에 멈춘다
  if (!/\bdata-requires-webgpu(?:\s|=|>)/.test(rootTag(idx))) r.errors.push('루트(index.html 첫 data-composition-id)에 data-requires-webgpu 가 없다 — GPU 없는 렌더가 셰이더 없이 구워진다. node pipeline/shader-fx.mjs <p> install');
  // ④ 번들에 있는 효과만
  for (const [t, where] of use.types) {
    if (man.components?.[t]) continue;
    const why = man.excluded?.[t] || EXCLUDE[t];
    r.errors.push(`${t} — ${why ? '번들에서 뺀 효과: ' + why : '번들에 없는 이름'} (${[...where].join(' · ')}) · 목록: node pipeline/shader-fx.mjs list`);
  }
  // ④-b prop 이름 — 없는 prop 은 조용히 무시되지 않고 마운트 오류(자홍 판·캡처 중단)가 된다. 여기서 먼저 잡는다
  for (const l of use.layers) {
    const c = man.components?.[l.type];
    if (!c) continue;
    const unknown = l.keys.filter((k) => !(k in c.props));
    if (unknown.length) r.errors.push(`${l.type} 에 없는 prop ${unknown.join(', ')} (${l.file}) — 가능: ${Object.keys(c.props).join(', ')}`);
    if ('stops' in c.props && !l.keys.includes('stops') && l.keys.some((k) => k === 'colorA' || k === 'colorB'))
      r.errors.push(`${l.type} 의 색은 stops 로 준다 — colorA/colorB 는 stops 기본값에 가려진다 (${l.file}) · ABMShaders.stops([...])`);
    const only = (c.defaultOnly || []).filter((k) => l.keys.includes(k));
    if (only.length) r.warns.push(`${l.type}.${only.join('/')} 는 기본값만 허용된다(켜면 렌더 순서에 따라 갈린다) — 기본값이 아니면 마운트 오류 (${l.file})`);
  }
  // ⑤ 2026-09-15 사용자 기각 — 사진·헤드라인·무대 전체를 망점·종이결 인쇄처럼 만드는 처리(docs/12-brand.md). 부분 사용은 화면에서 판단한다
  const riso = [...use.types.keys()].filter((t) => PRINT_LIKE.includes(t));
  if (riso.length) r.warns.push(`${riso.join('·')} — 2026-09-15 기각된 전면 망점·리소 인쇄 처리가 아닌지 snapshot 으로 확인한다(docs/12-brand.md 「기각」)`);
  if (!r.errors.length) r.oks.push(`셰이더 ${use.files.length}개 프레임 · ${[...use.types.keys()].join(', ')} — 번들 ${man.package}@${man.version}`);
  return r;
}

// 설치: vendor 세 파일 복사 + <head> 두 줄 + 루트 data-requires-webgpu (멱등)
export function installShaders(hf) {
  const done = [];
  fs.mkdirSync(path.join(hf, 'assets/vendor'), { recursive: true });
  for (const f of VENDOR) {
    const src = path.join(TPL, f), dst = path.join(hf, 'assets/vendor', f);
    if (!fs.existsSync(src)) throw new Error(`${src} 가 없다 — node pipeline/shader-fx.mjs build`);
    if (!fs.existsSync(dst) || sha256(dst) !== sha256(src)) { fs.copyFileSync(src, dst); done.push(`assets/vendor/${f}`); }
  }
  const idxF = path.join(hf, 'index.html');
  let idx = fs.readFileSync(idxF, 'utf8');
  const before = idx;
  if (!idx.includes('assets/vendor/shaders-core.js') || !idx.includes('assets/vendor/abm-shaders.js')) {
    idx = idx.replace(HEAD_RE, '');
    const tags = '  <script src="assets/vendor/shaders-core.js"></script>\n  <script src="assets/vendor/abm-shaders.js"></script>\n';
    const g = idx.match(/[ \t]*<script[^>]*src="assets\/vendor\/gsap\.min\.js"[^>]*><\/script>\n?/);
    idx = g ? idx.replace(g[0], g[0].replace(/\n?$/, '\n') + tags) : idx.replace(/<\/head>/i, tags + '</head>');
    done.push('index.html <head> 번들·브리지');
  }
  const tag = rootTag(idx);
  if (tag && !/\bdata-requires-webgpu(?:\s|=|>)/.test(tag)) {
    idx = idx.replace(tag, tag.replace(/\s*\/?>$/, (e) => ' data-requires-webgpu' + e));
    done.push('루트 data-requires-webgpu');
  }
  if (idx !== before) fs.writeFileSync(idxF, idx);
  return done;
}

export function removeShaders(hf) {
  const done = [];
  const use = shaderUse(hf);
  if (use.files.length) throw new Error(`아직 쓰는 프레임이 있다: ${use.files.join(' · ')}`);
  for (const f of VENDOR) { const p = path.join(hf, 'assets/vendor', f); if (fs.existsSync(p)) { fs.rmSync(p); done.push(`assets/vendor/${f}`); } }
  const idxF = path.join(hf, 'index.html');
  let idx = fs.readFileSync(idxF, 'utf8');
  const before = idx;
  idx = idx.replace(/[ \t]*<script[^>]*src="assets\/vendor\/(?:shaders-core|abm-shaders)\.js"[^>]*><\/script>\n?/g, '');
  const tag = rootTag(idx);
  if (tag) idx = idx.replace(tag, tag.replace(/\s+data-requires-webgpu(?:="[^"]*")?/, ''));
  if (idx !== before) { fs.writeFileSync(idxF, idx); done.push('index.html'); }
  return done;
}
