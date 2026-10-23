// Pretendard (SIL OFL 1.1 — 상업 영상·로고 안전) 로드.
// Apple SD Gothic Neo 는 macOS SLA 회색지대 판정으로 금지 (docs/12-brand 예정).
import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

export const fontsReady = Promise.all([
  loadFont({family: 'BMHannaPro', url: staticFile('fonts/BMHANNAPro.woff2')}), // 배민 한나체Pro — 60~70년대 간판 모티프, 영상·BI 허용
  loadFont({family: 'Jalnan', url: staticFile('fonts/Jalnan.woff2')}), // 여기어때 잘난체 — 금액 숫자 전용, 상업 허용
  loadFont({family: 'Pretendard', url: staticFile('fonts/Pretendard-Black.otf'), weight: '900'}),
  loadFont({family: 'Pretendard', url: staticFile('fonts/Pretendard-ExtraBold.otf'), weight: '800'}),
  loadFont({family: 'Pretendard', url: staticFile('fonts/Pretendard-Bold.otf'), weight: '700'}),
]);
