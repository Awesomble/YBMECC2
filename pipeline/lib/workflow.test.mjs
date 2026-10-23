// node --test pipeline/lib/workflow.test.mjs
// All mutations use owned /tmp fixtures. No TTS, network, browser or real render.
import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {audioBuildState, audioInfo, assertNarrationCurrent, factsHash, factItems, fileHash,
  validatedWords, verificationErrors, voiceInputHash, voiceState} from './workflow-state.mjs';
import {legacyTiming, readTiming, syncTimeline, timingFromCuts} from './timing.mjs';
import {validateAssets} from './asset-state.mjs';
import {manifest} from './src-hash.mjs';
import {BRAND,hasChannelLockup} from './brand.mjs';
import {adPhraseHits,legalDisplayMissing,consentLedger,photoConsent,academyReport} from './academy.mjs';
import {installedHyperframes,resolveHyperframes} from './hyperframes-cli.mjs';
import {packetReads,assessResult,resultDigest} from '../video-claude.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const json = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
function run(command, args, options = {}) {
  const r = spawnSync(command, args, {cwd: ROOT, encoding: 'utf8', timeout: 10000,
    killSignal: 'SIGKILL', maxBuffer: 2 ** 20, ...options});
  assert.ifError(r.error);
  return r;
}
function success(command, args, options) {
  const r = run(command, args, options);
  assert.equal(r.status, 0, `${command} ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return r;
}
const node = (script, args) => run(process.execPath, [path.join(ROOT, 'pipeline', script), ...args]);
function fixture(t) {
  const root = mkdtempSync('/tmp/abm-workflow-test-');
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const dir = path.join(root, 'projects/00001-fixture');
  for (const sub of ['voice', 'output/leveled', 'hyperframes/.media/audio']) {
    mkdirSync(path.join(dir, sub), {recursive: true});
  }
  const project = {title: 'Synthetic regression fixture', fps: 60,
    timing: {version: 1, speed: 1.2}, voice: {engine: 'fixture', speed: 1, assets: {}}, assets: [],
    cuts: [{id: 'hook', dur: 2, say: '합성 시험입니다', text: '합성 시험입니다'}]};
  const save = () => json(path.join(dir, 'cuts.json'), project);
  save();
  return {root, dir, project, save};
}
function voiceFixture(f) {
  const source = path.join(f.dir, 'voice/hook.m4a');
  const leveled = path.join(f.dir, 'output/leveled/hook.wav');
  success('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
    '-ar', '48000', '-c:a', 'aac', source]);
  success('ffmpeg', ['-v', 'error', '-i', source, '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', leveled]);
  f.project.voice.assets.hook = {file: 'hook.m4a',
    inputHash: voiceInputHash(f.project, f.project.cuts[0]), fileHash: fileHash(source)};
  json(path.join(f.dir, 'output/leveled/state.json'), {hook: {
    version: 2, sourceHash: fileHash(source), fileHash: fileHash(leveled)}});
  f.save();
  return {source, leveled};
}
function narrationFixture(f) {
  voiceFixture(f);
  const r = node('lib/build-narration.mjs', [f.dir]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const narration = path.join(f.dir, 'output/narration.wav');
  const words = path.join(f.dir, 'output/whisper-words.json');
  json(words, {version: 1, sourceHash: fileHash(narration),
    words: [{s: 0.05, e: 0.8, t: '합성 시험입니다'}]});
  return {narration, words};
}
function copyGate(f) {
  // The gate resolves sibling CLI files by repository root. Copy current sources
  // unchanged so its fix-batch guard resolves only this isolated project.
  for (const file of ['stage-gate.mjs', 'fix-batch.mjs', 'hf-export.mjs', 'lib/project.mjs',
    'lib/workflow-state.mjs', 'lib/timing.mjs', 'lib/asset-state.mjs', 'lib/src-hash.mjs', 'lib/brand.mjs', 'lib/academy.mjs', 'templates/brand.json', 'lib/sfx-tracks.mjs', 'lib/sfx-catalog.mjs', 'lib/hook.mjs', 'lib/refs.mjs', 'lib/shaders.mjs', 'lib/platforms.json', 'lib/ig-cta.mjs']) {
    const dest = path.join(f.root, 'pipeline', file);
    mkdirSync(path.dirname(dest), {recursive: true});
    copyFileSync(path.join(ROOT, 'pipeline', file), dest);
  }
  return (stage = 4) => run(process.execPath, [path.join(f.root, 'pipeline/stage-gate.mjs'), f.dir, String(stage)], {cwd: f.root});
}

function factFixture(t) {
  const f = fixture(t), refs = path.join(f.dir, 'assets/refs');
  mkdirSync(refs, {recursive: true});
  const source = path.join(refs, '공지 화면.PNG');
  writeFileSync(source, 'owned source evidence fixture');
  writeFileSync(path.join(f.dir, 'README.md'), '## 확정 팩트\n\n| 항목 | 값 |\n|---|---|\n| 수량 | 2 |\n\n## 확인 못 한 것\n없음\n');
  const result = {claims: [{item: '수량', our_value: '2', found_value: '2',
    source_url: source, grade: '1차', note: '', verdict: '일치'}],
    missing_conditions: [], risky_phrasings: [], overall: '통과',
    inputHash: factsHash(f.dir), verifiedAt: new Date().toISOString()};
  return {...f, refs, source, result};
}

test('fact verification rejects empty claims, inconsistent verdicts and stale evidence', t => {
  const f = fixture(t);
  const readme = path.join(f.dir, 'README.md');
  writeFileSync(readme, '## 확정 팩트\n\n| 항목 | 값 |\n|---|---|\n| 수량 | 2 |\n');
  const now = Date.parse('2026-09-16T00:00:00Z');
  const result = {claims: [{item: '수량', our_value: '2', found_value: '2',
    source_url: 'https://example.com/fixture', grade: '1차', note: '', verdict: '일치'}],
    missing_conditions: [], risky_phrasings: [], overall: '통과',
    inputHash: factsHash(f.dir), verifiedAt: new Date(now).toISOString()};
  assert.deepEqual(verificationErrors(result, factsHash(f.dir), {now}), []);
  assert.match(verificationErrors({...result, claims: []}, result.inputHash, {now}).join(' '), /claims/);
  assert.match(verificationErrors({...result, overall: '정지'}, result.inputHash, {now}).join(' '), /overall/);
  assert.deepEqual(factItems(readFileSync(readme,'utf8')),['수량']);
  assert.match(verificationErrors(result,result.inputHash,{now,expectedItems:['수량','대상']}).join(' '),/대상/);
  writeFileSync(readme, readFileSync(readme, 'utf8').replace('| 2 |', '| 3 |'));
  assert.match(verificationErrors(result, factsHash(f.dir), {now}).join(' '), /지문/);
});

test('local fact evidence accepts only files covered by the current project fingerprint', t => {
  const f = factFixture(t), options = {projectDir: f.dir};
  const verify = source => verificationErrors({...f.result,
    claims: [{...f.result.claims[0], source_url: source}]}, f.result.inputHash, options);
  for (const source of [f.source, pathToFileURL(f.source).href,
    path.relative(f.dir, f.source), path.relative(f.root, f.source),
    `${f.source}; ${pathToFileURL(f.source).href}`,
    `${f.source}; https://example.com/official`,
    `https://example.com/official; ${f.source}`]) {
    assert.deepEqual(verify(source), [], source);
  }
  assert.match(verificationErrors(f.result, f.result.inputHash).join(' '), /근거/);
  assert.match(verificationErrors(f.result, undefined, options).join(' '), /근거/);
  writeFileSync(f.source, 'changed evidence bytes');
  assert.match(verify(f.source).join(' '), /근거/, 'a caller-provided old hash cannot authorize changed evidence');
  assert.match(verificationErrors(f.result, factsHash(f.dir), options).join(' '), /지문/);
});

test('local fact evidence rejects missing, untracked, external and symlink paths', t => {
  const f = factFixture(t), outside = path.join(f.root, 'external.PNG');
  writeFileSync(outside, 'outside the project');
  const nested = path.join(f.refs, 'nested/image.PNG');
  mkdirSync(path.dirname(nested)); writeFileSync(nested, 'not included in factsHash');
  const symlink = path.join(f.refs, 'linked.PNG');
  symlinkSync(outside, symlink);
  const refsPrefix = path.join(f.dir, 'assets/refs-other/image.PNG');
  mkdirSync(path.dirname(refsPrefix)); writeFileSync(refsPrefix, 'prefix is not containment');
  assert.equal(factsHash(f.dir), f.result.inputHash, 'directories and symlinks are not fingerprinted');
  for (const source of [outside, nested, symlink, refsPrefix, path.join(f.refs, 'missing.PNG'),
    `${f.source}; ${outside}`, `https://example.com/official; ${outside}`,
    `${outside}; https://example.com/official`, `${pathToFileURL(f.source).href}#fragment`,
    'file://remote.example/image.PNG', 'data:image/png;base64,AA==',
    'assets/refs/../refs/공지 화면.PNG']) {
    const result = {...f.result, claims: [{...f.result.claims[0], source_url: source}]};
    assert.match(verificationErrors(result, f.result.inputHash, {projectDir: f.dir}).join(' '), /근거/, source);
  }
  const linkedProject = path.join(f.root, 'linked-project');
  mkdirSync(path.join(linkedProject, 'assets'), {recursive: true});
  copyFileSync(path.join(f.dir, 'README.md'), path.join(linkedProject, 'README.md'));
  symlinkSync(f.refs, path.join(linkedProject, 'assets/refs'));
  const linkedResult = {...f.result, inputHash: factsHash(linkedProject), claims: [{...f.result.claims[0],
    source_url: path.join(linkedProject, 'assets/refs/공지 화면.PNG')}]};
  assert.match(verificationErrors(linkedResult, linkedResult.inputHash, {projectDir: linkedProject}).join(' '), /근거/);
});

test('local fact evidence retains expiry, coverage and verdict checks', t => {
  const f = factFixture(t), options = {projectDir: f.dir};
  assert.match(verificationErrors({...f.result, verifiedAt: '2000-01-01T00:00:00Z'}, f.result.inputHash, options).join(' '), /유효기간/);
  assert.match(verificationErrors({...f.result, overall: '정지'}, f.result.inputHash, options).join(' '), /overall/);
  assert.match(verificationErrors({...f.result, missing_conditions: ['누락']}, f.result.inputHash, options).join(' '), /overall/);
  assert.match(verificationErrors(f.result, f.result.inputHash, {...options, expectedItems: ['수량', '대상']}).join(' '), /대상/);
  assert.match(verificationErrors({...f.result, claims: [{...f.result.claims[0], grade: '없음'}]}, f.result.inputHash, options).join(' '), /근거/);
});

test('packet → verifier record accepts local evidence, is reused, and rejects changed facts', t => {
  const f = factFixture(t), out = path.join(f.dir, '.cross-verify');
  const packet = node('cross-verify.mjs', [f.dir]);
  assert.equal(packet.status, 3, packet.stdout + packet.stderr);
  assert.match(readFileSync(path.join(out, 'prompt.txt'), 'utf8'), new RegExp(`inputHash: ${f.result.inputHash};`));
  assert.notEqual(readJson(path.join(out, 'result.json')).overall, '통과');
  f.result.claims[0].source_url = `${path.relative(f.root, f.source)}; https://example.com/official; ${pathToFileURL(f.source).href}`;
  writeFileSync(path.join(out, 'raw.txt'), `verifier notes\n${JSON.stringify(f.result, null, 2)}\n`);
  const recorded = node('cross-verify.mjs', [f.dir, '--record']);
  assert.equal(recorded.status, 0, recorded.stdout + recorded.stderr);
  const saved = readJson(path.join(out, 'result.json'));
  assert.equal(saved.overall, '통과');
  assert.equal(saved.inputHash, f.result.inputHash);
  const cached = node('cross-verify.mjs', [f.dir]);
  assert.equal(cached.status, 0, cached.stdout + cached.stderr);
  assert.match(cached.stdout, /재사용/);
  const gate = copyGate(f);
  assert.equal(gate(1).status, 0);
  writeFileSync(f.source, 'changed capture');
  assert.equal(gate(1).status, 1);
  const stale = node('cross-verify.mjs', [f.dir, '--record']);
  assert.equal(stale.status, 2, stale.stdout + stale.stderr);
  assert.match(stale.stderr, /바뀌었다/);
  assert.notEqual(readJson(path.join(out, 'result.json')).overall, '통과');
});

