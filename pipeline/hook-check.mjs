#!/usr/bin/env node
// hook-check.mjs — 첫 1·2·3초를 한 번에 본다 (video SKILL 「최우선 — 첫 1·2·3초」 · 2026-10-03 사용자 지시)
//
//   node pipeline/hook-check.mjs <p> --plan           ②·③ 비트 빈칸 + 핵심어 시각 (전사가 있으면 실측, 없으면 무료 say 추정)
//   node pipeline/hook-check.mjs <p>                  ④ 훅 잠금 — 0~3초 motion-preview + 시트 + 핵심어·자막·효과음 시각 대조
//   node pipeline/hook-check.mjs <p> --from <mp4>     ⑤ 최종 MP4에서 같은 시트 + 대조 + 첫 소리 시각
//
// 0초 포스터(2026-10-06): README 「주제 제목:」·「후킹:」·「키 비주얼:」의 빈칸과, 주제 제목·후킹 글자가 첫 장면 소스에 있는지 본다.
//    0초에 그 글자가 크게 읽히는지·한 장이 포스터로 완성됐는지는 시트 첫 칸을 눈으로 판정한다.
// 시트는 0 · 0.25 · 0.5 · 1 · 2 · 3초와 핵심어 실측 시각·+0.3초를 폭 360px로 나란히 놓는다 — 0초 한 장의 상황,
// 처음 0.5초의 변화, 정점을 함께 보는 **정지 표본**이다. 연속 재생(0~3초 시안·최종 MP4)을 대신하지 않는다.
// 왜: 2026-10-03 적대적 검증 — 「0·1·2·3초 캡처·무음/음성 재생」을 글로만 요구했고 그 일을 하는 명령이 없었다.
//     캡처와 재생 기록이 다른 명령이라 게이트는 재생 기록만 봤고, 핵심어=정점=자막=효과음은 아무도 대조하지 않았다.
// ⚠️ 판정은 눈이다. 이 도구는 시트를 만들고 시각을 대조할 뿐이다.
//    「첫 프레임부터 주연이 움직이나」는 화소로 재지 않는다 — ABMEN 00043 실측: 주연(전)이 그대로이고 김·장식만 움직인
//    0→0.5초의 SSIM 이 0.88, 뒤집기 구간이 0.47. 장식 움직임과 주연 움직임을 화소는 구별하지 못한다(CLAUDE.md).
//    효과음은 「있나」만 보여 준다 — 첫 3초라고 소리를 의무로 넣지 않고 정적도 선택이며, 핵심어를 가리는지는 sfx-fit 이 본다.
//    cut-01 소스에서 주연 트윈의 시작·정점 시각을 읽는다. 소리는 듣지 않는다 — 청취를 못 했으면 「첫 3초 청취 미검증」.
import {readFileSync,copyFileSync, writeFileSync,existsSync,mkdirSync,renameSync,mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolveProject} from './lib/project.mjs';
import {manifest} from './lib/src-hash.mjs';
import {digest,fileHash,readJson,audioInfo,validatedWords} from './lib/workflow-state.mjs';
import {rootCaptionChunks} from './hf-export.mjs';
import {readBeat,keywordOnset,hasKeyword,keywordInSay,posterInSource, posterFontSizes, POSTER_MIN_PX, fmtPx} from './lib/hook.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = process.argv[2], args = process.argv.slice(3);
const PLAN = args.includes('--plan'), fi = args.indexOf('--from'), FROM = fi >= 0 ? args[fi + 1] : null;
const SHEET_T = [0, 0.25, 0.5, 1, 2, 3];               // + 핵심어 실측 시각·+0.3초 (있을 때)
const PREVIEW = {start: 0, end: 3, fps: 24};          // motion-preview 구간 — stage-gate ④가 같은 지문으로 대조한다
if (!arg || (fi >= 0 && !FROM)) { console.error('사용: node pipeline/hook-check.mjs <프로젝트> [--plan | --from <영상.mp4>]'); process.exit(1); }

