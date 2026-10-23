// 헤드라인 존 v2 (잘살아보세) — 그린 배경 위: h1 흰색 900, 강조는 노랑(대형 전용).
// 킥커는 크림 공문 라벨. hook/loop 은 kickerNode 로 브랜드 락업을 꽂는다.
import React from 'react';
import {useCurrentFrame} from 'remotion';
import {C, FONT_HEAD, HL_TOP} from './tokens';
import {clamp01, easeOutCubic, punchScale} from './helpers';

export const HeadZone: React.FC<{
  kicker?: string;
  kickerNode?: React.ReactNode; // 브랜드 락업 등 커스텀
  children: React.ReactNode;
  instant?: boolean;
  kickerBg?: string;
  kickerPunchAt?: number;
}> = ({kicker, kickerNode, children, instant = false, kickerBg = C.paper, kickerPunchAt}) => {
  const frame = useCurrentFrame();
  const t = instant ? 1 : clamp01(frame / 3);
  const roll = (1 - easeOutCubic(t)) * 18;
  const kp = kickerPunchAt !== undefined ? punchScale(frame, kickerPunchAt, 1.14) : 1;
  return (
    <div
      style={{
        position: 'absolute',
        top: HL_TOP,
        left: 60,
        right: 60,
        // ⚠️ 300 이면 344+300=644 로 PAYLOAD_TOP(636)을 8px 침범한다 — 규격이 겹쳐 있었다 (2026-09-08)
        height: 284,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 26,
        textAlign: 'center',
        zIndex: 5,
      }}
    >
      {kickerNode ? (
        <div style={{transform: `scale(${kp})`}}>{kickerNode}</div>
      ) : kicker ? (
        <div
          style={{
            // ⚠️ 전에는 3프레임짜리 롤인 하나 때문에 overflow:hidden 이었다. 그 대가로 **모든 킥커 뱃지가
            //    영구적으로 잘렸다** — 한글 받침이 상자 아래 모서리에 깎였다 (2026-09-08 사용자 지적).
            //    50ms 효과를 버리고 잘림 위험을 없앤다. 등장은 opacity + translateY 로 충분하다.
            padding: '8px 30px 12px',
            borderRadius: 6,
            background: kickerBg,
            color: C.ink,
            fontSize: 32,
            lineHeight: 1.5,
            fontWeight: 800,
            letterSpacing: 6,
            boxShadow: '0 4px 0 rgba(0,0,0,.25)',
            transform: `scale(${kp})`,
          }}
        >
          <div style={{transform: `translateY(${roll * 0.5}px)`, opacity: t, lineHeight: 1.5}}>{kicker}</div>
        </div>
      ) : null}
      <h1
        style={{
          margin: 0,
          fontFamily: FONT_HEAD, // 한나체Pro — 간판 레트로
          fontSize: 96,
          lineHeight: 1.16,
          fontWeight: 400,
          letterSpacing: -1,
          color: C.white,
          textShadow: '0 3px 0 rgba(0,0,0,.3)',
          opacity: t,
          transform: `translateY(${(1 - easeOutCubic(t)) * 10}px)`,
        }}
      >
        {children}
      </h1>
    </div>
  );
};

// 강조 스팬 — 그린 배경 위 대형 텍스트 전용 (노랑 3.8:1 은 큰 글자만 AA)
/* 강조 3종 — v15(2026-09-08). 전에는 G·O·R 이 **전부 C.yellow 로 같았다**: 이름만 셋이고 화면은 하나였다.
   그래서 노랑 하나가 할인율·금액·기간·날짜·한도를 다 강조했고, 무엇이 중요한지 구분되지 않았다.
   이제 역할마다 색과 형태가 다르다 — 팔레트는 확정값 그대로 쓴다. */

/** 이득 — 금액·혜택. 골드 글자 (딥그린 위 5.44:1, 대형 전용) */
export const G: React.FC<{children: React.ReactNode}> = ({children}) => (
  <span style={{color: C.yellow}}>{children}</span>
);

/** 조건·한계 — "20만 원까지" 의 한도처럼 **범위를 규정하는** 말. 크림 글자 + 골드 밑줄 */
export const O: React.FC<{children: React.ReactNode}> = ({children}) => (
  <span
    style={{
      color: C.paper,
      boxShadow: `inset 0 -0.14em 0 ${C.yellow}`,
      paddingBottom: '0.04em',
    }}
  >
    {children}
  </span>
);

/** 마감·손실 — 빨강은 딥그린 위 1.02:1 이라 글자로 못 쓴다(docs/12).
 *  v17: 자막에서는 **판을 쓰지 않는다** — 한 줄 자막에 색 상자가 들어가면 읽는 흐름이 끊긴다.
 *  골드 밑줄로 무게만 준다 (판은 헤드라인 급에서만). */
export const R: React.FC<{children: React.ReactNode}> = ({children}) => (
  <span
    style={{
      display: 'inline-block',
      color: C.paper,
      borderBottom: `6px solid ${C.red}`,
      lineHeight: 1.16,
      paddingBottom: 2,
    }}
  >
    {children}
  </span>
);
