// Render-ready SFX cues from the existing audio_meta.json. Only curated CC0 pick/ files are accepted.
import {copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileHash} from './workflow-state.mjs';
import {loadSfxCatalog, projectId, sfxEntry, sfxLicenseProblem, SFX_LICENSE_ENFORCE_FROM} from './sfx-catalog.mjs';
export {SFX_LICENSE_ENFORCE_FROM};

const durationCache = new Map();
const audioDuration = file => {
  if (!durationCache.has(file)) {
    const value = Number(execFileSync('ffprobe', ['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',file], {encoding:'utf8'}).trim());
    if (!Number.isFinite(value) || value <= 0) throw new Error(`효과음 길이를 읽을 수 없다: ${file}`);
    durationCache.set(file, value);
  }
  return durationCache.get(file);
};

// ── 라이선스 근거 등급 (2026-10-21 사용자 「저작권도 강화 — 자유롭게 만들되 저작권에 위배 안 되게」) ──
// verified   CC0 를 저장소 안 증빙으로 다시 볼 수 있다: Freesound 원 페이지 저장본(legal/**/freesound/ 의 fs-<id>·<이름>-<id>·<id> .html/.txt,
//            본문에 publicdomain/zero) · Kenney 팩 resources/sfx/kenney/<팩>/License.txt(CC0 원문) · OpenGameArt 저장 페이지(legal/**/opengameart/)
//            · ABMEN 자체 합성(외부 원본 없음, ffmpeg 레시피를 CREDITS 에 기록)
// url-only   원 출처(Freesound ID·URL, Kenney 팩)는 적혔으나 증빙 저장본이 없다 — 경고: 페이지를 legal/ 에 보존하면 verified
// unverified 사이트 자기 주장(VideoEditingSFX, MixClap 단독)·출처 불명 — SFX_LICENSE_ENFORCE_FROM 번부터 새 편은 조립 실패, 그 전 편은 경고
// CREDITS 출처 칸이 Freesound 를 쓰는 세 형태: [..](https://freesound.org/s/<id>/) · 「← Freesound <id>」 · 「Freesound · CC0 — <id> …」
// 판정은 throw 하지 않는다 — 다른 편이 렌더 중일 수 있다. 규칙의 정본은 resources/sfx/README.md ④ 「자동 제작 등록」.
// SFX_LICENSE_ENFORCE_FROM(2 · 2026-10-21 이식 시행 — ABMEN 128)은 lib/sfx-catalog.mjs 한 곳에 둔다 — 취향 중단(long)과 같은 번호
export const SFX_LICENSE_RULE = 'resources/sfx/README.md ④ 등록 조건(원 페이지 CC0 확인 + 페이지를 legal/ 에 보존)';
export const sfxLicenseEnforced = projectDir => Number(projectId(projectDir || '')) >= SFX_LICENSE_ENFORCE_FROM;

const CC0_PAGE = /publicdomain\/zero|Creative Commons 0\b|Creative Commons Zero/i;
const textCache = new Map();
const fileText = f => { if (!textCache.has(f)) { try { textCache.set(f, readFileSync(f, 'utf8')); } catch { textCache.set(f, ''); } } return textCache.get(f); };
const legalCache = new Map();
function legalIndex(rootDir) {
  if (legalCache.has(rootDir)) return legalCache.get(rootDir);
  const idx = {freesound: new Map(), oga: []};
  try {
    for (const rel of readdirSync(path.join(rootDir, 'legal'), {recursive: true})) {
      const parts = String(rel).split(path.sep), base = parts.at(-1);
      if (!/\.(html?|txt)$/i.test(base)) continue;
      if (parts.includes('freesound')) {
        const id = base.match(/(?:^|\D)(\d{4,})\.(?:html?|txt)$/i)?.[1];
        if (id) idx.freesound.set(id, [...(idx.freesound.get(id) || []), String(rel)]);
      } else if (parts.includes('opengameart')) idx.oga.push(String(rel));
    }
  } catch { /* legal/ 이 없으면 저장본 0 — 전부 url-only/unverified 로 내려간다 */ }
  legalCache.set(rootDir, idx);
  return idx;
}
const creditRow = (rows, file) => rows.find(line => line.startsWith(`| \`pick/${file}\` |`));

