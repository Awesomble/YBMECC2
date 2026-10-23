# Advanced — 무대가 반응한다

여러 요소가 **하나의 사건**으로 묶인다. 승인본과 반려본의 격차가 가장 큰 구간이다
(`strokeDashoffset` 58회 — 00004·07·08·09·17 에만 있고 반려본엔 0회).

---

## A1. 선이 스스로 그려진다 — `pathLength="100"` 이 제일 쉽다

경로·서명·게이지·밑줄. **길이를 추측하지 마라.**

**방법 ① (권장)** — SVG 에 `pathLength="100"` 을 박으면 실제 길이와 무관하게 0~100 좌표계가 된다.

```html
<path id="f02-rule-two" d="M0 4 H380" pathLength="100"/>
```
```js
tl.fromTo('#f02-rule-two', { strokeDasharray: 100, strokeDashoffset: 100 },
                           { strokeDashoffset: 0, duration: 1.66, ease: 'none' }, 3.24);
```
> 00017 F02 · 측정이 필요 없다. 곡선·직선 모두 같은 숫자로 쓴다

**방법 ②** — 복잡한 곡선에서 실제 픽셀 길이가 필요할 때만 측정한다.

```js
var rail = document.getElementById('voy04-rail');
var L = 549.6;                                   /* 해석 적분값 — 측정 실패 시 폴백 */
if (rail && rail.getTotalLength) {
  var m = rail.getTotalLength();
  if (m && isFinite(m) && m > 1) L = m;
}
rail.style.strokeDasharray = String(L);
tl.fromTo(rail, { strokeDashoffset: L }, { strokeDashoffset: 0, duration: .38, ease: 'power4.out' }, 0);
```
> 00004 F04 · **폴백 상수를 반드시 둬라** — 렌더러가 `getTotalLength` 를 0 으로 줄 때가 있고, 그러면 선이 안 그려진다

## A2. 연속 상태 함수 — 한 함수가 무대 전체를 동시에 움직인다

트윈을 열 개 쌓는 대신, **0→1 하나로 굴리고 그 안에서 전부 계산**한다.
요소들이 **같은 시간축을 공유**해서 「따로 노는」 느낌이 사라진다.

```js
var MH = { t: 0 };
function movingHold() {
  var t = MH.t;
  gsap.set(waves, { x: 16 + 60 * (t / DUR) });                              /* 물결은 계속 흐르고 */
  gsap.set(line,  { strokeDashoffset: -256 * clamp01((t - 0.72) / 2.90) }); /* 항로는 0.72초부터 */
}
movingHold();
tl.fromTo(MH, { t: 0 }, { t: DUR, duration: DUR, ease: 'none', onUpdate: movingHold }, 0);
```
> 00004 F08 · **정지 프레임을 없애는 가장 싼 방법**이다. 제자리 흔들기와 다르다 —
> 값이 **한 방향으로** 진행한다. `clamp01((t-시작)/길이)` 로 요소마다 구간을 준다

## A3. 서명 동작 — 주제의 물리 하나를 정하고 두 번 쓴다

00017 의 물건은 할인권이고, 할인권의 물리는 **절취선을 따라 뜯는 것**이다.
`<clipPath>` 로 뜯긴 조각을 가르고, 조각은 `out` 으로 화면 밖까지 보낸다.

```html
<svg id="f02-perforation" viewBox="0 0 860 580">
  <defs><clipPath id="f02-perf-clip"><path id="f02-perf-reveal" d="M16 262 H848 V448 H16 Z"/></clipPath></defs>
  <path class="f02-perf" d="M22 430 L838 280" clip-path="url(#f02-perf-clip)"/>
</svg>
```
> 00017 F02·F05 · **두 곳에 쓰고 두 번째는 첫 번째를 거꾸로** 돌린다 — F02 는 뜯겨 값이 드러나고,
> F05 는 같은 절취선으로 뜯겨 사라진다. 그게 「서명」이다. 한 번만 쓰면 장식이다

🔴 `<clipPath>`·`<defs>` 는 **그 프레임 안에** 둬라. 외부 파일 참조(`url(x.svg#id)`)는 크롬이 무시하고,
`<use>` 인스턴스 내부는 GSAP 이 못 잡는다 (`docs/02-pitfalls.md` §106).

## A4. 도장 — 링이 그려지며 찍힌다

```js
tl.to(P + ' #f10-halo-c', { attr: { 'stroke-dashoffset': 0 }, duration: .600, ease: 'power4.out' }, .385);
```
> 00008 F10 · `attr` 로 SVG 속성을 직접 민다. 도장·인증·확정을 말하는 컷에

## A5. 겹쳐 쓰기

위 조각들은 **겹치라고** 있다. 00004 F04 한 프레임이 실제로:

```
A1 항로 선이 그려진다  +  M5 점선이 그 위를 흐른다  +  M2 클립 사각이 늘어나 섬을 드러낸다
+ E1 배가 들어온다  +  A2 이 전부를 하나의 t 가 굴린다
```

**한 프레임에 조각 3~5개.** 그게 승인본의 밀도였다.
