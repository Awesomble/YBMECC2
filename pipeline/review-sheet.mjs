#!/usr/bin/env node
// review-sheet.mjs — 컷별 **번호 매긴** 검수 시트를 만든다. (2026-09-12 사용자 지시로 신설)
//
//   node pipeline/review-sheet.mjs <프로젝트> [--per 6] [--at settle|mid] [--from <영상.mp4>]
//
// 왜 (사용자 말 그대로):
//   > "이미지로 컷별로 찍어서 확인해달라고 한거 괜찮은 아이디어인것같아
//   >  하이퍼프레임 주소 알려줄때 그렇게 이미지 컷별로 모아서
//   >  「1번 이미지 8번째 타이포깨진」 같이 알려줄테니 수정할수 있게"
//
//   스튜디오 URL 만 주면 사용자가 **어디가 문제인지 말할 좌표가 없다.** 재생 중에 본 걸
//   초 단위로 옮겨 적어야 하는데, 그건 사용자 부담이고 실제로 이 프로젝트에서 여러 번 막혔다.
//   → 칸마다 **큰 번호**를 찍어 두면 「1-8」 한 마디로 지목이 끝난다.
//
// 산출물:
//   projects/<p>/output/review/sheet-1.png …   시트 (칸 번호 · 컷 번호 · 파일명 · 시각)
//   projects/<p>/output/review/index.json      시트/칸 → 컷 → 프레임 파일 대조표 (지적을 코드로 푸는 데 쓴다)
//   가로(1920×1080) 묶음 롱폼: index.html 루트 크기를 읽어 가로 칸(640×360·2열)으로 조판하고 시트를 챕터마다 끊는다.
//
// ⚠️ 임시 HTML 은 **스크래치패드**에 쓴다. 프로젝트 트리에 남기지 마라 (pitfalls §19).

import { resolveHyperframes } from "./lib/hyperframes-cli.mjs";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { resolveProject } from "./lib/project.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const num = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? +argv[i + 1] : d; };
const VALUED = new Set(["per", "at", "scale", "from"]);
const positional = argv.filter((a, i) => {
  if (a.startsWith("--")) return false;
  const prev = argv[i - 1];
  return !(prev && prev.startsWith("--") && VALUED.has(prev.slice(2)));
});
const PER = num("per", 6);                 // 시트 한 장에 담는 칸 수

const { dir, name } = resolveProject(positional[0]);
const HF = join(dir, "hyperframes");
const OUT = join(dir, "output", "review");
/* 🔴 수정 묶음이 열려 있으면 시트를 **재발행하지 않는다** (2026-09-13 사용자 필수 요건).
   한 건 고치고 → 시트 다시 보내고 → 또 확인받는 흐름이 바로 사용자를 지치게 한 것이다.
   지적 전부를 유형별로 전수 수정하고 `fix-batch close` 한 뒤에 낸다. */
try { execFileSync(process.execPath, [join(ROOT, "pipeline", "fix-batch.mjs"), "guard", name], { stdio: ["ignore", "ignore", "inherit"] }); }
catch { console.error("  → 시트 재발행을 막았다. 묶음을 닫고 다시 불러라."); process.exit(3); }

const IDX = join(HF, "index.html");
if (!existsSync(IDX)) { console.error(`🔴 ${IDX} 가 없다 — 먼저 조립해라`); process.exit(1); }

