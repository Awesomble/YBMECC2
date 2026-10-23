#!/usr/bin/env node
// 원생 사진 접수 (YBMECC 2026-10-20) — 학원이 준 사진을 화면에 쓸 수 있는 사본으로 만들고 보호자 동의 장부를 연다.
//
//   node pipeline/photo-intake.mjs <프로젝트> [원본 폴더]   원본 기본값 projects/<p>/photos-in/ (git 제외 · 원본은 고치지 않는다)
//   node pipeline/photo-intake.mjs <프로젝트> --check       장부 대조만 — 동의 ✅ 없는 사진이 있으면 exit 1
//
// 한 장마다:
//   ① JPEG 로 (HEIC·PNG·WEBP 포함 — macOS sips)   ② EXIF 회전값을 화소에 적용 (sips 는 스스로 돌리지 않는다 — 실측 2026-10-20)
//   ③ 긴 변이 2400px 보다 클 때만 줄인다 (sips -Z 는 작은 사진을 키운다 — 실측 400px → 2400px)
//   ④ 위치(GPS)·기기·촬영 시각 등 메타데이터 전부 삭제 (exiftool -all=) 후 GPS 가 남지 않았는지 다시 읽는다
//   → projects/<p>/assets/photos/NN-<이름>.jpg  (git 제외 — .gitignore)
// 그리고:
//   README 「## 사진 동의」 표에 새 사진 줄을 「⬜ 확인 필요」로 더한다 — 보호자 서면 동의를 확인한 줄만 사람이 ✅ 로 바꾼다
//   output/photos/sheet.png 번호 시트 — 고를 사진·식별 정보(이름표·교복 학교명·셔틀 번호)를 눈으로 본다
//
// 🔴 아이 사진을 생성 이미지로 대신하지 않는다 — 실제 원생·수업·결과처럼 보이는 합성은 기만 광고다(docs/channel/05 §4).
// 🔴 원본·사본을 외부 생성기·업로드 서비스에 넣지 않는다. 판정 규칙은 lib/academy.mjs(stage-gate·academy-check 와 같다).
import {existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, rmSync, mkdtempSync, statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {resolveProject} from './lib/project.mjs';
import {PHOTO_EXT, photoConsent, consentLedger} from './lib/academy.mjs';

const args = process.argv.slice(2);
const {dir, name, out} = resolveProject(args[0], {usage: '사용: node pipeline/photo-intake.mjs <프로젝트> [원본 폴더|--check]'});
const CHECK = args.includes('--check');
const DEST = path.join(dir, 'assets/photos');
const README = path.join(dir, 'README.md');
const MAX = 2400;

function report() {
  const c = photoConsent(dir);
  console.log(`\n  사진 동의 — ${name}: 사진 ${c.files.length}장 · 장부 없음 ${c.missing.length} · 동의 미확인 ${c.notOk.length}`);
  for (const f of c.missing) console.log(`     🔴 장부에 없다  ${f}`);
  for (const f of c.notOk) console.log(`     ⬜ 동의 미확인  ${f}`);
  if (c.files.length && !c.missing.length && !c.notOk.length) console.log('     ✅ 모든 사진에 보호자 동의 ✅');
  return c;
}
if (CHECK) { const c = report(); process.exit(c.missing.length || c.notOk.length || (c.files.length && !c.found) ? 1 : 0); }

const SRC = path.resolve(args.find((a, i) => i > 0 && !a.startsWith('--')) ?? path.join(dir, 'photos-in'));
if (!existsSync(SRC)) {
  mkdirSync(path.join(dir, 'photos-in'), {recursive: true});
  console.log(`  원본 폴더를 만들었다: ${path.relative(process.cwd(), path.join(dir, 'photos-in'))}/ — 학원이 준 사진을 넣고 다시 돌린다(git 에 올라가지 않는다)`);
  process.exit(0);
}
if (!existsSync(README)) { console.error(`✗ ${name}/README.md 가 없다 — pipeline/new.sh 로 만든 프로젝트인가`); process.exit(1); }
mkdirSync(DEST, {recursive: true});

const run = (cmd, a) => execFileSync(cmd, a, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
const tag = (f, t) => run('exiftool', ['-n', '-s3', `-${t}`, f]);
const slug = (s) => s.normalize('NFKD').replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'photo';

// 이미 들인 원본은 건너뛴다 — 장부 「원본」 열로 대조(같은 이름을 두 번 넣지 않는다)
let readme = readFileSync(README, 'utf8');
const ledger = consentLedger(readme);
const ledgerSec = readme.split(/^## /m).find((s) => /^사진 동의/.test(s)) ?? '';
const done = new Set([...ledgerSec.matchAll(/^\|\s*`?([^|`]+?)`?\s*\|\s*`?([^|`]+?)`?\s*\|/gm)].map((m) => m[2].trim()));
const existing = readdirSync(DEST).filter((f) => PHOTO_EXT.test(f));
let n = existing.reduce((m, f) => Math.max(m, parseInt(f, 10) || 0), 0);

const sources = readdirSync(SRC).filter((f) => PHOTO_EXT.test(f) && !f.startsWith('.')).sort();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'photo-intake-'));
const added = [];
try {
  for (const f of sources) {
    if (done.has(f)) { console.log(`     ↷ 이미 들임  ${f}`); continue; }
    const src = path.join(SRC, f), t = path.join(tmp, 'w.jpg');
    run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '90', src, '--out', t]);
    // EXIF Orientation 1~8 → sips 회전(시계 방향)·뒤집기
    const o = Number(tag(src, 'Orientation')) || 1;
    const ops = {2: [['-f', 'horizontal']], 3: [['-r', '180']], 4: [['-f', 'vertical']], 5: [['-r', '90'], ['-f', 'horizontal']],
      6: [['-r', '90']], 7: [['-r', '270'], ['-f', 'horizontal']], 8: [['-r', '270']]}[o] ?? [];
    for (const op of ops) run('sips', [...op, t, '--out', t]);
    const w = Number(tag(t, 'ImageWidth')), h = Number(tag(t, 'ImageHeight'));
    if (Math.max(w, h) > MAX) run('sips', ['-Z', String(MAX), t, '--out', t]);
    run('exiftool', ['-q', '-all=', '-overwrite_original', t]);
    if (tag(t, 'GPSLatitude') || tag(t, 'GPSPosition')) throw new Error(`위치 정보가 지워지지 않았다: ${f}`);
    const destName = `${String(++n).padStart(2, '0')}-${slug(f)}.jpg`;
    renameSync(t, path.join(DEST, destName));
    const fw = Number(tag(path.join(DEST, destName), 'ImageWidth')), fh = Number(tag(path.join(DEST, destName), 'ImageHeight'));
    added.push({destName, f, size: `${fw}×${fh}`});
    console.log(`     ✅ ${destName}  ← ${f}  (${fw}×${fh}${o !== 1 ? ` · 회전 ${o}` : ''}${Math.max(w, h) > MAX ? ' · 축소' : ''} · 메타데이터 삭제)`);
  }
} finally { rmSync(tmp, {recursive: true, force: true}); }

