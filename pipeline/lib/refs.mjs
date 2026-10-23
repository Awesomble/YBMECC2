// 실물 대조 — 실제 사진 여러 장을 분석해 생성 이미지·3D가 실물과 같아 보이게 한다 (2026-10-06 사용자 지시)
//   "실제 이미지 찾아서 재생성해 너무 사실성없고 실제이미지와 너무 달라서 현실감이 없어"
//   "건물같은구조물은 실제 사진 여러장 분석후 렌더링 하도록"
// ref-photos.mjs(수집·대조 시트) · asset-prompts.mjs(형식·생성·승인) · stage-gate.mjs(②④)가 같은 판정을 쓴다.
// 🔴 실물 사진은 **분석 전용**이다 — output/refs/(gitignore)에만 두고, 생성기에 첨부하지 않고(--image=),
//    assets/·resources/로 복사하지 않고, 화면·문안에 출처를 쓰지 않는다. 정본: video ② 「실물 대조」·docs/16 §4-1.
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {digest, fileHash, readJson} from './workflow-state.mjs';

export const REF_FORMAT = 2;       // cuts.json asset_prompt_format 이 이 값 이상이면 「실물 대조」·「실물 형상」이 필수 (new.sh 골격 2026-10-06~)
export const REF_MIN = 3;          // 한 장은 시점·시간대·화각이 치우친다 — 서로 다른 시점 세 장 이상
const IMG = /\.(?:jpe?g|png|webp)$/i;

export const refDir = (P, id) => path.join(P, 'output', 'refs', id);
export const refImages = (P, id) => existsSync(refDir(P, id))
  ? readdirSync(refDir(P, id)).filter((f) => IMG.test(f) && !f.startsWith('candidates')).sort().map((f) => path.join(refDir(P, id), f)) : [];
// 같은 사진을 두 번 받으면 한 장으로 센다 — 시점이 다른 실물 사진의 수가 기준이다
export function uniqueRefImages(P, id) {
  const seen = new Set();
  return refImages(P, id).filter((f) => { const h = fileHash(f); if (seen.has(h)) return false; seen.add(h); return true; });
}
export const refRecordFile = (P, id) => path.join(P, 'output', 'review', `ref-${id}.json`);
export function refRecord(P, id) { try { return readJson(refRecordFile(P, id)); } catch { return null; } }

// 3D 장면 소스의 지문 — 대조 시트를 만든 뒤 모델이 바뀌었는지 본다
export function sceneDigest(P) {
  const d = path.join(P, 'assets', 'scene');
  const files = existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.py')).sort() : [];
  return files.length ? digest(files.map((f) => f + '\0' + readFileSync(path.join(d, f), 'utf8')).join('\0')) : null;
}

// 「실물 대조:」(이미지 메타) · 「실물 형상:」(3D) 한 줄을 읽는다.
//   해당 없음 — <이유>
//   <대상> · refs <id> · 사진 N장(<시점·시간대>) · 식별 특징: <…>      (refs 를 생략하면 에셋 id)
//   <대상> · refs <id> · 사진 N장(<시점>) · 사양: <높이·밑변·비율·테이퍼·평면·외피·꼭대기·고유 디테일>
export function parseReal(value, fallbackId, {spec = false} = {}) {
  const v = String(value ?? '').trim();
  const key = spec ? '사양' : '식별 특징';
  if (!v) return {empty: true, error: '비었다'};
  if (/^해당\s*없음/.test(v)) {
    const reason = v.replace(/^해당\s*없음\s*[—–-]?\s*/, '').trim();
    return reason.length >= 4 && !/^</.test(reason) ? {none: true, reason} : {none: true, error: '「해당 없음 — <이유>」의 이유가 비었거나 너무 짧다 — 왜 실재 대상이 아닌지(상징 소품·추상 배경 등) 적는다'};
  }
  const refsId = v.match(/\brefs\s*[:：]?\s*([A-Za-z0-9_-]+)/)?.[1] || fallbackId;
  const count = +(v.match(/사진\s*(\d+)\s*장/)?.[1] || 0);
  const detail = v.match(new RegExp(`${key}\\s*[:：]\\s*(.+)$`))?.[1]?.trim() || '';
  const errors = [];
  if (!refsId) errors.push('「refs <id>」가 없다 — ref-photos 로 사진을 모은 폴더 id');
  if (count < REF_MIN) errors.push(`실제 사진이 ${count}장이다 — 서로 다른 시점 ${REF_MIN}장 이상을 분석한다(「사진 N장(시점)」)`);
  if (!detail || /^</.test(detail)) errors.push(`「${key}:」가 비었다 — 사진에서 읽은 형태·비율·재질·색·고유 디테일·흔히 틀리는 것`);
  return {refsId, count, detail, error: errors.join(' · ') || null};
}

// README 의 「실물 형상:」 줄들 (3D 실재 구조물). 템플릿 안내 주석·빈 칸은 empty 로 돌려준다
export function realShapes(readme) {
  return String(readme).split('\n').map((l) => l.match(/^\s*[-*]?\s*\**실물 형상\**\s*[:：]\s*(.*)$/)?.[1]).filter((x) => x !== undefined)
    .map((v) => ({raw: v.trim(), ...parseReal(v, null, {spec: true})}));
}
