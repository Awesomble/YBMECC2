#!/usr/bin/env node
// 가이드 정합성 검사 — 문서가 가리키는 것이 실제로 그러한지 센다.
//
//   node pipeline/guide-check.mjs
//
// 왜 있나 (2026-09-08): 하루에 세 번 같은 유형의 사고가 났다 —
//   ① 내 `--fps 60` 지침이 결함이 고쳐진 뒤에도 옛 상태로 남았다
//   ② 피어의 이징 수식이 GSAP 규약과 한 칸 어긋난 채 문서에 들어갔다
//   ③ 폐기한 `propose` 명령이 다른 세션 문서에 새로 적혔다
// 전부 "고쳐진 뒤에 옛 상태로 남은 지침"이다. 공유 저장소에 두 세션이 같이 쓰면 계속 난다.
//
// ⚠️ 셸 grep 을 쓰지 않는다. 이 환경의 grep 은 ugrep 이고 `-v` 가 빈 입력에 0 을 반환해
//    부정 검사가 조용히 뒤집힌다 (docs/02-pitfalls.md §21). 그래서 node 로 직접 센다.

import { readFileSync, readdirSync, existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const R = p => readFileSync(join(ROOT, p), "utf8");
const has = p => existsSync(join(ROOT, p));

let fail = 0, n = 0;
const ok  = m => { n++; console.log(`  ✔ ${m}`); };
const bad = m => { n++; fail++; console.log(`  ✗ ${m}`); };
const chk = (m, cond, detail) => cond ? ok(m) : bad(`${m}${detail ? " — " + detail : ""}`);

// 문서를 훑을 대상
const DOCS = [
  ...readdirSync(join(ROOT, "docs")).filter(f => f.endsWith(".md")).map(f => `docs/${f}`),
  "CLAUDE.md", "AGENTS.md", "README.md", "pipeline/templates/worker-brief.md", ".claude/skills/review/SKILL.md", ".claude/skills/ss/SKILL.md",
  ...(function walk(d, out = []) {
    for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) walk(p, out); else if (e.name.endsWith(".md")) out.push(p);
    }
    return out;
  })(".claude/skills/video"),
];
const corpus = DOCS.map(f => [f, R(f)]);

chk('Claude/Codex video 공용 원본 연결',
  has('.agents/skills/video/SKILL.md') && realpathSync(join(ROOT,'.agents/skills/video/SKILL.md')) === realpathSync(join(ROOT,'.claude/skills/video/SKILL.md')));

// ── ① 문서가 부르는 pipeline 명령이 실제로 존재하는가 ────────────────────────
console.log("\n── 문서가 부르는 명령이 실재하는가 ──");
const declared = new Set(readdirSync(join(ROOT, "pipeline")).filter(f => /\.(mjs|sh|py)$/.test(f)));
const called = new Map();
for (const [f, t] of corpus)
  for (const m of t.matchAll(/pipeline\/([a-z0-9-]+\.(?:mjs|sh|py))/g))
    (called.get(m[1]) ?? called.set(m[1], []).get(m[1])).push(f);
for (const [cmd, where] of called)
  chk(`pipeline/${cmd}`, declared.has(cmd), `없는 파일인데 ${[...new Set(where)].join(", ")} 가 부른다`);

// ── ② 죽은 하위명령 ──────────────────────────────────────────────────────────
console.log("\n── 폐기된 하위명령이 남았는가 ──");
const DEAD = [["motion-signature.mjs propose", "menu 로 교체됨 (2026-09-08)"]];
for (const [pat, why] of DEAD) {
  const hits = corpus.filter(([, t]) =>
    t.split("\n").some(l => l.includes(pat) && !/폐기|없다|교체/.test(l)));
  chk(`"${pat}" 참조 0건`, hits.length === 0, `${hits.map(([f]) => f).join(", ")} (${why})`);
}

// ── ③ file:line 주장이 여전히 맞는가 ─────────────────────────────────────────
console.log("\n── 문서의 file:line 주장이 아직 맞는가 ──");
const CLAIMS = [
  [".claude/skills/hyperframes-core/scripts/lib/frame-packets-core.mjs", 76, 'field(block, "rules")'],
];
for (const [f, line, must] of CLAIMS) {
  if (!has(f)) { bad(`${f}:${line} — 파일이 없다`); continue; }
  const l = R(f).split("\n")[line - 1] ?? "";
  chk(`${f}:${line} 이 \`${must}\` 를 담고 있다`, l.includes(must), `실제: ${l.trim().slice(0, 60)}`);
}

// ── ④ 카탈로그의 룰 id 가 전부 실재하는가 ────────────────────────────────────
console.log("\n── motion-signature 카탈로그의 룰 id ──");
const adCands = [".claude/skills/hyperframes-animation/rules",
                 ".agents/skills/hyperframes-animation/rules"];
