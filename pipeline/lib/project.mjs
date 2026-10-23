// 프로젝트 찾기 (Node) — lib/resolve.sh 와 같은 규칙. 순번(2·00002) / 폴더명 / 부분일치 / 경로.
// 반환: { dir: projects/<p> 절대경로, name: 폴더명, out: projects/<p>/output 절대경로(생성됨) }
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PROJECTS = path.join(ROOT, 'projects');

/** 순번·부분일치 → 폴더 하나. 같은 번호가 둘이면 {ambiguous} (2026-10-21 — 다른 클론이 각자 번호를 매긴 19쌍) */
export function matchProject(names, s) {
  const n = /^\d+$/.test(s) ? String(parseInt(s, 10)).padStart(5, '0') : null;
  const hits = n ? names.filter(x => x.startsWith(n + '-')) : [];
  const cands = hits.length ? hits : names.filter(x => x.includes(s));
  return cands.length > 1 ? { ambiguous: cands } : cands.length === 1 ? { hit: cands[0] } : {};
}

export function resolveProject(q, { usage = '' } = {}) {
  let dir = null;
  if (q) {
    const s = q.replace(/\/+$/, '');
    if (existsSync(path.join(s, 'cuts.json'))) dir = path.resolve(s);
    else if (existsSync(path.join(PROJECTS, s))) dir = path.join(PROJECTS, s);
    else {
      const names = existsSync(PROJECTS) ? readdirSync(PROJECTS).filter(x => !x.startsWith('.')).sort() : [];
      const m = matchProject(names, s);
      if (m.ambiguous) {   // 알파벳 첫 폴더가 조용히 골라지던 것(ABMEN 00115~00120)을 막는다
        console.error(`✗ 「${q}」에 맞는 프로젝트가 ${m.ambiguous.length}개다 — 폴더명 전체로 지목한다: ${m.ambiguous.join(' · ')}`);
        process.exit(1);
      }
      if (m.hit) dir = path.join(PROJECTS, m.hit);
    }
  }
  if (!dir) {
    console.error(`✗ 프로젝트를 찾지 못했습니다: ${q || '(없음)'}   (예: 2 · 00002 · 00002-온누리적립)`);
    if (usage) console.error(`  ${usage}`);
    process.exit(1);
  }
  const name = path.basename(dir);
  const out = path.join(dir, 'output');   // 🔴 2026-09-16: output/<p> → projects/<p>/output (사용자 지시)
  mkdirSync(out, { recursive: true });
  return { dir, name, out };
}
