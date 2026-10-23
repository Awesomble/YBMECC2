// 효과음 목록 — 등급·상황 태그·동기점. 정본은 resources/sfx/catalog.json (2026-09-26)
//
// 왜: 큐 이름은 「동전」「테이프」「그릇」인데 파일은 카드 슬라이드·팝으로 대체되는 일이 반복됐고,
//     파일 안에서 소리가 터지는 지점을 사람이 따로 재야 했다. 그리고 2026-09-26 저작권 검수에서
//     VideoEditingSFX 계열의 CC0가 사이트 자기 주장뿐임이 드러나 신규 사용을 끊어야 했다.
// 무엇: 파일마다 tier(verified|site-claim)·retired·replace·tags·parent(파생본 계보)·sync(청취로 확정한 동기점)
//       ·swap(사용자가 싫어해 중단한 소리 — 롱폼 묶음이 원본 숏츠의 그 큐를 이 파일로 자동 교체한다, hf-bundle build. 2026-10-08 rumble → vroom)
//       + measured(도구가 재는 값). 파생본(-loud·-vc)은 parent 를 따라 태그·등급·대체안을 물려받는다.
// ⚠️ measured.attack6 은 「최대 10ms RMS 에서 6dB 안에 처음 드는 시각」이다. 청각적 타격점의 추정일 뿐이며
//    README 규칙대로 파일 끝·전역 피크를 동기점으로 단정하지 않는다. 들어서 다르면 그 파일에 sync 를 적는다.
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

export const catalogPath = rootDir => path.join(rootDir, 'resources/sfx/catalog.json');

export function loadSfxCatalog(rootDir) {
  const f = catalogPath(rootDir);
  if (!existsSync(f)) throw new Error('resources/sfx/catalog.json 이 없다 — 효과음 등급·태그 정본');
  const cat = JSON.parse(readFileSync(f, 'utf8'));
  if (!cat.files || typeof cat.files !== 'object') throw new Error('catalog.json 에 files 가 없다');
  return cat;
}

// 파생본은 부모의 등급·태그·대체안을 물려받고, 자기 값(measured·sync·tags 추가)은 덮어쓴다
export function sfxEntry(cat, file) {
  const own = cat.files[file];
  if (!own) return null;
  const chain = [own];
  for (let p = own.parent, n = 0; p && n < 8; n++) { const up = cat.files[p]; if (!up) break; chain.push(up); p = up.parent; }
  const e = {file};
  for (const k of ['tier', 'source', 'retired', 'retired_reason', 'replace', 'note']) { const hit = chain.find(x => x[k] !== undefined); if (hit) e[k] = hit[k]; }
  e.tags = [...new Set(chain.flatMap(x => x.tags || []))];
  e.parent = own.parent; e.sync = own.sync; e.measured = own.measured || {};
  e.root = chain.at(-1) === own ? file : Object.keys(cat.files).find(k => cat.files[k] === chain.at(-1));
  return e;
}

// 파일 안에서 들려줄 지점(초). 청취로 적은 sync 가 있으면 그것, 없으면 측정 추정 —
// 서서히 차오르는 라이저·빌드·휘익은 정점(max_rms_t), 타격·클릭은 어택(attack6)
const SWELL = ['riser', 'build', 'whoosh'];
export const sfxSync = e => Number.isFinite(e?.sync) ? e.sync
  : (e?.tags || []).some(t => SWELL.includes(t)) ? (e?.measured?.max_rms_t ?? 0) : (e?.measured?.attack6 ?? 0);
export const projectId = dir => path.basename(dir).match(/^\d{5}/)?.[0] || '';

// 중단 이유 — rights(권리: 자기 주장 CC0 등, 기본값) · long(취향: 길게 울리는 저음, 2026-10-21 사용자 「드드드드 오래 나는 소리는 듣기 싫다」)
//   rights 는 retired_allow 밖이면 어느 편이든 조립 실패. long 은 SFX_LICENSE_ENFORCE_FROM 번부터 새 편만 실패, 그 전 편(납품·재렌더)은 resolveSfxCues 가 큐에 retired:'long' 을 달아 stage-gate ⑤ 가 경고한다
export const SFX_LICENSE_ENFORCE_FROM = 2;   // 2026-10-21 시행(YBMECC 이식) — 그때 projects/ 최댓값 00001 + 1(ABMEN 은 128). 근거 등급(sfx-tracks)과 취향 중단이 같은 번호를 쓴다
const retiredReason = e => (e?.retired ? (e.retired_reason || 'rights') : null);
const projectNum = dir => Number(projectId(dir)) || 0;

// 조립 가능한가 — 목록에 있고, 신규 사용 중단 파일이면 허용 목록의 프로젝트(권리)이거나 시행 번호 전 편(취향)이어야 한다
export function sfxLicenseProblem(cat, file, projectDir) {
  const e = sfxEntry(cat, file);
  if (!e) return `resources/sfx/catalog.json 에 ${file} 이 없다 — 새 파일은 CREDITS 와 catalog 에 함께 올린다`;
  if (!e.retired || (cat.retired_allow || []).includes(projectId(projectDir))) return null;
  const alt = (e.replace || []).join(', ') || 'node pipeline/sfx-fit.mjs --find <상황>';
  if (retiredReason(e) === 'long') {
    if (projectNum(projectDir) < SFX_LICENSE_ENFORCE_FROM) return null;   // 옛 편 — 경고는 stage-gate ⑤(resolveSfxCues 의 retired:'long')
    return `${file} 은 길게 울리는 저음이라 ${String(SFX_LICENSE_ENFORCE_FROM).padStart(5, '0')}번부터 쓰지 않는다(2026-10-21 사용자) — 짧은 대체: ${alt}`;
  }
  return `${file} 은 ${e.retired} 부터 신규 사용 중단(${e.tier}) — 대체 후보: ${alt}`;
}

