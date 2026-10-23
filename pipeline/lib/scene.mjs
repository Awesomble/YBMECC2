// 모션 씬에서 텍스트를 읽는다 — 자막 청크와 헤드라인.
// export.mjs 와 qc.mjs 가 **같은 파서**를 쓴다. 각자 파싱하면 둘이 어긋난 걸 아무도 못 잡는다
// (2026-09-07 실사고: SRT 가 폐기된 구안 대본으로 나가는데 검사에 안 걸렸다).
//
// ⚠️ .tsx 는 JSX 라 Node 가 import 하지 못한다 — 텍스트 스캔이다.
//    파일 구조가 바뀌면 조용히 0개를 반환할 수 있으므로, 호출부는 **개수가 0인지 반드시 확인**한다.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// JSX → 평문. ⚠️ 인라인 태그(<G>강조</G>)는 공백 없이 붙여야 한다 — 공백을 넣으면
// "<G>십 프로</G> 할인입니다." 가 "십 프로  할인입니다." 로 나와 SRT 에 그대로 실린다. 줄바꿈만 공백으로.
const strip = (s) =>
  s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** 프로젝트의 timeline.ts (Node 타입 스트리핑으로 직접 import). 없으면 null */
export async function readTimeline(dir) {
  const p = path.join(dir, 'motion', 'timeline.ts');
  if (!existsSync(p)) return null;
  try { return await import(pathToFileURL(p).href); } catch { return null; }
}

/**
 * 구운 자막 청크 — motion/subtitles.tsx 의 SUBS.
 * 반환: [{ m: 원음초, t: 텍스트, at: 표시초, until: 표시초 }] · speed 를 주면 at/until 을 채운다
 */
export function readSubs(dir, { speed = 1, total = null } = {}) {
  const p = path.join(dir, 'motion', 'subtitles.tsx');
  if (!existsSync(p)) return [];
  const src = readFileSync(p, 'utf8');
  const out = [...src.matchAll(/\{\s*m:\s*([\d.]+)\s*,\s*node:\s*<>([\s\S]*?)<\/>\s*\}/g)]
    .map((mm) => ({ m: +mm[1], t: strip(mm[2]) }))
    .sort((a, b) => a.m - b.m);
  return out.map((c, i) => ({
    ...c,
    at: c.m / speed,
    until: i + 1 < out.length ? out[i + 1].m / speed : (total ?? c.m / speed + 2),
  }));
}

/**
 * 컷별 헤드라인 — cuts/*.tsx 의 `export const CutNN` 블록 안 첫 <HeadZone>.
 * 훅/루프처럼 공유 씬(<HookScene …>)을 쓰는 컷은 그 씬 파일의 HeadZone 을 가져온다.
 * 반환: Map(컷번호 → 헤드라인 문자열)
 */
export function readHeadlines(dir) {
  const cdir = path.join(dir, 'motion', 'cuts');
  const map = new Map();
  if (!existsSync(cdir)) return map;
  const head = (src) => {
    const m = src.match(/<HeadZone\b[^>]*>([\s\S]*?)<\/HeadZone>/);
    return m ? strip(m[1]) : null;
  };
  // 공유 씬 파일들(HookScene.tsx 등)을 미리 읽어 둔다
  const shared = new Map();
  for (const f of readdirSync(path.join(dir, 'motion')).filter((f) => f.endsWith('.tsx'))) {
    const h = head(readFileSync(path.join(dir, 'motion', f), 'utf8'));
    if (h) shared.set(path.basename(f, '.tsx'), h);
  }
  for (const f of readdirSync(cdir).filter((f) => f.endsWith('.tsx'))) {
    const src = readFileSync(path.join(cdir, f), 'utf8');
    // ⚠️ **순서대로 세지 마라.** 파일명이 담은 범위와 HeadZone 개수가 어긋난다 —
    //    루프 컷(c14)이 훅 씬(HookScene)을 재사용하므로 c01_05.tsx 에는 HeadZone 이 4개뿐이다.
    //    순차로 매기면 컷06부터 전부 밀린다 (2026-09-07 감독 지적). 반드시 `Cut<번호>` 이름으로 키를 잡는다.
    // export const CutNN … 다음 export const 전까지가 그 컷의 몸통
    const blocks = [...src.matchAll(/export\s+const\s+Cut(\d+)[\s\S]*?(?=export\s+const\s+Cut|\s*$)/g)];
    for (const b of blocks) {
      const n = +b[1];
      const body = b[0];
      let h = head(body);
      if (!h) {
        // <SomeScene …/> 형태로 공유 씬에 위임한 컷
        const use = body.match(/<([A-Z][A-Za-z0-9]*)\s/);
        if (use && shared.has(use[1])) h = shared.get(use[1]);
      }
      if (h) map.set(n, h);
    }
  }
  return map;
}

// ── 숫자 표기 정규화 ────────────────────────────────────────────
// 헤드라인은 "10%", 나레이션은 "십 프로"로 쓴다 (TTS 가 읽어야 하므로). 그대로 비교하면
// 같은 말인데 겹침 0% 로 나온다 — 양쪽을 같은 형태로 바꿔서 비교한다.
const DIG = { 영: 0, 공: 0, 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };
const SMALL = { 십: 10, 백: 100, 천: 1000 };
const UNITS = '월일원개시분초배명번%'; // 숫자 뒤에 오면 "수량"이라고 믿을 수 있는 글자