const read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };
const isBundle = (c) => c?.orientation === 'landscape' && c?.bundle?.version === 1;   // 롱폼 묶음 (hf-export 와 같은 판별 — ABM 은 묶음이 없어 여기 둔다)
const when = (c) => Number.isFinite(c.event) ? c.event : c.at;
const fmt = (t) => t.toFixed(2);

function timing({O, HF, beat, cuts}) {
  const lines = [], problems = [];
  let onset = null, words = null;
  try { words = validatedWords(path.join(O, 'whisper-words.json'), path.join(O, 'narration.wav')); }
  catch (e) { lines.push(existsSync(path.join(O, 'whisper-words.json')) ? `· 전사 사용 불가 — ${e.message}` : '· 전사 전 (③ 이전)'); }
  if (words) {
    lines.push(`· 첫 어절 「${words[0].t}」 ${fmt(words[0].s)}초`);
    if (beat.keywords?.length) {
      onset = keywordOnset(words, beat.keywords);
      if (!onset) problems.push(`전사에서 핵심어 「${beat.keyword}」를 찾지 못했다 — 읽는 표기와 자막의 숫자 표기를 \`|\`로 함께 적는다 (seventy-four dollars | $74 · 삼천 원 | 3000원)`);
      else {
        lines.push(`· 핵심어 「${onset.alt}」 음성 ${fmt(onset.s)}~${fmt(onset.e)}초 (실측)`);
        if (onset.s > 3) problems.push(`핵심어가 ${fmt(onset.s)}초에 들린다 — 3초 안으로 대사 순서를 고친다 (유료 재합성 전 사용자에게 제안)`);
        else if (onset.s > 2.5) problems.push(`핵심어가 ${fmt(onset.s)}초 — 3초 전에 결과가 정착할 여유가 거의 없다. 앞당길 수 있으면 앞당긴다`);
      }
    }
  } else if (PLAN && beat.keywords?.length) {
    const est = sayEstimate(cuts, beat.keywords);
    if (est.error) problems.push(est.error);
    else {
      lines.push(`· 핵심어 「${est.k}」 ${fmt(est.s)}~${fmt(est.e)}초 (무료 say 추정 — 실제 음성과 다르다. ③ 전사 뒤 다시 돌린다)`);
      if (est.s > 3) problems.push(`핵심어가 약 ${fmt(est.s)}초에 들릴 것 같다 — 첫 발화의 핵심어를 앞으로 옮긴다`);
    }
  }
  if (PLAN) {                                          // ②·③ 은 자막·효과음이 아직 없다 — 대조하지 않는다
    const first = (cuts.cuts || []).find((c) => c.say);
    if (beat.keywords?.length && first && !hasKeyword(first.say, beat.keywords))
      problems.push(`첫 발화 컷(${first.id})의 say 에 핵심어가 없다 — 표기만 다르면(숫자↔글) 대사 표기를 \`|\`로 더하고(seventy-four dollars | $74 · 삼천 원 | 3000원), 정말 없으면 첫 발화부터 핵심을 말하게 고친다`);
    return {lines, problems, onset};
  }
  let caps = [];
  try { caps = rootCaptionChunks(HF); } catch {}
  if (caps.length) {
    lines.push(`· 첫 자막 ${fmt(caps[0].start)}초 「${caps[0].text}」`);
    // 0초 한 장은 포스터이자 앱에서 고르는 커버다 — 자막이 찍히면 글 층이 하나 더 늘고 커버를 가린다 (2026-10-08, 근거 장부 H03)
    const frame = 1 / (cuts.fps || 60), w0 = words?.[0]?.s;
    if (beat.posterRequired && caps[0].start < frame)
      problems.push(`0초 프레임에 첫 자막 「${caps[0].text}」이 찍힌다 — ${w0 != null && w0 < frame ? `첫 어절도 0초에 시작한다. cut-01 voice_offset_s(voice.lead ${cuts.voice?.lead ?? 0.12}초)를 적고 timing 을 다시 만든 뒤 ` : ''}첫 자막을 첫 어절 시각${w0 != null ? `(전사 ${fmt(w0)}초)` : ''}부터 띄워 0초 포스터 한 장에는 제목·후킹만 남긴다 (SKILL 「최우선」 0.0초 포스터)`);
    const kc = beat.keywords?.length && caps.find((c) => hasKeyword(c.text, beat.keywords));
    if (kc) {
      lines.push(`· 핵심어 자막 ${fmt(kc.start)}초 「${kc.text}」${onset ? ` — 음성 대비 ${kc.start >= onset.s ? '+' : ''}${fmt(kc.start - onset.s)}초` : ''}`);
      if (onset && kc.start > onset.s + 0.25) problems.push(`핵심어 자막이 음성보다 ${fmt(kc.start - onset.s)}초 늦다 — 정점에 자막 강조가 함께 있어야 한다`);
    } else if (beat.keywords?.length) problems.push('핵심어가 든 루트 자막이 없다 — 자막 강조를 정점에 넣거나, 프레임 자막이면 직접 대조');
  } else problems.push('루트 자막이 없다 — hf-project sync 로 자막 슬롯을 갖추거나, 프레임 자막이면 직접 대조');
  let sfx = [];
  try { sfx = readJson(path.join(HF, 'audio_meta.json')).sfx || []; } catch {}
  // 효과음은 정보만 — 소리·정적의 선택과 대사 가림은 효과음 운영 기준·sfx-fit 이 판정한다
  const early = sfx.filter((c) => when(c) >= 0 && when(c) < 1);
  lines.push(`· 0~1초 효과음 ${early.length ? early.map((c) => `${c.id}@${fmt(when(c))}`).join(' · ') : '없음 (의도한 정적인지 STORYBOARD 첫 행과 대조)'}`);
  if (onset) {
    const near = sfx.filter((c) => Math.abs(when(c) - onset.s) <= 0.3);
    const over = near.filter((c) => when(c) >= onset.s && when(c) <= onset.e);
    lines.push(`· 핵심어 ±0.3초 효과음 ${near.length ? near.map((c) => `${c.id}@${fmt(when(c))}`).join(' · ') : '없음 (정점의 소리 또는 의도한 정적인지 대조)'}`);
    if (over.length) lines.push(`· 핵심어 발화 중에 시작하는 효과음 ${over.map((c) => c.id).join(' · ')} — 가림은 node pipeline/sfx-fit.mjs <p> 의 대사 위 음성 대역 안내로 확인`);
  }
  return {lines, problems, onset};
}