/* ── 1. 조립본에서 컷 목록을 읽는다 (cuts.json 이 아니라 **실제 조립 결과**가 정본) ── */
const idx = readFileSync(IDX, "utf8");
const attr = (tag, k) => (tag.match(new RegExp(`${k}="([^"]*)"`)) || [])[1];
// 캔버스 — 묶음 롱폼(hf-bundle)은 1920×1080 가로다. 루트에 크기가 없으면 세로 숏츠로 본다.
const rootTag = (idx.match(/<div\b[^>]*\bid="root"[^>]*>/) || [""])[0];
const VW = +attr(rootTag, "data-width") || 1080, VH = +attr(rootTag, "data-height") || 1920;
const LAND = VW > VH;
const SCALE = num("scale", LAND ? 640 : 360);   // 미리보기 가로 픽셀 (가로 640 = 가운데 무대가 세로 360 칸과 같은 폭)
const cuts =[...idx.matchAll(/<div[^>]*class="[^"]*\b(?:scene|frame-slot)\b[^"]*"[^>]*>/g)]
  .map((m) => m[0])
  .filter((t) => attr(t, "data-composition-src"))
  // 🔴 자막 트랙(track 9 · compositions/captions.html)은 컷이 아니다 — 00016 시트에 「captions 24.9s」 칸이 끼어 사용자를 헷갈리게 했다
  .filter((t) => attr(t, "data-track-index") !== "9" && !/captions\.html$/.test(attr(t, "data-composition-src")))
  .map((t) => ({
    id: attr(t, "data-composition-id"),
    src: attr(t, "data-composition-src"),
    start: +attr(t, "data-start"),
    dur: +attr(t, "data-duration"),
  }))
  .sort((a, b) => a.start - b.start);
if (!cuts.length) { console.error("🔴 조립본에서 컷을 못 찾았다 — 조립기 규약이 바뀌었나?"); process.exit(1); }
// 묶음 롱폼: 컷을 챕터로 묶는다 (c01-… → ch01 · bundle-poster → poster). 시트가 챕터를 넘지 않게 한다.
let chapters = [];
if (LAND) {
  try { chapters = JSON.parse(readFileSync(join(dir, "cuts.json"), "utf8")).bundle?.chapters || []; } catch {}
  cuts.forEach((c) => { const m = /^c(\d\d)-/.exec(c.id || ""); c.group = m ? `ch${m[1]}` : String(c.id).replace(/^bundle-/, ""); });
}
const groupLabel = (g) => { const m = /^ch(\d\d)$/.exec(g); const l = m && chapters[+m[1] - 1]?.label; return l ? `${g} · ${l}` : g; };

// 🔴 **정착 시점**을 찍는다. 진입 애니메이션 한가운데를 찍으면 「깨진 것」과 「들어오는 중」이 구별되지 않는다.
const _ai = argv.indexOf("--at");
const MODE = (_ai >= 0 && argv[_ai + 1]) || "settle";
/* 🔴 섹션은 **시작**과 **정착** 두 시점을 찍는다 (2026-09-15 · 00016 실측).
   정착만 찍으면 「12.8초 동안 빈 크림 상자에 행이 하나씩 트리클」되는 섹션이 멀쩡해 보인다 —
   정착 시점엔 다 채워져 있으니까. 사용자는 **시작부터** 본다. 섹션 첫 0.4초가 포스터가 아니면 반려다. */
const timeOf = (c) => {
  const t = MODE === "mid" ? c.start + c.dur * 0.5 : c.start + c.dur * 0.82;
  return +Math.min(Math.max(t, c.start + 0.2), c.start + c.dur - 0.05).toFixed(3);
};
const startOf = (c) => +Math.min(c.start + 0.4, c.start + c.dur - 0.05).toFixed(3);
const SPLIT = cuts.some((c) => c.dur >= 6);              // 섹션 모델(긴 프레임)일 때만 시작 컷을 추가한다
const cells = SPLIT ? cuts.flatMap((c) => [{ ...c, _t: startOf(c), _tag: "시작" }, { ...c, _t: timeOf(c), _tag: "정착" }])
                    : cuts.map((c) => ({ ...c, _t: timeOf(c), _tag: "" }));
const times = cells.map((c) => c._t);

/* ── 2. 프레임을 한 번에 찍는다 (브라우저 기동 1회) ── */
const SCRATCH = process.env.CLAUDE_SCRATCH || join(tmpdir(), `review-sheet-${process.pid}`);
const SHOTS = join(SCRATCH, "shots");
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });


