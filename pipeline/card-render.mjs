#!/usr/bin/env node
/* 카드 게시물 렌더 + 검수 — 완성된 영상을 인스타 캐러셀·스레드·유튜브 이미지 게시물용 카드로 (2026-10-08 사용자 지시)
 *
 *   node pipeline/card-render.mjs <p>
 *     projects/<p>/cards/NN-<이름>.html (01부터 빈 번호 없이, 1080×1350 정적 HTML)
 *     → projects/<p>/output/cards/NN.jpg  1080×1350(4:5) JPEG — 인스타 앱·API·스레드가 그대로 받는다(근거 07 K01)
 *     → projects/<p>/output/cards/sheet.png 전 장 + 맨 아래 첫 장의 프로필 그리드 칸(가운데 3:4)
 *     → 문제가 있으면 projects/<p>/output/cards/check.png  문제 장만, 하드는 빨강·경고는 주황 상자로 표시
 *
 *   node pipeline/card-render.mjs <p> --youtube   유튜브 이미지 게시물용 정사각 판 (2026-10-09 사용자 지시 — 유튜브는 1:1 권장, 4:5는 잘린다)
 *     projects/<p>/cards/youtube/NN-<이름>.html (1080×1080 — 4:5 판과 같은 장·같은 <h1>, 구도만 정사각으로 다시 짠다)
 *     → projects/<p>/output/cards/youtube/NN.jpg · sheet.png · check.png  (10장까지 · 프로필 그리드·인스타 장수 표시 규칙 없음)
 *
 * 🔴 카드는 한 장씩 오래 보인다 — 영상에서 지나가던 넘침·겹침이 그대로 티 난다(2026-10-08 사용자 지시
 *    「이미지는 한 장 한 장에 티가 크리티컬해 — 종합적으로 잡는 검수 단계 및 수정 단계」). 그래서 렌더와 검수를 한 번에 한다.
 *    **하드가 하나라도 있으면 납품 이미지(NN.jpg·sheet.png)를 만들지 않는다** — check.png 를 보고 모두 고친 뒤 다시 돌린다.
 *
 * 하드: 장수 2~20 밖 · 빈 번호 · 화면 글자의 출처·URL·크레딧(lib/source-ban) · 원격 자산 · 선언한 서체가 안 실림 ·
 *       글자가 카드 밖으로 나감 · 다른 글자 덩어리끼리 겹침 · 단어 한가운데 줄바꿈 · 첫 장 글자가 프로필 그리드 크롭(좌우 40px)에 걸림 ·
 *       글자가 그림 가장자리나 그림 속 경계(종이 끝·띠 — 글자 뒤 배경이 두 색으로 갈림)에 걸침
 * 경고: 11장 이상(유튜브 10장) · 첫 장에 README 포스터 글자 없음 · <h1> 없음 · 주의 표현(platforms.json banned_phrases) ·
 *       가장자리 40px · 인스타 장수 표시 구역(오른쪽 위) ·
 *       글자 뒤 배경 대비 3:1 미만(WCAG 큰 글자 — 배경의 밝은 쪽 10%로 잰다) · 한두 글자만 남은 줄 · 글자가 자기 상자를 넘침
 * 절차·디자인 정본은 .claude/skills/cards/SKILL.md 다. 자동 검수는 넘길 이유·위계를 판정하지 않는다 — 시트는 눈으로 본다.
 */
import {existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, mkdtempSync, writeFileSync} from 'node:fs';
import {execFileSync, spawn} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {resolveProject} from './lib/project.mjs';
import {readBeat} from './lib/hook.mjs';
import {sourceHits} from './lib/source-ban.mjs';

