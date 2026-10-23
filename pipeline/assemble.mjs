#!/usr/bin/env node
// 조립 초안 — assets/images/<컷id>[.final].png + output/<p>/narration.m4a → output/<p>/draft.mp4
// 크로스페이드 트랜지션 + 컷별 미세 줌(켄 번즈). 타이밍은 cuts.json 의 dur 그대로 (음성과 정렬).
// 사용: node pipeline/assemble.mjs <프로젝트> [--fade 0.3] [--zoom 0.04]     (정적 이미지 경로 — 모션 경로에선 안 쓴다)
//
// ⚠️ 자막은 굽지 않는다 — 이 환경의 ffmpeg 엔 drawtext/subtitles 가 없다 (docs/02-pitfalls.md §5).
//    최종본(자막 포함)은 사용자 프로그램에서. 이건 타이밍·트랜지션 확인용 초안이다.

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { resolveProject } from './lib/project.mjs';

const argv = process.argv.slice(2);
// 첫 위치 인자가 프로젝트 (옵션 값은 건너뛴다: --fade 0.3 의 0.3)
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const { dir, out: OUT, name: NAME } = resolveProject(positional[0], { usage: '사용: node pipeline/assemble.mjs <프로젝트> [--fade 0.3] [--zoom 0.04]' });
const opt = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? parseFloat(argv[i + 1]) : dflt;
};
const FADE = opt('fade', 0.3);   // 컷 경계 크로스페이드 (초)
const ZOOM = opt('zoom', 0.04);  // 컷당 줌 폭 (0 = 정지)
const FPS = 30;

const J = JSON.parse(readFileSync(join(dir, 'cuts.json'), 'utf8'));
const cuts = J.cuts;
const starts = []; let acc = 0;
for (const c of cuts) { starts.push(acc); acc += c.dur; }
const TOTAL = acc.toFixed(2);

const img = id => {
  for (const n of [`${id}.final.png`, `${id}.png`]) {
    const p = join(dir, 'assets/images', n);
    if (existsSync(p)) return p;
  }
  console.error(`✗ 이미지 없음: ${id}`); process.exit(1);
};
const narr = join(OUT, 'narration.m4a');
if (!existsSync(narr)) { console.error(`✗ projects/${NAME}/output/narration.m4a 없음 — 먼저 node pipeline/tts.mjs ${NAME}`); process.exit(1); }

const args = ['-y', '-hide_banner', '-loglevel', 'error'];
cuts.forEach((c, i) => {
  const len = c.dur + (i < cuts.length - 1 ? FADE : 0);
  args.push('-loop', '1', '-framerate', String(FPS), '-t', len.toFixed(3), '-i', img(c.id));
});
args.push('-i', narr);

// 각 컷: 업스케일 → 줌(zoompan) → 1080x1920 → (첫 컷 제외) 알파 페이드 인 → 시작점으로 시프트
// 겹침 구간(FADE)만큼 앞 컷이 더 살아 있어 크로스페이드가 되고, 타임라인은 dur 그대로 유지된다.
let fc = `color=c=black:s=1080x1920:r=${FPS}:d=${TOTAL}[bg];`;
cuts.forEach((c, i) => {
  const len = c.dur + (i < cuts.length - 1 ? FADE : 0);
  const frames = Math.round(len * FPS);
  const zoomIn = (i % 2 === 0) || i === cuts.length - 1;   // 홀짝 교차, 마지막은 첫 컷과 같게(루프)
  const z = ZOOM === 0 ? '1'
    : zoomIn ? `1+${(ZOOM / frames).toFixed(8)}*on`
             : `${1 + ZOOM}-${(ZOOM / frames).toFixed(8)}*on`;
  const fade = i > 0 ? `,fade=t=in:st=0:d=${FADE}:alpha=1` : '';
  fc += `[${i}:v]scale=3240:5760,zoompan=z='${z}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=${FPS},` +
        `setsar=1,format=yuva420p${fade},setpts=PTS-STARTPTS+${starts[i].toFixed(3)}/TB[v${i}];`;
});
let prev = 'bg';
cuts.forEach((c, i) => {
  const out = i === cuts.length - 1 ? 'stack' : `o${i}`;
  fc += `[${prev}][v${i}]overlay=eof_action=pass[${out}];`;
  prev = out;
});
fc += `[stack]format=yuv420p[vout]`;

const out = join(OUT, 'draft.mp4');
args.push('-filter_complex', fc, '-map', '[vout]', '-map', `${cuts.length}:a`,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-maxrate', '8M', '-bufsize', '16M',
  '-r', String(FPS), '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', TOTAL, out);

const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
if (r.status !== 0) { console.error('✗ ffmpeg 실패'); process.exit(r.status ?? 1); }
console.log(`✔ ${out}  (${cuts.length}컷 · ${TOTAL}초 · 페이드 ${FADE}s · 줌 ${ZOOM === 0 ? '없음' : '±' + ZOOM * 100 + '%'})`);