// 한국어 수사 파싱 — 자릿수 누적(cur*10+d)이 아니라 **자리값 합산**이다.
// 십육 = 10+6 = 16 (십육 → 106 이 되면 안 된다), 이십만 = (2×10)×10000
const parseKo = (s) => {
  let total = 0, section = 0, pending = 0, seen = false;
  for (const ch of s) {
    if (ch in DIG) { pending = DIG[ch]; seen = true; }
    else if (ch in SMALL) { section += (pending || 1) * SMALL[ch]; pending = 0; seen = true; }
    else if (ch === '만') { total += (section + pending || 1) * 10000; section = pending = 0; seen = true; }
    else if (ch === '억') { total += (section + pending || 1) * 1e8; section = pending = 0; seen = true; }
    else return null;
  }
  return seen ? total + section + pending : null;
};

export function normNum(str) {
  let s = str.replace(/프로|퍼센트/g, '%');
  // 한글 수사 → 아라비아
  //  ⚠️ 세 가지 함정을 전부 막아야 한다 (2026-09-07 실측으로 하나씩 드러났다):
  //   ① 앞이 숫자면 건너뛴다 — "20만" 의 만은 수사가 아니라 배율이다 (아래 아라비아 단계가 처리)
  //   ② 끝의 일·월 은 단위로 떼어낸다 — "십육일" 이 161 이 되면 안 된다
  //   ③ 배율(십백천만억)이 없으면 뒤에 단위가 와야 한다 — 그래야 "일주일" 이 안 깨진다
  s = s.replace(/[영공일이삼사오육칠팔구십백천만억]+/g, (m, i, whole) => {
    if (/\d\s*$/.test(whole.slice(0, i))) return m; // ①
    let run = m, tail = '';
    if (run.length > 1 && (run.endsWith('일') || run.endsWith('월'))) { tail = run.slice(-1); run = run.slice(0, -1); } // ②
    const after = tail || (whole.slice(i + m.length).match(/^\s*(.)/) || [])[1] || '';
    if (!/[십백천만억]/.test(run) && !(after && UNITS.includes(after))) return m; // ③
    const v = parseKo(run);
    return v === null ? m : String(v) + tail;
  });
  // 배율 — "20만" 과 "이십만"(이미 200000) 을 같은 값으로
  s = s.replace(/(\d+)\s*억/g, (_, n) => String(+n * 1e8));
  s = s.replace(/(\d+)\s*만/g, (_, n) => String(+n * 10000));
  s = s.replace(/(\d+)\s*천(?![\d])/g, (_, n) => String(+n * 1000));
  return s;
}

/** 어절 겹침률 — a 의 낱말(2자 이상) 중 b 안에 그대로 있는 비율. 0~1. 숫자 표기는 정규화해서 본다.
 *  ⚠️ 숫자가 든 낱말은 **숫자 경계까지 봐야 한다** — 부분문자열로 재면 `overlap('10% 할인','110% 할인') === 1`
 *  이 되어 자릿수가 틀린 자막이 100% 일치로 통과한다 (2026-09-08 재현 확인). */
export function overlap(a, b) {
  // 🔴 2026-09-10: 예전엔 구두점·**공백까지 전부 제거**해 붙였다. 그러면 숫자로 끝나는 낱말 뒤에
  //    숫자가 오는 순간 경계 검사가 오작동한다 — "…82900원과89800원6900원이니…" 에서
  //    「89800원」 뒤가 6 이라 「숫자 경계」로 잡혀 불일치가 됐다(00005 cut-10, 7낱말 중 2개만 인정 = 0.286).
  //    이제 낱말 사이를 **공백 하나로 남긴다.** 공백은 숫자가 아니므로 경계 판정이 제자리를 찾는다.
  //    비교 대상 b 는 앞뒤에 공백을 둘러 경계를 만들고, 찾는 낱말은 공백 없이 쓴다
  //    (낱말에 공백을 붙이면 그 다음 문자가 숫자일 때 엉뚱하게 「숫자 경계」로 잡힌다).
  //    천단위 쉼표는 **숫자의 일부**다. 구분자로 두면 「82,900원과」가 「82」+「900원과」로 쪼개져
  //    「2,500원」이 「12,500원」에 붙어 버린다(자릿수 방어가 깨진다). 먼저 붙여서 한 낱말로 만든다.
  const norm = (s) => normNum(s).replace(/(\d),(?=\d)/g, '$1')
                                .replace(/[^가-힣a-zA-Z0-9%]+/g, ' ').trim();
  const clean = (s) => norm(s);
  //    🔴 a 도 b 와 **같은 정규화**를 거쳐야 한다. normNum 만 먹이면 쉼표 접착이 안 걸려
  //       「82,900원」이 ["82","900원"] 으로 쪼개지고, 접착된 B("…82900원…") 에서 둘 다
  //       숫자 경계에 걸려 탈락한다 — 같은 문자열끼리 비교해도 0.000 이 나왔다(2026-09-10 실측).
  const words = (norm(a).match(/[가-힣a-zA-Z0-9%]+/g) || []).filter((w) => w.length >= 2);
  if (!words.length) return 0;
  const B = ' ' + norm(b) + ' ';
  const hasNum = (c) => {
    // 앞뒤가 숫자가 아닌 자리에서만 일치로 친다 ("10%가" 는 통과, "110%" 는 불통과)
    for (let i = B.indexOf(c); i !== -1; i = B.indexOf(c, i + 1)) {
      if (!/\d/.test(B[i - 1] || '') && !/\d/.test(B[i + c.length] || '')) return true;
    }
    return false;
  };
  return words.filter((w) => {
    const c = clean(w);
    return /\d/.test(c) ? hasNum(c) : B.includes(c);
  }).length / words.length;
}