test('timing checks changed FPS and preserves explicit voice offsets', t => {
  const f = fixture(t);
  f.project.cuts[0].voice_offset_s = 0.2;
  f.save();
  syncTimeline(f.dir, f.project);
  assert.equal(legacyTiming(f.dir).units[0].startM, 0.24);
  f.project.fps = 30;
  f.save();
  const stale = node('timing.mjs', [f.dir, '--check']);
  assert.equal(stale.status, 1, stale.stdout + stale.stderr);
  syncTimeline(f.dir, f.project);
  assert.equal(legacyTiming(f.dir).fps, 30);
  assert.equal(node('timing.mjs', [f.dir, '--check']).status, 0);
  assert.equal(readTiming(f.dir).fps, 30);
  assert.throws(() => timingFromCuts({...f.project, fps: 0}), /fps/);
});

test('measured duration includes the voice offset', t => {
  const f = fixture(t);
  voiceFixture(f);
  f.project.cuts[0].voice_offset_s = 0.2;
  f.save();
  const r = node('measure.mjs', [f.dir, '--apply']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const cut = readJson(path.join(f.dir, 'cuts.json')).cuts[0];
  assert.ok(Math.abs(cut.dur - (0.2 + (1 + 0.13) / 1.2)) < 0.003, `dur=${cut.dur}`);
  assert.equal(legacyTiming(f.dir).units[0].startM, 0.24);
});

test('narration keeps the full duration and leading silence for a delayed first voice', t => {
  const f = fixture(t);
  voiceFixture(f);
  f.project.cuts[0].dur = 1.142;
  f.project.cuts[0].voice_offset_s = 0.2;
  f.save();
  const r = node('lib/build-narration.mjs', [f.dir]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const narration = path.join(f.dir, 'output/narration.wav');
  assert.ok(Math.abs(audioInfo(narration).duration - 1.142) < 0.002,
    `expected 1.142s, got ${audioInfo(narration, {decode: false}).duration}s`);
  const pcm = success('ffmpeg', ['-v', 'error', '-i', narration, '-t', '0.15',
    '-f', 's16le', '-ac', '1', '-ar', '48000', '-'], {encoding: null}).stdout;
  assert.ok(pcm.length > 0);
  let peak = 0;
  for (let i = 0; i + 1 < pcm.length; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)));
  assert.ok(peak <= 1, `voice began inside the intended leading silence: peak=${peak}`);
});

test('voice and narration fingerprints reject script changes and damaged bytes', t => {
  const f = fixture(t);
  const {narration} = narrationFixture(f);
  const timing = timingFromCuts(f.project);
  assert.equal(voiceState(f.dir, f.project, f.project.cuts[0]).state, 'current');
  assert.equal(assertNarrationCurrent(f.dir, f.project, timing), narration);
  const changed = structuredClone(f.project);
  changed.cuts[0].say = '바뀐 대본입니다';
  assert.equal(voiceState(f.dir, changed, changed.cuts[0]).state, 'stale');
  assert.throws(() => assertNarrationCurrent(f.dir, changed, timingFromCuts(changed)), /낡았다/);
  const source = path.join(f.dir, 'voice/hook.m4a');
  const original = readFileSync(source);
  writeFileSync(source, Buffer.concat([original, Buffer.from('damaged')]));
  assert.equal(voiceState(f.dir, f.project, f.project.cuts[0]).state, 'stale');
  writeFileSync(source, original);
  writeFileSync(narration, 'damaged narration fixture');
  assert.throws(() => assertNarrationCurrent(f.dir, f.project, timing), /낡았다/);
});

test('audio metadata changes with captions and transcription; stale transcription is rejected', t => {
  const f = fixture(t);
  const {narration, words} = narrationFixture(f);
  const timing = timingFromCuts(f.project);
  const baseline = audioBuildState(f.dir, f.project, timing);
  assert.deepEqual(audioBuildState(f.dir, f.project, timing), baseline);
  assert.equal(validatedWords(words, narration).length, 1);
  f.project.cuts[0].text += '!';
  const captionChange = audioBuildState(f.dir, f.project, timing);
  assert.equal(captionChange.audioKey, baseline.audioKey);
  assert.notEqual(captionChange.metadataKey, baseline.metadataKey);
  const transcript = readJson(words);
  transcript.words[0].s = 0.1;
  json(words, transcript);
  assert.notEqual(audioBuildState(f.dir, f.project, timing).metadataKey, captionChange.metadataKey);
  transcript.sourceHash = 'old narration';
  json(words, transcript);
  assert.throws(() => validatedWords(words, narration), /캐시/);
});

test('stage 4 rejects stale metadata and damaged slices even when their counts match', t => {
  const f = fixture(t);
  const {narration} = narrationFixture(f);
  const hf = path.join(f.dir, 'hyperframes');
  const slice = path.join(hf, '.media/audio/frame-01.wav');
  copyFileSync(narration, slice);
  const meta = {bgm: null, voices: [{frame: 1, path: '.media/audio/frame-01.wav',
    duration_s: 2, fileHash: fileHash(slice), words: [{text: '합성 시험입니다', start: 0.05, end: 2}]}],
    build: audioBuildState(f.dir, f.project, timingFromCuts(f.project))};
  const metaFile = path.join(hf, 'audio_meta.json');
  json(metaFile, meta);
  const gate = copyGate(f);
  // No layout/review artifacts are fabricated: only the audio check is expected
  // to pass in this intentionally incomplete, browser-free fixture.
  assert.match(gate().stdout, /✅ 오디오 메타·슬라이스 입력 지문/);
  f.project.cuts[0].text += '!';
  f.save();
  const stale = gate();
  assert.equal(stale.status, 1);
  assert.match(stale.stdout, /오디오 메타 최신성 검사 실패/);
  assert.match(stale.stdout, /현재 대본·나레이션·시간축과 audio_meta가 다르다/);
  meta.build = audioBuildState(f.dir, f.project, timingFromCuts(f.project));
  json(metaFile, meta);
  writeFileSync(slice, 'damaged slice fixture');
  const damaged = gate();
  assert.equal(damaged.status, 1);
  assert.match(damaged.stdout, /슬라이스가 없거나 달라졌다/);
});

test('requested assets may remain pending in planning but fail final validation', t => {
  const f = fixture(t);
  f.project.assets = [{id: 'hero', kind: 'background', cuts: ['hook'], status: 'requested',
    file: 'assets/images/hero.png', render_file: 'assets/hero.png'}];
  assert.deepEqual(validateAssets(f.dir, f.project), {errors: [], pending: ['hero']});
  const final = validateAssets(f.dir, f.project, {final: true});
  assert.deepEqual(final.pending, ['hero']);
  assert.match(final.errors.join(' '), /수령·시각 검수가 완료되지 않았다/);
});

test('existing render output fails before changing the render counter or output', t => {
  const f = fixture(t);
  const output = path.join(f.dir, 'output/render-fixture.mp4');
  const counter = path.join(f.dir, 'output/.render-count');
  writeFileSync(output, 'owned fixture: do not overwrite');
  writeFileSync(counter, '2\n');
  const before = {counter: readFileSync(counter, 'utf8'), mtime: statSync(counter).mtimeMs,
    outputHash: fileHash(output)};
  // No CLI package/index is installed in this fixture. Even a preflight-order
  // regression cannot proceed to a real render.
  const r = run('bash', [path.join(ROOT, 'pipeline/hf-render.sh'), f.dir, path.basename(output)]);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /이미 있다/);
  assert.equal(readFileSync(counter, 'utf8'), before.counter);
  assert.equal(statSync(counter).mtimeMs, before.mtime);
  assert.equal(fileHash(output), before.outputHash);
  assert.equal(existsSync(path.join(f.dir, 'output/.render-lock')), false);
});

test('stage gates fail closed on malformed verification, corrupt audio and absent delivery', t => {
  const f=fixture(t);
  copyGate(f);
  const gate=stage=>run(process.execPath,[path.join(f.root,'pipeline/stage-gate.mjs'),f.dir,String(stage)],{cwd:f.root});
  writeFileSync(path.join(f.dir,'README.md'),'## 확정 팩트\n\n| 항목 | 값 |\n|---|---|\n| 수량 | 2 |\n');
  mkdirSync(path.join(f.dir,'.cross-verify'));
  for(const value of ['{', '{}', JSON.stringify({overall:'통과',claims:[]})]) {
    writeFileSync(path.join(f.dir,'.cross-verify/result.json'),value);
    assert.equal(gate(1).status,1);
  }
  syncTimeline(f.dir,f.project);
  writeFileSync(path.join(f.dir,'voice/hook.m4a'),'corrupt m4a');
  writeFileSync(path.join(f.dir,'output/narration.wav'),'');
  json(path.join(f.dir,'output/whisper-words.json'),[]);
  assert.equal(gate(3).status,1);
  const delivery=gate(5);
  assert.equal(delivery.status,1);
  assert.match(delivery.stdout,/납품 MP4가 없다/);
  assert.match(delivery.stdout,/유효한 SRT가 없다/);
});

test('record without a valid verifier answer never passes and invalidates its prior result', t => {
  const f=factFixture(t), out=path.join(f.dir,'.cross-verify');
  assert.equal(node('cross-verify.mjs',[f.dir]).status,3);
  for(const raw of ['', '{', JSON.stringify({...f.result, overall:'정지'})]) {
    json(path.join(out,'result.json'),{overall:'통과'});
    writeFileSync(path.join(out,'raw.txt'),raw);
    const r=node('cross-verify.mjs',[f.dir,'--record']);
    assert.equal(r.status,2,r.stdout+r.stderr);
    assert.notEqual(readJson(path.join(out,'result.json')).overall,'통과');
  }
});

test('source manifest detects changed rendered media and root-absolute asset references', t => {
  const f=fixture(t), hf=path.join(f.dir,'hyperframes');
  const audio=path.join(hf,'.media/audio/frame-01.wav');
  mkdirSync(path.join(hf,'fonts'));
  writeFileSync(audio,'first audio bytes');
  writeFileSync(path.join(hf,'fonts/body.otf'),'fixture font');
  writeFileSync(path.join(hf,'index.html'),'<audio src=".media/audio/frame-01.wav"></audio><style>@font-face{src:url("/fonts/body.otf")}</style>');
  const before=manifest(hf);
  assert.ok(before['.media/audio/frame-01.wav']);
  assert.ok(before['fonts/body.otf']);
  writeFileSync(audio,'changed audio bytes');
  assert.notEqual(manifest(hf)['.media/audio/frame-01.wav'],before['.media/audio/frame-01.wav']);
});

