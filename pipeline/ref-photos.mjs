#!/usr/bin/env node
/* 실물 사진 — 생성 이미지·3D 구조물을 만들기 전에 실제 사진 여러 장을 모아 보고, 만든 뒤 나란히 대조한다
 *   (2026-10-06 사용자 지시: "리서치해서 실제 이미지 찾아서 재생성해 너무 사실성없고 실제이미지와 너무 달라서 현실감이 없어"
 *    · "건물같은구조물은 실제 사진 여러장 분석후 렌더링")
 *
 *   node pipeline/ref-photos.mjs <p> <id> --search "<영문 검색어>" [--n=8]   Wikimedia Commons 사진 검색 → output/refs/<id>/NN.jpg + 후보 시트
 *   node pipeline/ref-photos.mjs <p> <id> --url <URL> [<URL>…]               WebSearch 로 찾은 공식 사이트·보도 사진 — 이미지 주소, 또는 페이지 주소(og:image 를 받는다)
 *   node pipeline/ref-photos.mjs <p> <id> --sheet [<비교 이미지>…]             위: 남긴 실물 사진 · 아래: 생성 이미지/3D 스틸
 *                                                                              → output/review/ref-<id>.png + .json(대조한 파일 지문 — 부를 때마다 파일별로 누적)
 *
 * 후보 시트(output/refs/<id>/candidates.jpg)를 열어 대상이 아니거나 같은 시점이 겹치는 파일은 지운다 — 검색은 엉뚱한 사진도 준다
 * (00051 실측: 「Lotte World Tower (2)」가 타워 없는 거리 사진). 서로 다른 시점·시간대 3장 이상을 남긴다(lib/refs.mjs REF_MIN).
 *
 * 🔴 실물 사진은 분석 전용이다. output/refs/(gitignore)에만 둔다 — 생성기에 첨부하지 않고(asset-prompts 의 참조 첨부는 우리 에셋만),
 *    assets/·resources/로 복사하지 않고, 영상·문안에 출처를 쓰지 않는다. 남의 사진을 편집 원본으로 붙이면 그 사진의 2차 저작물을
 *    표시 없이 내보내게 된다 — 저작자 표시 소재 금지(2026-10-02)가 막으려는 바로 그것이다.
 * 썸네일 주소는 API 의 thumburl 그대로 쓴다 (upload.wikimedia.org 경로를 직접 만들면 HTML 오류 페이지가 온다 — 2026-10-06 실측).
 */
import {writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, unlinkSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {resolveProject} from './lib/project.mjs';
import {fileHash} from './lib/workflow-state.mjs';
import {refDir, refImages, uniqueRefImages, refRecord, refRecordFile, sceneDigest, REF_MIN} from './lib/refs.mjs';

const argv = process.argv.slice(2);
const USAGE = '사용: node pipeline/ref-photos.mjs <프로젝트> <id> --search "<검색어>" [--n=8] | --url <URL>… | --sheet [<비교 이미지>…]';
const pos = argv.filter((a) => !a.startsWith('--'));
const {dir: P} = resolveProject(pos[0], {usage: USAGE});
const id = pos[1];
if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) { console.error(`✗ id(영문·숫자·-·_)가 필요하다\n  ${USAGE}`); process.exit(1); }
const mode = ['--search', '--url', '--sheet'].filter((m) => argv.includes(m));
if (mode.length !== 1) { console.error(`✗ --search · --url · --sheet 중 하나\n  ${USAGE}`); process.exit(1); }
const UA = 'ABMEN-ref-research/1.0 (+https://github.com/Awesomble/ABMEN; reference analysis only)';
const D = refDir(P, id);
const rel = (f) => path.relative(P, f);

