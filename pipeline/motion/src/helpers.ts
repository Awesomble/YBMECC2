// 애니메이션 프리미티브 v2 (2026-09-04, motion-smooth 처방)
// 원칙: 공간(위치·크기·회전)은 감쇠 조화 진동자(오버슈트 6~10% + 팔로스루), 효과(색·투명도)는 오버슈트 0.
// 모든 시간은 초 단위 해석해 — FPS 를 바꿔도 물리가 동일하다.
import {FPS} from './config';

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number) => t * t * t;
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

// ── 감쇠 조화 진동자 (질량 1) ─────────────────────────────────────────
// 스텝 응답: 0 → 1, 언더댐핑이면 오버슈트 후 잔여 진동으로 정착 (팔로스루가 공짜)
const stepResp = (tSec: number, k: number, c: number) => {
  if (tSec <= 0) return 0;
  const w = Math.sqrt(k);
  const z = c / (2 * w);
  if (z >= 1) {
    // 임계/과감쇠
    const r = -w * tSec;
    return 1 - Math.exp(r) * (1 - r);
  }
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * tSec) * (Math.cos(wd * tSec) + ((z * w) / wd) * Math.sin(wd * tSec));
};

// 임펄스 응답 (피크 1 로 정규화): 펀치용 — 즉시 솟았다 감쇠 진동으로 소멸
const impulseResp = (tSec: number, k: number, c: number) => {
  if (tSec <= 0) return 0;
  const w = Math.sqrt(k);
  const z = Math.min(0.999, c / (2 * w));
  const wd = w * Math.sqrt(1 - z * z);
  const h = Math.exp(-z * w * tSec) * Math.sin(wd * tSec);
  const tPeak = Math.atan2(wd, z * w) / wd;
  const hPeak = Math.exp(-z * w * tPeak) * Math.sin(wd * tPeak);
  return h / hPeak;
};

// 스프링 프리셋 (stiffness/damping): 등장 730/33 · 펀치 500/28 · 대형 340/22 · 효과 200/26
export const sSpring = (frame: number, startF: number, k = 730, c = 33) =>
  stepResp((frame - startF) / FPS, k, c);

// ── 등장: 스프링 슬라이드(오버슈트 8%) + ease-out 페이드 (233ms 정착 — 타이밍 동일) ──
export const enterUp = (frame: number, start: number, _dur = 7, dy = 24) => {
  const s = sSpring(frame, start, 730, 33);
  const o = easeOutCubic(clamp01((frame - start) / (0.15 * FPS)));
  return {opacity: o, ty: dy * (1 - s)};
};

// 대형 요소 등장 (카드): 340/22, 오버슈트 9.4%, 정착 367ms
export const enterUpBig = (frame: number, start: number, dy = 24) => {
  const s = sSpring(frame, start, 340, 22);
  const o = easeOutCubic(clamp01((frame - start) / (0.18 * FPS)));
  return {opacity: o, ty: dy * (1 - s)};
};

// ── 착지 펀치: 선형 4키프레임 폐기 → 임펄스 응답 (속도 연속, 언더슈트는 물리가 만든다) ──
// k/c 로 무게감 조절: 기본 500/28 (상승 51ms), 대형 숫자는 220/19 (상승 77ms — 질량감)
export const punchScale = (frame: number, hit: number, peak = 1.12, k = 500, c = 28) => {
  if (frame < hit) return 1;
  return 1 + (peak - 1) * impulseResp((frame - hit) / FPS, k, c);
};

// ── 스탬프: scale·rotate 를 같은 스프링(340/22)에 태운다 — 두 축이 함께 정착 ──
export const stampIn = (frame: number, start: number) => {
  if (frame < start) return {opacity: 0, scale: 0.65, rotate: -8};
  const s = stepResp((frame - start) / FPS, 340, 22);
  return {
    opacity: easeOutCubic(clamp01((frame - start) / (0.12 * FPS))),
    scale: 0.65 + 0.35 * s, // 피크 ≈ 1.083 (오버슈트 9.4%)
    rotate: -8 * (1 - s), // 팔로스루로 +0.7° 를 스치고 정착
  };
};

// ── 퇴장: ease-in — Payload 가 12f 윈도로 컷 경계를 +2f 넘겨 다음 등장과 크로스 ──
/** 퇴장 — 등장보다 **짧아야 한다**. 대칭이면 내용보다 왕복 패턴을 보게 된다 (2026-09-08).
 *  등장 10~12f 대비 퇴장 7f. */
export const exitOut = (frame: number, endF: number, dur = 7, dy = -12) => {
  const s = endF - dur;
  if (frame < s) return {opacity: 1, ty: 0};
  const t = clamp01((frame - s) / dur);
  return {opacity: 1 - t, ty: dy * easeInCubic(t)};
};

// ── 카운트업 ──
export const countValue = (frame: number, start: number, dur: number, target: number) => {
  if (frame <= start) return 0;
  return Math.round(target * easeOutExpo(clamp01((frame - start) / dur)));
};