const YT = process.argv.includes('--youtube');   // 유튜브 정사각 판
const W = 1080, H = YT ? 1080 : 1350, MAX = YT ? 10 : 20, YT_MAX = 10, BYTES = 8 * 1024 * 1024, EDGE = 40, CONTRAST = 3;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const {dir: P, out: O, name} = resolveProject(process.argv[2], {usage: '사용: node pipeline/card-render.mjs <프로젝트> [--youtube]'});
const SRC_DIR = path.join(P, 'cards', ...(YT ? ['youtube'] : [])), OUT = path.join(O, 'cards', ...(YT ? ['youtube'] : []));
const bad = [], warn = [];   // 장 전체 단위 문제
const files = existsSync(SRC_DIR) ? readdirSync(SRC_DIR).filter((f) => /^\d{2}[^/]*\.html$/.test(f)).sort() : [];

if (files.length < 2) bad.push(`카드가 ${files.length}장이다 — ${YT ? 'cards/youtube/' : 'cards/'}01-*.html 부터 2장 이상(캐러셀은 2장부터)`);
if (files.length > MAX) bad.push(`카드가 ${files.length}장이다 — ${YT ? '유튜브' : '인스타·스레드'}는 ${MAX}장까지`);
files.forEach((f, i) => { if (+f.slice(0, 2) !== i + 1) bad.push(`번호가 비었다 — ${f} 자리에 ${String(i + 1).padStart(2, '0')}이 와야 한다`); });
if (!YT && files.length > YT_MAX) warn.push(`${files.length}장 — 유튜브 이미지 게시물은 ${YT_MAX}장까지라 앞 ${YT_MAX}장만 올라간다`);

// 화면 글자 = 태그·스크립트·스타일을 뺀 텍스트. 출처·URL·크레딧은 업로드 문안과 같은 패턴으로 막는다
const visible = (html) => html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ')
  .replace(/<\/?(?:em|b|strong|i|u|span|small|sup|sub)\b[^>]*>/gi, '').replace(/<br\s*\/?>|<\/(?:p|div|h\d|li)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const norm = (s) => String(s).toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '');
