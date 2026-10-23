// cuts.json 의 say 를 음성으로 만든다. 컷별 파일과 통합본을 함께 낸다.
// 사용: node pipeline/tts.mjs <프로젝트> [--measure] [--force]     (프로젝트: 2 · 00002 · 00002-온누리적립)
//
//   projects/<p>/voice/<컷id>.m4a   컷별 음성 (한도 자산 — 지우지 않는다)
//   output/<p>/narration.m4a        통합본 — 컷 dur 타임라인에 맞춰 무음 패딩 (AI 실사 경로용. 모션 경로는 pipeline/narration.sh)
//
// ⚠️ 타이밍의 기준은 음성이 아니라 컷의 dur 다 (기존과 반대다).
//    음성이 컷보다 길면 그 사실을 알리고, dur 를 얼마로 늘려야 하는지 알려준다.
//    --measure 는 길이만 재고 파일을 만들지 않는다 (프리뷰 단계 점검용).
//
// ⚠️ 이미 있는 voice/<컷id>.m4a 는 재사용한다. 타입캐스트 한도를 지키고,
//    재합성으로 길이가 흔들려 타임라인이 어긋나는 걸 막는다.
//    대본을 고친 컷은 --only=<ID> --force로 새 원본을 만든다. 기존 파일은 보존한다.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { resolveProject } from './lib/project.mjs';
import os from 'node:os';
import {voiceState, voiceInputHash, voiceFile, fileHash, audioInfo} from './lib/workflow-state.mjs';
import {dialogueTurns, typecastRequest} from './lib/tts-request.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url)); // pipeline/ — .env.local 이 여기
const MEASURE = process.argv.includes('--measure');
const FORCE = process.argv.includes('--force');
const { dir: DIR, out: OUT, name: NAME } = resolveProject(process.argv.slice(2).find(a => !a.startsWith('--')),
  { usage: '사용: node pipeline/tts.mjs <프로젝트> [--measure] [--force]' });
const J = JSON.parse(readFileSync(path.join(DIR, 'cuts.json'), 'utf8'));
const cuts = J.cuts || [];
const V = J.voice || {};
for (const cut of cuts) {
  dialogueTurns(V, cut);
  if (cut.say && V.engine === 'typecast') typecastRequest(V, cut);
}
// 측정은 항상 무료 엔진으로 — 타입캐스트 한도를 프리뷰에서 쓰지 않는다
const ENGINE = MEASURE ? 'say' : (process.env.TTS_ENGINE || V.engine || 'say');