test('native scaffold initializes, assembles actual audio and passes pinned CLI lint without a browser', t => {
  if(!installedHyperframes().length) return t.skip('requires an already installed local HyperFrames CLI');
  const f=fixture(t);
  narrationFixture(f);
  const hf=path.join(f.dir,'hyperframes');
  const init=node('hf-project.mjs',[f.dir,'init']);
  assert.equal(init.status,0,init.stdout+init.stderr);
  assert.equal(node('hf-project.mjs',[f.dir,'init']).status,1,'must not overwrite the existing master');
  const master=readFileSync(path.join(hf,'index.html'),'utf8');
  assert.match(master, new RegExp(`lang="${BRAND.language || 'en'}"`));
  // ⚠️ 팔레트 값을 시험에 박으면 확정 디자인이 바뀔 때마다 이 줄이 낡는다 (2026-09-19 실사고).
  //    검사할 것은 「master 가 brand.json 의 토큰을 싣는가」다.
  assert.match(master, new RegExp(`--abmen-paper:${BRAND.colors.paper}`));
  assert.match(master, new RegExp(`font-family:${BRAND.font.family}`));
  assert.ok(hasChannelLockup(master));
  assert.doesNotMatch(master, /abmen-wordmark\.svg/);
  // Repair a stale image root with studio-inserted attributes, preserving scene/audio.
  const indexFile=path.join(hf,'index.html');
  assert.ok(existsSync(path.join(hf,BRAND.logo.asset)),'init copies the channel logo');
  const stale=master.replace(/<div id="el-root-lockup"[^>]*>[\s\S]*?<\/div>/,
    '<img data-hf-id="old" id="el-root-lockup" src="assets/brand/abmen-wordmark.svg">');
  assert.equal(hasChannelLockup(stale),false);
  writeFileSync(indexFile,stale);
  assert.equal(node('root-lockup.mjs',[f.dir]).status,0);
  const repaired=readFileSync(indexFile,'utf8');
  assert.ok(hasChannelLockup(repaired));
  assert.equal(node('root-lockup.mjs',[f.dir]).status,0);
  assert.equal(readFileSync(indexFile,'utf8'),repaired,'repeated repair must be byte-idempotent');
  assert.match(repaired,new RegExp(`id="el-root-lockup"[^>]*><img src="${BRAND.logo.asset}"`));
  assert.equal(hasChannelLockup(repaired.replace(BRAND.logo.asset,'assets/brand/abmen-wordmark.svg')),false);
  // 2026-09-27 이전 편의 한 줄 텍스트 락업은 계속 통과하고, 작업명은 반려한다(소급하지 않는다)
  const legacy=repaired.replace(/<div id="el-root-lockup"[^>]*>[\s\S]*?<\/div>/,`<div id="el-root-lockup" class="clip" data-start="0" data-duration="2" data-track-index="3">${BRAND.lockup.text}</div>`);
  assert.ok(hasChannelLockup(legacy));
  assert.equal(hasChannelLockup(legacy.replace(BRAND.lockup.text,'ABMEN')),false);
  assert.equal(hasChannelLockup(repaired+`<div id="el-root-lockup">${BRAND.lockup.text}</div>`),false);
  assert.doesNotMatch(master, /BMHANNA|Jalnan|jalsabo|14532D/);
  assert.ok(existsSync(path.join(hf,'fonts',BRAND.font.file)));
  assert.ok(existsSync(path.join(hf,'fonts',BRAND.font.license)));

  const frame=path.join(hf,'compositions/frames/01-hook.html');
  writeFileSync(frame,'<!doctype html><html><head><meta charset="utf-8"><title>Fixture</title></head><body><template><div id="01-hook" data-composition-id="01-hook" data-start="0" data-duration="2" data-width="1080" data-height="1920" style="position:absolute;width:1080px;height:1920px"><div id="dot" style="width:100px;height:100px;background:red"></div></div><script>const tl=gsap.timeline({paused:true});tl.to("#dot",{x:200,duration:1});window.__timelines=window.__timelines||{};window.__timelines["01-hook"]=tl;</script></template></body></html>');
  let r=node('hf-audio.mjs',[f.dir]);
  assert.equal(r.status,0,r.stdout+r.stderr);
  const metadata=path.join(hf,'audio_meta.json');
  const meta=readJson(metadata);meta.bgm={title:'retained fixture',pending:true};meta.sfx=[];json(metadata,meta);
  r=node('hf-audio.mjs',[f.dir]);
  assert.equal(r.status,0,r.stdout+r.stderr);
  assert.equal(readJson(metadata).bgm.title,'retained fixture');
  assert.deepEqual(readJson(metadata).sfx,[]);
  r=node('hf-project.mjs',[f.dir,'sync']);
  assert.equal(r.status,0,r.stdout+r.stderr);
  const cli=resolveHyperframes(hf);
  r=run(process.execPath,[cli.cli,'lint'],{cwd:hf,timeout:20000});
  assert.equal(r.status,0,r.stdout+r.stderr);
  const before=fileHash(path.join(hf,'index.html'));
  r=node('hf-project.mjs',[f.dir,'sync']);
  assert.equal(r.status,0,r.stdout+r.stderr);
  assert.equal(fileHash(path.join(hf,'index.html')),before);
});

test('stale MP4 cannot truncate a new caption export, while source-only drafts are explicit', t => {
  const f=fixture(t), hf=path.join(f.dir,'hyperframes');
  mkdirSync(path.join(hf,'compositions/frames'),{recursive:true});
  writeFileSync(path.join(hf,'index.html'),'<div data-composition-id="main" data-duration="2"><div class="scene clip frame-slot" data-composition-id="01-hook" data-composition-src="compositions/frames/01-hook.html" data-start="0" data-duration="2"></div></div>');
  writeFileSync(path.join(hf,'compositions/frames/01-hook.html'),'<div class="clip caption" data-start="0" data-duration="2">합성 시험</div>');
  const video=path.join(f.dir,'output/render-old.mp4');
  writeFileSync(video,'old video placeholder, must never decode during source-only export');
  json(video+'.srcman.json',{hashVersion:0,mode:'pre-render',files:{}});
  const subtitle=path.join(f.dir,'output/subtitles.srt');
  writeFileSync(subtitle,'existing subtitle bytes');
  const before=fileHash(subtitle);
  const stale=node('hf-export.mjs',[f.dir]);
  assert.notEqual(stale.status,0);
  assert.match(stale.stderr,/다른 판/);
  assert.equal(fileHash(subtitle),before);
  const draft=node('hf-export.mjs',[f.dir,'--source-only']);
  assert.equal(draft.status,0,draft.stdout+draft.stderr);
  assert.match(readFileSync(subtitle,'utf8'),/00:00:02,000/);
});

test('zone pixel inspection reports intentional long edge motion without banning it', t => {
  const f=fixture(t), hf=path.join(f.dir,'hyperframes');
  writeFileSync(path.join(hf,'index.html'),'<div id="main"></div>');
  const video=path.join(f.dir,'output/edge-fixture.mp4');
  success('ffmpeg',['-v','error','-f','lavfi','-i','color=c=0x14532D:s=1080x1920:r=4:d=1',
    '-vf','drawbox=x=20:y=100:w=100:h=200:color=white:t=fill','-c:v','libx264','-pix_fmt','yuv420p',video]);
  const result=run('bash',[path.join(ROOT,'pipeline/zone-check.sh'),f.dir,video]);
  assert.equal(result.status,0,result.stdout+result.stderr);
  assert.match(result.stdout,/화소 후보/);
  assert.match(result.stdout,/1\.00초/);
  assert.doesNotMatch(result.stdout,/하드 실패/);
});

test('received assets need visual confirmation and stay bound to their reviewed bytes and render reference', t => {
  const f=fixture(t),hf=path.join(f.dir,'hyperframes');
  mkdirSync(path.join(f.dir,'assets/images'),{recursive:true});mkdirSync(path.join(hf,'assets'),{recursive:true});
  const source=path.join(f.dir,'assets/images/hero.png'),render=path.join(hf,'assets/hero.png');
  success('ffmpeg',['-v','error','-f','lavfi','-i','color=c=red:s=32x48','-frames:v','1',source]);
  copyFileSync(source,render);
  f.project.assets=[{id:'hero',kind:'background',cuts:['hook'],status:'received',file:'assets/images/hero.png',render_file:'assets/hero.png',min_width:32,min_height:48}];f.save();
  assert.equal(node('asset-prompts.mjs',[f.dir,'--accept=hero']).status,1);
  const accepted=node('asset-prompts.mjs',[f.dir,'--accept=hero','--confirm-visual']);
  assert.equal(accepted.status,0,accepted.stdout+accepted.stderr);
  const p=readJson(path.join(f.dir,'cuts.json'));
  assert.equal(p.assets[0].status,'approved');
  assert.equal(validateAssets(f.dir,p,{final:true}).errors.length,1,'unused image must not pass');
  p.assets[0].usage='reference-only';
  assert.deepEqual(validateAssets(f.dir,p,{final:true}).errors,[],'preserved reference need not appear in final');
  writeFileSync(path.join(hf,'index.html'),'<img src="assets/hero.png">');
  assert.match(validateAssets(f.dir,p,{final:true}).errors.join(' '),/참고 전용/,'reference-only image must not leak into final');
  delete p.assets[0].usage;
  assert.deepEqual(validateAssets(f.dir,p,{final:true}).errors,[]);
  writeFileSync(render,'changed reviewed image');
  assert.match(validateAssets(f.dir,p,{final:true}).errors.join(' '),/검수한 파일/);
});

test('real subjects need reference photos before generation and a matching compare sheet before approval (format 2)', t => {
  const f=fixture(t),hf=path.join(f.dir,'hyperframes');
  mkdirSync(path.join(f.dir,'assets/images'),{recursive:true});mkdirSync(path.join(hf,'assets'),{recursive:true});
  const source=path.join(f.dir,'assets/images/hero.png');
  success('ffmpeg',['-v','error','-f','lavfi','-i','color=c=red:s=32x48','-frames:v','1',source]);
  copyFileSync(source,path.join(hf,'assets/hero.png'));
  f.project.asset_prompt_format=2;
  f.project.assets=[{id:'hero',kind:'background',cuts:['hook'],status:'received',file:'assets/images/hero.png',render_file:'assets/hero.png',min_width:32,min_height:48}];f.save();
  const prompt=['Use: Opening background.','Scene: Seoul at dusk.','Subject: A tower.','Details: Glass.','Composition: Centered.','Lighting: Soft.','Color: Natural.','Style: Photorealistic photograph.','Output: 9:16 vertical. Opaque full-bleed image.','Constraints: No text.'].join('\n');
  const readme=(real)=>`## 에셋 생성 요청\n\n공통 Style: Photorealistic photograph.\n\n### hero · 타워 — \`assets/images/hero.png\`\n- 사용: cut-01\n- 생성 이유: 포스터\n${real===null?'':`- 실물 대조: ${real}\n`}- 참조 첨부: 없음\n- 수령 예상: 9:16\n\n\`\`\`text\n${prompt}\n\`\`\`\n`;
  writeFileSync(path.join(f.dir,'README.md'),readme(null));
  assert.match(node('asset-prompts.mjs',[f.dir,'--lint']).stderr,/실물 대조/,'format 2 requires the meta line');
  writeFileSync(path.join(f.dir,'README.md'),readme('Tower · 사진 1장(낮) · 식별 특징: 원뿔'));
  assert.match(node('asset-prompts.mjs',[f.dir,'--lint']).stderr,/3장 이상/,'one photo is not research');
  writeFileSync(path.join(f.dir,'README.md'),readme('Tower · refs tower · 사진 3장(낮·밤·원경) · 식별 특징: 밑동이 넓은 원뿔'));
  assert.equal(node('asset-prompts.mjs',[f.dir,'--lint']).status,0);
  const blocked=node('asset-prompts.mjs',[f.dir,'--accept=hero','--confirm-visual']);
  assert.equal(blocked.status,1);assert.match(blocked.stderr,/ref-photos\.mjs .* tower --sheet/,'approval waits for a compare sheet');
  const refs=path.join(f.dir,'output/refs/tower');mkdirSync(refs,{recursive:true});
  for(const n of ['01','02','03']) success('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=40x60','-frames:v','1',path.join(refs,`${n}.jpg`)]);
  assert.notEqual(run(process.execPath,[path.join(ROOT,'pipeline/ref-photos.mjs'),f.dir,'tower','--sheet']).status,0,'three copies of one photo are one viewpoint');
  for(const [n,c] of [['02','green'],['03','white']]) success('ffmpeg',['-v','error','-y','-f','lavfi','-i',`color=c=${c}:s=40x60`,'-frames:v','1',path.join(refs,`${n}.jpg`)]);
  success(process.execPath,[path.join(ROOT,'pipeline/ref-photos.mjs'),f.dir,'tower','--sheet','assets/images/hero.png']);
  assert.ok(existsSync(path.join(f.dir,'output/review/ref-tower.png')));
  assert.match(node('asset-prompts.mjs',[f.dir,'--accept=hero','--confirm-visual']).stderr,/수령 검수/,'the comparison result must be written down');
  writeFileSync(path.join(f.dir,'README.md'),readme('Tower · refs tower · 사진 3장(낮·밤·원경) · 식별 특징: 밑동이 넓은 원뿔')+'\n### 수령 검수\n\n- hero: 식별 특징 1/2 일치\n');
  assert.match(node('asset-prompts.mjs',[f.dir,'--accept=hero','--confirm-visual']).stderr,/1\/2/,'a partial match needs a reason or a redo');
  writeFileSync(path.join(f.dir,'README.md'),readme('Tower · refs tower · 사진 3장(낮·밤·원경) · 식별 특징: 밑동이 넓은 원뿔')+'\n### 수령 검수\n\n- hero: 식별 특징 1/2 일치 — 띠 간격 차이, 폰에서 안 보임\n');
  const accepted=node('asset-prompts.mjs',[f.dir,'--accept=hero','--confirm-visual']);
  assert.equal(accepted.status,0,accepted.stdout+accepted.stderr);
  writeFileSync(path.join(f.dir,'README.md'),readme('해당 없음 — 상징 소품'));
  assert.equal(node('asset-prompts.mjs',[f.dir,'--lint']).status,0,'non-real assets state a reason instead');
});