const SPECS = JSON.parse(readFileSync(path.join(HERE, 'lib', 'platforms.json'), 'utf8'));
const texts = {}, heads = {};
for (const f of files) {
  const html = readFileSync(path.join(SRC_DIR, f), 'utf8');
  texts[f] = visible(html);
  heads[f] = visible(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim();
  if (!heads[f]) warn.push(`${f} 에 <h1>이 없다 — 그 장의 가장 큰 글자를 <h1>에 둔다(대체 텍스트 대조)`);
  const hits = sourceHits(texts[f].split('\n'), {allowMusicCredit: false});
  if (hits.length) bad.push(`${f} 화면 글자에 출처·링크 — ${hits.slice(0, 3).join(' · ')} (출처는 README 확정 팩트에만)`);
  const remote = html.match(/(?:src|href)\s*=\s*["']\s*https?:[^"']*|url\(\s*["']?\s*https?:[^)"']*/i);
  if (remote) bad.push(`${f} 원격 자산 — ${remote[0].slice(0, 60)} (프로젝트 안 생성 이미지·코드 그래픽만 쓴다)`);
  const bait = (SPECS.banned_phrases ?? []).filter((b) => new RegExp(b.pattern, b.flags || '').test(texts[f].replace(/\s+/g, ' ')));
  if (bait.length) warn.push(`${f} 화면 글자에 주의 표현 — ${bait.map((b) => b.label).join(' · ')} (review §6 · 저장·공유 요청 대신 저장할 이유를)`);
}
// 유튜브 판은 4:5 판과 같은 장·같은 <h1>이다 — 문안의 대체 텍스트를 같이 쓴다
if (YT) {
  const base = existsSync(path.join(P, 'cards')) ? readdirSync(path.join(P, 'cards')).filter((f) => /^\d{2}[^/]*\.html$/.test(f)).sort() : [];
  if (base.length && files.length !== Math.min(base.length, YT_MAX)) warn.push(`유튜브 판 ${files.length}장 ↔ 4:5 판 ${base.length}장 — 같은 장을 정사각으로 다시 짠다(4:5가 11장 이상이면 앞 10장)`);
  files.forEach((f, i) => {
    const h = base[i] && visible(readFileSync(path.join(P, 'cards', base[i]), 'utf8').match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim();
    if (h && norm(h) !== norm(heads[f])) warn.push(`${f} <h1> 「${heads[f]}」이 4:5 판 ${base[i]} 「${h}」과 다르다 — 같은 대체 텍스트를 쓰려면 글자를 맞춘다`);
  });
}
// 첫 장 = 영상의 0초 포스터 — README 「주제 제목:」·「후킹:」 글자가 첫 장에 있는가(다르게 쓰면 이유를 README 「카드」 절에)
const beat = readBeat(existsSync(path.join(P, 'README.md')) ? readFileSync(path.join(P, 'README.md'), 'utf8') : '');
if (files[0] && beat.poster) for (const k of ['주제 제목', '후킹'])
  if (beat.poster[k] && !norm(texts[files[0]]).includes(norm(beat.poster[k])))
    warn.push(`첫 장에 README ${k} 「${beat.poster[k]}」 글자가 없다 — 첫 장은 영상의 0초 포스터다(다르게 쓴 이유를 README 「카드」 절에)`);
if (bad.length) { console.error(`✗ ${name} 카드 — 렌더하지 않았다\n  ❌ ${bad.join('\n  ❌ ')}`); process.exit(1); }

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(CHROME)) { console.error(`✗ Chrome 이 없다(${CHROME})`); process.exit(2); }
mkdirSync(OUT, {recursive: true});
for (const f of readdirSync(OUT)) if (/^\d{2}\.jpg$|^sheet\.png$|^check\.png$/.test(f)) rmSync(path.join(OUT, f));   // 옛 결과가 남아 통과처럼 보이지 않게
const tmp = mkdtempSync(path.join(os.tmpdir(), 'abm-cards-'));

/* ── 브라우저 한 개로 전 장을 재고 찍는다 (layout-scan 과 같은 CDP 방식 — 카드는 정적 파일이라 프리뷰 서버가 필요 없다) ── */
const PORT = 9900 + (process.pid % 90);
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--no-first-run',
  `--window-size=${W},${H}`, `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(tmp, 'profile')}`, 'about:blank'], {stdio: 'ignore'});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, msgId = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  // ⚠️ 시간 초과 타이머는 응답을 받으면 지운다 — 남겨 두면 일이 끝나도 프로세스가 60초를 더 산다(2026-10-08 실측)
  const id = ++msgId, timer = setTimeout(() => { if (pending.delete(id)) rej(new Error(`${method} 타임아웃`)); }, 60000);
  pending.set(id, {res: (v) => { clearTimeout(timer); res(v); }, rej: (e) => { clearTimeout(timer); rej(e); }});
  ws.send(JSON.stringify({id, method, params}));
});
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const shot = async (file) => writeFileSync(file, Buffer.from((await send('Page.captureScreenshot', {format: 'png', clip: {x: 0, y: 0, width: W, height: H, scale: 1}})).data, 'base64'));
const PROBE = readFileSync(path.join(HERE, 'lib', 'card-probe.js'), 'utf8');
const lum = ([r, g, b]) => { const c = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b); };
const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
// 글자 자리(잉크 상자)의 배경이 두 색 덩어리로 갈리는가 — 2-평균 묶음. 작은 쪽이 8% 이상이고 두 색이 RGB 거리 70 이상 떨어지면 갈린 것
function splitBackground(raw, r) {
  const px = [];
  for (let y = Math.max(0, Math.round(r.y)); y < Math.min(H, r.y + r.h); y += 2) for (let x = Math.max(0, Math.round(r.x)); x < Math.min(W, r.x + r.w); x += 2) {
    const o = (y * W + x) * 3; px.push([raw[o], raw[o + 1], raw[o + 2]]);
  }
  if (px.length < 20) return false;
  const L = (p) => p[0] * 0.299 + p[1] * 0.587 + p[2] * 0.114;
  let c = [px.reduce((a, p) => (L(p) < L(a) ? p : a)), px.reduce((a, p) => (L(p) > L(a) ? p : a))].map((p) => [...p]);
  let n = [0, 0];
  for (let it = 0; it < 6; it++) {
    const sum = [[0, 0, 0], [0, 0, 0]]; n = [0, 0];
    for (const p of px) {
      const k = (p[0] - c[0][0]) ** 2 + (p[1] - c[0][1]) ** 2 + (p[2] - c[0][2]) ** 2 <= (p[0] - c[1][0]) ** 2 + (p[1] - c[1][1]) ** 2 + (p[2] - c[1][2]) ** 2 ? 0 : 1;
      n[k]++; for (let j = 0; j < 3; j++) sum[k][j] += p[j];
    }
    c = c.map((cc, k) => (n[k] ? sum[k].map((v) => v / n[k]) : cc));
  }
  const dist = Math.hypot(c[0][0] - c[1][0], c[0][1] - c[1][1], c[0][2] - c[1][2]);
  return Math.min(...n) / px.length >= 0.08 && dist >= 70;
}
// 글자 둘레의 여유 띠(글자 크기의 8%, 최소 12px)에 글자 뒤 바탕과 다른 색이 들어오는가 — 획이 경계에 「닿은」 것도 걸친 것으로 본다.
//   글자 바로 아래만 재면 획이 종이 끝에 붙어 있어도 거의 종이색이라 통과한다(00069 달력 「12」의 「2」). 띠의 12% 이상이 바탕색에서
//   RGB 거리 70 이상 떨어지면 경계에 너무 붙었다.
function tightToEdge(raw, r) {
  const pad = Math.max(12, (r.size || 40) * 0.08);
  const inner = [], ring = [];
  for (let y = Math.max(0, Math.round(r.y - pad)); y < Math.min(H, r.y + r.h + pad); y += 2) for (let x = Math.max(0, Math.round(r.x - pad)); x < Math.min(W, r.x + r.w + pad); x += 2) {
    const o = (y * W + x) * 3, p = [raw[o], raw[o + 1], raw[o + 2]];
    (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h ? inner : ring).push(p);
  }
  if (inner.length < 20 || ring.length < 20) return false;
  const med = [0, 1, 2].map((j) => inner.map((p) => p[j]).sort((a, c) => a - c)[inner.length >> 1]);
  const far = ring.filter((p) => Math.hypot(p[0] - med[0], p[1] - med[1], p[2] - med[2]) >= 70).length;
  return far / ring.length >= 0.12;
}

