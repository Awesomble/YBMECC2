# Intermediate — 상자 안에서 값이 변한다

**같은 상자를 옮기고 키우는 건 이동이다. 상자 안에서 뭔가 벌어져야 인터랙션이다.**
승인본 버거킹이 반려본과 갈린 자리가 여기다 — 막대가 자라고(`scaleY`), 카드가 기울고(`rotationY`),
판이 늘어나는(`attr width`) 동작이 절반이었다.

---

## M1. 막대가 자란다 — `scaleY` + `transformOrigin`

값의 크기를 **길이**로 보여준다. 숫자를 읽지 않아도 대소가 보인다.

```js
tl.fromTo('#c07-wall', { autoAlpha: 0, scaleY: 0 },
                       { autoAlpha: 1, scaleY: 1, duration: .16, ease: 'power4.out' }, 2.58);
tl.fromTo('#c07-wall', { scaleY: 1 }, { scaleY: 1.14, duration: .34, ease: 'power2.out' }, 2.98);
```
```css
#c07-wall { transform-origin: bottom center; }   /* 바닥을 붙박아야 「자란다」로 읽힌다 */
```
> 00003 F07 · 두 줄인 게 핵심이다 — **먼저 자라고, 그 다음 한 번 더 넘친다.** 한 번만 하면 등장으로 읽힌다

## M2. 판이 한 변을 붙박고 늘어난다 — `attr: { width }`

CSS `width` 트윈은 **리플로우로 글자가 떨리고 잘린다.** SVG 의 `attr` 은 안전하다.

```js
tl.fromTo('#voy04-reveal-rect', { attr: { width: 0 } },
                                { attr: { width: 514 }, duration: .38, ease: 'power4.out' }, 0);
```
> 00004 F04 · `<clipPath>` 안의 `<rect>` 를 늘려 **그 아래 내용을 훑어 드러낸다** (와이프)

🔴 글자·레이아웃에는 `width`/`height`/`letterSpacing` 을 트윈하지 마라. `scaleX` 나 `clipPath` 로.

## M3. 카드가 마주본다 — `rotationY` + `transformOrigin`

비교를 **두 면이 마주보는 각도**로 만든다. 나란히 놓기보다 강하다.

```js
tl.fromTo(P + ' .leaf-a', { rotationY: -78 }, { rotationY: 0, duration: .60, ease: 'expo.out' }, 0);
```
```css
.leaf-a { transform-origin: right center; }
```
> 00007 F05 · 이미 보이는 카드가 **기울기만 바뀌는** 것이면 `from` 없이 `to` 만 줘라 (안 그러면 큐 전에 숨는다)

## M4. 숫자는 말한 값에 꽂힌다 — 굴리지 않는다

```js
gsap.set('#f9-num', { opacity: 0, y: 20, scale: 1.5 });          // 최종값 '1,777'이 처음부터 마크업에 있다
tl.to('#f9-num', { opacity: 1, y: 0, scale: 1.12, duration: 0.1, ease: 'power3.in' }, 3.84);
tl.to('#f9-num', { scale: 1, duration: 0.3, ease: 'back.out(3)' }, 3.94);   // 3.94 = 값 단어 실측
```
> 00072 F09 (납품 v2)

0→값으로 굴리는 카운트업은 자막·음성에 없는 중간값을 보여 두 번 반려됐다(00043 「말과 다른 굴러가는 숫자」 · 00072 워커 4명 중 3명이 롤러 → 수정 1회). 값이 **바뀌는** 컷은 굴리지 않고 바뀐 자리만 교체한다(`.claude/skills/video/stages/4-designer.md` 「모든 컷의 안무」).
글자를 꼭 트윈해야 하면 `onUpdate` 대신 `modifiers`로 — `suppressEvents:true` 시킹에서 `onUpdate`는 불리지 않아 「0」에 얼어붙는다(00004 F05 실측: false → '93,750' / true → '0').

## M5. 점선이 흐른다 — `strokeDashoffset` 을 음수로

경로 위를 **뭔가 지나가고 있다**는 느낌. 이동 없이 시간이 흐른다.

```css
#voy04-dots { stroke-dasharray: 0.1 38; stroke-linecap: round; stroke-width: 12; }
```
```js
tl.fromTo('#voy04-dots', { strokeDashoffset: 0 },
                         { strokeDashoffset: -76, duration: 1.78, ease: 'none' }, .42);
```
> 00004 F04 항로 · 오프셋을 **점 간격의 정수배**(38×2)로 끝내면 이음매가 안 보인다
