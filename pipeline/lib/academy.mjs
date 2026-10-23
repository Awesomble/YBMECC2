// 학원 광고 규칙 (YBMECC 2026-10-20) — 지점 사실·금지 표현·법정 표시·원생 사진 동의를 한곳에서 잰다.
//   지점 사실 정본: pipeline/templates/brand.json `academy` · 표현 규칙 정본: pipeline/lib/platforms.json `academy_ad`
//   쓰는 곳: academy-check.mjs(단독) · stage-gate.mjs(단계별) · publish-check.mjs(문안) · photo-intake.mjs(사진 동의 장부)
//   근거: docs/channel/02-platform-rules.md §1(학원법·공교육정상화법·표시광고법·개인정보 보호법)
//
// 🔴 이 검사는 법률 판단이 아니다. 「법이 요구하는 글자가 있는가 · 법이 막는 말이 있는가 · 동의 없는 아이 사진이 있는가」만 센다.
//    해석이 갈리는 것(영상이 「인터넷 광고」인지, 교습비를 캡션에만 둬도 되는지, 「영어유치부」)은 경고로 남기고 원장·교육지원청 확인을 README에 적는다.
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';
import {BRAND} from './brand.mjs';

const SPECS = JSON.parse(readFileSync(new URL('./platforms.json', import.meta.url), 'utf8'));
export const ACADEMY = BRAND.academy ?? null;
export const AD_RULES = SPECS.academy_ad ?? {hard: [], soft: []};
// 기본 게시처(brand.json platforms) — 목록 밖 플랫폼 절은 있으면 재고 없으면 요구하지 않는다
export const ACTIVE_PLATFORMS = Array.isArray(BRAND.platforms) ? BRAND.platforms : null;
export const platformRequired = (key) => !ACTIVE_PLATFORMS || ACTIVE_PLATFORMS.includes(key);

// 확인 전 값 — null·빈 문자열·「확인 필요」
const blank = (v) => v == null || (typeof v === 'string' && (!v.trim() || /확인\s*필요/.test(v)));

/** brand.json academy 에서 아직 원장 확인을 받지 못한 항목 */
export function unconfirmedFacts(a = ACADEMY) {
  if (!a) return [];
  const miss = ['legalName', 'registration', 'courses'].filter((k) => blank(a[k]));
  for (const [k, v] of Object.entries(a.tuition ?? {})) if (blank(v)) miss.push(`tuition.${k}`);
  return miss;
}

/** HTML 에서 사람이 읽는 글자만 — 스크립트·스타일·주석·태그를 뺀다 */
export function visibleText(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t\r\f\v]+/g, ' ');
}

/** 금지(hard)·주의(soft) 표현 — [{level, label, note, match:[…], where}] */
export function adPhraseHits(text, where = '') {
  const out = [];
  for (const level of ['hard', 'soft'])
    for (const r of AD_RULES[level] ?? []) {
      const found = [...String(text).matchAll(new RegExp(r.pattern, 'gu'))].map((m) => m[0].trim()).filter(Boolean);
      if (found.length) out.push({level, label: r.label, note: r.note ?? '', match: [...new Set(found)].slice(0, 3), where});
    }
  return out;
}

/** cuts.json 의 화면·음성 글자(헤드라인·대사·자막·대화) — concept 는 내부 설명이라 뺀다 */
export function scriptText(cuts) {
  return (cuts?.cuts ?? []).flatMap((c) => [c.headline, c.say, c.text, ...(c.dialogue ?? []).map((d) => d.say)])
    .filter((s) => typeof s === 'string' && s.trim()).join('\n');
}

const SKIP_DIRS = new Set(['assets', 'fonts', 'node_modules', 'snapshots', 'renders', '.media', '.thumbnails', '.waveform-cache', '.transcode-cache']);
function htmlFiles(root) {
  if (!existsSync(root)) return [];
  const out = [];
  for (const e of readdirSync(root, {withFileTypes: true})) {
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
    const p = path.join(root, e.name);
    if (e.isDirectory()) out.push(...htmlFiles(p));
    else if (/\.html$/i.test(e.name)) out.push(p);
  }
  return out;
}
/** 화면 소스(hyperframes·cards)의 HTML — [{file, raw, text}] */
export function sourceTexts(dir) {
  return [...htmlFiles(path.join(dir, 'hyperframes')), ...htmlFiles(path.join(dir, 'cards'))]
    .map((f) => { const raw = readFileSync(f, 'utf8'); return {file: path.relative(dir, f), raw, text: visibleText(raw)}; });
}

