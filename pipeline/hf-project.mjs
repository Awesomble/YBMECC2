#!/usr/bin/env node
// Native scaffold and timing-only assembly. Never rewrites authored frame motion.
// node pipeline/hf-project.mjs <p> <init|sync>
import {readFileSync,writeFileSync,existsSync,mkdirSync,copyFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {resolveProject,ROOT} from './lib/project.mjs';
import {installedHyperframes,resolveHyperframes} from './lib/hyperframes-cli.mjs';
import {audioBuildState,fileHash} from './lib/workflow-state.mjs';
import {readTiming,syncTimeline} from './lib/timing.mjs';
import {resolveSfxCues,sfxTrackTags} from './lib/sfx-tracks.mjs';
import {BRAND,brandCss,lockupMarkup} from './lib/brand.mjs';
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const writeChanged=(file,text)=>{if(!existsSync(file)||readFileSync(file,'utf8')!==text)writeFileSync(file,text);};
try {
  const {dir,name}=resolveProject(process.argv[2]), command=process.argv[3] || 'sync';
  const hf=path.join(dir,'hyperframes'), project=JSON.parse(readFileSync(path.join(dir,'cuts.json'),'utf8'));
  if(command==='init') {
    if(existsSync(path.join(hf,'index.html'))) throw new Error('기존 골격은 덮지 않는다. 시간축은 sync를 사용한다');
    const cli=installedHyperframes()[0];
    if(!cli) throw new Error('로컬 HyperFrames 설치가 없다. 먼저 고정 버전을 설치한다');
    const vendor=path.join(ROOT,'pipeline/templates/hyperframes/gsap.min.js');
    const sources=[[`resources/fonts/${BRAND.font.file}`,`fonts/${BRAND.font.file}`],[`resources/fonts/${BRAND.font.license}`,`fonts/${BRAND.font.license}`],...(BRAND.posterFont?[[`resources/fonts/${BRAND.posterFont.file}`,`fonts/${BRAND.posterFont.file}`],[`resources/fonts/${BRAND.posterFont.license}`,`fonts/${BRAND.posterFont.license}`]]:[]),['pipeline/templates/hyperframes/gsap.min.js','assets/vendor/gsap.min.js'],[BRAND.logo.file,BRAND.logo.asset]];
    for(const [source] of sources) if(!existsSync(path.join(ROOT,source))) throw new Error(`골격 자산 없음: ${source}`);
    mkdirSync(path.join(hf,'compositions/frames'),{recursive:true});
    for(const [source,target] of sources){const dest=path.join(hf,target);mkdirSync(path.dirname(dest),{recursive:true});if(!existsSync(dest))copyFileSync(path.join(ROOT,source),dest);}
    const scripts=Object.fromEntries(['lint','check','render','snapshot'].map(c=>[c,`node ../../../pipeline/hf-cli.mjs .. ${c}`]));
    writeFileSync(path.join(hf,'package.json'),JSON.stringify({name:'abm-'+name.slice(0,5),private:true,abm:{hyperframesVersion:cli.version},scripts},null,2)+'\n');
    writeFileSync(path.join(hf,'hyperframes.json'),JSON.stringify({$schema:'https://hyperframes.heygen.com/schema/hyperframes.json'},null,2)+'\n');
    const template=readFileSync(path.join(ROOT,'pipeline/templates/hyperframes/index.html'),'utf8');
    const wide=project.orientation==='landscape';
    const values={WIDTH:wide?1920:1080,HEIGHT:wide?1080:1920,TITLE:esc(project.title || name),DURATION:project.cuts?.length?readTiming(dir,project).total:1,TRACKS:'',BRAND_CSS:brandCss(),LOCKUP_MARKUP:lockupMarkup(project.cuts?.length?readTiming(dir,project).total:1),FONT_FAMILY:BRAND.font.family,BODY_WEIGHT:BRAND.type.bodyWeight,LANG:BRAND.language||'en'};
    writeFileSync(path.join(hf,'index.html'),template.replace(/\{\{(\w+)\}\}/g,(_,k)=>{if(!(k in values))throw new Error(`템플릿 치환값 없음: {{${k}}}`);return values[k];}));
    if(wide) console.log('가로 골격: 세로 브랜드 구역은 별도 구도로 조정해야 한다');
    console.log(`✔ HyperFrames ${cli.version} · 로컬 런타임·폰트·좌상단 로고·루트 시간축`);
    process.exit(0);
  }
  if(command!=='sync') throw new Error('명령: init | sync');
  resolveHyperframes(hf);
  const timing=readTiming(dir,project);
  const indexFile=path.join(hf,'index.html');
  let html=readFileSync(indexFile,'utf8');
  const frames=project.cuts.map((c,i)=>({id:c.frame || `${String(i+1).padStart(2,'0')}-${c.id}`,c,i}));
  for(const f of frames) if(!/^[\w-]+$/.test(f.id)||!existsSync(path.join(hf,'compositions/frames',f.id+'.html'))) throw new Error(`프레임을 먼저 작성한다: compositions/frames/${f.id}.html (cuts[].frame으로 기존 파일 지정 가능)`);
  if(!html.includes('<!-- ABM:tracks:start -->')) throw new Error('기존 수작업 index는 자동으로 덮지 않는다. 컷·시간·audio_meta를 대조하고 공용 트랙 구간을 명시적으로 이전한다');
  const meta=JSON.parse(readFileSync(path.join(hf,'audio_meta.json'),'utf8'));
  const expected=audioBuildState(dir,project,timing);
  if(meta.build?.metadataKey!==expected.metadataKey) throw new Error('오디오 메타가 현재 나레이션·대본·시간축보다 낡았다 — hf-audio 실행');
  if(meta.voices?.length!==frames.length) throw new Error('hf-audio로 현재 컷 오디오를 먼저 만든다');
  const lines=[];let start=0;
  for(const f of frames) {
    const dur=(timing.ends[f.i]-(timing.ends[f.i-1]||0))/timing.speed;
    const audioFile=path.resolve(hf,meta.voices[f.i].path);
    if(!audioFile.startsWith(path.resolve(hf)+path.sep)||!existsSync(audioFile)||fileHash(audioFile)!==meta.voices[f.i].fileHash) throw new Error(`${f.id}: 오디오 슬라이스가 없거나 변경됐다`);
    if(Math.abs(meta.voices[f.i].duration_s-dur)>0.002) throw new Error(`${f.id}: 오디오가 시간축보다 낡았다`);
    lines.push(`    <div id="el-${f.id}" class="scene clip frame-slot" data-composition-id="${f.id}" data-composition-src="compositions/frames/${f.id}.html" data-start="${start.toFixed(6)}" data-duration="${dur.toFixed(6)}" data-track-index="1"></div>`);
    lines.push(`    <audio id="el-${f.id}-voice" src="${esc(meta.voices[f.i].path)}" data-start="${start.toFixed(6)}" data-duration="${dur.toFixed(6)}" data-track-index="10"></audio>`);
    start+=dur;
  }
  if(meta.bgm?.path)lines.push(`    <audio id="el-bgm" src="${esc(meta.bgm.path)}" data-start="0" data-duration="${timing.total}" data-volume="${meta.bgm.volume ?? 0.2}" data-track-index="11"></audio>`);
  lines.push(...sfxTrackTags(resolveSfxCues(dir,meta,timing.total,ROOT,{copyMissing:true})));
  html=html.replace(/<!-- ABM:tracks:start -->[\s\S]*?<!-- ABM:tracks:end -->/,`<!-- ABM:tracks:start -->\n${lines.join('\n')}\n    <!-- ABM:tracks:end -->`);
  html=html.replace(/<(?:div|img)\b[^>]*(?:data-composition-id="main"|id="el-root-lockup")[^>]*>/g,t=>t.replace(/data-duration="[^"]*"/,`data-duration="${timing.total}"`));
  if(timing.canonical)syncTimeline(dir,project);
  writeChanged(indexFile,html);
  console.log(`✔ 시간축 → 루트 ${frames.length}장면·오디오·지속 요소. 프레임 안무와 자막은 보존했다`);
} catch(e) {console.error('✗ '+e.message);process.exit(1);}
