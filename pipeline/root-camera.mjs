#!/usr/bin/env node
// root-camera.mjs — HyperFrames 조립본에 **전역 카메라**를 주입한다.
//
//   node pipeline/root-camera.mjs <프로젝트>            # 적용
//   node pipeline/root-camera.mjs <프로젝트> --revert   # 되돌리기
//   node pipeline/root-camera.mjs <프로젝트> --dry      # 무엇이 바뀌는지만
//   옵션: --xy 7  --scale 1.8   (진폭. 기본 xy 7px · scale 1.8%)
//
// 왜 (2026-09-11 · 00009 에서 비싸게 배웠다):
//   워커에게 프레임 단위로만 지시하면 **카메라를 아무도 안 맡는다.** 00009 는 25프레임을
//   다 만들고 나서야 `index.html` 에 카메라 트윈이 0개인 걸 발견했고, 사용자가 먼저
//   "모션이 애매하다"고 했다. `docs/11-motion.md` P5 규격이 통째로 빠져 있었다.
//
//   ⚠️ 프레임 안에 카메라를 넣으면 컷마다 위상이 0에서 시작해 **경계에서 튄다**
//      (pitfalls §? · 00003 의 moving hold 위상 리셋과 같은 원인). 루트에 하나만 둔다.
//
// 방식 — 비정수비 사인 합. 컷 인덱스를 참조하지 않으므로 C∞ 연속이다.
//   x  = A·sin(2πt/9.1)  + 0.35A·sin(2πt/5.3 + 2.1)
//   y  = B·sin(2πt/12.7) + 0.35B·sin(2πt/7.1 + 0.4)
//   s  = BASE + 0.5S·(1.4 + sin(2πt/11.0) + 0.4·sin(2πt/7.3 + 1.7))
//
// 🔴 **BASE 가 1 이면 안 된다 — 가장자리에 바탕(크림)이 드러난다** (2026-09-11 · 00009 실측).
//   `.scene` 은 1080×1920 에 꽉 차 있고 그 뒤는 `#root` 의 크림이다. 그래서
//     · scale < 1  이면 사방에 크림 띠가 생기고
//     · translate 는 scale 1 에서도 반대쪽 가장자리를 드러낸다
//   초판은 s 를 1 중심으로 흔들어서 축소 구간마다 크림이 보였다. t=30.6s 에서
//   scale 0.984 → 좌우 8.6px · 상하 15.3px 노출. 스냅샷에서 눈으로 잡았다.
//   → BASE = 1 + 2·max|x|/1080 + 여유. 최대 이동이 가로라 가로가 구속 조건이다.
//
//   🔴 **트윈은 1개다.** onUpdate 로 매 프레임 계산하므로 모션 밀도 지표를 부풀리지 않는다
//      (샘플을 수백 개 박으면 지표만 오르고 화면은 그대로다 — metric-not-a-target).
//   🔴 seek 안전: `__main.time()` 을 읽으므로 스크럽·렌더 어느 쪽이든 같은 값이 나온다.
//
// 🔴 **대상은 `#root` 다 — `.scene` 이 아니다** (2026-09-11 · 00009 실측 · pitfalls §69).
//   초판은 `.scene` 만 확대했는데, **루트 트랙(채널 락업)은 `.scene` 밖**이라 안 따라 움직였다.
//   배율 1.045 에서 헤드존 상단이 352 → **321** 로 밀려 올라가 락업(하단 350) 안으로 들어갔다.
//   헤드라인이 있는 9개 프레임 전부에서 제목이 락업과 겹쳤다 — 카메라가 만든 결함이다.
//   `#root` 를 통째로 움직이면 씬·락업·자막의 **상대 위치가 보존**된다.
//
// ⚠️ **조립을 다시 하면 index.html 이 재생성된다** — 조립 뒤에 다시 돌려라 (root-lockup 과 같다).
// ⚠️ 자막도 함께 카메라를 탄다. 진폭이 작아(≤16px, 주기 9~13초) 가독성에는 영향이 없지만,
//    셰이크를 여기에 얹지 마라 — 그건 자막을 죽인다.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveProject } from "./lib/project.mjs";

const argv = process.argv.slice(2);
const REVERT = argv.includes("--revert");
const DRY = argv.includes("--dry");
const num = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? +argv[i + 1] : d;
};
const AX = num("x", 4);            // 가로 ±px
const AY = num("y", 6);            // 세로 0~px (아래로만)
const AZ = num("zoom", 1.2) / 100; // 축소 0~%

// 🔴 프로젝트는 순번(숫자)으로도 지목한다 — `--xy 7` 의 값과 헷갈리지 않게 **플래그 값을 먼저 뺀다**
const VALUED = new Set(["x", "y", "zoom"]);
const positional = argv.filter((a, i) => {
  if (a.startsWith("--")) return false;
  const prev = argv[i - 1];
  return !(prev && prev.startsWith("--") && VALUED.has(prev.slice(2)));
});
const { dir, name } = resolveProject(positional[0]);
const IDX = join(dir, "hyperframes", "index.html");
const MARK_A = "/* ── root-camera: 시작 (pipeline/root-camera.mjs) ── */";
const MARK_B = "/* ── root-camera: 끝 ── */";

