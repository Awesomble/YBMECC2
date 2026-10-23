// 모션 에셋 키트 — **정보의 종류로 모션을 고른다.** (2026-09-08)
//
// 왜: 디자인 원자는 kit.tsx 로 묶었는데 모션은 컷마다 흩어져 있었다. 실측하면 "금액 착지" 하나에
//     여섯 가지 파라미터가 붙어 있었다 (c03 340/20 · c04 punch 1.14 · c05 300/19 · c06 280/18 ·
//     c09 320/20 · c10 punch 1.16). 같은 정보인데 움직임이 다르면 시청자가 규칙을 못 배운다.
//
// 수치 출처: docs/13-astra-agent-motion.md §6 (2026-09-08, abm-4f 세션 수집·분석).
//   근거 등급 ⓜ = 레퍼런스 영상 프레임 실측 · ⓓ = HyperFrames 공식 검증 규칙 · ⓘ = 인상.
//   여기 옮긴 것은 ⓜ·ⓓ 뿐이다. ⓘ 는 넣지 않았다.
//
// 쓰는 법: 씬은 **역할 이름으로** 부른다. 파라미터를 씬에 쓰지 마라.
// 고치는 법: P 를 고치면 전 컷이 같이 바뀐다. 그게 이 키트의 값어치다.
import {clamp01, easeInCubic, easeInOutCubic, easeOutExpo, easeOutQuint, sSpring} from './helpers';

/** 파라미터 한 곳 — docs/13 §6 실측값 */
export const P = {
  /** M1 오버플로 펀치 ⓜ — 프레임을 넘치는 크기로 들어와 정착. **영상당 3회 상한** */
  overflowPunch: {from: 2.0, lead: 6, k: 340, c: 22},
  /** M2 색면 반전 ⓜ — 하드컷 또는 6f 와이프. **36초에 5회 상한** */
  planeFlip: {dur: 6},
  /** M3 잉크 스왑 ⓜ — 회색↔잉크. 이동 0 */
  inkSwap: {dur: 6},
  /** M4 자간 수축 ⓜ — +0.35em → 0 */
  trackIn: {dur: 18, from: 0.35},
  /** M5 슬롯 롤 ⓜ — 항목 이동 15f · **노출 ≥72f(1.2초)** */
  slotRoll: {move: 15, minHold: 72},
  /** M7 요소별 시차 ⓜⓓ — 등장은 포컬 0f, 서포트 +6/+10/+8f **불규칙**. 퇴장은 장식이 먼저 */
  stagger: {support: [6, 10, 8], exitDecor: 20, exitText: 8},
  /** M12 하이라이트 바 ⓓ — scaleX 0→1, 기울기 ±2° 교대 */
  highlight: {dur: 12, tilt: 2},
  /** M14 공유 기준선 바 ⓓ — scaleY origin bottom. 데이터는 오버슈트 금지 */
  bar: {dur: 36, stagger: 12},
  /** P3 스탬프 — 대형 착지 (11-motion 기존) */
  stamp: {k: 340, c: 22, over: 0.09},
  /** 선언 헤드라인 — 반동 없이 확정 */
  declare: {dur: 11, d: 18},
  /** 퇴장 */
  exit: {dur: 8, dy: -12},
} as const;

/* ── 숫자 ─────────────────────────────────────────────────────
 * ⚠️ **데이터 값은 절대 오버슈트하지 않는다** (HyperFrames 규칙 5).
 *    펀치는 크기(scale)로 주고, 값(카운트업·막대 길이)은 정확히 착지시킨다. */

/** M1 오버플로 펀치 — 숫자·마감이 프레임을 넘치게 들어와 정착. **영상당 3회까지** */
export const overflowPunch = (frame: number, beat: number) => {
  const s = sSpring(frame, beat - P.overflowPunch.lead, P.overflowPunch.k, P.overflowPunch.c);
  return {
    scale: P.overflowPunch.from + (1 - P.overflowPunch.from) * s,
    opacity: clamp01((frame - (beat - P.overflowPunch.lead)) / 3),
  };
};

/** P3 스탬프 착지 — %·4자리 이하. M1 을 다 쓴 뒤의 기본 숫자 등장 */
export const stampLand = (frame: number, beat: number) => {
  const s = sSpring(frame, beat - 8, P.stamp.k, P.stamp.c);
  return {scale: 0.72 + 0.28 * s, opacity: clamp01((frame - (beat - 8)) / 5)};
};

