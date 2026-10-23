#!/usr/bin/env node
// 인스타 판 — 본편 MP4 하단에 「댓글에 <키워드> 남기시면 DM으로 보내 드립니다」 스티커를 얹는다 (video SKILL 「인스타 CTA 판」 2026-10-20 개정, YBMECC 2026-10-21 이식 — ABM 한국어 판).
// 사용: node pipeline/ig-cta.mjs <p> [--video <본편.mp4>] [--y <알약 윗변 y>] [--at <등장 초>] [--preview [--link info|map] [--keyword <말>]]
//
// 2026-10-20 사용자: 끝 CTA 화면은 끝까지 보는 사람이 드물다 → 영상이 시작되고 나면 끝까지 하단에 반복 모션 스티커.
//   길이·음성·자막은 본편 그대로다 — 렌더 예산을 쓰지 않고, 본편 위에 투명 띠 하나를 ffmpeg overlay 로 한 번 얹는다.
// 설정은 cuts.json 의 `ig_cta` 한 곳(기본값·뜻은 lib/ig-cta.mjs): {"link":"info"|"map","keyword":"링크","reward":"…"} — 전부 생략 가능
//   publish-check 가 인스타 캡션·고정 댓글·## dm 키워드를 이 값과 맞춘다
// 스티커 그림·동작은 pipeline/templates/ig-cta-overlay.html — 본편 길이 그대로 1080×BAND 띠를 투명 MOV(ProRes 4444)로 굽는다.
//   글꼴은 brand.json font(Pretendard)를 프로젝트 hyperframes/fonts 에서 가져온다. 학원 편은 제휴 링크가 없어 「광고」 칩(ABM ad)이 없다.
// 옛 방식(마지막 컷 frame `-ig-cta` + 끝 2초 정지 + 본편 잘라내기)은 YBMECC 에 만들어진 편이 없고 새로 만들지 않는다.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolveProject, ROOT } from './lib/project.mjs';
import { BRAND } from './lib/brand.mjs';
import { runHyperframes } from './lib/hyperframes-cli.mjs';
import { digest, fileHash } from './lib/workflow-state.mjs';
import { COLORS, DEFAULTS, fitSticker, igCta, igName, LINKS } from './lib/ig-cta.mjs';

const TEMPLATE = path.join(ROOT, 'pipeline/templates/ig-cta-overlay.html');
export { DEFAULTS, fitSticker, igName, igPlan, textWidth } from './lib/ig-cta.mjs';

