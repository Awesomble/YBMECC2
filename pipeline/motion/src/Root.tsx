import React from 'react';
import {Composition} from 'remotion';
import {PROJECT} from './project'; // 생성 파일 — pipeline/render.sh · studio.sh 가 프로젝트를 고른다
import {WIDTH, HEIGHT} from './config';

export const Root: React.FC = () => (
  <>
    <Composition
      id="Main"
      component={PROJECT.Main}
      durationInFrames={PROJECT.totalFrames}
      fps={PROJECT.fps}
      width={PROJECT.width ?? WIDTH}
      height={PROJECT.height ?? HEIGHT}
    />
    {PROJECT.Kit ? (
      <Composition
        id="Kit"
        component={PROJECT.Kit}
        durationInFrames={1}
        fps={PROJECT.fps}
        width={PROJECT.width ?? WIDTH}
        height={PROJECT.kitHeight ?? 3200}
      />
    ) : null}
  </>
);
