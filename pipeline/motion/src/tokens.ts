// 디자인 토큰 v2.3 — 「잘살아보세」 관제 레트로 (2026-09-07 채널명 변경 + 붓글씨 워드마크 로고 채택)
// 팔레트·폰트·레이아웃은 v2.1 승계. 채널명 이력과 근거는 docs/12-brand.md
// 전략: 소유색 풀블리드 (브랜드 그린 — 190편 실측에서 유채색 배경 소유 채널은 노랑 하나뿐, 초록은 빈자리)
// 대비 규칙(WCAG 실측): 그린 배경 위 텍스트는 흰색(5.4:1)·노랑은 대형만(3.8:1) · 크림 카드 위는 잉크/진초록/빨강
export const C = {
  bg: '#14532D', // 관제 딥그린 — 풀블리드 소유색 (새마을 공식색과 유사성 절단 + 흰 글자 8.9:1). saemaul-style 권고
  ink: '#1A1A1A', // 먹색
  paper: '#F2E8D5', // 갱지 크림 — 카드/판 (saemaul-style 확정값)
  paperDim: '#E5D8BE',
  white: '#FFFFFF',
  yellow: '#F2C230', // 골드 — 금액·대형 강조 전용 (그린 판 위 5.44 AA 큰 글자)
  green: '#14532D', // 크림 카드 위 브랜드색 텍스트
  greenDeep: '#0B3D1F',
  red: '#8A1C1C', // 관보 레드 — 관인·경고·마감. ⚠️ 그린 위 직접 금지(1.02:1) — 크림 판 위에만(7.63 AAA)
  redSoft: '#F3D9D2',
  muted: '#7A7160', // 크림 위 보조 텍스트
  // 구 토큰 별칭 (컷 파일 호환) — 단색 오너십 문법으로 수렴
  card: '#F2E8D5',
  orange: '#14532D', // 할인도 이득 → 브랜드 그린으로 수렴
  orangeSoft: '#E4EFE2',
  greenSoft: '#E4EFE2',
  awningLight: '#F2E8D5',
} as const;

/** 브랜드 — 화면 로고는 이미지 한 장이다 (@engine/BrandMark). 씬에 글자로 쓰지 마라 */
export const BRAND = {
  spoken: '잘살아보세', // 나레이션·자막 표기
  logo: 'brand/logo.png', // staticFile 경로 — resources/brand/logo.png 가 스테이징된다
} as const;

export const FONT = `'Pretendard', sans-serif`;
export const FONT_HEAD = `'BMHannaPro', 'Pretendard', sans-serif`; // 헤드라인 — 간판 레트로
export const FONT_NUM = `'Jalnan', 'Pretendard', sans-serif`; // 금액 숫자 전용

// 안전영역
export const BRAND_TOP = 226; // 브랜드존 — 세이프존 상단(220) 바로 아래, 전 컷 고정 락업
export const HL_TOP = 344; // 브랜드존(226~302)과 킥커 라벨 사이 숨통
export const PAYLOAD_TOP = 636;
export const PAYLOAD_H = 704; // 636~1340 — 자막 밴드(1350~1450) 확보
export const PAYLOAD_CX = 540;
export const PAYLOAD_CY = PAYLOAD_TOP + PAYLOAD_H / 2;

// 레트로 카드: 큰 라운드 대신 각진 모서리 + 잉크 이중 테두리 (공문서)
export const cardShadow = '0 18px 40px rgba(0,0,0,.28)';