const valid = (f) => { try { execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width', '-of', 'csv=p=0', f]); return true; } catch { return false; } };
async function download(url, extra = {}) {
  mkdirSync(D, {recursive: true});
  const n = Math.max(0, ...readdirSync(D).map((f) => +(f.match(/^(\d+)\./)?.[1] || 0))) + 1;
  const ext = (url.match(/\.(jpe?g|png|webp)(?:[?#]|$)/i)?.[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg');
  const file = path.join(D, `${String(n).padStart(2, '0')}.${ext}`);
  let res = await fetch(url, {headers: {'User-Agent': UA}, redirect: 'follow'});
  if (!res.ok) return {url, error: `HTTP ${res.status}`};
  if (/text\/html/i.test(res.headers.get('content-type') || '')) {   // 페이지 주소면 대표 이미지(og:image·twitter:image)를 받는다
    const html = await res.text();
    const img = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)(?::src)?["'][^>]*content=["']([^"']+)["']/i)?.[1]
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i)?.[1];
    if (!img) return {url, error: '페이지에 대표 이미지(og:image)가 없다 — 이미지 주소를 직접 넣는다'};
    res = await fetch(new URL(img.replace(/&amp;/g, '&'), url), {headers: {'User-Agent': UA}, redirect: 'follow'});
    if (!res.ok) return {url, error: `대표 이미지 HTTP ${res.status}`};
    extra = {...extra, page: url};
  }
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  if (!valid(file)) { unlinkSync(file); return {url, error: '이미지가 아니다(HTML 오류 페이지 등)'}; }
  return {url, file, ...extra};
}
function log(entries) {
  const f = path.join(D, 'refs.json');
  let old = [];
  try { old = JSON.parse(readFileSync(f, 'utf8')); } catch {}
  writeFileSync(f, JSON.stringify([...old, ...entries.filter((e) => e.file).map((e) => ({...e, file: path.basename(e.file)}))], null, 2) + '\n');
}

// 칸 하나 = 높이 640 고정·폭은 비율대로(최대 1200) — 고정 480×640 칸에 레터박스를 두던 옛 방식은 가로 사진 위아래·세로 이미지 좌우에
// 빈 띠가 컸다(2026-10-10 사용자 지적). 칸 사이 8px, 두 줄은 넓은 쪽 폭에 맞춰 가운데 정렬.
// 이미지 자체에 사분 격자(비율 대조용, 글자 없음 — ffmpeg 에 drawtext 가 없다).
// 알파(3D 스틸)는 이미지 크기의 회색 바탕에 얹는다 — 검정으로 바뀌면 어두운 실루엣이 사라지고, 투명 위의 격자는 안 보인다.
const ROW_H = 640, MAX_W = 1200, GAP = 8;
function dims(f, rowH = ROW_H) {
  const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f], {encoding: 'utf8'}).trim().split(',').map(Number);
  const k = Math.min(MAX_W * rowH / ROW_H / w, rowH / h), even = (x) => Math.max(2, Math.round(x * k / 2) * 2);
  return [even(w), even(h)];
}
function rowGraph(files, start, tag, rowH = ROW_H) {
  let width = 0;
  const parts = files.map((f, i) => { const [w, h] = dims(f, rowH); const cw = w + (i < files.length - 1 ? GAP : 0); width += cw;
    return `[${start + i}:v]scale=${w}:${h},format=rgba[${tag}f${i}];`
    + `color=c=0x4a4f5a:s=${w}x${h}:d=1[${tag}g${i}];[${tag}g${i}][${tag}f${i}]overlay=0:0:shortest=1,drawgrid=w=iw/4:h=ih/4:t=1:c=0xC8F477@0.5,`
    + `pad=${cw}:${rowH}:0:(oh-ih)/2:color=0x111111,format=rgb24[${tag}${i}]`; });
  const n = files.length;
  const join = n > 1 ? `${Array.from({length: n}, (_, i) => `[${tag}${i}]`).join('')}hstack=inputs=${n}:shortest=1[${tag}]` : `[${tag}0]null[${tag}]`;
  return {graph: [...parts, join], width, rowH};
}
function sheet(top, bottom, out) {
  const inputs = [...top, ...bottom].flatMap((f) => ['-i', f]);
  // 아래 줄(생성 이미지·3D 스틸 — 판정 대상)은 위 줄 폭이 남으면 최대 2배 높이까지 키워 좌우 빈 곳을 줄인다
  const T = rowGraph(top, 0, 't');
  let B = bottom.length ? rowGraph(bottom, top.length, 'b') : null;
  if (B && B.width < T.width) {
    const k = Math.min(2, T.width / B.width);
    if (k > 1.05) B = rowGraph(bottom, top.length, 'b', Math.round(ROW_H * k / 2) * 2);
  }
  const W = Math.max(T.width, B ? B.width : 0);
  const g = [...T.graph, `[t]pad=${W}:${ROW_H}:(ow-iw)/2:0:color=0x111111[T]`];
  if (B) g.push(...B.graph, `[b]pad=${W}:${B.rowH + GAP}:(ow-iw)/2:${GAP}:color=0x111111[B]`, '[T][B]vstack=inputs=2[o]');
  else g.push('[T]null[o]');
  mkdirSync(path.dirname(out), {recursive: true});
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', g.join(';'), '-map', '[o]', '-frames:v', '1', out]);
}
function candidates() {
  const files = refImages(P, id);
  if (!files.length) return;
  const out = path.join(D, 'candidates.jpg');
  for (let i = 0; i < files.length; i += 6) sheet(files.slice(i, i + 6), [], i ? out.replace('.jpg', `-${i / 6 + 1}.jpg`) : out);
  console.log(`  후보 시트 ${rel(out)} — 왼쪽부터 ${files.map((f) => path.basename(f)).join(' · ')}`);
  console.log(`  → 시트를 열어 대상이 아니거나 시점이 겹치는 파일을 지운다(rm ${rel(D)}/NN.jpg). 서로 다른 시점·시간대 ${REF_MIN}장 이상을 남긴다`);
}

if (argv.includes('--search')) {
  const q = argv[argv.indexOf('--search') + 1];
  if (!q || q.startsWith('--')) { console.error('✗ --search "<검색어>"'); process.exit(1); }
  const n = Math.min(20, +(argv.find((a) => a.startsWith('--n='))?.slice(4) || 8));
  const api = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({action: 'query', format: 'json', generator: 'search',
    gsrsearch: `${q} filetype:bitmap`, gsrnamespace: '6', gsrlimit: String(n * 2), prop: 'imageinfo', iiprop: 'url|size|mime', iiurlwidth: '1280'});
  const res = await fetch(api, {headers: {'User-Agent': UA}});
  if (!res.ok) { console.error(`✗ Commons 검색 HTTP ${res.status} — 네트워크가 막혔으면 WebSearch 로 찾은 이미지 주소를 --url 로 넣는다`); process.exit(2); }
  const pages = Object.values((await res.json()).query?.pages || {}).sort((a, b) => a.index - b.index)
    .filter((p) => /image\/(jpeg|png|webp)/.test(p.imageinfo?.[0]?.mime || '') && (p.imageinfo[0].width || 0) >= 600).slice(0, n);
  if (!pages.length) { console.error(`✗ 「${q}」 사진이 없다 — 다른 영문 표기·한글 이름으로 다시 찾거나 --url 로 넣는다`); process.exit(1); }
  const got = [];
  for (const p of pages) got.push(await download(p.imageinfo[0].thumburl, {title: p.title, page: p.imageinfo[0].descriptionurl}));
  for (const e of got) console.log(e.error ? `  ✗ ${e.title}: ${e.error}` : `  ✔ ${path.basename(e.file)}  ${e.title}`);
  log(got);
  candidates();
} else if (argv.includes('--url')) {
  const urls = argv.slice(argv.indexOf('--url') + 1).filter((a) => /^https?:\/\//.test(a));
  if (!urls.length) { console.error('✗ --url <이미지 URL>…'); process.exit(1); }
  const got = [];
  for (const u of urls) got.push(await download(u));
  for (const e of got) console.log(e.error ? `  ✗ ${e.url}: ${e.error}` : `  ✔ ${path.basename(e.file)}  ${e.url}`);
  log(got);
  candidates();
} else {
  const refs = uniqueRefImages(P, id);
  if (refs.length < REF_MIN) { console.error(`✗ ${rel(D)}/ 의 실물 사진이 ${refs.length}장이다(같은 파일은 한 장) — --search·--url 로 서로 다른 시점 ${REF_MIN}장 이상을 먼저 모은다`); process.exit(1); }
  const cmp = argv.slice(argv.indexOf('--sheet') + 1).filter((a) => !a.startsWith('--'))
    .map((f) => (path.isAbsolute(f) ? f : existsSync(f) ? path.resolve(f) : path.join(P, f)));
  for (const f of cmp) if (!existsSync(f)) { console.error(`✗ 비교 이미지가 없다: ${f}`); process.exit(1); }
  const out = path.join(P, 'output', 'review', `ref-${id}.png`);
  if (cmp.length > 6) { console.error('✗ 비교 이미지는 한 번에 6장까지 — 나눠 부르면 기록은 파일별로 누적된다'); process.exit(1); }
  sheet(refs.slice(0, 6), cmp, out);
  // 기록은 파일별로 누적한다 — 같은 refs 를 쓰는 에셋 여럿·3D 스틸을 따로 대조해도 앞의 근거가 지워지지 않는다(2026-10-06 적대적 검증)
  const scene = sceneDigest(P), now = new Date().toISOString();
  const kept = (refRecord(P, id)?.compared || []).filter((c) => !cmp.some((f) => rel(f) === c.file));
  const compared = [...kept, ...cmp.map((f) => ({file: rel(f), hash: fileHash(f), at: now, scene: rel(f).startsWith('output/3d/') ? scene : null}))];
  writeFileSync(refRecordFile(P, id), JSON.stringify({version: 2, id, at: now,
    refs: refs.slice(0, 6).map((f) => ({file: rel(f), hash: fileHash(f)})), compared}, null, 2) + '\n');
  console.log(`  대조 시트 ${rel(out)}\n    위: 실물 ${Math.min(6, refs.length)}장${refs.length > 6 ? `(남긴 ${refs.length}장 중 앞 6장)` : ''} · 아래: ${cmp.length ? cmp.map((f) => path.basename(f)).join(' · ') : '(비교 이미지 없음 — 분석용 실물 시트만)'}`);
  if (cmp.length) console.log(`  → 시트를 열어 README 의 식별 특징·형상 사양을 한 줄씩 대조하고 결과를 README 에 적는다 —\n    이미지: 「### 수령 검수」에 \`<asset-id>: 식별 특징 n/N 일치 — 어긋난 것·남긴 이유\` · 3D: \`실물 형상 대조: ${id} n/N 일치 — 어긋난 것·남긴 이유\`\n    (예: \`hero: 식별 특징 4/5 일치 — 가로띠 간격이 넓다, 휴대폰 크기에서 안 보여 남김\`. 다 맞으면 \`5/5 일치\`)\n    형태·비율·고유 디테일이 어긋나면 프롬프트(편집 형식)·모델을 고쳐 다시 만들고 이 시트를 다시 뽑는다`);
}
