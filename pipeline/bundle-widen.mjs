#!/usr/bin/env node
// 묶음 B 확장용 사진 넓히기 — 세로 프레임의 생성 사진을 16:9 가로 띠로 이어 그린다(Codex image_gen 편집, 08 §4.3).
//   2026-10-08 L7~ 묶음: 새 숏츠는 생성 사진이 1080 폭이라 좌우를 이어 그릴 재료가 없다. 늘이기·흐림·거울 대신 같은 사진을 넓게 이어 그린다.
//   원본 이미지는 프레임 안에 그대로 두고, 넓힌 띠를 그 아래 형제로 깐다 — 가운데 화소는 원본 그대로(verify SSIM).
//   --feather N(기본 40, 원본 화소): 띠의 원본 경계 안쪽 N화소를 원본 → 생성으로 섞는다. 원본 img를 위에 두면 가려지고, 크게 다가가는 프레임은 원본 img를 숨기고 띠만 쓴다(이음매가 녹는다).
//   같은 카메라의 다른 상태(편집 쌍)는 --margins-from 으로 먼저 넓힌 띠의 구도를 물려받아 상태만 맞춘다(크로스페이드 때 가장자리가 바뀌지 않게).
// node pipeline/bundle-widen.mjs <묶음> <원본 프로젝트> <원본 hf 기준 이미지 경로> [--display x,y,w,h] [--band y0,y1] [--x x0,x1] [--name 이름] [--hint "장면 설명"]
//   --display: 원본 프레임(1080×1920)에서 이미지가 그려진 상자. 기본 = 이미지 비율대로 1080 폭 cover(가운데 정렬)
//   --x: 덮을 프레임 x 범위(기본 -600,1680) · --band: 덮을 프레임 y 범위(기본 x 범위의 16:9 높이를 y 938 중심으로)
// 출력: projects/<묶음>/hyperframes/compositions/bundle/assets/<원본 번호>/<이름>-wide.jpg + 배치 상자(프레임 px) + 시험 합성 output/widen/<이름>/composite.jpg
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [b, p, rel, ...rest] = process.argv.slice(2);
const opt = k => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : null; };
const find = n => readdirSync(path.join(ROOT, 'projects')).find(d => d.startsWith(String(n).padStart(5, '0')));
const B = find(b), P = find(p);
if (!B || !P || !rel) { console.error('사용: node pipeline/bundle-widen.mjs <묶음> <원본> <이미지 경로> [...]'); process.exit(1); }
const srcFile = path.join(ROOT, 'projects', P, 'hyperframes', rel);
if (!existsSync(srcFile)) { console.error(`✗ 없음 ${srcFile}`); process.exit(1); }
const py = (code) => { const r = spawnSync('python3', ['-I', '-c', code], { encoding: 'utf8' }); if (r.status) { console.error(r.stderr); process.exit(1); } return r.stdout.trim(); };
const [iw, ih] = py(`from PIL import Image;im=Image.open(${JSON.stringify(srcFile)});print(im.width,im.height)`).split(' ').map(Number);
let [dx, dy, dw, dh] = (opt('--display') || '').split(',').map(Number);
if (!opt('--display')) { dw = 1080; dh = 1080 * ih / iw; dx = 0; dy = (1920 - dh) / 2; if (dh < 1920) { dh = 1920; dw = 1920 * iw / ih; dx = (1080 - dw) / 2; dy = 0; } }
const [X0, X1] = (opt('--x') || '-600,1680').split(',').map(Number);
const H = (X1 - X0) * 9 / 16;
let [Y0, Y1] = opt('--band') ? opt('--band').split(',').map(Number) : [938 - H / 2, 938 + H / 2];
// 표시 → 원본 화소
const k = iw / dw;
const sx0 = Math.round((X0 - dx) * k), sx1 = Math.round((X1 - dx) * k), sy0 = Math.round((Y0 - dy) * k), sy1 = Math.round((Y1 - dy) * k);
const name = opt('--name') || path.basename(rel).replace(/\.\w+$/, '');
const tmp = path.join(ROOT, 'projects', B, 'output', 'widen', name); mkdirSync(tmp, { recursive: true });   // 캔버스·로그·시험 합성(재생성 가능)
const canvas = path.join(tmp, 'canvas.png');
// --margins-from <넓힌 jpg>: 같은 카메라의 다른 상태(편집 쌍) — 그 가장자리를 바탕에 깔고 이 상태의 가운데를 얹어, 가장자리만 이 상태로 고친다(구도 유지)
const mf = opt('--margins-from');
py(`
from PIL import Image
im=Image.open(${JSON.stringify(srcFile)}).convert('RGB')
c=${mf ? `Image.open(${JSON.stringify(path.resolve(ROOT, mf))}).convert('RGB').resize((${sx1 - sx0},${sy1 - sy0}))` : `Image.new('RGB',(${sx1 - sx0},${sy1 - sy0}),(128,128,128))`}
c.paste(im,(${-sx0},${-sy0}))
c.save(${JSON.stringify(canvas)})
print(c.size)`);
const hint = opt('--hint') ? ` The scene: ${opt('--hint')}.` : '';
const prompt = mf ? `This wide 16:9 photograph is assembled from two moments of the same fixed camera. The central vertical strip (the middle ${Math.round(100 * (dw / (X1 - X0)))}% of the width) shows the CORRECT moment. The left and right parts come from a different moment of the same place. Repaint ONLY the left and right parts so they match the central strip's state exactly — same amount of leaves on the ground and in the trees, same light, same weather, same time of day, same objects — while keeping their layout (tree trunks, path edges, buildings, horizon, perspective) where it is now.${hint} Keep the central strip unchanged. Do not add text, letters, logos, watermarks, borders or new main subjects. The result must look like one seamless photograph.` : `Outpaint this photograph into a wide 16:9 landscape image. The flat neutral gray areas on the left and right (and any at the top or bottom) are EMPTY canvas — fill them by continuing the existing scene naturally: same lighting, colors, perspective, horizon line, lens, depth of field, grain and photographic style, as if the camera had a wider lens.${hint} Keep the existing center photograph exactly where it is, unchanged in position, scale and content. Do not add any text, letters, signs with words, logos, watermarks, borders, frames, people facing the camera, or new main subjects; extend only background scenery (sky, trees, ground, buildings, water, foliage) that plausibly continues what is already at the edges. No gray must remain.`;
const instruction = `The attached image is Image 1. Use the built-in image_gen tool exactly once to EDIT the attached image as described below, used verbatim. Keep the aspect ratio of Image 1 (16:9 landscape). Do not run any shell commands and do not create or edit any files. When the image is generated, reply only with the word DONE.\n\nPROMPT:\n${prompt}`;
const CODEX = [path.join(os.homedir(), '.npm-global/bin/codex'), '/opt/homebrew/bin/codex', '/usr/local/bin/codex'].find(f => existsSync(f)) || 'codex';
const IMAGES = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'generated_images');
const outDir = path.join(ROOT, 'projects', B, 'hyperframes/compositions/bundle/assets', P.slice(0, 5));
mkdirSync(outDir, { recursive: true });
const dest = path.join(outDir, `${name}-wide.${rest.includes('--png') ? 'png' : 'jpg'}`);   // --png: 원본 img를 숨기고 띠만 보이는 확대 프레임용(JPEG 손실이 무대 대조를 떨어뜨린다 — L8 F06 1.9배 0.95)
if (rest.includes('--finish-only')) { if (!existsSync(path.join(tmp, 'raw.png'))) { console.error('✗ raw.png 없음 — 먼저 생성'); process.exit(1); } finish(); process.exit(0); }
// 이미지 생성 모델·추론은 asset-prompts.mjs와 같은 고정값(2026-10-08 사용자 지시 「sol + xhigh」) — config.toml 대화 기본값을 따르지 않는다. 둘을 함께 고친다
const child = spawn(CODEX, ['exec', '--ephemeral', '-m', 'gpt-6.1-sol', '-c', 'model_reasoning_effort="xhigh"', '--sandbox', 'read-only', '--skip-git-repo-check', '--color', 'never', `--image=${canvas}`, instruction], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
let out = '';
child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
const timer = setTimeout(() => { out += '\n[widen] 15분 초과'; child.kill('SIGTERM'); }, 15 * 60 * 1000);
child.on('close', code => {
  clearTimeout(timer);
  writeFileSync(path.join(tmp, 'codex.log'), out);
  const sid = out.match(/session id:\s*([0-9a-f-]{16,})/i)?.[1];
  const folder = sid && path.join(IMAGES, sid);
  const png = folder && existsSync(folder) ? readdirSync(folder).filter(f => /\.png$/i.test(f)).map(f => path.join(folder, f)).sort((x, y) => statSync(y).mtimeMs - statSync(x).mtimeMs)[0] : null;
  if (code !== 0 || !png) { console.error(`✗ ${name}: codex exit ${code} · 로그 ${path.join(tmp, 'codex.log')}`); process.exit(1); }
  copyFileSync(png, path.join(tmp, 'raw.png'));
  finish();
});

// 생성본 → 가로 띠: 원본 크기 격자(캔버스 = 원본 화소)로 맞추고, 가운데에 원본을 그대로 넣고, 가장자리의 저주파 색 차이를 경계에서 0이 되게 보정한다.
//   2026-10-08 실측: 생성기가 가운데 밝기·색을 조금 바꿔(잠수교 하늘·강, 남이섬 강) 원본과 붙인 경계에 세로 띠가 보였다
function finish() {
  const W = X1 - X0, Hh = Y1 - Y0;
  const VPY = path.join(os.homedir(), '.venvs/abm-whisper/bin/python');   // numpy 가 있는 인터프리터(AGENTS.md 환경)
  const r = spawnSync(existsSync(VPY) ? VPY : 'python3', ['-I', '-c', `
import numpy as np
from PIL import Image, ImageFilter
cw,ch=${sx1 - sx0},${sy1 - sy0}
g=Image.open(${JSON.stringify(path.join(tmp, 'raw.png'))}).convert('RGB').resize((cw,ch),Image.LANCZOS)
o=Image.open(${JSON.stringify(srcFile)}).convert('RGB')
ox,oy=${-sx0},${-sy0}
# 원본이 캔버스에 걸치는 범위
x0,x1=max(0,ox),min(cw,ox+o.width); y0,y1=max(0,oy),min(ch,oy+o.height)
oc=o.crop((x0-ox,y0-oy,x1-ox,y1-oy))
# 2026-10-08 L9 실측(w80-04): 넓은 창(blur 24·24열·61행)은 하늘 경계 단차가 남고(평균 L 6.7·R 9.2), 페더 구간은 보정 전 생성본과 섞여 단차가 커졌다.
#   좁은 창(blur 6·6열·9행)으로 경계 바로 옆 색을 맞추고, 같은 보정을 페더 구간(원본 안쪽 F화소)의 생성본에도 준 뒤 섞는다(L 3.6·R 4.0)
blur=lambda im: np.asarray(im.filter(ImageFilter.GaussianBlur(6)),dtype=np.float32)
G=np.asarray(g,dtype=np.float32).copy()
gb=blur(g)[y0:y1,x0:x1]; obl=blur(oc)
d=obl-gb                      # 원본 − 생성(저주파)
band=6
def side(cols):
    c=d[:,cols,:].mean(axis=1)            # 행마다 경계 띠의 평균 차이
    k=np.ones(9)/9
    return np.stack([np.convolve(np.pad(c[:,i],4,mode='edge'),k,mode='valid') for i in range(3)],axis=1)
cL=side(slice(0,band)); cR=side(slice(-band,None))
D=max(120,(x1-x0)*0.35)
if x0>0:
    w=np.exp(-(x0-np.arange(x0))[None,:]/D)[:,:,None]
    G[y0:y1,:x0]+=w*cL[:,None,:]
if x1<cw:
    w=np.exp(-(np.arange(x1,cw)-x1+1)[None,:]/D)[:,:,None]
    G[y0:y1,x1:]+=w*cR[:,None,:]
O=np.asarray(oc,dtype=np.float32); F=${Math.max(0, Number(opt('--feather') ?? 40))}
# 가운데 = 원본. 경계 안쪽 F화소는 원본 → 생성(같은 보정)으로 섞는다 — 띠만 보이게 쓰면(원본 img 대신) 결이 어긋난 세로 이음매가 녹는다.
#   원본 img를 위에 그대로 두는 배치에서는 이 띠가 원본에 가려 보이지 않는다(가운데 화소 불변)
if F>0 and (x1-x0)>4*F:
    a=np.ones(x1-x0,dtype=np.float32)
    r=np.linspace(0,1,F,dtype=np.float32)
    Gi=G[y0:y1,x0:x1].copy()
    if x0>0: a[:F]=r; Gi[:,:F]+=cL[:,None,:]
    if x1<cw: a[-F:]=r[::-1]; Gi[:,-F:]+=cR[:,None,:]
    a=a[None,:,None]
    G[y0:y1,x0:x1]=a*O+(1-a)*Gi
else:
    G[y0:y1,x0:x1]=O
out=Image.fromarray(np.clip(G,0,255).astype(np.uint8))
out.save(${JSON.stringify(dest)},**({'quality':92} if ${JSON.stringify(dest)}.endswith('.jpg') else {'optimize':True}))
out.resize((${Math.round(W / 2)},${Math.round(Hh / 2)})).save(${JSON.stringify(path.join(tmp, 'composite.jpg'))},quality=85)
print(out.size, 'L', np.round(np.abs(cL).mean(),1), 'R', np.round(np.abs(cR).mean(),1))
`], { encoding: 'utf8' });
  if (r.status) { console.error(r.stderr); process.exit(1); }
  console.log(`  색 보정(경계 평균 차이): ${r.stdout.trim()}`);
  console.log(`✔ ${name}: ${path.relative(ROOT, dest)}`);
  // 캔버스는 원본 화소 정수 격자다 — 배치 상자도 그 정수 경계에서 되돌려 계산해야 띠 안 원본 화소가 원본 img와 겹친다(2026-10-08 L10 실측: 반올림한 명목값 2280×1282.5로 두면 2배 줌에서 1~2px 어긋나 SSIM 0.78)
  const r2 = v => Math.round(v * 100) / 100;
  console.log(`  배치(원본 프레임 px, 원본 이미지 아래 형제로, object-fit:fill): left:${r2(dx + sx0 / k)}px; top:${r2(dy + sy0 / k)}px; width:${r2((sx1 - sx0) / k)}px; height:${r2((sy1 - sy0) / k)}px`);
  console.log(`  참조 경로(프레임 HTML): compositions/bundle/assets/${P.slice(0, 5)}/${path.basename(dest)}`);
  console.log(`  시험 합성: ${path.join(tmp, 'composite.jpg')}`);
}
