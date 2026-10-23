// cuts.json → 조립에 필요한 산출물 일체
// 사용: node pipeline/export.mjs <프로젝트>     → output/<p>/subtitles.srt · timeline.md · timeline.csv
//
// 사용자가 자기 프로그램으로 이어붙이고 자막을 넣으므로,
// 여기서는 "붙이기 좋은 형태"로만 뽑아 준다.
//   subtitles.srt   자막 (대부분의 편집 프로그램이 읽는다)
//   timeline.md     컷 순서·길이·파일명 대조표
//   timeline.csv    스프레드시트·스크립트용
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { resolveProject } from './lib/project.mjs';
import { readSubs, readTimeline, overlap } from './lib/scene.mjs';

const { dir: DIR, out: OUT, name: NAME } = resolveProject(process.argv[2], { usage: '사용: node pipeline/export.mjs <프로젝트>' });

// 🔴 잠금 — HyperFrames 프로젝트에서는 **여기서 멈춘다** (2026-09-10 실사고 · docs/02-pitfalls.md §41)
//   이 스크립트는 cuts.json + 레거시 Remotion 의 motion/subtitles.tsx 로 자막을 만든다.
//   HyperFrames 는 자막을 **프레임 HTML 의 .clip.caption 에 굽는다** — 여기서는 안 보인다.
//   그래서 00006 에서 이걸 돌리자 30청크 SRT 가 「여기에 자막을」 3청크로 덮였다.
//
//   🔴 그때 경고를 **생성물(timeline.md) 머리**에만 넣었다. 그건 사고가 나면 **덮여서 사라지는 쪽**이다
//   (감독 지적). 「금지를 산문에 적지 말고 도구로 만들어라」가 §41 의 요지인데, 정작 §41 이
//   산문으로만 있었다. 잠금은 **실행 경로**에 있어야 한다.
const HF_DIR = path.join(DIR, 'hyperframes');
// 🔴 조건은 「HyperFrames 폴더가 있나」가 **아니다** — 00002~00005 도 HyperFrames 로 렌더했지만
//    자막은 `motion/subtitles.tsx` 로 관리했고 프레임에 구운 자막이 0개다. 그쪽은 이 스크립트가 맞다.
//    잠가야 할 곳은 **`hf-export.mjs` 가 실제로 대체할 수 있는 곳**뿐이다. 그래서 조건을 거기서 가져온다.
const baked = existsSync(path.join(HF_DIR, 'index.html'))
  ? (await import('./hf-export.mjs')).captionChunks(HF_DIR).length
  : 0;
if (baked > 0) {
  console.error(`✗ ${NAME} 은 프레임에 자막 ${baked}청크가 구워져 있다 — export.mjs 는 이걸 덮어쓴다 (pitfalls §41)`);
  console.error(`   그 자막은 HyperFrames 쪽(프레임의 .clip.caption 또는 caption_groups.json)에 있고 여기서는 안 보인다.`);
  console.error(`   대신:  node pipeline/hf-export.mjs ${NAME}`);
  console.error(`   그래도 레거시 경로로 뽑아야 하면:  ABM_FORCE_LEGACY_EXPORT=1 node pipeline/export.mjs ${NAME}`);
  if (!process.env.ABM_FORCE_LEGACY_EXPORT) process.exit(2);
  console.error(`   ⚠️ ABM_FORCE_LEGACY_EXPORT — 구운 자막을 덮어쓰고 진행한다`);
}
const J = JSON.parse(readFileSync(path.join(DIR, 'cuts.json'), 'utf8'));
const cuts = J.cuts || [];

let t = 0;
for (const c of cuts) { c._a = t; t += c.dur || 2; c._b = t; }
const TOTAL = t;

// ⚠️ 초와 밀리초를 따로 반올림하면 1.9996초가 "00:00:01,1000" 이 된다 — 잘못된 SRT 다 (2026-09-08).
//    전체를 정수 밀리초로 먼저 반올림한 뒤 쪼갠다.
const ts = s => {
  const total = Math.max(0, Math.round(s * 1000));
  const ms = total % 1000, secAll = (total - ms) / 1000;
  const h = Math.floor(secAll / 3600), m = Math.floor(secAll % 3600 / 60), sec = secAll % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
};

