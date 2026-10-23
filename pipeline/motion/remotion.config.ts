import path from 'node:path';
import {Config} from '@remotion/cli/config';

Config.setOverwriteOutput(true);
// 결정론이 필요하므로 소프트웨어 인코딩(h264 CRF)을 쓴다 — VideoToolbox 는 SHA 불일치 (tool-research 실측)

// 프로젝트 씬은 이 폴더 밖(저장소 루트 projects/<p>/motion/)에 있다.
//  - 엔진 모듈은 '@engine/…' 별칭으로 (tsconfig paths 와 짝)
//  - 'react'·'@remotion/*' 같은 패키지는 프로젝트 폴더에서 위로 올라가도 없으므로 이 폴더의 node_modules 를 명시
// ⚠️ 이 파일 안의 __dirname 은 Remotion 로더 위치(node_modules/@remotion/cli/…)를 가리킨다 (실측) — cwd 를 쓴다.
//    그래서 렌더는 반드시 이 폴더에서 실행한다 (pipeline/render.sh · studio.sh 가 cd 해 준다).
const ROOT = process.cwd();
Config.overrideWebpackConfig((c) => ({
  ...c,
  resolve: {
    ...c.resolve,
    alias: {...(c.resolve?.alias ?? {}), '@engine': path.resolve(ROOT, 'src')},
    modules: [path.resolve(ROOT, 'node_modules'), 'node_modules'],
  },
}));
