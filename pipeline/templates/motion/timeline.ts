// 타임라인 — 모든 시각은 원음(1.0배 합성) 초. 배속은 SPEED 하나로 (narration.sh 인자와 같게).
// 컷 끝·비트는 whisper 어절 온셋 실측으로 채운다 — 추정으로 때우지 마라 (docs/11-motion.md).
// cuts.json 의 dur 와 수동 동기: dur 를 고치면 CUT_END_M 도 고친다.

export const FPS = 60; // 엔진 config.ts 와 동일 (60 고정)
export const SPEED = 1.2;   // 🔴 규약값 (2026-09-13 통일 · narration.sh 기본값과 같다). 레거시 Remotion 판만 1.10 으로 내린다
export const SCALE = 1 / SPEED;

export const mf = (m: number) => Math.round(m * SCALE * FPS);

// 컷 끝 (원음 초, 절대). dur = 발화 끝(silencedetect) + 0.13s. 절정 홀드 컷만 +0.6s
// ⚠️ cuts.json 의 dur(표시 초)와 수동 동기다: CUT_END_M[i] / SPEED == dur 누적합.
//    아래 골격값은 cuts.json 템플릿(2.4 + 2.4초)에 맞춰 둔 것 — 실측하면 둘 다 고쳐라 (qc.mjs 가 검사한다)
export const CUT_END_M = [
  2.64, // c01 훅 — 0프레임 완성, 등장 애니메이션 금지  (2.4초 × 1.1)
  5.28, // c02 루프 — 첫 컷과 같은 구도                (4.8초 × 1.1)
] as const;

export const startF = (i: number) => (i === 0 ? 0 : mf(CUT_END_M[i - 1]));
export const endF = (i: number) => mf(CUT_END_M[i]);
export const durF = (i: number) => endF(i) - startF(i);
export const TOTAL_F = mf(CUT_END_M[CUT_END_M.length - 1]);
export const DURF = CUT_END_M.map((_, i) => durF(i));

// 오디오 유닛 (앵커 컷 = say 가 있는 컷, voice/<file>.m4a). pipeline/narration.sh 가 이 표로 narration.wav 를 조립한다
export const UNITS = [
  {file: 'cut-01', startM: 0},
  {file: 'cut-02', startM: 2.64},
] as const;

// 컷 로컬 비트 (컷 시작 기준 원음 초 → 로컬 프레임) — 강조 애니메이션이 *끝나는* 프레임 = 강세 음절
const L = mf;
export const B = {
  c01: {punch: L(1.0)},
  c02: {land: L(1.2)},
} as const;

// 카메라 큐 (전역 프레임) — camera.ts 의 펀치인·셰이크가 쓴다. 대형 임팩트는 36초에 4회 상한
export const CAM = {
  hook: mf(1.0),
};
