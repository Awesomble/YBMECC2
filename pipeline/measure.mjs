#!/usr/bin/env node
// ③ 목소리 — **발화 실측기**. 손으로 ffmpeg 를 컷 수만큼 돌리던 일을 대신한다.
// 사용: node pipeline/measure.mjs <프로젝트> [--apply]
//
//   voice/<유닛>.m4a 를 전부 silencedetect 로 재서
//     · 발화 끝 (파일 꼬리 무음이 시작되는 지점)
//     · dur 제안 = 발화 끝 + 0.13초 (4프레임 @60fps)
//     · UNITS 의 startM 누적
//   를 내고, `motion/timeline.ts` 에 붙일 초안을 출력한다.
//
//   --apply 를 주면 `cuts.json` 의 dur 를 실측값으로 갱신한다 (timeline.ts 는 손으로 옮긴다 — 비트·CAM 이 섞여 있다).
//
// ⚠️ 모든 시각은 **원음(1.0배) 초**다. voice/*.m4a 가 원음 합성이기 때문이다 (pitfalls §11).
//    narration.wav 는 배속이 걸려 있으므로 여기서 쓰지 않는다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { resolveProject } from './lib/project.mjs';
import {voiceFile} from './lib/workflow-state.mjs';
import {syncTimeline} from './lib/timing.mjs';

const APPLY = process.argv.includes('--apply');
const { dir, name } = resolveProject(
  process.argv.slice(2).find((a) => !a.startsWith('--')),
  { usage: '사용: node pipeline/measure.mjs <프로젝트> [--apply]' },
);

const TAIL_PAD = 0.13;      // 발화 끝 뒤 여백 (4프레임 @60fps) — docs/05-shorts.md §1-2
const CLAUSE_MIN = 0.08;    // 이만큼 이상 쉬면 절 휴지로 본다 (docs/11-motion.md)
const NOISE = '-45dB';

// ⚠️ ffmpeg 는 측정 결과를 stderr 로, 정상 종료하면서 낸다 (pitfalls §14)
const ff = (a) => {
  const r = spawnSync('ffmpeg', a, { encoding: 'utf8', maxBuffer: 64 << 20 });
  return (r.stderr || '') + (r.stdout || '');
};
const dur = (f) =>
  +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim();

const J = JSON.parse(readFileSync(path.join(dir, 'cuts.json'), 'utf8'));
const cuts = J.cuts || [];
const units = cuts.filter((c) => c.say);
if (!units.length) { console.error('✗ say 가 있는 컷이 없다 — ② 구조 단계부터'); process.exit(1); }

const missing = units.filter((c) => !existsSync(voiceFile(dir,J,c)));
if (missing.length) {
  console.error(`✗ voice 파일 없음: ${missing.map((c) => c.id).join(', ')}`);
  console.error(`  먼저: node pipeline/tts.mjs ${name}   (화면부터 잡을 땐 TTS_ENGINE=say)`);
  process.exit(1);
}

/** 한 유닛의 무음 구간 목록과 발화 끝을 잰다 (원음 초) */
function analyze(file) {
  const total = dur(file);
  const out = ff(['-hide_banner', '-nostats', '-i', file, '-af', `silencedetect=noise=${NOISE}:d=${CLAUSE_MIN}`, '-f', 'null', '-']);
  const sil = [];
  const re = /silence_start:\s*(-?[\d.]+)[\s\S]*?silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g;
  let m;
  while ((m = re.exec(out))) sil.push({ s: +m[1], e: +m[2], d: +m[3] });
  // 파일 끝에서 닫힌 무음 = 꼬리 무음. 그 시작이 발화 끝이다 (pitfalls §14 와 같은 함정)
  const open = out.match(/silence_start:\s*([\d.]+)(?![\s\S]*silence_end)/);
  const tailIdx = sil.findIndex((x) => total - x.e < 0.05);
  const speechEnd = tailIdx >= 0 ? sil[tailIdx].s : open ? +open[1] : total;
  const inner = sil.filter((_, i) => i !== tailIdx);
  return { total, speechEnd, clauses: inner };
}

// 유닛이 몇 개 컷을 관통하는가 — 앵커 다음 say:"" 컷들이 그 유닛에 속한다
const spanOf = (id) => {
  const i = cuts.findIndex((c) => c.id === id);
  let n = 1;
  while (i + n < cuts.length && !cuts[i + n].say) n++;
  return n;
};

const SPEED = (() => {
  if(J.timing?.version===1) return J.timing.speed;
  const p = path.join(dir, 'motion', 'timeline.ts');
  const m = existsSync(p) && readFileSync(p, 'utf8').match(/export const SPEED\s*=\s*([\d.]+)/);
  // 🔴 폴백은 **1.2** 다 — 규약값이고 `narration.sh` 기본값이다 (CLAUDE.md · docs/14 §3 · stage-gate).
  //    1.1 은 레거시 Remotion 판 전용. 폴백이 1.1 이던 탓에 timeline.ts 가 없거나 옛 템플릿을 쓴
  //    프로젝트에서 dur 이 ÷1.1 로 계산돼 나레이션과 어긋났다 (2026-09-15 · 00017 · pitfalls §98).
  return m ? +m[1] : 1.2;
})();

