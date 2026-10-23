#!/usr/bin/env node
/* 웹페이지 판독 — 클라우드플레어 Browser Rendering (2026-09-16 Awesomble 에서 이식)
 *
 * WebFetch 가 **본문을 못 읽을 때** 쓴다. WebFetch 는 정적 HTML 만 받아서
 * JS 로 그리는 페이지는 네비게이션만 돌려준다 (힉스필드 가격표 실측: 2,205자 → 36,497자).
 *
 * 🔴 `gotoOptions.waitUntil=networkidle0` 이 기본값인 이유가 그것이다 — 원본 스킬엔 이 옵션이 없었다.
 *
 *   node pipeline/cf-crawl.mjs <url>                  단일 페이지 → 마크다운 (기본)
 *   node pipeline/cf-crawl.mjs <url> --full           전문을 화면에 (기본은 머리 2000자 + 파일)
 *   node pipeline/cf-crawl.mjs <url> --crawl -l 30    사이트 순회 (비동기 · 폴링)
 *
 * 자격증명은 pipeline/.env.local 의 CLOUDFLARE_ACCOUNT_ID · CLOUDFLARE_API_TOKEN.
 * 🔴 값을 출력하거나 커밋하지 마라.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const A = process.argv.slice(2);
const has = (...f) => f.some((x) => A.includes(x));
const val = (...f) => { for (const x of f) { const i = A.indexOf(x); if (i >= 0 && A[i + 1]) return A[i + 1]; } return null; };
const die = (m) => { console.error(`✗ ${m}`); process.exit(2); };

const url = A.find((a) => /^https?:\/\//.test(a));
if (!url) die('사용: node pipeline/cf-crawl.mjs <url> [--crawl] [-l N] [--full] [-o 파일] [--wait ms] [--selector css]');

/* ── 자격증명 ── */
function creds() {
  let id = process.env.CLOUDFLARE_ACCOUNT_ID, tok = process.env.CLOUDFLARE_API_TOKEN;
  const env = path.join(HERE, '.env.local');
  if ((!id || !tok) && existsSync(env)) {
    const s = readFileSync(env, 'utf8');
    id ||= (s.match(/^CLOUDFLARE_ACCOUNT_ID=(.+)$/m) || [])[1]?.trim();
    tok ||= (s.match(/^CLOUDFLARE_API_TOKEN=(.+)$/m) || [])[1]?.trim();
  }
  if (!id || !tok) die('pipeline/.env.local 에 CLOUDFLARE_ACCOUNT_ID · CLOUDFLARE_API_TOKEN 이 필요하다\n'
    + '  → dash.cloudflare.com/profile/api-tokens 에서 "Browser Rendering - Edit" 권한으로 발급');
  return { id, tok };
}
const { id: ACCT, tok: TOKEN } = creds();
const API = `https://api.cloudflare.com/client/v4/accounts/${ACCT}/browser-rendering`;

async function cf(endpoint, body, method = 'POST', soft = false) {
  const opt = { method, headers: { Authorization: `Bearer ${TOKEN}` } };
  if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch(`${API}${endpoint}`, opt);
    const j = await r.json().catch(() => ({ success: false, errors: [{ message: `HTTP ${r.status}` }] }));
    if (j.success) return j.result;
    const msg = (j.errors || []).map((e) => `${e.code ?? ''} ${e.message}`).join(' · ');
    if (soft) return { __err: msg };
    // 일시 오류만 재시도한다 — 권한·본문 오류는 즉시 알린다
    if (attempt < 3 && /429|50\d|timeout|temporar/i.test(msg)) { await new Promise((s) => setTimeout(s, 3000 * attempt)); continue; }
    die(`클라우드플레어 응답: ${msg || '알 수 없는 오류'}`);
  }
}