const issues = {};   // 파일 → [{level, msg, rects}]
try {
  let list = null;
  for (let i = 0; i < 60 && !list; i++) { try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { await sleep(250); } }
  const page = (list || []).find((t) => t.type === 'page');
  if (!page) throw new Error('Chrome 페이지 타깃을 못 찾았다');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {width: W, height: H, deviceScaleFactor: 1, mobile: false});

  for (const [i, f] of files.entries()) {
    const found = issues[f] = [];
    const add = (level, msg, rects = []) => found.push({level, msg, rects});
    await send('Page.navigate', {url: pathToFileURL(path.join(SRC_DIR, f)).href});
    for (let k = 0; k < 80 && (await evaluate('document.readyState').catch(() => '')) !== 'complete'; k++) await sleep(100);
    await evaluate(`Promise.all([document.fonts.ready, ...[...document.images].map((im) => im.decode().catch(() => {}))]).then(() => true)`);
    const m = await evaluate(`${PROBE}\n;cardProbe(${W}, ${H})`);
    await shot(path.join(tmp, `${f.slice(0, 2)}.png`));

    // ── 하드 ──
    for (const fam of m.fonts) add('hard', `서체 「${fam}」가 안 실렸다 — 대체 서체로 그려진다(@font-face 경로·이름 확인)`);
    for (const b of m.blocks) {
      const out = b.rects.filter((r) => r.x < -1 || r.y < -1 || r.x + r.w > W + 1 || r.y + r.h > H + 1);
      if (out.length) add('hard', `「${b.text}」 글자가 카드 밖으로 나간다`, out);
    }
    for (let a = 0; a < m.blocks.length; a++) for (let c = a + 1; c < m.blocks.length; c++) {
      const hit = [];
      for (const ra of m.blocks[a].rects) for (const rc of m.blocks[c].rects)
        if (inter(ra, rc) > 0.15 * Math.min(ra.w * ra.h, rc.w * rc.h)) hit.push(ra, rc);
      if (hit.length) add('hard', `「${m.blocks[a].text}」 ↔ 「${m.blocks[c].text}」 글자끼리 겹친다`, hit);
    }
    for (const br of m.breaks) add('hard', `단어 한가운데서 줄이 바뀐다 「${br.text}」(…${br.around}…) — 한글은 word-break:keep-all, 아니면 <br>·글자 크기로 줄을 정한다`, [br]);
    // ── 가장자리: 첫 장은 프로필 그리드가 좌우를 약 34px 자른다 → 하드, 나머지는 경고 ──
    for (const b of m.blocks) {
      const e = b.rects.filter((r) => r.x < EDGE || r.x + r.w > W - EDGE);
      if (e.length) add(i === 0 && !YT ? 'hard' : 'warn', `「${b.text}」 글자가 가장자리 ${EDGE}px 안에 있다${i === 0 && !YT ? ' — 첫 장은 프로필 그리드에서 잘린다' : ''}`, e);
      const ig = YT ? [] : b.rects.filter((r) => r.x + r.w > W - 180 && r.y < 120);
      if (ig.length) add('warn', `「${b.text}」 글자가 인스타 장수 표시(오른쪽 위)에 가린다`, ig);
      if (b.orphan) add('warn', `「${b.text}」 마지막 줄에 「${b.orphan}」만 남는다 — 줄 나눔을 다시`, b.rects.slice(-1));
      if (b.overflow) add('warn', `「${b.text}」 글자가 자기 상자를 넘친다(${b.overflow.sw}>${b.overflow.cw}px)`, b.rects);
    }
    // ── 글자를 지운 화면 — 대비와 「글자 뒤 배경이 갈리는가」를 이 화면으로 잰다 ──
    await evaluate(`(() => { const s = document.createElement('style'); s.id = '__notext'; s.textContent = '*{color:transparent!important;text-shadow:none!important;-webkit-text-stroke:0!important}'; document.head.append(s); return true; })()`);
    const bare = path.join(tmp, `${f.slice(0, 2)}-bare.png`);
    await shot(bare);
    await evaluate(`(document.getElementById('__notext').remove(), true)`);
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', bare, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {maxBuffer: W * H * 3 + 1024});
    // ── 글자 ✕ 그림 (하드): 카드를 거의 덮는 배경 사진·로고는 빼고 소품·컷아웃 그림만 본다. 그림 뒤로 지나가게 놓은 글자(under)는 의도다.
    //    ① 그림 상자를 일부만 넘는 글자 = 그림 가장자리에 걸침
    //    ② 그림 상자 안이라도 글자 뒤 배경이 두 색으로 갈리면 그림 속 경계(종이 끝·띠·무늬)에 걸친 것이다 — 2026-10-08 ABM 00069 달력
    //       「12」의 「2」가 종이 끝을 넘어 받침에 걸쳤는데 ①만 보던 검사가 「그림 안 = 의도」로 통과시켰다(사용자 지적 「12가 걸쳤잖아」)
    const props = m.imgs.filter((im) => im.w * im.h < 0.6 * W * H && !/\/brand\//.test(im.src));
    for (const b of m.blocks) {
      const edge = [], split = [];
      for (const r of b.rects) for (const im of props) {
        const s = inter(r, im);
        if (r.under || s <= 0.2 * r.w * r.h) continue;
        if (s < 0.95 * r.w * r.h) edge.push(r);
        else if (splitBackground(raw, r) || tightToEdge(raw, r)) split.push(r);
      }
      if (edge.length) add('hard', `「${b.text}」 글자가 그림 가장자리에 걸친다 — 그림 안으로 넣거나 밖으로 뺀다`, edge);
      if (split.length) add('hard', `「${b.text}」 글자가 그림 속 경계(종이 끝·띠·무늬)에 걸치거나 너무 붙었다 — 글자 둘레까지 한 면이 되게 크기·자리를 줄인다`, split);
    }
    // ── 대비: 글자 자리 배경의 밝은 쪽 10% 와 글자 색 ──
    for (const b of m.blocks) {
      const lt = lum(rgb(b.color)), cs = [];
      for (const r of b.rects) for (let y = Math.max(0, Math.round(r.y)); y < Math.min(H, r.y + r.h); y += 3) for (let x = Math.max(0, Math.round(r.x)); x < Math.min(W, r.x + r.w); x += 3) {
        const o = (y * W + x) * 3, lb = lum([raw[o], raw[o + 1], raw[o + 2]]);
        cs.push((Math.max(lt, lb) + 0.05) / (Math.min(lt, lb) + 0.05));
      }
      if (!cs.length) continue;
      cs.sort((a, c) => a - c);
      const worst = cs[Math.floor(cs.length * 0.1)];
      if (worst < CONTRAST) add('warn', `「${b.text}」 글자 뒤 배경과 대비가 ${worst.toFixed(1)}:1 — 그라데이션·글자 색·자리를 바꾼다`, b.rects);
    }
    // ── 문제가 있으면 표시한 사본을 찍는다 ──
    if (found.length) {
      const boxes = found.flatMap((it) => it.rects.map((r) => ({x: r.x, y: r.y, w: r.w, h: r.h, c: it.level === 'hard' ? '#FF2D2D' : '#FF9F1C'})));
      await evaluate(`(() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none';
        for (const b of ${JSON.stringify(boxes)}) { const e = document.createElement('div'); e.style.cssText = 'position:absolute;left:'+(b.x-4)+'px;top:'+(b.y-4)+'px;width:'+(b.w+8)+'px;height:'+(b.h+8)+'px;border:6px solid '+b.c+';box-sizing:border-box'; d.append(e); }
        document.body.append(d); return true; })()`);
      await shot(path.join(tmp, `${f.slice(0, 2)}-check.png`));
    }
  }
} finally { try { ws?.close(); } catch {} try { chrome.kill(); } catch {} }

