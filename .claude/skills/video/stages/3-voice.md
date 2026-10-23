# ③ 목소리와 실측 타이밍

유료 합성은 /video 제작 요청 안에서 A 보고 뒤 바로 한다 — 답을 기다리지 않는다(2026-10-22 사용자 「크리티컬한 사항 아니면 멈추지 않는다」). 재합성은 대본이 바뀐 컷만(`--only`). 기존 voice 파일은 삭제·개명·덮어쓰지 않는다.

## 현재 상태부터 확인

```bash
node pipeline/tts.mjs <p> --status
node pipeline/tts.mjs <p> --measure
```

status는 합성하지 않는다. 대본·보이스 설정·파일 바이트 지문으로 current/missing/stale/untracked를 구분한다.
옛 음성이 untracked이면 실제 음성과 승인 대본·설정이 같은지 확인하고 `node pipeline/tts.mjs <p> --adopt=cut-01,cut-02 --confirm-script`로 현재 연결을 기록한다. 이 옵션은 자동 음성 인식이나 검증을 대신하지 않는다. 확인 없이 오래된 음성을 승인하지 않는다.

A 보고 뒤 필요한 컷만 실행한다:

```bash
node pipeline/tts.mjs <p> --only=cut-01,cut-02
# 대본이 바뀐 컷의 재합성에만 --force를 추가한다. 반드시 --only로 컷을 한정한다.
```

재합성은 새 이름으로 저장하고 cuts.json의 voice.assets 포인터를 갱신한다. say 기반 무료 측정은 임시 공간을 사용하며 유료 원본을 덮지 않는다. ABMEN 새 프로젝트의 voice_id 기본값은 비어 있다. 화자 키와 voice_id는 ②에서 정한 캐스트대로 채널04 §4 「캐스팅」 표에서 옮긴다. 직전 편 cuts.json에서 복사하지 않는다. 아이 목소리(Leo·Ella)를 처음 쓰는 편은 아이 대사가 있는 한 컷만 먼저 합성해 억양을 확인한 뒤 나머지를 합성한다. 대화형은 voice.speakers에 화자별 voice_id를 두고 cuts[].dialogue에 {speaker,say}를 순서대로 기록한다. cuts[].say는 같은 발화를 이어 쓴 정본이며 불일치·미등록 화자는 합성 전에 차단한다. Typecast Compose가 장면별 한 음성 파일로 반환하며 대화 순서도 캐시 지문에 포함된다. 원음은 1.0배·normal, 가속은 조립에서 단일 atempo로 적용한다.

## 시간 정본과 파생본

새 프로젝트는 `cuts.json`의 `timing:{version:1,speed:1.2}`·fps·cuts[].dur(표시 초)·voice_offset_s(표시 초)가 정본이다. `motion/timeline.ts`의 SPEED·FPS·CUT_END_M·UNITS는 도구가 생성하는 호환 파생본이다. 기존 B/CAM 등 수동 연출 값은 보존한다.
기존 프로젝트는 먼저 `node pipeline/timing.mjs <p> --migrate`로 실제 legacy 시간축을 보존해 전환한다. 프레임 수·앵커가 모호하면 자동 전환을 중단한다. 기존 작품을 임의로 단축하지 않는다.

```bash
node pipeline/measure.mjs <p>
node pipeline/measure.mjs <p> --apply
node pipeline/timing.mjs <p> --check
pipeline/narration.sh <p>
~/.venvs/abm-whisper/bin/python pipeline/transcribe.py <p>
node pipeline/hf-audio.mjs <p>
node pipeline/stage-gate.mjs <p> 3
```

measure는 단일 컷 유닛의 실제 파일 길이와 발화 끝+여유 중 큰 값을 사용하고 음성 오프셋을 포함한다. 여러 컷을 관통하는 유닛은 자동 재분할하지 않는다. 의도한 홀드를 유지하려면 --apply 전 제안을 확인한다. 컷 경계·컷 안 대사 공백은 여기서 확정한다 — stage-gate ③가 1.5초 이상 공백을 경고하고, 지도 같은 삽입 화면은 대사를 밀지 않고 그 위에 겹친다(pitfalls §161·§162). 시간축을 바꾸면 프레임·자막·전환의 의미 비트도 다시 맞추며, ④ 팬아웃 뒤에는 바꾸지 않는다.

narration·leveling·transcribe·audio 슬라이스는 내용 지문이 같으면 재사용한다. 낡거나 손상된 산출물만 재생성한다. Whisper 시간은 이미 표시 초이므로 다시 SPEED로 나누지 않는다. 레거시 `transcribe --apply`를 HyperFrames에 적용하지 않는다.

## 대사에 움직임을 붙인다

Whisper는 시간의 초안, 글자는 승인 대본이 정본이다. 수사·고유명사·어절 경계는 실제 청취와 대조한다. ASR만 보고 들었다고 말하지 않는다.
🔴 **whisper 어절 시각은 화자 전환·쉼 뒤 첫 어절에서 0.2~0.47초 이르다**(00069·00076 실측 — 컷머리 첫 어절도, pitfalls §186). 전사 뒤 프레임 wav마다 `ffmpeg -i projects/<p>/hyperframes/.media/audio/frame-NN.wav -af silencedetect=noise=-36dB:d=0.11 -f null -`로 발화 그룹 시작을 재고 **그룹의 첫 어절만** 그 시각으로 옮긴다 — 나머지 어절은 whisper 그대로 둔다(줄 전체를 밀면 중간 어절이 0.45초 늦어진다, 00069). 쉼 뒤 탐색은 0.7초까지. 쉼표·콜론 뒤 쉼과 자음 폐쇄는 어절 시작이 아니다. 워커 첫 패킷에는 이 실측 온셋을 준다(worker-brief ⑥).
핵심 명사·숫자·동사의 실측 시각에 **어느 피사체가 어떻게 바뀌는지**를 연결해 ④로 넘긴다. 첫 컷은 첫 어절이 곧바로(voice_offset_s 정도의 선행 무음) 시작한다. 전사 뒤 `node pipeline/hook-check.mjs <p> --plan`으로 README `핵심어:`의 실측 시각이 3초 안인지 보고(stage-gate ③도 대조한다), 그 시각을 STORYBOARD 첫 행의 동작 정점으로 넘긴다(공용 SKILL 「최우선」 · 늦으면 대사 순서를 조정해 그 컷만 재합성하고 보고에 「정한 것」으로 적는다). 자막만 음성에 맞추고 그림은 임의 초에 움직이게 두지 않는다. 시작·준비 동작은 발화 전에 둘 수 있지만 결과/강조 정점이 왜 그 말과 만나는지 설명할 수 있어야 한다.

HF에는 say 없는 컷도 포함해 모든 컷의 오디오를 배치한다. hf-audio는 기존 BGM/SFX 메타를 보존한다. 생성 슬라이스가 현재 나레이션·대본·시간축과 같은 판인지 단계 4에서 검사한다.
