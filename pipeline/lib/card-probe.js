// 카드 한 장의 글자·그림 배치를 브라우저 안에서 잰다 — pipeline/card-render.mjs 가 CDP 로 주입한다 (2026-10-08 사용자 지시:
//   "영상에서는 폰트가 빠져나가거나 겹쳐도 금방 지나가서 그냥 넘겼는데 이미지는 한 장 한 장에 티가 크리티컬해").
// 영상의 layout-scan 은 타임라인을 훑는 도구라 정지 카드에는 맞지 않는다 — 카드는 이 한 장의 최종 배치만 본다.
// 🔴 글자 상자는 **잉크 범위**로 잰다. Range 의 줄 상자는 글꼴의 위아래 여백(어센트·디센트)까지 포함해, 줄 간격을 좁힌
//    큰 제목끼리는 획이 닿지 않아도 상자가 겹친다(00063 첫 장 「Han River parks」·「11 parks.」 오탐 — 2026-10-08 실측).
//    그래서 줄 조각마다 canvas measureText 의 실제 잉크 높이(actualBoundingBox)로 세로 범위를 다시 잡는다.
// 돌려주는 것: 글자 덩어리(blocks[].rects = 줄 조각의 잉크 상자)·단어 중간 줄바꿈·줄 끝 외톨이·상자 넘침·그림 상자·안 실린 서체.
function cardProbe(W, H) {
  const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+)$/i;
  const visible = (el) => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false;
    }
    return true;
  };
  const blockOf = (el) => el.closest('h1,h2,h3,h4,p,li,div,figcaption') || el;
  const word = /[\p{L}\p{N}]/u;
  const ctx = document.createElement('canvas').getContext('2d');
  const loaded = new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '').trim()));
  const blocks = new Map(), fonts = new Set(), breaks = [];
  const range = document.createRange();
  for (const el of document.body.querySelectorAll('*')) {
    const nodes = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (!nodes.length || !visible(el)) continue;
    const cs = getComputedStyle(el), blk = blockOf(el);
    const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    if (!GENERIC.test(fam) && !loaded.has(fam)) fonts.add(fam);
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if (!blocks.has(blk)) blocks.set(blk, {tag: blk.tagName.toLowerCase(), text: blk.textContent, frags: [], color: cs.color, size: parseFloat(cs.fontSize)});
    const b = blocks.get(blk);
    for (const n of nodes) {
      // 글자마다 줄을 읽어 줄 조각을 만든다. 줄이 바뀐 자리의 앞뒤가 모두 글자·숫자면 단어 한가운데서 끊긴 것이다(한글 기본 줄바꿈 「부/터」)
      const t = n.textContent; let frag = null, prev = null;
      const close = () => {
        if (!frag || !frag.text.trim()) return;
        const mt = ctx.measureText(frag.text.trim());
        const base = frag.top + mt.fontBoundingBoxAscent;
        frag.y = base - mt.actualBoundingBoxAscent; frag.h = mt.actualBoundingBoxAscent + mt.actualBoundingBoxDescent;
        frag.x = frag.left; frag.w = frag.right - frag.left; frag.color = cs.color; frag.size = parseFloat(cs.fontSize);
        // 글자 한가운데의 맨 위 요소가 그림이면 글자가 그림 뒤로 지나가는 구성(의도)이다 — 경계 검사에서 뺀다
        const top = document.elementFromPoint(frag.x + frag.w / 2, frag.y + frag.h / 2);
        frag.under = !!top && top.tagName === 'IMG';
        b.frags.push(frag);
      };
      for (let i = 0; i < t.length; i++) {
        const ch = t[i];
        range.setStart(n, i); range.setEnd(n, i + 1);
        const r = range.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        if (frag && Math.abs(r.top - frag.top) > r.height * 0.5) {
          if (prev && word.test(prev) && word.test(ch)) breaks.push({text: `${prev}|${ch}`, around: t.slice(Math.max(0, i - 6), i + 6).trim(), x: r.left, y: r.top, w: r.width, h: r.height});
          close(); frag = null;
        }
        if (!frag) frag = {text: '', left: r.left, right: r.right, top: r.top};
        frag.text += ch;
        if (!/\s/.test(ch)) { frag.left = Math.min(frag.left, r.left); frag.right = Math.max(frag.right, r.right); }
        prev = /\s/.test(ch) ? null : ch;
      }
      close();
    }
  }
  const out = [];
  for (const [el, b] of blocks) {
    // 줄 = 같은 높이의 조각들 (한 줄에 <em> 같은 여러 조각이 있을 수 있다)
    const lines = [];
    for (const f of [...b.frags].sort((a, c) => a.top - c.top || a.x - c.x)) {
      const l = lines.find((x) => Math.abs(x.top - f.top) < f.h * 0.5);
      l ? (l.text += f.text) : lines.push({top: f.top, text: f.text});
    }
    const last = (lines[lines.length - 1]?.text || '').trim();
    const over = el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow === 'visible' && el.clientWidth > 0;
    out.push({tag: b.tag, text: b.text.replace(/\s+/g, ' ').trim().slice(0, 60),
      rects: b.frags.map(({x, y, w, h, color, size, under}) => ({x, y, w, h, color, size, under})),
      lineCount: lines.length, orphan: lines.length > 1 && [...last].filter((c) => word.test(c)).length <= 2 ? last : null,
      overflow: over ? {sw: el.scrollWidth, cw: el.clientWidth} : null, color: b.color, size: b.size});
  }
  const imgs = [...document.querySelectorAll('img')].filter(visible).map((im) => {
    const r = im.getBoundingClientRect();
    return {src: im.getAttribute('src') || '', x: r.left, y: r.top, w: r.width, h: r.height};
  }).filter((r) => r.w > 1 && r.h > 1);
  return {W, H, blocks: out, breaks, fonts: [...fonts], imgs};
}
