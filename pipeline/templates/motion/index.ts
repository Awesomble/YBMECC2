// 프로젝트 진입점 — 엔진 Root.tsx 가 컴포지션 "Main" 으로 등록한다 (pipeline/render.sh 가 src/project.ts 로 연결).
import type {ProjectDef} from '@engine/project-types';
import {Main} from './Main';
import {FPS, TOTAL_F} from './timeline';

export const PROJECT: ProjectDef = {Main, fps: FPS, totalFrames: TOTAL_F};
