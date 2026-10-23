// 결정론 파티클 버스트 — 라이브러리 없이 프레임 순수 함수 (stack-verify 판정: 커스텀 도입).
// 규칙: 파티클은 정보를 전달할 때만 — 돈이 확정되는 순간의 코인 버스트 1회 (c06 80,000원 착지).
// tsparticles 류(자체 ticker)는 결정론 위반이라 금지. random(seed) 은 프레임 무관 고정값.
import React from 'react';
import {random} from 'remotion';
import {FPS} from './config';

const N = 26;
const LIFE = 0.55; // 초
const G = 3600; // px/s²

export const CoinBurst: React.FC<{frame: number; at: number; seed?: string}> = ({
  frame,
  at,
  seed = 'coins',
}) => {
  const t = (frame - at) / FPS;
  if (t <= 0 || t > LIFE) return null;
  return (
    <div style={{position: 'absolute', left: '50%', top: '55%', width: 0, height: 0, zIndex: 3}}>
      {Array.from({length: N}, (_, i) => {
        const ang = (-90 + (random(`${seed}a${i}`) * 2 - 1) * 58) * (Math.PI / 180);
        const v0 = 700 + random(`${seed}v${i}`) * 900;
        const x = Math.cos(ang) * v0 * t;
        const y = Math.sin(ang) * v0 * t + 0.5 * G * t * t;
        const size = 13 + random(`${seed}s${i}`) * 9;
        const rot = (random(`${seed}r${i}`) * 2 - 1) * 540 * t;
        const fade = t < LIFE * 0.6 ? 1 : 1 - (t - LIFE * 0.6) / (LIFE * 0.4);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x - size / 2,
              top: y - size / 2,
              width: size,
              height: size,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 30%, #FFD75E 0%, #F5B301 55%, #D08F00 100%)',
              boxShadow: 'inset 0 -2px 0 rgba(0,0,0,.18)',
              transform: `rotate(${rot}deg) scaleX(${0.6 + 0.4 * Math.abs(Math.cos(rot / 40))})`,
              opacity: fade,
            }}
          />
        );
      })}
    </div>
  );
};