// ② 무료 추정 — tts.mjs --measure 와 같은 say 설정. 첫 발화 앵커의 시작 + 핵심어 앞/끝까지의 say 길이 ÷ 음성 배속 ÷ 조립 배속
function sayEstimate(cuts, keywords) {
  const list = cuts.cuts || [], i = list.findIndex((c) => c.say);
  if (i < 0) return {error: '발화(say)가 있는 컷이 없다'};
  const c = list[i], hit = keywordInSay(c.say, keywords);
  if (!hit) return {error: `${c.id} 대사에서 핵심어 「${keywords.join(' | ')}」를 찾지 못했다 — 대사 표기 그대로 적는다(전사용 숫자 표기는 \`|\`로 더한다)`};
  const V = cuts.voice || {}, speed = Math.min(2, Math.max(0.5, V.speed ?? 1.5)), tempo = cuts.timing?.speed || 1.2;
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'abm-hook-'));
  try {
    const len = (text, n) => {
      if (!text.trim()) return 0;
      const f = path.join(tmp, `${n}.aiff`);
      execFileSync('say', ['-v', V.say_voice || (/[가-힣]/.test(c.say) ? 'Yuna' : 'Samantha'), '-r', String(V.rate || 200), '-o', f, text]);
      return audioInfo(f, {decode: false}).duration;
    };
    const start = list.slice(0, i).reduce((t, x) => t + (+x.dur || 0), 0) + (c.voice_offset_s ?? (V.lead ?? 0.12));
    return {k: hit.k, s: start + len(c.say.slice(0, hit.i), 'a') / speed / tempo, e: start + len(c.say.slice(0, hit.i + hit.k.length), 'b') / speed / tempo};
  } finally { rmSync(tmp, {recursive: true, force: true}); }
}

