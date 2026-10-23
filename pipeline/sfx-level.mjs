#!/usr/bin/env node
// 효과음이 믹스에서 들리는지 — 렌더 전에 대사 대비 크기를 잰다.
// 사용: node pipeline/sfx-level.mjs <p> [--target=0] [--json]
//
// 왜 (2026-09-23 · 00006): volume 숫자를 앞 편에서 옮겨 적었더니 18큐 중 7개가 대사보다 25~33dB 작아
// 최종 MP4에서 사실상 묻혔다. 파일마다 원래 크기가 달라 volume 값만으로는 들리는지 알 수 없다.
// 이 도구는 audio_meta.json 의 BGM·효과음 배치와 output/narration.wav 를 같은 시간축에 놓고,
// 각 큐의 가장 큰 0.1초 구간을 그 순간의 대사(또는 대사 공백이면 영상 전체의 말소리 중앙값)와 비교한다.
// 최종 렌더는 전체 믹스를 함께 정규화하므로 상대 크기는 유지된다.
//
// ⚠️ 신호 측정이다. 청취를 대신하지 않는다. 판정 구간은 진단 기준이며 효과음 개수·종류의 할당량이 아니다.
import {existsSync, readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {resolveProject, ROOT} from './lib/project.mjs';

const SR = 16000, WIN = SR / 10;                 // 0.1초 창
const argv = process.argv.slice(2);
// 목표: 효과음 크기는 대사와 비슷하게 — 대사 대비 0dB (2026-09-23 사용자 지시). --target=<dB> 로 바꿀 수 있다.
// 일부러 작게 둘 큐(종이 스침·배경 질감)는 audio_meta 큐에 "subtle": "<이유>" — 「작다」 계열 판정 대신 「✅ 의도적 작게」로 두고 키울 volume 을
// 제안하지 않는다. 대사 가림 위험은 그대로 본다(2026-10-09 — 0dB 일괄 상향이 거슬리는 소리를 키운다. ABM 과 같은 키).
const TARGET = Number((argv.find(a => a.startsWith('--target=')) || '--target=0').split('=')[1]);
const BURIED = -18, NEAR = 3, MASK = 3;          // 묻힘 / 목표±3dB 안이면 통과 / 대사와 겹치며 +3dB 초과면 가림 위험

const {dir, name} = resolveProject(argv.find(a => !a.startsWith('--')), {usage: '사용: node pipeline/sfx-level.mjs <p> [--json]'});
const hf = path.join(dir, 'hyperframes');
const meta = JSON.parse(readFileSync(path.join(hf, 'audio_meta.json'), 'utf8'));
const narration = path.join(dir, 'output/narration.wav');
if (!existsSync(narration)) { console.error('✗ output/narration.wav 가 없다 — ③ narration.sh 먼저'); process.exit(2); }
if (!meta.sfx?.length) { console.error('✗ audio_meta.json 에 sfx 큐가 없다'); process.exit(2); }
const noAt = meta.sfx.filter(c => !Number.isFinite(c.at)).map(c => c.id);
if (noAt.length) { console.error(`✗ at 이 없는 큐 ${noAt.join(', ')} — node pipeline/sfx-fit.mjs ${name} --apply 로 event 에서 채운다`); process.exit(2); }

const decode = file => {
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], {maxBuffer: 1 << 30});
  if (r.status !== 0) throw new Error(`디코딩 실패: ${file}`);
  const b = r.stdout; return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
};
const rms = (a, s, n, g = 1) => { let e = 0, k = 0; for (let i = Math.max(0, s); i < Math.min(a.length, s + n); i++, k++) e += (a[i] * g) ** 2; return k ? e / k : 0; };
const db = p => 10 * Math.log10(p + 1e-12);

const voice = decode(narration);
const bgm = meta.bgm?.path ? decode(path.join(hf, meta.bgm.path)) : null;
const bgmGain = meta.bgm?.volume ?? 0;
// 말소리 기준: 대사가 있는 0.1초 창들의 중앙값
const vw = []; for (let s = 0; s + WIN <= voice.length; s += WIN) vw.push(db(rms(voice, s, WIN)));
const voiced = vw.filter(v => v > -45).sort((a, b) => a - b);
const speech = voiced.length ? voiced[Math.floor(voiced.length / 2)] : -20;