// 장부 — 없으면 절을 만들고, 새 줄은 「⬜ 확인 필요」
if (added.length) {
  const rows = added.map((a) => `| ${a.destName} | ${a.f} | ⬜ 확인 필요 | | |`).join('\n');
  if (!ledger.found) {
    readme = readme.replace(/\s*$/, '\n') + `\n## 사진 동의\n\n` +
      `<!-- 보호자 서면 동의(홍보 목적·게시 매체·기간·철회 방법)를 확인한 줄만 「동의」 칸을 ✅ 로 바꾼다. 인물이 없는 사진도 「✅ 인물 없음」으로 적는다.\n` +
      `     비고: 이름표·교복 학교명·셔틀 번호·집 주변처럼 아이를 찾을 수 있는 정보가 보이면 적고 화면에서 가린다. 정본 docs/channel/02-platform-rules.md §1-4 -->\n` +
      `| 파일 | 원본 | 보호자 동의 | 범위·기간 | 비고 |\n|---|---|---|---|---|\n${rows}\n`;
  } else {
    // 표의 마지막 줄 뒤에 붙인다
    const parts = readme.split(/^(?=## )/m), i = parts.findIndex((p) => /^## 사진 동의/.test(p));
    const lines = parts[i].replace(/\s*$/, '').split('\n');
    const last = lines.map((l, k) => (/^\s*\|/.test(l) ? k : -1)).filter((k) => k >= 0).pop() ?? lines.length - 1;
    lines.splice(last + 1, 0, rows);
    parts[i] = lines.join('\n') + '\n\n';
    readme = parts.join('');
  }
  writeFileSync(README, readme);
}

// 번호 시트 — 들인 사진 전부(파일 이름 = 번호). Chrome 헤드리스 한 장
const all = readdirSync(DEST).filter((f) => PHOTO_EXT.test(f)).sort();
if (all.length) {
  const cols = Math.min(4, all.length), cellW = 300, cellH = 400, rowsN = Math.ceil(all.length / cols);
  const W = cols * cellW + (cols + 1) * 12, H = rowsN * (cellH + 40) + (rowsN + 1) * 12;
  const sheetDir = path.join(out, 'photos'); mkdirSync(sheetDir, {recursive: true});
  const html = path.join(sheetDir, 'sheet.html');
  writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#222;font:600 18px/1 -apple-system,sans-serif;color:#fff}
#g{display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:12px;padding:12px}figure{margin:0}
img{width:${cellW}px;height:${cellH}px;object-fit:contain;background:#111;display:block}figcaption{padding:10px 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}</style>
<div id="g">${all.map((f) => `<figure><img src="${pathToFileURL(path.join(DEST, f)).href}"><figcaption>${f}</figcaption></figure>`).join('')}</div>`);
  const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const prof = mkdtempSync(path.join(os.tmpdir(), 'photo-sheet-'));
  try {
    execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--no-first-run',
      `--user-data-dir=${prof}`, `--window-size=${W},${H}`, `--screenshot=${path.join(sheetDir, 'sheet.png')}`, pathToFileURL(html).href],
      {stdio: 'ignore', timeout: 60000});
    console.log(`\n  번호 시트: ${path.relative(process.cwd(), path.join(sheetDir, 'sheet.png'))} (${all.length}장)`);
  } catch (e) { console.log(`\n  ⚠️ 번호 시트를 못 만들었다(${e.message.split('\n')[0]}) — 사진은 ${path.relative(process.cwd(), DEST)}/ 에 있다`); }
  finally { rmSync(prof, {recursive: true, force: true}); rmSync(html, {force: true}); }
}
console.log(`\n  새로 들임 ${added.length}장 · README 「## 사진 동의」에서 보호자 동의를 확인한 줄만 ✅ 로 바꾼다`);
report();