function sheet(video, fps, frames, out, times) {
  const n = [...new Set(times.map((t) => Math.min(Math.round(t * fps), frames - 1)))].sort((a, b) => a - b);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-vf',
    `select=${n.map((x) => `eq(n\\,${x})`).join('+')},scale=360:-2,tile=${n.length}x1:padding=8:color=0x111111`,
    '-frames:v', '1', '-fps_mode', 'vfr', out]);
}

function probe(video) {
  const s = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries',
    'stream=r_frame_rate,nb_read_packets', '-of', 'json', video], {encoding: 'utf8'})).streams[0];
  const [a, b] = s.r_frame_rate.split('/').map(Number);
  return {fps: a / (b || 1), frames: Number(s.nb_read_packets)};
}

// ⑤ 최종 MP4의 첫 소리 — 처음 3초에서 -40dB 위로 올라오는 시각 (BGM 포함이라 대사 시작이 아니라 「소리가 비어 있지 않은가」만 본다)
function firstSound(video) {
  const log = spawnSync('ffmpeg', ['-hide_banner', '-t', '3', '-i', video, '-af', 'silencedetect=noise=-40dB:d=0.05', '-f', 'null', '-'], {encoding: 'utf8'}).stderr || '';
  const s = log.match(/silence_start: ([\d.]+)/), e = log.match(/silence_end: ([\d.]+)/);
  return s && +s[1] < 0.02 ? (e ? +e[1] : 3) : 0;
}

