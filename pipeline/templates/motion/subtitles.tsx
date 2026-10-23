// 자막 데이터 — 나레이션 전사 그대로 (요약·의역 금지), 2~4어절 청크, 첫 어절 온셋(원음 초)에 스냅.
// 타이밍은 faster-whisper 로 narration.wav 를 실측해 채운다. 강조 어절은 청크당 1개만 (G/R = 노랑).
import type {Sub} from '@engine/Subtitles';

// 확정된 채널명·소재별 도입·본문·마무리의 실제 발화로 채운다. 고정 인사·예제 시각을 납품하지 않는다.
export const SUBS: Sub[] = [];
