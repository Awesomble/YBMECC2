# BGM 반입 증빙 — 2026-10-21 (FreePD 웨이백 · CC0 10곡)

목적: `resources/music/cc0/`에 새로 들인 10곡의 권리 근거를 받은 시점의 페이지 원문과 원본 바이트 해시로 남긴다. 장부 정본은 `resources/music/CREDITS.md` 「출처 검증 기록」 2026-10-21 항목.
- `freepd_<분류>_<스냅샷>.html` (6) — 웨이백 보관 분류 페이지 원문(curl). 제목 「FreePD.com - Free Public Domain Music Creative Commons 0 Completely Royalty Free」, 하단 「… Free Of Attribution, Creative Commons 0」.
- `<slug>.txt` (10) — 곡 행 HTML 원문, 「Written by <작곡>」 줄, 페이지 표기 시간, 원 mp3 주소·요청한 웨이백 원본 모드(`id_`) URL·실제 해결된 캡처 URL, 바이트·ffprobe 길이·SHA-256.
- 확인 방법: HEAD 200·Content-Length(수 MB) 확인 → 받은 바이트가 Content-Length와 같음 → ffprobe 길이가 페이지 「Time:」과 1초 안 일치 → 원본 그대로 복사(재인코딩 없음).
- 음원 캡처 시각은 페이지 스냅샷과 다르다(웨이백이 가장 가까운 캡처로 리다이렉트, 대부분 2024-02-11) — 각 txt에 둘 다 적었다.
- `SHA256SUMS` — 이 폴더 파일과 `../../resources/music/cc0/` 10곡. 이 폴더에서 `shasum -a 256 -c SHA256SUMS`로 검사한다(README 수정 뒤 다시 계산).
- 남은 위험: Content ID 오청구. MacLeod 9곡은 본인 화이트리스트 진술(`legal/sfx-bgm-2026-09-26/freepd/incompetech_youtube_contentid_2015.html`), Rafael Krux 1곡(Ice and Snow)은 그런 진술 없음.