const fileOf = f => [path.join(hf, 'assets/sfx', f), path.join(ROOT, 'resources/sfx/pick', f)].find(existsSync);
const cache = new Map();
const rows = meta.sfx.map(c => {
  const src = fileOf(c.file); if (!src) throw new Error(`${c.id}: 파일 없음 ${c.file}`);
  if (!cache.has(src)) cache.set(src, decode(src));
  const x = cache.get(src), vol = c.volume ?? 0.25;
  let best = -Infinity, off = 0;
  for (let s = 0; s + WIN <= Math.max(x.length, WIN); s += WIN / 2) { const v = db(rms(x, s, WIN, vol)); if (v > best) { best = v; off = s / SR; } }
  const t = c.at + off, at = Math.round(t * SR);
  const local = Math.max(db(rms(voice, at - WIN, WIN)), db(rms(voice, at, WIN)), db(rms(voice, at + WIN, WIN)));
  // 말소리 기준보다 10dB 넘게 작은 꼬리·숨소리는 대사 공백으로 본다(낮은 기준에 맞춰 효과음을 줄이지 않게)
  const overlap = local > speech - 10, ref = overlap ? local : speech;
  const delta = best - ref;
  const bg = bgm ? db(rms(bgm, at, WIN, bgmGain)) : -120;
  let status = delta < BURIED ? '🔴 묻힘' : (overlap && delta > MASK) ? '⚠️ 대사 가림 위험' : delta < TARGET - NEAR ? '⚠️ 대사보다 작음' : (best - bg < 3) ? '⚠️ BGM에 묻힘' : '✅';
  const subtle = c.subtle && /묻힘|대사보다 작음/.test(status);
  if (subtle) status = '✅ 의도적 작게';
  const want = vol * 10 ** ((TARGET - delta) / 20);
  return {id: c.id, file: c.file, at: c.at, peak_s: +t.toFixed(3), volume: vol, sfx_db: +best.toFixed(1), ref_db: +ref.toFixed(1), overlap, delta: +delta.toFixed(1), bgm_db: +bg.toFixed(1), status,
          ...(subtle ? {subtle: c.subtle} : {}),
          suggest: subtle ? '— (subtle)' : want > 1 ? `파생본 +${(20 * Math.log10(want)).toFixed(1)}dB 필요(volume 1 초과)` : +want.toFixed(2)};
});

if (argv.includes('--json')) { console.log(JSON.stringify({project: name, speech_db: +speech.toFixed(1), rows}, null, 2)); }
else {
  console.log(`\n  효과음 들림 측정 — ${name}   말소리 기준 ${speech.toFixed(1)} dB (0.1초 창 중앙값) · 신호 측정이며 청취가 아니다\n`);
  console.log('  사건초   id                    파일              vol   효과음  기준(대사)  차이   판정            제안 volume');
  for (const r of rows) console.log(`  ${r.peak_s.toFixed(2).padStart(6)}  ${r.id.padEnd(20)}  ${r.file.padEnd(16)}  ${r.volume.toFixed(2)}  ${String(r.sfx_db).padStart(6)}  ${String(r.ref_db).padStart(6)}${r.overlap ? '·겹침' : '·공백'}  ${String(r.delta).padStart(5)}  ${r.status.padEnd(14)}  ${r.suggest}`);
  const bad = rows.filter(r => r.status.startsWith('🔴')).length, warn = rows.filter(r => r.status.startsWith('⚠️')).length;
  console.log(`\n  묻힘 ${bad} · 주의 ${warn} · 통과 ${rows.length - bad - warn}   (목표 대사 대비 ${TARGET}±${NEAR}dB · ${BURIED}dB 미만 묻힘 · 대사와 겹치며 +${MASK}dB 초과면 가림 위험)`);
  console.log('  제안 volume 이 1을 넘으면 원본을 보존한 레벨 조정 사용본을 pick/에 만들고 CREDITS에 기록한다. 최종 MP4 에서 대사 명료도와 함께 확인한다.\n');
}
process.exit(rows.some(r => r.status.startsWith('🔴')) ? 1 : 0);
