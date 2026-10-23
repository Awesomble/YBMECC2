#!/usr/bin/env node
/* 키워드 — 시청자가 **실제로 치는 영어 표현**을 유튜브·구글 자동완성으로 찾는다
 * (2026-09-16 Awesomble `scripts/keyword-research.ts`·`keyword-validate.ts` 에서 이식 ·
 *  2026-09-25 ABMEN 영어·유튜브 검색 기준으로 교체 — 옛판은 한국어·한국 지역 구글 제안만 봤다)
 *
 * 자동완성은 표현 후보이며 검색량 측정값이 아니다. 제안 없음은 수요 없음의 증거가 아니다.
 *
 *   node pipeline/keyword.mjs "tipping in korea" "korea tipping culture"   후보별 유튜브·구글 제안
 *   node pipeline/keyword.mjs --expand "korea tipping"                     a~z·질문어로 확장해 실제 표현을 캔다
 *   옵션  --src=yt|web|both (기본 both) · --gl=us,gb (기본 us) · --hl=en (기본 en, ko 면 자음 확장) · --all (관련성 필터 끔)
 *
 * 🔴 유튜브 제안(ds=yt)과 구글 웹 제안은 다르다 — 2026-09-25 실측 "korea tax refund":
 *    유튜브에만 "for foreigners"·"kiosk"가 나왔다. 쇼츠 제목·해시태그는 유튜브 제안을,
 *    인스타 캡션(구글 색인)은 웹 제안을 함께 본다.
 */
