// cuts.json durations are display seconds. All derived clocks come from this module.
import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {validId} from './workflow-state.mjs';

const round = n => Math.round(n * 1e6) / 1e6;
export function timingFromCuts(project) {
  const speed = project.timing?.speed ?? 1.2;
  if (!(speed >= 0.5 && speed <= 2)) throw new Error('timing.speed는 0.5~2 범위여야 한다');
  if(!Number.isInteger(project.fps ?? 60) || (project.fps ?? 60)<1 || (project.fps ?? 60)>240) throw new Error('fps는 1~240 정수여야 한다');
  const cuts = project.cuts;
  if (!Array.isArray(cuts) || !cuts.length) throw new Error('컷이 없다');
  const ids = new Set(); let t = 0;
  const ends = [], units = [];
  for (const c of cuts) {
    if (!validId(c.id) || ids.has(c.id)) throw new Error(`컷 ID 오류/중복: ${c.id}`);
    ids.add(c.id);
    if (!(Number.isFinite(c.dur) && c.dur > 0)) throw new Error(`${c.id}: dur는 양의 표시 초여야 한다`);
    if (c.say) {
      const offset = c.voice_offset_s ?? 0;
      if (!Number.isFinite(offset) || offset < 0 || offset >= c.dur) throw new Error(`${c.id}: voice_offset_s 범위 오류`);
      const comp = c.voice_comp_db ?? 0;
      if (!Number.isFinite(comp)) throw new Error(`${c.id}: voice_comp_db 오류`);
      units.push({file:c.id, startM:round((t + offset) * speed), comp});
    }
    t = round(t + c.dur); ends.push(round(t * speed));
  }
  return {speed, fps:project.fps || 60, ends, units, total:t, canonical:true};
}
export function legacyTiming(dir) {
  const text = readFileSync(path.join(dir,'motion/timeline.ts'),'utf8');
  const speed = +(text.match(/export const SPEED\s*=\s*([\d.]+)/)?.[1] || 1.2);
  const array = text.match(/export const CUT_END_M\s*=\s*\[([\s\S]*?)\]/)?.[1];
  const ends = (array || '').replace(/\/\/[^\n]*/g,'').split(',').map(s => s.trim()).filter(Boolean).map(Number);
  const un = text.match(/export const UNITS\s*=\s*\[([\s\S]*?)\]/)?.[1] || '';
  const units = [...un.matchAll(/\{([^}]+)\}/g)].map(([,b]) => ({
    file:b.match(/file:\s*['"]([^'"]+)['"]/)?.[1], startM:Number(b.match(/startM:\s*([\d.]+)/)?.[1]), comp:Number(b.match(/comp:\s*(-?[\d.]+)/)?.[1] || 0)
  }));
  if (!(speed > 0) || !ends.length || ends.some((v,i) => !Number.isFinite(v) || v <= (ends[i-1] || 0)) || !units.length || units.some(u => !validId(u.file) || !Number.isFinite(u.startM))) throw new Error('레거시 timeline.ts를 해석할 수 없다 — 수식은 실측값으로 확인한 뒤 timing --migrate');
  return {speed, fps:Number(text.match(/export const FPS\s*=\s*([\d.]+)/)?.[1] || 60), ends, units, total:ends.at(-1)/speed, canonical:false};
}
export function readTiming(dir, project = JSON.parse(readFileSync(path.join(dir,'cuts.json'),'utf8'))) {
  return project.timing?.version === 1 ? timingFromCuts(project) : legacyTiming(dir);
}
export function syncTimeline(dir, project) {
  const timing = timingFromCuts(project);
  const file = path.join(dir,'motion/timeline.ts');
  let text = existsSync(file) ? readFileSync(file,'utf8') : `// Generated timing from cuts.json. Keep project-specific B/CAM below.\nexport const FPS = ${timing.fps};\nexport const SPEED = 1.2;\nexport const SCALE = 1 / SPEED;\nexport const mf = (m: number) => Math.round(m * SCALE * FPS);\nexport const CUT_END_M = [] as const;\nexport const UNITS = [] as const;\nexport const startF = (i: number) => i ? mf(CUT_END_M[i - 1]) : 0;\nexport const endF = (i: number) => mf(CUT_END_M[i]);\nexport const durF = (i: number) => endF(i) - startF(i);\nexport const TOTAL_F = endF(CUT_END_M.length - 1);\nexport const DURF = CUT_END_M.map((_, i) => durF(i));\n`;
  const replacements = [
    [/export const FPS\s*=\s*[\d.]+/,`export const FPS = ${timing.fps}`],
    [/export const SPEED\s*=\s*[\d.]+/,`export const SPEED = ${timing.speed}`],
    [/export const CUT_END_M\s*=\s*\[[\s\S]*?\](?:\s*as const)?/,`export const CUT_END_M = [\n${timing.ends.map((n,i)=>`  ${n.toFixed(6)}, // c${String(i+1).padStart(2,'0')} ${project.cuts[i].id}`).join('\n')}\n] as const`],
    [/export const UNITS\s*=\s*\[[\s\S]*?\](?:\s*as const)?/,`export const UNITS = [\n${timing.units.map(u=>`  {file: '${u.file}', startM: ${u.startM}, comp: ${u.comp}},`).join('\n')}\n] as const`]
  ];
  for (const [pattern,value] of replacements) {
    if (!pattern.test(text)) throw new Error(`timeline.ts 자동 갱신 대상이 없다: ${pattern}`);
    text = text.replace(pattern,value);
  }
  mkdirSync(path.dirname(file),{recursive:true});
  if (!existsSync(file) || text !== readFileSync(file,'utf8')) writeFileSync(file,text);
  return timing;
}
