# 효과음·BGM 출처 시점 캡처 — 2026-09-26

목적: 사용 중인 효과음·BGM의 권리 근거를 **받은 시점의 페이지와 원본 바이트**로 남긴다. Content ID 오청구 이의제기나 재검수 때 쓴다.
검수 결과·등급은 `resources/sfx/CREDITS.md` 「저작권 검수 — 2026-09-26」 절과 `resources/music/CREDITS.md` 「출처 검증 기록」 절이 정본이다. 이 폴더는 증거만 둔다.
모든 파일의 SHA-256은 `SHA256SUMS`에 있다(README 수정 뒤 다시 계산).

| 경로 | 원본 URL | 핵심 |
|---|---|---|
| `videoeditingsfx/<slug>.html` (15) | `https://videoeditingsfx.com/sfx/<slug>/` | 개별 페이지에 CC0·크레딧 불필요 문구. **제작자 표기·약관·About 페이지 없음**(404). 도메인 생성 2026-02-27(whois) · 웨이백 스냅샷 없음 |
| `videoeditingsfx/_home.html` · `_free-ui-list.html` | `https://videoeditingsfx.com/` · `/free-ui-sound-effects/` | 사이트 전체 CC0 표기 |
| `videoeditingsfx/<slug>.mp3` (15) | `https://videoeditingsfx.com/sounds/<slug>.mp3` | 원본. `pick/` 17종과 파형 대조 일치(camera-5·impact-hit-launch는 기존 `resources/sfx/videoeditingsfx/`와 바이트 동일) |
| `mixclap/transition-sound-effects.html` | `https://www.mixclap.com/en/blog/transition-sound-effects` | 곡마다 `Source: <업로더> · Freesound · CC0`. 기존 장부 URL `mixclap.com/transitionEffects/`는 404 |
| `mixclap/<slug>.mp3` (8) | `https://www.mixclap.com/transitionEffects/<slug>.mp3` | 원본. `pick/` MixClap 8종과 파형 대조 일치 |
| `freesound/<slug>-<id>.html` (8) | `https://freesound.org/s/<id>/` | 원 업로더 페이지. 라이선스 링크 `creativecommons.org/publicdomain/zero/1.0` |
| `freesound/<slug>-<id>.html` (5) · `freesound/fs-<id>.html` (13) | `https://freesound.org/s/<id>/` | 2026-09-26 새로 들인 CC0 사용본의 원 페이지(MixClap 경유 5 · 직접 13). 전부 `publicdomain/zero/1.0`. 음원 원본은 `resources/sfx/mixclap/`·`resources/sfx/freesound/` |
| `freepd/freepd_upbeat_20240528012725.html` | `https://web.archive.org/web/20240528012725/https://freepd.com/upbeat.php` | 5곡의 "Written by …"·재생시간·CC0 헤더 |
| `freepd/freepd_legal_20240528005223.html` | `https://web.archive.org/web/20240528005223/https://freepd.com/legal.php` | "Creative Commons 0" 라이선스 문구 |
| `freepd/ia_allfreepdmusicbykuronekony4n_metadata.json` | `https://archive.org/metadata/allfreepdmusicbykuronekony4n` | 미러 파일 목록·md5/sha1 |
| `freepd/incompetech_youtube_contentid_2015.html` | incompetech.com (Kevin MacLeod 글) | "all of my music" Content ID 화이트리스트 진술 — MacLeod 곡에만 해당 |

## BGM — 음원은 저장하지 않고 해시만

`resources/music/cc0/`의 5곡은 인터넷 아카이브 미러 원본과 **바이트 단위로 같다**(2026-09-26 다운로드 대조). 같은 파일을 두 번 두지 않는다.

| 파일 | SHA-256 |
|---|---|
| `advertime.mp3` | `6f0d4433cf788304d60add551cc460dd877865e6d84a2ab3fa7d15ba3f55d6ce` |
| `city-sunshine.mp3` | `e05c1bd683174cff77d492b7ac77262ff4617f99f69d82564b66831cf48352d6` |
| `funshine.mp3` | `b98b226927367a977377fe4f75d1cf59e4366ca2f444c2c7d23d13e7f506f532` |
| `happy-whistling-ukulele.mp3` | `ed4059c8fba8673d657e85175ff54eaa32cef9e43f688f164bef585e6e65cf15` |
| `stereotype-news.mp3` | `be0c93c2c4d59ec054e8f214eae3ce9bca83005491943ce1f8bf0086f2764d9f` |

⚠️ 페이지 HTML은 curl로 받은 원문이다. 브라우저 인쇄 PDF(URL·일시 자동 표기)를 한 벌 더 뜨면 증거가치가 높아진다.
