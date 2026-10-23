// 그라운드 v2 — 「잘살아보세」: 관제 딥그린 풀블리드 + 레트로 TV 주사선 + 그레인.
// 단색 오너십 전략: 배경색이 곧 워터마크. 어닝·틴트 이벤트는 삭제 (색은 전 컷 불변).
import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C} from './tokens';

export const Ground: React.FC = () => (
  <AbsoluteFill style={{background: C.bg}}>
    {/* 아주 옅은 비네트 — 레트로 브라운관 느낌, 모서리만 */}
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(ellipse 120% 105% at 50% 46%, rgba(0,0,0,0) 62%, rgba(0,0,0,.22) 100%)',
      }}
    />
  </AbsoluteFill>
);

// 미세 그레인 + 주사선 (정적 — 결정론)
const NOISE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='7'/></filter><rect width='240' height='240' filter='url(%23n)'/></svg>\")";

// 필름 스크래치 스케줄 (초, x비율, 지속초) — 고정 표라서 결정론. 43초에 7회, 안 보일 만큼만
const SCRATCHES: Array<[number, number, number]> = [
  [3.1, 0.22, 0.4], [8.7, 0.71, 0.32], [14.2, 0.45, 0.45], [19.6, 0.86, 0.3],
  [25.3, 0.13, 0.4], [31.8, 0.58, 0.35], [38.4, 0.33, 0.42],
];

export const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 60;
  // 영사기 플리커 — 비정수비 사인 합 (C∞, 진폭 미세)
  const flick = Math.max(0, 0.014 + 0.014 * Math.sin(2 * Math.PI * t / 0.073) + 0.008 * Math.sin(2 * Math.PI * t / 0.112 + 1.3));
  return (
    <>
      <AbsoluteFill style={{backgroundImage: NOISE, opacity: 0.07, pointerEvents: 'none'}} />
      <AbsoluteFill
        style={{
          background: 'repeating-linear-gradient(0deg, rgba(0,0,0,.05) 0 2px, rgba(0,0,0,0) 2px 5px)',
          opacity: 0.5,
          pointerEvents: 'none',
        }}
      />
      {/* 세피아 웜 레이어 — 갱지 필름 색온도 */}
      <AbsoluteFill style={{background: 'rgba(224,188,112,0.05)', pointerEvents: 'none'}} />
      <AbsoluteFill style={{background: '#fff', opacity: flick, pointerEvents: 'none'}} />
      {SCRATCHES.map(([at, xr, d], i) =>
        t >= at && t < at + d ? (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${xr * 100 + 0.3 * Math.sin(2 * Math.PI * (t - at) / 0.11)}%`,
              width: 2,
              background: 'rgba(245,235,216,0.14)',
              pointerEvents: 'none',
            }}
          />
        ) : null,
      )}
    </>
  );
};

// 브라운관 켜짐 (0~0.18초) — 검은 패널이 중앙 주사선에서 세로로 열리며 화면 점화.
// 정보는 0프레임부터 뒤에 완성돼 있고, 이 오버레이는 "옛날 TV 점화" 임팩트만 얹는다.
export const TvOn: React.FC = () => {
  const frame = useCurrentFrame();
  const D = 11; // 프레임
  if (frame >= D + 4) return null;
  const p = Math.min(1, frame / D);
  const open = 1 - Math.pow(1 - p, 3); // easeOutCubic
  const half = 50 * (1 - open); // 닫힌 패널 높이 (%)
  const flash = frame >= D - 3 ? Math.max(0, 0.5 * (1 - (frame - (D - 3)) / 6)) : 0;
  return (
    <>
      {half > 0.2 ? (
        <>
          <div style={{position: 'absolute', top: 0, left: 0, right: 0, height: `${half}%`, background: '#050705'}} />
          <div style={{position: 'absolute', bottom: 0, left: 0, right: 0, height: `${half}%`, background: '#050705'}} />
          {/* 열리는 경계의 발광 주사선 */}
          <div style={{position: 'absolute', top: `calc(${half}% - 3px)`, left: 0, right: 0, height: 6, background: 'rgba(255,250,230,0.9)'}} />
          <div style={{position: 'absolute', bottom: `calc(${half}% - 3px)`, left: 0, right: 0, height: 6, background: 'rgba(255,250,230,0.9)'}} />
        </>
      ) : null}
      {flash > 0 ? <AbsoluteFill style={{background: '#FFF8E6', opacity: flash}} /> : null}
    </>
  );
};

// 경계 화이트 플래시 — spots: 플래시를 칠 프레임(보통 컷 시작 startF(i)). 프로젝트 Main 이 넘긴다
export const BoundaryFlash: React.FC<{spots: ReadonlyArray<number>}> = ({spots}) => {
  const frame = useCurrentFrame();
  const a = spots.some((s) => frame >= s && frame < s + Math.round(0.05 * 60)) ? 0.4 : 0;
  return a > 0 ? <AbsoluteFill style={{background: '#fff', opacity: a}} /> : null;
};
