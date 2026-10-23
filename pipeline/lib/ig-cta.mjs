// 인스타 CTA 판 설정 — cuts.json `ig_cta` 한 곳을 ig-cta.mjs·publish-check·stage-gate 가 같이 읽는다 (video SKILL 「인스타 CTA 판」 2026-10-20, ABM 한국어 판 이식 2026-10-21).
//   {"link":"info"|"map", "keyword":"링크", "reward":"남기시면 DM으로 …", "lead":"댓글에", "at":3, "y":1584} — 전부 생략 가능
// 사용자 2026-10-20(ABMEN·ABM): 키워드는 바꿀 수 있게 현재가 디폴트. 보낼 것은 요청할 때 알려 준다.
// 사용자 2026-10-22: 지도에 찍을 수 있는 지점이 있는 편은 요청 없이 map(② 에서 cuts.json 에 쓴다 — README 「인스타 판」 줄, stage-gate 2 가 대조). 제품·안내 페이지는 요청한 편만.
//   YBMECC 는 학원 안내·상담 링크가 기본(link info · 키워드 「링크」). 위치를 보낼 때만 map(「지도」).
//   학원은 제휴(수수료) 링크가 없다 — ABM 의 「광고」 칩(ad)·광고 표시 검사는 해당 없음이라 넣지 않았다.
import path from 'node:path';
import { BRAND } from './brand.mjs';

export const LINKS = ['info', 'map'];
// 링크 종류별 기본 키워드 — 지도 링크일 때만 「지도」를 권한다. cuts.json keyword 가 있으면 그 말이 우선
export const KEYWORDS = { info: '링크', map: '지도' };
export const KEYWORD = KEYWORDS.info;
// 링크 종류별 기본 보상 문구 — 요청이 보낼 것을 구체적으로 말하면(상담 예약 페이지·설명회 신청) reward 를 그 말로 쓴다
//   「보내 드립니다」는 review 문안(§7)과 같은 띄어쓰기다
export const REWARD = { info: '남기시면 DM으로 보내 드립니다', map: '남기시면 DM으로 지도를 보내 드립니다' };
// 색 — brand.json 팔레트(채널05 §2): 버건디 알약 · Ivory 글자(버건디 위 7.3:1) · Gold 키워드 칩(Ink 글자) · 오렌지 배지(Ink 글자 7.4:1).
//   알약 색은 ig-cta.mjs 가 렌더 화소로 대조한다
const B = BRAND.colors;
export const COLORS = { pill: B.accent, paper: B.paper, ink: B.ink, gold: B.lime, warm: B.warm };
// 자리(1080×1920). 알약 y1584~1654 = 자막 상자(y1384~1534, captions.html .cap) 아래 50px — ABMEN 2026-10-20 사용자가 두 시안 중 고른 자리 그대로.
//   x120~900: 오른쪽 버튼 열(x960~) 앞에서 끝난다. 아래 310~430px 를 덮는 릴스 UI(docs/09 §2)에 아래쪽이 걸릴 수 있다는 점은 알고 고른 자리다
export const DEFAULTS = { lead: '댓글에', at: 3.0, y: 1584, x: 120, w: 780, h: 70, ic: 54, fs: 32, maxFs: 32, minFs: 26, cycle: 4.0, arc: 30, top: 34, band: 140 };

/** cuts.json → 채운 설정, 인스타 CTA 판이 아니면 null */
export function igCta(cuts) {
  const c = cuts?.ig_cta;
  if (!c || typeof c !== 'object') return null;
  const link = c.link ?? 'info';
  return { link, keyword: String(c.keyword ?? KEYWORDS[link] ?? KEYWORD).trim(), reward: c.reward ?? REWARD[link] ?? REWARD.info,
    lead: c.lead ?? DEFAULTS.lead, at: Number(c.at ?? DEFAULTS.at), y: Number(c.y ?? DEFAULTS.y) };
}

