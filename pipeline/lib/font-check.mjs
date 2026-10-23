// font-check.mjs — HyperFrames 프로젝트의 폰트 선언·사용·파일을 대조한다 (2026-09-10 신설)
//
//   node pipeline/lib/font-check.mjs <hyperframes폴더>
//
// 왜: 00006 은 자막·라벨·본문이 전부 배민 한나체로 나갔다. `docs/12-brand.md` 는
//   그 자리를 **Pretendard** 로 정해 뒀는데 프로젝트에 파일조차 없었다.
//   화면에 글자는 멀쩡히 보이니 lint·게이트·감독 어디에도 안 걸렸다 — **폰트를 보는 도구가 없었다.**
//
// 잡는 것 셋
//   1) @font-face 없이 쓰이는 family  → 브라우저가 조용히 시스템 폰트로 떨어뜨린다
//   2) 선언은 있는데 파일이 없는 것    → 같은 결과인데 원인이 다르다
//   3) #main 의 기본 폰트가 무엇인가   → 자막·본문 전부가 여기서 상속된다. **사람이 봐야 한다**
import fs from 'node:fs';
import path from 'node:path';

const hf = process.argv[2];
if (!hf) { console.error('usage: font-check.mjs <hyperframes폴더>'); process.exit(2); }

// 🔴 2026-09-10: 첫 판은 `compositions/frames/` 만 봤다. 00005 는 프레임이 `compositions/*.html`
//    평면이라 **선언을 놓치고 「선언 0종」이라 오판**했다. 재귀로 훑는다.
const walk = (d) => fs.existsSync(d)
  ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(d, e.name))
      : /\.(html|css)$/i.test(e.name) ? [path.join(d, e.name)] : [])
  : [];
const files = [path.join(hf, 'index.html'), ...walk(path.join(hf, 'compositions'))]
  .filter((f) => fs.existsSync(f));