/** 법정 표시 중 빠진 것 — 화면은 상호·등록번호·교습과정, 문안(tuition:true)은 교습비 5항목까지 */
export function legalDisplayMissing(text, {tuition = false} = {}, a = ACADEMY) {
  if (!a) return [];
  const t = String(text).replace(/\s+/g, ' '), miss = [];
  if (blank(a.legalName)) miss.push('상호(brand.json academy.legalName 미확인)');
  else if (!t.includes(a.legalName)) miss.push(`상호 「${a.legalName}」`);
  if (blank(a.registration)) miss.push('등록번호(academy.registration 미확인)');
  else if (!new RegExp(a.registrationPattern || a.registration.replace(/\s+/g, '\\s*')).test(t)) miss.push(`학원 등록번호 「${a.registration}」`);
  if (blank(a.courses)) miss.push('교습과정(academy.courses 미확인)');
  else if (!t.includes(a.courses)) miss.push(`교습과정 「${a.courses}」`);
  if (tuition)
    for (const [k, v] of Object.entries(a.tuition ?? {})) {
      if (blank(v)) miss.push(`${k}(academy.tuition 미확인)`);
      else if (!t.includes(v)) miss.push(`${k} 「${v}」`);
    }
  return miss;
}

/* ── 원생 사진 동의 ──
   사진 = projects/<p>/assets/photos/·hyperframes/assets/photos/·cards/assets/photos/ 의 이미지 + 화면 소스가 부르는 photos/ 경로.
   장부 = 프로젝트 README `## 사진 동의` 표 — 「파일」 열과 「동의」가 든 열. 동의 칸이 ✅ 로 시작해야 쓴다.
   (사람이 없는 사진도 장부에 올리고 동의 칸에 「✅ 인물 없음」 — 한 장도 빠짐없이 센다) */