test('poster lines are required for new skeletons and their title·hook text is found in the frame-0 source', async t => {
  const {readBeat,posterInSource}=await import(pathToFileURL(path.join(ROOT,'pipeline/lib/hook.mjs')));
  const beat=(date,lines)=>readBeat(`# x\n\n숏츠 · 생성 ${date}\n\n### 첫 3초 비트\n\n| 0.0초 포스터 | a | b | c |\n\n핵심어: tall\n${lines}\n## 디자인 방향\n`);
  assert.deepEqual(beat('2026-10-05','').posterEmpty,[],'older projects are not retrofitted');
  assert.deepEqual(beat('2026-10-06','주제 제목:\n후킹: 478 m\n키 비주얼: <주연>').posterEmpty,['주제 제목','키 비주얼']);
  const ok=beat('2026-10-06','주제 제목: `LOTTE WORLD TOWER`\n후킹: 478 m\n키 비주얼: tower over the lake');
  assert.deepEqual(ok.posterEmpty,[]);
  const f=fixture(t),hf=path.join(f.dir,'hyperframes');mkdirSync(path.join(hf,'compositions/frames'),{recursive:true});
  writeFileSync(path.join(hf,'index.html'),'<div class="clip" data-composition-id="01-hook" data-composition-src="compositions/frames/01-hook.html" data-start="0" data-duration="2"></div>');
  writeFileSync(path.join(hf,'compositions/frames/01-hook.html'),'<h1>Lotte <b>World</b> Tower</h1><div>478<span> m</span></div>');
  assert.deepEqual(posterInSource(hf,ok.poster).missing,[]);
  writeFileSync(path.join(hf,'compositions/frames/01-hook.html'),'<div>478 m</div><script>el.textContent="LOTTE WORLD TOWER"</script>');
  assert.deepEqual(posterInSource(hf,ok.poster).missing,['주제 제목'],'script-only text is reported for an eye check');
  writeFileSync(path.join(hf,'index.html'),'<html><head><title>lotte-world-tower</title></head><body><div class="clip" data-composition-id="01-hook" data-composition-src="compositions/frames/01-hook.html" data-start="0" data-duration="2"></div></body></html>');
  assert.deepEqual(posterInSource(hf,ok.poster).missing,['주제 제목'],'the document title (project slug) is not on-screen text');
  assert.deepEqual(beat('2026-10-06','주제 제목: LOTTE\n후킹: $?!\n키 비주얼: tower').posterEmpty,['후킹'],'punctuation-only hook is empty');
});

test('poster sheet puts the chosen draft large and alternates small; poster font is declared only where its file exists', async t => {
  const f=fixture(t),tmp=path.join(f.root,'drafts');mkdirSync(tmp,{recursive:true});
  const png=(n,c)=>{const p=path.join(tmp,`${n}.png`);success('ffmpeg',['-v','error','-f','lavfi','-i',`color=c=${c}:s=1080x1920`,'-frames:v','1',p]);return p;};
  const r=run(process.execPath,[path.join(ROOT,'pipeline/poster-sheet.mjs'),f.dir,png('a','red'),png('b','green'),png('c','blue'),'--before',png('now','gray')]);
  assert.equal(r.status,0,r.stdout+r.stderr);
  const dims=run('ffprobe',['-v','error','-show_entries','stream=width,height','-of','csv=p=0',path.join(f.dir,'output/review/poster-sheet.png')]).stdout.trim();
  assert.equal(dims,'1080,1200','one 540-wide chosen cell plus two 270-wide columns, then a 240-high profile-grid row');
  const px=(x,y)=>[...spawnSync('ffmpeg',['-v','error','-i',path.join(f.dir,'output/review/poster-sheet.png'),'-vf',`crop=1:1:${x}:${y}`,'-f','rawvideo','-pix_fmt','rgb24','-']).stdout];
  assert.ok(px(90,1080)[0]>200&&px(90,1080)[2]<60,'grid row starts with the chosen draft');
  assert.ok(Math.abs(px(630,1080)[0]-128)<12,'the current frame (--before) is last in the grid row');
  assert.ok(px(900,1080)[0]<40,'the row is padded to the sheet width');
  const {fontFace,BRAND}=await import(pathToFileURL(path.join(ROOT,'pipeline/lib/brand.mjs')));
  assert.match(fontFace(),new RegExp(BRAND.posterFont.family));
  assert.doesNotMatch(fontFace('fonts/',{poster:false}),new RegExp(BRAND.posterFont.family),'old skeletons without the file get no dangling @font-face');
});

test('card posts render as 4:5 JPEGs with a sheet; on-card sources, remote assets and numbering gaps stop the render', t => {
  const f=fixture(t),cards=path.join(f.dir,'cards');mkdirSync(cards,{recursive:true});
  const card=(n,body)=>writeFileSync(path.join(cards,`${n}.html`),`<!doctype html><html><body style="margin:0;width:1080px;height:1350px;background:#123"><h1 style="color:#fff;margin:200px 80px;font-family:sans-serif">${body}</h1></body></html>`);
  const render=()=>run(process.execPath,[path.join(ROOT,'pipeline/card-render.mjs'),f.dir],{timeout:60000});
  card('01-poster','Eleven parks');card('02-aboard','One has a warship');
  const ok=render();
  assert.equal(ok.status,0,ok.stdout+ok.stderr);
  assert.equal(run('ffprobe',['-v','error','-show_entries','stream=codec_name,width,height','-of','csv=p=0',path.join(f.dir,'output/cards/01.jpg')]).stdout.trim(),'mjpeg,1080,1350');
  assert.ok(existsSync(path.join(f.dir,'output/cards/sheet.png')),'the review sheet is written');
  card('03-list','Source: example.com');
  const src=render();
  assert.equal(src.status,1);assert.match(src.stderr,/출처·링크/,'the same source ban as upload copy applies to card text');
  card('03-list','<img src="https://example.org/x.png">Save this');
  const remote=render();
  assert.equal(remote.status,1);assert.match(remote.stderr,/원격 자산/);
  card('03-list','Save this for your trip');
  const bait=render();
  assert.equal(bait.status,0,bait.stderr);assert.match(bait.stdout,/주의 표현/,'save/share requests on a card are flagged like upload copy');
  assert.match(bait.stdout,/03 「Save this for your trip」/,'the <h1> inventory lists each card for alt text');
  rmSync(path.join(cards,'03-list.html'));card('04-gap','Save this');
  const gap=render();
  assert.equal(gap.status,1);assert.match(gap.stderr,/번호가 비었다/);
});

test('card review catches overflow, overlap, mid-word breaks, missing fonts and weak contrast before writing delivery images', t => {
  const f=fixture(t),cards=path.join(f.dir,'cards');mkdirSync(cards,{recursive:true});
  const page=(n,inner,bg='#123')=>writeFileSync(path.join(cards,`${n}.html`),`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;width:1080px;height:1350px;background:${bg};font-family:sans-serif;color:#fff">${inner}</body></html>`);
  const p=(st,txt)=>`<p style="position:absolute;margin:0;${st}">${txt}</p>`;
  const render=()=>run(process.execPath,[path.join(ROOT,'pipeline/card-render.mjs'),f.dir],{timeout:90000});
  page('01-ok','<h1 style="position:absolute;left:80px;top:200px;margin:0;font-size:90px">Clean card</h1>');
  page('02-ok',p('left:80px;top:200px;font-size:60px','Second card'));
  const ok=render();
  assert.equal(ok.status,0,ok.stdout+ok.stderr);
  page('02-bad',p('left:80px;top:300px;font-size:90px','OVERLAP')+p('left:120px;top:320px;font-size:90px','OVERLAP TOO')+p('left:820px;top:700px;font-size:120px;white-space:nowrap','OUTSIDE'));
  rmSync(path.join(cards,'02-ok.html'));
  page('03-bad',p('left:80px;top:300px;width:260px;font-size:100px','가나다라마바사')+p('left:80px;top:800px;font-size:80px;font-family:NoSuchFontXyz','Missing font'));
  const bad=render();
  assert.equal(bad.status,1,bad.stdout);
  assert.match(bad.stderr,/02 「OVERLAP」 ↔ 「OVERLAP TOO」 글자끼리 겹친다/);
  assert.match(bad.stderr,/02 「OUTSIDE」 글자가 카드 밖으로 나간다/);
  assert.match(bad.stderr,/03 단어 한가운데서 줄이 바뀐다/);
  assert.match(bad.stderr,/03 서체 「NoSuchFontXyz」가 안 실렸다/);
  assert.ok(existsSync(path.join(f.dir,'output/cards/check.png')),'a marked check sheet is written');
  assert.ok(!existsSync(path.join(f.dir,'output/cards/01.jpg')),'no delivery images while hard issues remain');
  rmSync(path.join(cards,'02-bad.html'));rmSync(path.join(cards,'03-bad.html'));
  // 그림 속 경계: 종이색 그림의 오른쪽에 갈색 띠 — 띠에 붙은 글자는 하드, 종이 한가운데 글자는 통과 (2026-10-08 달력 「12」)
  success('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=0xF0EBDC:s=400x600','-vf','drawbox=x=330:y=0:w=70:h=600:color=0x8B5A2B:t=fill','-frames:v','1',path.join(cards,'pad.png')]);
  const pad=(txtStyle)=>`<img src="pad.png" style="position:absolute;left:340px;top:500px;width:400px;height:600px"><p style="position:absolute;margin:0;color:#E0407F;font-size:150px;${txtStyle}">12</p>`;
  page('02-pad',pad('left:560px;top:700px'));
  const tight=render();
  assert.equal(tight.status,1,tight.stdout);assert.match(tight.stderr,/02 「12」 글자가 그림 속 경계/,'text touching a band inside the picture is caught even though it sits inside the picture box');
  page('02-pad',pad('left:420px;top:700px'));
  const inside=render();
  assert.equal(inside.status,0,inside.stderr);
  rmSync(path.join(cards,'02-pad.html'));
  page('02-pale',p('left:80px;top:300px;font-size:80px;color:#EEEEEE','Pale on pale'),'#FFFFFF');
  const pale=render();
  assert.equal(pale.status,0,pale.stderr);assert.match(pale.stdout,/02 「Pale on pale」 글자 뒤 배경과 대비가/);
});

