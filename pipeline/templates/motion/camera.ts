// 이 영상의 카메라 큐 — 펀치인·셰이크 시점 (timeline.ts CAM). 물리는 엔진 @engine/camera.
import {makePunchIn, makeShake} from '@engine/camera';
import {CAM} from './timeline';

export {driftScale, driftXY} from '@engine/camera';

const PUNCHES = [{at: CAM.hook, amt: 0.07}];
const SHAKES = [{at: CAM.hook, amp: 8, phx: 0.0, phy: 1.9}];

export const punchInScale = makePunchIn(PUNCHES);
export const cameraShake = makeShake(SHAKES);