// 신규 사용 중단의 이유 — catalog files[].retired_reason: "rights"(권리 · 필드 없음도 rights) | "long"(길게 울리는 저음 — 취향, 2026-10-21 사용자).
// 파생본(-loud·-vc)은 retired 를 적은 조상 항목의 이유를 물려받는다(sfxEntry 가 retired 를 물려주는 것과 같은 체인). 중단이 아니면 null
export const SFX_LONG_RETIRED = '길게 울리는 저음 큐 — replace의 짧은 대체로 바꾼다(2026-10-21 사용자)';
export function sfxRetiredReason(cat, file) {
  for (let f = file, n = 0; f && n < 9; n++) {
    const x = cat?.files?.[f];
    if (!x) return null;
    if (x.retired !== undefined) return x.retired ? (x.retired_reason === 'long' ? 'long' : 'rights') : null;
    f = x.parent;
  }
  return null;
}
const replaceOf = (cat, file) => sfxEntry(cat, file)?.replace || [];

export function sfxLicenseGrade(rootDir, file, {credits, catalog, depth = 0} = {}) {
  try {
    const rows = credits ?? readFileSync(path.join(rootDir, 'resources/sfx/CREDITS.md'), 'utf8').split('\n');
    const row = creditRow(rows, file), src = row?.split('|')[3] || '';
    if (!row) return {grade: 'unverified', kind: 'missing', reason: 'resources/sfx/CREDITS.md 에 행이 없다'};
    if (/VideoEditingSFX|videoeditingsfx\.com/i.test(src)) return {grade: 'unverified', kind: 'site-claim', reason: 'VideoEditingSFX — CC0 가 사이트 자기 주장뿐(2026-09-26 검수)'};
    const fsId = src.match(/freesound\.org\/(?:s|people\/[^/\s)]+\/sounds)\/(\d+)/i)?.[1]
      || src.match(/Freesound\s*(?:·\s*CC0\s*[—–-]\s*)?\[?(\d{4,})/i)?.[1];
    const via = /MixClap/i.test(src) ? 'mixclap' : undefined;
    if (fsId) {
      const hits = legalIndex(rootDir).freesound.get(fsId) || [];
      const proof = hits.find(rel => CC0_PAGE.test(fileText(path.join(rootDir, 'legal', rel))));
      if (proof) return {grade: 'verified', kind: 'freesound', id: fsId, via, evidence: `legal/${proof}`};
      return {grade: 'url-only', kind: 'freesound', id: fsId, via, reason: hits.length
        ? `legal/${hits[0]} 에 CC0 표식(publicdomain/zero)이 없다`
        : `Freesound ${fsId} 원 페이지 저장본이 legal/ 에 없다 — legal/sfx-<날짜>/freesound/fs-${fsId}.html 로 보존`};
    }
    const pack = src.match(/Kenney\s*·\s*CC0\s*[—–-]\s*([a-z][a-z-]*[a-z])/i)?.[1];
    if (pack) {
      const lic = `resources/sfx/kenney/${pack}/License.txt`;
      return CC0_PAGE.test(fileText(path.join(rootDir, lic))) ? {grade: 'verified', kind: 'kenney', pack, evidence: lic}
        : {grade: 'url-only', kind: 'kenney', pack, reason: `${lic} 가 없거나 CC0 원문이 아니다 — 공식 ZIP 의 License.txt 를 보존`};
    }
    const oga = src.match(/opengameart\.org\/content\/([a-z0-9-]+)/i)?.[1]?.toLowerCase();
    if (oga) {
      const hits = legalIndex(rootDir).oga.filter(rel => path.basename(rel).toLowerCase().includes(oga));
      const proof = hits.find(rel => CC0_PAGE.test(fileText(path.join(rootDir, 'legal', rel))));
      return proof ? {grade: 'verified', kind: 'opengameart', id: oga, evidence: `legal/${proof}`}
        : {grade: 'url-only', kind: 'opengameart', id: oga, reason: `OpenGameArt ${oga} 페이지 저장본(CC0 표식)이 legal/**/opengameart/ 에 없다`};
    }
    if (/자체\s*(?:합성|저작물)/.test(src) && /aevalsrc|ffmpeg|sox\b/i.test(src)) return {grade: 'verified', kind: 'self', reason: 'ABMEN 자체 합성 — 외부 원본 없음·레시피 기록'};
    // 출처를 생략한 파생본은 부모 행으로 판정한다 — CREDITS 「파생: `pick/<부모>`」, 없으면 catalog.parent
    const parent = src.match(/파생:\s*`pick\/([^`]+\.wav)`/)?.[1] || catalog?.files?.[file]?.parent;
    if (parent && parent !== file && depth < 8) {
      const g = sfxLicenseGrade(rootDir, parent, {credits: rows, catalog, depth: depth + 1});
      return {...g, reason: `부모 ${parent} 행으로 판정${g.reason ? ' — ' + g.reason : ''}`};
    }
    if (via) return {grade: 'unverified', kind: 'site-claim', via, reason: 'MixClap 표기뿐 — Freesound 원 업로더 페이지로 역추적하지 않았다'};
    return {grade: 'unverified', kind: 'unknown', reason: '출처 칸에서 원 출처(Freesound ID·Kenney 팩·OpenGameArt·자체 합성)를 찾지 못했다'};
  } catch (e) {
    return {grade: 'unverified', kind: 'unknown', reason: `판정 실패: ${e.message}`};
  }
}

// 효과음 파일 하나가 조립 가능한가 — CREDITS 의 파일별 CC0 행 + catalog 등급(신규 사용 중단 여부) + 근거 등급(새 편은 verified 만).
// 숏츠 root(resolveSfxCues)와 롱폼 보강 효과음(hf-bundle chapters[].sfx)이 같은 검사를 지난다 (2026-09-26 저작권 검수 · 2026-10-21 근거 등급)
export function sfxLicenseError(rootDir, file, projectDir, {credits, catalog}={}) {
  if (!/^[a-z0-9][a-z0-9.-]*\.wav$/i.test(file || '')) return 'pick/ 효과음 파일명을 확인한다';
  const rows = credits ?? readFileSync(path.join(rootDir,'resources/sfx/CREDITS.md'),'utf8').split('\n');
  const credit = creditRow(rows, file);
  if (!credit || !/\bCC0\b/.test(credit.split('|')[3] || '')) return 'resources/sfx/CREDITS.md 의 파일별 CC0 근거가 없다';
  const cat = catalog ?? loadSfxCatalog(rootDir);
  // 「long」 중단은 권리 문제가 아니다 — 새 편에서만 실패, 그 전 번호(납품·재렌더)는 resolveSfxCues 가 큐에 retired:'long' 을 달아 경고로 돌린다
  if (sfxRetiredReason(cat, file) === 'long') {
    if (sfxLicenseEnforced(projectDir)) return `${file}: ${SFX_LONG_RETIRED} → ${replaceOf(cat, file).join(', ') || 'node pipeline/sfx-fit.mjs --find <상황>'}`;
  } else {
    const problem = sfxLicenseProblem(cat, file, projectDir);
    if (problem) return problem.replace(/ 은 true 부터 /, ' 은 ');   // retired: true 로 적은 항목의 날짜 자리
  }
  const g = sfxLicenseGrade(rootDir, file, {credits: rows, catalog: cat});
  if (g.grade === 'unverified' && sfxLicenseEnforced(projectDir))
    return `${file} 라이선스 근거 unverified(${g.kind}) — ${g.reason}. ${String(SFX_LICENSE_ENFORCE_FROM).padStart(5, '0')}번부터 새 편은 verified 효과음만 조립한다 · ${SFX_LICENSE_RULE}`;
  return null;
}

export function resolveSfxCues(projectDir, meta, total, rootDir, {copyMissing=false}={}) {
  const rows = meta?.sfx ?? [];
  if (!Array.isArray(rows)) throw new Error('audio_meta.sfx 는 배열이어야 한다');
  const credits = readFileSync(path.join(rootDir,'resources/sfx/CREDITS.md'),'utf8').split('\n');
  const catalog = rows.length ? loadSfxCatalog(rootDir) : null;
  // 새 편은 근거 미확인 파일을 큐 전부에서 모아 한 번에 알린다 — 한 건씩 고치고 다시 돌리는 반복을 막는다
  if (sfxLicenseEnforced(projectDir)) {
    const bad = [...new Set(rows.map(c => c?.file).filter(Boolean))]
      .map(f => ({f, g: sfxLicenseGrade(rootDir, f, {credits, catalog})})).filter(x => x.g.grade === 'unverified' && x.g.kind !== 'missing');
    if (bad.length) throw new Error(`근거 미확인(unverified) 효과음 ${bad.length}개 — ${bad.map(({f, g}) => {
      const alt = (catalog && sfxEntry(catalog, f)?.replace) || [];
      return `${f}(${g.kind}${alt.length ? ` → 대체 ${alt.join('/')}` : ''})`;
    }).join(', ')}. ${String(SFX_LICENSE_ENFORCE_FROM).padStart(5, '0')}번부터 새 편은 verified 만 조립한다 — node pipeline/sfx-fit.mjs --find <상황> 의 ⛔ 없는 후보로 바꾸거나 근거를 갖춘다 · ${SFX_LICENSE_RULE}`);
  }
  const ids = new Set();
  return rows.map((cue,i) => {
    const {id,file,at,volume=0.25} = cue || {};
    if (!/^[a-z0-9][a-z0-9-]{0,49}$/.test(id || '') || ids.has(id)) throw new Error(`SFX id가 없거나 중복이다: ${id}`);
    ids.add(id);
    const licenseError = sfxLicenseError(rootDir, file, projectDir, {credits, catalog});
    if (licenseError) throw new Error(`${id}: ${licenseError}`);
    if (at === undefined && Number.isFinite(cue.event)) throw new Error(`${id}: event만 있다 — node pipeline/sfx-fit.mjs <p> --apply 로 at(= event − 파일 안 동기점)을 채운다`);
    if (!Number.isFinite(at) || at < 0 || at >= total) throw new Error(`${id}: at은 영상 안의 표시 초여야 한다`);
    if (!Number.isFinite(volume) || volume <= 0 || volume > 1) throw new Error(`${id}: volume은 0 초과 1 이하여야 한다`);
    const source = path.join(rootDir,'resources/sfx/pick',file);
    const rel = `assets/sfx/${file}`;
    const target = path.join(projectDir,'hyperframes',rel);
    if (!existsSync(source)) throw new Error(`${id}: 원본 효과음이 없다: ${source}`);
    if (!existsSync(target) && copyMissing) { mkdirSync(path.dirname(target),{recursive:true}); copyFileSync(source,target); }
    if (!existsSync(target) || fileHash(source) !== fileHash(target)) throw new Error(`${id}: 프로젝트 효과음이 없거나 원본과 다르다: ${rel}`);
    const duration = Math.min(audioDuration(source), total-at);
    if (duration < 0.01) throw new Error(`${id}: 남은 영상 길이가 너무 짧다`);
    const {grade, kind, reason} = sfxLicenseGrade(rootDir, file, {credits, catalog});
    const retired = sfxRetiredReason(catalog, file) === 'long' ? 'long' : undefined;   // 옛 편에서 허용된 긴 저음 — 게이트가 경고한다
    return {id,file,at,duration,volume,track:20+i,src:rel,license:{grade,kind,reason},...(retired ? {retired, replace: replaceOf(catalog, file)} : {})};
  });
}

export const sfxTrackTags = cues => cues.map(c =>
  `    <audio id="el-sfx-${c.id}" src="${c.src}" data-start="${c.at.toFixed(6)}" data-duration="${c.duration.toFixed(6)}" data-volume="${c.volume}" data-track-index="${c.track}"></audio>`
);
