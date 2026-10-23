#!/usr/bin/env node
// A short motion sample from the assembled HyperFrames runtime, without changing its timeline.
// This is a snapshot sequence + narration, not evidence of final MP4 compositing or the BGM mix.
// node pipeline/motion-preview.mjs <p> --start=0 --end=5 [--fps=24] [--plan]
import {readFileSync,writeFileSync,existsSync,mkdirSync,mkdtempSync,readdirSync,copyFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {resolveProject} from './lib/project.mjs';
import {resolveHyperframes} from './lib/hyperframes-cli.mjs';
import {manifest} from './lib/src-hash.mjs';
import {digest,fileHash} from './lib/workflow-state.mjs';
const args=process.argv.slice(3), value=(k,d)=>Number(args.find(a=>a.startsWith(k+'='))?.slice(k.length+1) ?? d);
let scratch;
try {
  const {dir,out}=resolveProject(process.argv[2]),hf=path.join(dir,'hyperframes');
  const source=readFileSync(path.join(hf,'index.html'),'utf8');
  const root=source.match(/<div\b[^>]*data-composition-id="main"[^>]*>/)?.[0];
  const duration=Number(root?.match(/data-duration="([^"]+)"/)?.[1]);
  const start=value('--start',0),end=value('--end',Math.min(5,duration)),fps=value('--fps',24);
  if(![start,end,fps,duration].every(Number.isFinite)||start<0||end<=start||end>duration||!Number.isInteger(fps)||fps<1||fps>60)throw new Error('구간은 전체 시간축 안의 start < end, fps는 1~60 정수여야 한다');
  const times=Array.from({length:Math.ceil((end-start)*fps)},(_,i)=>+(start+i/fps).toFixed(6)).filter(t=>t<end);
  if(args.includes('--plan')) {console.log(JSON.stringify({start,end,fps,frames:times.length,times}));process.exit(0);}
  const {cli}=resolveHyperframes(hf), before=manifest(hf), narration=path.join(out,'narration.wav');
  const key=digest(JSON.stringify({before,start,end,fps,audio:existsSync(narration)?fileHash(narration):null}));
  const review=path.join(out,'review');mkdirSync(review,{recursive:true});
  const dest=path.join(review,'motion-preview.mp4'),record=dest+'.json';
  try {const old=JSON.parse(readFileSync(record,'utf8'));if(old.key===key&&old.videoHash===fileHash(dest)){console.log(`✔ 동일 구간·소스 모션 시안 재사용: ${dest}`);process.exit(0);}} catch {}
  scratch=mkdtempSync(path.join(os.tmpdir(),'abm-motion-preview-'));
  execFileSync(process.execPath,[cli,'snapshot','--at',times.join(','),'--no-end','-o',scratch],{cwd:hf,stdio:'inherit'});
  const shots=readdirSync(scratch).filter(f=>/^frame-\d+-at-.*\.png$/.test(f)).sort((a,b)=>Number(a.match(/^frame-(\d+)/)[1])-Number(b.match(/^frame-(\d+)/)[1]));
  if(shots.length!==times.length)throw new Error(`표본 ${shots.length}/${times.length}: 누락된 시안으로 완료 처리하지 않는다`);
  const seq=path.join(scratch,'seq');mkdirSync(seq);
  shots.forEach((f,i)=>copyFileSync(path.join(scratch,f),path.join(seq,`${String(i).padStart(5,'0')}.png`)));
  const ff=['-v','error','-y','-framerate',String(fps),'-i',path.join(seq,'%05d.png')];
  if(existsSync(narration))ff.push('-ss',String(start),'-i',narration,'-map','0:v','-map','1:a','-c:a','aac');
  ff.push('-t',String(end-start),'-c:v','libx264','-pix_fmt','yuv420p',dest);
  execFileSync('ffmpeg',ff,{stdio:'inherit'});
  if(JSON.stringify(before)!==JSON.stringify(manifest(hf)))throw new Error('샘플 생성 중 소스가 바뀌었다. 이 시안을 검수 근거로 사용하지 않는다');
  writeFileSync(record,JSON.stringify({key,start,end,fps,videoHash:fileHash(dest),purpose:'motion-preview',finalRenderVerified:false},null,2)+'\n');
  console.log(`✔ ${dest} · ${fps}fps 모션/전환 시안. 나레이션 참고용이며 최종 60fps 합성·BGM 검수는 별도다`);
} catch(e) {console.error('✗ '+e.message);process.exitCode=1;}
finally {if(scratch)rmSync(scratch,{recursive:true,force:true});}
