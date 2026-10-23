#!/usr/bin/env node
// 렌더 QC — 감독(5단계)이 판정에 쓰는 수치를 전부 뽑는다. **취향이 아니라 숫자로 반려하기 위한 도구.**
// 사용: node pipeline/qc.mjs <프로젝트> [--frames]
//   --frames   컷 경계 +70ms · 훅 0/6/12f · 루프 첫끝 프레임을 output/<p>/qc/ 에 PNG 로 (눈검사용)
//
// ⚠️ 측정 대상이 파일마다 다르다:
//   데드에어·발화 점유율 → output/<p>/narration.wav   (render.mp4 는 BGM 이 무음을 메워 검출이 안 된다)
//   LUFS·트루피크·길이·fps → output/<p>/render.mp4     (실제 납품 레벨)
// ⚠️ 임계값이 검증되지 않은 항목은 판정하지 않고 **기준선(ℹ️)** 으로만 낸다.
//   검증 안 된 임계를 지어내면 승인된 영상을 실패로 찍는다 (docs/02-pitfalls.md 의 원칙).
// 기준 출처: docs/05-shorts.md §1-2 · docs/07-script.md §7-8 · docs/11-motion.md
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveProject } from './lib/project.mjs';
import { readSubs, readHeadlines, overlap } from './lib/scene.mjs';

const FRAMES = process.argv.includes('--frames');
const { dir, name, out } = resolveProject(
  process.argv.slice(2).find((a) => !a.startsWith('--')),
  { usage: '사용: node pipeline/qc.mjs <프로젝트> [--frames]' },
);

const sh = (c, a) => execFileSync(c, a, { encoding: 'utf8', maxBuffer: 64 << 20 });
// ⚠️ ffmpeg 는 측정 결과(ebur128·silencedetect·psnr)를 **stderr 로, 정상 종료하면서** 낸다.
//    try/catch 로 잡으면 성공 실행의 출력을 통째로 놓친다 (2026-09-07 실사고 — 무음 0곳·LUFS 공백으로 나왔다).
//    그리고 **성공 여부는 따로 봐야 한다** — 실행 실패·필터 오류를 무시하면 빈 출력이
//    "무음 0곳 · 발화 100%" 라는 정상 수치로 둔갑한다 (2026-09-08 감사에서 드러났다).
const ffErr = (a) => {
  const r = spawnSync('ffmpeg', a, { encoding: 'utf8', maxBuffer: 256 << 20 });
  if (r.error || r.status !== 0) {
    console.error(`\n  ✗ ffmpeg 측정 실패 (status ${r.status ?? '실행 불가'}) — 이 판정은 믿을 수 없다.`);
    console.error(`    ${(r.stderr || String(r.error || '')).trim().split('\n').slice(-3).join('\n    ')}`);
    process.exit(2);
  }
  return (r.stderr || '') + (r.stdout || '');
};

const R = [];   // 결과 행: [구분, 항목, 값, 기준, 판정]
const HOLDS = [];  // 600ms 초과 무음 구간 — 화면 모션이 있는지 F-2 에서 잰다
const OK = '✅', WARN = '⚠️', BAD = '❌', INFO = 'ℹ️';
const add = (g, k, v, std = '', verdict = INFO) => R.push([g, k, String(v), std, verdict]);
const gate = (cond, warnCond = null) => (cond ? OK : warnCond === null ? BAD : warnCond ? WARN : BAD);

const RENDER = path.join(out, 'render.mp4');
const NARR = path.join(out, 'narration.wav');
const CUTS = path.join(dir, 'cuts.json');
const REPO = path.dirname(path.dirname(dir));   // projects/<p> → 저장소 루트
const TL = path.join(dir, 'motion', 'timeline.ts');
const CAMERA = path.join(dir, 'motion', 'camera.ts');
const SUBS = path.join(dir, 'motion', 'subtitles.tsx');

// ⚠️ 렌더가 없어도 **동기·대본·자막·산출물** 항목은 돌아야 한다 — ③ 목소리 단계가 ④ 로 넘기기 전에
//    검증할 수단이 이것뿐이다. 렌더에 의존하는 항목(파일 규격·라우드니스·홀드·루프·프레임)만 건너뛴다.
//    (2026-09-07 감사: 지시서는 '렌더 전이면 동기 항목만 봐도 된다'는데 도구가 exit 1 이었다)
const hasRender = existsSync(RENDER);
if (!hasRender) console.log(`\n  ℹ️ render.mp4 없음 — 동기·대본·자막 항목만 검사한다 (렌더 후 다시 돌려라)`);