const slug = (u) => u.replace(/^https?:\/\//, '').replace(/[^\w.-]+/g, '_').replace(/^_|_$/g, '').slice(0, 110);
const OUTDIR = val('-o', '--out') || path.join(ROOT, 'output', 'crawl');

/* ── ① 단일 페이지 — /markdown 은 동기다. 이게 기본 ── */
/* 🔴 대기 조건 사다리. networkidle0 가 제일 많이 담아 오지만 무거운 페이지에선 6002 타임아웃이 난다.
      한 조건만 쓰면 「빈 본문」이나 「실패」 둘 중 하나로 끝난다 — 되는 데까지 내려간다. */
const LADDER = [
  ['networkidle0', null],
  ['networkidle2', null],
  ['domcontentloaded', 4000],
];

async function single() {
  const wait = Number(val('--wait')) || 30000;
  const sel = val('--selector');
  let md = null, used = null;

  for (const [until, settle] of LADDER) {
    const body = { url, gotoOptions: { waitUntil: until, timeout: wait } };
    if (settle) body.waitForTimeout = settle;
    if (sel) body.waitForSelector = { selector: sel, timeout: wait };
    if (has('--light')) body.rejectResourceTypes = ['image', 'media', 'font'];
    const r = await cf('/markdown', body, 'POST', true);
    if (typeof r === 'string') { md = r; used = until + (settle ? `+${settle}ms` : ''); break; }
    console.error(`  ↓ ${until} 실패 (${r.__err}) — 다음 조건으로`);
  }
  if (md === null) die('세 조건 모두 실패했다 — --selector 로 본문 요소를 지정하거나 --wait 를 늘려라');

  const dest = /\.md$/.test(OUTDIR) ? OUTDIR : path.join(OUTDIR, `${slug(url)}.md`);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, `<!-- 출처: ${url} · 판독 ${new Date().toISOString().slice(0, 10)} · 대기 ${used} -->\n\n${md}`);

  console.error(`✔ ${md.length.toLocaleString()}자 · 대기 ${used} · ${path.relative(ROOT, dest)}`);
  if (md.length < 1500) console.error('⚠️ 본문이 짧다 — 로그인·쿠키 벽일 수 있다. --selector 로 본문 요소를 기다려 봐라');
  console.log(has('--full') ? md : md.slice(0, 2000) + (md.length > 2000 ? `\n\n… (${md.length - 2000}자 더 — 전문은 위 파일, 또는 --full)` : ''));
}

/* ── ② 사이트 순회 — /crawl 은 비동기다 ── */
async function crawl() {
  const opts = {};
  const inc = val('--include'); if (inc) opts.includePatterns = inc.split(',').map((s) => s.trim());
  const exc = val('--exclude'); if (exc) opts.excludePatterns = exc.split(',').map((s) => s.trim());
  const body = {
    url, limit: Number(val('-l', '--limit')) || 10, formats: ['markdown'],
    render: !has('--no-render'), source: val('--source') || 'all',
  };
  const depth = Number(val('-d', '--depth')); if (depth) body.depth = depth;
  if (Object.keys(opts).length) body.options = opts;

  const job = await cf('/crawl', body);
  console.error(`▶ 작업 ${job} — ${body.limit}쪽 · render=${body.render}`);

  let st;
  for (let i = 0; i < 240; i++) {
    await new Promise((s) => setTimeout(s, 5000));
    st = await cf(`/crawl/${job}?limit=1`, null, 'GET');
    process.stderr.write(`\r  ${st.status} ${st.finished}/${st.total}   `);
    if (st.status !== 'running') break;
  }
  process.stderr.write('\n');
  if (st.status !== 'completed') console.error(`⚠️ 상태 ${st.status} — 받은 것까지만 저장한다`);

  const dir = path.join(OUTDIR, slug(new URL(url).host));
  mkdirSync(dir, { recursive: true });
  let cursor = null, n = 0; const merged = [];
  for (;;) {
    const q = `/crawl/${job}?status=completed&limit=50${cursor ? `&cursor=${cursor}` : ''}`;
    const r = await cf(q, null, 'GET');
    const recs = r.records || [];
    if (!recs.length) break;
    for (const rec of recs) {
      const md = rec.markdown || ''; if (!md) continue;
      writeFileSync(path.join(dir, `${slug(rec.url)}.md`), `<!-- 출처: ${rec.url} -->\n\n${md}`);
      merged.push(`\n\n<!-- ── ${rec.url} ── -->\n\n${md}`); n++;
    }
    cursor = r.cursor; if (!cursor) break;
  }
  if (has('--merge') && merged.length) writeFileSync(path.join(dir, '_merged.md'), merged.join(''));

  /* 🔴 0쪽으로 끝나면 이유를 말해라. 「완료 ✔ 0쪽」만 내면 성공으로 읽힌다 (2026-09-16 실측:
        --no-render 로 mcst.go.kr 를 긁으니 레코드가 status=errored 였는데 게이트가 조용했다) */
  if (!n) {
    const all = await cf(`/crawl/${job}?limit=50`, null, 'GET');
    const tally = {};
    for (const rec of all.records || []) tally[rec.status || '?'] = (tally[rec.status || '?'] || 0) + 1;
    console.error(`✗ 저장된 쪽이 없다 — 레코드 상태: ${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(' · ') || '없음'}`);
    if (tally.errored) console.error('  → --no-render 는 정적 fetch 라 막는 사이트가 많다. 빼고 다시 돌려라');
    if (tally.disallowed) console.error('  → robots.txt 가 막았다. /crawl 은 robots 를 지킨다');
    process.exit(1);
  }
  console.error(`✔ ${n}쪽 → ${path.relative(ROOT, dir)}/ · 브라우저 ${st.browserSecondsUsed ?? '?'}초 사용 (무료 한도 하루 600초)`);
}

await (has('--crawl') ? crawl() : single());
