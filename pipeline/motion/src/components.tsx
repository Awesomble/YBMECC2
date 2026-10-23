import React from 'react';
import {interpolateColors} from 'remotion';
import {C, FONT, FONT_NUM, cardShadow} from './tokens';
import {countValue, glowAlpha, punchScale, won} from './helpers';

export const Card: React.FC<{
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({style, children}) => (
  <div
    style={{
      background: C.card,
      borderRadius: 12,
      border: `3px solid ${C.ink}`,
      padding: '56px 60px',
      boxShadow: cardShadow,
      width: '100%',
      ...style,
    }}
  >
    {children}
  </div>
);

export const Pill: React.FC<{
  color: 'green' | 'orange' | 'red';
  size?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({color, size = 38, style, children}) => {
  // 관제 레트로: 크림 라벨(정보) / 빨강 관인(경고 — 흰 글자)
  const map = {
    green: {bg: C.paper, fg: C.greenDeep},
    orange: {bg: C.paper, fg: C.red},
    red: {bg: C.red, fg: '#FFFFFF'}, // 관인 — 그린 위 가시성용 크림 테는 아래 border 로
  } as const;
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 36px',
        borderRadius: 8,
        fontSize: size,
        fontWeight: 800,
        border: color === 'red' ? `4px solid ${C.paper}` : undefined, // 관보레드는 그린 위 1.02:1 — 크림 테로 분리
        boxShadow: '0 4px 0 rgba(0,0,0,.25)',
        background: map[color].bg,
        color: map[color].fg,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Coin: React.FC<{size?: number}> = ({size = 108}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      flex: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: C.greenDeep,
      color: C.yellow,
      fontSize: size * 0.52,
      fontWeight: 900,
      boxShadow: 'inset 0 -6px 0 rgba(0,0,0,.14)',
    }}
  >
    ₩
  </div>
);

export const Label: React.FC<{children: React.ReactNode; style?: React.CSSProperties}> = ({
  children,
  style,
}) => (
  <div style={{fontSize: 38, fontWeight: 700, color: C.muted, letterSpacing: 2, ...style}}>
    {children}
  </div>
);

/** 금액 — 숫자 카운트업(P1) + 착지 펀치 + 글로우 + 색 전이.
 *  단위 "원"은 숫자의 56% (숫자 위계 규칙). tabular-nums 로 레이아웃 고정. */
export const Amount: React.FC<{
  frame: number;
  value: number;
  sign?: '+' | '-' | '';
  size: number;
  color: string;
  countStart?: number; // 없으면 즉시 표시
  countDur?: number; // 기본 15f(500ms)
  landAt?: number; // 착지(펀치·색 전이·글로우) 프레임. 없으면 카운트 종료 시점
  punchPeak?: number;
  style?: React.CSSProperties;
}> = ({frame, value, sign = '', size, color, countStart, countDur = 15, landAt, punchPeak = 1.12, style}) => {
  const counting = countStart !== undefined;
  const land = landAt ?? (counting ? countStart! + countDur : -9999); // 착지 이벤트가 없으면 펀치·글로우 없음
  const v = counting ? countValue(frame, countStart!, countDur, value) : value;
  // 색 전이 100ms — 하드 스냅은 스케일 피크와 겹치며 "덜 걸린 트랜지션"으로 읽힌다
  const fg = !counting
    ? color
    : frame < land
      ? C.muted
      : interpolateColors(Math.min(frame, land + 6), [land, land + 6], [C.muted, color]);
  const glow = glowAlpha(frame, land);
  // 대형 숫자(≥96px)는 무거운 스프링 — 질량감 있는 상승·정착
  const scale =
    size >= 96 ? punchScale(frame, land, punchPeak, 220, 19) : punchScale(frame, land, punchPeak);
  return (
    <div
      style={{
        fontFamily: FONT_NUM, // 잘난체 — 금액 전용
        fontWeight: 400,
        letterSpacing: -1,
        fontVariantNumeric: 'tabular-nums',
        color: fg,
        fontSize: size,
        lineHeight: 1.1,
        whiteSpace: 'nowrap',
        transform: `scale(${scale})`,
        transformOrigin: 'center',
        willChange: 'transform', // 레이어 승격 — 스케일 중 글리프 재래스터(우글거림) 방지
        textShadow: glow > 0 ? `0 0 24px ${color}` : undefined,
        opacity: 1,
        ...style,
      }}
    >
      {sign}
      {won(v)}
      <span style={{fontSize: Math.round(size * 0.56)}}>원</span>
    </div>
  );
};

export const CheckCircle: React.FC<{size?: number}> = ({size = 64}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      flex: 'none',
      background: C.green,
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.62,
      fontWeight: 900,
    }}
  >
    ✓
  </div>
);

export const Row: React.FC<{children: React.ReactNode; style?: React.CSSProperties}> = ({
  children,
  style,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 28,
      padding: '34px 44px',
      borderRadius: 10,
      background: C.paper,
      border: '3px solid #D9CCAF',
      width: '100%',
      ...style,
    }}
  >
    {children}
  </div>
);

/** 요소 위 화이트 플래시 오버레이 (P3) */
export const Flash: React.FC<{alpha: number; radius?: number}> = ({alpha, radius = 44}) =>
  alpha <= 0 ? null : (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: radius,
        background: '#fff',
        opacity: alpha,
        pointerEvents: 'none',
      }}
    />
  );