// ── 0. 심사 회차 — 렌더가 실제로 바뀐 횟수를 센다 ────────────────
// ⚠️ 감독은 매 루프마다 **새 에이전트**라 이전에 몇 번 돌았는지 모른다. 사람 기억에 맡기면
//    3회 상한이 작동하지 않는다 — 렌더 파일의 (수정시각·크기)로 자동으로 센다 (감독 지적, 2026-09-07).
const QCDIR = path.join(out, 'qc');
const HIST = path.join(QCDIR, 'history.json');
let round = 1;
if (hasRender) {
  const st = statSync(RENDER);
  const sig = `${Math.round(st.mtimeMs)}:${st.size}`;
  let hist = [];
  try { hist = JSON.parse(readFileSync(HIST, 'utf8')); } catch { hist = []; }
  if (hist[hist.length - 1]?.sig !== sig) hist.push({ sig, at: new Date().toISOString() });
  round = hist.length;
  mkdirSync(QCDIR, { recursive: true });
  writeFileSync(HIST, JSON.stringify(hist.slice(-20), null, 2) + '\n');
}

// ── A. 파일 규격 ────────────────────────────────────────────────
const probe = (f, entries) =>
  sh('ffprobe', ['-v', 'error', '-show_entries', entries, '-of', 'default=nw=1:nk=1', f]).trim().split('\n');
let vw, vh, rfr, nbf, DUR, FPSv;
if (hasRender) {
  [vw, vh, rfr, nbf] = probe(RENDER, 'stream=width,height,r_frame_rate,nb_frames');
  DUR = +probe(RENDER, 'format=duration')[0];
  FPSv = eval(rfr); // "60/1"
  add('파일', '총 길이', `${DUR.toFixed(2)}초`, '30~60초', gate(DUR >= 30 && DUR <= 60, DUR >= 20 && DUR <= 75));
  add('파일', '해상도', `${vw}×${vh}`, '1080×1920', gate(vw === '1080' && vh === '1920'));
  add('파일', 'fps', FPSv, '60 (스프링 언더샘플링 방지)', gate(FPSv === 60));
}

