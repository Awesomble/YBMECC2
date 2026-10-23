import {existsSync,readFileSync,readdirSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileHash,validId} from './workflow-state.mjs';

function inside(root,relative) {
  if(typeof relative!=='string' || !relative || path.isAbsolute(relative)) throw new Error('에셋은 프로젝트 상대 경로여야 한다');
  const p=path.resolve(root,relative), base=path.resolve(root)+path.sep;
  if(!p.startsWith(base)) throw new Error('에셋 경로가 프로젝트 밖이다');
  if(existsSync(p) && !realpathSync(p).startsWith(realpathSync(root)+path.sep)) throw new Error('에셋 링크가 프로젝트 밖이다');
  return p;
}
export function assetFiles(dir, asset) {
  return {source:inside(dir,asset.file),render:inside(path.join(dir,'hyperframes'),asset.render_file)};
}
export function assetDimensions(file) {
  const p=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',file],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  const s=p.streams?.[0];
  if(!s?.width || !s?.height) throw new Error('이미지 크기를 읽을 수 없다');
  return s;
}
export function validateAssets(dir, project, {final=false}={}) {
  const errors=[], pending=[];
  const assets=project.assets ?? [];
  if(!Array.isArray(assets)) return {errors:['cuts.json assets는 배열이어야 한다'],pending};
  const ids=new Set(), cuts=new Set((project.cuts || []).map(c=>c.id));
  let html='';
  const walk=d=>{if(!existsSync(d))return;for(const e of readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);if(e.isDirectory()&&!e.name.startsWith('.')&&e.name!=='node_modules')walk(f);else if(e.isFile()&&/\.(html|css|js)$/.test(e.name)) html+='\n'+readFileSync(f,'utf8');}};
  if(final) walk(path.join(dir,'hyperframes'));
  for(const a of assets) {
    try {
      if(!validId(a.id) || ids.has(a.id)) throw new Error('ID가 없거나 중복됐다');ids.add(a.id);
      if(!['cutout','background','official'].includes(a.kind)) throw new Error('kind는 cutout/background/official 중 하나다');
      if(!Array.isArray(a.cuts)||!a.cuts.length||a.cuts.some(c=>!cuts.has(c))) throw new Error('사용 컷이 없거나 잘못됐다');
      if(!['requested','received','approved'].includes(a.status)) throw new Error('status는 requested/received/approved 중 하나다');
      const {source,render}=assetFiles(dir,a);
      if(a.status!=='approved') {pending.push(a.id);if(final)throw new Error('에셋 수령·시각 검수가 완료되지 않았다');continue;}
      if(!existsSync(source)||!existsSync(render)) throw new Error('원본 또는 렌더 파일이 없다');
      if(a.sourceHash!==fileHash(source)||a.renderHash!==fileHash(render)) throw new Error('검수한 파일과 현재 파일이 다르다');
      const dim=assetDimensions(render);
      if(!Number.isFinite(a.min_width)||!Number.isFinite(a.min_height)||a.min_width<=0||a.min_height<=0)throw new Error('표시 크기·최대 확대에 필요한 min_width/min_height가 없다');
      if(dim.width<a.min_width||dim.height<a.min_height) throw new Error(`해상도 부족: ${dim.width}×${dim.height}`);
      if(final && a.usage === 'reference-only' && html.includes(a.render_file)) throw new Error('참고 전용 에셋이 최종 렌더 소스에서 참조된다');
      if(final && a.usage !== 'reference-only' && !html.includes(a.render_file)) throw new Error('검수한 에셋의 렌더 경로가 소스에서 참조되지 않는다');
    } catch(e) {errors.push(`${a?.id || '?'}: ${e.message}`);}
  }
  return {errors,pending};
}
