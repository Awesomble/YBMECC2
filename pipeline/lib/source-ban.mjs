// 🔴 출처·확인일·URL·도메인·사진 크레딧 금지 — 업로드 문안(publish-check)과 카드 이미지(card-render)가 같은 패턴을 쓴다.
//    (2026-10-02 사용자 지시: "내용 생성시 소스관련 내용은 안넣도록 … 왜 자꾸 소스와 소스링크를 넣는건데" ·
//     2026-10-06 「출처는 표시금지 리뷰에도 출처 문구 사용금지」). 출처는 README 확정 팩트에만 둔다.
//    패턴을 두 곳에 적으면 갈라진다(docs/02-pitfalls.md §15) — 여기 한 곳에서 고친다.
export const MON = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';

export const SRC = [
  /https?:\/\/\S+/i,
  /(?<![@\w.-])[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|gov|edu|io|kr)(?:\/\S*)?(?![\w.@])/i,   // 이메일 주소는 도메인으로 세지 않는다
  /^\s*(?:sources?|data|references?|refs?)\s*[:：]/im,
  /\bsources?\s+(?:checked|verified|confirmed|reviewed)\b/i,
  new RegExp(`\\b(?:checked|verified|accessed|retrieved)\\s+(?:on\\s+)?(?:\\d{1,2}\\s+(?:${MON})|(?:${MON})\\.?\\s+\\d{1,2}|\\d{4}-\\d{2}-\\d{2}|against|with|via)\\b`, 'i'),
  /\baccording to\b/i,
  /\bdata from\b/i,
  // 사진·이미지·지도의 출처·크레딧·참고 사진 — 생성 이미지·3D는 실제 사진을 분석해 만들지만 그 사진의 출처·「사진을 바탕으로」를 쓰지 않는다
  /(?:^|[.;]\s+)(?:satellite\s+)?(?:imagery|images?|photos?|photographs?|credits?|map data)\s*[:：]/im,   // 「Elevation: 478 m」 같은 사실 줄은 막지 않는다
  /©|&copy;|\bcontains modified\b|\bcopernicus\b|\bopenstreetmap\b|\bwikimedia\b/i,
  /\bcourtesy of\b|\bphoto(?:s|graph)?\s+(?:by|courtesy|credits?)\b|\b(?:image|photo)\s+credits?\b/i,
  /\b(?:based on|recreated from|traced from|modell?ed on)\s+(?:a\s+|the\s+|real\s+|actual\s+)?(?:photos?|photographs?|images?)\b|\breference\s+(?:photos?|images?)\b/i,
];
export const LICENSE = /\bCC[ -]BY\b|creativecommons\.org|\blicensed under\b/i;

// 예외는 BGM(CC BY 곡) 크레딧 줄뿐 — 사진·이미지·지도 크레딧 줄은 CC BY 라도 출처 검사에서 빼지 않는다
export const musicLine = (l) => LICENSE.test(l) && /\bBGM\b|\bmusic\b|\bsong\b|\btrack\b/i.test(l) && !/photo|image|map|wikimedia|commons\.wikimedia/i.test(l);

// 줄 목록에서 걸린 문자열(중복 제거). allowMusicCredit = CC BY 곡 크레딧 줄을 뺄지
export function sourceHits(lines, {allowMusicCredit = true} = {}) {
  const hits = lines.filter((l) => !(allowMusicCredit && musicLine(l))).flatMap((l) => SRC.map((re) => l.match(re)?.[0]).filter(Boolean));
  return [...new Set(hits.map((h) => h.trim()))];
}
