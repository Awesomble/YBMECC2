#!/usr/bin/env node
// 업로드 문안 검사 — projects/<p>/publish.md 가 플랫폼 하드 규격 안에 있는지 잰다.
// 사용: node pipeline/publish-check.mjs <프로젝트>
//
// **글자수는 눈으로 못 센다.** 제목이 피드에서 잘리거나 해시태그가 상한을 넘으면 그대로 나간다.
// 규격의 정본은 `pipeline/lib/platforms.json` 하나다 — 스킬 문서와 이 검사기가 같은 파일을 본다
// (숫자를 두 곳에 적으면 갈라진다 — docs/02-pitfalls.md §15).
//
// publish.md 형식 (/review 스킬이 이 형식으로 쓴다):
//   ## <플랫폼키>            ← youtube · instagram · tiktok · x · carousel(카드 원본 cards/NN-*.html 이 있는 편만)
//                            threads 는 platforms.json crosspost.since 이후 「작성」이면 쓰지 않는다 — 인스타 캡션이 페이스북·스레드에 그대로 간다(ABMEN 2026-10-20~)
//   ### 설명|캡션|본문       ```로 감싼 첫 블록이 실제 붙여 넣을 문자열 (해시태그 포함)
//   유튜브는 블록 첫 줄이 곧 제목이다 — 제목 끝 해시태그·본문 문장 속 해시태그를 따로 잰다 (2026-09-25)
//   ### 댓글                 본문 아래 첫 댓글 1개 (2026-09-29 사용자 지시) — 해시태그 없음·URL 없음·플랫폼 간 중복 없음.
//                            publish.md 의 「작성 YYYY-MM-DD」가 platforms.json comment.required_since 보다 이르면 소급하지 않는다(없으면 경고만)
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveProject } from './lib/project.mjs';
import { MON, LICENSE, sourceHits } from './lib/source-ban.mjs';
// YBMECC 학원 광고(2026-10-20) — 기본 게시처 밖 플랫폼은 선택, 문안의 법정 표시·금지 표현은 lib/academy.mjs 가 잰다
import { ACADEMY, academyReport, platformRequired } from './lib/academy.mjs';
import { igCta } from './lib/ig-cta.mjs';

const { dir, name } = resolveProject(process.argv[2], { usage: '사용: node pipeline/publish-check.mjs <프로젝트>' });
// ⚠️ new URL(...).pathname 은 한글·공백 경로를 퍼센트 인코딩된 채로 준다 — fileURLToPath 를 쓴다 (pitfalls §8)
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SPECS = JSON.parse(readFileSync(path.join(HERE, 'lib', 'platforms.json'), 'utf8'));
const FILE = path.join(dir, 'publish.md');
if (!existsSync(FILE)) {
  console.error(`✗ ${FILE} 없음 — 먼저 /review ${name}`);
  process.exit(1);
}
const md = readFileSync(FILE, 'utf8');
// 묶음 롱폼(docs/channel/08-longform.md §8)은 유튜브 롱폼 한 곳에만 올린다 — 나머지 넷은 숏츠가 이미 맡았다.
//   유튜브만 필수로 재고, 설명란 챕터가 hf-export 의 output/chapters.txt 와 같은지 본다 (2026-09-26)
const CUTS = existsSync(path.join(dir, 'cuts.json')) ? JSON.parse(readFileSync(path.join(dir, 'cuts.json'), 'utf8')) : null;
const BUNDLE = CUTS?.orientation === 'landscape' && CUTS?.bundle?.version === 1;

const OK = '✅', WARN = '⚠️', BAD = '❌';
// 문안 작성일 — 댓글처럼 나중에 생긴 규칙을 옛 문안에 소급하지 않으려고 읽는다
const WRITTEN = (md.match(/작성\s*(\d{4}-\d{2}-\d{2})/) || [])[1] ?? null;
const fresh = (since, w = WRITTEN) => !!since && !!w && w >= since;   // 그 규칙 시행일 이후에 쓴 문안인가
// 인스타 → 페이스북·스레드 교차 게시 (2026-10-20 사용자 지시) — 인스타 캡션이 그대로 스레드 글이 된다. 규격은 platforms.json crosspost
const XP = fresh(SPECS.crosspost?.since) ? SPECS.crosspost : null;
const comments = [];   // [플랫폼 라벨, 댓글 문자열, 본문 첫 줄] — 플랫폼 간 중복은 끝에서 한 번에 잰다
const legacyMissing = new Set();   // 「작성」이 규칙 시행일보다 이른 문안에서 빠진 블록 — 소급하지 않는다
const rows = [];
const add = (p, k, v, std, verdict) => rows.push([p, k, String(v), std, verdict]);
const gate = (c, w = null) => (c ? OK : w === null ? BAD : w ? WARN : BAD);

