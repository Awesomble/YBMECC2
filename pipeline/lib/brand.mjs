// Shared ABMEN defaults. Local assets keep rendered frames independent of a CDN.
import {copyFileSync, existsSync, mkdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const BRAND = JSON.parse(readFileSync(new URL('../templates/brand.json', import.meta.url), 'utf8'));
export const FONT_STACK = `${BRAND.font.family},sans-serif`;
// 0초 포스터 주제 제목 전용 서체(brand.json posterFont · 2026-10-06 사용자 지시). 본문·자막·숫자는 Inter
const P = BRAND.posterFont;
export const POSTER_FONT_STACK = P ? `${P.family},serif` : FONT_STACK;
// poster=false: 포스터 서체 파일이 없는 옛 골격(2026-10-06 전)에 끊긴 @font-face 를 넣지 않는다 — font-check 가 「파일 없음」으로 막는다
export function fontFace(prefix = 'fonts/', {poster = true} = {}) {
  return `@font-face{font-family:${BRAND.font.family};src:url('${prefix}${BRAND.font.file}') format('woff2');font-weight:${BRAND.font.weightRange};font-style:normal;font-display:block}`
    + (P && poster ? `\n@font-face{font-family:${P.family};src:url('${prefix}${P.file}') format('truetype');font-weight:${P.weightRange};font-style:normal;font-display:block}` : '');
}
export function brandCss(prefix = 'fonts/') {
  return `${fontFace(prefix)}
:root{${Object.entries(BRAND.colors).map(([key,value])=>`--abmen-${key}:${value}`).join(';')}}
.abmen-headline{font-family:${FONT_STACK};font-weight:${BRAND.type.headlineWeight};line-height:1.05;letter-spacing:-.035em}
.abmen-body{font-family:${FONT_STACK};font-weight:${BRAND.type.bodyWeight};line-height:1.3}
.abmen-number{font-family:${FONT_STACK};font-weight:${BRAND.type.numberWeight};font-variant-numeric:tabular-nums lining-nums;letter-spacing:-.03em}
.abmen-label{font-family:${FONT_STACK};font-weight:600;line-height:1.2}
.abmen-caption{font-family:${FONT_STACK};font-weight:${BRAND.type.captionWeight};line-height:1.25;color:var(--abmen-ink)}
.abmen-poster-title{font-family:${POSTER_FONT_STACK};font-weight:${P?.titleWeight ?? 900};line-height:.88;letter-spacing:-.035em}
`;
}

// One public channel lockup for init, explicit repair and scaffold validation.
// 2026-09-27 사용자 지시: 숏츠도 롱폼처럼 좌상단 이미지 로고(BRAND.logo). id 는 바깥 div 에만 둔다 —
// hf-project sync 가 그 태그의 data-duration 을 갱신하고, root-lockup 은 <div …>…</div> 로 지운다(안쪽 div 금지).
// 옛 한 줄 텍스트 락업(BRAND.lockup)은 그 전에 만든 편이 계속 검사를 통과하도록 판정에만 남긴다(소급하지 않는다).
export function lockupStyle() {
  const l=BRAND.lockup;
  return `z-index:30;position:absolute;top:${l.top}px;left:${l.left}px;right:auto;margin:0;height:${l.height}px;width:${l.width}px;padding:0 ${l.paddingX}px;background:${l.background};border-radius:${l.radius}px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;font-family:${FONT_STACK};font-weight:${l.fontWeight};font-size:${l.fontSize}px;line-height:normal;letter-spacing:${l.letterSpacing};color:${l.color};white-space:nowrap;pointer-events:none`;
}
export function logoStyle() {
  const g=BRAND.logo;
  return `z-index:30;position:absolute;top:${g.top}px;left:${g.left}px;right:auto;margin:0;height:${g.height}px;pointer-events:none`;
}
export function lockupMarkup(duration) {
  if (!Number.isFinite(Number(duration)) || Number(duration)<=0) throw new Error('락업 길이는 양수여야 한다');
  const g=BRAND.logo;
  return `<div id="el-root-lockup" class="clip" data-start="0" data-duration="${Number(duration)}" data-track-index="3" style="${logoStyle()}"><img src="${g.asset}" alt="${g.alt}" style="display:block;height:100%;width:auto;filter:${g.filter}"></div>`;
}
// 'logo'(2026-09-27~ 이미지 로고) · 'text'(옛 한 줄 락업) · null(없음·중복·작업명·다른 그림)
export function channelLockupKind(html) {
  const roots=[...html.matchAll(/<(?:div|img)\b[^>]*\bid="el-root-lockup"[^>]*>/g)];
  if (roots.length!==1 || !roots[0][0].startsWith('<div')) return null;
  const content=html.slice(roots[0].index+roots[0][0].length).split('</div>')[0].trim();
  if (content===BRAND.lockup.text) return 'text';
  const img=content.match(/^<img\b[^>]*>$/)?.[0];
  return img && img.includes(` src="${BRAND.logo.asset}"`) ? 'logo' : null;
}
export const hasChannelLockup = html => Boolean(channelLockupKind(html));
// 로고 원본을 프로젝트 골격으로 복사한다. 원본이 없으면 실패 — 깨진 <img> 로 전 프레임에서 락업이 사라진 사고(stage-gate 주석 2026-09-12)를 막는다
export function installChannelLogo(hfDir) {
  const source=fileURLToPath(new URL(`../../${BRAND.logo.file}`, import.meta.url));
  if (!existsSync(source)) throw new Error(`채널 로고 원본이 없다: ${BRAND.logo.file}`);
  const dest=path.join(hfDir, BRAND.logo.asset);
  mkdirSync(path.dirname(dest), {recursive:true});
  if (!existsSync(dest) || !readFileSync(dest).equals(readFileSync(source))) copyFileSync(source, dest);
  return dest;
}
export const channelLogoSource = () => fileURLToPath(new URL(`../../${BRAND.logo.file}`, import.meta.url));