// 시트 — 216×270 칸 5열. grid=true 면 맨 아래에 첫 장의 프로필 그리드 칸(가운데 3:4, 180×240)
const tile = (pngs, out, grid) => {
  const C = Math.min(pngs.length, 5), R = Math.ceil(pngs.length / C), TW = 216, TH = Math.round(216 * H / W);
  const g = pngs.map((_, i) => `[${i}:v]scale=${TW}:${TH}[c${i}]`);
  g.push(pngs.length > 1 ? `${pngs.map((_, i) => `[c${i}]`).join('')}xstack=inputs=${pngs.length}:layout=${pngs.map((_, i) => `${(i % C) * TW}_${Math.floor(i / C) * TH}`).join('|')}:fill=0x111111[tiles]` : '[c0]null[tiles]');
  if (grid) g.push(`[${pngs.length}:v]crop=min(iw\\,ih*3/4):min(ih\\,iw*4/3),scale=180:240[grid]`, `[tiles]pad=${C * TW}:${R * TH + 240}:0:0:color=0x111111[tp]`, `[tp][grid]overlay=0:${R * TH}[o]`);
  else g.push('[tiles]null[o]');
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...[...pngs, ...(grid ? [pngs[0]] : [])].flatMap((f) => ['-i', f]), '-filter_complex', g.join(';'), '-map', '[o]', '-frames:v', '1', out]);
};

