// 컴포지션 본체 — 그라운드 고정 + 카메라(드리프트·펀치인·셰이크) + 컷 Sequence(133ms 스필) + 브랜드존 + 구운 자막.
// 엔진(@engine)은 물리·컴포넌트만, 이 영상의 배치·큐는 여기와 timeline.ts. 예시: projects/00002-온누리적립/motion/Main.tsx
import React from 'react';
import {AbsoluteFill, interpolate, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {Audio} from '@remotion/media';
import {Ground, Grain} from '@engine/Ground';
import {BRAND_TOP, FONT, PAYLOAD_CX, PAYLOAD_CY} from '@engine/tokens';
import {startF, durF, mf, B} from './timeline';
import {driftScale, driftXY, punchInScale, cameraShake} from './camera';
import {CUTS} from './cuts';
import {Subtitles} from '@engine/Subtitles';
import {SUBS} from './subtitles';
import {BrandLockup} from '@engine/BrandMark';
import {sSpring} from '@engine/helpers';

/** 스필 구간에서 나가는 컷 전체(헤드라인 포함)를 페이드 — 타이틀 겹침 방지 */
const CutWrap: React.FC<{i: number; children: React.ReactNode}> = ({i, children}) => {
  const f = useCurrentFrame();
  const d = durF(i);
  const o =
    i < CUTS.length - 1
      ? interpolate(f, [d - 2, d + 3], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
      : 1;
  return <div style={{position: 'absolute', inset: 0, opacity: o}}>{children}</div>;
};

export const Main: React.FC = () => {
  const frame = useCurrentFrame();
  const scale = driftScale(frame) + punchInScale(frame);
  const d = driftXY(frame);
  const sh = cameraShake(frame);
  return (
    <AbsoluteFill style={{fontFamily: FONT}}>
      {/* 나레이션 — pipeline/narration.sh → output/<p>/narration.wav (render.sh 가 public/project/ 에 스테이징). WAV 로 (m4a 는 +63.5ms 프라이밍 지연) */}
      <Audio src={staticFile('project/narration.wav')} />
      {/* BGM 을 쓰려면: resources/music/ 에서 골라 하이라이트부터 잘라 projects/<p>/assets/audio/bgm.mp3 로 굽고 (docs/11-motion.md BGM)
          <BgmAudio src={staticFile('project/bgm.mp3')} />  (import {Audio as BgmAudio} from 'remotion') */}
      {/* P6 지속 그라운드 — 카메라 밖. 전 컷 고정 */}
      <Ground />
      <AbsoluteFill
        style={{
          transform: `translate(${d.x + sh.x}px, ${d.y + sh.y}px) scale(${scale})`,
          transformOrigin: `${PAYLOAD_CX}px ${PAYLOAD_CY}px`,
        }}
      >
        {CUTS.map((Comp, i) => (
          <Sequence key={i} from={startF(i)} durationInFrames={durF(i) + (i < CUTS.length - 1 ? Math.round(0.133 * 60) : 0)}>
            <CutWrap i={i}>
              <Comp />
            </CutWrap>
          </Sequence>
        ))}
      </AbsoluteFill>
      {/* 브랜드존 — 전 컷 고정 (카메라 밖). 오프닝 아이덴트 동안 크게 섰다가 스프링 축소 */}
      <div
        style={{
          position: 'absolute',
          top: BRAND_TOP,
          left: 60,
          right: 60,
          display: 'flex',
          justifyContent: 'center',
          zIndex: 6,
          transform: `scale(${1.9 - 0.9 * sSpring(frame, B.c01.punch, 340, 22)})`,
          transformOrigin: 'center top',
        }}
      >
        <BrandLockup />
      </div>
      <Subtitles subs={SUBS} toFrame={mf} />
      <Grain />
    </AbsoluteFill>
  );
};
