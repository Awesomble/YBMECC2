// Shared by Claude /video, Codex $video and the CLI. No model-specific runtime.
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const fileHash = file => digest(readFileSync(file));
export const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
export const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id);
export function factBlock(text) {
  return (text.replace(/\r\n/g, '\n').match(/^## 확정 팩트[^\n]*\n[\s\S]*?(?=^## |$(?![\s\S]))/m) || [''])[0].trim();
}
function factInputs(dir) {
  const block = factBlock(readFileSync(path.join(dir, 'README.md'), 'utf8'));
  if (!block) throw new Error('README 확정 팩트 절이 없다');
  const refs = path.join(dir, 'assets/refs');
  const files = existsSync(refs) ? readdirSync(refs, {withFileTypes:true}).filter(e => e.isFile()).map(e => [e.name, fileHash(path.join(refs, e.name))]).sort() : [];
  return {block, files};
}
export const factsHash = dir => digest(JSON.stringify(factInputs(dir)));
export function factItems(text) {
  const rows = factBlock(text).split('\n').filter(l => /^\s*\|/.test(l));
  // 머리글이 「# | 항목 | …」처럼 번호 열로 시작하는 표도 있다(00027·00115) — 그 머리글 칸을 팩트로 세지 않는다
  return rows.map(l => l.split('|')[1]?.trim()).filter(v => v && !/^(항목|#|번호|[-:\s]+)$/.test(v));
}
// Local evidence must be an actual top-level refs file included in this exact
// facts fingerprint. Merely citing an existing path (or a symlink) is not enough.
function verifiedRefs(projectDir, expectedHash, resultHash) {
  const files = new Set();
  if (!projectDir || !expectedHash || resultHash !== expectedHash) return files;
  try {
    const inputs = factInputs(projectDir);
    if (digest(JSON.stringify(inputs)) !== expectedHash) return files;
    const refs = path.resolve(projectDir, 'assets/refs');
    const realRefs = path.join(realpathSync(projectDir), 'assets/refs');
    if (realpathSync(refs) !== realRefs) return files;
    for (const [name] of inputs.files) {
      const file = path.join(refs, name);
      if (realpathSync(file) === path.join(realRefs, name)) files.add(file);
    }
  } catch { /* Missing or unreadable evidence remains unverified. */ }
  return files;
}
function hasVerifiedSource(source, projectDir, refs) {
  // The verifier may mix web URLs and supplied captures in either order.
  // Check each citation so a leading URL cannot hide an untracked local file.
  return source.split(';').every(value => {
    let file = value.trim();
    if (!file) return false;
    if (/^https?:\/\//.test(file)) return true;
    if (!refs.size) return false;
    try {
      if (/^file:/i.test(file)) {
        const url = new URL(file);
        if (url.search || url.hash) return false;
        file = fileURLToPath(url);
      }
      if (file.split(/[\\/]/).includes('..')) return false;
      const candidates = path.isAbsolute(file) ? [path.resolve(file)]
        : [path.resolve(projectDir, file), path.resolve(projectDir, '../..', file)];
      return candidates.some(candidate => refs.has(candidate));
    } catch { return false; }
  });
}
// BGM 라이선스 — CC0·퍼블릭 도메인만 자유롭게 쓸 수 있다. Pixabay 는 자체 Content License(2026-10-21 제거), 'pd' 는 낱말 단위("updated" 통과 방지)
export const FREE_LICENSE = /\bcc0\b|public domain|\bpd\b/i;
export function verificationErrors(result, expectedHash, {maxAgeHours = 24, now = Date.now(), expectedItems = [], projectDir} = {}) {
  const errors = [];
  if (!result || !Array.isArray(result.claims) || !result.claims.length) return ['교차검증 claims가 없거나 비었다'];
  const refs = verifiedRefs(projectDir, expectedHash, result.inputHash);
  for (const [i, c] of result.claims.entries()) {
    if (!c || !['item','our_value','found_value','source_url','grade','note'].every(k => typeof c[k] === 'string') ||
        !['일치','불일치','확인불가'].includes(c.verdict) || !['1차','2차','3차','없음'].includes(c.grade)) errors.push(`교차검증 주장 ${i + 1} 형식 오류`);
    else if (c.verdict === '일치' && (!c.item.trim() || !c.found_value.trim() || !hasVerifiedSource(c.source_url, projectDir, refs) || c.grade === '없음')) errors.push(`주장 ${i + 1}: 일치 판정의 근거가 없다`);
  }
  for (const key of ['missing_conditions','risky_phrasings']) {
    if (!Array.isArray(result[key]) || !result[key].every(v => typeof v === 'string')) errors.push(`${key} 형식 오류`);
  }
  const items = new Set(result.claims.map(c => c?.item));
  const missing = expectedItems.filter(item => !items.has(item));
  if (missing.length) errors.push(`검증에서 빠진 팩트 항목: ${missing.join(', ')}`);
  const derived = result.claims.some(c => c?.verdict === '불일치') ? '정지'
    : result.claims.some(c => c?.verdict === '확인불가') || result.missing_conditions?.length ? '보류' : '통과';
  if (!['통과','보류','정지'].includes(result.overall) || result.overall !== derived) errors.push('overall과 개별 주장/누락 조건의 판정이 다르다');
  if (expectedHash) {
    if (result.inputHash !== expectedHash) errors.push('현재 팩트·원본과 교차검증 지문이 다르거나 없다');
    const age = now - Date.parse(result.verifiedAt);
    if (!Number.isFinite(age) || age < -60000 || age > maxAgeHours * 3600000) errors.push('교차검증 기준일이 없거나 유효기간이 지났다');
  }
  return errors;
}

export function audioInfo(file, {decode = true} = {}) {
  const info = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',file], {encoding:'utf8', stdio:['ignore','pipe','pipe']}));
  const duration = Number(info.format?.duration);
  if (!(duration > 0) || !Number.isFinite(duration) || !info.streams?.some(s => s.codec_type === 'audio')) throw new Error(`유효한 음성 트랙/길이가 없다: ${path.basename(file)}`);
  if (decode) execFileSync('ffmpeg', ['-v','error','-xerror','-i',file,'-map','0:a:0','-f','null','-'], {stdio:['ignore','pipe','pipe']});
  return {duration};
}

export function voiceInputHash(project, cut) {
  const v = project.voice || {};
  const settings = Object.fromEntries(Object.entries(v).filter(([k]) => !['assets','lead'].includes(k)).sort(([a],[b]) => a.localeCompare(b)));
  return digest(JSON.stringify({say:cut.say, settings, emotion:cut.emotion ?? v.emotion ?? null, intensity:cut.emotion_intensity ?? null,
    ...(cut.dialogue !== undefined ? {dialogue:cut.dialogue} : {})}));
}
export function voiceFile(dir, project, cut) {
  if (!validId(cut.id)) throw new Error(`잘못된 음성 ID: ${cut.id}`);
  const file = project.voice?.assets?.[cut.id]?.file || `${cut.id}.m4a`;
  if (path.basename(file) !== file || !/\.m4a$/i.test(file)) throw new Error(`잘못된 음성 파일: ${file}`);
  return path.join(dir, 'voice', file);
}
export function voiceState(dir, project, cut) {
  const file = voiceFile(dir, project, cut);
  if (!existsSync(file)) return {state:'missing', file};
  const record = project.voice?.assets?.[cut.id];
  if (!record) return {state:'untracked', file};
  return {state: record.inputHash === voiceInputHash(project, cut) && record.fileHash === fileHash(file) ? 'current' : 'stale', file};
}
export function narrationInputHash(dir, project, timing) {
  return digest(JSON.stringify({version:2, speed:timing.speed, ends:timing.ends, units:timing.units,
    voices:project.cuts.filter(c => c.say).map(c => [c.id, voiceInputHash(project,c), fileHash(voiceFile(dir,project,c))])}));
}
export function assertNarrationCurrent(dir, project, timing) {
  const file=path.join(dir,'output/narration.wav'), state=readJson(file+'.state.json');
  if(state.version!==1 || state.inputHash!==narrationInputHash(dir,project,timing) || state.fileHash!==fileHash(file)) throw new Error('나레이션이 현재 대본·음성·시간축보다 낡았다 — narration.sh 실행');
  return file;
}
export function audioBuildState(dir, project, timing) {
  const source=assertNarrationCurrent(dir,project,timing), sourceHash=fileHash(source);
  const audioKey=digest(JSON.stringify({sourceHash,bounds:timing.ends,speed:timing.speed}));
  const metadataKey=digest(JSON.stringify({audioKey,words:fileHash(path.join(dir,'output/whisper-words.json')),cuts:project.cuts.map(c=>[c.id,c.text,c.say])}));
  return {audioKey,metadataKey,sourceHash};
}
export function validatedWords(file, narrationFile) {
  const cache = readJson(file);
  if (!cache || cache.version !== 1 || cache.sourceHash !== fileHash(narrationFile)) throw new Error('전사 캐시가 현재 나레이션과 다르다 — transcribe.py --retranscribe');
  const words = cache.words;
  if (!Array.isArray(words) || !words.length) throw new Error('전사 어절이 비었다');
  const duration = audioInfo(narrationFile, {decode:false}).duration;
  if (words.some((w,i) => !w || typeof w.t !== 'string' || !w.t.trim() || !Number.isFinite(w.s) || !Number.isFinite(w.e) || w.s < 0 || w.e < w.s || w.e > duration + 0.15 || (i > 0 && w.s < words[i-1].s))) throw new Error('전사 어절의 내용·시간 범위가 잘못됐다');
  return words;
}