const all = files.flatMap((f) => issues[f].map((it) => ({...it, f})));
const hard = all.filter((it) => it.level === 'hard'), soft = all.filter((it) => it.level === 'warn');
const flagged = files.filter((f) => issues[f].length);
if (flagged.length) tile(flagged.map((f) => path.join(tmp, `${f.slice(0, 2)}-check.png`)), path.join(OUT, 'check.png'), false);
const line = (it) => `${it.f.slice(0, 2)} ${it.msg}`;
if (hard.length) {
  rmSync(tmp, {recursive: true, force: true});
  console.error(`✗ ${name} 카드 검수 — 하드 ${hard.length}건 · 경고 ${soft.length}건. 납품 이미지를 만들지 않았다\n  ❌ ${hard.map(line).join('\n  ❌ ')}${soft.length ? `\n  ⚠️ ${soft.map(line).join('\n  ⚠️ ')}` : ''}`);
  console.error(`  표시 시트 ${path.relative(P, path.join(OUT, 'check.png'))} (문제 장만 · 빨강 하드 · 주황 경고) — 모두 모아 한 번에 고치고 다시 돌린다 (cards 스킬 「수정」)`);
  process.exit(1);
}
for (const f of files) {
  const jpg = path.join(OUT, `${f.slice(0, 2)}.jpg`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(tmp, `${f.slice(0, 2)}.png`), '-q:v', '2', jpg]);
  const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', jpg], {encoding: 'utf8'}).trim().split(',').map(Number);
  if (w !== W || h !== H) bad.push(`${f} → ${w}×${h} (${W}×${H} 이어야 한다)`);
  if (statSync(jpg).size > BYTES) bad.push(`${f} → ${(statSync(jpg).size / 1048576).toFixed(1)}MB (8MB 까지)`);
}
tile(files.map((f) => path.join(OUT, `${f.slice(0, 2)}.jpg`)), path.join(OUT, 'sheet.png'), !YT);
rmSync(tmp, {recursive: true, force: true});
if (bad.length) { console.error(`✗ ${name} 카드\n  ❌ ${bad.join('\n  ❌ ')}`); process.exit(1); }

