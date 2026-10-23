import React from 'react';
import {useCurrentFrame} from 'remotion';
import {PAYLOAD_TOP, PAYLOAD_H} from './tokens';
import {exitOut, idle} from './helpers';

/** 페이로드 존 (y 636~1340).
 *  - exitEndF: 12f 윈도로 컷 경계를 +2f 넘겨 퇴장 — 다음 컷 등장과 크로스 (Sequence 가 4f 스필)
 *  - idle life: 직계 자식마다 위상을 어긋내 미세 부유 — 정지 구간(moving hold)을 없앤다.
 *    화면 전체 동기 호흡 금지 → 자식 단위 래핑. (그라운드·헤드라인은 제외 유지)
 *
 *  ⚠️ **고정 슬롯 (2026-09-08 개편)** — 전에는 `justifyContent:'center'` 였다.
 *  그러면 자식의 **레이아웃 높이가 애니메이션될 때**(c03 은 화살표를 `height: 118 * wipe` 로 키운다)
 *  중앙 정렬 기준점이 최대 59px 움직여 헤드존·자막 밴드를 침범한다. 실제로 루프에서
 *  헤드라인 간격이 32px → 2px 로 무너졌다. 이제 존 전체를 쓰고 **가운데 정렬은 각 슬롯 안에서만** 한다 —
 *  높이가 변해도 형제와 경계는 그대로다. `align` 으로 슬롯 정렬을 고를 수 있다. */
export const Payload: React.FC<{
  exitEndF?: number;
  exitDy?: number;
  gap?: number;
  /** 슬롯 배치 — 'center'(기본) · 'top' · 'spread'. 높이가 변하는 컷은 'top' 이 안전하다 */
  align?: 'center' | 'top' | 'spread';
  children: React.ReactNode;
}> = ({exitEndF, exitDy = -12, gap = 36, align = 'center', children}) => {
  const frame = useCurrentFrame();
  const ex =
    exitEndF !== undefined ? exitOut(frame, exitEndF + 2, 7, exitDy) : {opacity: 1, ty: 0};
  const kids = React.Children.toArray(children);
  return (
    <div
      style={{
        position: 'absolute',
        top: PAYLOAD_TOP,
        left: 120,
        right: 120,
        height: PAYLOAD_H,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: align === 'top' ? 'flex-start' : align === 'spread' ? 'space-between' : 'center',
        gap,
        opacity: ex.opacity,
        transform: `translateY(${ex.ty}px)`,
        zIndex: 5,
      }}
    >
      {kids.map((child, i) => {
        const id = idle(frame, 1.1 + i * 1.4); // π/2 근방 위상차
        return (
          <div
            key={i}
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              transform: `translateY(${id.ty}px) rotate(${id.rot}deg) scale(${id.scale})`,
            }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
};