const ad = adCands.find(has);
if (!ad) bad("hyperframes-animation/rules 를 못 찾았다");
else {
  const have = new Set(readdirSync(join(ROOT, ad)).map(f => f.replace(/\.md$/, "")));
  const src = R("pipeline/motion-signature.mjs");
  const jobs = src.slice(src.indexOf("const JOBS"), src.indexOf("// 모션 카탈로그 —"));
  const ids = [...new Set([...jobs.matchAll(/\["([a-z0-9-]+)",/g)].map(m => m[1]))];
  const miss = ids.filter(i => !have.has(i));
  chk(`카탈로그 룰 ${ids.length}종 전부 실재 (라이브러리 ${have.size}개)`, miss.length === 0, miss.join(", "));
}

// ── ④-b pitfalls 색인이 본문과 일치하는가 ──────────────────────────────────
//    🔴 **낡은 색인은 없는 색인보다 나쁘다** — 찾는 사람이 「없다」고 결론 내린다.
//    색인을 만든 이유가 「§76 에 그대로 적힌 사고를 못 찾아 다시 냈다」(2026-09-13)이니,
//    그 색인이 조용히 썩으면 같은 실패로 되돌아간다. 그래서 코드가 대조한다.
console.log("\n── pitfalls 색인 ──");
{
  const pf = R("docs/02-pitfalls.md");
  // 🔴 마침표를 강제하던 정규식이 §94~§105 **열두 절을 통째로 못 봤다** — 색인이 12행 썩은 채 ✔ 가 나왔다
  //    (2026-09-16). 제목 형식은 「§NN.」와 「§NN 」이 섞여 있다. 둘 다 받는다.
  const heads = [...pf.matchAll(/^## (§[\d\-a-z]+)[.\s]/gm)].map((m) => m[1]);
  const rows  = [...pf.matchAll(/^\| \*\*(§[\d\-a-z]+)\*\*/gm)].map((m) => m[1]);
  const missing = heads.filter((h) => !rows.includes(h));
  const stale   = rows.filter((r) => !heads.includes(r));
  chk(`색인 ${rows.length}행 = 본문 ${heads.length}절`, heads.length === rows.length && !missing.length && !stale.length,
      [missing.length ? `색인에 없는 절: ${missing.join(" ")}` : "",
       stale.length ? `본문에 없는 색인: ${stale.join(" ")}` : ""].filter(Boolean).join(" · "));
  const dup = heads.filter((h, i) => heads.indexOf(h) !== i);
  chk("절 번호 중복 없음", dup.length === 0, dup.join(" "));
}

// ── video 스킬 두 경로가 같은 내용인가 ──────────────────────────────────────
// .claude/skills/video 와 .agents/skills/video 는 같은 파일 한 벌(하드링크)이다. rename-replace 로
// 저장하는 편집기·도구가 한쪽만 건드리면 링크가 끊겨 Claude 와 Codex 가 다른 지시서를 읽는데,
// 겉으로는 티가 나지 않는다. CLAUDE.md 의 "두 도구가 같은 단계 지시서를 읽는다" 전제가 여기서 깨진다.
console.log("\n── video 스킬: Claude·Codex 경로 일치 ──");
{
  const walk = d => readdirSync(join(ROOT, d), { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]);
  const A = ".claude/skills/video", B = ".agents/skills/video";
  if (!has(A) || !has(B)) chk("두 경로 존재", false, `${A} · ${B}`);
  else {
    const la = walk(A).map(p => p.slice(A.length + 1)).sort();
    const lb = walk(B).map(p => p.slice(B.length + 1)).sort();
    const onlyIn = la.filter(f => !lb.includes(f)).concat(lb.filter(f => !la.includes(f)));
    chk("파일 목록 일치", onlyIn.length === 0, onlyIn.join(" "));
    const diff = la.filter(f => lb.includes(f) && R(`${A}/${f}`) !== R(`${B}/${f}`));
    chk("내용 일치 (갈라지면 두 도구가 다른 절차를 실행한다)", diff.length === 0, diff.join(" "));
    // 스킬 본문의 추론 키워드는 스킬이 실행될 때마다 발동한다 (docs/15-cost-cuts.md 「추론 깊이」) — 문장 대신 검사로 막는다
    const kw = walk(A).filter(p => p.endsWith(".md") && /ultrathink/i.test(R(p)));
    chk("video 스킬 본문에 추론 키워드 없음", kw.length === 0, kw.join(" "));
  }
}

// ── ⑤ 도구가 도는가 ─────────────────────────────────────────────────────────
console.log("\n── 도구 실행 ──");
const { spawnSync } = await import("node:child_process");
// ⚠️ 프로젝트 번호를 박아 두면 그 영상이 없는 저장소에서 영구 실패한다 (ABMEN 이식 때 00002 가 그랬다).
const sample = readdirSync(join(ROOT, "projects")).filter(d => /^\d{5}-/.test(d)).sort()[0];
const sigArgs = [[["menu"], [0]], [["history"], [0]]];
if (sample) sigArgs.push([["audit", sample], [0]]);
else console.log("  – motion-signature audit — 프로젝트가 없어 건너뜀");
for (const [args, okCodes] of sigArgs) {
  const r = spawnSync("node", [join(ROOT, "pipeline/motion-signature.mjs"), ...args],
    { encoding: "utf8", cwd: ROOT });
  chk(`motion-signature ${args.join(" ")}`, okCodes.includes(r.status),
      `exit=${r.status} ${(r.stderr || "").trim().split("\n")[0] ?? ""}`);
}

console.log(fail ? `\n✗ ${n}건 중 ${fail}건 실패\n` : `\n✔ ${n}건 전부 통과\n`);
process.exit(fail ? 1 : 0);