test('every pasted block is checked line by line for whitespace — fails from 2026-10-20, warns before', t => {
  const f=fixture(t);
  const block=(h,b)=>`### ${h}\n\`\`\`\n${b}\n\`\`\`\n`;
  const check=(date,cap)=>{writeFileSync(path.join(f.dir,'publish.md'),`# x — 업로드 문안\n작성 ${date}\n\n## tiktok — 틱톡\n\n${block('캡션',cap)}${block('댓글','One line.')}`);return run(process.execPath,[path.join(ROOT,'pipeline/publish-check.mjs'),f.dir]).stdout;};
  const dirty=`\nLine one \n\tTabbed\nTwo  spaces\n\n\nNo\u00A0break\n`;
  const out=check('2026-10-20',dirty);
  assert.match(out,/❌[^\n]*캡션 공백·줄바꿈\s+첫 줄이 빈 줄 · 끝 줄이 빈 줄 · 줄 끝 공백 2줄 · 줄 앞 공백 3줄 · 탭 3줄 · 연속 공백 4줄 · 빈 줄 연속 6줄 · 특수·보이지 않는 공백 7줄/);
  assert.match(check('2026-10-19',dirty),/⚠️[^\n]*캡션 공백·줄바꿈/,'older copy only warns');
  assert.match(check('2026-10-20','Clean line\n\n#a #b'),/✅[^\n]*공백·줄바꿈\s+2블록 깨끗/);
});

// 교차 게시(platforms.json crosspost)를 켠 채널만 — ABMEN 2026-10-20~. 끈 채널은 공백 검사만 같은 코드로 돈다
const XP_ON = !!JSON.parse(readFileSync(path.join(ROOT, 'pipeline/lib/platforms.json'), 'utf8')).crosspost;