export const PHOTO_DIRS = ['assets/photos', 'hyperframes/assets/photos', 'cards/assets/photos'];
export const PHOTO_EXT = /\.(jpe?g|png|webp|heic|heif|avif|gif)$/i;
export function photoFiles(dir) {
  const names = new Set();
  for (const d of PHOTO_DIRS) {
    const p = path.join(dir, d);
    if (existsSync(p) && statSync(p).isDirectory())
      for (const f of readdirSync(p)) if (PHOTO_EXT.test(f) && !f.startsWith('.')) names.add(f);
  }
  for (const s of sourceTexts(dir))
    for (const m of s.raw.matchAll(/photos\/([^"'()\s?#]+\.(?:jpe?g|png|webp|avif|gif))/gi)) names.add(decodeURIComponent(m[1]).split('/').pop());
  return [...names].sort();
}
export function consentLedger(readme) {
  const sec = String(readme).split(/^## /m).find((s) => /^사진 동의/.test(s));
  const rows = new Map();
  if (!sec) return {found: false, rows};
  const lines = sec.split('\n').filter((l) => /^\s*\|/.test(l));
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const header = lines.length ? cells(lines[0]) : [];
  const fileCol = Math.max(0, header.findIndex((h) => /파일/.test(h)));
  const okCol = header.findIndex((h) => /동의/.test(h));
  for (const l of lines.slice(1)) {
    const c = cells(l);
    if (!c.length || /^:?-{2,}/.test(c[0])) continue;
    const file = c[fileCol]?.replace(/`/g, '').trim();
    if (file) rows.set(file, {ok: okCol >= 0 && /^✅/.test(c[okCol] ?? ''), cell: c[okCol] ?? ''});
  }
  return {found: true, rows};
}
export function photoConsent(dir) {
  const files = photoFiles(dir);
  const readme = existsSync(path.join(dir, 'README.md')) ? readFileSync(path.join(dir, 'README.md'), 'utf8') : '';
  const {found, rows} = consentLedger(readme);
  return {files, found, missing: files.filter((f) => !rows.has(f)), notOk: files.filter((f) => rows.has(f) && !rows.get(f).ok)};
}

/* ── publish.md — 플랫폼 절의 복붙 블록 ── */
export function publishBlocks(md) {
  const out = {};
  for (const sec of String(md).split(/^## /m).slice(1)) {
    const key = sec.split(/[\s—]/)[0].trim();
    out[key] = [...sec.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]).join('\n');
  }
  return out;
}

/** 단계별 판정 — [{level:'ok'|'soft'|'hard', msg, fix}] · stage 6(또는 전 단계)이 가장 엄하다 */
export function academyReport(dir, stage = 6) {
  const R = [], ok = (msg) => R.push({level: 'ok', msg}), soft = (msg, fix) => R.push({level: 'soft', msg, fix}), hard = (msg, fix) => R.push({level: 'hard', msg, fix});
  if (!ACADEMY) return R;
  const name = path.basename(dir);
  const phrase = (hits, label, fix) => {
    const h = hits.filter((x) => x.level === 'hard'), s = hits.filter((x) => x.level === 'soft');
    for (const x of h) hard(`${label} 금지 표현 — ${x.label}: 「${x.match.join('」「')}」${x.where ? ` (${x.where})` : ''}`, x.note || fix);
    for (const x of s) soft(`${label} 주의 표현 — ${x.label}: 「${x.match.join('」「')}」${x.where ? ` (${x.where})` : ''}`, x.note || 'README 확정 팩트에 근거가 없으면 지운다');
    if (!h.length && !s.length) ok(`${label} 금지·주의 표현 없음`);
  };

  // 지점 사실 — 문안(⑥) 전까지는 경고, ⑥에서 막는다
  const un = unconfirmedFacts();
  un.length ? (stage >= 6 ? hard : soft)(`지점 사실 미확인 ${un.length}개 — ${un.join(' · ')}`, '원장 확인 후 pipeline/templates/brand.json academy 에 적는다(학원법 제15조제3항·서울 학원 조례 시행규칙 제8조제2항)')
            : ok('지점 법정 표시 값(상호·등록번호·교습과정·교습비) 확인됨');

  // 대본(②~)
  let cuts = null;
  try { cuts = JSON.parse(readFileSync(path.join(dir, 'cuts.json'), 'utf8')); } catch {}
  if (cuts && stage >= 2) phrase(adPhraseHits(scriptText(cuts), 'cuts.json'), '대본', '대본을 고친다');

  // 원생 사진 동의 — 사진이 있으면 언제나 하드
  const pc = photoConsent(dir);
  if (pc.files.length) {
    !pc.found ? hard(`원생 사진 ${pc.files.length}장 — README 「## 사진 동의」 표가 없다`, `node pipeline/photo-intake.mjs ${name} 로 장부를 만들고 보호자 동의를 ✅ 로 적는다`)
      : pc.missing.length ? hard(`사진 동의 장부에 없는 사진 ${pc.missing.length}장 — ${pc.missing.slice(0, 6).join(' · ')}`, `node pipeline/photo-intake.mjs ${name} --check`)
      : pc.notOk.length ? hard(`보호자 동의(✅) 없는 사진 ${pc.notOk.length}장 — ${pc.notOk.slice(0, 6).join(' · ')}`, '동의서를 받기 전에는 화면에서 뺀다(개인정보 보호법 제22조의2)')
      : ok(`원생 사진 ${pc.files.length}장 모두 동의 ✅`);
  }

  // 화면 소스(④~) — 표현 + 법정 표시(⑤에서 막는다)
  if (stage >= 4) {
    const src = sourceTexts(dir);
    if (src.length) {
      phrase(src.flatMap((s) => adPhraseHits(s.text, s.file)), '화면 글자', '화면 글자를 고친다');
      const hf = src.filter((s) => s.file.startsWith('hyperframes')).map((s) => s.text).join('\n');
      if (hf.trim()) {
        const miss = legalDisplayMissing(hf);
        miss.length ? (stage >= 5 ? hard : soft)(`영상 화면 법정 표시 빠짐 — ${miss.join(' · ')}`, '마지막 컷(엔딩 카드)에 상호·등록번호·교습과정을 읽을 수 있는 크기로 둔다(채널05 §2-3)')
                    : ok('영상 화면 법정 표시(상호·등록번호·교습과정)');
      }
    }
  }

  // 업로드 문안(⑥)
  const pub = path.join(dir, 'publish.md');
  if (stage >= 6 && existsSync(pub)) {
    const blocks = publishBlocks(readFileSync(pub, 'utf8'));
    for (const [key, text] of Object.entries(blocks)) {
      if (!text.trim()) continue;
      phrase(adPhraseHits(text, `publish.md ## ${key}`), `문안 ${key}`, '문안을 고친다');
      if (['instagram', 'youtube', 'carousel'].includes(key)) {
        const miss = legalDisplayMissing(text, {tuition: true});
        miss.length ? hard(`문안 ${key} 법정 표시 빠짐 — ${miss.join(' · ')}`, 'review 스킬 「학원 법정 표시 블록」을 본문 끝에 그대로 붙인다')
                    : ok(`문안 ${key} 법정 표시(상호·등록번호·교습과정·교습비)`);
      }
    }
  }
  return R;
}
