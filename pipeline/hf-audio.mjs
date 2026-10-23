#!/usr/bin/env node
// hf-audio.mjs — HyperFrames 오디오 준비 (2026-09-10 신설)
//
//   node pipeline/hf-audio.mjs <프로젝트>
//
// 하는 일 (docs/14-hyperframes.md §3 권장 방식):
//   ① output/<p>/narration.wav (이미 1.20배 가속된 것) 를 컷 경계에서 잘라
//      projects/<p>/hyperframes/.media/audio/frame-NN.wav 로 낸다
//   ② audio_meta.json 을 쓴다 — 프레임별 duration_s + **어절 온셋(words)**
//
// 왜 도구로 만들었나 (2026-09-10 감사):
//   이 두 가지를 매 프로젝트에서 **손으로 만들고 있었다.** 스킬 문서에 언급조차 없었고,
//   그래서 어절 온셋이 프레임에 안 붙는 사고가 났다 (경계보다 0.04초 앞선 온셋이 앞 프레임에 먹혔다).
//   손으로 하는 단계가 곧 빠뜨리는 단계다.
//
// 🔴 좌표계: 모든 시각은 **표시 초** 하나뿐이다 (원음 초 ÷ SPEED). timeScale 을 쓰지 마라.
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {resolveProject} from './lib/project.mjs';
import {readTiming} from './lib/timing.mjs';
import {fileHash,digest,validatedWords,audioBuildState} from './lib/workflow-state.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = process.argv[2];
if (!arg) { console.error('사용: node pipeline/hf-audio.mjs <프로젝트>'); process.exit(1); }
const {dir:P,name}=resolveProject(arg);
const O = path.join(P, 'output');
const HF = path.join(P, 'hyperframes');
const SRC = path.join(O, 'narration.wav');

if (!existsSync(HF)) { console.error(`❌ hyperframes/ 가 없다 — npx hyperframes init "projects/${name}/hyperframes" …`); process.exit(1); }
if (!existsSync(SRC)) { console.error(`❌ ${SRC} 가 없다 — pipeline/narration.sh ${name} 1.20`); process.exit(1); }

const project=JSON.parse(readFileSync(path.join(P,'cuts.json'),'utf8'));
const timing=readTiming(P,project);
const SPEED=timing.speed, ENDS_M=timing.ends, cuts=project.cuts;
if(ENDS_M.length!==cuts.length) throw new Error('컷 수와 시간축이 다르다');
const wpath=path.join(O,'whisper-words.json');
const chunks=validatedWords(wpath,SRC).map(w=>[w.s,w.t]);
const sourceHash=fileHash(SRC);
const metaPath=path.join(HF,'audio_meta.json');
let prev={};try {prev=JSON.parse(readFileSync(metaPath,'utf8'));} catch {}
const {audioKey,metadataKey}=audioBuildState(P,project,timing);

const TOL = 0.12;   // 🔴 온셋이 컷 경계보다 살짝 앞설 수 있다. 이 여유가 없으면 앞 프레임에 먹힌다
const bounds = [0, ...ENDS_M].map((v) => v / SPEED);

mkdirSync(path.join(HF, '.media/audio'), { recursive: true });
const voices = [];
for (let i = 0; i < cuts.length; i++) {
  const s = bounds[i], e = bounds[i + 1], dur = +(e - s).toFixed(3);
  const nn = String(i + 1).padStart(2, '0');
  const rel = `.media/audio/frame-${nn}.wav`;
  const slice=path.join(HF,rel);
  const old=prev.voices?.find(v=>v.frame===i+1);
  if(prev.build?.audioKey!==audioKey || !existsSync(slice) || old?.fileHash!==fileHash(slice)) {
    execFileSync('ffmpeg', ['-v','error','-y','-ss',s.toFixed(6),'-i',SRC,'-t',dur.toFixed(6),'-c:a','pcm_s16le',slice]);
  }

  // 이 프레임에 속하는 어절 — 허용오차를 두고 자른다
  const mine = chunks.filter(([t]) => t >= s - TOL && t < e - TOL);
  const words = (mine.length ? mine : [[s, cuts[i].text || '']])
    .filter((c) => c[1])
    .map(([t, text], j) => ({ id: `${nn}-${String(j).padStart(3, '0')}`, text, start: +Math.max(0, t - s).toFixed(3), end: 0 }));
  words.forEach((w, j) => { w.end = j + 1 < words.length ? words[j + 1].start : dur; });
  voices.push({ frame: i + 1, path: rel, fileHash:fileHash(slice), duration_s: dur, caption: cuts[i].text || '', say: cuts[i].say || '', words });
}

// 🔴 경계 어절 재배치 (2026-09-10 · W6 지적으로 발견)
//   whisper 온셋은 컷 경계에서 최대 0.4초까지 앞서 찍힌다. 그래서 다음 프레임 첫 어절이
//   앞 프레임 꼬리에 붙는다 — 「그리고」가 F15 에 붙고 F16 워커가 거기 착지시키면 0.575초 어긋난다.
//   판정은 시간이 아니라 **캡션 대조**로 한다: 이 프레임 대사에 없고 다음 프레임 대사에 있으면 넘긴다.
{
  const nz = (x) => String(x).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const bag = (v) => nz((v.say || '') + (v.caption || ''));
  let moved = 0;
  for (let i = 0; i < voices.length - 1; i++) {
    const v = voices[i], nx = voices[i + 1];
    while (v.words.length > 1) {
      const w = v.words[v.words.length - 1], t = nz(w.text);
      if (t.length < 2) break;
      const here = bag(v).includes(t.slice(0, 2));
      const there = bag(nx).includes(t.slice(0, 2));
      if (here || !there) break;
      v.words.pop();
      nx.words.unshift({ ...w, start: 0 });
      moved++;
    }
    v.words.forEach((w, j) => { w.end = j + 1 < v.words.length ? v.words[j + 1].start : v.duration_s; });
    nx.words.forEach((w, j) => { w.end = j + 1 < nx.words.length ? nx.words[j + 1].start : nx.duration_s; });
  }
  if (moved) console.log(`    ↳ 경계 어절 ${moved}개를 다음 프레임으로 넘겼다 (캡션 대조)`);
}