console.log(`  카드 ${files.length}장 → ${path.relative(P, OUT)}/01.jpg … ${String(files.length).padStart(2, '0')}.jpg (${W}×${H} JPEG) · 검수 하드 0 · 경고 ${soft.length + warn.length}
  시트 ${path.relative(P, path.join(OUT, 'sheet.png'))}${YT ? '' : ' — 맨 아래 칸은 첫 장의 프로필 그리드(가운데 3:4)'}${flagged.length ? `\n  표시 시트 ${path.relative(P, path.join(OUT, 'check.png'))} — 경고가 난 장만(주황)` : ''}`);
console.log('  장마다 가장 큰 글자(<h1>) — 대체 텍스트에 그대로 담는다\n' + files.map((f) => `    ${f.slice(0, 2)} 「${heads[f] || '—'}」`).join('\n'));
if (warn.length || soft.length) console.log('  ⚠️ ' + [...warn, ...soft.map(line)].join('\n  ⚠️ '));
console.log('  → 경고는 고치거나, 의도면 README 「카드」 절에 이유를 적는다. 시트를 직접 열어 판정한다(cards 스킬 6): 첫 장이 그리드 칸에서도 넘길 이유를 주나 · 둘째 장이 혼자 읽히나 · 장마다 가장 큰 글자가 그 장의 요점인가 · 마지막 장에 저장할 이유가 있나');
