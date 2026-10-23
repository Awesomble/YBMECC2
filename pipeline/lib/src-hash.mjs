// src-hash.mjs — HyperFrames 소스의 **의미 해시** (2026-09-10 신설)
//
// 왜: render-gate ① 은 「소스가 렌더보다 새로운가」를 mtime 으로 봤다.
//   mtime 은 렌더가 소스를 **읽은** 시각이 아니라 **다 굽고 파일을 닫은** 시각이다.
//   00006 v2 실측 — F04 소스 수정 12:48:24 · v2 산출 12:48:51.
//   산출이 더 **늦은데도** v2 에는 옛 transformOrigin 이 들어 있었다.
//   렌더가 12:48:24 이전에 이미 그 파일을 읽었기 때문이다.
//   ⇒ 시각 비교로는 **원리적으로** 못 잡는다. 내용으로 봉인해야 한다.
//
// 의미 해시인 이유: 주석만 고친 편집(경고 문구 추가 등)은 화소를 1px 도 안 바꾼다.
//   그걸로 게이트가 「옛 판」이라고 하면 쓸데없는 재렌더를 부르고, 결국 게이트를 끄게 된다.
//   그래서 주석과 공백을 걷어낸 뒤 해시한다.
//
// ⚠️ 한계: `//` 제거기는 `:` 뒤(=URL)만 지킨다. 문자열 안의 `a//b` 는 주석으로 오인해
//   그 뒤를 지운다 — 그 문자열의 변경은 해시가 못 본다. 우리 소스엔 그런 리터럴이 없다
//   (`grep -n '"[^"]*[^:]//' compositions/**/*.html` 로 확인 가능).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function semanticHash(text) {
  const stripped = text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return crypto.createHash('md5').update(stripped).digest('hex');
}

// 🔴 2026-09-10 (감독 발견): 이 함수의 첫 판은 `compositions/` 와 `assets/` 만 걸었고,
//   `brand-logo.png`(전 프레임 y226 의 우리 락업)와 `fonts/*.woff2`(본문·숫자 전 글자)를
//   **놓쳤다.** 둘 다 `hyperframes/` 루트에 있어 walk 대상이 아니었고 woff2 는 확장자
//   화이트리스트에도 없었다. ⇒ 폰트를 갈아 화면이 통째로 바뀌어도 게이트는 「✅ 소스 그대로」였다.
//   **이 도구가 막으려던 바로 그 실패다.**
//
// 그래서 파일명 3개를 더 적는 대신 **HTML 이 실제로 참조하는 것에서 목록을 유도한다.**
//   화이트리스트는 자산이 늘 때마다 같은 방식으로 조용히 낡는다 — 참조는 안 낡는다.
const REF = /(?:src|href)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^"')]+)["']?\s*\)/g;