/* ── 상태·전환 ────────────────────────────────────────────── */

/** M2 색면 반전 — 콘텐츠 밴드 배경 하드 스왑(6f 와이프). 전체 크로스페이드 금지 */
export const planeFlip = (frame: number, beat: number, dur = P.planeFlip.dur) =>
  easeOutExpo(clamp01((frame - beat) / dur));

/** M3 잉크 스왑 — 조건 토막이 회색에서 잉크로. 이동 0 */
export const inkSwap = (frame: number, beat: number) => clamp01((frame - beat) / P.inkSwap.dur);

/** M4 자간 수축 — 단어가 벌어져 들어와 조여지며 정착 (white-space: nowrap 필수) */
export const trackIn = (frame: number, beat: number) => {
  const t = easeOutExpo(clamp01((frame - (beat - P.trackIn.dur)) / P.trackIn.dur));
  return {letterSpacing: `${P.trackIn.from * (1 - t)}em`, opacity: t};
};

/* ── 조건·목록·비교 ───────────────────────────────────────── */

/** M12 하이라이트 바 — 키워드 뒤 색 바가 좌→우로. i 로 기울기를 ±2° 교대한다 */
export const highlight = (frame: number, beat: number, i = 0) => ({
  p: easeOutExpo(clamp01((frame - (beat - P.highlight.dur)) / P.highlight.dur)),
  tilt: (i % 2 === 0 ? 1 : -1) * P.highlight.tilt,
});

/** M14 공유 기준선 바 성장 — scaleY origin bottom. **값은 오버슈트하지 않는다** */
export const barGrow = (frame: number, beat: number, idx = 0) =>
  easeOutExpo(clamp01((frame - (beat - P.bar.dur) + idx * P.bar.stagger) / P.bar.dur));

/** M5 슬롯 롤 — 목록 항목 세로 밀기. 노출 ≥72f 는 씬이 지킨다 */
export const slotRoll = (frame: number, beat: number) =>
  easeOutExpo(clamp01((frame - beat) / P.slotRoll.move));

/** 목록 초점 — 현재 항목만 잉크, 나머지는 회색 (M3 의 목록 적용) */
export const listFocus = (frame: number, mine: number, next?: number) => {
  const on = inkSwap(frame, mine);
  const off = next === undefined ? 0 : inkSwap(frame, next);
  return {act: on * (1 - 0.62 * off)};
};

/* ── 공통 규칙 ────────────────────────────────────────────── */

/** M7 등장 시차 — 포컬은 0f, 서포트는 +6/+10/+8f **불규칙**. 같은 프레임에 시작하지 않는다 */
export const supportDelay = (i: number) => P.stagger.support[i % P.stagger.support.length];

/** 선언 헤드라인 — 감속 확정, 반동 없음 */
export const declare = (frame: number, beat: number) => {
  const t = easeOutQuint(clamp01((frame - (beat - P.declare.dur)) / P.declare.dur));
  return {opacity: t, ty: P.declare.d * (1 - t)};
};

/** M7 퇴장 시차 — 장식이 먼저(컷−20f), 글자가 나중(컷−8f) */
export const leave = (frame: number, endF: number, kind: 'text' | 'decor' = 'text') => {
  const lead = kind === 'decor' ? P.stagger.exitDecor : P.stagger.exitText;
  const t = clamp01((frame - (endF - lead)) / lead);
  return {opacity: 1 - t, ty: P.exit.dy * easeInCubic(t)};
};

/* ── 정보 종류 → 모션 (docs/13 §6 사전) ────────────────────────
 *   숫자 최초 공개   overflowPunch(3회까지) → stampLand    금지: 회색 처리 · 값 오버슈트 · 자간 애니
 *   비교            barGrow · inkSwap                     금지: 다른 기준선 · 동시 등장
 *   합산            barGrow 스택                          금지: 합계가 항목보다 먼저
 *   마감·경고        planeFlip(→관보레드) + overflowPunch   금지: 셰이크 남발 · 없는 마감
 *   조건·단서        inkSwap · highlight                   금지: 펀치·스케일 강조
 *   상태 전환        planeFlip                             금지: 전체 크로스페이드
 *   목록            slotRoll(≤5, 노출 ≥72f) · listFocus    금지: 글자 단위 타자기 · 6개+
 *   전 컷 공통       supportDelay · leave                  금지: 두 요소가 같은 프레임에 시작·끝
 */