// ── SRT ──
// ⚠️ 모션 경로는 **구운 자막(motion/subtitles.tsx)이 정본**이다 — 그게 실제로 화면에 나가는 문장이고
//    whisper 어절 온셋 실측이라 타이밍도 정확하다. cuts.json 의 text 를 쓰면 재제작 때 say·motion 만
//    고치고 text 가 구안으로 남아 **음성과 무관한 자막이 나간다** (2026-09-07 실사고).
//    정적 카드·AI 실사(레거시) 경로는 subtitles.tsx 가 없으므로 종전대로 cuts.json 의 text 를 쓴다.
const tl = await readTimeline(DIR);
const subs = readSubs(DIR, { speed: tl?.SPEED ?? 1, total: TOTAL });
let srtSource;
if (subs.length) {
  srtSource = 'motion/subtitles.tsx (구운 자막 · whisper 실측)';
  const srt = subs.map((c, i) =>
    `${i + 1}\n${ts(c.at)} --> ${ts(Math.max(c.at + 0.3, Math.min(c.until, TOTAL) - 0.04))}\n${c.t}\n`).join('\n');
  writeFileSync(path.join(OUT, 'subtitles.srt'), srt);
  // cuts.json 의 text 가 구안으로 남았는지 알려준다 (고치는 건 사용자·② 구조의 몫)
  const stale = cuts.filter(c => {
    if (!c.text) return false;
    const inCut = subs.filter(x => x.at >= c._a - 0.2 && x.at < c._b).map(x => x.t).join(' ');
    return inCut && overlap(c.text, inCut) < 0.4;
  });
  if (stale.length)
    console.log(`  ⚠️ cuts.json 의 text 가 구운 자막과 다릅니다 (${stale.length}/${cuts.length}컷: ${stale.slice(0, 4).map(c => c.id).join(', ')}${stale.length > 4 ? '…' : ''})\n     SRT 는 구운 자막 기준으로 냈습니다. timeline.md 의 자막 열도 그렇습니다.\n     cuts.json 의 text 는 설계도이므로 ② 구조 단계에서 현행으로 맞추세요.`);
} else {
  srtSource = 'cuts.json 의 text (레거시 경로 — 구운 자막이 없다)';
  const srt = cuts.filter(c => c.text).map((c, i) =>
    `${i + 1}\n${ts(c._a + 0.05)} --> ${ts(c._b - 0.08)}\n${c.text}\n`).join('\n');
  writeFileSync(path.join(OUT, 'subtitles.srt'), srt);
}

// ── 타임라인 ──
const f = (...p) => existsSync(path.join(DIR, ...p));
// 오버레이가 필요한 컷은 .final.png 가 완성본이다. 없는 컷은 .png 가 곧 완성본.
const rows = cuts.map(c => {
  const needOv = !!(c.overlay && c.overlay.length);
  const bg = f('assets', 'images', c.id + '.png');
  const fin = needOv ? f('assets', 'images', c.id + '.final.png') : bg;
  return {
    id: c.id, start: c._a.toFixed(2), end: c._b.toFixed(2), dur: (c.dur || 2).toFixed(1),
    img: bg ? '✓' : '·',
    ov: needOv ? (fin ? '✓' : '·') : '—',
    clip: f('assets', 'clips', c.id + '.mp4') ? '✓' : '·',
    voice: f('voice', c.id + '.m4a') ? '✓' : '·',
    text: (subs.length
      ? subs.filter(x => x.at >= c._a - 0.2 && x.at < c._b).map(x => x.t).join(' ')
      : c.text) || '', say: c.say || '', headline: c.headline || '',
  };
});