// 플랫폼 절 → 그 안의 ### 소제목 → 첫 코드블록
// ⚠️ `\Z`(문자열 끝)는 JS 정규식에 없다 — 리터럴 Z 로 읽혀 마지막 절이 통째로 안 잡힌다 (2026-09-07 실사고).
//    `(?![\s\S])` 가 JS 에서 문자열 끝이다. `$` 는 m 플래그에서 줄 끝이라 쓰면 안 된다.
const sections = {};
for (const m of md.matchAll(/^##[ \t]+([a-z]+)\b[^\n]*\n([\s\S]*?)(?=\n##[ \t]|(?![\s\S]))/gm)) sections[m[1]] = m[2];
// 소제목이 <head> 로 시작하는 **모든** 블록(소제목마다 코드블록 하나가 원칙 — 둘이면 경고).
const blocks = (body, head) =>
  [...body.matchAll(new RegExp(`###\\s+(${head}[^\\n]*)\\n+\`\`\`[^\\n]*\\n([\\s\\S]*?)\`\`\``, 'g'))]
    .map((m) => ({ label: m[1].trim(), text: m[2].replace(/\n+$/, '') }));
const block = (body, head) => blocks(body, head)[0]?.text ?? null;
// 한 줄 = 한 글자로 세지 않는다. 이모지·한글은 코드포인트로 (JS length 는 서로게이트를 2로 센다)
const len = (s) => [...s].length;
// ⚠️ X 는 **가중 글자수**를 센다 — 한글·CJK·이모지는 2, URL 은 길이와 무관하게 23, 미디어는 0.
//    plain 코드포인트로 세면 X 에서만 한참 넘친다 (280 예산 = 한글 약 140자).
const CJK = /[\u1100-\u11FF\u2E80-\u303F\u3040-\u30FF\u3130-\u318F\u3400-\u4DBF\u4E00-\u9FFF\uA960-\uA97F\uAC00-\uD7FF\uF900-\uFAFF\uFF00-\uFF60]/;
const EMOJI = /\p{Extended_Pictographic}/u;
const weighted = (s, w) => {
  if (!w) return len(s);
  const urls = s.match(/https?:\/\/\S+/g) ?? [];
  let total = urls.length * (w.url ?? 23);
  for (const ch of s.replace(/https?:\/\/\S+/g, ''))
    total += CJK.test(ch) ? (w.cjk ?? 2) : EMOJI.test(ch) ? (w.emoji ?? 2) : 1;
  return total;
};
// ⚠️ 스레드는 **이모지를 UTF-8 바이트로** 센다(공식) — 📍 하나가 4자, ❤️ 6자, 🇰🇷 8자. 그 밖의 글자·공백·줄바꿈은 1.
//    이모지는 글자 묶음(grapheme) 단위로 본다 — 피부색·ZWJ·국기·키캡이 한 묶음이다
const SEG = new Intl.Segmenter('en', { granularity: 'grapheme' });
const EMOJI_G = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u;
const threadsCount = (s) => {
  let n = 0, emoji = 0, bytes = 0;
  for (const { segment: g } of SEG.segment(s)) {
    if (EMOJI_G.test(g)) { const b = Buffer.byteLength(g, 'utf8'); n += b; emoji++; bytes += b; }
    else n += [...g].length;
  }
  return { n, emoji, bytes };
};
// 복붙 블록의 공백·줄바꿈 (platforms.json whitespace) — 인스타는 줄 끝 공백 뒤 줄바꿈을 지우고 빈 줄 여러 개를 하나로 합친다(C),
//   공백도 스레드 500자에 든다. 펜스 직전 줄바꿈 하나는 블록의 일부가 아니다
const ODD_SPACE = /[\u00A0\u2000-\u200C\u2028\u2029\u202F\u205F\u2060\u3000\uFEFF\u2800]/;
const wsIssues = (raw) => {
  const out = [], L = raw.replace(/\n$/, '').split('\n');
  const at = (test) => L.map((l, i) => (test(l, i) ? i + 1 : 0)).filter(Boolean);
  const put = (name, ns) => { if (ns.length) out.push(`${name} ${ns.slice(0, 4).join('·')}줄${ns.length > 4 ? ` 외 ${ns.length - 4}` : ''}`); };
  if (/\r/.test(raw)) out.push('CR(\\r)');
  if (L[0] === '') out.push('첫 줄이 빈 줄');
  if (L.length > 1 && L.at(-1) === '') out.push('끝 줄이 빈 줄');
  put('줄 끝 공백', at((l) => /[ \t]$/.test(l)));
  put('줄 앞 공백', at((l) => /^[ \t]+\S/.test(l)));
  put('탭', at((l) => /\t/.test(l)));
  put('연속 공백', at((l) => /\S {2,}/.test(l)));
  put('빈 줄 연속', at((l, i) => i > 0 && l === '' && L[i - 1] === ''));
  put('특수·보이지 않는 공백', at((l) => ODD_SPACE.test(l)));
  put('이모지 밖 U+200D', at((l) => [...SEG.segment(l)].some(({ segment: g }) => g.includes('\u200D') && !EMOJI_G.test(g))));
  return out;
};

// 카드 게시물(cards 스킬) — 카드 원본 cards/NN-*.html 이 있는 편만 `## carousel` 절을 요구한다 (2026-10-08)
const CARDS = existsSync(path.join(dir, 'cards')) ? readdirSync(path.join(dir, 'cards')).filter((f) => /^\d{2}[^/]*\.html$/.test(f)) : [];
// 인스타 CTA 판(video SKILL 「인스타 CTA 판」) — cuts.json `ig_cta` {link, keyword, reward}(2026-10-20~ 자막 아래 스티커, ig-cta.mjs — ABM 판 이식).
//   `## dm` 절(Awesomble LINK 에 붙일 글)을 요구한다. 키워드 = ig_cta.keyword(기본 「링크」·지도 링크는 「지도」 — lib/ig-cta.mjs).
//   옛 방식(마지막 컷 frame `-ig-cta`)은 YBMECC 에 만들어진 편이 없고 새로 만들지 않는다. 학원은 제휴(수수료) 링크가 없어 「광고」 칩·표시 검사가 없다
const IG_CFG = igCta(CUTS), IG_CTA = IG_CFG ? { id: 'ig_cta', ...IG_CFG } : null;
const IG_KW = IG_CFG?.keyword?.trim() || null;
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 앱이 댓글을 단어 단위(글자·숫자 묶음)로 찾는다 — 문안의 키워드도 앞뒤가 글자에 붙지 않은 한 단어여야 시청자가 그대로 친다
const hasWord = (t, w) => !!w && new RegExp(`(?<![\\p{L}\\p{N}])${esc(w)}(?![\\p{L}\\p{N}])`, 'iu').test(t);

for (const [key, base] of Object.entries(SPECS.platforms)) {
  const spec = BUNDLE && key === 'youtube' ? { ...base, label: '유튜브 롱폼' } : base;
  const body = sections[key];
  if (!body && BUNDLE && key !== 'youtube') continue;
  if (!body && spec.only_with_cards && !CARDS.length) continue;
  if (!body && !spec.only_with_cards && !spec.only_with_ig_cta && !platformRequired(key)) continue;   // brand.json platforms 밖 — 없으면 요구하지 않는다
  if (spec.only_with_ig_cta) {
    if (!IG_CTA) { if (body) add(spec.label, '절', '있음', '영상에 인스타 CTA(cuts.json ig_cta)가 없다 — 영상이 약속하지 않은 DM 이다', WARN); continue; }
    if (!body && (!WRITTEN || WRITTEN < spec.required_since)) { legacyMissing.add(`## ${key} 절|${spec.required_since}`); continue; }
  }
  if (fresh(spec.crossposted_since)) {   // 스레드 — 인스타 캡션이 그대로 간다. 따로 쓴 절은 올릴 곳이 없다
    if (body) add(spec.label, '절', '있음', `${spec.crossposted_since}~ 인스타 교차 게시로 올린다 — 이 절을 쓰지 않는다 (platforms.json crosspost)`, WARN);
    continue;
  }
  if (body && spec.only_with_cards) {
    const alts = blocks(body, spec.fields.alt?.heading ?? '대체 텍스트');
    add(spec.label, '카드 수 ↔ 대체 텍스트', `${CARDS.length}장 · ${alts.length}개`, '카드마다 대체 텍스트 하나 (cards/NN-*.html)', gate(CARDS.length > 0 && alts.length === CARDS.length, true));
    // 대체 텍스트는 그 카드의 가장 큰 글자(<h1>)를 담는다 — 화면 글자를 못 읽는 사람·검색이 같은 약속을 받는다 (cards 스킬)
    const flat = (t) => t.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '');
    const miss = CARDS.map((f, i) => {
      const h1 = readFileSync(path.join(dir, 'cards', f), 'utf8').match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&') ?? '';
      const alt = alts.find((a) => a.label.endsWith(f.slice(0, 2)))?.text ?? '';
      return h1 && alt && !flat(alt).includes(flat(h1)) ? f.slice(0, 2) : null;
    }).filter(Boolean);
    add(spec.label, '대체 텍스트 ↔ 카드 큰 글자', miss.length ? `빠짐 ${miss.join('·')}` : '모두 담음', '각 대체 텍스트에 그 카드의 <h1> 글자를 그대로', miss.length ? WARN : OK);
    // 같은 계정의 릴스 캡션과 같은 첫 줄이면 두 게시물이 같은 글로 보인다 — 카드는 다른 각도로
    const reel = (block(sections.instagram ?? '', '캡션') ?? '').split('\n')[0], card = (block(body, spec.fields.instagram?.heading ?? '캡션') ?? '').split('\n')[0];
    if (reel && card) add(spec.label, '캐러셀 첫 줄 ↔ 릴스 첫 줄', flat(reel) === flat(card) ? '같음' : '다름', '같은 계정 — 카드 첫 줄은 첫 장의 약속을 다른 말로', flat(reel) === flat(card) ? WARN : OK);
  }
  if (!body) { add(spec.label, '절', '없음', `## ${key} 절이 있어야 한다`, BAD); continue; }
  if (BUNDLE && key === 'youtube') {
    // YouTube 챕터: 0:00 부터 3개 이상, 각 10초 이상 — 값은 hf-export 가 낸 목록을 그대로 쓴다 (08 §6)
    const cf = path.join(dir, 'output', 'chapters.txt');
    const want = existsSync(cf) ? readFileSync(cf, 'utf8').trim().split('\n').filter(Boolean) : [];
    const text = block(body, '설명') ?? '';
    const miss = want.filter((l) => !text.split('\n').some((t) => t.trim() === l.trim()));
    add(spec.label, '설명란 챕터', want.length ? `${want.length - miss.length}/${want.length}줄` : 'chapters.txt 없음',
      'output/chapters.txt 와 같은 줄 — 0:00 시작 (node pipeline/hf-export.mjs)', gate(want.length > 0 && !miss.length));
  }

  // 카드 절은 영상 문안보다 늦게 붙기도 한다 — 그 절 머리의 「작성」 날짜가 있으면 그 날짜로 판정한다(ABMEN 00120: 영상 문안 10-19 · 카드 10-20)
  const SW = spec.only_with_cards ? ((body.match(/작성\s*(\d{4}-\d{2}-\d{2})/) || [])[1] ?? WRITTEN) : WRITTEN;
  const SXP = fresh(SPECS.crosspost?.since, SW) ? SPECS.crosspost : null;
  for (const [field, rule] of Object.entries(spec.fields)) {
    if (field === 'hashtags') continue; // 아래에서 따로 센다
    if (fresh(rule.crossposted_since, SW)) {   // 카드 게시물의 스레드 본문·답글 — 인스타 캐러셀을 공유한다
      if (blocks(body, rule.heading).length) add(spec.label, rule.heading, '있음', `${rule.crossposted_since}~ 인스타 캐러셀을 스레드에 공유한다 — 이 블록을 쓰지 않는다`, WARN);
      continue;
    }
    const found = blocks(body, rule.heading);
    if (!found.length) {
      const legacy = rule.required_since && (!WRITTEN || WRITTEN < rule.required_since);
      if (legacy) { legacyMissing.add(`${rule.heading}|${rule.required_since}`); continue; }   // 옛 문안은 끝에 한 줄로만 알린다
      add(spec.label, rule.heading, '없음', rule.required ? '코드블록이 있어야 한다' : '선택', rule.required ? BAD : WARN);
      continue;
    }
    if (rule.comment && found.length > 1) add(spec.label, `${rule.heading} 수`, `${found.length}개`, '플랫폼마다 1개', WARN);
    if (rule.variants && found.length < rule.variants)
      add(spec.label, `${rule.heading} 안`, `${found.length}개`, `${rule.variants}안 — 서로 다른 유형으로 (A/B 재료)`, WARN);
    for (const { label, text } of found) {
      const n = weighted(text, rule.weight);
      const shown = rule.weight ? `${n}자(가중) · 실제 ${len(text)}자` : `${n}자`;
      if (rule.max) add(spec.label, `${label} 길이`, shown, `≤ ${rule.max}자 (하드 상한)${rule.weight ? ' — 한글은 2로 센다' : ''}`, gate(n <= rule.max));
      if (rule.crosspost && SXP) {
        // 🔴 이 블록이 그대로 페이스북·스레드 글이 된다 — 스레드 셈(이모지 = UTF-8 바이트)으로 500자, 해시태그·줄바꿈 포함
        const t = threadsCount(text);
        add(spec.label, `${label} → 스레드 길이`, `${t.n}자${t.emoji ? ` (이모지 ${t.emoji}개 = ${t.bytes}자)` : ''}`,
          `≤ ${SXP.threads_max}자 — 해시태그·공백·줄바꿈 포함, 이모지는 UTF-8 바이트로 센다 (${SXP.max_grade})`, gate(t.n <= SXP.threads_max));
        // 해시태그는 글자·숫자·밑줄만 — 문장부호가 붙으면 태그가 거기서 끊긴다. 첫 유효 태그 하나만 스레드 토픽이 된다
        const tg = text.match(/#[^\s#]+/g) ?? [], valid = (x) => /^#[\p{L}\p{N}_]+$/u.test(x) && !/^#\d+$/.test(x);
        const broken = tg.filter((x) => !/^#[\p{L}\p{N}_]+$/u.test(x));
        if (broken.length) add(spec.label, `${label} 해시태그 글자`, broken.join(' '), '글자·숫자·밑줄만 — 문장부호·기호가 붙으면 태그가 거기서 끊긴다', BAD);
        const topic = tg.find(valid), tt = SXP.topic_tag;
        add(spec.label, `${label} → 스레드 토픽`, topic ?? '없음',
          `첫 유효 해시태그 하나만 토픽이 된다 — ${tt.min}~${tt.max}자, 숫자만은 태그가 아니다. 가장 넓게 찾을 말을 맨 앞에 (${tt.grade})`,
          !topic || [...topic.slice(1)].length > tt.max ? BAD : tg[0] !== topic ? WARN : OK);
      }
      if (rule.hashtags) {
        // 한 절에 여러 플랫폼 글이 있는 카드 게시물 — 블록마다 그 플랫폼의 해시태그 규칙을 센다
        const h = rule.hashtags, tg = text.match(/#[^\s#]+/g) ?? [], low = tg.map((x) => x.toLowerCase());
        add(spec.label, `${label} 해시태그`, `${tg.length}개`, `${h.min}~${h.max}개${h.hard_max != null ? ` (하드 상한 ${h.hard_max})` : ''}${h.note ? ` — ${h.note}` : ''}`,
          gate(tg.length >= h.min && tg.length <= h.max, h.hard_max != null ? tg.length <= h.hard_max : false));
        const dupT = tg.filter((x, i) => low.indexOf(low[i]) !== i);
        if (dupT.length) add(spec.label, `${label} 중복 해시태그`, dupT.join(' '), '같은 블록 안에서 중복 없이 (대소문자 무시)', BAD);
      }
      if (rule.title) {
        // 🔴 첫 줄 = 제목. 끝에 핵심 해시태그, 본문 문장 안에도 해시태그 (2026-09-25 사용자 지시)
        const [title, ...rest] = text.split('\n');
        const t = rule.title;
        add(spec.label, '제목(첫 줄) 길이', `${len(title)}자`, `≤ ${t.max}자 — 해시태그 포함 (${t.max_grade})`, gate(len(title) <= t.max));
        const tt = title.match(/#[^\s#]+/g) ?? [];
        if (t.hashtags) add(spec.label, '제목 해시태그', `${tt.length}개`, `${t.hashtags.min}~${t.hashtags.max}개 — 제목 끝에 (${t.hashtags.grade})`,
          tt.length < t.hashtags.min ? BAD : tt.length <= t.hashtags.max ? OK : WARN);
        if (/#[^\s#]+/.test(title.replace(/(\s+#[^\s#]+)+\s*$/, '')))
          add(spec.label, '제목 해시태그 위치', '중간에 있음', '훅·핵심어는 앞, 해시태그는 끝', WARN);
        const bi = rule.body_inline_hashtags;
        if (bi) {
          const inline = rest.filter((l) => l.trim() && !/^\s*(#[^\s#]+\s*)+$/.test(l)).join('\n').match(/#[^\s#]+/g) ?? [];
          add(spec.label, '본문 문장 속 해시태그', `${inline.length}개`, `≥ ${bi.min}개 — 문장 안에 자연스럽게, 키워드 나열 금지 (${bi.grade})`, gate(inline.length >= bi.min));
        }
      }
      if (rule.visible) {
        // ⚠️ 접힘 글자수는 **전 플랫폼이 비공개**다 — 전부 추정치라 실패로 찍지 않는다 (경고까지)
        const first = text.split('\n')[0];
        add(spec.label, `${label} 첫 줄`, `${weighted(first, rule.weight)}자`,
          `${rule.visible}자에서 접힌다 (${rule.visible_grade ?? '추정'}) — 앞에 핵심을`,
          weighted(first, rule.weight) <= rule.visible ? OK : WARN);
      }
      if (rule.recommend_max && n > rule.recommend_max)
        add(spec.label, `${label} 권장 길이`, `${n}자`, `권장 ≤ ${rule.recommend_max}자 (${rule.recommend_grade ?? '추론'})`, WARN);
      if (rule.comment) {
        // 댓글은 채널의 목소리 — 검색·분류(해시태그)·유입(링크)은 본문이 맡는다 (review 스킬 §7)
        if (!text.trim()) add(spec.label, `${label} 내용`, '비었음', '영상의 한 장면·대사를 붙잡은 한마디', BAD);
        const ht = text.match(/#[^\s#]+/g) ?? [];
        if (rule.no_hashtags && ht.length) add(spec.label, `${label} 해시태그`, ht.join(' '), '0개 — 해시태그는 본문에만', BAD);
        // 링크는 아래 「출처·링크」 공통 검사가 전 블록에서 실패로 막는다 (2026-10-02 — 댓글도 출처 링크 자리가 아니다)
        const em = [...text].filter((ch) => EMOJI.test(ch)).length;
        if (rule.emoji_max != null && em > rule.emoji_max) add(spec.label, `${label} 이모지`, `${em}개`, `선택 · 0~${rule.emoji_max}개 권장`, WARN);
        const bodyHead = Object.values(spec.fields).find((f) => !f.comment && f.heading !== 'hashtags' && f.heading !== '해시태그')?.heading;
        const first = bodyHead ? (block(body, bodyHead) ?? '').split('\n')[0] : '';
        comments.push([spec.label, text, first]);
      }
    }
  }

  if (spec.only_with_ig_cta) {
    // LINK 앱 칸 — 키워드는 영상과 같은 말, 링크 버튼은 이름만(주소는 사용자가), 공개 답글은 서로 다른 3줄 이상
    const F = spec.fields, lines = (h) => (block(body, h) ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
    const kws = lines(F.keyword.heading).join(',').split(',').map((k) => k.trim()).filter(Boolean);
    add(spec.label, '키워드 ↔ 영상', kws.length ? kws.join(', ') : '없음', `영상 스티커의 키워드 ${IG_KW ?? '(cuts.json 에서 못 찾음)'}를 담는다 — 흔한 변형은 쉼표로`,
      IG_KW && kws.some((k) => k.toLowerCase() === IG_KW.toLowerCase()) ? OK : BAD);
    const links = lines(F.links.heading), long = links.filter((l) => len(l) > F.links.line_max);
    add(spec.label, '링크 버튼', `${links.length}개${long.length ? ` · ${F.links.line_max}자 넘음: ${long.join(' / ')}` : ''}`,
      `1~${F.links.lines_max}개, 한 줄에 버튼 이름 하나(≤${F.links.line_max}자) — 주소는 사용자가 앱에서 넣는다`, gate(links.length >= 1 && links.length <= F.links.lines_max && !long.length));
    const reps = lines(F.replies.heading), dupR = reps.length - new Set(reps.map((r) => r.toLowerCase())).size;
    add(spec.label, '공개 답글', `${reps.length}줄${dupR ? ` · 중복 ${dupR}` : ''}`, `${F.replies.lines_min}줄 이상, 서로 다르게 — 같은 문구 반복은 인스타가 막을 수 있다`,
      reps.length >= F.replies.lines_min && !dupR ? OK : WARN);
    // 제휴 링크를 DM 으로 보내는 채널(platforms.json affiliate — ABMKTEM)은 DM 내용 첫 줄에 고지한다. 제휴가 아닌 보상이면 무시해도 된다
    if (SPECS.affiliate?.disclosure) {
      const first = (block(body, F.content.heading) ?? '').split('\n')[0];
      add(spec.label, '내용 첫 줄 제휴 고지', new RegExp(SPECS.affiliate.disclosure, 'i').test(first) ? '있음' : '없음', '보상이 제휴 링크면 첫 줄에 고지(링크와 분리 금지) — 제휴가 아니면 무시', new RegExp(SPECS.affiliate.disclosure, 'i').test(first) ? OK : WARN);
    }
    continue;
  }

  // 해시태그 — ⚠️ 첫 안만 세면 A안 3개·B안 6개가 통과한다 (2026-09-08). 모든 안 중 **가장 많은 것**으로 판정
  const tagBlocks = blocks(body, spec.fields.hashtags?.heading ?? '해시태그');
  // 해시태그는 별도 절에도, 본문 블록 안에도 있을 수 있다 (복붙 전용 형식 — 한 번에 붙여넣게 본문에 합쳐 둔다)
  // 유튜브는 제목 줄의 태그를 따로 셌으므로 설명 집합에서 뺀다 — 제목 태그가 설명에 다시 나와도 중복이 아니다
  const titleHead = Object.values(spec.fields).find((f) => f.title)?.heading;
  const titleTags = [];
  const inlineTagText = [...blocks(body, '설명'), ...blocks(body, '캡션'), ...blocks(body, '본문')]
    .map((b) => {
      if (!titleHead || !b.label.startsWith(titleHead)) return b.text;
      const [first, ...rest] = b.text.split('\n');
      titleTags.push(...(first.match(/#[^\s#]+/g) ?? []));
      return rest.join('\n');
    }).join('\n');
  const tagSource = tagBlocks.length ? tagBlocks.map((b) => b.text) : (inlineTagText ? [inlineTagText] : ['']);
  const tagSets = tagSource.map((t) => t.match(/#[^\s#]+/g) ?? []);
  const tags = tagSets.reduce((a, b) => (b.length > a.length ? b : a), []);
  const h = spec.hashtags;
  if (h) {
    add(spec.label, `해시태그 수${titleHead ? ' (설명)' : ''}`, `${tags.length}개`, `${h.min}~${h.max}개${h.hard_max ? ` (하드 상한 ${h.hard_max})` : ''}`,
      gate(tags.length >= h.min && tags.length <= h.max, h.hard_max ? tags.length <= h.hard_max : false));
    // 해시태그는 대소문자를 구분하지 않는다 — #Korea 와 #korea 는 같은 태그다
    const low = tags.map((t) => t.toLowerCase());
    const dup = tags.filter((t, i) => low.indexOf(low[i]) !== i);
    if (dup.length) add(spec.label, '중복 해시태그', dup.join(' '), '같은 블록 안에서 중복 없이 (대소문자 무시)', BAD);
    const union = new Set([...titleTags, ...tags].map((t) => t.toLowerCase()));
    if (titleHead && h.hard_max && union.size > h.hard_max)
      add(spec.label, '제목+설명 해시태그', `${union.size}개`, `≤ ${h.hard_max}개 — 넘으면 전부 무시된다 (${h.hard_max_grade})`, BAD);
    if (h.required_tag && !tags.some((t) => t.toLowerCase() === h.required_tag.toLowerCase()))
      add(spec.label, '필수 태그', `${h.required_tag} 없음`, h.required_reason ?? '', WARN);
  }
}

// 댓글 — 플랫폼마다 서로 달라야 하고(교차 게시 뒤 넷), 본문 첫 줄을 되풀이하지 않는다 (review 스킬 §7)
{
  const norm = (t) => t.toLowerCase().replace(/#[^\s#]+/g, '').replace(/\p{Extended_Pictographic}|[^a-z0-9가-힣]/gu, '');   // 해시태그·이모지·문장부호만 다른 문장은 같은 문장이다
  for (const [label, text, first] of comments)
    if (first && norm(text) && norm(text) === norm(first.replace(/(\s+#[^\s#]+)+\s*$/, '')))
      add(label, '댓글 ↔ 본문 첫 줄', '같음', '댓글은 본문과 다른 한마디 — 첫 줄을 되풀이하지 않는다', WARN);
  const seen = new Map();
  for (const [label, text] of comments) {
    const k = norm(text);
    if (!k) continue;
    if (seen.has(k)) add('공통', '댓글 중복', `${seen.get(k)} = ${label}`, '플랫폼마다 형식·각도를 바꾼다', WARN);
    else seen.set(k, label);
  }
  if (comments.length) add('공통', '댓글', `${comments.length}개`, '플랫폼마다 1개 — 새 사실·가짜 체험·참여 구걸은 눈으로 본다', OK);
}
for (const k of legacyMissing) { const [head, since] = k.split('|'); add('공통', head, `없음 (작성 ${WRITTEN ?? '표기 없음'})`, `${since} 이전 문안 — 소급하지 않는다. 다시 쓸 때 추가`, WARN); }

// 댓글 키워드 → 자동 DM 약속은 인스타에서만 지킬 수 있다 — Awesomble LINK 는 인스타 댓글만 받는다 (video SKILL 「인스타 CTA 판」 2026-10-19).
//   CTA 판이면 인스타 캡션·고정 댓글이 영상과 같은 키워드를 말해야 하고, 다른 넷은 본편(스티커 없는 판)이라 약속이 없어야 한다
{
  const pasted = (key) => [...(sections[key] ?? '').matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]).join('\n');
  // DM 약속은 대소문자 무관, 키워드 갈래는 「댓글(comment) … 키워드」 한 단어 그대로 — 영어 키워드면 대소문자를 구분해 「see the map」 같은 보통 영어를 약속으로 잡지 않는다(ABMEN)
  const dmRe = /\bDMs?\b|디엠/iu;
  const kwRe = IG_KW ? new RegExp(`(?:[Cc][Oo][Mm][Mm][Ee][Nn][Tt]|댓글)[^\\n]{0,15}(?<![\\p{L}\\p{N}])${esc(IG_KW)}(?![\\p{L}\\p{N}])`, 'u') : null;
  for (const key of ['youtube', 'tiktok', 'threads', 'x']) {
    if (!sections[key]) continue;
    const text = pasted(key), hit = text.match(dmRe)?.[0] ?? (kwRe && text.match(kwRe)?.[0]);
    if (hit || IG_CTA) add(SPECS.platforms[key]?.label ?? key, '댓글→DM 약속', hit ? `「${hit}」` : '없음',
      '🔴 자동 DM은 인스타에서만 돈다 — 다른 플랫폼은 스티커 없는 본편을 올리고 문안에도 약속하지 않는다', hit ? BAD : OK);
  }
  if (IG_CTA) {
    const ig = sections.instagram ?? '', cap = block(ig, '캡션') ?? '', com = block(ig, '댓글') ?? '';
    add('인스타그램', 'CTA 키워드', IG_KW ? `${IG_KW} — 캡션 ${hasWord(cap, IG_KW) ? '있음' : '없음'} · 댓글 ${hasWord(com, IG_KW) ? '있음' : '없음'}` : 'cuts.json 에서 못 찾음',
      `영상 CTA(${IG_CTA.id})의 키워드를 캡션과 고정 댓글이 한 단어 그대로 되풀이한다 — 첫 줄에 두는지는 review 「인스타 CTA 판 문안」대로 사람이 본다`, IG_KW && hasWord(cap, IG_KW) && hasWord(com, IG_KW) ? OK : BAD);
  }
}

// 공백·줄바꿈 — 전 플랫폼·전 복붙 블록, 줄 번호로 (platforms.json whitespace · 2026-10-20 사용자 「길이·줄바꿈·공백까지 철저히」)
//   시행일 이후 「작성」은 실패, 그 전 문안은 경고만 — 이미 올린 문안을 소급해 막지 않는다
{
  const WS = SPECS.whitespace, verdict = fresh(WS?.since) ? BAD : WARN;
  let n = 0, dirty = 0;
  for (const [key, sec] of Object.entries(sections))
    for (const m of sec.matchAll(/###[ \t]+([^\n]*)\n+```[^\n]*\n([\s\S]*?)```/g)) {
      n++;
      const issues = wsIssues(m[2]);
      if (!issues.length) continue;
      dirty++;
      add(BUNDLE && key === 'youtube' ? '유튜브 롱폼' : SPECS.platforms[key]?.label ?? key, `${m[1].trim()} 공백·줄바꿈`, issues.join(' · '),
        `${WS?.rules?.join(' · ') ?? '줄 끝·줄 앞 공백, 연속 공백·빈 줄, 특수 공백 없음'}${verdict === WARN ? ` — ${WS?.since} 이전 문안은 경고만` : ''}`, verdict);
    }
  if (!dirty) add('공통', '공백·줄바꿈', `${n}블록 깨끗`, '줄 끝·줄 앞 공백, 탭, 연속 공백·빈 줄, 특수 공백 없음', OK);
}

// publish.md 에는 있는데 platforms.json 에 규격이 없는 절 — 조용히 검사에서 새면 안 된다
for (const key of Object.keys(sections))
  if (!SPECS.platforms[key])
    add('공통', `${key} 절`, '규격 없음', 'platforms.json 에 이 플랫폼을 추가하거나 절을 빼라 — 지금은 검사되지 않는다', WARN);

// 전 플랫폼 공통 — 사실 표기
{
  const all = Object.values(sections).join('\n');
  // ⚠️ 영어 패턴은 flags:"i" 가 있어야 대소문자를 넘어 잡힌다. flags 를 무시하면 영어 문안이 통째로 샌다.
  const banned = SPECS.banned_phrases.filter((b) => new RegExp(b.pattern, b.flags || '').test(all));
  add('공통', '주의 표현', banned.length ? banned.map((b) => b.label).join(' · ') : '없음',
    '조건 없는 단정·최상급·허위 긴급성 (platforms.json · 한국어+영어 패턴)', banned.length ? WARN : OK);
  // ABMEN 문안은 영어로 직접 쓴다 (docs/channel/04-format-voice.md §3). 한글이 섞였으면 의도한 원어 병기인지 확인한다.
  //    (ABM 의 「나레이션 옛말 어휘」 검사는 한국어 문안 전용이라 2026-09-25 에 이것으로 바꿨다)
  const pasted = [...md.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]).join('\n'); // 소제목(### 설명)은 빼고 붙여 넣을 글만
  const hangul = [...new Set(pasted.match(/[가-힣]+/g) ?? [])];
  add('공통', '한글 표기', hangul.length ? hangul.slice(0, 5).join(' · ') : '없음',
    '영어 문안 — 한국어 원어를 병기할 때만 쓴다', hangul.length ? WARN : OK);
  // 날짜 — 한국어(9월 24일)와 영어(24 September 2026 · Sep 24, 2026 · 2026-09-24)를 모두 읽는다.
  //    ⚠️ 옛 정규식은 한국어만 읽어 영어 문안 18편 전부에 「날짜 없음」 오경고를 냈다 (2026-09-25 실측)
  const DATE = new RegExp(`(\\d{1,2})월\\s*(\\d{1,2})일|\\b\\d{1,2}\\s+(?:${MON})\\.?(?:,?\\s+\\d{4})?\\b|\\b(?:${MON})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b`, 'g');
  const dates = [...new Set([...all.matchAll(DATE)].map((m) => m[0].replace(/\s+/g, ' ')))];
  // 날짜가 없는 것은 결함이 아니다 — 옛 경고가 「Sources checked <date>」 줄을 넣게 유도했다 (2026-10-02)
  add('공통', '날짜 표기', dates.length ? dates.join(' · ') : '없음',
    'README 확정 팩트와 대조 — 사실의 일부인 날짜만. 확인일은 쓰지 않는다', OK);

  // 🔴 출처·확인일·URL·도메인 금지 — 전 플랫폼·전 블록(설명·캡션·본문·댓글) (2026-10-02 사용자 지시:
  //    "내용 생성시 소스관련 내용은 안넣도록 … 왜 자꾸 소스와 소스링크를 넣는건데"). 출처는 README 확정 팩트에만 둔다.
  //    예외는 CC BY 곡의 라이선스 표기 한 줄뿐(review 스킬 「BGM 크레딧」) — 출처 인용이 아니라 이용 조건이다.
  //    패턴은 lib/source-ban.mjs 한 곳에 있다 — 카드 이미지(card-render)도 같은 패턴을 쓴다.
  // CC BY 크레딧 줄은 CC BY 곡을 사용자가 허락한 경우(bgm.credit_required)만 예외다.
  // 이미지·사진의 저작자 표시는 금지 — 소재를 생성 이미지로 바꾼다 (2026-10-02 사용자 지시 · pitfalls §163)
  let musicCredit = false;
  try { musicCredit = !!JSON.parse(readFileSync(path.join(dir, 'hyperframes', 'audio_meta.json'), 'utf8')).bgm?.credit_required; } catch {}
  for (const [key, sec] of Object.entries(sections)) {
    const label = BUNDLE && key === 'youtube' ? '유튜브 롱폼' : SPECS.platforms[key]?.label ?? key;
    const lines = [...sec.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].flatMap((m) => m[1].split('\n'));
    const hits = sourceHits(lines);   // BGM(CC BY 곡) 크레딧 줄은 lib/source-ban 이 뺀다
    add(label, '출처·링크', hits.length ? hits.slice(0, 3).map((h) => h.slice(0, 40)).join(' · ') : '없음',
      '🔴 문안에 출처·확인일·URL·도메인 금지 — README 확정 팩트에만 (review 스킬 맨 위 절)', hits.length ? BAD : OK);
    const lic = musicCredit ? [] : lines.filter((l) => LICENSE.test(l));
    add(label, '저작자 표시', lic.length ? lic[0].trim().slice(0, 40) : '없음',
      '🔴 CC BY 등 저작자 표시가 필요한 소재 금지 — 이미지는 생성 이미지로 대체 (CC BY 곡은 bgm.credit_required 일 때만)', lic.length ? BAD : OK);
  }
}

// 🏫 학원 광고 — 문안(⑥) 줄만 싣는다(대본·화면·사진은 stage-gate·academy-check 가 잰다)
if (ACADEMY) for (const r of academyReport(dir, 6).filter((x) => /^문안 |^지점 사실/.test(x.msg)))
  add('학원 광고', r.msg.split(' — ')[0], r.msg.split(' — ').slice(1).join(' — ') || '있음', r.fix ?? '', r.level === 'hard' ? BAD : r.level === 'soft' ? WARN : OK);

const W = [0, 1, 2].map((i) => Math.max(...rows.map((r) => [...r[i]].length)));
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - [...s].length));
console.log(`\n  업로드 문안 검사 — ${name}\n`);
let last = '';
for (const [p, k, v, std, verdict] of rows) {
  console.log(`  ${verdict} ${pad(p === last ? '' : p, W[0])} ${pad(k, W[1])}  ${pad(v, W[2])}  │ ${std}`);
  last = p;
}
const nBad = rows.filter((r) => r[4] === BAD).length;
const nWarn = rows.filter((r) => r[4] === WARN).length;
console.log(`\n  ${nBad ? BAD : nWarn ? WARN : OK} 실패 ${nBad} · 경고 ${nWarn} · 통과 ${rows.filter((r) => r[4] === OK).length}`);
console.log(`  ⚠️ 규격은 플랫폼이 바꾼다 — platforms.json 의 checked 날짜가 오래됐으면 다시 확인하라\n`);
process.exit(nBad ? 2 : 0);