test('Instagram copy from 2026-10-20 is also the Facebook and Threads post: Threads count, topic tag and whitespace', {skip: !XP_ON && 'crosspost not enabled for this channel'}, t => {
  // The user posts once on Instagram and shares to Facebook and Threads (2026-10-20), so the caption must fit
  // Threads: 500 characters with emoji counted as UTF-8 bytes. Whitespace is checked line by line.
  const f=fixture(t);
  const block=(h,b)=>`### ${h}\n\`\`\`\n${b}\n\`\`\`\n`;
  const page=(cap,extra='',date='2026-10-20')=>`# x — 업로드 문안\n작성 ${date}\n\n## instagram — 인스타그램 릴스\n\n${block('캡션',cap)}${block('댓글','A pinned word.')}\n${extra}`;
  const check=(m)=>{writeFileSync(path.join(f.dir,'publish.md'),m);return run(process.execPath,[path.join(ROOT,'pipeline/publish-check.mjs'),f.dir]).stdout;};
  const tags='#Seoul #Korea #Travel', pin='\u{1F4CD}';
  // k letters + " \u{1F4CD}" + blank line + tags: k + 28 on Threads but only k + 25 code points
  assert.match(check(page(`${'a'.repeat(473)} ${pin}\n\n${tags}`)),/❌[^\n]*캡션 → 스레드 길이\s+501자 \(이모지 1개 = 4자\)/,'one 4-byte emoji pushes 498 code points past 500');
  const fit=check(page(`${'a'.repeat(472)} ${pin}\n\n${tags}`));
  assert.match(fit,/✅[^\n]*캡션 → 스레드 길이\s+500자/);
  assert.match(fit,/✅[^\n]*캡션 → 스레드 토픽\s+#Seoul/,'the first valid hashtag becomes the Threads topic');
  assert.match(fit,/✅[^\n]*공백·줄바꿈\s+\d+블록 깨끗/);
  const ws=check(page(`First line \nSecond  line\n\n\n${tags}`));
  assert.match(ws,/❌[^\n]*캡션 공백·줄바꿈\s+줄 끝 공백 1줄 · 연속 공백 2줄 · 빈 줄 연속 4줄/);
  assert.match(check(page(`Seoul\u00A0road\n\n${tags}`)),/❌[^\n]*캡션 공백·줄바꿈\s+특수·보이지 않는 공백 1줄/,'NBSP');
  assert.doesNotMatch(check(page(`A family \u{1F469}\u200D\u{1F469}\u200D\u{1F467} walk\n\n${tags}`)),/U\+200D/,'ZWJ inside an emoji sequence is part of the emoji');
  const tg=check(page(`Number #1 road\n\n#Seoul. #Korea #Travel`));
  assert.match(tg,/❌[^\n]*캡션 해시태그 글자\s+#Seoul\./,'punctuation ends the tag');
  assert.match(tg,/⚠️[^\n]*캡션 → 스레드 토픽\s+#Korea/,'#1 is not a tag, so the topic is not the first hashtag');
  assert.match(check(page(`Body\n\n${tags}`,`## threads — 스레드\n\n${block('본문','Separate Threads text #Seoul')}`)),/⚠️\s+스레드\s+절\s+있음/,'no separate Threads section after the cutover');
  const old=check(page(`First line \n\n${tags}`,'','2026-10-19'));
  assert.match(old,/⚠️[^\n]*캡션 공백·줄바꿈\s+줄 끝 공백 1줄/,'copy written before the cutover only warns');
  assert.doesNotMatch(old,/스레드 길이/);
});

test('stage 6 needs no threads section in copy written from 2026-10-20 (Instagram shares to Threads)', {skip: !XP_ON && 'crosspost not enabled for this channel'}, t => {
  const f=fixture(t), gate=copyGate(f);
  const page=(d)=>`# x — 업로드 문안\n작성 ${d}\n\n## youtube — 유튜브 쇼츠\n\n## instagram — 인스타그램 릴스\n\n## tiktok — 틱톡\n\n## x — X\n`;
  writeFileSync(path.join(f.dir,'publish.md'),page('2026-10-20'));
  // YBMECC: brand.json platforms(인스타·유튜브)만 요구한다 — 틱톡·X 절은 있어도 되고 없어도 된다
  assert.match(gate(6).stdout,/✅ 플랫폼 절 [a-z·]+ — 스레드·페이스북은 인스타 교차 게시/);
  writeFileSync(path.join(f.dir,'publish.md'),page('2026-10-19'));
  const active=JSON.parse(readFileSync(path.join(ROOT,'pipeline/templates/brand.json'),'utf8')).platforms;
  if(!active || active.includes('threads')) assert.match(gate(6).stdout,/플랫폼 절 누락 1개[\s\S]*threads/,'older copy still needs its threads section');
  else assert.doesNotMatch(gate(6).stdout,/플랫폼 절 누락/,'threads is outside brand.json platforms — never required');
});

test('carousel copy is required only with card sources and checks alt text, hashtags and the Reel first line', t => {
  const f=fixture(t),cards=path.join(f.dir,'cards');
  const block=(h,b)=>`### ${h}\n\`\`\`\n${b}\n\`\`\`\n`;
  const md=(carousel)=>`# x — 업로드 문안\n작성 2026-10-08\n\n## instagram — 인스타그램 릴스\n\n${block('캡션','Same first line\n#a #b #c')}\n${carousel}`;
  const check=()=>run(process.execPath,[path.join(ROOT,'pipeline/publish-check.mjs'),f.dir]).stdout;
  writeFileSync(path.join(f.dir,'publish.md'),md(''));
  assert.doesNotMatch(check(),/카드 게시물/,'no card sources, no carousel section required');
  mkdirSync(cards,{recursive:true});
  writeFileSync(path.join(cards,'01-a.html'),'<h1>Alpha <em>one</em>.</h1>');writeFileSync(path.join(cards,'02-b.html'),'<h1>Beta two</h1>');
  const out=check();
  assert.match(out,/카드 게시물\s+절\s+없음/,'card sources make the carousel section required');
  writeFileSync(path.join(f.dir,'publish.md'),md(`## carousel — 카드\n\n${block('캡션 — 인스타 캐러셀','Same first line\n#a #b')}${block('본문 — 스레드','Body #x #y')}${block('대체 텍스트 01','Photo. Text: Alpha one.')}${block('대체 텍스트 02','Photo only.')}`));
  const c=check();
  assert.match(c,/대체 텍스트 ↔ 카드 큰 글자\s+빠짐 02/,'alt text must carry the card <h1>');
  assert.match(c,/캐러셀 첫 줄 ↔ 릴스 첫 줄\s+같음/);
  assert.match(c,/⚠️\s+캡션 — 인스타 캐러셀 해시태그\s+2개/,'below 3 tags warns like the Reel caption (fails only above the hard cap of 5)');
  assert.match(c,/❌\s+본문 — 스레드 해시태그\s+2개/,'Threads takes one topic tag');
});

test('Instagram CTA edition: defaults to the academy info link with the keyword 링크, the sticker text fits the pill, sealed names are never overwritten, only Instagram may promise the DM, and the stage-5 record must match (ABM 판 이식 2026-10-21)', async t => {
  const {fitSticker,igName,DEFAULTS}=await import(pathToFileURL(path.join(ROOT,'pipeline/ig-cta.mjs')).href);
  const {igCta,REWARD,LINKS}=await import(pathToFileURL(path.join(ROOT,'pipeline/lib/ig-cta.mjs')).href);
  const d=igCta({ig_cta:{}});
  assert.deepEqual([d.link,d.keyword,d.reward,d.lead],['info','링크','남기시면 DM으로 보내 드립니다','댓글에'],'the academy info link with 링크 is the default');
  assert.deepEqual(LINKS,['info','map'],'academies send an info or map link — no product link');
  assert.equal(igCta({ig_cta:{link:'map'}}).keyword,'지도','only a map link recommends 지도');
  assert.equal(igCta({ig_cta:{link:'map'}}).reward,REWARD.map);
  assert.equal(igCta({ig_cta:{link:'map',keyword:'위치'}}).keyword,'위치','the user may name another keyword');
  assert.equal('ad' in igCta({ig_cta:{ad:true}}),false,'academies have no affiliate link, so there is no ad chip');
  assert.equal(igCta({}),null);
  // 템플릿 자리표시는 코드 자리에 한 번씩만 — 주석에 적으면 replaceAll 이 주석까지 바꿔 스크립트가 깨진다(ABMEN 에서 겪음)
  const tpl=readFileSync(path.join(ROOT,'pipeline/templates/ig-cta-overlay.html'),'utf8');
  for(const [tok,n] of [['__CFG__',1],['__FONTFACE__',1],['__DUR__',1],['__H__',4]]) assert.equal(tpl.split(tok).length-1,n,`${tok} appears only where it is meant to be replaced`);
  for(const link of LINKS) {
    const c=igCta({ig_cta:{link}});
    assert.ok(fitSticker({lead:c.lead,keyword:c.keyword,reward:c.reward}).fs>=DEFAULTS.minFs,`the default ${link} sentence fits the pill`);
  }
  assert.equal(fitSticker({lead:'댓글에',keyword:'링크',reward:REWARD.info}).fs,DEFAULTS.maxFs,'the short info sentence takes the largest size');
  assert.equal(fitSticker({lead:'댓글에',keyword:'설명회',reward:'남기시면 DM으로 겨울 설명회 일정과 상담 예약 링크를 함께 보내 드립니다'}).fs,null,'a long reward is refused, not squeezed below the minimum');
  assert.equal(igName('/x/main-v2.mp4',f=>f==='ig-reels-v2.mp4'),'ig-reels-v3.mp4','a sealed name is never overwritten');
  assert.equal(igName('/x/render-hf-v1.mp4',()=>false),'ig-reels-v1.mp4');
  const f=fixture(t),block=(h,b)=>`### ${h}\n\`\`\`\n${b}\n\`\`\`\n`;
  const cuts=readJson(path.join(f.dir,'cuts.json'));
  cuts.ig_cta={link:'info'};
  json(path.join(f.dir,'cuts.json'),cuts);
  const dm=()=>`## dm — 인스타 자동 DM\n\n${block('이름','시험 학원 안내')}${block('키워드','링크, 링크요')}${block('첫 DM','안녕하세요. 아래 버튼을 누르시면 안내 링크를 보내 드립니다.')}${block('버튼 글자','링크 받기')}${block('내용','상담은 전화로도 받습니다.')}${block('링크 버튼','지점 안내\n상담 예약')}${block('공개 답글','📌 DM으로 보내 드렸습니다.\n📌 링크는 DM함에 있습니다.\n📌 안내 링크, 방금 보냈습니다.')}`;
  const md=(yt,d='')=>`# x — 업로드 문안\n작성 2026-10-20\n\n## youtube — 유튜브 쇼츠\n\n${block('설명',yt)}\n## instagram — 인스타그램 릴스\n\n${block('캡션','댓글에 「링크」 남기시면 DM으로 보내 드립니다\n\n본문\n#가 #나 #다')}${block('댓글','📌 수업 안내가 궁금하시면 댓글에 「링크」 남겨 주세요.')}\n${d}`;
  const check=()=>run(process.execPath,[path.join(ROOT,'pipeline/publish-check.mjs'),f.dir]).stdout;
  writeFileSync(path.join(f.dir,'publish.md'),md('제목 #가 #나\n\n댓글에 링크 남기시면 DM으로 보내 드립니다'));
  const leak=check();
  assert.match(leak,/❌\s+유튜브 쇼츠\s+댓글→DM 약속/,'YouTube has no auto-DM, so the promise cannot be kept');
  assert.match(leak,/❌\s+인스타 자동 DM\s+절\s+없음/);
  writeFileSync(path.join(f.dir,'publish.md'),md('제목 #가 #나\n\n지점 안내 링크는 프로필에 있습니다',dm()));
  const ok=check();
  assert.match(ok,/✅\s+유튜브 쇼츠\s+댓글→DM 약속\s+없음/,'the keyword alone in other copy is not a promise');
  assert.match(ok,/✅\s+인스타그램\s+CTA 키워드\s+링크 — 캡션 있음 · 댓글 있음/,'Hangul keyword inside 「」 counts as one word');
  assert.match(ok,/✅\s+키워드 ↔ 영상\s+링크, 링크요/);
  assert.match(ok,/✅\s+공개 답글\s+3줄/);
  assert.doesNotMatch(ok,/광고 표시/,'no ad mark is ever demanded on academy copy');
  // 단계 5 — ig_cta 가 있으면 ig-cta.mjs 기록(review/ig-cta.json)이 지금 본편·인스타 판 파일·키워드와 같아야 한다
  const out=path.join(f.dir,'output'), base=path.join(out,'render-hf-v1.mp4'), ig=path.join(out,'ig-reels-v1.mp4');
  mkdirSync(path.join(out,'review'),{recursive:true});writeFileSync(base,'base');writeFileSync(ig,'ig');
  const gate5=()=>copyGate(f)(5).stdout;
  assert.match(gate5(),/🔴 cuts\.json ig_cta 가 있는데 인스타 판/,'no record yet');
  json(path.join(out,'review/ig-cta.json'),{base:'render-hf-v1.mp4',baseHash:fileHash(base),video:'ig-reels-v1.mp4',videoHash:fileHash(ig),link:'info',keyword:'링크',reward:igCta(cuts).reward,lead:'댓글에',at:3,sheet:'ig-cta-sheet.png'});
  assert.match(gate5(),/✅ 인스타 판 ig-reels-v1\.mp4 — 본편 render-hf-v1\.mp4에 「댓글에 링크」 스티커 3초~/);
  cuts.ig_cta={link:'info',keyword:'안내'};json(path.join(f.dir,'cuts.json'),cuts);
  assert.match(gate5(),/🔴 cuts\.json ig_cta 가 있는데 인스타 판/,'the keyword changed, so the sealed sticker render is stale');
  cuts.ig_cta={link:'info'};json(path.join(f.dir,'cuts.json'),cuts);
  writeFileSync(base,'a new render');
  assert.match(gate5(),/🔴 cuts\.json ig_cta 가 있는데 인스타 판/,'the base changed after the sticker was laid on');
});

test('dialogue request preserves speaker order and rejects divergent transcript before synthesis', async () => {
  const {typecastRequest} = await import('./tts-request.mjs');
  const voice = {voice_id:'male',model:'ssfm-v30',language:'eng',speed:1,speakers:{a:{voice_id:'male'},b:{voice_id:'female'}}};
  const cut = {id:'dialogue',say:'One? Three.',dialogue:[{speaker:'a',say:'One?'},{speaker:'b',say:'Three.'}]};
  const request = typecastRequest(voice,cut);
  assert.match(request.endpoint,/\/compose$/);
  assert.deepEqual(request.body.segments.map(s=>[s.voice_id,s.text]),[['male','One?'],['female','Three.']]);
  assert.throws(()=>typecastRequest(voice,{...cut,say:'Different.'}),/differ/);
  assert.throws(()=>typecastRequest(voice,{...cut,dialogue:[{speaker:'c',say:'One? Three.'}]}),/unknown speaker/);
  const before=voiceInputHash({voice},cut);
  assert.notEqual(before,voiceInputHash({voice},{...cut,dialogue:cut.dialogue.map(t=>({...t,speaker:t.speaker==='a'?'b':'a'}))}));
  const single=typecastRequest(voice,{id:'single',say:'Hello'});
  assert.equal(single.body.voice_id,'male'); assert.ok(!single.body.segments);
});


test('caption export decodes HTML entities once in both root and frame captions', async t => {
  const {rootCaptionChunks, captionChunks}=await import('../hf-export.mjs');
  const f=fixture(t), hf=path.join(f.dir,'hyperframes');
  mkdirSync(path.join(hf,'compositions'),{recursive:true});
  const encoded='That&#x27;s &amp; &#39; &lt;3 &amp;lt;3';
  const expected="That's & ' <3 &lt;3";
  writeFileSync(path.join(hf,'compositions/captions.html'),`<div data-composition-id="captions"><div class="clip cap" data-start="0" data-duration="1">${encoded}</div></div>`);
  const index='<div class="clip" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="2"></div>';
  assert.equal(rootCaptionChunks(hf,index)[0].text,expected);
  writeFileSync(path.join(hf,'compositions/frame.html'),`<div class="clip caption" data-start="0" data-duration="1">${encoded}</div>`);
  assert.equal(captionChunks(hf,[{id:'one',src:'compositions/frame.html',start:0,dur:2}])[0].text,expected);
});

test('Claude packets include exact guide excerpts and reject invalid or secret paths without model calls', t => {
  const f=fixture(t);
  const guide=path.join(f.root,'guide.md');
  writeFileSync(guide,'heading\n필수 계약\nthird\nfourth\n');
  const rows=packetReads(f.root,[{path:'guide.md',start_line:2,end_line:3},'guide.md']);
  assert.equal(rows[0].excerpt,'필수 계약\nthird');
  assert.equal(rows[0].bytes,Buffer.byteLength(rows[0].excerpt));
  assert.equal(rows[1].excerpt,undefined);
  assert.ok(rows[1].bytes>rows[0].bytes);
  for (const range of [[0,2],[3,2],[1,100],[1.5,2]]) {
    assert.throws(()=>packetReads(f.root,[{path:'guide.md',start_line:range[0],end_line:range[1]}]),/줄 범위/);
  }
  assert.throws(()=>packetReads(f.root,['../guide.md']),/읽기 경로/);
  assert.throws(()=>packetReads(f.root,['.env.local']),/읽기 경로/);
  symlinkSync('/etc/hosts',path.join(f.root,'outside.md'));
  assert.throws(()=>packetReads(f.root,['outside.md']),/저장소 내/);
});

test('compact Claude output preserves failures, usage and raw-result pointer without accepting other or missing models', () => {
  const raw={subtype:'success',modelUsage:{'claude-opus-5-5':{outputTokens:50}},permission_denials:[]};
  assert.equal(assessResult(raw).ok,true);
  for(const modelUsage of [{},{'claude-sonnet-4':{}},{'claude-opus-5':{}},{'claude-opus-5-5-fallback':{}},{'claude-opus-5-5':{},'claude-haiku-4-5-20251001':{}}]) {
    assert.equal(assessResult({...raw,modelUsage}).ok,false);
  }
  assert.equal(assessResult({...raw,permission_denials:[{tool:'Edit'}]}).ok,false);
  assert.equal(assessResult({...raw,is_error:true}).ok,false);
  const report={...assessResult({...raw,is_error:true}),usage:{output_tokens:50},
    permission_denials:[],errors:['retain this failure'],result:'x'.repeat(15000)+'UNRESOLVED'};
  const digest=resultDigest(report,'/tmp/fixture/result.json');
  assert.equal(digest.ok,false);
  assert.equal(digest.result_truncated,true);
  assert.equal(digest.result_preview.length,2000);
  assert.equal(digest.result_chars,15010);
  assert.deepEqual(digest.usage,report.usage);
  assert.deepEqual(digest.errors,report.errors);
  assert.equal(digest.result_file,'/tmp/fixture/result.json');
  assert.equal(report.result.endsWith('UNRESOLVED'),true,'full report must remain intact for saving and inspection');
});

// ── 셰이더(WebGPU · docs/14-hyperframes.md §16) ──────────────────────────────
test('shader-fx install/check/remove: bundle copy, head scripts, root data-requires-webgpu, excluded effects', async t => {
  const {checkShaders, installShaders, removeShaders} = await import('./shaders.mjs');
  const hf = mkdtempSync('/tmp/abm-shader-test-');
  t.after(() => rmSync(hf, {recursive: true, force: true}));
  mkdirSync(path.join(hf, 'compositions/frames'), {recursive: true});
  const idx = '<!doctype html><html><head>\n  <script src="assets/vendor/gsap.min.js"></script>\n</head><body>\n  <div id="root" data-composition-id="main" data-start="0" data-duration="4"></div>\n</body></html>\n';
  writeFileSync(path.join(hf, 'index.html'), idx);
  const frame = (types) => `<template><div id="root" data-composition-id="01"><canvas id="f-bg" width="1080" height="1920"></canvas></div>
<script>ABMShaders.mount('#f-bg', { layers: [${types.map(x => `{ type: '${x}' }`).join(', ')}] });</script></template>`;
  writeFileSync(path.join(hf, 'compositions/frames/01.html'), frame(['MeshGradient', 'Smoke']));
  let r = checkShaders(hf);
  assert.equal(r.used, true);
  assert.ok(r.errors.some(e => /assets\/vendor\/shaders-core\.js 가 없다/.test(e)), r.errors.join('\n'));
  assert.ok(r.errors.some(e => /data-requires-webgpu/.test(e)));
  assert.ok(r.errors.some(e => /^Smoke — 번들에서 뺀 효과/.test(e)), 'simulation effects must be refused');
  assert.ok(installShaders(hf).length >= 4);
  assert.deepEqual(installShaders(hf), [], 'install is idempotent');
  const html = readFileSync(path.join(hf, 'index.html'), 'utf8');
  assert.ok(html.indexOf('gsap.min.js') < html.indexOf('shaders-core.js') && html.indexOf('shaders-core.js') < html.indexOf('abm-shaders.js'));
  assert.match(html, /data-composition-id="main"[^>]*data-requires-webgpu/);
  r = checkShaders(hf);
  assert.deepEqual(r.errors.map(e => e.split(' — ')[0]), ['Smoke']);
  writeFileSync(path.join(hf, 'compositions/frames/01.html'), frame(['MeshGradient', 'Blur']));
  r = checkShaders(hf);
  assert.deepEqual(r.errors, []);
  assert.match(r.oks[0], /MeshGradient, Blur/);
  writeFileSync(path.join(hf, 'compositions/frames/02.html'), `<template><canvas id="g-bg"></canvas><script>ABMShaders.mount('#g-bg', { layers: [
    { type: 'MeshGradient', props: { colorA: '#111B35', speed: 1 } }, { type: 'LinearWipe', props: { progress: 0, speed: 2 }, children: [{ type: 'SolidColor' }] }] });</script></template>`);
  r = checkShaders(hf);
  assert.ok(r.errors.some(e => /^LinearWipe 에 없는 prop speed/.test(e)), r.errors.join('\n'));
  assert.ok(r.errors.some(e => /^MeshGradient 의 색은 stops 로 준다/.test(e)));
  rmSync(path.join(hf, 'compositions/frames/02.html'));
  writeFileSync(path.join(hf, 'assets/vendor/abm-shaders.js'), '/* edited */');
  assert.ok(checkShaders(hf).errors.some(e => /저장소 원본과 다르다/.test(e)), 'a locally edited bridge must not pass');
  assert.throws(() => removeShaders(hf), /아직 쓰는 프레임/);
  rmSync(path.join(hf, 'compositions/frames/01.html'));
  removeShaders(hf);
  assert.equal(readFileSync(path.join(hf, 'index.html'), 'utf8'), idx, 'remove restores index.html');
});

test('shader bridge validates layers before GPU and maps root seek time to the mounted slot', async () => {
  const vm = await import('node:vm');
  const src = readFileSync(path.join(ROOT, 'pipeline/templates/hyperframes/abm-shaders.js'), 'utf8');
  const listeners = {};
  const def = (name, props) => ({name, props: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, {default: v}]))});
  const win = {addEventListener: (n, f) => { listeners[n] = f; },
    ShadersCore: {settle: {Blur: 2}, components: {
      MeshGradient: def('MeshGradient', {stops: [], colorA: '#000', colorB: '#fff', speed: 1}),
      ImageTexture: def('ImageTexture', {url: '', objectFit: 'fill'}), Blur: def('Blur', {intensity: 50})}}};
  // HyperFrames 가 컴파일한 DOM 그대로 — 슬롯에 data-composition-src·data-duration 이 없다(2026-10-08 snapshot 실측)
  const el = (attrs, parentElement) => ({id: attrs.id || '', parentElement, appendChild() {},
    hasAttribute: k => k in attrs, getAttribute: k => (k in attrs ? attrs[k] : null)});
  const root = el({'data-composition-id': 'main', 'data-start': '0', 'data-duration': '30'}, null);
  const slot = el({id: 'el-03', 'data-composition-id': '03', 'data-composition-file': 'compositions/frames/03.html', 'data-start': '5', 'data-hf-authored-duration': '2'}, root);
  const host = el({'data-hf-inner-root': 'true'}, slot);
  const canvas = () => ({tagName: 'CANVAS', id: 'c', width: 4, height: 4, parentElement: host, parentNode: host, getContext: () => null});
  const ctx = {window: win, navigator: {}, console: {error() {}, warn() {}}, setTimeout,
    document: {querySelector: () => null, createElement: () => ({style: {}})}};
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const A = win.ABMShaders;
  const bad = [
    [A.mount(canvas(), {layers: [{type: 'Smoke'}]}), /번들에 없다/],
    [A.mount(canvas(), {layers: [{type: 'Blur', props: {radius: 3}}]}), /radius prop 이 없다/],
    [A.mount(canvas(), {layers: [{type: 'MeshGradient', props: {colorA: '#111B35'}}]}), /stops 로 준다/]];
  for (const [mm, re] of bad) assert.match(String(mm.error && mm.error.message), re);
  const m = A.mount(canvas(), {layers: [{type: 'ImageTexture', props: {url: 'assets/a.png'}}, {type: 'Blur'}]});
  assert.equal(m.renders, 2, 'one-frame-late effects render the same t twice');
  assert.equal(m.spec.imgs[0].baseUrl, 'assets/a.png');
  assert.equal(A.stops(['navy', 'lime'])[1].color, JSON.parse(readFileSync(path.join(ROOT, 'pipeline/templates/brand.json'), 'utf8')).colors.lime);
  const seek = (time) => { const work = []; listeners['hf-seek']({detail: {time, waitUntil: p => work.push(p)}}); return work; };
  assert.equal(seek(4.5).length, 0, 'a hidden slot gets no GPU work');
  assert.equal(seek(8).length, 0);
  const w = seek(6);                                       // root 6 s = slot-local 1 s
  assert.equal(w.length, 4, 'the good mount renders; each broken mount rejects its seek');
  const settled = await Promise.allSettled(w);
  assert.equal(settled.filter(x => x.status === 'rejected').length, 3, 'mount errors stop the capture of their slot');
  assert.deepEqual({...m.host}, {start: 5, dur: 2, id: 'el-03'}, 'compiled slot: start from data-start, length from data-hf-authored-duration');
  assert.equal(win.__abmShaders.gpu, 'none', 'no WebGPU: paints the canvas and passes (render is stopped by data-requires-webgpu)');
  const pal = JSON.parse(readFileSync(path.join(ROOT, 'pipeline/templates/brand.json'), 'utf8')).colors;
  assert.deepEqual([A.palette.navy, A.palette.cream, A.palette.blue, A.palette.coral, A.palette.lime], [pal.paper, pal.ink, pal.accent, pal.warm, pal.lime], 'bridge palette = brand.json');
});