const URL_AC = 'https://suggestqueries.google.com/complete/search';
const DELAY = 1200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const A = process.argv.slice(2);
const opt = (k, d) => (A.find((x) => x.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const EXPAND = A.includes('--expand');
const HL = opt('hl', 'en');
const GLS = opt('gl', 'us').split(',').filter(Boolean);
const SRC = opt('src', 'both');
const SOURCES = SRC === 'both' ? ['yt', 'web'] : [SRC];
const NAME = { yt: '유튜브', web: '구글' };
const seeds = A.filter((x) => !x.startsWith('--'));
if (!seeds.length || SOURCES.some((s) => !NAME[s])) {
  console.error('사용: node pipeline/keyword.mjs "<후보>" ...  ·  --expand "<시드>"  [--src=yt|web|both] [--gl=us,gb] [--hl=en] [--all]');
  process.exit(2);
}

/* 🔴 한국어 응답은 **EUC-KR** 로 올 수 있다 — Content-Type 의 charset 을 읽어 디코딩한다 (원본 스크립트가 남긴 교훈). */
async function ac(q, src, gl) {
  let r;
  const ds = src === 'yt' ? '&ds=yt' : '';
  try { r = await fetch(`${URL_AC}?client=firefox&hl=${HL}&gl=${gl}${ds}&q=${encodeURIComponent(q)}`, {signal:AbortSignal.timeout(10000)}); } catch { return null; }
  if (!r.ok) return null;
  const cs = ((r.headers.get('content-type') || '').match(/charset=([^\s;]+)/i) || [])[1] || 'utf-8';
  const buf = Buffer.from(await r.arrayBuffer());
  let txt; try { txt = new TextDecoder(cs).decode(buf); } catch { txt = buf.toString('utf8'); }
  try { return JSON.parse(txt)[1] || []; } catch { return null; }
}

// 해시태그 후보 — 공백 없이 단어 머리를 대문자로 (YouTube 공식: 두 단어는 붙여 쓴다 #TwoWords)
const hashtag = (s) => '#' + s.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean)
  .map((w) => w[0].toUpperCase() + w.slice(1)).join('');
// 🔴 관련성 — 한 글자 확장은 주제 밖으로 샌다 (2026-09-25 실측 "korea tipping t" → "korean tosa"·"korean toe").
//    시드의 3자 이상 단어마다 제안에 같은 어간(앞 4자, 또는 "tip"⊂"tipping")이 있어야 남긴다. --all 은 필터를 끈다
const words = (s) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const relevant = (seed, s) => words(seed).filter((t) => t.length >= 3)
  .every((t) => words(s).some((w) => w.startsWith(t.slice(0, 4)) || (w.length >= 3 && t.startsWith(w))));
const ALL = A.includes('--all');

if (EXPAND) {
  // 뒤에 a~z(한국어는 자음), 앞에 질문어 — 이 채널의 시청자는 「어떻게 돌아가나」를 검색한다 (docs/channel/01-strategy.md §6)
  const SUFFIX = HL === 'ko' ? ['ㄱ','ㄴ','ㄷ','ㄹ','ㅁ','ㅂ','ㅅ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'] : [...'abcdefghijklmnopqrstuvwxyz'];
  const PREFIX = HL === 'ko' ? [] : ['how', 'why', 'what', 'is', 'can', 'do'];
  for (const seed of seeds) {
    const queries = [seed, ...SUFFIX.map((s) => `${seed} ${s}`), ...PREFIX.map((p) => `${p} ${seed}`)];
    const tally = new Map();
    let failed = 0, sent = 0;
    for (const gl of GLS) for (const [qi, q] of queries.entries()) {
      if (qi || gl !== GLS[0]) await sleep(DELAY);
      const lists = await Promise.all(SOURCES.map((s) => ac(q, s, gl)));
      lists.forEach((list, i) => {
        sent++;
        if (list === null) { failed++; return; }
        list.forEach((s, rank) => {
          if (s.toLowerCase() === seed.toLowerCase()) return;
          const cur = tally.get(s) || { yt: 0, web: 0, best: 99 };
          cur[SOURCES[i]]++; cur.best = Math.min(cur.best, rank);
          tally.set(s, cur);
        });
      });
    }
    const both = (v) => (v.yt > 0 && v.web > 0 ? 1 : 0);
    const kept = [...tally].filter(([s]) => ALL || relevant(seed, s));
    const rows = kept.sort((a, b) => (b[1].yt + b[1].web) - (a[1].yt + a[1].web) || both(b[1]) - both(a[1]) || a[1].best - b[1].best);
    const top = rows.slice(0, 20);
    console.log(`\n  「${seed}」 확장 (${SOURCES.map((s) => NAME[s]).join('·')} · hl=${HL} · gl=${GLS.join(',')}) — 실제 제안 ${tally.size}개 중 관련 ${kept.length}개의 상위 ${top.length}${ALL ? ' (필터 끔)' : ''}`);
    if (failed) console.log(`  ⚠️ 요청 실패 ${failed}/${sent} — 결과가 불완전하다`);
    console.log('');
    for (const [s, v] of top) console.log(`    ${SOURCES.map((k) => `${NAME[k]} ${String(v[k]).padStart(2)}`).join(' · ')}   ${s}`);
    if (!top.length) console.log('    (이 요청에서 제안 없음 — 수요·검색량은 알 수 없음)');
    const QUESTION = /^(how|why|what|is|can|do|does|are|where|when|should)\b/i;
    const questions = rows.filter(([s]) => QUESTION.test(s)).slice(0, 8);
    if (questions.length) {
      console.log('\n  질문형 — 훅·스레드 마지막 질문·설명 첫 줄의 재료');
      for (const [s] of questions) console.log(`    ${s}`);
    }
    // 해시태그는 주제어로 — 질문형·플랫폼명·연도가 붙은 제안은 태그로 쓰지 않는다
    const tagSrc = top.filter(([s]) => !QUESTION.test(s) && !/\b(reddit|quora|youtube|tiktok|instagram|\d{4})\b/i.test(s) && /^[\p{L}\p{N} ]+$/u.test(s));
    const tags = [...new Set(tagSrc.filter(([s]) => s.split(/\s+/).length <= 3 || hashtag(s).length <= 20).map(([s]) => hashtag(s)))].slice(0, 10);
    if (tags.length) console.log(`\n  해시태그 후보 (3단어 이하 제안에서) — 영상 내용과 맞는 것만 고른다\n    ${tags.join(' ')}`);
  }
} else {
  console.log(`\n  표현 후보 (hl=${HL} · gl=${GLS.join(',')}) — 자동완성 수는 검색량이 아님\n`);
  for (const [qi, q] of seeds.entries()) {
    for (const gl of GLS) {
      if (qi || gl !== GLS[0]) await sleep(DELAY);
      const lists = await Promise.all(SOURCES.map((s) => ac(q, s, gl)));
      console.log(`  「${q}」${GLS.length > 1 ? ` gl=${gl}` : ''}  ${hashtag(q)}`);
      lists.forEach((list, i) => {
        const src = NAME[SOURCES[i]].padEnd(3);
        if (list === null) { console.log(`    ${src}  ⚠️ 요청 실패`); return; }
        const exact = list.some((s) => s.toLowerCase() === q.toLowerCase());
        console.log(`    ${src}  ${list.length ? `제안 ${list.length}개` : '제안 없음'}${exact ? ' · 정확 일치' : ''}`);
        if (list.length) console.log(`           ↳ ${list.slice(0, 5).join(' · ')}`);
      });
    }
  }
  console.log('\n  실제 내용·대상·검색 의도와 맞는 표현을 고른다. 이 결과로 주제나 제목을 자동 탈락시키지 않는다.\n');
}