const argv = process.argv.slice(3);
const option = name => argv.find(a=>a.startsWith(name+'='))?.slice(name.length+1);
const only = option('--only')?.split(',').filter(Boolean);
const adopted = option('--adopt')?.split(',').filter(Boolean);
for(const list of [only,adopted]) if(list?.some(id=>!cuts.some(c=>c.id===id&&c.say))) throw new Error('선택한 음성 ID가 앵커 컷에 없다');
if(FORCE && !only?.length) throw new Error('--force는 --only=<컷ID,...>로 승인된 재합성 범위를 지정해야 한다');
if(!MEASURE && ENGINE !== V.engine && V.engine === 'typecast') throw new Error('임시 say 음성으로 유료 원본을 대체할 수 없다. --measure를 사용한다');
function recordVoice(c,file) {
  const latest=JSON.parse(readFileSync(path.join(DIR,'cuts.json'),'utf8'));
  const now=latest.cuts.find(x=>x.id===c.id);
  if(!now || voiceInputHash(latest,now)!==voiceInputHash(J,c)) throw new Error(`합성 중 대본/설정이 바뀌었다. 원본 보존: ${file}`);
  latest.voice ||= {}; latest.voice.assets ||= {};
  latest.voice.assets[c.id]={file:path.basename(file),inputHash:voiceInputHash(J,c),fileHash:fileHash(file)};
  writeFileSync(path.join(DIR,'cuts.json'),JSON.stringify(latest,null,2)+'\n');
  J.voice ||= {};J.voice.assets=latest.voice.assets;
}
if(adopted) {
  if(!argv.includes('--confirm-script')) throw new Error('원본 음성을 현재 대본·보이스와 직접 대조한 뒤 --confirm-script로 기록한다. 합성은 실행하지 않는다.');
  for(const id of adopted) {const c=cuts.find(c=>c.id===id),file=voiceFile(DIR,J,c);audioInfo(file);recordVoice(c,file);console.log(`✔ 기존 원본 지문 등록: ${id}`);}
  process.exit(0);
}
if(argv.includes('--status')) {
  let stale=0;
  for(const c of cuts.filter(c=>c.say)) {const st=voiceState(DIR,J,c);console.log(`${c.id}: ${st.state} · ${path.basename(st.file)}`);if(st.state!=='current')stale++;}
  process.exit(stale ? 2 : 0);
}
if(!MEASURE) {
  for(const c of cuts.filter(c=>c.say && (!only || only.includes(c.id)))) {
    const st=voiceState(DIR,J,c);
    if(['stale','untracked'].includes(st.state) && !FORCE) throw new Error(`${c.id}: ${st.state}. 기존 원본을 보존한다. 대조 후 --adopt=<ID> --confirm-script 또는 승인된 --only=<ID> --force로 처리한다`);
  }
}
let TC_KEY = null;
const needsSynthesis=!MEASURE && cuts.some(c=>c.say && (!only||only.includes(c.id)) && (FORCE||voiceState(DIR,J,c).state==='missing'));
if (ENGINE === 'typecast' && needsSynthesis) {
  if (!V.voice_id) throw new Error('영어 보이스가 아직 선정되지 않았다. voice.voice_id를 지정한 뒤 승인된 범위만 합성한다.');
  const envPath = path.join(ROOT, '.env.local');
  if (!existsSync(envPath)) throw new Error('.env.local 없음 — TYPECASTKEY 필요');
  TC_KEY = (readFileSync(envPath, 'utf8').match(/^TYPECASTKEY=(.+)$/m) || [])[1]?.trim();
  if (!TC_KEY) throw new Error('.env.local 에 TYPECASTKEY 없음');
}
const TMP = mkdtempSync(path.join(os.tmpdir(),'abm-tts-'));
process.on('exit',()=>rmSync(TMP,{recursive:true,force:true}));
const VOICE = path.join(DIR, 'voice');
if (!MEASURE) mkdirSync(VOICE, { recursive: true });
const sh = (c, a) => execFileSync(c, a, { encoding: 'utf8' }).trim();
const dur = f => +sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]);
const silence = (sec, out) => sh('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-t', Math.max(0.01, sec).toFixed(3),
  '-i', 'anullsrc=r=44100:cl=mono', '-c:a', 'pcm_s16le', out]);