// 큐 id 의 단어 → 기대 태그. 사전은 catalog.vocab 에 데이터로 둔다
export function wantedTags(cat, id) {
  const out = new Map();
  for (const w of String(id).toLowerCase().split(/[^a-z]+/)) {
    const tags = cat.vocab?.[w];
    if (tags?.length) out.set(w, tags);
  }
  return out;
}

// 상황 단어로 후보 찾기 — 사용 가능한 확인본을 앞에, 같은 계보는 대표 하나만
export function findSfx(cat, words, {includeRetired = false} = {}) {
  const want = new Set();
  for (const w of words.flatMap(x => String(x).toLowerCase().split(/[^a-z]+/)).filter(Boolean)) {
    want.add(w); for (const t of cat.vocab?.[w] || []) want.add(t);
  }
  const rows = [];
  for (const file of Object.keys(cat.files)) {
    const e = sfxEntry(cat, file);
    if (!includeRetired && e.retired) continue;
    const hit = e.tags.filter(t => want.has(t));
    if (hit.length) rows.push({...e, hit, score: hit.length + (e.tier === 'verified' ? 0.5 : 0) - (e.parent ? 0.25 : 0)});
  }
  return rows.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
}

// ── 측정 ─────────────────────────────────────────────────────────────
const SR = 48000, W = SR / 100;
// 채널을 섞지 않고 받는다 — `-ac 1` 은 상관된 스테레오를 약 +3dB 크게 읽는다(ABM sfx-level 실측)
const decode = (file, af) => {
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', file, ...(af ? ['-af', af] : []), '-ar', String(SR), '-f', 'f32le', '-'], {maxBuffer: 1 << 30});
  if (r.status !== 0) throw new Error(`디코딩 실패: ${file}`);
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength / 4);
};
const db = p => 10 * Math.log10(p + 1e-12);
const r3 = x => Math.round(x * 1000) / 1000;

export function measureSfx(file) {
  const ch = Number(spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels', '-of', 'csv=p=0', file], {encoding: 'utf8'}).stdout.trim()) || 1;
  const x = decode(file);
  const band = decode(file, 'highpass=f=1000:poles=2,highpass=f=1000:poles=2,lowpass=f=4000:poles=2,lowpass=f=4000:poles=2');
  const n = Math.floor(x.length / ch), frames = [];
  // 10ms 창마다 채널별 RMS 중 큰 쪽
  for (let s = 0; s + W <= n; s += W) {
    let best = 0;
    for (let c = 0; c < ch; c++) { let e = 0; for (let i = s; i < s + W; i++) e += x[i * ch + c] ** 2; best = Math.max(best, e / W); }
    frames.push(db(best));
  }
  if (!frames.length) frames.push(-120);
  const max = Math.max(...frames), imax = frames.indexOf(max);
  let peak = 0, eAll = 0, eBand = 0;
  for (let i = 0; i < x.length; i++) { peak = Math.max(peak, Math.abs(x[i])); eAll += x[i] * x[i]; }
  for (let i = 0; i < band.length; i++) eBand += band[i] * band[i];
  const first = th => frames.findIndex(v => v > max - th);
  let last = frames.length - 1; while (last > 0 && frames[last] <= max - 40) last--;
  return {
    dur: r3(n / SR), channels: ch,
    onset: r3(first(30) * 0.01), attack6: r3(first(6) * 0.01), max_rms_t: r3(imax * 0.01 + 0.005), end40: r3((last + 1) * 0.01),
    peak_dbfs: Math.round(20 * Math.log10(peak + 1e-12) * 10) / 10, rms_max_dbfs: Math.round(max * 10) / 10,
    voice_band: Math.round(eBand / (eAll + 1e-12) * 100) / 100,
  };
}

// 사람이 고치는 파일이라 vocab·files 는 한 줄에 하나씩 쓴다 (diff·grep 이 쉽다)
export function writeSfxCatalog(rootDir, cat) {
  const keys = Object.keys(cat), lines = ['{'];
  keys.forEach((k, i) => {
    const v = cat[k], end = i < keys.length - 1 ? ',' : '';
    if (k === 'files' || k === 'vocab') {
      const ks = k === 'files' ? Object.keys(v).sort() : Object.keys(v);
      lines.push(`  ${JSON.stringify(k)}: {`);
      if (ks.length) lines.push(ks.map(x => `    ${JSON.stringify(x)}: ${JSON.stringify(v[x])}`).join(',\n'));
      lines.push(`  }${end}`);
    } else lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)}${end}`);
  });
  lines.push('}');
  writeFileSync(catalogPath(rootDir), lines.join('\n') + '\n');
}