try {
  const {dir: P, out: O, name} = resolveProject(arg), HF = path.join(P, 'hyperframes'), REV = path.join(O, 'review');
  const cuts = JSON.parse(read(path.join(P, 'cuts.json')) || '{}');
  if (isBundle(cuts)) { console.log('  롱폼 묶음은 대상이 아니다 — 첫 3초는 챕터 1 원본 숏츠에서 본다 (docs/channel/08-longform.md)'); process.exit(0); }
  if (!PLAN) {   // 🔴 수정 묶음이 열려 있으면 시트를 만들지 않는다 (review-sheet 와 같은 규율 · CLAUDE.md 「수정 요청」)
    try { execFileSync(process.execPath, [path.join(ROOT, 'pipeline', 'fix-batch.mjs'), 'guard', P], {stdio: ['ignore', 'ignore', 'inherit']}); }
    catch { console.error('  → 수정 묶음이 열려 있다. 지적을 전부 고치고 묶음을 닫은 뒤 다시 부른다.'); process.exit(3); }
  }
  const beat = readBeat(read(path.join(P, 'README.md')));
  const problems = [];
  if (!beat.present) {
    if (beat.required) problems.push('README에 「첫 3초 비트」 절이 없다 — new.sh 골격의 표를 복구해 채운다');
    else console.log('  (비트 절 도입 전 골격 — 시트와 시각 대조만 한다)');
  } else {
    if (beat.empty.length) problems.push(`비트 빈칸: ${beat.empty.join(' · ')} — 네 행의 화면·움직임·말 칸을 채운다`);
    if (!beat.keywords.length) problems.push('「핵심어:」가 비었다 — 정점에서 들릴 첫 발화의 핵심어를 대사 표기 그대로 적는다');
  }
  if (beat.posterEmpty?.length) problems.push(`0초 포스터 빈칸: ${beat.posterEmpty.join(' · ')} — README 「첫 3초 비트」 아래에 화면에 쓸 주제 제목·후킹 글자와 키 비주얼을 적는다 (SKILL 「최우선」 0.0초 포스터)`);
  if (!PLAN && beat.posterRequired) {
    const ps = posterInSource(path.join(P, 'hyperframes'), beat.poster);
    for (const k of ps.missing) problems.push(`0초 포스터 ${k} 「${beat.poster[k]}」가 첫 장면 소스(index.html·${ps.files.join('·') || '0초 슬롯 없음'})에 없다 — 0초 화면의 마크업에 그 글자를 둔다(스크립트로 넣은 글자는 못 찾는다 — stage-gate ④ 하드)`);
  }
  if (!PLAN && beat.posterRequired) {   // 글자 크기 — 가장 작은 글자도 POSTER_MIN_PX 이상, 후킹이 가장 크다 (2026-10-21 사용자)
    const sz = posterFontSizes(path.join(P, 'hyperframes'), beat.poster), t = sz['주제 제목'], h = sz['후킹'], known = [t, h].filter(Boolean);
    if (known.length && Math.min(...known.map((v) => v.min)) < POSTER_MIN_PX) problems.push(`0초 포스터 글자가 작다 — 제목 ${fmtPx(t)} · 후킹 ${fmtPx(h)} (가장 작은 조각도 최소 ${POSTER_MIN_PX}px) — 프로필 그리드 칸에서 읽히게 키운다`);
    else if (t && h && h.max < t.max) problems.push(`0초 포스터 후킹(${fmtPx(h)})이 제목(${fmtPx(t)})보다 작다 — 가장 큰 글자는 볼 이유다`);
    beat.posterSizes = sz;
  }
  console.log(`\n  ══ 첫 1·2·3초 — ${name} · ${PLAN ? '②·③ 설계·핵심어 시각' : FROM ? '⑤ 최종 MP4' : '④ 훅 잠금'} ══`);

  const t = timing({O, HF, beat, cuts});
  problems.push(...t.problems);
  const times = [...new Set([...SHEET_T, ...(t.onset ? [t.onset.s, t.onset.s + 0.3] : [])].map((x) => +x.toFixed(2)))].sort((a, b) => a - b);
  let sheetFile = null, record = null;
  if (!PLAN) {
    mkdirSync(REV, {recursive: true});
    if (FROM) {
      const video = path.isAbsolute(FROM) ? FROM : existsSync(FROM) ? path.resolve(FROM) : path.join(O, path.basename(FROM));
      if (!existsSync(video)) throw new Error(`영상을 못 찾았다: ${FROM}`);
      const {fps, frames} = probe(video);
      sheetFile = path.join(REV, 'hook-final.png');
      sheet(video, fps, frames, sheetFile, times);
      const s = firstSound(video);
      if (s > 0.5) problems.push(`최종 MP4가 처음 ${fmt(s)}초 동안 무음이다 — 첫 움직임의 소리·첫 어절이 빠졌는지 확인`);
      console.log(`  소리  처음 소리 ${fmt(s)}초`);
      record = {file: 'hook-final.json', data: {version: 1, video: path.basename(video), videoHash: fileHash(video)}};
    } else {
      const narration = path.join(O, 'narration.wav');
      const key = digest(JSON.stringify({before: manifest(HF), start: PREVIEW.start, end: PREVIEW.end, fps: PREVIEW.fps,
        audio: existsSync(narration) ? fileHash(narration) : null}));
      const mp4 = path.join(REV, 'motion-preview-hook-0-3.mp4');
      sheetFile = path.join(REV, 'hook-sheet.png');
      let old = null;
      try { old = readJson(path.join(REV, 'hook-check.json')); } catch {}
      if (old?.key === key && existsSync(mp4)) console.log('  ✔ 같은 소스의 0~3초 재생 시안 재사용');
      else {
        execFileSync(process.execPath, [path.join(ROOT, 'pipeline/motion-preview.mjs'), P,
          `--start=${PREVIEW.start}`, `--end=${PREVIEW.end}`, `--fps=${PREVIEW.fps}`], {stdio: 'inherit'});
        // 훅 구간 이름으로 옮겨 다른 구간 시안에 덮이지 않게 한다 (ABMEN stage-gate ④ 는 motion-preview*.mp4.json 도 본다)
        renameSync(path.join(REV, 'motion-preview.mp4'), mp4);
        renameSync(path.join(REV, 'motion-preview.mp4.json'), mp4 + '.json');
      }
      const {fps, frames} = probe(mp4);
      sheet(mp4, fps, frames, sheetFile, times);         // 시트는 핵심어 시각이 바뀔 수 있어 매번 다시 뽑는다 (0.5초)
      record = {file: 'hook-check.json', data: {version: 1, key, preview: path.basename(mp4)}};
    }
  }

  if (sheetFile) console.log(`  시트  ${sheetFile}\n        왼쪽부터 ${times.map((x) => t.onset && x === +t.onset.s.toFixed(2) ? `${x}(핵심어)` : x).join(' · ')}초 · 폭 360px 정지 표본`
    + (FROM ? '' : `\n  재생  ${path.join(REV, 'motion-preview-hook-0-3.mp4')} (나레이션 포함 0~3초 시안)`));
  if (beat.posterRequired) console.log(`  포스터  주제 제목 「${beat.poster['주제 제목'] || '—'}」 · 후킹 「${beat.poster['후킹'] || '—'}」\n          키 비주얼 ${beat.poster['키 비주얼'] || '—'}`
    + (beat.posterSizes ? `\n          글자  제목 ${fmtPx(beat.posterSizes['주제 제목'])} · 후킹 ${fmtPx(beat.posterSizes['후킹'])} (가장 작은 조각도 최소 ${POSTER_MIN_PX}px — 후킹이 가장 크게)` : ''));
  console.log('  시각  ' + (t.lines.join('\n        ') || '—'));
  if (problems.length) console.log('  ⚠️ ' + problems.join('\n  ⚠️ '));
  else console.log('  ✅ 칸·시각 대조에 빠진 곳 없음 — 화면 판정은 아래대로 직접 한다');
  console.log(PLAN
    ? '  → 0초 포스터 세 줄과 비트 네 행을 SKILL 「최우선」 합격 조건·6원칙과 대조한다. ③ 전사 뒤 다시 돌려 실측 시각을 STORYBOARD 첫 행 정점에 적는다'
    : '  → 시트를 직접 열어 첫 칸(0초)이 포스터인지 — 주제가 읽히고 볼 이유(후킹)가 가장 큰 글자이며, 주인공이 작게 봐도 보이고, 세 요소가 한 장에 완성돼 있는지 — 먼저 판정하고,\n    README 「첫 3초 비트」 네 행과 대조한다(자막·그림만으로 뜻이 통하는가 포함). 주연의 첫 트윈·정점 시각은 첫 컷 소스에서 읽어\n    위 핵심어 시각과 맞춘다. 시트는 정지 표본이다 — 연속 재생·청취는 사람이 하고, 못 했으면 「첫 3초 재생·청취 미검증」으로 넘긴다');
  if (record) {
    const data = {...record.data, sheet: path.basename(sheetFile), sheetHash: fileHash(sheetFile), keyword: beat.keyword || null, onset: t.onset?.s ?? null, problems};
    writeFileSync(path.join(REV, record.file), JSON.stringify(data, null, 2) + '\n');
    if (FROM) {   // 판본마다 기록·시트를 따로 둔다 — 다른 MP4로 돌려도 단계 5가 「다른 판」으로 보지 않게 (2026-10-21 감사: 한 칸이라 본편·인스타 판이 서로 덮었다)
      const tag = record.data.video.replace(/\.mp4$/i, '');
      const perSheet = path.join(REV, `hook-final.${tag}.png`);
      copyFileSync(sheetFile, perSheet);
      writeFileSync(path.join(REV, `hook-final.${tag}.json`), JSON.stringify({...data, sheet: path.basename(perSheet)}, null, 2) + '\n');
    }
  }
} catch (e) { console.error('✗ ' + e.message); process.exitCode = 1; }
