// 프로젝트 motion/index.ts 가 내보내는 것. Root.tsx 가 이걸로 컴포지션 "Main" 을 등록한다.
import type React from 'react';

export type ProjectDef = {
  Main: React.FC;
  /** 에셋 검증 시트 (선택) — 원자를 한 장에 늘어놓고 잘림·대비를 눈과 픽셀로 본다.
   *  조립 전에 이걸 먼저 통과시킨다 (2026-09-08 사용자 지시). */
  Kit?: React.FC;
  kitHeight?: number;
  fps: number;
  totalFrames: number;
  width?: number;
  height?: number;
};
