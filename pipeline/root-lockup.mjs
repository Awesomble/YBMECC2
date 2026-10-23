#!/usr/bin/env node
// root-lockup.mjs — 전 프레임에 같은 자리로 있는 요소를 **루트 트랙**으로 올린다.
//
//   node pipeline/root-lockup.mjs <프로젝트>            # 적용
//   node pipeline/root-lockup.mjs <프로젝트> --revert   # 되돌리기
//   node pipeline/root-lockup.mjs <프로젝트> --dry      # 무엇이 바뀌는지만
//   node pipeline/root-lockup.mjs <프로젝트> --sub      # ABMEN에서는 동일 락업을 쓰는 호환 옵션
//
// 2026-09-27: 루트 락업은 좌상단 이미지 로고다(brand.json logo — logo.file 을 assets/brand/ 로 복사).
//   옛 텍스트 락업으로 만든 편도 이 도구를 돌리면 로고로 바뀐다 — 사용자가 요청한 편에만 돌린다.
//
// 왜 (docs/14-hyperframes.md §3-b ① · 00003 에서 비싸게 배웠다):
//   같은 요소를 10개 프레임이 **각자 그리면** 이음매마다 앞 프레임의 기하를 손으로 복제해야 한다.
//   00003 은 채널 락업을 10곳에서 그렸고, 브랜드 CI 하나를 맞추는 데 워커 둘이 4라운드를 썼다.
//   루트에 클립 하나로 두면 프레임을 관통하므로 **이음매에서 튈 수가 없다.**
//   0px 일치가 측정 결과가 아니라 **전제**가 된다. 규격이 바뀌어도 한 곳만 고친다.
//
// ⚠️ **조립 뒤에 돌린다.** 조립기가 index.html 을 매번 재생성한다
//    (fix-captions·safezone-fixups 와 같은 계열). 멱등하므로 여러 번 돌려도 같다.
// ⚠️ 프레임 쪽 요소를 **지우지 않는다** — `display:none` 으로 끄고 표시만 남긴다.
//    되돌릴 수 있어야 한다.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveProject } from "./lib/project.mjs";
import { BRAND, installChannelLogo, lockupMarkup } from "./lib/brand.mjs";

const argv = process.argv.slice(2);
const REVERT = argv.includes("--revert");
const DRY = argv.includes("--dry");
const { dir, name } = resolveProject(argv.find((a) => !a.startsWith("--")),
  { usage: "node pipeline/root-lockup.mjs <프로젝트> [--revert|--dry]" });

const HF = join(dir, "hyperframes");
const FRAMES = join(HF, "compositions", "frames");
const INDEX = join(HF, "index.html");
if (!existsSync(FRAMES) || !existsSync(INDEX)) {
  console.error(`✗ HyperFrames 프로젝트가 아니다: ${HF}`);
  console.error("  (조립 전이면 먼저 조립하라 — 이 도구는 index.html 을 고친다)");
  process.exit(2);
}

const MARK = "data-root-lockup";       // 프레임 쪽 표시
const CLIP_ID = "el-root-lockup";      // 루트 클립 id
// 프레임 안에 남은 옛 채널 표시(작업명 SVG·옛 로고 PNG)는 끈다. 루트 로고(brand.json logo)는 여기에 넣지 않는다.
const SRC_RE = /abmen-wordmark\.svg|brand-logo\.png|jalsabo\.png|jalmeokgo2?\.png/;

