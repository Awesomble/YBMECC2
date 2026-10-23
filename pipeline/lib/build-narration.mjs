#!/usr/bin/env node
// 나레이션 조립 v6 (v9.5) — 구절 레벨링된 유닛(projects/<p>/output/leveled/, level-units.py 산출)을 단일 atempo 가속으로 배치.
// ⚠️ 먼저 level-units.py — Old radio 의 문두 구절 램프(0.5~1.5s 에 3~8dB, 원본 운율)를 창 단위 AGC 로 편다.
// dynaudnorm(80ms)·어택 램프는 레벨링이 대체해서 제거 (docs/02-pitfalls §12). 1.5배 마스터 + 되늘이기 캐스케이드는 폐기 (§11).
// 유닛 표·총 길이는 프로젝트 motion/timeline.ts (UNITS · CUT_END_M) 에서 읽는다 — 한 곳만 고치면 된다.
// 사용: node pipeline/lib/build-narration.mjs <프로젝트> [실효배속=1.10]   (보통은 pipeline/narration.sh 로)
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {readTiming,syncTimeline} from './timing.mjs';
import {narrationInputHash,fileHash,readJson,voiceState,audioInfo,voiceFile} from './workflow-state.mjs';
import {resolveProject} from './project.mjs';

const {dir, name, out} = resolveProject(process.argv[2], {usage: '사용: node pipeline/lib/build-narration.mjs <프로젝트> [실효배속]'});
const project=readJson(join(dir,'cuts.json'));
const timing=readTiming(dir,project);
if(timing.canonical) syncTimeline(dir,project);
const tl={SPEED:timing.speed,CUT_END_M:timing.ends,UNITS:timing.units};
for(const c of project.cuts.filter(c=>c.say)) {
  if(voiceState(dir,project,c).state!=='current') throw new Error(`${c.id}: 음성 지문이 현재 대본과 다르거나 없다 — tts.mjs --status`);
}

const VOICE = join(out, 'leveled');
const OUT = join(out, 'narration.wav');

const SPEED = parseFloat(process.argv[3] ?? String(timing.speed));
const SCALE = 1 / SPEED;
const ATEMPO = SPEED.toFixed(4);
const TOTAL_M = tl.CUT_END_M[tl.CUT_END_M.length - 1]; // 마지막 컷 끝 (원음 초)
if (tl.SPEED !== undefined && Math.abs(tl.SPEED - SPEED) > 1e-6)
  throw new Error(`시간축 SPEED=${tl.SPEED}와 요청 배속 ${SPEED}가 다르다`);

// [파일, 시작(원음초), 미세 어택 램프 dB(선택 comp, 기본 0)] — 구절 보정은 level-units.py 가 구웠다.
// ⚠️ 무성 자음 온셋(추·십 등 ㅊ/ㅅ)은 원래 에너지가 낮다 — 램프로 키우면 치찰음만 커진다. 모음 온셋에만 쓸 것
const UNITS = tl.UNITS.map((u) => [u.file, u.startM, u.comp ?? 0]);

const stateFile=OUT+'.state.json';
const inputHash=narrationInputHash(dir,project,timing);
try {
  const state=readJson(stateFile);
  if(state.inputHash===inputHash && state.fileHash===fileHash(OUT)) {audioInfo(OUT);console.log('✔ 동일 음성·시간축 나레이션 재사용');process.exit(0);}
} catch {}
const levels=readJson(join(VOICE,'state.json'));
for(const c of project.cuts.filter(c=>c.say)) {
  const meta=levels[c.id];
  if(!meta || meta.version!==2 || meta.sourceHash!==fileHash(voiceFile(dir,project,c)) || meta.fileHash!==fileHash(join(VOICE,c.id+'.wav'))) throw new Error(`${c.id}: 레벨링 캐시가 원본과 다르다 — narration.sh 실행`);
}
const args = ['-y', '-loglevel', 'error'];
let fc = '';
UNITS.forEach(([f]) => args.push('-i', join(VOICE, `${f}.wav`)));
UNITS.forEach(([, startM, comp], i) => {
  const d = Math.round(startM * SCALE * 1000);
  const att = comp > 0 ? `volume='pow(10,(${comp}*max(0\\,1-t/0.25))/20)':eval=frame,` : '';
  fc += `[${i}:a]${att}atempo=${ATEMPO},aresample=48000,asetpts=N/SR/TB,volume=-3.2dB,adelay=${d}:all=1[a${i}];`;
});
fc += UNITS.map((_, i) => `[a${i}]`).join('') +
  `amix=inputs=${UNITS.length}:normalize=0:duration=longest,asetpts=N/SR/TB,apad,atrim=end_sample=${Math.round(TOTAL_M * SCALE * 48000)}[out]`;
args.push('-filter_complex', fc, '-map', '[out]', '-c:a', 'pcm_s16le', OUT);

const r = spawnSync('ffmpeg', args, {stdio: 'inherit'});
if (r.status !== 0) process.exit(r.status ?? 1);
audioInfo(OUT);
writeFileSync(stateFile,JSON.stringify({version:1,inputHash,fileHash:fileHash(OUT)},null,2)+'\n');
console.log(`✔ projects/${name}/output/narration.wav — 유닛 ${UNITS.length}개 · 실효 ${SPEED}배 (atempo ${ATEMPO}) · ${(TOTAL_M * SCALE).toFixed(2)}초`);
