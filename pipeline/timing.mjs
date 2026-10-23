#!/usr/bin/env node
// node pipeline/timing.mjs <p> [--migrate | --check | --json]
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {resolveProject} from './lib/project.mjs';
import {readTiming,legacyTiming,timingFromCuts,syncTimeline} from './lib/timing.mjs';
const {dir} = resolveProject(process.argv[2]);
const file = path.join(dir,'cuts.json'), project = JSON.parse(readFileSync(file,'utf8'));
try {
  if (process.argv.includes('--migrate') && project.timing?.version !== 1) {
    const old = legacyTiming(dir);
    if (old.ends.length !== project.cuts.length) throw new Error('기존 타임라인과 컷 수가 다르다 — 자동 이전하지 않는다');
    if (old.units.map(u=>u.file).join() !== project.cuts.filter(c=>c.say).map(c=>c.id).join()) throw new Error('기존 UNITS와 앵커 컷이 다르다 — 먼저 실제 음성 배치를 확인한다');
    project.timing = {version:1,speed:old.speed};
    project.fps = old.fps;
    project.cuts.forEach((c,i)=>{
      const start = (old.ends[i-1] || 0)/old.speed;
      c.dur = +(old.ends[i]/old.speed-start).toFixed(6);
      const u=old.units.find(u=>u.file===c.id);
      if(u){c.voice_offset_s=+(u.startM/old.speed-start).toFixed(6);c.voice_comp_db=u.comp;}
    });
    timingFromCuts(project); // validate before writing
    syncTimeline(dir,project);
    writeFileSync(file,JSON.stringify(project,null,2)+'\n');
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(readTiming(dir,project)));
  else if (process.argv.includes('--check')) {
    const expected=timingFromCuts(project), actual=legacyTiming(dir);
    if (JSON.stringify([expected.fps,expected.speed,expected.ends,expected.units])!==JSON.stringify([actual.fps,actual.speed,actual.ends,actual.units])) throw new Error('cuts.json과 timeline.ts가 다르다 — timing.mjs <p> 실행');
    console.log('✔ 시간축 파생본 일치');
  } else {
    if(project.timing?.version!==1) throw new Error('기존 영상은 먼저 --migrate로 실제 타임라인을 보존해 이전한다');
    const t=syncTimeline(dir,project);console.log(`✔ cuts.json → timeline.ts · ${t.ends.length}컷 · ${t.total.toFixed(3)}초`);
  }
} catch(e) {console.error(`✗ ${e.message}`);process.exit(1);}
