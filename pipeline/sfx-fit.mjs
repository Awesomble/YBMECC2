#!/usr/bin/env node
// 효과음이 화면 상황에 맞게 들어갔는가 — 후보 찾기 · 동기점으로 at 채우기 · 배치 진단 (2026-09-26)
//
//   node pipeline/sfx-fit.mjs --find <상황 단어…> [--all]   상황 → 후보. 기본은 새 영상에 쓸 수 있는 파일만(--all: 중단 파일 포함)
//   node pipeline/sfx-fit.mjs <p>                          큐 진단 — 재질·사물 불일치 · 동기점 · 대사 위 음성 대역 · 0.15초 인접
//   node pipeline/sfx-fit.mjs <p> --apply                  event(화면 사건 표시 초)가 있는 큐의 at 을 event − 파일 안 동기점으로 채운다
//   node pipeline/sfx-fit.mjs --catalog [--write]          pick/ ↔ catalog.json ↔ CREDITS 대조 + 라이선스 근거 등급 집계 · --write 는 measured 를 다시 잰다
//   … [--json]
//
// 왜: 큐 이름은 「동전」「그릇」「테이프」인데 파일은 카드·팝으로 대체되는 일이 반복됐고, 파일 안 타격 지점을
//     따로 재지 않아 라이저·휘익이 사건보다 늦게 들렸다. 목록(resources/sfx/catalog.json)의 태그·동기점으로 고른다.
// ⚠️ 진단은 전부 안내다 — 개수·빈도 상한을 두지 않는다. 권리 문제(신규 사용 중단 파일 · 새 편의 근거 미확인 파일)만 실패로 센다.
//    근거 등급(lib/sfx-tracks.mjs sfxLicenseGrade): verified(legal/ 저장본·Kenney License.txt) · url-only(출처만) · unverified(자기 주장·불명).
//    --find 는 unverified 에 ⛔ · url-only 에 △, --catalog 는 「쓸 수 있는데(retired 아님) unverified」를 실패로 센다 (2026-10-21)
//    중단(retired)은 이유를 가른다 — rights(권리, 필드 없음 포함): retired_allow 밖이면 실패 · long(길게 울리는 저음): 새 편만 실패, 그 전 번호는 경고
//    measured 는 신호 측정이며 청취를 대신하지 않는다. 들어서 타격 지점이 다르면 catalog 의 그 파일에 sync 를 적는다.
import {existsSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {resolveProject, ROOT} from './lib/project.mjs';
import {findSfx, loadSfxCatalog, measureSfx, sfxEntry, sfxSync, wantedTags, writeSfxCatalog} from './lib/sfx-catalog.mjs';
import {SFX_LICENSE_ENFORCE_FROM, SFX_LICENSE_RULE, SFX_LONG_RETIRED, sfxLicenseEnforced, sfxLicenseError, sfxLicenseGrade, sfxRetiredReason} from './lib/sfx-tracks.mjs';

const argv = process.argv.slice(2), has = f => argv.includes(f), JSON_OUT = has('--json');
const cat = loadSfxCatalog(ROOT);
const r3 = x => Math.round(x * 1000) / 1000;
const fmt = x => Number.isFinite(x) ? x.toFixed(2) : '  - ';
const credits = readFileSync(path.join(ROOT, 'resources/sfx/CREDITS.md'), 'utf8').split('\n');
const grade = file => sfxLicenseGrade(ROOT, file, {credits, catalog: cat});
const NEW_FROM = String(SFX_LICENSE_ENFORCE_FROM).padStart(5, '0');

// ── 상황 → 후보 ──────────────────────────────────────────────────────
if (has('--find')) {
  const words = argv.filter(a => !a.startsWith('--'));
  if (!words.length) { console.error('사용: node pipeline/sfx-fit.mjs --find <상황 단어…>  예) --find coin drop · --find bowl land · --find camera'); process.exit(2); }
  const rows = findSfx(cat, words, {includeRetired: has('--all')}).slice(0, 15);
  if (JSON_OUT) { console.log(JSON.stringify(rows.map(({file, tier, tags, hit, retired}) => ({file, tier, tags, hit, retired, license: grade(file).grade, sync: sfxSync(sfxEntry(cat, file))})), null, 2)); process.exit(0); }
  console.log(`\n  「${words.join(' ')}」 후보 — ${has('--all') ? '중단 파일 포함' : '새 영상에 쓸 수 있는 파일만'} · 동기점은 파일 안 초(sync 없으면 측정 추정)\n`);
  console.log('  파일                          길이   동기점  음성대역  맞은 태그          전체 태그');
  const why = e => [e.retired && `중단·${sfxRetiredReason(cat, e.file) === 'long' ? '긴 저음' : '권리'}${e.replace?.length ? ` → ${e.replace.join('/')}` : ''}`,
    grade(e.file).grade !== 'verified' && `근거 ${grade(e.file).grade}`].filter(Boolean).join(' · ');
  const mark = e => e.retired ? (sfxRetiredReason(cat, e.file) === 'long' ? '⛔긴저음 ' : '⛔ ') : grade(e.file).grade === 'unverified' ? '⛔ ' : grade(e.file).grade === 'url-only' ? '△ ' : '';
  for (const e of rows) console.log(`  ${mark(e) + e.file.padEnd(mark(e) ? 27 : 30)}${fmt(e.measured.dur).padStart(5)}  ${fmt(sfxSync(e)).padStart(6)}   ${fmt(e.measured.voice_band).padStart(5)}   ${e.hit.join(',').padEnd(17)} ${e.tags.join(',')}${why(e) ? `   [${why(e)}]` : ''}`);
  if (!rows.length) console.log('  없음 — 다른 단어로 찾거나, 알맞은 CC0 원본을 반입한다(README ④ 새 사용본 규칙)');
  if (rows.some(e => mark(e))) console.log(`\n  ⛔ 중단(권리·긴 저음) 또는 라이선스 근거 미확인(unverified) — ${NEW_FROM}번부터 새 편은 조립 실패 · △ 출처만 있고 legal/ 저장본 없음(경고)`);
  console.log('');
  process.exit(0);
}

// ── 목록 대조 ────────────────────────────────────────────────────────
if (has('--catalog')) {
  const pick = readdirSync(path.join(ROOT, 'resources/sfx/pick')).filter(f => f.endsWith('.wav')).sort();
  const noEntry = pick.filter(f => !cat.files[f]), noFile = Object.keys(cat.files).filter(f => !pick.includes(f));
  const noCredit = pick.filter(f => !credits.some(l => l.startsWith(`| \`pick/${f}\` |`)));
  const noTags = Object.keys(cat.files).filter(f => cat.files[f] && !sfxEntry(cat, f).tags.filter(t => t !== 'vc').length);
  const noTier = Object.keys(cat.files).filter(f => cat.files[f] && !sfxEntry(cat, f).tier);
  const noReplace = Object.keys(cat.files).filter(f => cat.files[f].retired && !(cat.files[f].replace || []).some(r => cat.files[r] && !sfxEntry(cat, r).retired));
  if (has('--write')) { for (const f of pick.filter(f => cat.files[f])) cat.files[f].measured = measureSfx(path.join(ROOT, 'resources/sfx/pick', f)); writeSfxCatalog(ROOT, cat); }
  // 라이선스 근거 등급 — 쓸 수 있는(retired 아님) 파일이 unverified 면 실패. 이미 중단된 unverified 는 옛 편 전용이라 집계만
  const grades = pick.filter(f => !noCredit.includes(f)).map(f => ({f, g: grade(f), retired: sfxEntry(cat, f)?.retired}));
  const gradeOf = k => grades.filter(x => x.g.grade === k);
  const liveUnverified = gradeOf('unverified').filter(x => !x.retired).map(x => `${x.f}(${x.g.kind})`);
  const bad = [['catalog 항목 없음', noEntry], ['파일 없음', noFile], ['CREDITS 행 없음', noCredit], ['태그 없음', noTags], ['등급 없음(부모 없음)', noTier], ['중단 파일인데 쓸 수 있는 대체 후보 없음', noReplace],
    ['라이선스 근거 미확인(unverified)인데 신규 사용 가능 — legal/ 에 근거를 보존하거나 catalog retired', liveUnverified]];
  for (const [k, v] of bad) console.log(`${v.length ? '✗' : '✓'} ${k}: ${v.length ? v.join(', ') : '0'}`);
  const urlOnly = gradeOf('url-only');
  if (urlOnly.length) console.log(`⚠ 출처만 있고 legal/ 저장본 없음(url-only): ${urlOnly.map(x => x.f).join(', ')} — ${SFX_LICENSE_RULE}`);
  const kinds = gradeOf('verified').reduce((m, x) => (m[x.g.kind] = (m[x.g.kind] || 0) + 1, m), {});
  console.log(`  라이선스 근거 — verified ${gradeOf('verified').length}(${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(' · ')}) · url-only ${urlOnly.length} · unverified ${gradeOf('unverified').length}(중단 ${gradeOf('unverified').filter(x => x.retired).length} — ${NEW_FROM}번 전 편만)`);
  const retiredBy = r => Object.keys(cat.files).filter(f => sfxRetiredReason(cat, f) === r).length;
  console.log(`  pick ${pick.length} · catalog ${Object.keys(cat.files).length} · 신규 사용 중단 ${Object.keys(cat.files).filter(f => sfxEntry(cat, f).retired).length}(권리 ${retiredBy('rights')} · 긴 저음 ${retiredBy('long')})${has('--write') ? ' · measured 갱신' : ''}`);
  process.exit(bad.some(([, v]) => v.length) ? 1 : 0);
}

// ── 프로젝트 큐 진단 / 적용 ──────────────────────────────────────────
const {dir, name} = resolveProject(argv.find(a => !a.startsWith('--')), {usage: '사용: node pipeline/sfx-fit.mjs <p> [--apply] [--json] · --find <단어…> · --catalog [--write]'});
const metaFile = path.join(dir, 'hyperframes/audio_meta.json');
if (!existsSync(metaFile)) { console.error('✗ hyperframes/audio_meta.json 이 없다 — hf-audio 먼저'); process.exit(2); }
const raw = readFileSync(metaFile, 'utf8'), meta = JSON.parse(raw), cues = meta.sfx ?? [];
if (!cues.length) { console.log('효과음 큐 없음'); process.exit(0); }

if (has('--apply')) {
  let changed = 0, failed = 0;
  for (const c of cues) {
    if (!Number.isFinite(c.event)) continue;
    const e = sfxEntry(cat, c.file);
    if (!e) { console.error(`✗ ${c.id}: catalog 에 ${c.file} 이 없다`); failed++; continue; }
    const at = r3(c.event - sfxSync(e));
    if (at < 0) { console.error(`✗ ${c.id}: ${c.file} 의 동기점(${sfxSync(e).toFixed(2)}초)이 사건(${c.event}초)보다 길다 — 짧은 후보를 고르거나 파생본을 만든다`); failed++; continue; }
    if (c.at !== at) { c.at = at; changed++; }
  }
  const indent = raw.match(/^\{\n( +)"/)?.[1].length ?? 1;
  if (changed) writeFileSync(metaFile, JSON.stringify(meta, null, indent) + '\n');
  console.log(`${changed}큐의 at 을 event − 동기점으로 갱신${failed ? ` · 실패 ${failed}` : ''}${changed ? ` → node pipeline/hf-project.mjs ${name} sync` : ''}`);
  process.exit(failed ? 1 : 0);
}

// 대사 구간 — output/narration.wav 의 10ms 창(말소리 중앙값 −10dB 초과). 없으면 겹침 진단을 건너뛴다
const narration = path.join(dir, 'output/narration.wav');
let speech = null;
if (existsSync(narration)) {
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', narration, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], {maxBuffer: 1 << 30});
  if (r.status === 0) {
    const x = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength / 4), w = 160, fr = [];
    for (let s = 0; s + w <= x.length; s += w) { let e = 0; for (let i = s; i < s + w; i++) e += x[i] * x[i]; fr.push(10 * Math.log10(e / w + 1e-12)); }
    const voiced = fr.filter(v => v > -45).sort((a, b) => a - b), med = voiced.length ? voiced[voiced.length >> 1] : -20;
    speech = fr.map(v => v > med - 10);
  }
}
const speechIn = (a, b) => { if (!speech) return 0; let n = 0; for (let i = Math.max(0, Math.floor(a * 100)); i < Math.min(speech.length, Math.ceil(b * 100)); i++) n += speech[i]; return n / 100; };

const rows = cues.map(c => {
  const e = sfxEntry(cat, c.file), notes = [];
  if (!e) return {id: c.id, file: c.file, notes: ['✗ catalog 에 없는 파일 — CREDITS·catalog 에 함께 올린다'], error: true};
  const sync = sfxSync(e), at = Number.isFinite(c.at) ? c.at : Number.isFinite(c.event) ? c.event - sync : NaN, heard = at + sync;
  let error = false;
  const lic = sfxLicenseError(ROOT, c.file, dir, {credits, catalog: cat}), g = grade(c.file);
  if (lic) { notes.push(`✗ ${lic}`); error = true; }
  else if (sfxRetiredReason(cat, c.file) === 'long') notes.push(`${SFX_LONG_RETIRED} → ${(e.replace || []).join(', ') || '--find'} · ${NEW_FROM}번 전 편이라 경고, 새 편이면 실패`);
  else if (g.grade !== 'verified') notes.push(`라이선스 근거 ${g.grade}(${g.kind}) — ${g.reason}${g.grade === 'unverified' && !sfxLicenseEnforced(dir) ? ` · ${NEW_FROM}번 전 편이라 경고, 새 편이면 실패` : ''}`);
  if (Number.isFinite(c.event) && Number.isFinite(c.at) && Math.abs(c.at + sync - c.event) > 1 / 60)
    notes.push(`동기 어긋남 — 들리는 초 ${heard.toFixed(2)} ≠ event ${c.event} → --apply`);
  if (!Number.isFinite(c.event) && sync > 0.15)
    notes.push(`파일 안 동기점 ${sync.toFixed(2)}초 — at 에 사건 시각을 적었다면 그만큼 늦게 들린다. event 로 적고 --apply`);
  if (at < 0) notes.push(`at ${at.toFixed(2)} — 파일 안 동기점(${sync.toFixed(2)}초)이 사건보다 길다. 짧은 후보를 고른다`);
  // 큐 이름의 재질·사물과 파일 태그 — 재질 단어(coin·bowl·door…)는 하나라도 어긋나면, 동작 단어(land·pass…)는 전부 어긋날 때만
  const want = [...wantedTags(cat, c.id)], tags = new Set(e.tags), MAT = new Set(cat.materials || []);
  const hits = ts => ts.some(t => tags.has(t)), mat = want.filter(([, ts]) => ts.some(t => MAT.has(t)));
  const miss = mat.length ? mat.filter(([, ts]) => !hits(ts)) : want.every(([, ts]) => !hits(ts)) ? want : [];
  if (miss.length) {
    const alt = findSfx(cat, [...miss.map(([w]) => w), ...want.filter(x => !mat.includes(x)).map(([w]) => w)]).filter(x => x.file !== c.file).slice(0, 3).map(x => x.file);
    notes.push(`「${miss.map(([w]) => w).join('·')}」 ↔ 파일 태그 ${e.tags.filter(t => t !== 'vc').join(',')}${alt.length ? ` — 후보 ${alt.join(', ')}` : ' — 맞는 후보 없음(반입 검토)'}`);
  }
  // 대사 위 음성 대역 — 자음(1~4kHz)을 가릴 수 있다
  const m = e.measured, over = Number.isFinite(at) ? speechIn(at + (m.onset ?? 0), at + (m.end40 ?? m.dur ?? 0)) : 0;
  if (over >= 0.08 && (m.voice_band ?? 0) >= 0.2) {
    const vc = c.file.replace(/\.wav$/, '-vc.wav');
    notes.push(`대사와 ${over.toFixed(2)}초 겹침 · 음성 대역 ${m.voice_band} — 시각을 옮기거나 ${cat.files[vc] ? vc : '음성 대역이 적은 후보'}`);
  }
  return {id: c.id, file: c.file, at: r3(at), event: c.event, heard: r3(heard), sync: r3(sync), notes, error};
});
// 0.15초 안에 붙은 두 사건은 소리 하나로 묶는다(README ②)
const order = rows.filter(r => Number.isFinite(r.heard)).sort((a, b) => a.heard - b.heard);
for (let i = 1; i < order.length; i++) if (order[i].heard - order[i - 1].heard < 0.15) order[i].notes.push(`${order[i - 1].id} 와 ${(order[i].heard - order[i - 1].heard).toFixed(2)}초 — 하나로 묶기 검토`);

const errors = rows.filter(r => r.error).length, flagged = rows.filter(r => r.notes.length);
if (JSON_OUT) console.log(JSON.stringify({project: name, speech: Boolean(speech), rows}, null, 2));
else {
  console.log(`\n  효과음 배치 진단 — ${name} · ${cues.length}큐 · 대사 구간 ${speech ? 'output/narration.wav' : '없음(겹침 진단 생략)'} · 안내이며 청취를 대신하지 않는다\n`);
  for (const r of order.concat(rows.filter(r => !Number.isFinite(r.heard)))) if (r.notes.length)
    console.log(`  ${fmt(r.heard).padStart(6)}  ${r.id.padEnd(24)} ${r.file}\n${r.notes.map(n => `          · ${n}`).join('\n')}`);
  console.log(`\n  안내 ${flagged.length}큐 · 권리 실패 ${errors} · 문제없음 ${cues.length - flagged.length}   (찾기: node pipeline/sfx-fit.mjs --find <상황 단어>)\n`);
}
process.exit(errors ? 1 : 0);