const unq = (s) => s.trim().replace(/^["']|["']$/g, '');
// --declared-files : @font-face 가 실제로 가리키는 **존재하는** 파일 경로만 한 줄씩. 변이 시험이 쓴다.
const LIST_ONLY = process.argv.includes('--declared-files');
const declared = new Map();   // family → 파일 경로(상대)
const used = new Map();       // family → 사용 횟수

for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  // 🔴 `@font-face {` 처럼 **공백**이 오는 표기가 있다 (00002). `@font-face\{` 로만 잡으면
  //    선언을 통째로 못 보고 「@font-face 없이 쓰였다」는 거짓 반려를 낸다.
  //    url 이 font-family 보다 앞에 오는 순서도 있으므로 블록을 먼저 떼고 각각 찾는다.
  for (const b of t.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const fam = b[1].match(/font-family:\s*([^;,}]+)/);
    const url = b[1].match(/url\(\s*["']?([^"')]+)/);
    if (fam && url) declared.set(unq(fam[1]), url[1].trim());
  }
  for (const m of t.matchAll(/font-family:\s*([^;}]+)/g)) {
    const first = unq(m[1].split(',')[0]);
    if (!/^(sans-serif|serif|monospace|inherit|system-ui|initial|unset)$/i.test(first))
      used.set(first, (used.get(first) ?? 0) + 1);
  }
}
// @font-face 의 font-family 도 위 루프에 잡힌다 — 파일 수만큼 빼야 '실제 사용'이 남는다
for (const fam of declared.keys()) used.set(fam, (used.get(fam) ?? 0) - files.length);

// 본문 기본은 프로젝트마다 다른 선택자에 있다 — #main · body · html 순으로 찾는다
const idx = fs.readFileSync(path.join(hf, 'index.html'), 'utf8');
if (LIST_ONLY) {
  for (const rel of declared.values()) {
    const p = path.resolve(hf, rel.replace(/^\//, ''));
    if (fs.existsSync(p)) console.log(p);
  }
  process.exit(0);
}

const root = [/#root\s*\{[^}]*?font-family:\s*([^;}]+)/, /#main\s*\{[^}]*?font-family:\s*([^;}]+)/, /\bbody\s*\{[^}]*?font-family:\s*([^;}]+)/,
              /\bhtml\s*\{[^}]*?font-family:\s*([^;}]+)/]
  .map((re) => (idx.match(re) ?? [])[1]).find(Boolean);

// 🔴 `/fonts/…` 절대경로 표기가 있다 (00002). 파일시스템 루트가 아니라 **프로젝트 루트** 기준이다.
const resolveFont = (rel) => path.resolve(hf, rel.replace(/^\//, ''));

// 🔴 「있다」로는 부족하다 — 0바이트·잘린 파일도 existsSync 는 통과시키고,
//    브라우저는 그걸 조용히 버리고 시스템 폰트로 떨어진다. 결과가 「파일 없음」과 같다.
//    (감독이 변이 시험 사례로 지목했고, 실제로 첫 판이 뚫렸다 — docs/02-pitfalls.md §45)
const MAGIC = [
  ['OTTO', 'otf'], ['wOF2', 'woff2'], ['wOFF', 'woff'], ['true', 'ttf'], ['ttcf', 'ttc'],
];
const badFile = (p) => {
  const st = fs.statSync(p);
  if (st.size < 1024) return `${st.size}바이트 — 잘렸거나 자리표시자다`;
  const b = fs.readFileSync(p);
  const tag = b.subarray(0, 4).toString('latin1');
  const ttf = b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0;   // TrueType outline
  if (!MAGIC.some(([m]) => m === tag) && !ttf)
    return `머리 4바이트가 폰트가 아니다 (${[...b.subarray(0, 4)].join(' ')})`;

  // 🔴 머리가 맞고 크기도 넉넉한데 **뒤가 잘린** 파일이 있다 (감독 발견 2026-09-10).
  //    중단된 curl·복사가 만드는 현실적인 형태다. 브라우저는 이걸 버리고 시스템 폰트로 떨어진다 —
  //    결과가 「파일 없음」과 같은데 크기·매직바이트 검사는 둘 다 통과한다.
  //    폰트가 **스스로 밝힌 길이**와 실제 크기를 대조하면 확정적으로 갈린다.
  try {
    if (tag === 'wOF2' || tag === 'wOFF') {          // WOFF/WOFF2 는 머리에 전체 길이를 싣는다
      const declared = b.readUInt32BE(8);
      if (declared !== st.size) return `머리가 밝힌 길이 ${declared.toLocaleString()} ≠ 실제 ${st.size.toLocaleString()}바이트 — 잘렸다`;
    } else if (tag !== 'ttcf') {                     // sfnt(OTF·TTF) 는 테이블 디렉터리로 잰다
      const n = b.readUInt16BE(4);
      let end = 0;
      for (let i = 0; i < n; i++) {
        const o = 12 + i * 16;
        if (o + 16 > st.size) return `테이블 디렉터리(${n}개)가 파일 안에 안 들어간다 — 잘렸다`;
        end = Math.max(end, b.readUInt32BE(o + 8) + b.readUInt32BE(o + 12));
      }
      if (end > st.size) return `테이블이 밝힌 끝 ${end.toLocaleString()} > 실제 ${st.size.toLocaleString()}바이트 — 잘렸다`;
    }
  } catch { return '머리를 읽다 파일 끝에 닿았다 — 잘렸다'; }
  return null;
};

const missing = [];
for (const [fam, rel] of declared) {
  const p = resolveFont(rel);
  if (!fs.existsSync(p)) missing.push([fam, `${rel} (파일 없음)`]);
  else { const why = badFile(p); if (why) missing.push([fam, `${rel} — ${why}`]); }
}
const undeclared = [...used].filter(([f, n]) => n > 0 && !declared.has(f));

console.log(`     선언 ${declared.size}종 — ${[...declared.keys()].join(' · ') || '없음'}`);
// 🔴 루트 기본이 없는 것 자체는 결함이 아니다 — 00002~00005 는 요소마다 폰트를 지정한다.
//    상속에 기대지 않으면 루트 선언이 필요 없다. 쓰인 family 가 전부 선언돼 있으면 통과다.
console.log(root ? `     본문·자막 기본 — ${unq(root)}   ← docs/12-brand.md 의 역할 표와 대조하라`
                 : '     본문·자막 기본 — 루트에 없다 (요소마다 지정하는 방식)');
for (const [fam, n] of [...used].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]))
  console.log(`       ${declared.has(fam) ? '✅' : '🔴'} ${fam.padEnd(16)} ${n}곳`);
if (missing.length) { console.log('     🔴 선언한 폰트 파일에 문제가 있다:'); for (const [f, r] of missing) console.log(`        ${f} → ${r}`); }
if (undeclared.length) console.log(`     🔴 @font-face 없이 쓰인 family ${undeclared.length}종 — 조용히 시스템 폰트가 된다`);

// 선언 어디에도 안 걸린 폰트 파일 — 결함은 아니지만 **검사 밖에 있다.**
// 00003 은 Pretendard Bold·ExtraBold 를 3MB 담아 두고 Black 만 선언한다. 잘려 있어도 아무도 모른다.
{
  const used = new Set([...declared.values()].map((r) => path.resolve(hf, r.replace(/^\//, ''))));
  const dirs = [...new Set([...declared.values()].map((r) => path.dirname(path.resolve(hf, r.replace(/^\//, '')))))];
  const orphan = dirs.filter((d) => fs.existsSync(d))
    .flatMap((d) => fs.readdirSync(d).map((f) => path.join(d, f)))
    .filter((f) => /\.(otf|ttf|woff2?|ttc)$/i.test(f) && !used.has(f));
  if (orphan.length)
    console.log(`     △ 선언 안 된 폰트 파일 ${orphan.length}개 (검사 밖이다) — ${orphan.map((f) => path.basename(f)).join(' · ')}`);
}
// 🔴 빈 글리프 — 한나체Pro 는 →·—·× 를 **cmap 에는 갖고 있지만 outline 이 비어 있다.**
//    그래서 ① 브라우저가 「글리프 있음」으로 판단해 **폴백을 안 탄다** ② 자리는 차지하고 잉크만 0px 이다.
//    00007 에서 F10 「IP48 → IP68」이 「IP48  IP68」로 나와 **표와 좌우가 반대로 읽혔다** (pitfalls §49).
//    ⚠️ woff2 는 brotli 라 cmap 을 파싱할 수 없다. 그래서 **문자로 막는다.**
const GLYPHLESS = [['\u2192','→'],['\u2014','—'],['\u00D7','×'],['\u2190','←'],['\u2194','↔'],['\u21D2','⇒'],['\u2013','–']];
const headlineHits = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  if (!/font-family\s*:\s*['"]?BMHannaPro/i.test(src)) continue; // Inter headlines have these glyphs.
  // 🔴 **클래스로 폰트를 준 것도 인정한다** (2026-09-12 · 00009 에서 오탐으로 하드 실패가 났다).
  //    `.arw{font-family:Pretendard}` + `<span class="arw">→</span>` 는 실제로 정상 렌더된다.
  //    예전 검사는 인라인 `style="font-family:…"` 만 봤고, 권장 방식 ②를 쓴 코드를 반려했다.
  const styleBlk = src.includes('<style') ? src.split('<style', 2)[1].split('</style>', 1)[0] : '';
  const fontCls = new Set();
  for (const c of styleBlk.matchAll(/\.([A-Za-z][\w-]*)\s*\{[^}]*font-family\s*:/g)) fontCls.add(c[1]);
  const SAFE_SPAN = new RegExp(
    '<span[^>]*(?:font-family' + (fontCls.size ? '|class="[^"]*\\b(?:' + [...fontCls].join('|') + ')\\b[^"]*"' : '') + ')[^>]*>[\\s\\S]*?<\\/span>', 'g');
  // .title(헤드라인) 요소의 내용만 본다 — 페이로드(Jalnan·Pretendard)에서는 정상 출력된다
  for (const m of src.matchAll(/<h1[^>]*class="[^"]*\btitle\b[^"]*"[^>]*>([\s\S]*?)<\/h1>/g)) {
    const inner = m[1];
    const bare = inner.replace(SAFE_SPAN, '');
    for (const [cp, ch] of GLYPHLESS)
      if (bare.includes(ch)) headlineHits.push([path.basename(f), ch]);
  }
}
if (headlineHits.length) {
  console.log(`     🔴 헤드라인에 **렌더에서 사라지는 기호** ${headlineHits.length}곳 — 한나체Pro 에 outline 이 없다`);
  for (const [f, ch] of headlineHits) console.log(`        ${f} → 「${ch}」`);
  console.log('        고치는 법 ① 문장으로 — 「IP48 → IP68」 ❌ / 「IP48에서 IP68로」 ✅ (좌우 오해도 없앤다)');
  console.log('        고치는 법 ② 기호만 <span style="font-family:Pretendard">×</span> 로 감싼다 (요소 지정은 폴백을 안 탄다)');
  console.log('        🔴 font-family 폴백(,sans-serif ·,Pretendard)으로는 안 고쳐진다 — 실측 확인됨');
}
if (!missing.length && !undeclared.length && !headlineHits.length) console.log('     ✅ 선언·파일·사용이 일치');
// ⚠️ 「어떤 폰트여야 하나」는 판정하지 않는다 — 그건 docs/12-brand.md 의 역할 표이고
//    사람이 위 목록을 보고 정한다. 도구는 **조용한 실패**만 막는다.
process.exit(missing.length || undeclared.length || headlineHits.length ? 1 : 0);