// 🔴 두 가지 출처 — 무엇을 확인하려는지에 따라 다르다 (2026-09-12)
//   (기본) 조립본   = 게이트 C. 고치면 렌더 없이 바로 반영된다
//   --from <mp4>   = 마감 확인. **실제로 납품될 화소**다. 조립본과 렌더가 어긋난 적이 있어
//                    (pitfalls: 「스튜디오 = 렌더 대조」) 완성본 컨펌은 이쪽이 정본이다
const _fi = argv.indexOf("--from");
let FROM = _fi >= 0 && argv[_fi + 1] ? argv[_fi + 1] : null;
if (FROM && !existsSync(FROM)) {
  const alt = join(dir, "output", FROM);
  if (existsSync(alt)) FROM = alt;
  else { console.error(`🔴 영상이 없다: ${FROM}`); process.exit(1); }
}

if (FROM) {
  console.log(`  컷 ${cuts.length}개 · ${SPLIT ? "시작+정착" : "정착"} ${cells.length}칸 · 렌더본에서 추출 중 — ${basename(FROM)} …`);
  times.forEach((t, i) => {
    // ffmpeg 는 -ss 를 -i 앞에 둬야 키프레임 탐색이 빠르다. 파일명은 조립본 경로와 같은 규약으로 맞춘다.
    execFileSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", FROM, "-frames:v", "1",
      "-y", join(SHOTS, `frame-${String(i).padStart(2, "0")}-at-${t}s.png`)], { stdio: ["ignore", "ignore", "inherit"] });
  });
} else {
  console.log(`  컷 ${cuts.length}개 · ${SPLIT ? "시작+정착" : "정착"} ${cells.length}칸 촬영 중 …`);
  execFileSync(process.execPath, [resolveHyperframes(HF).cli, "snapshot", "--at", times.join(","), "--no-end", "-o", SHOTS],
    { cwd: HF, stdio: ["ignore", "ignore", "inherit"] });
}

const shots = readdirSync(SHOTS).filter((f) => /^frame-\d+-at-.*\.png$/.test(f))
  .map((f) => ({ f, t: +(f.match(/at-([\d.]+)s/) || [])[1] }))
  .sort((a, b) => a.t - b.t);
if (shots.length !== cells.length)
  console.log(`  ⚠️ 스냅샷 ${shots.length}장 ≠ 칸 ${cells.length}개 — 시각이 겹쳤을 수 있다`);

/* ── 3. 번호를 찍은 시트를 조판한다 ── */
const COLS = LAND ? 2 : PER >= 6 ? 3 : 2;
const CW = SCALE, CH = LAND ? Math.round(SCALE * VH / VW) : Math.round(SCALE * 1920 / 1080);
const sheets = [];
if (!LAND) for (let i = 0; i < cells.length; i += PER) sheets.push(cells.slice(i, i + PER).map((c, j) => ({ c, k: i + j })));
else for (let i = 0, j; i < cells.length; i = j) {       // 챕터가 바뀌면 새 시트
  for (j = i; j < cells.length && j - i < PER && cells[j].group === cells[i].group; j++);
  sheets.push(cells.slice(i, j).map((c, q) => ({ c, k: i + q })));
}

const esc = (s) => String(s).replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));
const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ...[].concat(...[readdirSync(join(process.env.HOME, ".cache/hyperframes/chrome")).map ? [] : []]),
].find((p) => existsSync(p));
if (!CHROME) { console.error("🔴 Chrome 을 못 찾았다"); process.exit(1); }

