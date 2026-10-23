// 「잘살아보세」 로고 — 사용자 제공 워드마크 (public/brand/logo.png, 2144×661 rgba, 2026-09-07).
// 붓글씨 워드마크 한 장이 로고 전체다. 심볼+글자 두 조각 락업이 아니다 —
// 노란 원+새싹 엠블럼은 새마을 표장 혼동 리스크로 폐기했다 (2026-09-07, docs/12-brand.md).
// 관보 레드 글자에 골드 테두리가 둘려 있어 딥그린 위에서 그대로 읽힌다 (docs/12 팔레트 제약 충족).
import React from 'react';
import {Img, staticFile} from 'remotion';

/** 브랜드 로고 — 높이만 준다. 가로세로비(3.24:1)는 이미지가 정한다 */
export const BrandLockup: React.FC<{height?: number}> = ({height = 76}) => (
  <Img
    src={staticFile('brand/logo.png')}
    style={{height, width: 'auto', display: 'block'}}
  />
);

/** 별칭 — 씬에서 "마크"라고 부르던 자리 */
export const BrandMark = BrandLockup;