/** README 「인스타 판」 줄(2026-10-22 골격) — `인스타 판(댓글 → DM): map — 장소 | info — 페이지 (사용자 요청) | 없음 — 이유`.
 *  반환 {kind:'map'|'info'|'product'|'none'|'', note, line, pin} · 라벨이 없으면 null(옛 골격 — 검사하지 않는다). pin = 「지도 핀」 줄의 값 */
export function igPlan(readme) {
  const m = String(readme ?? '').match(/^인스타 판[^\n:：]*[:：](.*)$/m);
  if (!m) return null;
  const line = m[1].trim();
  const head = (line.match(/^([A-Za-z가-힣]+)/)?.[1] ?? '').toLowerCase();
  let kind = { map: 'map', 지도: 'map', info: 'info', 정보: 'info', 링크: 'info', product: 'product', 제품: 'product', 상품: 'product', 없음: 'none', none: 'none' }[head] ?? '';
  let note = kind ? line.slice(head.length).replace(/^\s*[—–-]?\s*/, '').trim() : line;
  if (!kind && line) {   // ⛳A 보고 투(「Comment MAP · we’ll DM you the pin · 보낼 것 = 지도 핀(…)」 — 2026-10-22 전 편) — 키워드는 info 편도 MAP 이라 신호가 아니다
    const t = line.replace(/\b(Comment|댓글에)\s+\S+/i, '');
    kind = /없음|\bnone\b/i.test(t) ? 'none' : /지도|\bpins?\b|\bmap\b/i.test(t) ? 'map' : /제품|상품|product/i.test(t) ? 'product' : /정보|링크|예약|안내|\binfo\b|\blink\b/i.test(t) ? 'info' : '';
    if (kind) note = line;
  }
  const pin = String(readme).match(/^지도 핀[^\n:：]*[:：](.*)$/m)?.[1]?.trim() ?? '';
  return { kind, note, line, pin };
}

/** Pretendard Bold 폭 어림(px) — fontTools 실측(ABM): 한글 0.864em(전부 같다) · 공백 0.23 · 대문자 평균 0.75 · 숫자 0.62 · 소문자 0.56 · 문장부호 0.3.
 *  글이 알약 안에 들어가는지 미리 본다. 실제 폭은 검수 시트에서 눈으로 */
export function textWidth(s, fs) {
  let em = 0;
  for (const ch of s) em += /[ᄀ-ᇿ㄰-㆏가-힯一-鿿]/.test(ch) ? 0.864 : /[A-Z]/.test(ch) ? 0.75 : /[a-z]/.test(ch) ? 0.56 : /\d/.test(ch) ? 0.62 : ch === ' ' ? 0.23 : 0.3;
  return em * fs;
}
/** 글자 크기 — 머리말·키워드 칩(Pretendard 1.04em + 좌우 여백 .64em)·보상 + 사이 간격 2개(.28em)가 두 아이콘 사이에 들어가는 가장 큰 크기(maxFs 까지) */
export function fitSticker({ lead, keyword, reward }, d = DEFAULTS) {
  const room = d.w - 2 * d.h - 16;
  const need = (fs) => textWidth(lead, fs) + textWidth(keyword, fs * 1.04) + 0.64 * fs + textWidth(reward, fs * 0.97) + 2 * 0.28 * fs;
  for (let fs = d.maxFs ?? d.fs; fs >= d.minFs; fs--) if (need(fs) <= room) return { fs, need: Math.round(need(fs)), room };
  return { fs: null, need: Math.round(need(d.minFs)), room };
}
/** 인스타 판 파일 이름 — 본편 번호를 따른다. 그 이름이 hf-render 봉인본이면 다음 빈 번호 */
export function igName(base, taken) {
  let n = Number(path.basename(base).match(/-v(\d+)\.mp4$/)?.[1] ?? 1);
  while (taken(`ig-reels-v${n}.mp4`)) n++;
  return `ig-reels-v${n}.mp4`;
}