// 🔴 자기검사 — 어절이 캡션과 전혀 안 맞으면 좌표계를 잘못 읽은 것이다 (2026-09-10 사고)
const norm = (x) => String(x).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const mismatch = voices.filter((v) => {
  const cap = norm(v.caption || v.say), joined = norm(v.words.map((w) => w.text).join(''));
  if (cap.length < 3 || joined.length < 3) return false;
  for (let k = 0; k + 2 <= cap.length; k++) if (joined.includes(cap.slice(k, k + 2))) return false;
  return true;
});
if (mismatch.length > voices.length * 0.3) {
  console.error(`\n  🔴 프레임 ${mismatch.length}/${voices.length} 에서 어절이 캡션과 전혀 겹치지 않는다.`);
  console.error(`     whisper 캐시 시각의 좌표계를 잘못 읽었을 가능성이 크다 (캐시는 **표시 초**다).`);
  console.error(`     예: F${mismatch[0].frame} 캡션 "${mismatch[0].caption}" ↔ 어절 "${mismatch[0].words.map((w) => w.text).join(' ')}"\n`);
  process.exit(1);
}
if (mismatch.length) console.log(`    ⚠️ 어절이 캡션과 안 맞는 프레임: ${mismatch.map((v) => v.frame).join(' ')} (무음 컷이면 정상)`);

const nextMeta={...prev,bgm:prev.bgm ?? null,bgm_pending:!prev.bgm,sfx:prev.sfx ?? [],voices,build:{audioKey,metadataKey,sourceHash}};
const serialized=JSON.stringify(nextMeta,null,1)+'\n';
if(!existsSync(metaPath) || readFileSync(metaPath,'utf8')!==serialized) writeFileSync(metaPath,serialized);

const activeSlices=new Set(voices.map(v=>path.basename(v.path)));
for(const file of readdirSync(path.join(HF,'.media/audio'))) {
  if(/^frame-\d+\.wav$/.test(file) && !activeSlices.has(file)) rmSync(path.join(HF,'.media/audio',file));
}
const total = voices.reduce((a, v) => a + v.duration_s, 0);
const empty = voices.filter((v) => !v.words.length).map((v) => v.frame);
console.log(`\n  ✔ 프레임 ${voices.length}개 · 총 ${total.toFixed(2)}초 (표시 초 · SPEED ${SPEED})`);
console.log(`    .media/audio/frame-01..${String(voices.length).padStart(2, '0')}.wav`);
console.log(`    audio_meta.json — 자막 어절 ${voices.reduce((a, v) => a + v.words.length, 0)}개`);
if (empty.length) console.log(`    ⚠️ 자막이 없는 프레임: ${empty.join(' ')}`);
if (!existsSync(wpath)) console.log(`    ⚠️ whisper 전사 캐시가 없어 컷 자막을 통째로 얹었다 — pipeline/transcribe.py 를 먼저 돌려라`);
if (!prev.bgm) console.log(`    ⚠️ BGM 미지정 — 렌더에 굽는 것이라 렌더 전에 정한다`);
// 🔴 온셋 정확도 경고 (2026-09-10 · W4·W7 실측으로 확인)
console.log(`    🔴 여기 온셋은 whisper-small 추정이다. **문장 뒤로 갈수록 이르게 누적된다**`);
console.log(`       실측 편차: F09 에서 0.0f → -4.3f → -5.1f (어절이 뒤로 갈수록 커진다)`);
console.log(`       **임팩트·큰 숫자 착지는 .media/audio/frame-NN.wav 를 직접 재라.**`);
console.log(`       검증된 방법 3종 교차: ① whisper-medium 연결본 ② RMS 포락선 ③ 음절 등간격`);
console.log(`       ⚠️ 포락선의 깊은 골이 곧 어절 경계는 아니다 — 마찰음(ㅅ)·폐쇄음(ㅂ)도 같은 골을 만든다`);
// 🔴 어절이 적은 프레임은 whisper 가 앞 무음을 첫 어절에 먹여 **통째로 당겨진다** (W2 실측 172ms)
const thin = voices.filter((v) => v.words.length <= 3).map((v) => `F${v.frame}(${v.words.length})`);
if (thin.length) {
  console.log(`    🔴 어절 3개 이하 = **고위험 프레임**: ${thin.join(' ')}`);
  console.log(`       경계 재배치가 실패하면 다음 프레임 첫 온셋이 통째로 앞당겨진다 — 여기는 반드시 wav 로 재라`);
  console.log(`       pipeline/lib/onset-env2.mjs <raw> <t0> <t1>  ·  pipeline/lib/onset-wh.py <wav...>`);
}
console.log('');