// ── B. 오디오 ───────────────────────────────────────────────────
// LUFS·트루피크는 납품 파일(render.mp4)에서
if (hasRender) {
const eb = ffErr(['-hide_banner', '-nostats', '-i', RENDER, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
const sum = eb.slice(eb.lastIndexOf('Summary'));
const I = +(sum.match(/I:\s*(-?[\d.]+)\s*LUFS/) || [])[1];
const TP = +(sum.match(/Peak:\s*(-?[\d.]+)\s*dBFS/) || [])[1];
// ⚠️ 값이 안 잡히면 **행을 생략하지 말고 실패로 낸다.** 생략하면 오디오 없는 영상이 조용히 통과한다
if (!Number.isNaN(I)) add('오디오', '통합 라우드니스', `${I.toFixed(1)} LUFS`, '-17~-13 (유튜브 -14 기준)', gate(I <= -13 && I >= -17, I <= -11 && I >= -19));
else add('오디오', '통합 라우드니스', '측정 불가', '납품 파일에 오디오 스트림이 있는가', FAIL);
if (!Number.isNaN(TP)) add('오디오', '트루피크', `${TP.toFixed(1)} dBTP`, '≤ -1.0', gate(TP <= -1.0, TP <= -0.3));
else add('오디오', '트루피크', '측정 불가', '납품 파일에 오디오 스트림이 있는가', FAIL);
}

// 데드에어·발화 점유율은 반드시 BGM 없는 narration.wav 에서 — 유닛 표(timeline.ts)가 필요해 C 뒤의 B-2 에서 잰다
if (!existsSync(NARR)) add('오디오', 'narration.wav', '없음', 'pipeline/narration.sh 로 생성', WARN);

// ── C. 타임라인 (motion/timeline.ts — Node 타입 스트리핑으로 직접 import) ──
let tl = null;
if (existsSync(TL)) {
  try { tl = await import(pathToFileURL(TL).href); } catch (e) { add('타임라인', 'import 실패', e.message.slice(0, 80), '', BAD); }
}
if (tl) {
  const N = tl.CUT_END_M.length;
  const SPEED = tl.SPEED ?? 1;
  const durs = tl.CUT_END_M.map((e, i) => (i === 0 ? e : e - tl.CUT_END_M[i - 1]) / SPEED);
  const sorted = [...durs].sort((a, b) => a - b);
  const med = sorted[Math.floor(N / 2)];
  add('타임라인', '컷 수', N, '12~25', gate(N >= 12 && N <= 25, N >= 8 && N <= 30));
  add('타임라인', '컷 길이 중앙값', `${med.toFixed(2)}초`, '2~3초', gate(med >= 2 && med <= 3, med >= 1.5 && med <= 3.5));
  add('타임라인', '컷 길이 범위', `${sorted[0].toFixed(2)} ~ ${sorted[N - 1].toFixed(2)}초`, '긴 컷은 의도된 홀드인가', INFO);
  add('타임라인', '실효 배속', `${SPEED}배`, '원음 합성 + 단일 atempo 가속 (pitfalls §11)', gate(SPEED >= 1, SPEED >= 1));
  // 렌더 길이 ↔ 타임라인 동기 (렌더가 없으면 타임라인 값을 기준 길이로 쓴다)
  const expect = tl.CUT_END_M[N - 1] / SPEED;
  if (hasRender) add('동기', '타임라인 vs 렌더 길이', `${expect.toFixed(2)} vs ${DUR.toFixed(2)}초`, '차이 ≤ 0.1초', gate(Math.abs(expect - DUR) <= 0.1, Math.abs(expect - DUR) <= 0.5));
  else { DUR = expect; add('타임라인', '예정 길이', `${expect.toFixed(2)}초`, '30~60초 (렌더 전 추정)', gate(expect >= 30 && expect <= 60, expect >= 20 && expect <= 75)); }
  // 비트 수 (컷 내 강조 시점) — 기준선만
  const beats = Object.values(tl.B || {}).reduce((a, o) => a + Object.keys(o).length, 0);
  // 기준선은 승인본 00002 의 실측값이다 — 00002 자신을 잴 때는 같은 값이 나오므로 정보량이 없다
  add('페이싱', '컷 전환 빈도', `10초당 ${((N / DUR) * 10).toFixed(1)}회`, `참조: 00002 = 3.3${name.startsWith('00002') ? ' (자기 자신)' : ''}`, INFO);
  add('페이싱', '비트 포함 변화', `10초당 ${(((N + beats) / DUR) * 10).toFixed(1)}회`, `참조: 00002 = 11.0${name.startsWith('00002') ? ' (자기 자신)' : ''}`, INFO);
  // 오디오 유닛
  if (tl.UNITS) add('타임라인', '오디오 유닛', `${tl.UNITS.length}개`, '앵커 컷 = say 있는 컷과 일치해야', INFO);
}

// ── B-2. 데드에어 — 유닛 경계(정상)와 유닛 내부(문제)를 갈라야 한다 ──
// ⚠️ 유닛 사이엔 반드시 무음이 생긴다 (유닛 N개 → 경계 N-1곳 + 끝 여운). 그걸 세서 반려하면
//    승인본이 실패로 찍힌다 (00002 실측: 경계 6 + 여운 1 = 7곳인데 데드에어는 0이다).
//    문제는 **유닛 경계가 아닌 곳의 무음**과 **과도하게 벌어진 경계**다.
//    또 silencedetect 는 말꼬리가 감쇠하는 지점부터 재므로 설계값보다 넓게 나온다 (docs/11 BGM 절).
if (existsSync(NARR)) {
  const nd = +probe(NARR, 'format=duration')[0];
  const sd = ffErr(['-hide_banner', '-nostats', '-i', NARR, '-af', 'silencedetect=noise=-45dB:d=0.35', '-f', 'null', '-']);
  const all2 = [];
  const re = /silence_start:\s*(-?[\d.]+)[\s\S]*?silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g;
  let m;
  while ((m = re.exec(sd))) all2.push({ s: +m[1], e: +m[2], d: +m[3] });
  const openTail = sd.match(/silence_start:\s*([\d.]+)(?![\s\S]*silence_end)/);
  // ⚠️ 끝 여운은 파일 끝에서 닫힌 무음으로 잡힌다 (열린 silence_start 로 남지 않는다) — 먼저 떼어낸다.
  //    안 떼면 '유닛 내부 데드에어'로 오분류된다 (2026-09-07 실사고).
  const tailIdx = all2.findIndex((x) => nd - x.e < 0.12);
  const tailD = tailIdx >= 0 ? all2[tailIdx].d : openTail ? nd - +openTail[1] : 0;
  const sil = all2.filter((_, i) => i !== tailIdx);
  // 유닛 시작 시각(표시 초) — 이 근처에서 끝나는 무음은 설계된 경계다
  const SPEED = tl?.SPEED ?? 1;
  const starts = (tl?.UNITS ?? []).map((u) => u.startM / SPEED);
  const nearBoundary = (x) => starts.some((s) => Math.abs(x.e - s) < 0.35);
  const edge = sil.filter(nearBoundary);
  const dead = sil.filter((x) => !nearBoundary(x));
  const speechSec = nd - sil.reduce((a, x) => a + x.d, 0) - tailD;
  const speechRaw = (speechSec / nd) * 100;
  // 여운이 파일 전체면(무음 placeholder) 분모가 0 이 된다 — NaN 대신 0% 로 (2026-09-07)
  const speechNoTail = nd - tailD > 0.01 ? (speechSec / (nd - tailD)) * 100 : 0;
  add('오디오', '발화 점유율', `${speechNoTail.toFixed(1)}% (여운 포함 ${speechRaw.toFixed(1)}%)`, '≥ 90%, 의도된 여운 제외 (docs/05 §1-2)', gate(speechNoTail >= 90, speechNoTail >= 85));
  add('오디오', '데드에어 (유닛 내부)', `${dead.length}곳`, '0곳 — 여기 잡히면 진짜 침묵이다', gate(dead.length === 0, dead.length <= 1));
  for (const x of dead) add('오디오', `  └ ❗${x.s.toFixed(2)}~${x.e.toFixed(2)}s`, `${x.d.toFixed(2)}초`, '유닛 경계가 아닌 무음 — 원인을 찾아라', BAD);
  const wide = edge.filter((x) => x.d > 0.6);
  HOLDS.push(...wide.map((x) => ({ s: x.s, e: x.e })));
  add('오디오', '유닛 경계 무음', `${edge.length}곳 (최대 ${edge.length ? Math.max(...edge.map((x) => x.d)).toFixed(2) : 0}초)`, `유닛 ${starts.length}개면 ${Math.max(0, starts.length - 1)}곳이 정상 · 절대 상한 600ms`, gate(wide.length === 0, wide.length <= 2));
  for (const x of wide) add('오디오', `  └ ${x.s.toFixed(2)}~${x.e.toFixed(2)}s`, `${x.d.toFixed(2)}초`, '600ms 초과 — 홀드로 의도했나 (화면 모션 필수)', INFO);
  // ⚠️ 상한이 없으면 뒤쪽 30초가 통째로 '여운'으로 면제되어 발화 점유율 100% 가 나온다 (2026-09-08)
  if (tailD > 1.5) add('오디오', '끝 여운', `${tailD.toFixed(2)}초`, '≤ 1.5초 — 이보다 길면 여운이 아니라 빈 화면이다', FAIL);
  else if (tailD > 0.3) add('오디오', '끝 여운', `${tailD.toFixed(2)}초`, '루프로 이어지는 여운인가', INFO);
}

// ── D. 대본 (cuts.json) ─────────────────────────────────────────
const J = JSON.parse(readFileSync(CUTS, 'utf8'));
const cuts = J.cuts || [];
const said = cuts.filter((c) => c.say);
const syl = (s) => (s.match(/[가-힣]/g) || []).length;
// cuts.json dur 합 ↔ timeline.ts 동기 (수동 동기라 어긋나기 쉽다)
const durSum = cuts.reduce((a, c) => a + (c.dur || 0), 0);
if (tl) {
  const tlTotal = tl.CUT_END_M[tl.CUT_END_M.length - 1] / (tl.SPEED ?? 1);
  add('동기', 'cuts.json dur 합 vs timeline', `${durSum.toFixed(2)} vs ${tlTotal.toFixed(2)}초`, '차이 ≤ 0.15초 (수동 동기)', gate(Math.abs(durSum - tlTotal) <= 0.15, Math.abs(durSum - tlTotal) <= 0.6));
  add('동기', 'cuts.json 컷 수 vs timeline', `${cuts.length} vs ${tl.CUT_END_M.length}`, '같아야 한다', gate(cuts.length === tl.CUT_END_M.length));
  if (tl.UNITS) {
    const ids = said.map((c) => c.id).join(',');
    const files = tl.UNITS.map((u) => u.file).join(',');
    add('동기', 'say 있는 컷 vs UNITS', ids === files ? '일치' : `${ids} ≠ ${files}`, '같아야 한다', gate(ids === files));
  }
}
// 훅 — 첫 컷의 문장별 음절
if (cuts[0]?.say) {
  const sents = cuts[0].say.split(/(?<=[.!?])\s+/).filter(Boolean);
  sents.forEach((s, i) => add('훅', `cut-01 문장 ${i + 1}`, `${syl(s)}음절  "${s.slice(0, 28)}${s.length > 28 ? '…' : ''}"`, '정보 문장은 15음절 이내', i === 0 ? INFO : gate(syl(s) <= 15, syl(s) <= 20)));
}
// 문장 길이 분산 — 균일하면 AI 티 (docs/07 §1)
const lens = said.flatMap((c) => c.say.split(/(?<=[.!?])\s+/).filter(Boolean).map(syl)).filter((n) => n > 0);
if (lens.length > 2) {
  const ratio = Math.max(...lens) / Math.min(...lens);
  add('대본', '문장 길이 최장/최단', `${ratio.toFixed(1)}배 (${Math.min(...lens)}~${Math.max(...lens)}음절)`, '≥ 2배 (균일하면 AI 티)', gate(ratio >= 2, ratio >= 1.6));
  const spine = Math.max(...lens) / lens.reduce((a, b) => a + b, 0) * 100;
  add('대본', '척추 문장 비중', `${spine.toFixed(0)}%`, '참조군 38% (docs/07 §8)', INFO);
}
// 금지 패턴
const all = said.map((c) => c.say).join(' ');
const BAN = [
  [/첫째|둘째|셋째/g, '기계적 열거 (S1)'],
  [/결론적으로|정리하자면|요약하면/g, '결산 표현 (S1)'],
  [/경우가 많습니다|것으로 보입니다|수 있습니다/g, 'hedging (S2)'],
  [/거든요|잖아요|[가-힣]죠[.!?,\s]/g, '요체·-거든요 (아나운서 페르소나 위반 · docs/12)'],
];
const hits = BAN.map(([re, label]) => [label, (all.match(re) || []).length]).filter(([, n]) => n > 0);
add('대본', '금지 패턴', hits.length ? hits.map(([l, n]) => `${l}×${n}`).join(' · ') : '없음', 'docs/07-script.md §1 · docs/12', gate(hits.length === 0));

// ── E. 자막 (공유 파서 — export.mjs 와 같은 것을 봐야 어긋남이 드러난다) ──
const chunks = tl ? readSubs(dir, { speed: tl.SPEED ?? 1, total: DUR }) : [];
if (chunks.length) {
  add('자막', '청크 수', chunks.length, `2~4어절 청크 · 컷 ${cuts.length}개보다 많아야`, gate(chunks.length >= cuts.length, chunks.length >= cuts.length * 0.7));
  const first3 = chunks.filter((c) => c.at < 3.0);
  add('자막', '첫 3초 전달 내용', first3.map((c) => c.t).join(' ') || '(없음)', '숫자·대상어·마감이 여기 다 있어야 (docs/05 §1)', first3.length ? INFO : BAD);
  const last = chunks[chunks.length - 1];
  add('자막', '마지막 청크 등장', `${last.at.toFixed(2)}초 / ${DUR.toFixed(2)}초`, '끝나기 전에 떠야 한다', gate(last.at < DUR - 0.3));
  const over = chunks.filter((c) => c.t.replace(/[^가-힣a-zA-Z0-9]/g, '').length > 22);
  if (over.length) add('자막', '긴 청크', `${over.length}개 (예: "${over[0].t}")`, '2~4어절 — 길면 한 줄에 안 들어간다', WARN);
} else if (existsSync(SUBS)) {
  add('자막', '파싱 0개', 'subtitles.tsx 는 있는데 SUBS 를 못 읽었다', '파일 구조가 바뀌었나 (lib/scene.mjs)', BAD);
}

// ── E-2. 산출물 동기 — 프레임 밖에서 나는 사고다 (2026-09-07 실사고) ──
// export.mjs 가 내는 SRT 가 실제 화면 자막과 다른 내용이면 그대로 업로드된다.
{
  const srtP = path.join(out, 'subtitles.srt');
  if (existsSync(srtP) && chunks.length) {
    const srtText = readFileSync(srtP, 'utf8').replace(/^\d+$|^[\d:,]+ --> .*$/gm, ' ');
    const o = overlap(chunks.map((c) => c.t).join(' '), srtText);
    add('산출물', 'subtitles.srt ↔ 구운 자막', `${(o * 100).toFixed(0)}% 일치`, '≥ 90% — 다르면 음성과 무관한 자막이 나간다', gate(o >= 0.9, o >= 0.7));
  } else if (chunks.length) {
    add('산출물', 'subtitles.srt', '없음', 'node pipeline/export.mjs 로 생성', WARN);
  }
  // cuts.json 의 text 가 구안으로 남았는지 (설계도가 렌더와 다른 판본이면 다음 사람이 속는다)
  // ⚠️ 컷 경계는 timeline.ts 로 잡는다 — cuts[]._a/_b 는 export.mjs 가 붙이는 필드라 여기엔 없다 (2026-09-07 버그)
  if (chunks.length && tl) {
    const stale = cuts.filter((c, i) => {
      if (!c.text || i >= tl.CUT_END_M.length) return false;
      const a = tl.startF(i) / tl.FPS, b = tl.endF(i) / tl.FPS;
      const inCut = chunks.filter((x) => x.at >= a - 0.2 && x.at < b).map((x) => x.t).join(' ');
      return inCut && overlap(c.text, inCut) < 0.4;
    });
    add('산출물', 'cuts.json text ↔ 화면 자막', stale.length ? `${stale.length}/${cuts.length}컷 불일치 (${stale.slice(0, 3).map((c) => c.id).join(', ')}…)` : '일치', '설계도가 현행이어야 한다', gate(stale.length === 0, stale.length <= cuts.length * 0.3));
  }
}

// ── E-3. 헤드라인 ↔ 자막 중복 (docs/09-safezone.md §3·§6) ──
// 헤드라인은 그 구간의 핵심 한 마디, 자막은 지금 말하는 내용 — 같은 말이면 화면만 지저분해진다.
// 숫자 표기(10% ↔ 십 프로)를 정규화해서 비교한다.
if (tl && chunks.length) {
  const H = readHeadlines(dir);
  if (H.size) {
    const dup = [];
    for (const [n, h] of H) {
      const a = tl.startF(n - 1) / tl.FPS, b = tl.endF(n - 1) / tl.FPS;
      const sub = chunks.filter((c) => c.at >= a - 0.2 && c.at < b).map((c) => c.t).join(' ');
      if (sub && overlap(h, sub) >= 0.6) dup.push(`c${String(n).padStart(2, '0')} "${h}"`);
    }
    // 규칙은 docs/09 §3 에 있지만 60% 라는 임계는 이 도구가 정한 값이다 — 경고까지만 하고 판단은 감독이 한다
    add('헤드라인', '자막과 60%+ 중복', `${dup.length}/${H.size}컷`, '나레이션과 다른 절반을 맡아야 (docs/09 §3)', dup.length === 0 ? OK : WARN);
    if (dup.length) add('헤드라인', '  └ 중복 컷', dup.slice(0, 4).join(' · ') + (dup.length > 4 ? ' …' : ''), '화면과 나레이션이 같은 말을 한다', INFO);
  } else {
    add('헤드라인', '추출 0개', 'cuts/*.tsx 에서 <HeadZone> 을 못 읽었다', '구조가 바뀌었나 (lib/scene.mjs)', WARN);
  }
}

// ── E-4. 브랜드 자산 (2026-09-07 사용자 지시) ──
{
  const sceneDir = path.join(dir, 'assets', 'scene');
  const files = existsSync(sceneDir)
    ? readdirSync(sceneDir).filter((f) => /\.(png|jpe?g|webp|svg)$/i.test(f))
    : [];
  add('브랜드', '주제 CI·소재 이미지', files.length ? `${files.length}개 (${files.slice(0, 3).join(', ')})` : '없음',
    '주제에 브랜드·기관이 있으면 필수 — assets/scene/ (resources/logos/README.md)',
    files.length ? OK : WARN);
  const used = files.filter((f) => {
    const pat = new RegExp(`project/${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    return readdirSync(path.join(dir, 'motion')).some((x) => x.endsWith('.tsx') && pat.test(readFileSync(path.join(dir, 'motion', x), 'utf8')))
      || readdirSync(path.join(dir, 'motion', 'cuts')).some((x) => pat.test(readFileSync(path.join(dir, 'motion', 'cuts', x), 'utf8')));
  });
  if (files.length) add('브랜드', '씬에서 실제 참조', `${used.length}/${files.length}`, '넣어만 두고 안 쓰면 화면에 안 나온다', gate(used.length === files.length, used.length > 0));
}

// ── F. 모션 예산 (motion/camera.ts — @engine 별칭이라 import 불가, 텍스트 스캔) ──
if (existsSync(CAMERA)) {
  const src = readFileSync(CAMERA, 'utf8');
  const seg = (nameRe) => {
    const i = src.search(nameRe);
    if (i < 0) return '';
    const j = src.indexOf('];', i);
    return j < 0 ? '' : src.slice(i, j);
  };
  const nShake = (seg(/const\s+SHAKES\s*=/).match(/\{\s*at:/g) || []).length;
  const nPunch = (seg(/const\s+PUNCHES\s*=/).match(/\{\s*at:/g) || []).length;
  add('모션', '대형 임팩트(셰이크)', `${nShake}회`, '36초 기준 4회 상한 (docs/11)', gate(nShake <= 4, nShake <= 5));
  add('모션', '카메라 펀치인', `${nPunch}회`, '임팩트와 짝 (텍스트 스캔)', INFO);
}

// ── F-2. 홀드 구간에 화면 모션이 있나 ───────────────────────────
// docs/11 이 요구하는 건 무음의 길이가 아니라 "홀드에 화면 모션이 반드시 있어야 한다" 이다.
// 정지 화면 + 무음은 버퍼링과 구별되지 않는다. ⚠️ freezedetect 는 필름 그레인 때문에 무력하다 —
// 크게 축소해 그레인을 평균으로 지운 뒤 프레임간 휘도차(YAVG)를 본다.
if (hasRender && HOLDS.length) {
  const md = ffErr(['-hide_banner', '-nostats', '-i', RENDER,
    '-vf', 'scale=96:171,tblend=all_mode=difference,signalstats,metadata=print', '-f', 'null', '-']);
  const fr = [];
  const rx = /pts_time:([\d.]+)[\s\S]*?YAVG=([\d.]+)/g;
  let mm;
  while ((mm = rx.exec(md))) fr.push({ t: +mm[1], y: +mm[2] });
  if (fr.length) {
    const mean = fr.reduce((a, x) => a + x.y, 0) / fr.length;
    for (const h of HOLDS) {
      const win = fr.filter((x) => x.t >= h.s && x.t <= h.e);
      if (!win.length) continue;
      const mv = win.reduce((a, x) => a + x.y, 0) / win.length;
      const ratio = mv / mean;
      add('홀드', `${h.s.toFixed(2)}~${h.e.toFixed(2)}s 모션량`, `${mv.toFixed(2)} (전체 평균 ${mean.toFixed(2)} 대비 ${(ratio * 100).toFixed(0)}%)`,
        '평균의 50% 이상 — 밑돌면 정지 화면 + 무음이다', gate(ratio >= 0.5, ratio >= 0.3));
    }
  }
}

// ── F-3. 레이아웃 위험 (소스 정적 검사) ──────────────────────────
// 2026-09-08 신설. 사용자가 "뱃지 안 문자가 아래쪽이 다 잘려" 라고 지적했는데 **감독이 통과시켰다.**
// 원인은 감독이 게을러서가 아니라 **잴 계기가 없어서**다 — 프레임을 축소해 눈으로 보면 몇 픽셀은 안 보인다.
// 여기서 재는 건 픽셀이 아니라 **그 결함을 만드는 코드 패턴**이다. 결정론적이고 렌더 없이 돈다.
{
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.tsx?$/.test(e.name)) files.push(f);
    }
  };
  walk(path.join(REPO, 'pipeline', 'motion', 'src'));
  if (existsSync(path.join(dir, 'motion'))) walk(path.join(dir, 'motion'));

  const clip = [], grow = [];
  for (const f of files) {
    // 주석은 검사에서 뺀다 — 설명 문장이 패턴에 걸려 오탐이 난다 (2026-09-08)
    const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
    const rel = path.relative(REPO, f);
    // ① overflow:hidden 인 상자가 글자 크기를 정하면서 줄높이를 안 정하면 → 받침이 깎인다
    for (const m of src.matchAll(/overflow:\s*'hidden'/g)) {
      let i = m.index, depth = 0, start = -1;
      for (let k = i; k >= 0; k--) {           // 감싸는 객체 리터럴을 찾는다
        if (src[k] === '}') depth++;
        else if (src[k] === '{') { if (depth === 0) { start = k; break; } depth--; }
      }
      if (start < 0) continue;
      depth = 0; let end = src.length;
      for (let k = start; k < src.length; k++) {
        if (src[k] === '{') depth++;
        else if (src[k] === '}') { if (--depth === 0) { end = k; break; } }
      }
      const obj = src.slice(start, end);
      if (/fontSize:/.test(obj) && !/lineHeight:/.test(obj))
        clip.push(`${rel}:${src.slice(0, i).split('\n').length}`);
    }
    // ② 레이아웃 높이/폭을 애니메이션하면 형제가 밀린다 — transform 으로 해야 한다
    for (const m of src.matchAll(/(height|width):\s*[\d.]+\s*\*\s*[A-Za-z_$]/g))
      grow.push(`${rel}:${src.slice(0, m.index).split('\n').length}`);
  }
  add('레이아웃', '텍스트 잘림 위험', clip.length ? `${clip.length}곳` : '없음',
    'overflow:hidden + fontSize 인데 lineHeight 없음 → 한글 받침이 깎인다', gate(clip.length === 0, false));
  for (const x of clip.slice(0, 5)) add('레이아웃', `  └ ${x}`, '', 'lineHeight 를 1.3 이상 주거나 overflow 를 풀어라', INFO);
  add('레이아웃', '레이아웃 높이 애니메이션', grow.length ? `${grow.length}곳` : '없음',
    'height/width 를 곱셈으로 키우면 형제 배치가 밀린다 → transform 으로', gate(grow.length === 0, grow.length <= 1));
  for (const x of grow.slice(0, 5)) add('레이아웃', `  └ ${x}`, '', 'scaleY/scaleX + transformOrigin 으로 바꿔라', INFO);

  // ③ 존 경계가 규격에서 겹치는가 (2026-09-08: 헤드존 344+300=644 > 페이로드 636 이었다)
  const tok = readFileSync(path.join(REPO, 'pipeline/motion/src/tokens.ts'), 'utf8');
  const hz = readFileSync(path.join(REPO, 'pipeline/motion/src/HeadZone.tsx'), 'utf8');
  const hlTop = +(tok.match(/HL_TOP\s*=\s*(\d+)/) || [])[1];
  const payTop = +(tok.match(/PAYLOAD_TOP\s*=\s*(\d+)/) || [])[1];
  const hzH = +(hz.match(/height:\s*(\d+),/) || [])[1];
  if (hlTop && payTop && hzH) {
    const bottom = hlTop + hzH;
    add('레이아웃', '존 경계 (헤드존 ↔ 페이로드)', `${hlTop}~${bottom} vs ${payTop}`,
      '헤드존 하단이 페이로드 상단을 넘으면 안 된다', gate(bottom <= payTop, bottom <= payTop + 4));
  }
}

// ── G. 루프 — 첫 프레임 vs 마지막 프레임 ────────────────────────
// ⚠️ -ss 시크는 디코드 아티팩트가 섞인다 (pitfalls §8) — select 필터로 전체 디코드
const QC = QCDIR;
if (hasRender) {
const LAST = (nbf ? +nbf : Math.round(DUR * FPSv)) - 1;
// ⚠️ 폴더째 지우면 회차 기록(history.json)이 날아간다 — PNG 만 지운다
mkdirSync(QC, { recursive: true });
for (const f of readdirSync(QC).filter((f) => f.endsWith('.png'))) rmSync(path.join(QC, f), { force: true });
ffErr(['-y', '-hide_banner', '-nostats', '-i', RENDER, '-vf', `select='eq(n\\,0)+eq(n\\,${LAST})'`, '-vsync', '0', path.join(QC, 'loop-%d.png')]);
const f0 = path.join(QC, 'loop-1.png'), f1 = path.join(QC, 'loop-2.png');
if (existsSync(f0) && existsSync(f1)) {
  const psnrOut = ffErr(['-hide_banner', '-nostats', '-i', f0, '-i', f1, '-lavfi', 'psnr', '-f', 'null', '-']);
  const p = +(psnrOut.match(/average:([\d.inf]+)/) || [])[1];
  if (!Number.isNaN(p)) add('루프', '첫↔끝 프레임 PSNR', `${p.toFixed(1)}dB`, `참조: 00002 = 14.7${name.startsWith('00002') ? ' (자기 자신 — 정보 없음)' : ''} · 화질 비교라 레이아웃 일치는 눈으로`, INFO);
}

}

// ── H. 눈검사 프레임 ────────────────────────────────────────────
let frameList = [];
if (hasRender && FRAMES && tl) {
  const marks = [];
  for (const f of [0, 6, 12, 30, 60]) marks.push({ f, tag: `훅 ${(f / tl.FPS).toFixed(2)}초` });
  for (let i = 1; i < tl.CUT_END_M.length; i++)
    marks.push({ f: tl.startF(i) + Math.round(0.07 * tl.FPS), tag: `컷${String(i + 1).padStart(2, '0')} 경계+70ms` });
  const ordered = [...marks].sort((a, b) => a.f - b.f);
  const sel = ordered.map((x) => `eq(n\\,${x.f})`).join('+');
  ffErr(['-y', '-hide_banner', '-nostats', '-i', RENDER, '-vf', `select='${sel}',scale=540:-1`, '-vsync', '0', path.join(QC, 'f-%02d.png')]);
  frameList = ordered.map((x, i) => `f-${String(i + 1).padStart(2, '0')}.png  ${x.tag} (${(x.f / tl.FPS).toFixed(2)}초)`);
  add('눈검사', 'PNG 추출', `${ordered.length}장 → projects/${name}/output/qc/`, '훅 5장 + 컷 경계 전부 (docs/11 경계 QA)', INFO);
}

// ── 출력 ────────────────────────────────────────────────────────
const W = [Math.max(...R.map((r) => [...r[0]].length)), Math.max(...R.map((r) => [...r[1]].length)), Math.max(...R.map((r) => [...r[2]].length))];
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - [...s].length));
const overCap = round > 3;
console.log(hasRender
  ? `\n  QC — ${name}  (render.mp4 ${DUR.toFixed(2)}초)  ·  심사 회차 ${round}${overCap ? ' ⚠️ 재렌더 3회 상한 초과 — 멈추고 사용자에게 보고하라' : '/3'}\n`
  : `\n  QC — ${name}  (렌더 전 · 동기·대본·자막만)\n`);
let lastG = '';
for (const [g, k, v, std, verdict] of R) {
  console.log(`  ${verdict} ${pad(g === lastG ? '' : g, W[0])} ${pad(k, W[1])}  ${pad(v, W[2])}  ${std ? '│ ' + std : ''}`);
  lastG = g;
}
if (frameList.length) {
  console.log(`\n  눈검사 — projects/${name}/output/qc/ (Read 로 직접 봐라. 검사 통과는 화면이 맞다는 뜻이 아니다)`);
  for (const l of frameList) console.log(`     ${l}`);
}
const nBad = R.filter((r) => r[4] === BAD).length;
const nWarn = R.filter((r) => r[4] === WARN).length;
console.log(`\n  ${nBad ? BAD : nWarn ? WARN : OK} 실패 ${nBad} · 경고 ${nWarn} · 통과 ${R.filter((r) => r[4] === OK).length} · 기준선 ${R.filter((r) => r[4] === INFO).length}`);
console.log(`  ℹ️ 는 검증된 임계가 없는 항목이다 — 수치를 보고 사람이 판단한다 (지어낸 임계로 반려하지 마라)\n`);
process.exit(nBad ? 2 : 0);