if (import.meta.url === `file://${process.argv[1]}`) {
  const { dir, name, out } = resolveProject(process.argv[2], { usage: '사용: node pipeline/ig-cta.mjs <p> [--video <본편.mp4>] [--y <알약 윗변>] [--at <초>] [--preview [--link info|map] [--keyword <말>]]' });
  const fail = (msg, code = 1) => { console.error(`✗ ${msg}`); process.exit(code); };
  const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
  const PREVIEW = process.argv.includes('--preview');
  const cuts = JSON.parse(readFileSync(path.join(dir, 'cuts.json'), 'utf8'));
  // --preview 는 cuts.json 을 건드리지 않고 기본값(학원 안내 링크 · 「링크」)으로 「이 편에 얹으면 어떤가」를 본다.
  //   --link / --keyword 로 다른 설정을 미리 볼 수 있다(예: --link map)
  if (process.argv.includes('--ad')) fail('학원 편에는 「광고」 칩이 없다 — 제휴(수수료) 링크를 보내지 않는다(ABM 의 ad 옵션은 해당 없음)');
  const pv = PREVIEW ? { ig_cta: { ...(arg('--link') ? { link: arg('--link') } : {}), ...(arg('--keyword') ? { keyword: arg('--keyword') } : {}) } } : null;
  const cfg = igCta(cuts) ?? (pv ? igCta(pv) : null);
  if (!cfg) fail('cuts.json 에 ig_cta 가 없다 — 예: "ig_cta": {"link":"info"} (키워드 기본 「링크」 · video SKILL 「인스타 CTA 판」)');
  if (!LINKS.includes(cfg.link)) fail(`ig_cta.link 「${cfg.link}」 — ${LINKS.join(' · ')} 중 하나`);
  if (cuts.ig_cta?.ad) fail('ig_cta.ad 는 학원 편에 해당 없다 — 지운다(제휴 링크 없음)');
  if (!/^[\p{L}\p{N}]+$/u.test(cfg.keyword)) fail(`키워드 「${cfg.keyword}」 — 띄어쓰기·기호 없는 한 단어여야 시청자가 그대로 친다`);
  const lead = cfg.lead, at = Number(arg('--at') ?? cfg.at), Y = Number(arg('--y') ?? cfg.y);
  const fit = fitSticker({ lead, keyword: cfg.keyword, reward: cfg.reward });
  if (!fit.fs) fail(`스티커 글이 길다 — 어림 ${fit.need}px > 칸 ${fit.room}px(${DEFAULTS.minFs}px 글씨로도). reward 를 줄인다(한글 약 15자 안팎, 예: 「남기시면 DM으로 지도를 보내 드립니다」)`);

  // 입력 = 본편: 지정한 MP4, 없으면 hf-render 봉인본 중 가장 최근(인스타 판 자신은 제외)
  const byTime = (fs) => fs.sort((a, b) => statSync(path.join(out, b)).mtimeMs - statSync(path.join(out, a)).mtimeMs);
  const mp4s = existsSync(out) ? readdirSync(out).filter((f) => /\.mp4$/.test(f)) : [];
  const auto = byTime(mp4s.filter((f) => existsSync(path.join(out, f + '.srcman.json'))))[0];
  const base = arg('--video') ? path.resolve(out, path.basename(arg('--video'))) : auto && path.join(out, auto);
  if (!base || !existsSync(base)) fail('본편 MP4가 없다 — 먼저 pipeline/hf-render.sh 로 굽는다');
  if (/^ig-reels-/.test(path.basename(base))) fail('인스타 판 위에 다시 얹지 않는다 — 본편을 넣는다');

  const probe = (f, args) => execFileSync('ffprobe', ['-v', 'error', ...args, '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim();
  const dur = Number(probe(base, ['-select_streams', 'v:0', '-show_entries', 'stream=duration']));
  const fps = cuts.fps || 60;
  if (!(dur > at + DEFAULTS.cycle)) fail(`본편 ${dur}초가 너무 짧다 — 등장 ${at}초 뒤 한 주기(${DEFAULTS.cycle}초)도 못 돈다`);

  // 스티커 띠 렌더 — 템플릿 + 설정을 채운 HyperFrames 프로젝트(출력 폴더 안, 재생성 가능)를 투명 MOV 로 한 번
  const hfDir = path.join(dir, 'hyperframes'), work = path.join(out, 'ig-cta', 'hf');
  mkdirSync(work, { recursive: true });
  const font = path.join(hfDir, 'fonts', BRAND.font.file);
  if (!existsSync(font)) fail(`글꼴이 없다: ${path.relative(ROOT, font)}`);
  const C = { colors: COLORS, x: DEFAULTS.x, y: DEFAULTS.top, w: DEFAULTS.w, h: DEFAULTS.h, ic: DEFAULTS.ic, fs: fit.fs, arc: DEFAULTS.arc,
    lead, keyword: cfg.keyword, reward: cfg.reward, start: at, cycle: DEFAULTS.cycle, dur: +dur.toFixed(3) };
  const fontFace = `  @font-face{font-family:Brand;src:url('font.woff2') format('woff2');font-weight:${BRAND.font.weightRange ?? '100 900'};font-style:normal;font-display:block}`;
  const html = readFileSync(TEMPLATE, 'utf8').replaceAll('__H__', String(DEFAULTS.band)).replaceAll('__DUR__', String(C.dur))
    .replaceAll('__FONTFACE__', fontFace).replaceAll('__CFG__', JSON.stringify(C));
  const pin = JSON.parse(readFileSync(path.join(hfDir, 'package.json'), 'utf8')).abm?.hyperframesVersion;
  writeFileSync(path.join(work, 'index.html'), html);
  writeFileSync(path.join(work, 'package.json'), JSON.stringify({ name: 'abm-ig-cta-overlay', private: true, abm: { hyperframesVersion: pin } }, null, 2) + '\n');
  copyFileSync(path.join(ROOT, 'pipeline/templates/hyperframes/gsap.min.js'), path.join(work, 'gsap.min.js'));
  copyFileSync(font, path.join(work, 'font.woff2'));
  const key = digest(html + fileHash(path.join(work, 'gsap.min.js')) + fileHash(font) + fps).slice(0, 12);
  const mov = path.join(out, 'ig-cta', `sticker-${key}.mov`);
  if (!existsSync(mov)) {
    const r = runHyperframes(work, ['render', '--format', 'mov', '--fps', String(fps), '--output', mov, '--quiet'], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    const log = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    if (r.status !== 0 || !existsSync(mov)) fail(`스티커 렌더 실패: ${log.trim().slice(-600)}`, 2);
    if (/sub_timeline|script_failure|runtime-error/i.test(log)) fail(`스티커 타임라인이 등록되지 않았다 — 템플릿 스크립트 오류: ${log.match(/.*(sub_timeline|script_failure|runtime-error).*/i)?.[0]}`, 2);
  }
  if (!/yuva/.test(probe(mov, ['-select_streams', 'v:0', '-show_entries', 'stream=pix_fmt']))) fail(`${path.basename(mov)} 에 알파가 없다`, 2);

  // 합성 — 본편 화면 위 (x0, Y−띠 여백)에 한 번. 소리는 그대로 복사, 화면은 본편과 같은 설정으로 다시 인코딩
  //   스티커 MOV(HyperFrames ProRes 4444)는 색 행렬 태그 없이 BT.601 로 인코딩된다 — BT.601 로 풀어야 brand.json 색이 그대로 나온다
  //   (2026-10-21 YBMECC 실측: bt709 로 풀면 버건디 #A51D4D 가 rgb(176,45,77) 로 밀려 알약 색 검사 실패, bt601 이면 165,29,77 그대로. 채도 낮은 ABMEN 남색은 허용치 안이라 드러나지 않았다)
  const target = PREVIEW ? path.join(out, 'review', `ig-cta-preview-y${Y}.mp4`) : path.join(out, igName(base, (f) => existsSync(path.join(out, f + '.srcman.json'))));
  mkdirSync(path.dirname(target), { recursive: true });
  const oy = Y - DEFAULTS.top;
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', base, '-i', mov, '-filter_complex',
    `[1:v]scale=in_color_matrix=bt601:out_color_matrix=bt709:in_range=tv:out_range=tv,format=yuva420p[s];[0:v][s]overlay=x=0:y=${oy}:shortest=1:format=yuv420,format=yuv420p[v]`,
    '-map', '[v]', '-map', '0:a', '-c:a', 'copy',
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(fps), '-crf', PREVIEW ? '20' : '15', '-preset', PREVIEW ? 'veryfast' : 'slow',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', target], { encoding: 'utf8' });
  if (r.status !== 0) fail(`ffmpeg 합성 실패: ${r.stderr.trim().slice(-500)}`, 2);

  // 확인 — 길이·소리 동일, 등장 전 화면 = 본편, 등장 뒤 알약 색 = 브랜드 버건디(brand.json accent)
  const got = Number(probe(target, ['-select_streams', 'v:0', '-show_entries', 'stream=duration']));
  const pix = (f, t, x, y) => [...execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', f, '-frames:v', '1', '-vf', `format=rgb24,crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])];
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const pill = pix(target, at + 1.8, DEFAULTS.x + DEFAULTS.w / 2, Y + 7), want = hex(COLORS.pill);
  const psnr = spawnSync('ffmpeg', ['-hide_banner', '-t', String(Math.max(0.5, at - 0.1)), '-i', target, '-t', String(Math.max(0.5, at - 0.1)), '-i', base, '-lavfi', 'psnr', '-f', 'null', '-'], { encoding: 'utf8' }).stderr.match(/average:([\d.]+|inf)/)?.[1];
  let bad = 0;
  const check = (okay, msg) => { console.log(`${okay ? '✓' : '✗'} ${msg}`); if (!okay) bad++; };
  check(Math.abs(got - dur) <= 1.5 / fps, `길이 ${got.toFixed(3)}초 = 본편 ${dur.toFixed(3)}초`);
  check(probe(target, ['-select_streams', 'a:0', '-show_entries', 'stream=codec_name,sample_rate,channels']) === probe(base, ['-select_streams', 'a:0', '-show_entries', 'stream=codec_name,sample_rate,channels']), '소리 = 본편 그대로(복사)');
  check(psnr === 'inf' || Number(psnr) >= 40, `등장 전 0~${at}초 화면 = 본편 (PSNR ${psnr} dB)`);
  check(pill.every((v, i) => Math.abs(v - want[i]) <= 14), `알약 색 rgb(${pill}) ≈ ${COLORS.pill}`);

  // 검수 시트 — 자막·스티커·릴스 UI 가림 추정(빨강: 아래 330px·오른쪽 120px, docs/09)을 한 장에. 감독·사용자가 연다
  const review = path.join(out, 'review'), sheet = path.join(review, PREVIEW ? `ig-cta-preview-y${Y}.png` : 'ig-cta-sheet.png');
  mkdirSync(review, { recursive: true });
  const times = [at + 0.2, at + 0.5 + 0.1, at + 0.5 + 0.6, at + 0.5 + 0.85, at + 0.5 + 1.35, at + 0.5 + 2.6, dur * 0.66, dur - 0.05];
  const crop = 'crop=1080:640:0:1180,drawbox=x=0:y=410:w=1080:h=230:color=red@0.22:t=fill,drawbox=x=960:y=0:w=120:h=410:color=red@0.22:t=fill,scale=540:-2';
  const inputs = times.flatMap((t) => ['-ss', t.toFixed(3), '-i', target]);
  const fc = times.map((_, i) => `[${i}:v]trim=end_frame=1,${crop}[c${i}]`).join(';') + ';' + times.map((_, i) => `[c${i}]`).join('') + `xstack=inputs=${times.length}:layout=0_0|w0_0|0_h0|w0_h0|0_h0+h1|w0_h0+h1|0_h0+h1+h2|w0_h0+h1+h2[o]`;
  spawnSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', fc, '-map', '[o]', '-frames:v', '1', sheet]);
  const rel = (f) => path.relative(process.cwd(), f);
  console.log(`본편     ${rel(base)}  ${dur.toFixed(3)}초`);
  console.log(`인스타 판 ${rel(target)}  같은 길이 · 스티커 ${at}초부터 끝까지(${DEFAULTS.cycle}초 주기) · 알약 y${Y}~${Y + DEFAULTS.h} x${DEFAULTS.x}~${DEFAULTS.x + DEFAULTS.w} · 글씨 ${fit.fs}px`);
  console.log(`  「${lead} ${cfg.keyword} ${cfg.reward}」 · 자막은 본편 것 그대로(subtitles.srt)`);
  console.log(`검수 시트 ${rel(sheet)} — 열어서 자막·화면 정보와 겹치지 않는지, 빨간 띠(릴스 UI 추정)에 걸리지 않는지 본다`);
  if (!PREVIEW && !bad) writeFileSync(path.join(review, 'ig-cta.json'), JSON.stringify({ base: path.basename(base), baseHash: fileHash(base), video: path.basename(target),
    videoHash: fileHash(target), link: cfg.link, keyword: cfg.keyword, reward: cfg.reward, lead, at, y: Y, template: digest(readFileSync(TEMPLATE, 'utf8')).slice(0, 12), sheet: path.basename(sheet), at_: new Date().toISOString() }, null, 2) + '\n');
  process.exit(bad ? 2 : 0);
}
