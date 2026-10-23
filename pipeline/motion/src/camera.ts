// 카메라 v2 — 컷 인덱스 의존 전면 삭제 (경계 속도 불연속 13곳 제거).
// 전역 시간의 비정수비 사인 합 → C^∞ 연속, 29초 안에 패턴 반복 없음. 앵커 (540, 1035).
// 펀치인·셰이크의 *시점* 은 프로젝트(motion/camera.ts)가 넘긴다 — 엔진은 물리만 안다.
import {easeInOutCubic, easeOutQuint} from './helpers';
import {FPS} from './config';

export const driftScale = (frame: number) => {
  const t = frame / FPS;
  return 1 + 0.015 * Math.sin((2 * Math.PI * t) / 11.0) + 0.008 * Math.sin((2 * Math.PI * t) / 7.3 + 1.7);
};

export const driftXY = (frame: number) => {
  const t = frame / FPS;
  return {
    x: 6 * Math.sin((2 * Math.PI * t) / 9.1),
    y: 5 * Math.sin((2 * Math.PI * t) / 12.7 + 2.4),
  };
};

export type Punch = {at: number; amt: number};
export type Shake = {at: number; amp: number; phx: number; phy: number};

// 펀치인 +7%: 진입 easeInOutCubic(0.167s) → 유지(0.2s) → 복귀 easeOutQuint(0.333s)
// (기존 easeInCubic 진입은 이징이 거꾸로 — 마지막 프레임에 급가속했다)
export const makePunchIn = (punches: ReadonlyArray<Punch>) => (frame: number) => {
  const IN = 0.167 * FPS;
  const HOLD = 0.2 * FPS;
  const OUT = 0.333 * FPS;
  let add = 0;
  for (const p of punches) {
    const d = frame - p.at;
    if (d < 0) continue;
    if (d < IN) add += p.amt * easeInOutCubic(d / IN);
    else if (d < IN + HOLD) add += p.amt;
    else if (d < IN + HOLD + OUT) add += p.amt * (1 - easeOutQuint((d - IN - HOLD) / OUT));
  }
  return add;
};

// 셰이크 v2 — 화이트노이즈 폐기 → 감쇠 사인 (임팩트 반동). 60fps 전제 (11Hz).
// A·e^(−t/0.09)·sin(2π·11t + φ), 축별 위상차로 대각 왕복 방지.
export const makeShake = (shakes: ReadonlyArray<Shake>) => (frame: number) => {
  let x = 0;
  let y = 0;
  for (const s of shakes) {
    const t = (frame - s.at) / FPS;
    if (t < 0 || t > 0.35) continue;
    const env = s.amp * Math.exp(-t / 0.09);
    x += env * Math.sin(2 * Math.PI * 11 * t + s.phx);
    y += env * Math.sin(2 * Math.PI * 11 * t + s.phy);
  }
  return {x, y};
};