export function sourceFiles(hf) {
  const found = new Set();
  const add = (p) => { if (fs.existsSync(p) && fs.statSync(p).isFile()) found.add(p); };
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(html|css|js|json|svg|png|jpe?g|mp3|wav|woff2?|ttf|otf)$/i.test(e.name)) add(p);
    }
  };
  // ① 바닥 — 디렉터리 전수
  for (const d of ['compositions', 'assets', 'fonts']) walk(path.join(hf, d));
  for (const f of ['index.html', 'audio_meta.json']) add(path.join(hf, f));

  // ② 참조 추적 — 저작 HTML 이 부르는 것은 어디에 있든 전부 센다
  const html = [...found].filter((p) => p.endsWith('.html'));
  const missing = [];
  for (const src of html) {
    const dir = path.dirname(src);
    for (const m of fs.readFileSync(src, 'utf8').matchAll(REF)) {
      const ref = (m[1] ?? m[2] ?? '').trim();
      // %23 은 퍼센트 인코딩된 「#」 — data: SVG 안의 filter='url(%23n)' 같은 문서 내부 참조다(00001 v3 종이결, 2026-10-21)
      if (!ref || /^(https?:|data:|#|%23|mailto:)/i.test(ref)) continue;
      // 실제 참조한 .media/audio도 렌더 입력이다. 캐시 전체를 걷지는 않는다.
      // 🔴 기준이 **둘**이다. 프레임은 index.html 에 합성돼 루트에서 로드되므로
      //    `compositions/frames/01.html` 안의 `fonts/Jalnan.woff2` 는 **루트 기준**으로 풀린다.
      //    파일 기준으로만 풀면 폰트·로고 56건이 「끊긴 참조」로 잘못 잡힌다 (첫 판이 그랬다).
      const rel = ref.split(/[?#]/)[0].replace(/^\//, '');
      const cands = [path.resolve(dir, rel), path.resolve(hf, rel)]
        .filter((a) => a.startsWith(path.resolve(hf) + path.sep));
      const hit = cands.find((a) => fs.existsSync(a));
      if (hit) add(hit);
      else if (cands.length) missing.push(`${path.relative(hf, src)} → ${ref}`);
    }
  }
  // 🔴 끊긴 참조는 조용히 넘기지 않는다 — 화면에 안 그려지는 자산을 「지문 일치」로 덮으면 안 된다
  if (missing.length) {
    const seen = [...new Set(missing)];
    process.emitWarning(`src-hash: 참조가 끊긴 자산 ${seen.length}건\n  ${seen.join('\n  ')}`);
  }
  return [...found].sort();
}

// 봉인 지문의 규격 버전. 🔴 올리면 옛 봉인과 대조가 불가능해지므로 게이트가 그렇게 말해야 한다.
//   1 = compositions/·assets/·index.html·audio_meta.json 만 (폰트·락업을 놓쳤다 — 감독 발견)
//   2 = 위 + fonts/ + **HTML 참조 추적** (루트/파일 두 기준으로 해석)
//   3 = 바이너리 판정을 경로 접두사에서 **확장자**로 (루트의 brand-logo.png 를 텍스트로 읽던 버그)
//   4 = 실제 참조한 .media/audio 포함 + 루트 절대 URL 경로 해석
export const HASH_VERSION = 4;

export function manifest(hf) {
  const m = {};
  for (const p of sourceFiles(hf)) {
    const buf = fs.readFileSync(p);
    const rel = path.relative(hf, p);
    // 🔴 의미 해시는 **우리가 손으로 쓴 텍스트 소스에만** 쓴다. 조건이 둘 다 걸려야 한다:
    //    (1) assets/ 밖  — gsap.min.js 같은 압축 코드에 `//` 제거기를 대면 정규식이 잘린다
    //    (2) 텍스트 확장자 — 🔴 2026-09-10 변이 시험이 잡은 것: 첫 판은 (1)만 봤고,
    //        그래서 루트의 `brand-logo.png`(2MB 바이너리)를 utf8 로 읽어 공백 정규화했다.
    //        마지막 바이트를 뒤집어도 해시가 그대로였다 — **전 프레임의 우리 락업을 갈아도 조용했다.**
    //    경로 접두사는 「바이너리인가」의 대용이었고, 바이너리가 그 폴더 밖에 놓이는 순간 깨졌다.
    const authored = !rel.startsWith('assets/') && /\.(html|css|js|json|svg)$/i.test(rel);
    m[rel] = authored
      ? semanticHash(buf.toString('utf8'))
      : crypto.createHash('md5').update(buf).digest('hex');
  }
  return m;
}

// CLI:  node pipeline/lib/src-hash.mjs <hyperframes폴더>   → 지문 JSON 을 stdout 으로
if (import.meta.url === `file://${process.argv[1]}`) {
  const hf = process.argv[2];
  if (!hf) { console.error('usage: src-hash.mjs <hyperframes폴더>'); process.exit(2); }
  console.log(JSON.stringify(manifest(hf), null, 2));
}