mkdirSync(OUT, { recursive: true });
const map = [];
sheets.forEach((cells, si) => {
  const html = `<!doctype html><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#111;font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;padding:20px}
  h1{color:#F2E8D5;font-size:22px;margin:0 0 14px;font-weight:700}
  h1 b{color:#F2C230}
  .g{display:grid;grid-template-columns:repeat(${COLS},${CW}px);gap:18px}
  .cell{background:#000;border-radius:8px;overflow:hidden;position:relative}
  .cell img{display:block;width:${CW}px;height:${CH}px;object-fit:contain;background:#000}
  .badge{position:absolute;left:0;top:0;background:#F2C230;color:#1A1A1A;font-weight:800;
         font-size:30px;line-height:1;padding:8px 14px;border-bottom-right-radius:10px;z-index:2}
  .meta{color:#cfcfcf;font-size:13px;padding:7px 10px;background:#1c1c1c;
        display:flex;justify-content:space-between;gap:8px}
  .meta b{color:#F2E8D5}
  </style>
  <h1>${esc(name)} — 검수 시트 <b>${si + 1}</b> / ${sheets.length}　<span style="font-size:14px;font-weight:400;color:#F2C230">${FROM ? '렌더본 ' + esc(basename(FROM)) : '조립본(스튜디오)'}</span>　<span style="font-size:15px;font-weight:400;color:#9a9a9a">칸 번호로 지목해 주세요 · 예: “${si + 1}-${Math.min(PER, cells.length)} 타이포 깨짐”</span></h1>
  ${LAND ? `<div style="color:#F2C230;font-size:18px;font-weight:700;margin:-4px 0 12px;height:22px;white-space:nowrap;overflow:hidden">${esc(groupLabel(cells[0].c.group))}</div>` : ""}<div class="g">
  ${cells.map(({ c, k }, ci) => {
    const s = shots[k];
    map.push({ sheet: si + 1, cell: ci + 1, cut: k + 1, id: c.id, src: c.src, t: times[k], shot: s ? s.f : null, ...(LAND ? { group: c.group } : {}) });
    const pool = LAND ? cuts.filter((x) => x.group === c.group) : cuts;   // 가로 묶음은 챕터 안 번호 = 원본 숏츠의 컷 번호
    return `<div class="cell"><div class="badge">${ci + 1}</div>
      ${s ? `<img src="file://${join(SHOTS, s.f)}">` : `<div style="width:${CW}px;height:${CH}px;display:flex;align-items:center;justify-content:center;color:#666">촬영 실패</div>`}
      <div class="meta"><b>컷 ${String(pool.findIndex((x) => x.id === c.id) + 1).padStart(2, "0")}${c._tag ? " · " + c._tag : ""}</b><span>${esc(c.id)}</span><span>${times[k]}s</span></div></div>`;
  }).join("\n")}
  </div>`;
  const hp = join(SCRATCH, `sheet-${si + 1}.html`);
  writeFileSync(hp, html);
  const W = 20 * 2 + COLS * CW + (COLS - 1) * 18;
  const rows = Math.ceil(cells.length / COLS);
  const H = 20 * 2 + 36 + rows * (CH + 30) + (rows - 1) * 18 + (LAND ? 30 : 0);
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
    `--window-size=${W},${H}`, `--screenshot=${join(OUT, `sheet-${si + 1}.png`)}`, `file://${hp}`],
    { stdio: ["ignore", "ignore", "ignore"] });
});

writeFileSync(join(OUT, "index.json"), JSON.stringify({ project: name, per: PER, mode: MODE, source: FROM ? basename(FROM) : "composition", sheets: sheets.length, cells: map, ...(LAND ? { canvas: `${VW}x${VH}` } : {}) }, null, 2));

console.log(`\n  ✓ 검수 시트 ${sheets.length}장 → projects/${name}/output/review/`);
console.log(`     ${SPLIT ? "섹션마다 시작+정착 두 칸" : `칸당 컷 1개 · 정착 시점(${MODE})`} · 칸마다 번호 표시 · 출처 ${FROM ? basename(FROM) : "조립본"}${LAND ? ` · 가로 ${VW}×${VH} · 챕터마다 새 시트` : ""}`);
console.log(`\n  대조표 (사용자가 「시트-칸」으로 지목하면 여기서 프레임을 찾는다)`);
for (let s = 1; s <= sheets.length; s++) {
  const hit = map.filter((m) => m.sheet === s);
  const row = hit.map((m) => `${m.cell}:${m.id}`).join("  ");
  console.log(`     시트 ${s}${LAND ? ` [${hit[0].group}]` : ""}   ${row}`);
}
console.log(`\n  🔴 사용자에게 보낼 때 — 스튜디오 URL 과 **시트 전부**를 한 번에 보낸다.`);
console.log(`     지적은 목록으로 받고, 한 건씩 고치지 마라 (stages/4-designer.md ⛳게이트 C).`);