const md = [
  `# ${J.title || path.basename(DIR)} — 타임라인`, '',
  `컷 ${cuts.length}개 · 총 **${TOTAL.toFixed(1)}초** · ${J.orientation === 'landscape' ? '16:9' : '9:16 (1080x1920)'} · ${J.fps || 30}fps`,
  `말 속도 ${J.voice?.speed ?? 1.5}배`, '',
  '## 순서대로 이어붙이면 됩니다', '',
  '| # | 컷 | 시작 | 끝 | 길이 | 이미지 | 클립 | 음성 | 헤드라인 (상단) | 자막 (하단) |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r, i) =>
    `| ${i + 1} | \`${r.id}\` | ${r.start} | ${r.end} | ${r.dur}s | ${r.img} | ${r.clip} | ${r.voice} | **${r.headline}** | ${r.text} |`),
  '',
  '`·` 미생성 · `✓` 완료',
  '',
  `자막 출처: **${srtSource}**`,
  '', '## ⭐ 헤드라인 — 첫 프레임에 반드시', '',
  '**첫 프레임 헤드라인은 3초 리텐션을 50% 올립니다.** 컷별 문구는 아래 표에 있습니다.', '',
  '```',
  'y   220 ~  600   헤드라인 — 가로 중앙, 48pt 이상, 고대비 + 외곽선',
  'y   600 ~ 1450   이미지 콘텐츠',
  'y  1450 ~ 1920   자막',
  '```', '',
  '**헤드라인과 자막은 내용이 다릅니다.** 헤드라인은 구간의 핵심 한 마디, 자막은 지금 말하는 내용입니다.',
  '같은 문장을 위아래에 쓰면 화면만 지저분해집니다. 상세는 `docs/09-safezone.md` §3.', '',
  '## ⚠️ 자막 위치 — 데드존을 피할 것', '',
  ...(J.safezone ? [
    `플랫폼 UI 가 **상단 ${J.safezone.worst_case.top}px · 하단 ${J.safezone.worst_case.bottom}px · ` +
      `우측 ${J.safezone.worst_case.right}px** 를 덮습니다.`, '',
    '```',
    `안전 영역     x ${J.safezone.safe.x[0]} ~ ${J.safezone.safe.x[1]}   ·   y ${J.safezone.safe.y[0]} ~ ${J.safezone.safe.y[1]}`,
    `자막 아래끝   y ≤ ${J.safezone.safe.y[1] - 40}   (= bottom ${J.safezone.subtitle.bottom_px}px 이상)`,
    `자막 좌우     x 100 ~ 920`,
    '```', '',
    '**하단에 붙이지 마세요.** Reels 는 캡션·오디오 표시가 하단 430px 까지 올라옵니다.',
    '훅처럼 큰 글씨 한 줄이면 화면 중앙(y 800~1000)이 더 잘 읽힙니다. 상세는 `docs/09-safezone.md`.', '',
  ] : []),
  '## ⚠️ 옴니(Veo) 클립은 워터마크를 확인하세요', '',
  '우측 하단에 워터마크가 찍힙니다. 플랫폼 데드존과 겹쳐 안 보일 수도 있지만, 확실히 하려면 크롭합니다.', '',
  '```bash',
  '# 하단 140px 제거 후 9:16 복원 (화면 7.9% 확대)',
  'ffmpeg -i clip.mp4 -vf "crop=1001:1780:39:0,scale=1080:1920" -c:a copy out.mp4',
  '```', '',
  '**클링 유료 플랜은 워터마크가 없습니다.** 신경 쓰이는 컷은 클링으로 돌리는 게 깔끔합니다.',
  '⚠️ 보이지 않는 SynthID 는 제거하려 하지 마세요 — 섀도우밴 위험이 있습니다. 상세는 `docs/10-watermark.md`.', '',
  '## 파일 위치', '',
  '```',
  'assets/images/<컷id>.png        ③ 배경 (화면 문자 포함)',
  'assets/images/<컷id>.final.png  ④ 글자를 보정한 이미지 (있을 때만)',
  'assets/clips/<컷id>.mp4         ⑤ 영상 (없으면 완성 이미지를 그 길이만큼)',
  'voice/<컷id>.m4a                 컷별 음성',
  'output/<프로젝트>/narration.m4a   전체 음성 (타임라인에 맞춰 무음 패딩 포함)',
  'output/<프로젝트>/subtitles.srt   자막',
  '```', '',
  '## 나레이션 전문', '',
  ...cuts.map((c, i) => c.say ? `${i + 1}. **${c.id}** (${c._a.toFixed(1)}~${c._b.toFixed(1)}s) ${c.say}` : `${i + 1}. **${c.id}** (무음)`),
].join('\n');
writeFileSync(path.join(OUT, 'timeline.md'), md);

writeFileSync(path.join(OUT, 'timeline.csv'),
  'no,id,start,end,dur,image,clip,voice,headline,subtitle,narration\n' +
  rows.map((r, i) => [i + 1, r.id, r.start, r.end, r.dur, r.img, r.clip, r.voice,
    `"${r.headline.replace(/"/g,'""')}"`, `"${r.text.replace(/"/g,'""')}"`,
    `"${r.say.replace(/"/g,'""')}"`].join(',')).join('\n'));

const n = k => rows.filter(r => r[k] === '✓').length;
const needOv = rows.filter(r => r.ov !== '—').length;
console.log(`✔ ${NAME} → projects/${NAME}/output/`);
console.log(`  subtitles.srt (${subs.length ? subs.length + '청크 · 구운 자막 기준' : '컷 단위 · cuts.json text'}) · timeline.md · timeline.csv`);
console.log(`  컷 ${cuts.length}개 / ${TOTAL.toFixed(1)}초`);
console.log(`  ③배경 ${n('img')}/${cuts.length} · ④보정 ${n('ov')}/${needOv} · ⑤클립 ${n('clip')}/${cuts.length} · ⑥음성 ${n('voice')}/${cuts.length}`);