test('academy ad rules: 선행·유치원·보장 are hard, 최상급 soft, legal display and photo consent block delivery', t => {
  const lv=(s)=>adPhraseHits(s).map(h=>h.level);
  assert.deepEqual(lv('초등 때 중등 과정을 마쳐야 합니다'),['hard']);
  assert.deepEqual(lv('영어유치원 대신'),['hard']);
  assert.deepEqual(lv('성적 향상 보장'),['hard']);
  assert.deepEqual(lv('선행학습을 하지 않습니다'),[],'denying 선행 is not an ad for it');
  assert.deepEqual(lv('유치원 하원 후 오후반'),[],'naming another institution is not using the name');
  assert.deepEqual(lv('대치 1위'),['soft']);
  const a={legalName:'가나어학원',registration:'제12호',registrationPattern:'제\\s*12\\s*호',courses:'외국어(영어)',
    tuition:{월교습비:'월 10원',반당정원:'8명'}};
  assert.deepEqual(legalDisplayMissing('가나어학원 · 등록번호 제 12 호 · 외국어(영어)',{},a),[]);
  assert.deepEqual(legalDisplayMissing('가나어학원 제12호 외국어(영어) 월 10원',{tuition:true},a),['반당정원 「8명」']);
  assert.deepEqual(legalDisplayMissing('가나어학원',{},{...a,courses:null}).length,2,'missing registration + unconfirmed courses');
  const led=consentLedger('## 사진 동의\n\n| 파일 | 원본 | 보호자 동의 |\n|---|---|---|\n| 01-a.jpg | x.heic | ✅ 2026-10-20 |\n| 02-b.jpg | y.heic | ⬜ 확인 필요 |\n');
  assert.equal(led.rows.get('01-a.jpg').ok,true); assert.equal(led.rows.get('02-b.jpg').ok,false);
  const f=fixture(t);
  mkdirSync(path.join(f.dir,'assets/photos'),{recursive:true});
  writeFileSync(path.join(f.dir,'assets/photos/01-a.jpg'),'x');
  mkdirSync(path.join(f.dir,'hyperframes/compositions'),{recursive:true});
  writeFileSync(path.join(f.dir,'hyperframes/compositions/end.html'),'<img src="assets/photos/03-c.jpg"><p>무조건 합격</p>');
  writeFileSync(path.join(f.dir,'README.md'),'## 사진 동의\n\n| 파일 | 원본 | 보호자 동의 |\n|---|---|---|\n| 01-a.jpg | x | ✅ |\n');
  assert.deepEqual(photoConsent(f.dir).missing,['03-c.jpg'],'a photo only referenced by a frame still needs a consent row');
  const r=academyReport(f.dir,5);
  assert.ok(r.some(x=>x.level==='hard'&&/동의 장부에 없는 사진 1장/.test(x.msg)));
  assert.ok(r.some(x=>x.level==='hard'&&/화면 글자 금지 표현/.test(x.msg)));
  if (BRAND.academy) assert.ok(r.some(x=>x.level==='hard'&&/영상 화면 법정 표시 빠짐/.test(x.msg)),'stage 5 needs 상호·등록번호 on screen');
});

test('project lookup stops on an ambiguous number and resolves a unique one (2026-10-21 duplicate folders)', async () => {
  const {matchProject} = await import('./project.mjs');
  const names = ['00120-deoksugung', '00120-the-hyundai', '00121-templestay', '00127-strawberries'];
  assert.deepEqual(matchProject(names, '121'), {hit: '00121-templestay'});
  assert.deepEqual(matchProject(names, '00127'), {hit: '00127-strawberries'});
  assert.deepEqual(matchProject(names, '120').ambiguous, ['00120-deoksugung', '00120-the-hyundai']);
  assert.deepEqual(matchProject(names, 'straw'), {hit: '00127-strawberries'});
  assert.deepEqual(matchProject(names, 'zzz'), {});
});

test('BGM licence check accepts CC0 / public domain only — no Pixabay, no "updated" (2026-10-21)', async () => {
  const {FREE_LICENSE} = await import('./workflow-state.mjs');
  for (const ok of ['CC0', 'cc0 1.0', 'Public Domain', 'PD']) assert.ok(FREE_LICENSE.test(ok), ok);
  for (const no of ['updated', 'Pixabay Content License', 'CC BY 4.0', '']) assert.ok(!FREE_LICENSE.test(no), no);
});

test('SFX licence grade: legal page or Kenney License.txt = verified, source only = url-only, site claim = unverified; new numbers fail, old numbers warn (2026-10-21)', async t => {
  const {sfxLicenseGrade, sfxLicenseError, resolveSfxCues, SFX_LICENSE_ENFORCE_FROM} = await import('./sfx-tracks.mjs');
  const root = mkdtempSync('/tmp/abm-sfx-licence-test-');
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const put = (rel, text) => { mkdirSync(path.dirname(path.join(root, rel)), {recursive: true}); writeFileSync(path.join(root, rel), text); };
  const rows = {
    'fs-ok.wav': 'Freesound · CC0 — [12345 · someone «Thing»](https://freesound.org/s/12345/) 원 페이지 CC0 확인',
    'fs-bare.wav': 'Freesound · CC0 — 23456 someone "Thing" (원본 보존 `freesound/23456.mp3`)',
    'fs-url.wav': 'Freesound · CC0 — [67890 · someone «Other»](https://freesound.org/s/67890/)',
    'fs-nocc0.wav': 'MixClap · CC0 — whoosh ← [Freesound 34567 · x](https://freesound.org/s/34567/)',
    'kenney.wav': 'Kenney · CC0 — impact-sounds impactPunch_medium_000',
    'derived.wav': 'CC0 (파생: `pick/fs-ok.wav` +6dB·리미터 −1dBFS)',
    'self.wav': 'ABMEN 자체 합성 · CC0 — ffmpeg aevalsrc 175Hz 사인',
    'claim.wav': 'VideoEditingSFX · CC0 — pop-sound',
    'mix.wav': 'MixClap · CC0 — riser',
  };
  put('resources/sfx/CREDITS.md', Object.entries(rows).map(([f, s]) => `| \`pick/${f}\` | 분류 | ${s} | 1s | 1s | -1 |`).join('\n') + '\n');
  put('resources/sfx/catalog.json', JSON.stringify({files: Object.fromEntries(Object.keys(rows).map(f => [f, {tier: 'verified', tags: ['pop']}]))}));
  put('resources/sfx/kenney/impact-sounds/License.txt', 'License: (Creative Commons Zero, CC0)\nhttp://creativecommons.org/publicdomain/zero/1.0/\n');
  put('legal/sfx-t/freesound/fs-12345.html', '<a href="http://creativecommons.org/publicdomain/zero/1.0/">Creative Commons 0</a>');
  put('legal/sfx-t/freesound/23456.txt', 'License URL on page: http://creativecommons.org/publicdomain/zero/1.0/');
  put('legal/sfx-t/freesound/whoosh-34567.html', '<a href="https://creativecommons.org/licenses/by/4.0/">Attribution 4.0</a>');
  put('legal/sfx-t/videoeditingsfx/12345.html', 'CC0 — site claim pages are never Freesound evidence');
  const grade = f => sfxLicenseGrade(root, f);
  assert.deepEqual(['fs-ok.wav', 'fs-bare.wav', 'kenney.wav', 'derived.wav', 'self.wav'].map(f => grade(f).grade), Array(5).fill('verified'));
  assert.equal(grade('fs-ok.wav').evidence, 'legal/sfx-t/freesound/fs-12345.html');
  assert.equal(grade('fs-url.wav').grade, 'url-only');
  assert.match(grade('fs-url.wav').reason, /fs-67890\.html 로 보존/);
  assert.equal(grade('fs-nocc0.wav').grade, 'url-only', 'a saved page without the CC0 licence link is not proof');
  assert.deepEqual(['claim.wav', 'mix.wav', 'nope.wav'].map(f => grade(f).grade), Array(3).fill('unverified'));

  const num = n => path.join(root, 'projects', `${String(n).padStart(5, '0')}-fixture`);
  const before = num(SFX_LICENSE_ENFORCE_FROM - 1), from = num(SFX_LICENSE_ENFORCE_FROM);
  assert.equal(sfxLicenseError(root, 'claim.wav', before), null, 'older projects only warn');
  assert.match(sfxLicenseError(root, 'claim.wav', from), /unverified\(site-claim\).*README\.md ④/);
  assert.equal(sfxLicenseError(root, 'fs-url.wav', from), null, 'url-only warns, never fails');
  const meta = {sfx: [{id: 'a', file: 'claim.wav', at: 0}, {id: 'b', file: 'mix.wav', at: 0.1}, {id: 'c', file: 'fs-ok.wav', at: 0.2}]};
  assert.throws(() => resolveSfxCues(from, meta, 1, root), /unverified\) 효과음 2개 — claim\.wav\(site-claim\), mix\.wav\(site-claim\)/, 'every unverified cue is listed in one failure');
  mkdirSync(path.join(root, 'resources/sfx/pick'), {recursive: true});
  for (const f of ['claim.wav', 'mix.wav', 'fs-ok.wav']) success('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', '-ar', '48000', path.join(root, 'resources/sfx/pick', f)]);
  const cues = resolveSfxCues(before, meta, 1, root, {copyMissing: true});
  assert.deepEqual(cues.map(c => c.license.grade), ['unverified', 'unverified', 'verified']);
});