async function synth(cut, out) {
  const text = cut.say;
  if (ENGINE !== 'typecast') {
    // 측정용 macOS 보이스 — voice.say_voice. (타입캐스트 보이스 라벨 'Old radio' 는 say 에 없다)
    const sayVoice = V.say_voice || (V.engine === 'typecast' ? 'Yuna' : (V.voice || 'Yuna'));
    execFileSync('say', ['-v', sayVoice, '-r', String(V.rate || 200), '-o', out, text]);
    return;
  }
  // 컷별 감정(cuts[].emotion/emotion_intensity)이 있으면 전역(V.emotion)보다 우선.
  // 프리셋은 보이스가 지원하는 목록(/v1/voices 의 emotions) 안에서만 — 밖이면 422.
  const { endpoint, body } = typecastRequest(V, cut);
  for (let a = 1; a <= 4; a++) {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'X-API-KEY': TC_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) { writeFileSync(out, Buffer.from(await r.arrayBuffer())); return; }
    if (a === 4) throw new Error(`Typecast 실패 HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    await sleep(700 * a);
  }
}

const LEAD = V.lead ?? 0.12;      // 첫 컷 앞 무음. 3초 안에 승부가 나므로 길게 주지 않는다
// 보통보다 빠르게 말한다 — 느린 말은 그 자체가 이탈 사유다. 음정은 atempo 가 유지해 준다.
const SPEED = Math.min(2, Math.max(0.5, V.speed ?? 1.5));
const parts = [], over = [];
let total = 0, reused = 0;

for (const c of cuts) {
  if(only && !only.includes(c.id)) continue;
  const slot = c.dur || 2;
  const pad = c === cuts[0] ? LEAD : 0;
  if (!c.say) {                                    // 무음 컷
    // ⚠️ say 를 지운 컷에 옛 voice 파일이 남으면 편집기에서 구 보이스가 섞인다 (2026-09-05 실제 사고)
    if (!MEASURE && existsSync(path.join(VOICE, `${c.id}.m4a`)))
      console.log(`  ⚠️ ${c.id}: say 없음인데 voice/${c.id}.m4a 존재 — 보존된 구버전. 현재 앵커에 연결하지 않는다`);
    const f = path.join(TMP, `${c.id}.wav`); silence(slot, f); parts.push(f); total += slot; continue;
  }
  const raw = path.join(TMP, `${c.id}.raw`), wav = path.join(TMP, `${c.id}.wav`);
  let keep = voiceFile(DIR,J,c);
  if(!MEASURE && FORCE && existsSync(keep)) keep=path.join(VOICE,`${c.id}-${voiceInputHash(J,c).slice(0,12)}-${Date.now()}.m4a`);
  // 이미 만든 컷은 다시 부르지 않는다 — 타입캐스트는 다운로드 한도가 있고,
  // 재합성은 선택한 컷만 새 파일로 저장하고 지문을 연결한다.
  const cached = !MEASURE && !FORCE && voiceState(DIR,J,c).state==='current';
  if (cached) {
    sh('ffmpeg', ['-y', '-v', 'error', '-i', keep, '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', wav]);
    reused++;
  } else {
    await synth(c, raw);
    const af = SPEED === 1 ? [] : ['-filter:a', `atempo=${SPEED.toFixed(3)}`];
    sh('ffmpeg', ['-y', '-v', 'error', '-i', raw, ...af, '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', wav]);
  }
  const d = dur(wav);
  const need = d + pad + 0.12;                     // 뒤에 아주 짧은 숨은 남긴다
  if (need > slot + 0.02) over.push({ id: c.id, slot, need: +need.toFixed(2), say: c.say });

  // 컷별 파일 — 조립할 때 컷에 하나씩 얹는 용도
  if (!MEASURE && !cached) {
    sh('ffmpeg', ['-n', '-v', 'error', '-i', wav, '-c:a', 'aac', '-b:a', '160k', keep]);
    audioInfo(keep);recordVoice(c,keep);
  }

  const use = Math.max(slot, need);                // 넘치면 슬롯을 늘린다 (경고와 함께)
  const lead = path.join(TMP, `${c.id}.lead.wav`), tail = path.join(TMP, `${c.id}.tail.wav`);
  if (pad > 0) { silence(pad, lead); parts.push(lead); }
  parts.push(wav);
  silence(use - d - pad, tail); parts.push(tail);
  total += use;
}

console.log(`  엔진 ${ENGINE} · 컷 ${cuts.length}개 · 배속 ${SPEED}x`);
if (over.length) {
  console.log(`\n  ⚠️ 말이 컷보다 깁니다. cuts.json 의 dur 를 늘리거나 문장을 줄이세요:`);
  for (const o of over) console.log(`     ${o.id}  dur ${o.slot}s → ${o.need}s 필요   "${o.say}"`);
  console.log(`\n  이대로 두면 전체 길이가 늘어나 자막과 어긋납니다.`);
} else {
  console.log(`  ✔ 모든 컷이 dur 안에 들어갑니다`);
}

if (MEASURE) {
  rmSync(TMP, { recursive: true, force: true });
  process.exit(over.length ? 2 : 0);
}

if(only || J.timing?.version===1 || existsSync(path.join(DIR,'hyperframes'))) {
  console.log(`✔ 선택한 음성 제작/재사용 완료. 다음: node pipeline/measure.mjs ${NAME} → pipeline/narration.sh ${NAME}`);
  process.exit(0);
}
const list = path.join(TMP, 'list.txt');
writeFileSync(list, parts.map(p => `file '${p}'`).join('\n'));
const out = path.join(OUT, 'narration.m4a');
sh('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'aac', '-b:a', '160k', out]);
rmSync(TMP, { recursive: true, force: true });
const made = cuts.filter(c => c.say).length;
console.log(`  ✔ voice/ 컷별 ${made}개 · projects/${NAME}/output/narration.m4a (${total.toFixed(2)}초)`);
if (reused) console.log(`  ↺ ${reused}개는 기존 파일 재사용 — 새로 합성 ${made - reused}개 (전부 다시: --force)`);
console.log(`  다음: node pipeline/export.mjs ${NAME}   (자막·타임라인 갱신)`);