const rows = [];
let acc = 0;             // 유닛 시작 누적 (원음 초)
const unitInfo = [];
for (const c of units) {
  const a = analyze(voiceFile(dir,J,c));
  const suggested = +Math.max(a.total, a.speechEnd + TAIL_PAD).toFixed(3);
  const span = spanOf(c.id);
  unitInfo.push({ id: c.id, startM: +acc.toFixed(3), span, ...a, suggested });
  // ⚠️ 관통 유닛은 앵커 컷 하나보다 길어야 **정상**이다 — 비교하면 안 된다 (설계가 그렇다)
  const note = span > 1
    ? `관통 ${span}컷`
    // ⚠️ dur 는 **표시 초**, suggested 는 **원음 초**다. 그대로 빼면 정상 dur 를 틀렸다고 찍는다 (2026-09-08)
    //    그리고 길다(홀드)와 짧다(말 잘림)는 전혀 다른 사건이다 — 뭉뚱그리면 의도한 홀드가 오류로 보인다
    : (() => {
        const d = (c.dur ?? 0) - suggested / SPEED;
        if (d < -0.05) return `🔴 ${(-d).toFixed(2)}초 모자람 — 말이 잘린다`;
        if (d > 0.05) return `홀드 +${d.toFixed(2)}초 (의도한 것인가)`;
        return '일치';
      })();
  rows.push([c.id, `${a.total.toFixed(2)}s`, `${a.speechEnd.toFixed(2)}s`, `${suggested.toFixed(3)}s`,
    `${(c.dur ?? 0).toFixed(3)}s`, note]);
  acc += suggested;
}

const W = [0, 1, 2, 3, 4].map((i) => Math.max(...rows.map((r) => [...String(r[i])].length), 6));
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - [...String(s)].length));
console.log(`\n  발화 실측 — ${name}  (원음 초 · 유닛 ${units.length}개)\n`);
console.log(`  ${pad('유닛', W[0])} ${pad('파일길이', W[1])} ${pad('발화끝', W[2])} ${pad('유닛 발화', W[3])} ${pad('앵커컷 dur', W[4])}`);
console.log(`  ${'─'.repeat(W.reduce((a, b) => a + b, 0) + 12)}`);
for (const r of rows) console.log(`  ${pad(r[0], W[0])} ${pad(r[1], W[1])} ${pad(r[2], W[2])} ${pad(r[3], W[3])} ${pad(r[4], W[4])} ${r[5]}`);

console.log(`
  '유닛 발화' = 발화 끝 + ${TAIL_PAD}초. **관통 유닛은 앵커 컷 dur 보다 길어야 정상이다** —
  그 유닛이 여러 컷을 덮기 때문이다. 단일 컷 유닛만 dur 와 같아야 한다.

  ── motion/timeline.ts 에 붙일 UNITS (홀드 없는 최소값) ──`);
console.log('export const UNITS = [');
for (const u of unitInfo) console.log(`  {file: '${u.id}', startM: ${u.startM}},`);
console.log('] as const;');
console.log(`  ⚠️ 이건 **쉼 없이 붙였을 때**의 값이다. 의도한 홀드·컷 경계 여백은 여기에 더해라
     (00002 는 유닛 사이에 0.3~0.6초를 두었다 — 그만큼 startM 이 뒤로 밀린다).`);

const totalM = unitInfo.reduce((a, u) => a + u.suggested, 0);
console.log(`\n  총 발화 ${totalM.toFixed(2)}초(원음) → 실효 ${SPEED}배에서 **${(totalM / SPEED).toFixed(2)}초**   목표 30~60초`);

if (APPLY) {
  let n = 0;
  let skipped = 0;
  for (const u of unitInfo) {
    // ⚠️ 관통 유닛의 dur 는 앵커 컷 하나의 길이지 유닛 길이가 아니다 — 덮어쓰면 타임라인이 망가진다
    if (u.span > 1) { skipped++; continue; }
    const c = cuts.find((x) => x.id === u.id);
    if (c && Math.abs((c.dur ?? 0) - (u.suggested / SPEED + (c?.voice_offset_s || 0))) > 0.005) { c.dur = +((u.suggested / SPEED + (c?.voice_offset_s || 0))).toFixed(3); n++; }
  }
  if(J.timing?.version===1) syncTimeline(dir,J);
  writeFileSync(path.join(dir, 'cuts.json'), JSON.stringify(J, null, 2) + '\n');
  console.log(`\n  ✔ cuts.json 의 dur ${n}개 갱신 (표시 초 = 원음 ÷ ${SPEED}) · 관통 유닛 ${skipped}개는 건너뜀`);
  console.log(J.timing?.version===1 ? '  ✔ timeline.ts 파생본도 갱신했다. 관통 컷 내부 분할·의도한 홀드는 cuts.json에서 정한다' : '  레거시 시간축은 timing.mjs --migrate로 보존 이전한 뒤 자동 동기화한다');
} else {
  console.log(`\n  --apply 를 주면 cuts.json 의 dur 를 실측값으로 갱신한다`);
}
console.log('');
