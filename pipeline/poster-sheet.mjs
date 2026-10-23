#!/usr/bin/env node
/* 0초 포스터 비교 시트 — 3안을 실제 크기로 찍어 한 장에 놓는다 (2026-10-06 사용자 지시: 첫 장면 포스터를 디자이너처럼)
 *
 *   node pipeline/poster-sheet.mjs <p> <고른 안> [<안2> <안3>] [--before <png>] [--body <png>]
 *     --body = 본문에서 가장 후킹이 센 장면의 스틸(hf-cli snapshot --at <정점 초>) — 포스터가 그보다 약하면 다시 (2026-10-21 사용자)
 *     각 안 = 세션 스크래치의 1080×1920 정적 HTML(헤드리스 Chrome 으로 찍는다) 또는 이미 찍은 PNG.
 *       셰이더(ABMShaders.mount)를 쓴 안은 GPU 를 끈 Chrome 에서 자홍(NO WEBGPU)으로 나오므로
 *       `shader-fx shot`(HyperFrames 와 같은 headless-shell·WebGPU)으로 0초를 찍는다 (docs/14-hyperframes.md §16)
 *     → output/review/poster-sheet.png : 왼쪽 큰 칸 = 고른 안(540×960), 오른쪽 = 나머지 안(270×480씩), --before 는 맨 오른쪽,
 *       맨 아래 줄 = 같은 순서의 프로필 그리드 칸(가운데 3:4, 180×240 — 2026-10-08 클릭 근거 H03)
 *     → output/review/poster/<이름>.png : 안마다 원본 크기 캡처(1080×1920) — 0초 구현의 기준
 *
 * 절차의 정본은 video ④ 4-designer 「0초 포스터 — 디자이너 절차」다. 시안 HTML 은 저장소에 두지 않는다(세션 스크래치).
 * 시트에 글자를 넣지 않는다(ffmpeg 에 drawtext 가 없다) — 순서가 곧 표시다: 큰 칸이 고른 안이다.
 */
import {existsSync, mkdirSync, readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {resolveProject} from './lib/project.mjs';

const argv = process.argv.slice(2);
const USAGE = '사용: node pipeline/poster-sheet.mjs <프로젝트> <고른 안.html|png> [<안2> <안3>] [--before <png>] [--body <본문 최고 장면 png>]';
const bi = argv.indexOf('--before'), before = bi >= 0 ? argv[bi + 1] : null;
const bo = argv.indexOf('--body'), bodyPng = bo >= 0 ? argv[bo + 1] : null;
const pos = argv.filter((a, i) => !a.startsWith('--') && (bi < 0 || i !== bi + 1) && (bo < 0 || i !== bo + 1));
const {dir: P, out: O} = resolveProject(pos[0], {usage: USAGE});
const inputs = pos.slice(1).map((f) => path.resolve(f));
if (!inputs.length || inputs.length > 3) { console.error(`✗ 안은 1~3개다 — 첫 번째가 고른 안\n  ${USAGE}`); process.exit(1); }
for (const f of [...inputs, ...(before ? [path.resolve(before)] : []), ...(bodyPng ? [path.resolve(bodyPng)] : [])]) if (!existsSync(f)) { console.error(`✗ 없다: ${f}`); process.exit(1); }

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOT = path.join(O, 'review', 'poster');
mkdirSync(SHOT, {recursive: true});
const shot = (f) => {
  if (/\.png$/i.test(f)) return f;
  if (!existsSync(CHROME)) { console.error(`✗ Chrome 이 없다(${CHROME}) — 안을 PNG 로 찍어 넘긴다`); process.exit(2); }
  const out = path.join(SHOT, `${path.basename(f).replace(/\.html?$/i, '')}.png`);
  if (/ABMShaders\.mount\s*\(/.test(readFileSync(f, 'utf8'))) {
    const hf = path.join(P, 'hyperframes');
    execFileSync(process.execPath, [path.join(path.dirname(new URL(import.meta.url).pathname), 'shader-fx.mjs'), 'shot', f, '--at', '0', '-o', out,
      ...(existsSync(path.join(hf, 'package.json')) ? ['--hf', hf] : [])], {stdio: ['ignore', 'ignore', 'inherit']});
    return out;
  }
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
    '--force-device-scale-factor=1', '--window-size=1080,1920', `--screenshot=${out}`, `file://${f}`], {stdio: 'ignore'});
  return out;
};
const pngs = inputs.map(shot);
const extra = [...(before ? [path.resolve(before)] : []), ...(bodyPng ? [path.resolve(bodyPng)] : [])];   // 끝 칸: 지금 0초 · 본문 최고 장면
const all = [...pngs, ...extra];
// 큰 칸 1개 + 작은 칸 열(2개씩 위아래). 작은 칸이 없으면 큰 칸만
const fit = (w, h) => `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0x111111`;
const g = [`[0:v]${fit(540, 960)}[big]`];
const small = all.slice(1);
small.forEach((_, i) => g.push(`[${i + 1}:v]${fit(270, 480)}[s${i}]`));
const cols = [];
for (let i = 0; i < small.length; i += 2) {
  if (i + 1 < small.length) { g.push(`[s${i}][s${i + 1}]vstack=inputs=2[c${i}]`); cols.push(`[c${i}]`); }
  else { g.push(`[s${i}]pad=270:960:0:0:color=0x111111[c${i}]`); cols.push(`[c${i}]`); }
}
g.push(cols.length ? `[big]${cols.join('')}hstack=inputs=${cols.length + 1}[top]` : '[big]null[top]');
// 맨 아래 줄 = 프로필 그리드 칸 — 인스타·틱톡은 9:16 커버를 가운데 3:4로 잘라 폰 폭의 1/3로 보인다(근거 장부 H03).
// 큰 칸(540)이 폰 한 화면이므로 그 1/3인 180×240. 같은 파일을 입력으로 한 번 더 받는다(앞 칸들과 순서 같음).
const W = 540 + 270 * cols.length;
all.forEach((_, i) => g.push(`[${all.length + i}:v]crop=iw:min(ih\\,iw*4/3),scale=180:240[g${i}]`));
g.push(`${all.map((_, i) => `[g${i}]`).join('')}${all.length > 1 ? `hstack=inputs=${all.length}` : 'null'},pad=${W}:240:0:0:color=0x111111[grid]`);
g.push('[top][grid]vstack=inputs=2[o]');
const sheet = path.join(O, 'review', 'poster-sheet.png');
execFileSync('ffmpeg', ['-v', 'error', '-y', ...[...all, ...all].flatMap((f) => ['-i', f]), '-filter_complex', g.join(';'), '-map', '[o]', '-frames:v', '1', sheet]);
console.log(`  포스터 시트 ${path.relative(P, sheet)}\n    큰 칸: ${path.basename(pngs[0])}(고른 안)${small.length ? ` · 작은 칸: ${small.map((f) => path.basename(f)).join(' · ')}` : ''}${before ? ' (맨 끝 쪽 = 지금 화면)' : ''}${bodyPng ? ' (맨 끝 = 본문 최고 장면 — 포스터가 이보다 약하면 다시)' : ''}`);
console.log('  → 맨 아래 줄은 프로필 그리드 칸(3:4)이다. 그 크기에서도 주인공·후킹이 보이나 · 볼 이유(남긴 공백)를 한 줄로 말할 수 있나 · 「뻔한 기본값」에 걸리나 · 장식 하나를 뺄 수 있나 (4-designer 「0초 포스터」)');