// ── ① 프레임에서 락업을 끈다 ──
let touched = 0, already = 0, skipped = 0;
const edits = [];
for (const f of readdirSync(FRAMES).filter((n) => n.endsWith(".html"))) {
  const p = join(FRAMES, f);
  let s = readFileSync(p, "utf8");
  const before = s;
  // 🔴 **태그를 고치지 마라. 스타일 한 줄을 주입해라.**
  //    2026-09-09 에 <img> 에 속성을 붙이는 방식으로 짰다가 두 번 깨졌다:
  //      ① 자기닫힘 `<img … />` 의 `/` 가 속성 사이에 끼었다
  //      ② `/` 를 벗기고 붙였더니 **되돌리기가 바이트 단위로 복원되지 않았다** (10개 중 9개 불일치)
  //    되돌릴 수 없는 도구는 되돌릴 수 있는 척하는 도구보다 낫다 —
  //    한 줄을 넣고 그 한 줄만 지우면 원본이 그대로 남는다.
  if (REVERT) {
    // ⚠️ `data-root-lockup` 이 `data-root-lockup=""` 로 바뀌어 있을 수 있다 —
    //    **미리보기 스튜디오가 소스를 DOM 직렬화해 되쓴다** (2026-09-09 실측).
    //    빈 속성을 `=""` 로 정규화하므로 정확 일치로 찾으면 되돌리기가 조용히 실패한다.
    s = s.replace(new RegExp(`\\n?<style ${MARK}(=\"\")?>[^<]*</style>`, "g"), "");
  } else {
    if (s.includes(MARK)) { already++; continue; }   // `=""` 형태도 이 검사에 걸린다
    if (!SRC_RE.test(s)) { skipped++; continue; }
    const rule = `\n<style ${MARK}>img[src$="abmen-wordmark.svg"],img[src$="brand-logo.png"],img[src$="jalsabo.png"],img[src$="jalmeokgo.png"],img[src$="jalmeokgo2.png"]{display:none !important}</style>`;
    const m = s.match(/<template[^>]*>/);
    if (!m) { skipped++; continue; }
    s = s.slice(0, m.index + m[0].length) + rule + s.slice(m.index + m[0].length);
  }
  if (s !== before) { edits.push(f); if (!DRY) writeFileSync(p, s); touched++; }
}

// ── ② 루트에 락업 클립을 주입한다 ──
let is = readFileSync(INDEX, "utf8");
const root = is.match(/id="root"[^>]*data-duration="([\d.]+)"/);
if (!root) { console.error("✗ 루트 길이(data-duration)를 못 찾았다"); process.exit(2); }
const total = root[1];

// ⚠️ 속성 **순서와 개수를 가정하지 마라.** 미리보기 스튜디오가 소스를 되쓰면서
//    `data-hf-id="hf-…"` 를 앞에 끼워 넣는다 (2026-09-09 실측). `<img id="…"` 로 시작한다고
//    가정한 정규식이 못 찾아 **클립이 두 개가 됐고** lint 가 `duplicate_media_discovery_risk` 로 잡았다.
//    id 를 태그 어디에서든 찾는다.
is = is.replace(new RegExp(`\\s*<img[^>]*id="${CLIP_ID}"[^>]*>`, "g"), "");
is = is.replace(new RegExp(`\\s*<div\\b[^>]*id="${CLIP_ID}"[^>]*>[\\s\\S]*?</div>`, "g"), "");
is = is.replace(/#el-root-lockup\s*\{[^}]*\}/g, "");   // 멱등
if (!REVERT) {
  // 트랙 배정: 프레임 1 · 자막 2 · 음성 10 · BGM 11 · SFX 20+ 를 피해 **3**.
  // 프레임(1)보다 위에 그려지므로 어떤 프레임이 와도 락업이 가려지지 않는다.
  if (!DRY) installChannelLogo(HF);   // 원본이 없으면 여기서 멈춘다 — 깨진 <img> 를 넣지 않는다
  const clip = "\n      " + lockupMarkup(total);
  const at = is.lastIndexOf("</div>");
  is = is.slice(0, at).trimEnd() + clip + "\n  " + is.slice(at);
}
if (!DRY) writeFileSync(INDEX, is);

const verb = DRY ? "(dry) " : "";
if (REVERT) {
  console.log(`✓ ${verb}되돌림 — ${name} · 프레임 ${touched}개 복원 · 루트 클립 제거`);
} else {
  console.log(`✓ ${verb}채널 락업을 루트 트랙(3)으로 — ${name}`);
  console.log(`   프레임 ${touched}개에서 끔${already ? ` · 이미 처리됨 ${already}` : ""}${skipped ? ` · 락업 없음 ${skipped}` : ""}`);
  console.log(`   루트 클립 1개 (0~${total}s, 로고 x${BRAND.logo.left}·y${BRAND.logo.top} · h ${BRAND.logo.height}px · ${BRAND.logo.asset})`);
}
if (edits.length) console.log(`   ${edits.join(", ")}`);
console.log(`\n   ⚠️ 조립을 다시 하면 index.html 이 재생성된다 — 조립 뒤에 이 도구를 다시 돌려라.`);
console.log(`   되돌리기: node pipeline/root-lockup.mjs ${name} --revert`);
