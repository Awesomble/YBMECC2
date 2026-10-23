// 구운 자막 — 나레이션 전사 그대로, whisper 어절 온셋 실측(원음 초)을 프로젝트가 넘긴다.
// 그린 배경 위: 흰 900 + 강조 어절 1개만 노랑(G/R). 밴드 y 1350~1450, 카메라 밖 고정 (docs/11-motion.md).
import React from 'react';
import {useCurrentFrame} from 'remotion';
import {C, FONT} from './tokens';
import {clamp01, easeOutCubic} from './helpers';

export type Sub = {m: number; node: React.ReactNode};

export const Subtitles: React.FC<{subs: ReadonlyArray<Sub>; toFrame: (m: number) => number}> = ({
  subs,
  toFrame,
}) => {
  const frame = useCurrentFrame();
  let i = 0;
  while (i < subs.length - 1 && frame >= toFrame(subs[i + 1].m)) i++;
  const local = frame - toFrame(subs[i].m);
  const t = clamp01(local / 3);
  const pop = 1.04 - 0.04 * easeOutCubic(t);
  return (
    <div
      style={{
        position: 'absolute',
        left: 60,
        right: 60,
        top: 1352,
        height: 112,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 8,
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          // v17(2026-09-08): 56 → 68. 화면 본문이 300px 급으로 커지면서 자막이 부속처럼 보였다.
          // 무음 시청에서 자막이 본체라는 규격(docs/05)에 맞춰 키운다.
          fontSize: 68,
          fontWeight: 900,
          letterSpacing: -1.5,
          color: C.white,
          whiteSpace: 'nowrap',
          opacity: t,
          transform: `scale(${pop})`,
          willChange: 'transform',
          textShadow: '0 3px 12px rgba(0,0,0,.5)',
        }}
      >
        {subs[i].node}
      </div>
    </div>
  );
};
