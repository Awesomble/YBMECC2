import {existsSync, readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync, spawnSync} from 'node:child_process';

export function installedHyperframes(extraRoots = []) {
  const roots = [...extraRoots, ...(process.env.ABM_HF_CACHE_ROOTS || '').split(path.delimiter).filter(Boolean), path.join(os.homedir(),'.npm/_npx'), path.join(os.homedir(),'.npm-global/cache/_npx')];
  try {roots.push(path.join(execFileSync('npm',['config','get','cache'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(),'_npx'));} catch {}
  const result = [];
  for(const root of new Set(roots)) {
    if(!existsSync(root)) continue;
    for(const d of readdirSync(root)) {
      const pkg=path.join(root,d,'node_modules/hyperframes/package.json');
      try {const p=JSON.parse(readFileSync(pkg,'utf8')), cli=path.join(path.dirname(pkg),'bin/hyperframes.mjs');
        if(p.name==='hyperframes' && existsSync(cli)) result.push({version:p.version,cli,packageDir:path.dirname(pkg)});
      } catch {}
    }
  }
  return result.sort((a,b)=>b.version.localeCompare(a.version,undefined,{numeric:true}));
}
export function resolveHyperframes(hf, {candidates} = {}) {
  const p=JSON.parse(readFileSync(path.join(hf,'package.json'),'utf8'));
  const pins=[...new Set([p.abm?.hyperframesVersion, ...Object.values(p.scripts||{}).flatMap(s=>[...s.matchAll(/hyperframes@([\d.]+)/g)].map(m=>m[1]))].filter(Boolean))];
  if(pins.length!==1) throw new Error(`HyperFrames 버전을 하나로 고정해야 한다: ${hf}/package.json`);
  const local=path.join(hf,'node_modules/hyperframes/package.json');
  const all=[...(candidates || installedHyperframes())];
  if(existsSync(local)) {const p=JSON.parse(readFileSync(local,'utf8'));all.unshift({version:p.version,cli:path.join(path.dirname(local),'bin/hyperframes.mjs'),packageDir:path.dirname(local)});}
  const found=all.find(c=>c.version===pins[0] && existsSync(c.cli));
  if(!found) throw new Error(`고정 버전 hyperframes@${pins[0]}의 로컬 CLI가 없다. 네트워크 허용 환경에서 해당 버전을 설치한 뒤 재시도한다. 자동 업그레이드하지 않는다.`);
  return found;
}
export function runHyperframes(hf, args, options={}) {
  const {cli}=resolveHyperframes(hf);
  return spawnSync(process.execPath,[cli,...args],{cwd:hf,stdio:'inherit',...options});
}
