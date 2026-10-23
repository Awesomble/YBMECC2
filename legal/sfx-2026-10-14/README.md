# SFX 반입 증빙 — 2026-10-14 (00114 인천공항 무료 환승 투어)

Freesound 원 페이지를 2026-10-14에 조회해 각 파일 페이지의 라이선스 표기(Creative Commons 0, http://creativecommons.org/publicdomain/zero/1.0/)를 `freesound/<id>.txt`에 본문 원문으로 보존했다. 원본은 `resources/sfx/freesound/<id>.mp3`(HQ 미리듣기, 로그인 불필요). 브랜드 소리·게임/방송음 재업로드 아님(전부 개인 현장 녹음·자체 제작 설명 확인). catalog·CREDITS 등록은 메인이 한다. 이 폴더 시점에서는 미등록이고 pick/ 파생본 없음.

| id | 제목 | 작성자 | 라이선스 | URL | 용도 | 조회일 |
|---|---|---|---|---|---|---|
| 465060 | Boeing 777F takeoff.wav | Sonicwave32 | CC0 | https://freesound.org/people/Sonicwave32/sounds/465060/ | 제트 이륙 굉음(채택) | 2026-10-14 |
| 436049 | Plane takeoff | KieranKeegan | CC0 | https://freesound.org/people/KieranKeegan/sounds/436049/ | 제트 이륙(기내, 예비) | 2026-10-14 |
| 155747 | Seagulls screeching on the beach, on the peruvian shore. | felix.blume | CC0 | https://freesound.org/people/felix.blume/sounds/155747/ | 갈매기 여러 마리(채택) | 2026-10-14 |
| 414672 | Seagulls in Mielno | GirlWithSoundRecorder | CC0 | https://freesound.org/people/GirlWithSoundRecorder/sounds/414672/ | 갈매기 해변(예비) | 2026-10-14 |
| 398415 | Ferry Horn | bone666138 | CC0 | https://freesound.org/people/bone666138/sounds/398415/ | 뱃고동(채택) | 2026-10-14 |
| 777497 | Cruise ship fog horn | Lord_Tarkus | CC0 | https://freesound.org/people/Lord_Tarkus/sounds/777497/ | 뱃고동(저음, 예비) | 2026-10-14 |
| 470710 | traditional stamp.wav | I.fekry | CC0 | https://freesound.org/people/I.fekry/sounds/470710/ | 고무 도장(채택) | 2026-10-14 |
| 514486 | Office stamp | whammy | CC0 | https://freesound.org/people/whammy/sounds/514486/ | 도장(예비) | 2026-10-14 |
| 263111 | Bus Pulls Away | lauramellis | CC0 | https://freesound.org/people/lauramellis/sounds/263111/ | 버스 문 치익+출발(채택) | 2026-10-14 |
| 831721 | Diesel bus pulling away | pnwheeler | CC0 | https://freesound.org/people/pnwheeler/sounds/831721/ | 디젤 버스 가속 출발(예비) | 2026-10-14 |

## 쓸 구간 (원본 미리듣기 기준 초, ffmpeg 16kHz RMS 프로파일 추정 — 들어서 확정 전)

| id | 길이 | 쓸 구간 | 메모 |
|---|---|---|---|
| 465060 | 48.9s | 20.5~23.5 (21s 부근 급상승 후 포효), 순수 포효 24.5~27.5 | 15~21s 점진 상승, 26~29s 최대(RMS -18dB) |
| 436049 | 81.9s | 4~7 | 3s부터 RMS -12dB 평탄. 작가 메모: 기내 녹음, 딸깍 소음 있음 |
| 155747 | 121.0s | 93.0~96.0 (가장 센 3초), 어디서 잘라도 평탄 -19~-23dB | 파도 배경 포함 |
| 414672 | 91.9s | 2.5~5.5 | 폴란드 발트해 해변, 파도 소리 섞임 |
| 398415 | 6.46s | 0.15~2.2 (어택 0.2~0.4s, 4.2s까지 평탄) | 원본이 작음(RMS -31dB) — 레벨 올려야 함 |
| 777497 | 32.2s | 0.35~2.5 (첫 블래스트 0.4s 어택) | 블래스트 10s 길이, 짧게 자르고 페이드 필요 |
| 470710 | 1.59s | 0.45~1.15 (타격 0.5s, 감쇠 1.1s) | 단일 둔탁한 타격, 피크 0dBFS |
| 514486 | 4.51s | 1.05~1.6 (두 번째 타격이 깨끗) | 5회 타격, 첫 타격은 0s에서 시작 |
| 263111 | 42.0s | 문 공기음 2.35~2.9 · 출발 17.5~27 (20s부터 가속 -24~-19dB) | 문 치익 짧음 |
| 831721 | 15.9s | 3.0~6.5 (아이들링→가속 정점 5.5~6s) | 기어 변속 포함, 올드 버스 |
