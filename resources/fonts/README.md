# resources/fonts/ — 폰트와 그 라이선스

**YBMECC 기본은 Pretendard 가변(`PretendardVariable.woff2`)이다**(2026-10-20 — 한국어 본문·자막·숫자, `brand.json` `font`). 0초 포스터 주제 제목은 Hahmlet. Inter·한나체Pro·잘난체는 ABMEN 이식분으로 보존한다. 타입 역할은 `docs/channel/05-brand-pipeline.md` §2.
새 폰트를 넣기 전에 **이 표에 한 줄을 먼저 채워라.** 라이선스를 못 적을 폰트는 넣지 않는다.

| 파일 | 서체 | 배포처 | 라이선스 | 상업 이용 | 영상 임베드 |
|---|---|---|---|---|---|
| `InterVariable.woff2` | **Inter 4.1** · weight 100–900 | [rsms/inter v4.1](https://github.com/rsms/inter/releases/tag/v4.1) | **SIL OFL 1.1**, `LICENSE-Inter.txt` 동봉 | ✅ | ✅ |
| `BMHANNAPro.woff2` | 배달의민족 **한나체 Pro** | 우아한형제들 | 자체 라이선스 (무료 배포) | ✅ | ✅ |
| `Jalnan.woff2` | 여기어때 **잘난체** | 여기어때컴퍼니 | 자체 라이선스 (무료 배포) | ✅ | ✅ |
| `PretendardVariable.woff2` | **Pretendard 가변** · weight 45–920 — YBMECC 기본 서체 | [orioncactus/pretendard v1.3.9](https://github.com/orioncactus/pretendard/tree/v1.3.9) `packages/pretendard/dist/web/variable/woff2/` (2026-10-20 받음, 변경 없음) | **SIL OFL 1.1**, `LICENSE-Pretendard.txt` 동봉 | ✅ | ✅ (영상 표기 의무 없음) |
| `Pretendard-{Bold,ExtraBold,Black}.otf` | **Pretendard** | 길형진(orioncactus) | **SIL Open Font License 1.1** (`LICENSE-Pretendard.txt`) | ✅ | ✅ |
| `Hahmlet-Variable.ttf` | **Hahmlet** · weight 100–900 — 0초 포스터 주제 제목 전용(2026-10-06, `brand.json` `posterFont`) | Hypertype · [google/fonts ofl/hahmlet](https://github.com/google/fonts/tree/main/ofl/hahmlet) 원본 `Hahmlet[wght].ttf` (파일명만 바꿈) | **SIL OFL 1.1**, `LICENSE-Hahmlet.txt` 동봉 | ✅ | ✅ (영상 표기 의무 없음) |

## Inter 4.1

공식 릴리스의 변경하지 않은 파일을 사용한다. 원문은 `LICENSE-Inter.txt`에 보존했다. Inter는 OFL 조건 아래 소프트웨어와 함께 묶어 배포할 수 있으며 폰트 단독 판매는 허용하지 않는다. 프로젝트에 복사할 때 라이선스도 동봉한다. 아래 한국어 폰트의 과거 요약을 Inter의 별도 제한으로 적용하지 않는다.

## 기존 한국어 폰트의 관리 기록

- **폰트 파일 자체를 팔거나, 유료 상품에 끼워 팔 수 없다.** 영상에 쓰는 건 여기 걸리지 않는다
- **폰트를 수정·변형해 배포할 수 없다** (OFL 은 이름만 바꾸면 가능하나 우리는 하지 않는다)
- 저작권자 표기를 지우거나 자기 것으로 표시할 수 없다

## SIL OFL 1.1 (Pretendard) 이 추가로 요구하는 것

폰트 **파일을 재배포**할 때는 라이선스 전문을 함께 넣어야 한다.
**영상(MP4)에 글자 모양이 렌더된 것은 재배포가 아니다** — 파일이 들어가지 않는다.
⚠️ 다만 이 저장소를 공개하면 `resources/fonts/`·`projects/*/hyperframes/fonts/` 의
**파일 자체를 배포하는 것**이 된다. 그때는 아래 전문 파일이 반드시 함께 있어야 한다.

```
resources/fonts/LICENSE-OFL-1.1.txt      Pretendard
resources/fonts/LICENSE-BMHANNA.txt      한나체 Pro (우아한형제들 고지)
resources/fonts/LICENSE-JALNAN.txt       잘난체 (여기어때 고지)
```

## 출처 URL (확인일 2026-09-08)

- 한나체 Pro — <https://www.woowahan.com/fonts> · 눈누 <https://noonnu.cc/font_page/2>
- 잘난체 — <https://noonnu.cc/en/font_page/115>
- Pretendard — <https://github.com/orioncactus/pretendard> · 눈누 <https://noonnu.cc/en/font_page/694>

## 실제로 이 영상들이 쓰는 것

렌더에 들어가는 건 **글자 모양(픽셀)뿐**이고 폰트 파일은 MP4 에 포함되지 않는다.
`pipeline/render.sh` 는 `resources/fonts/` 를 `pipeline/motion/public/` 에 스테이징하고,
HyperFrames 경로는 `projects/<p>/hyperframes/fonts/` 로 복사해 `/fonts/…` 로 참조한다.

⚠️ **눈누 표기는 2차 정보다.** 분쟁이 생기면 근거는 배포처 원문이다.
새 폰트를 넣을 때는 배포처 라이선스 페이지를 직접 읽고 이 표를 채워라.
