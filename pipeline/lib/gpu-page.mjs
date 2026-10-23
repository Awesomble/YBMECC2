// gpu-page.mjs — WebGPU 가 켜진 헤드리스 페이지 (2026-10-08 · 셰이더 도입).
//
// 왜: 검사·시트 도구의 Chrome 은 `--disable-gpu` 라 셰이더 캔버스가 비거나 자홍(NO WEBGPU)으로 나온다.
//   HyperFrames 렌더·snapshot 과 같은 브라우저(고정 버전의 chrome-headless-shell)·같은 GPU 플래그로 띄워야
//   렌더본과 같은 화면이 나온다. 2026-10-08 PoC: 플래그 없이 띄우면 SwiftShader 가 잡혔고, 아래 플래그로 Apple Metal 이 잡혔다.
// 쓰는 곳: shader-fx.mjs (shot · selftest), poster-sheet.mjs (셰이더를 쓴 포스터 안).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installedHyperframes, resolveHyperframes } from './hyperframes-cli.mjs';

const GPU_ARGS = ['--enable-unsafe-webgpu', '--enable-gpu-rasterization', '--hide-scrollbars', '--mute-audio',
  ...(process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [])];

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.webm': 'video/webm', '.mp4': 'video/mp4' };

function headlessShell() {
  const base = path.join(os.homedir(), '.cache/hyperframes/chrome/chrome-headless-shell');
  if (!fs.existsSync(base)) return null;
  const dirs = fs.readdirSync(base).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const d of dirs) for (const sub of fs.readdirSync(path.join(base, d))) {
    const exe = path.join(base, d, sub, 'chrome-headless-shell');
    if (fs.existsSync(exe)) return exe;
  }
  return null;
}

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
// 루프백 서버가 내주는 곳 — 저장소·임시 폴더·호출자가 더한 폴더만. .env* 는 어디서든 내주지 않는다(pipeline/.env.local)
const ALLOW = [REPO, os.tmpdir(), '/tmp', '/private/tmp', '/private/var/folders'].map((d) => fs.existsSync(d) ? fs.realpathSync(d) : d);

// hf = 프로젝트의 hyperframes/ (그 프로젝트가 고정한 HyperFrames 를 따른다). 없으면(관리용 selftest·build) 설치된 최신판.
export async function openGpuPage({ hf = null, root = '/', width = 1080, height = 1920, allow = [] } = {}) {
  const allowed = [...ALLOW, ...allow.map((d) => fs.realpathSync(d))];
  const cli = hf ? resolveHyperframes(hf) : installedHyperframes()[0];
  if (!cli) throw new Error('HyperFrames 로컬 CLI 가 없다 — puppeteer-core·headless-shell 을 찾을 수 없다');
  const ppt = path.join(cli.packageDir, '..', 'puppeteer-core/lib/puppeteer/puppeteer-core.js');
  if (!fs.existsSync(ppt)) throw new Error(`puppeteer-core 가 없다: ${ppt}`);
  const exe = headlessShell();
  if (!exe) throw new Error('chrome-headless-shell 이 없다 — HyperFrames 렌더를 한 번 돌리면 ~/.cache/hyperframes/chrome 에 깔린다');
  const { default: puppeteer } = await import(ppt);
  // 파일은 루프백 HTTP 로 준다 — file:// 은 이미지 fetch 가 막혀 ImageTexture 가 못 읽는다
  const srv = http.createServer((q, s) => {
    const f = path.join(root, decodeURIComponent(q.url.split('?')[0]));
    const real = fs.existsSync(f) ? fs.realpathSync(f) : '';
    if (!real || !fs.statSync(real).isFile() || /^\.env/.test(path.basename(real)) || !allowed.some((d) => real === d || real.startsWith(d + path.sep))) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(real).pipe(s);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await puppeteer.launch({ executablePath: exe, headless: 'shell', args: GPU_ARGS, defaultViewport: { width, height } });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message || e}`));
  const url = (file) => base + '/' + path.relative(path.resolve(root), path.resolve(file)).split(path.sep).map(encodeURIComponent).join('/');
  const adapter = async () => page.evaluate(async () => {
    const a = navigator.gpu && await navigator.gpu.requestAdapter();
    return a ? (a.info ? `${a.info.vendor} ${a.info.architecture}`.trim() || 'gpu' : 'gpu') : null;
  });
  const close = async () => { await browser.close().catch(() => {}); srv.close(); };
  return { page, url, logs, adapter, close };
}

// HyperFrames 가 하는 것과 같은 seek: hf-seek 를 보내고 waitUntil 로 받은 일을 모두 기다린다
export async function seekPage(page, t) {
  return page.evaluate(async (time) => {
    const work = [];
    window.dispatchEvent(new CustomEvent('hf-seek', { detail: { time, waitUntil: (p) => work.push(p) } }));
    const r = await Promise.allSettled(work);
    const bad = r.find((x) => x.status === 'rejected');
    if (bad) throw new Error(String(bad.reason && bad.reason.message || bad.reason));
    return work.length;
  }, t);
}
