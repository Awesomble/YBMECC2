#!/usr/bin/env node
// Shared, offline, pinned HyperFrames entry point. Does not install or upgrade.
import path from 'node:path';
import {resolveProject} from './lib/project.mjs';
import {resolveHyperframes,runHyperframes} from './lib/hyperframes-cli.mjs';
try {
  const {dir}=resolveProject(process.argv[2]);
  const hf=path.join(dir,'hyperframes'), args=process.argv.slice(3);
  if(!args.length) throw new Error('사용: node pipeline/hf-cli.mjs <p> <lint|check|snapshot|render|--resolve> [인자]');
  if(args[0]==='--resolve') console.log(resolveHyperframes(hf).cli);
  else {const r=runHyperframes(hf,args);if(r.error) throw r.error;process.exit(r.status ?? 1);}
} catch(e) {console.error(`✗ ${e.message}`);process.exit(1);}