let html;
try { html = readFileSync(IDX, "utf8"); }
catch { console.error(`🔴 ${IDX} 가 없다 — 먼저 조립해라`); process.exit(1); }

// 이미 있으면 걷어낸다 (멱등)
const a = html.indexOf(MARK_A);
if (a >= 0) {
  const b = html.indexOf(MARK_B, a);
  html = html.slice(0, a) + html.slice(b + MARK_B.length);
  html = html.replace(/\n{3,}/g, "\n\n");
  if (REVERT) {
    if (!DRY) writeFileSync(IDX, html);
    console.log(`✓ ${DRY ? "(dry) " : ""}카메라 제거 — ${name}`);
    process.exit(0);
  }
}
if (REVERT) { console.log(`· 카메라가 없다 — ${name}`); process.exit(0); }

// 총 길이는 루트 컴포지션에서 읽는다
const dur = (html.match(/id="main"[^>]*data-duration="([0-9.]+)"/) ||
             html.match(/data-composition-id="main"[\s\S]{0,400}?data-duration="([0-9.]+)"/) || [])[1];
if (!dur) { console.error("🔴 루트 data-duration 을 못 찾았다"); process.exit(1); }

const anchor = 'window.__timelines["main"] = gsap.timeline({ paused: true });';
if (!html.includes(anchor)) { console.error("🔴 루트 타임라인 선언을 못 찾았다 — 조립기 버전이 다르다"); process.exit(1); }

const inject = `var __main = window.__timelines["main"];
      ${MARK_A}
      (function () {
        var AX = ${AX}, AY = ${AY}, AZ = ${AZ}, D = ${dur}, els = null, n = 0;
        __main.to({ p: 0 }, { p: 1, duration: D, ease: "none", onUpdate: function () {
          var cur = document.querySelectorAll(".scene");
          if (!els || cur.length !== n) { els = cur; n = cur.length; }
          var t = __main.time(), TAU = Math.PI * 2;
          var w1 = Math.sin(TAU * t / 9.1)  + 0.35 * Math.sin(TAU * t / 5.3 + 2.1);
          var w2 = Math.sin(TAU * t / 12.7) + 0.35 * Math.sin(TAU * t / 7.1 + 0.4);
          var w3 = Math.sin(TAU * t / 11.0) + 0.40 * Math.sin(TAU * t / 7.3 + 1.7);
          var x = AX * (w1 / 1.35);                 // 가로 ±AX
          var y = AY * (1 + w2 / 1.35) / 2;         // 세로 0~AY — 아래로만
          var s = 1 - AZ * (1 + w3 / 1.40) / 2;     // 배율 1-AZ~1 — 축소만
          var tf = "translate(" + x.toFixed(2) + "px," + y.toFixed(2) + "px) scale(" + s.toFixed(5) + ")";
          for (var k = 0; k < n; k++) {
            var e = els[k];
            if (e.style.transformOrigin !== "540px 1035px") e.style.transformOrigin = "540px 1035px";
            e.style.transform = tf;
          }
        } }, 0);
      })();
      ${MARK_B}`;

html = html.replace(anchor, anchor + "\n      " + inject);

// 🔴 body 바탕을 검정 → 딥그린으로 (2026-09-11 · 00009 · pitfalls §68)
//   조립기 기본값이 `background:#000` 인데, `#root`(크림)가 칠해지기 **전** 순간이 그대로 보인다.
//   스튜디오는 파일을 저장할 때마다 iframe 을 다시 로드하므로 편집 중에 검은 화면이 반복해서 번쩍인다.
//   카메라가 `.scene` 을 확대·이동시키므로 그 뒤에 깔리는 바탕은 카메라의 소관이다.
html = html.replace(/(html,\s*\n?\s*body\s*\{[^}]*?background:\s*)#000(;)/, "$1#14532D$2");
html = html.replace(/(#root\s*\{[^}]*?background:\s*)#F2E8D5(;)/, "$1#14532D$2");

if (!DRY) writeFileSync(IDX, html);

console.log(`✓ ${DRY ? "(dry) " : ""}전역 카메라 — ${name}`);
console.log(`   가로 ±${AX}px (9.1/5.3s) · 세로 0~${AY}px **아래로만** (12.7/7.1s) · 축소 0~${(AZ * 100).toFixed(1)}% (11.0/7.3s)`);
console.log(`   🔴 확대 없음 — 락업(232~350)과 헤드존(352) 사이 슬랙이 2px 뿐이라 위로 밀면 구역을 침범한다`);
console.log(`   좌 여백 72 → 최악 ${(72 - AX).toFixed(0)}px (게이트 하한 60) · 앵커 (540,1035) · 트윈 1개 · 길이 ${dur}초`);
console.log(`   바탕 딥그린 (body·#root) — 축소로 드러나는 뒷면을 덮는다`);
console.log(`\n   ⚠️ 조립을 다시 하면 index.html 이 재생성된다 — 조립 뒤에 이 도구를 다시 돌려라.`);
console.log(`   되돌리기: node pipeline/root-camera.mjs ${name} --revert`);