// ── 글로우: 기본 OFF — 2026-09-04 사용자 지시 ("블러 효과 안 어울림, 요청할 때만").
// 복원 시: frame < hit ? 0 : 0.6 * Math.exp(-((frame - hit) / FPS) / tau)
export const glowAlpha = (_frame: number, _hit: number, _dur = 3, _tau = 0.1) => 0;
export const flashAlpha = (frame: number, hit: number, _dur = 3.6, peak = 0.5, tau = 0.055) =>
  frame < hit ? 0 : peak * Math.exp(-((frame - hit) / FPS) / tau);

// ── idle life (moving hold): 정지 구간을 죽이지 않는 미세 부유 ──
// 그래픽 블록 전용 (텍스트 단독·숫자 정렬·그라운드 제외). 요소별 위상 오프셋 필수.
export const idle = (frame: number, phase: number) => {
  const t = frame / FPS;
  return {
    ty: 3.5 * Math.sin((2 * Math.PI * t) / 3.6 + phase),
    scale: 1 + 0.005 * Math.sin((2 * Math.PI * t) / 4.3 + phase * 1.7),
    rot: 0.3 * Math.sin((2 * Math.PI * t) / 5.1 + phase * 0.6),
  };
};

export const won = (n: number) => n.toLocaleString('ko-KR');


/** 제목류 — 짧게 감속해 **확정**된다. 반동 없음 (튀면 조건문까지 가벼워 보인다) */
export const settle = (frame: number, startF: number, dur = 9, dy = 16) => {
  const t = easeOutQuint(clamp01((frame - startF) / dur));
  return {opacity: t, ty: dy * (1 - t)};
};

/** 수치 치환 — 등속에 가깝게. 값이 **바뀌는 과정**을 읽히게 한다 (튀지 않는다) */
export const swap = (frame: number, startF: number, dur = 10) =>
  easeInOutCubic(clamp01((frame - startF) / dur));

// ── 비트에 *끝나는* 모션 (2026-09-08) ───────────────────────────────────────
// ⚠️ 위 원시함수들은 전부 지정 프레임에 **시작**한다. 그런데 우리 비트는 whisper 어절 온셋이다 —
//    강세 음절에 모션이 **끝나야** 소리와 화면이 맞는다. 그동안 정점이 비트보다 3~14프레임 늦었다.
//    (punchScale 은 상승 51ms, enterUp 은 정착 233ms. 둘 다 비트 이후에 도착했다.)
//    아래는 전부 "비트에 끝난다". 그리고 **오버슈트가 없다** — 정보형에서 튀는 움직임은 정보를 흔든다.
//
// 상한 (정보형 숏폼 실측 권고): 동시 독립 모션 2개 · 이동 24px · 강조 배율 1.03 (도장만 1.10)
//                              이징 3종(등속·강한 감속·완만한 가감속) · 오버슈트 0회

type Dir = 'up' | 'down' | 'left' | 'right';

/** 진입 — 비트에 정지한다. 강한 감속, 반동 없음 */
export const arriveAt = (
  frame: number,
  beat: number,
  {dur = 10, d = 16, dir = 'up' as Dir} = {},
) => {
  const t = easeOutQuint(clamp01((frame - (beat - dur)) / dur));
  const o = d * (1 - t);
  const tx = dir === 'left' ? o : dir === 'right' ? -o : 0;
  const ty = dir === 'up' ? o : dir === 'down' ? -o : 0;
  return {opacity: t, tx, ty};
};

/** 페이드 — 등속, 위치 고정. 비트에 완전히 보인다 */
export const fadeAt = (frame: number, beat: number, dur = 8) =>
  clamp01((frame - (beat - dur)) / dur);

/** 마스크 드러내기 진행률 0~1 — 비트에 1. scaleX/scaleY 나 clip 에 물린다 */
export const revealAt = (frame: number, beat: number, dur = 12) =>
  easeOutQuint(clamp01((frame - (beat - dur)) / dur));

/** 치환·확장 진행률 0~1 — 완만한 가감속. 비트에 1 (금액 교체·막대 확장) */
export const changeAt = (frame: number, beat: number, dur = 12) =>
  easeInOutCubic(clamp01((frame - (beat - dur)) / dur));

/** 압인 — peak 에서 1 로 눌러 붙는다. 비트에 접촉 종료 (관인 전용, 반동·회전 없음) */
export const pressAt = (frame: number, beat: number, peak = 1.1, dur = 5) => {
  const t = easeOutQuint(clamp01((frame - (beat - dur)) / dur));
  return {scale: peak + (1 - peak) * t, opacity: clamp01((frame - (beat - dur)) / Math.max(1, dur * 0.6))};
};

/** 강조 — 1 → peak → 1. 비트에 원위치로 돌아온다 (배율 상한 1.03) */
export const accentAt = (frame: number, beat: number, peak = 1.03, dur = 7) => {
  const t = clamp01((frame - (beat - dur)) / dur);
  return t <= 0 || t >= 1 ? 1 : 1 + (peak - 1) * Math.sin(Math.PI * t);
};

/** 퇴장 — 진입보다 짧다. endF 에 완전히 사라진다 */
export const leaveBy = (frame: number, endF: number, dur = 6, dy = -10) => {
  const t = clamp01((frame - (endF - dur)) / dur);
  return {opacity: 1 - t, ty: dy * easeInCubic(t)};
};