test('retired SFX: "long" (boomy low tail) fails only new numbers and warns older ones; "rights" or no reason keeps failing outside retired_allow (2026-10-21)', async t => {
  const {sfxLicenseError, resolveSfxCues, sfxRetiredReason, SFX_LICENSE_ENFORCE_FROM} = await import('./sfx-tracks.mjs');
  const root = mkdtempSync('/tmp/abm-sfx-retired-test-');
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const put = (rel, text) => { mkdirSync(path.dirname(path.join(root, rel)), {recursive: true}); writeFileSync(path.join(root, rel), text); };
  const files = {'low.wav': {retired: true, retired_reason: 'long', replace: ['short.wav']}, 'low-vc.wav': {parent: 'low.wav'},
    'old.wav': {retired: true, replace: ['short.wav']}, 'claimed.wav': {retired: '2026-09-26', retired_reason: 'rights'}, 'short.wav': {}};
  put('resources/sfx/CREDITS.md', Object.keys(files).map(f => `| \`pick/${f}\` | 분류 | Kenney · CC0 — impact-sounds x | 1s | 1s | -1 |`).join('\n') + '\n');
  // 허용 번호는 시행 번호 앞뒤(before·from)와 겹치지 않는 번호 — YBMECC 시행 번호가 2라 before 가 00001 이다
  put('resources/sfx/catalog.json', JSON.stringify({retired_allow: ['00007'], files: Object.fromEntries(Object.entries(files).map(([f, x]) => [f, {tier: 'verified', tags: ['low'], ...x}]))}));
  put('resources/sfx/kenney/impact-sounds/License.txt', 'http://creativecommons.org/publicdomain/zero/1.0/');
  const cat = JSON.parse(readFileSync(path.join(root, 'resources/sfx/catalog.json'), 'utf8'));
  assert.deepEqual(['low.wav', 'low-vc.wav', 'old.wav', 'claimed.wav', 'short.wav'].map(f => sfxRetiredReason(cat, f)), ['long', 'long', 'rights', 'rights', null]);
  const num = n => path.join(root, 'projects', `${String(n).padStart(5, '0')}-fixture`);
  const before = num(SFX_LICENSE_ENFORCE_FROM - 1), from = num(SFX_LICENSE_ENFORCE_FROM);
  assert.equal(sfxLicenseError(root, 'low.wav', before), null, 'delivered/re-rendered projects only warn');
  assert.match(sfxLicenseError(root, 'low.wav', from), /길게 울리는 저음 큐.*short\.wav/);
  assert.match(sfxLicenseError(root, 'low-vc.wav', from), /길게 울리는 저음 큐/, 'derived files inherit the reason');
  for (const f of ['old.wav', 'claimed.wav']) {
    const msg = sfxLicenseError(root, f, before);
    assert.match(msg, /신규 사용 중단/, `${f}: rights retirement still fails outside retired_allow`);
    assert.doesNotMatch(msg, /true 부터/);
  }
  assert.equal(sfxLicenseError(root, 'old.wav', num(7)), null, 'retired_allow keeps old projects assembling');
  mkdirSync(path.join(root, 'resources/sfx/pick'), {recursive: true});
  success('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=80:duration=0.2', '-ar', '48000', path.join(root, 'resources/sfx/pick/low.wav')]);
  const [cue] = resolveSfxCues(before, {sfx: [{id: 'boom', file: 'low.wav', at: 0}]}, 1, root, {copyMissing: true});
  assert.equal(cue.retired, 'long');
  assert.deepEqual(cue.replace, ['short.wav']);
  assert.throws(() => resolveSfxCues(from, {sfx: [{id: 'boom', file: 'low.wav', at: 0}]}, 1, root), /boom: low\.wav: 길게 울리는 저음 큐/);
});

test('taste-retired (long drone) SFX: old projects pass the catalog check (gate warns), projects from 00002 are refused; rights-retired stays refused (2026-10-21)', async () => {
  const {sfxLicenseProblem, SFX_LICENSE_ENFORCE_FROM} = await import('./sfx-catalog.mjs');
  const cat = {retired_allow: ['00003'], files: {
    'rumble.wav': {tier: 'verified', retired: '2026-10-21', retired_reason: 'long', replace: ['thump-short.wav'], tags: ['rumble']},
    'rumble-vc.wav': {parent: 'rumble.wav', tags: ['vc']},
    'pop.wav': {tier: 'site-claim', retired: '2026-09-26', tags: ['pop']},
    'thump-short.wav': {tier: 'verified', tags: ['thump']}}};
  assert.equal(SFX_LICENSE_ENFORCE_FROM, 2);   // YBMECC 이식 시행 번호(그때 최댓값 00001 + 1)
  assert.equal(sfxLicenseProblem(cat, 'rumble.wav', '/x/projects/00001-old'), null);
  assert.equal(sfxLicenseProblem(cat, 'rumble-vc.wav', '/x/projects/00001-old'), null);
  assert.match(sfxLicenseProblem(cat, 'rumble.wav', '/x/projects/00002-new'), /00002번부터.*thump-short/);
  assert.match(sfxLicenseProblem(cat, 'rumble-vc.wav', '/x/projects/00002-new'), /00002번부터/);
  assert.match(sfxLicenseProblem(cat, 'pop.wav', '/x/projects/00001-old'), /신규 사용 중단/);
  assert.equal(sfxLicenseProblem(cat, 'pop.wav', '/x/projects/00003-allowed'), null);
  assert.equal(sfxLicenseProblem(cat, 'thump-short.wav', '/x/projects/00002-new'), null);
});

test('0초 포스터 글자 크기 — 인라인 style 과 class 규칙의 font-size 를 첫 장면 소스에서 읽는다 (2026-10-21)', async t => {
  const {posterFontSizes, POSTER_MIN_PX} = await import('./hook.mjs');
  assert.equal(POSTER_MIN_PX, 110);
  const hf = mkdtempSync(path.join(os.tmpdir(), 'poster-'));
  t.after(() => rmSync(hf, {recursive: true, force: true}));
  mkdirSync(path.join(hf, 'compositions/frames'), {recursive: true});
  writeFileSync(path.join(hf, 'index.html'), '<div class="clip" data-composition-id="f1" data-composition-src="compositions/frames/01-poster.html" data-start="0" data-duration="3"></div><div class="clip" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="30"></div>');
  writeFileSync(path.join(hf, 'compositions/frames/01-poster.html'), '<html><head><title>deoksugung</title><style>.abmen-poster-title{font-family:Hahmlet;font-size:96px}.hook{font-size:168px;color:#C8F477}</style></head><body><h1 class="abmen-poster-title">DEOKSUGUNG<br>STONE WALL ROAD</h1><div class="hook"><span style="font-size:120px">WALK IT</span> TOGETHER, BREAK UP</div><p style="font-size:30px">label</p></body></html>');
  const sz = posterFontSizes(hf, {'주제 제목': 'Deoksugung Stone Wall Road', '후킹': 'Walk it together, break up'});
  assert.deepEqual(sz['주제 제목'], {min: 96, max: 96});
  assert.deepEqual(sz['후킹'], {min: 120, max: 168});   // 쪼갠 조각마다 가장 안쪽 요소의 크기 — 최소는 하한 판정, 최대는 위계 판정
  assert.equal(posterFontSizes(hf, {'주제 제목': 'nowhere', '후킹': ''})['주제 제목'], null);
});

test('README 인스타 판 line ↔ cuts.json ig_cta — map auto for pinnable places, info/product only on request (2026-10-22)', async () => {
  const {igPlan, igCta} = await import(pathToFileURL(path.join(ROOT, 'pipeline/lib/ig-cta.mjs')).href);
  assert.equal(igPlan('# x\n## 디자인 방향\nBGM 정서: 경쾌\n'), null);                                   // 옛 골격 — 검사하지 않는다
  const blank = igPlan('## 인스타 판 — 댓글 키워드 → DM\n인스타 판(댓글 → DM):\n지도 핀(장소 · URL):\n');
  assert.equal(blank.kind, ''); assert.equal(blank.pin, '');
  const m = igPlan('인스타 판(댓글 → DM): map — 광장시장\n지도 핀(장소 이름 · 주소 · 지도 URL): 광장시장 · 종로구 창경궁로 88 · https://naver.me/x · https://maps.app.goo.gl/y\n');
  assert.equal(m.kind, 'map'); assert.equal(m.note, '광장시장'); assert.match(m.pin, /naver\.me/);
  assert.equal(igPlan('인스타 판: info — 상담 예약 페이지 (사용자 요청 2026-10-22)').kind, 'info');
  assert.equal(igPlan('인스타 판: product — 공식몰 (사용자 요청 2026-10-22)').kind, 'product');
  assert.equal(igPlan('인스타 판: 없음 — 전국 공통 제도, 찍을 지점이 없다').kind, 'none');
  assert.equal(igPlan('인스타 판: 지도 — 동묘 벼룩시장').kind, 'map');
  assert.equal(igPlan('인스타 판: 댓글에 지도 남기시면 DM으로 지도를 보내 드립니다 · 보낼 것 = 지도 핀(동묘앞역 3번 출구)').kind, 'map');   // ⛳A 보고 투
  assert.equal(igPlan('인스타 판: 댓글에 링크 남기시면 DM으로 보내 드립니다 · 보낼 것 = 제품 페이지').kind, 'product');            // 키워드 「링크」는 신호가 아니다
  assert.equal(igCta({ig_cta: {link: 'map'}}).link, 'map');                                       // 자동 map 편
  assert.equal(igCta({}), null);                                                                   // 「없음」 편 — 스티커 없음
});
