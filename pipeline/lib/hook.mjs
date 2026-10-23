// 첫 3초 비트 — README 「첫 3초 비트」 읽기와 핵심어 시각 (video SKILL 「최우선 — 첫 1·2·3초」 · 2026-10-03)
// hook-check.mjs 와 stage-gate.mjs 가 같은 판정을 쓴다. 내용의 질은 판정하지 않는다 — 칸이 찼는지·시각이 맞는지만 본다.
//
// 「핵심어:」는 대사 표기를 적고, 전사·자막이 다르게 쓰는 숫자·가격은 `|` 로 함께 적는다
//   ABMEN `seventy-four dollars | $74` — whisper(en)는 읽은 숫자를 「$74.」처럼 숫자로 적는다 (ABMEN 00045 실측)
//   ABM   `삼천 원 | 3000원` — whisper(ko)는 「삼천」처럼 읽은 대로, 루트 자막은 「3,000원」처럼 숫자로 쓴다 (ABM 00056·00057 실측)
import {readFileSync} from 'node:fs';
import path from 'node:path';

export const BEAT_ROWS = ['0.0초', '0~1초', '정점', '~3초'];
export const BEAT_SINCE = '2026-10-04';   // 이날부터 생성한 프로젝트는 비트 절이 필수 (10-03 생성분은 도입 전 골격일 수 있다)
// 0초 포스터 — 첫 장면 한 장에 주제·디자인·후킹이 모두 들어간다 (2026-10-06 사용자 지시 「첫장면 디자인은 무조건 포스터 느낌으로
//   이 영상의 주제를 모두 파악할수 있는 디자인으로부터 시작하도록 강력하게 강제」). 정본: video SKILL 「최우선」 0.0초 포스터 행.
//   주제 제목·후킹은 화면에 쓰는 글자 그대로, 키 비주얼은 주연·무대·맥락 재료를 한 줄로. 00055(10-05 생성)까지는 소급하지 않는다.
export const POSTER_SINCE = '2026-10-06';
export const POSTER_KEYS = ['주제 제목', '후킹', '키 비주얼'];
// 0초 글자의 하한(1080 기준) — 폰 폭 390pt 에서 약 40pt, 프로필 그리드 3:4 칸(폰 폭 1/3)에서도 읽힌다. 후킹은 제목보다 크다.
//   2026-10-21 사용자 「제일 작은 폰트 크기를 좀 더 크게」 — 그 전 9편의 제목은 62~106px 였다
export const POSTER_MIN_PX = 110;
const norm = (s) => String(s).toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '');
const strip = (s) => s.replace(/^[\s*`"“'‘]+|[\s*`"”'’]+$/g, '');

export function readBeat(readme) {
  const created = readme.match(/생성 (\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
  const lines = readme.split('\n');
  const h = lines.findIndex((l) => /^#+\s*첫 3초 비트/.test(l));
  const posterRequired = !!created && created >= POSTER_SINCE;
  if (h < 0) return { present: false, required: !!created && created >= BEAT_SINCE, created, posterRequired, poster: {}, posterEmpty: posterRequired ? POSTER_KEYS : [] };
  let end = lines.findIndex((l, i) => i > h && /^#{1,3}\s/.test(l));
  if (end < 0) end = lines.length;
  const sec = lines.slice(h + 1, end);
  const rows = Object.fromEntries(BEAT_ROWS.map((t) => {
    const l = sec.find((x) => x.trim().startsWith(`| ${t}`));
    return [t, l ? l.split('|').slice(2, -1).map((s) => strip(s)).filter((s) => s && !/^[-—–·.]+$/.test(s)) : []];
  }));
  const empty = BEAT_ROWS.filter((t) => rows[t].length < 3);
  const raw = sec.map((l) => l.match(/^\s*\**\s*핵심어\s*\**\s*[:：]\s*(.*?)\s*$/)?.[1]).find((v) => v !== undefined) ?? '';
  const keywords = strip(raw).split('|').map(strip).filter(Boolean);
  const poster = Object.fromEntries(POSTER_KEYS.map((k) => [k, strip(sec.map((l) => l.match(new RegExp(`^\\s*[-*]?\\s*\\**${k}\\**\\s*[:：]\\s*(.*?)\\s*$`))?.[1]).find((v) => v !== undefined) ?? '')]));
  // 글자·숫자가 없는 값(「$?!」)은 빈칸이다 — 소스 대조가 빈 문자열로 늘 참이 된다
  const posterEmpty = posterRequired ? POSTER_KEYS.filter((k) => !norm(poster[k]) || /^[<(（]/.test(poster[k])) : [];
  return { present: true, required: true, created, rows, empty, keywords, keyword: keywords.join(' | '), posterRequired, poster, posterEmpty };
}

const alts = (k) => (Array.isArray(k) ? k : String(k).split('|')).map(strip).filter(Boolean);

// 전사 어절에서 핵심어가 처음 시작하는 시각. whisper 는 「3,200」을 「3」「,200」으로 쪼개기도 해서 어절을 이어 붙여
// **정확히 같을 때만** 맞다고 본다(접두어 일치는 「free」가 「freedom」에 걸린다).
// 한국어는 조사가 붙는다(「공짜」 ↔ 「공짜로」) — 핵심어가 한글·숫자로 끝나면 뒤에 붙은 한글 1~3자까지 허용한다.
const particle = (target, acc) => /[가-힣0-9]$/.test(target) && acc.startsWith(target) && /^[가-힣]{1,3}$/.test(acc.slice(target.length));
export function keywordOnset(words, keyword) {
  let best = null;
  for (const k of alts(keyword)) {
    const target = norm(k);
    if (!target) continue;
    for (let i = 0; i < words.length; i++) {
      if (!norm(words[i].t)) continue;
      let acc = '', j = i;
      for (; j < words.length && acc.length < target.length; j++) acc += norm(words[j].t);
      if (acc === target || particle(target, acc)) { if (!best || words[i].s < best.s) best = { s: words[i].s, e: words[j - 1].e, text: words.slice(i, j).map((w) => w.t).join(' '), alt: k }; break; }
    }
  }
  return best;
}

export const hasKeyword = (text, keyword) => alts(keyword).some((k) => !!norm(k) && norm(text).includes(norm(k)));
// 대사(say) 안에서 핵심어 대체 표기 중 처음 나오는 것의 위치 — 무료 say 추정용
export function keywordInSay(say, keyword) {
  const low = String(say).toLowerCase();
  return alts(keyword).map((k) => ({ k, i: low.indexOf(k.toLowerCase()) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i)[0] ?? null;
}

// 0초 포스터의 주제 제목·후킹 글자가 첫 장면 소스에 실제로 있는가 — 0초에 그 글자가 보이는지는 시트(눈)로 본다.
// 루트 index.html 과 data-start 0 에 마운트된 컴포지션(자막 제외)의 마크업에서 태그를 걷어 글자·숫자만 비교한다
// (「478<span> m</span>」 → 478m). 스크립트가 넣는 글자는 못 찾는다 — 포스터 글자는 마크업에 둔다(stage-gate ④ 하드).
export function posterInSource(hfDir, poster) {
  const read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };
  const index = read(path.join(hfDir, 'index.html'));
  const srcs = [...index.matchAll(/<[^>]*data-composition-src="([^"]+)"[^>]*>/g)]
    .filter((m) => /data-start="0(?:\.0+)?"/.test(m[0]) && !/data-composition-id="captions"/.test(m[0])).map((m) => m[1]);
  const text = norm([index, ...srcs.map((s) => read(path.join(hfDir, s)))].join(' ')
    .replace(/<head[\s\S]*?<\/head>|<title[\s\S]*?<\/title>|<!--[\s\S]*?-->/gi, ' ')   // 문서 제목·주석의 slug 는 화면 글자가 아니다
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&'));
  return { files: srcs, missing: ['주제 제목', '후킹'].filter((k) => !norm(poster?.[k]) || !text.includes(norm(poster[k]))) };
}

// 0초 포스터 글자 크기 — 첫 장면 소스에서 제목·후킹 글자를 담은 요소의 font-size(px)를 정적으로 읽는다 (2026-10-21).
//   인라인 style 이 먼저, 없으면 조상 요소의 class 에 대한 <style> 규칙(px). 못 읽으면 null — 판정은 소프트(측정 못 함도 알린다)
export function posterFontSizes(hfDir, poster) {
  const read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };
  const index = read(path.join(hfDir, 'index.html'));
  const srcs = [...index.matchAll(/<[^>]*data-composition-src="([^"]+)"[^>]*>/g)]
    .filter((m) => /data-start="0(?:\.0+)?"/.test(m[0]) && !/data-composition-id="captions"/.test(m[0])).map((m) => m[1]);
  const files = [...srcs.map((s) => read(path.join(hfDir, s))), index];
  const out = {};   // 키마다 {min, max} — 후킹처럼 여러 크기로 쪼갠 글자는 가장 작은 조각이 하한 판정, 가장 큰 조각이 위계 판정
  for (const k of ['주제 제목', '후킹']) {
    const want = norm(poster?.[k] || '');
    out[k] = null;
    if (!want) continue;
    for (const html of files) { const px = textFontSizes(html, want); if (px.length) { out[k] = {min: Math.min(...px), max: Math.max(...px)}; break; } }
  }
  return out;
}
export const fmtPx = (v) => v == null ? '?' : v.min === v.max ? `${v.min}px` : `${v.min}~${v.max}px`;
const VOID = /^(br|img|hr|input|meta|link|source|path|circle|rect|line|use|stop|ellipse|polygon|polyline|wbr)$/i;
function tagFontSize(attrs, styles) {
  const inline = attrs.match(/style="[^"]*?font-size:\s*([\d.]+)px/i);
  if (inline) return +inline[1];
  const cls = attrs.match(/class="([^"]+)"/);
  if (cls) for (const c of cls[1].split(/\s+/).filter(Boolean)) {
    const rule = styles.match(new RegExp(`\\.${c.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}(?![\\w-])[^{]*\\{[^}]*?font-size:\\s*([\\d.]+)px`));
    if (rule) return +rule[1];
  }
  const id = attrs.match(/\bid="([^"]+)"/);
  if (id) { const rule = styles.match(new RegExp(`#${id[1].replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}(?![\\w-])[^{]*\\{[^}]*?font-size:\\s*([\\d.]+)px`)); if (rule) return +rule[1]; }
  return null;
}
function textFontSizes(html, want) {
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  const body = html.replace(/<head[\s\S]*?<\/head>/i, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g;
  const stack = [], found = []; let m;
  while ((m = re.exec(body))) {
    if (m[4] !== undefined) {
      const t = norm(m[4].replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&'));
      if (t.length >= Math.min(5, want.length) && want.includes(t))
        for (let i = stack.length - 1; i >= 0; i--) { const px = tagFontSize(stack[i], styles); if (px != null) { found.push(px); break; } }
    } else if (m[1]) stack.pop();
    else if (!VOID.test(m[2]) && !/\/\s*$/.test(m[3])) stack.push(m[3]);
  }
  return found;
}
