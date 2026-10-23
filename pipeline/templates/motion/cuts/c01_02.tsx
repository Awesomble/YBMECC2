// 컷 씬 — 규격은 docs/11-motion.md. 그라운드는 Main 이 고정, 여기는 페이로드(HeadZone + Payload)만 교체한다.
// 예시: projects/00002-온누리적립/motion/cuts/
import React from 'react';
import {useCurrentFrame} from 'remotion';
import {C, FONT_NUM} from '@engine/tokens';
import {Card, Label, Pill} from '@engine/components';
import {HeadZone, G} from '@engine/HeadZone';
import {Payload} from '@engine/Payload';
import {enterUp, punchScale} from '@engine/helpers';
import {B, durF} from '../timeline';

/** cut-01 · 훅 — 0프레임 완성 (등장 애니메이션 금지), 모션은 강조 펀치뿐 */
export const Cut01: React.FC = () => {
  const frame = useCurrentFrame();
  const punch = punchScale(frame, B.c01.punch, 1.12);
  return (
    <>
      <HeadZone instant kicker="안내">
        훅 헤드라인
        <br />
        <G>숫자</G>가 먼저
      </HeadZone>
      <Payload exitEndF={durF(0)}>
        <Card style={{textAlign: 'center'}}>
          <Label>대상어 · 마감</Label>
          <div style={{fontFamily: FONT_NUM, fontSize: 150, color: C.red, transform: `scale(${punch})`}}>
            10%
          </div>
        </Card>
        <Pill color="red">오늘까지</Pill>
      </Payload>
    </>
  );
};

/** cut-02 · 본문 — 요소는 나레이션보다 먼저 뜬다 (최소 노출 1.2초) */
export const Cut02: React.FC = () => {
  const frame = useCurrentFrame();
  const cardIn = enterUp(frame, 4, 7, 40);
  const land = punchScale(frame, B.c02.land, 1.1);
  return (
    <>
      <HeadZone kicker="본문">두 번째 컷</HeadZone>
      <Payload exitEndF={durF(1)}>
        <Card style={{opacity: cardIn.opacity, transform: `translateY(${cardIn.ty}px)`}}>
          <Label>설명 한 줄</Label>
          <div style={{fontFamily: FONT_NUM, fontSize: 120, color: C.greenDeep, transform: `scale(${land})`}}>
            90,000원
          </div>
        </Card>
      </Payload>
    </>
  );
};
