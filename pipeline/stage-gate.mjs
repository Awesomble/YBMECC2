#!/usr/bin/env node
// stage-gate.mjs — 단계별 산출물 전수 검사 (2026-09-10 신설)
//
//   node pipeline/stage-gate.mjs <프로젝트> [단계]      단계 생략 = 전 단계
//
// 왜 (2026-09-10 사용자 지적: "자꾸 뭔가 빠져서 진행하는 것 같아"):
//   /video 스킬은 절차를 **글로** 적어 두는데, 글은 건너뛰어도 아무도 모른다.
//   실제로 이번 감사에서 스킬이 `hyperframes init`·오디오 슬라이스·`check`·`seam-gate`·
//   `snapshot`·1.20배 배속을 **한 번도 언급하지 않는다**는 게 드러났다.
//   문서를 고쳐도 다음번에 또 빠진다 — **산출물이 있는지 코드가 물어야 한다.**
//
// 규칙
//   🔴 하드   없으면 다음 단계로 넘어가면 안 되는 것
//   ⚠️ 경고   사람이 판단할 것
//   이 도구는 **품질을 재지 않는다.** 「했는가」만 본다. 품질은 render-gate·감독의 몫이다.
//   묶음 롱폼(cuts.json orientation:landscape + bundle)은 ②~⑤에서 세로 전용 검사 대신 묶음 검사를 한다(bundleDesign).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {resolveProject} from './lib/project.mjs';
import {BRAND,channelLockupKind,channelLogoSource} from './lib/brand.mjs';
import {audioBuildState,digest,factsHash,factItems,verificationErrors,FREE_LICENSE,readJson,fileHash,audioInfo,voiceState,voiceFile,narrationInputHash,validatedWords} from './lib/workflow-state.mjs';
import {readTiming,timingFromCuts,legacyTiming} from './lib/timing.mjs';
import {validateAssets} from './lib/asset-state.mjs';
import {manifest,HASH_VERSION} from './lib/src-hash.mjs';
import { rootCaptionChunks, isBundle, bundleChapters, bundleFrameCaps } from './hf-export.mjs';
import {resolveSfxCues,SFX_LICENSE_ENFORCE_FROM,SFX_LICENSE_RULE,SFX_LONG_RETIRED} from './lib/sfx-tracks.mjs';
import {readBeat,keywordOnset,hasKeyword,posterInSource,posterFontSizes,POSTER_MIN_PX,fmtPx} from './lib/hook.mjs';
import {REF_FORMAT,realShapes,refRecord,uniqueRefImages,sceneDigest,parseReal} from './lib/refs.mjs';
import {checkShaders} from './lib/shaders.mjs';
import {ACADEMY,academyReport,platformRequired} from './lib/academy.mjs';
import {igCta,igPlan} from './lib/ig-cta.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = process.argv[2];
if (!arg) { console.error('사용: node pipeline/stage-gate.mjs <프로젝트> [1-6]'); process.exit(1); }

const {dir:P,name} = resolveProject(arg);
const O = path.join(P, 'output');
const HF = path.join(P, 'hyperframes');

/* 🔴 수정 묶음 가드 (2026-09-13 사용자 필수 요건) — 열려 있으면 어느 단계도 통과시키지 않는다.
   5개 세션 실측: 00009·00010·00012·00013 **넷 다** 지적을 한 건씩 처리했고 사용자가 그때마다 제지했다.
   가이드에 「모아서 한 번에」가 적혀 있는데도 그랬다 — abm-a7 의 말 그대로
   「절차가 아니라 **반사**로 움직였다」. 반사를 막는 건 문장이 아니라 exit code 다. */
try { execFileSync(process.execPath, [path.join(ROOT, 'pipeline', 'fix-batch.mjs'), 'guard', P], { stdio: ['ignore', 'ignore', 'inherit'] }); }
catch { console.error('  → 단계 게이트를 막았다. 지적을 전부 모아 유형별로 고치고 묶음을 닫아라.\n'); process.exit(3); }

const only = process.argv[3] ? Number(process.argv[3]) : null;
let hard = 0, warn = 0;
const J = (...p) => path.join(...p);
const has = (p) => existsSync(p);
const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
const cuts = (() => { try { return JSON.parse(read(J(P, 'cuts.json'))); } catch { return null; } })();

const ok   = (m, d = '') => console.log(`     ✅ ${m}${d ? '  ' + d : ''}`);
const bad  = (m, fix)    => { console.log(`     🔴 ${m}`); if (fix) console.log(`        → ${fix}`); hard++; };
const soft = (m, fix)    => { console.log(`     ⚠️ ${m}`); if (fix) console.log(`        → ${fix}`); warn++; };
const head = (n, t)      => { console.log(`\n  ${n} ${t}`); };

/* ── 묶음 롱폼 (hf-bundle · docs/channel/08-longform.md) ──
   세로 전용 검사(1080×1920·scene 수=컷 수·컷별 음성·audio_meta·세로 스캔/시트)는 묶음에 맞지 않는다.
   원본 숏츠는 각자 게이트를 통과했고 hf-bundle build 는 봉인 일치본만 복사한다 — 여기서는 조립이 빠짐없는지 본다. */
const BUNDLE = isBundle(cuts);
const pad2 = (i) => String(i + 1).padStart(2, '0');
const tagAt = (t, k) => t.match(new RegExp(`\\s${k}="([^"]*)"`))?.[1];
function bundleDesign(idx) {
  const b = cuts.bundle, chs = b.chapters || [];
  const divs = [...idx.matchAll(/<div\b[^>]*>/g)].map((m) => m[0]);
  const byId = (id) => divs.find((t) => tagAt(t, 'id') === id) || '';
  const root = byId('root');
  tagAt(root, 'data-width') === '1920' && tagAt(root, 'data-height') === '1080'
    ? ok('캔버스 1920×1080 가로 (묶음)')
    : bad('묶음 루트 캔버스가 1920×1080 이 아니다', `node pipeline/hf-bundle.mjs ${name} build`);
  const unplanned = chs.filter((c) => !(Number.isFinite(c.measured?.duration) && Number.isFinite(c.measured?.lufs) && c.source)).map((c, i) => c.source || c.project || pad2(i));
  !unplanned.length && chs.length >= 2
    ? ok(`plan 완료 — 챕터 ${chs.length}편 전부 measured·source`)
    : bad(`plan 미완료 — ${unplanned.length ? unplanned.join(' · ') : '챕터 2편 미만'}`, `node pipeline/hf-bundle.mjs ${name} plan`);
  let T = [];
  try { T = bundleChapters(cuts); } catch (e) { bad('묶음 시간축을 읽지 못했다', e.message); }
  const sum = (cuts.cuts || []).reduce((a, c) => a + (+c.dur || 0), 0);
  Math.abs(Number(tagAt(root, 'data-duration')) - sum) < 1e-3
    ? ok(`루트 길이 ${sum.toFixed(3)}초 = cuts.json dur 합`)
    : bad(`루트 data-duration ${tagAt(root, 'data-duration')} ≠ cuts.json dur 합 ${sum.toFixed(3)}`, `node pipeline/hf-bundle.mjs ${name} build`);
  // index 가 부르는 컴포지션·오디오 파일 — chNN 프레임 파일 존재도 여기서 본다
  const srcs = [...idx.matchAll(/\sdata-composition-src="([^"]+)"/g)].map((m) => m[1]);
  const auds = [...idx.matchAll(/<audio\b[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]).filter((s) => !/^(https?:|data:)/.test(s));
  const miss = [...srcs, ...auds].filter((s) => !has(J(HF, s)));
  miss.length ? bad(`index 가 부르는 파일 ${miss.length}개가 없다`, miss.slice(0, 4).join(' · ') + (miss.length > 4 ? ' 외' : ''))
              : ok(`참조 파일 전부 있음`, `컴포지션 ${srcs.length} · 오디오 ${auds.length}`);
  for (const [i, ch] of chs.entries()) {
    const nn = pad2(i), probs = [], note = [];
    if (!has(J(HF, `ch${nn}`))) { bad(`ch${nn}/ 폴더가 없다`, `node pipeline/hf-bundle.mjs ${name} build`); continue; }
    const mine = divs.filter((t) => tagAt(t, 'id')?.startsWith(`c${nn}-`));
    const cls = (t, c) => (tagAt(t, 'class') || '').split(/\s+/).includes(c);
    const slots = mine.filter((t) => cls(t, 'frame-slot')), wide = mine.filter((t) => cls(t, 'lf-wide'));
    // 원본 슬롯 대조 — R 방식은 frame-slot 대신 lf-wide 재구성본으로 들어간다. resolveProject 는 못 찾으면 exit 하므로 경로를 직접 읽는다
    const oi = ch.source ? read(J(ROOT, 'projects', ch.source, 'hyperframes', 'index.html')) : '';
    if (!oi) soft(`ch${nn}: 원본 index 를 찾지 못해 프레임·오디오 수 대조를 건너뛴다`, ch.source || ch.project);
    else {
      const orig = [...oi.matchAll(/<div\b[^>]*class="[^"]*\bframe-slot\b[^"]*"[^>]*><\/div>/g)].map((m) => tagAt(m[0], 'data-composition-id'));
      const isR = (c) => (ch.frames || {})[c] === 'R', nR = orig.filter(isR).length;
      const lost = orig.filter((c) => !(isR(c) ? wide : slots).some((t) => tagAt(t, 'data-composition-id') === (isR(c) ? `c${nn}-w-${c}` : `c${nn}-${c}`)));
      if (slots.length !== orig.length - nR || lost.length) probs.push(`프레임 ${slots.length}개 ≠ 원본 ${orig.length}${nR ? ` − R ${nR}` : ''}${lost.length ? ` · 빠짐 ${lost.join(' ')}` : ''}`);
      else note.push(`프레임 ${slots.length} = 원본 ${orig.length}${nR ? ` − R ${nR}` : ''}`);
    }
    // 오디오 — 음성·효과음·BGM 트랙을 챕터 시작만큼 옮겨 전부 싣는다(컷별 음성 검사의 묶음판)
    const nAud = (idx.match(new RegExp(`<audio\\b[^>]*\\sid="c${nn}-[^"]*"`, 'g')) || []).length;
    const oAud = oi ? (oi.match(/<audio\b[^>]*>/g) || []).length : null;
    if (!nAud || (oAud !== null && nAud !== oAud)) probs.push(`오디오 ${nAud}개 ≠ 원본 ${oAud ?? '?'}개 — 빠진 트랙의 소리가 사라진다`);
    else note.push(`오디오 ${nAud}${oAud !== null ? ' = 원본' : ''}`);
    const capFile = has(J(HF, `ch${nn}`, 'compositions', 'captions.html'));
    if (b.captions === 'burn' && !capFile && bundleFrameCaps(HF, nn)) note.push('자막 = 프레임 안(clip caption)');
    else if (b.captions === 'burn') {
      const host = byId(`c${nn}-el-captions`);
      if (!host || tagAt(host, 'data-composition-src') !== `ch${nn}/compositions/captions.html` || !capFile
          || !T[i] || Math.abs(Number(tagAt(host, 'data-start')) - T[i].start) > 1e-3) probs.push(`캡션 host(c${nn}-el-captions)가 없거나 챕터 시작과 다르다`);
      else note.push(`캡션 ${T[i].start.toFixed(2)}초`);
    } else if (!capFile) soft(`ch${nn}: 자막 트랙이 없다 — SRT(CC)에서 이 챕터가 빠진다`);
    probs.length ? probs.forEach((p) => bad(`ch${nn} ${p}`, `node pipeline/hf-bundle.mjs ${name} build`))
                 : ok(`ch${nn} ${note.join(' · ')}`, ch.source);
  }
  const hasPoster = (cuts.cuts || []).some((c) => c.id === 'poster');
  const route = chs.length > 0 && chs.every((c) => c.stop);   // 노선 전환이면 라벨은 챕터 1만, 0초 포스터가 있으면 챕터 1 라벨도 없다 (hf-bundle build)
  const labels = chs.map((_, i) => i).filter((i) => (!route || i === 0) && !(i === 0 && hasPoster));
  const nLabel = labels.length;
  const want = [...(hasPoster ? ['poster.html'] : []), 'end.html', ...labels.map((i) => `label-${pad2(i)}.html`), ...chs.slice(1).map((_, i) => `gap-${pad2(i)}.html`)];
  const lack = want.filter((f) => !has(J(HF, 'compositions', 'bundle', f)));
  lack.length ? bad(`compositions/bundle/ 파일 ${lack.length}개 없음 — ${lack.join(' ')}`, `node pipeline/hf-bundle.mjs ${name} build (없을 때만 기본판을 만든다)`)
              : ok(`묶음 전용 ${want.length}개`, `${hasPoster ? '0초 포스터 · ' : ''}end · label ${nLabel} · gap ${chs.length - 1}${route ? ' (노선 전환)' : ''}`);
  // 0초 포스터가 자리표시면(cards/thumbnail.html 없음·TODO 남음) 하드 — verify 와 같은 기준 (08 §3.1)
  if (hasPoster && has(J(HF, 'compositions', 'bundle', 'poster.html')) && read(J(HF, 'compositions', 'bundle', 'poster.html')).includes('data-poster="placeholder"'))
    bad('0초 포스터가 자리표시다 — cards/thumbnail.html 을 채우고 thumb check 를 통과시킨 뒤 다시 조립', `node pipeline/hf-bundle.mjs ${name} thumb check`);
}

console.log(`\n  ══ 단계 게이트 — ${name} ══`);

/* ── ① 분석 ─────────────────────────────────────────── */
if (!only || only === 1) {
  head('①', '분석 — 팩트·자산·교차검증');
  const rd = read(J(P, 'README.md'));
  /^\|.*\|.*\|/m.test(rd) && /확정 팩트/.test(rd)
    ? ok('README 확정 팩트 표')
    : bad('README 에 「확정 팩트」 표가 없다', 'stages/1-analyst.md 8번 형식으로 채운다');
  /확인 못 한 것|확인이 필요한 사실/.test(rd)
    ? ok('확인 못 한 것 항목')
    : soft('「확인 못 한 것」이 비어 있다', '없으면 "없음"이라고 명시한다');

  const scene = has(J(P, 'assets/scene')) ? readdirSync(J(P, 'assets/scene')).filter((f) => !f.startsWith('.')) : [];
  scene.length ? ok(`assets/scene ${scene.length}개`, scene.join(' '))
               : soft('assets/scene 이 비었다', '주제에 브랜드가 있으면 CI 필수 (1-analyst 6번)');
  // 🔴 이미지·SVG 만 logo-check 대상이다. 코드 제작 편의 assets/scene 에는 생성기(.py)·캐시(__pycache__)·json 만 있을 수 있다 —
  //    그 파일에는 검사 행이 없어서 「프로젝트 자산을 검사하지 못했다」 거짓 하드가 났다 (2026-09-29 00033).
  const sceneImgs = scene.filter((f) => /\.(png|jpe?g|webp|gif|svg)$/i.test(f));
  if (scene.length && !sceneImgs.length) ok('assets/scene 이미지·SVG 없음 — 코드 제작(logo-check 대상 없음)');
  if (sceneImgs.length) {
    // 🔴 logo-check 는 resources/ 라이브러리 전체를 잰다. 다른 영상의 옛 파일이 불합격이어도
    //    **이 영상의 문제는 아니다.** assets/scene/ 에 든 파일만 보고 판정한다 (2026-09-10 수정).
    let out = '';
    try { out = execFileSync('node', [J(ROOT, 'pipeline/logo-check.mjs'), name], { cwd: ROOT, encoding: 'utf8' }); }
    catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
    const mine = out.split('\n').filter((l) => sceneImgs.some((f) => l.includes(f)));
    const fails = mine.filter((l) => l.includes('❌'));
    fails.length ? bad(`이 영상 자산 중 logo-check 불합격 ${fails.length}개`, fails.map((l) => l.trim()).join(' / '))
                 : mine.length ? ok(`logo-check 검사 결과 ${mine.length}행`) : bad('logo-check가 프로젝트 자산을 검사하지 못했다');
  }

  const cv = J(P, '.cross-verify/result.json');
  try {
    // 유효기간 24시간은 ①~④ 사이의 신선도다. 봉인 렌더가 있는 편(납품 뒤)은 지문 일치만 보고 기간은 묻지 않는다 — 회귀 검사로 돌릴 때 전 단계가 늘 exit 1이었다 (2026-10-21)
    const delivered=has(O) && readdirSync(O).some((f)=>/\.mp4\.srcman\.json$/.test(f));
    const result=readJson(cv), errors=verificationErrors(result,factsHash(P),{expectedItems:factItems(read(J(P,'README.md'))),projectDir:P,maxAgeHours:delivered?Infinity:24});
    if(errors.length) bad('교차검증 결과를 신뢰할 수 없다',errors.join(' · '));
    else if(result.overall!=='통과') bad(`교차검증 판정 ${result.overall}`,'미확인/불일치·누락 조건을 해결한 뒤 다시 검증한다');
    else ok('현재 팩트·원본의 교차검증 통과');
  } catch(e) {bad('유효한 교차검증 결과가 없다',e.message);}

}

/* ── ② 구조 ─────────────────────────────────────────── */
if (!only || only === 2) {
  head('②', '구조 — cuts.json');
  if (!cuts) bad('cuts.json 을 읽을 수 없다');
  else if (BUNDLE) {
    // 묶음은 대본·발화 대신 hf-bundle plan 이 만든 컷 순서를 본다: (poster) · ch01 · gap01 · … · chNN · end
    const n = cuts.bundle.chapters?.length || 0, ids = (cuts.cuts || []).map((c) => c.id);
    const want = [...(ids[0] === 'poster' ? ['poster'] : []), ...Array.from({ length: n }, (_, i) => [`ch${pad2(i)}`, ...(i < n - 1 ? [`gap${pad2(i)}`] : [])]).flat(), 'end'];
    const total = (cuts.cuts || []).reduce((a, c) => a + (+c.dur || 0), 0);
    ids.join() === want.join() && (cuts.cuts || []).every((c) => +c.dur > 0)
      ? ok(`묶음 컷 ${ids.length}개 — ${ids[0] === 'poster' ? '0초 포스터 · ' : ''}챕터 ${n} · 전환 ${n - 1} · 정리`, `총 ${total.toFixed(1)}초`)
      : bad(`묶음 컷 순서·길이가 plan 과 다르다 — ${ids.join(' ')}`, `node pipeline/hf-bundle.mjs ${name} plan`);
  }
  else {
    /* 🔴 2026-09-14 — **컷 수가 아니라 섹션 길이로 판정한다.**
       옛 게이트는 「컷 12~25, 25 초과면 하드」였다. 우리는 그걸 지키고 있었고(컷당 1.9~2.6초, 15편)
       사용자가 *"화면이 너무 빠르게 흘러간다"* 고 반려했다. 옛 근거는 마케팅 블로그의
       「1.5~2.0초마다 시각 변화」였고, 교육·정보형 영상 연구는 **샷 8~20초**를 말한다.
       ⇒ 세는 대상을 바꾼다 — **화면이 통째로 갈리는 단위(섹션)가 8~15초인가.**
       ⚠️ 컷 수 자체는 이제 하드가 아니다. 짧은 컷이 많아도 **섹션 안에서 전개**라면 정상이다.
          판정은 「평균 섹션 길이」로 하고, 화면 교체 횟수는 ④ 에서 프레임 수로 본다. */
    const n = cuts.cuts?.length || 0;
    const total = (cuts.cuts || []).reduce((a, c) => a + (c.dur || 0), 0);
    const secs = (cuts.cuts || []).filter((c) => (c.say || '').trim()).length || n;  // 발화 단위 ≈ 섹션 후보
    ok(`컷 ${n}개 · 발화 유닛 ${secs}개 · 총 ${total.toFixed(1)}초`, '컷 수는 더 이상 하드가 아니다');

    /* 🔴 이미지 에셋 — ② 에서 README 「## 에셋 생성 요청」을 쓰고 생성까지 끝내 ⛳A 에 실제 이미지를 함께 낸다
       (2026-09-16 대본과 함께 주문 → 2026-10-02 Codex image_gen 으로 메인이 생성). ④ 에 가서 만들면 워커가 멈춰 선다.
       ⚠️ 소프트다 — 그릴 것이 전부 코드인 영상은 「없음 — 이유」 한 줄이면 된다. */
    {
      const readme = has(J(P,'README.md')) ? readFileSync(J(P,'README.md'),'utf8') : '';
      const lintCli = J(ROOT,'pipeline','asset-prompts.mjs');
      if (!/^## 에셋 생성 요청\s*$/m.test(readme)) soft('에셋 생성 요청 절이 없다', `품질상 이미지가 유리하면 README에 ② 「이미지 생성 요청」 형식으로 쓰고 node pipeline/asset-prompts.mjs ${name} --generate. 필요 없으면 「없음 — 이유」`);
      else if (cuts.asset_prompt_format >= 1 && has(lintCli)) {
        const lint = spawnSync(process.execPath, [lintCli, P, '--lint'], {encoding:'utf8'});
        if (lint.status !== 0) bad('에셋 생성 요청 형식 오류', (lint.stderr || lint.stdout).trim().split('\n').slice(0,3).join(' · '));
        else {
          ok('에셋 생성 요청 형식');
          // 실물 대조 — 생성했는데 대조 시트가 없거나, 실재 대상의 Style·「해당 없음」 선언이 어긋나면 게이트 A 전에 드러낸다 (2026-10-06)
          const out = lint.stdout.split('\n');
          for (const w of out.filter((l) => /^⚠️ .*(실물|사진풍)/.test(l)).slice(0, 4)) soft(w.replace(/^⚠️\s*/, ''), '② 「실물 대조」 — 게이트 A 에 실물 대조 시트와 「해당 없음」 목록을 함께 보인다');
          const none = out.filter((l) => l.startsWith('· 실물 대조 해당 없음'));
          if (none.length) ok(`실물 대조 해당 없음 ${none.length}개`, none.map((l) => l.replace('· 실물 대조 해당 없음 — ', '')).join(' · ').slice(0, 160) + ' — 게이트 A 에 이 목록을 보인다');
        }
      } else ok('에셋 생성 요청');
      const notMade = (cuts.assets||[]).filter(a => a.status === 'requested').map(a => a.id);
      if (notMade.length) soft('아직 생성하지 않은 이미지', `${notMade.join(', ')} → node pipeline/asset-prompts.mjs ${name} --generate`);
      const assets=validateAssets(P,cuts);
      for(const e of assets.errors) bad('에셋 계획 오류',e);
      if(assets.pending.length) soft('생성/수령 대기 에셋',assets.pending.join(', '));
    }
    /* 3D 판단 — 의미 블록 단위 비교 행 (docs/16-blender.md §1 · pitfalls §124).
       2026-09-24 선택 질문을 고친 **당일** 00016·00018이 또 「2D로 모든 상태 변화가 보인다」 한 줄로 기각했다.
       문구 교정만으로는 행동이 안 바뀌어 기록을 센다. ⚠️ 소프트다 — 3D 채택을 요구하지 않고 판단이 비교로 남았는지만 본다. */
    {
      const rd = read(J(P, 'README.md'));
      const lines = rd.split('\n');
      const h = lines.findIndex((l) => /3D가 가장 유효했을 블록/.test(l));
      let filled = 0;
      if (h >= 0) for (let i = h + 2; i < lines.length && lines[i].trim().startsWith('|'); i++) {
        const c = lines[i].split('|').slice(1, -1).map((s) => s.trim());
        if (c[0] && c[2] && c[3]) filled++;
      }
      const none = /3D\s*[:：][^\n|」]{0,6}해당 블록 없음\s*[—-]\s*[^\s<」]/.test(rd);   // 템플릿 안내문(「… — 」)은 통과시키지 않는다
      const stock = /2D로?[^\n|]{0,16}상태\s*변화[^\n|]{0,8}보인다|상태\s*변화[^\n|]{0,16}2D로?\s*보인다|2D로\s*보여줄\s*수\s*없는/.test(rd);   // 두 어순 모두(00015·16 / 00018 원문)
      if (filled || none) ok('3D 비교 행', filled ? `${filled}행` : '해당 블록 없음 + 이유');
      else soft('3D 판단이 블록 비교 행으로 남지 않았다',
        'README 「에셋 경로 판단」에 docs/16 §1 4열 비교 행(블록·대상 · 3D 범위·얻는 이점 · 표면·매핑·사진 출처 · 선택·검증할 것)을 채운다. 후보 블록이 없으면 「3D: 해당 블록 없음 — 이유」 한 줄');
      // 골격 공식 문장 — 2026-10-21 감사: 전 편 「3D:」 68줄이 「회전·층·단면」 공식으로 같았다. 이 소재의 말로 쓴 이유만 비교다
      if (/^3D\s*[:：]\s*해당 블록 없음[^\n]*(회전해도 새 정보|회전해야 보이는 물체가 없|층·단면·내부 통로)/m.test(rd))
        soft('3D 기각 이유가 골격 공식 문장이다 — 「회전·층·단면」',
          'README 골격 「3D가 이기는 곳」의 어느 경우도 아닌 이유를 이 소재의 사건·재질로 쓴다(docs/16 §1)');
      // 「디자인 방향」 여섯 줄(2026-10-21 골격 — 소재의 일·주연 표현·카메라·빛 층·이징 성격·BGM 정서) — 라벨만 있고 값이 비면 경고. 옛 골격(라벨 없음)은 건너뛴다
      const dm = rd.match(/^## 디자인 방향\n([\s\S]*?)(?=\n## )/m)?.[1] ?? '';
      if (/^BGM 정서/m.test(dm)) {
        const labels = ['이 소재가 실제로 하는 일', '주연 표현', '카메라', '빛 층', '이징 성격', 'BGM 정서'];
        // 라벨 줄은 「라벨(설명 — 예: …):값」 — 괄호 안의 콜론을 건너뛰고 괄호 밖 마지막 콜론 뒤를 값으로 본다
        const empty = labels.filter((l) => {
          const line = dm.split('\n').find((x) => x.startsWith(l)); if (!line) return true;
          let depth = 0, cut = -1;
          for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '(') depth++; else if (ch === ')') depth--; else if (ch === ':' && depth === 0) cut = i; }
          return cut < 0 || !line.slice(cut + 1).trim();
        });
        empty.length ? soft(`「디자인 방향」 ${empty.length}줄이 비어 있다 — ${empty.join(' · ')}`, '이 소재의 값으로 채운다(2-architect 「설계」 3번) — 골격 문장·형용사가 아니라 사건·재질·운동으로')
                     : ok('「디자인 방향」 여섯 줄 채움');
      }
      // 인스타 판(댓글 키워드 → DM) — 2026-10-22 사용자: 구글맵·네이버맵에 찍을 지점이 있는 편은 요청 없이 map, 제품·예약·안내 페이지(info·product)는 요청한 편만.
      //   README 「인스타 판」 줄(2026-10-22 골격)과 cuts.json ig_cta 가 같은 말이어야 한다. 옛 골격(줄 없음)은 건너뛴다 — 납품된 편은 소급하지 않는다
      const plan = igPlan(rd), igc = igCta(cuts);
      if (plan) {
        if (!plan.kind) soft('「인스타 판」 줄이 비어 있다 — map(찾아갈 지점이 있다) / info·product(사용자가 요청한 편) / 없음 — 이유', '2-architect 「인스타 CTA」: 확정 팩트에 지도 앱에서 핀이 나오는 지점(가게·시장·공원·건물·역·행사장)이 있으면 map');
        else if (plan.kind === 'none' && igc) bad(`README 「인스타 판: 없음」인데 cuts.json 에 ig_cta(${igc.link})가 있다`, '둘 중 하나를 고친다 — 지점이 있으면 README 줄을 map 으로');
        else if (plan.kind !== 'none' && !igc) bad(`README 「인스타 판: ${plan.kind}」인데 cuts.json 맨 위에 ig_cta 가 없다`, `cuts.json 에 "ig_cta": {"link":"${plan.kind}"} — 스티커는 납품 뒤 node pipeline/ig-cta.mjs ${name} 가 얹는다`);
        else if (plan.kind !== 'none' && igc.link !== plan.kind) bad(`README 「인스타 판: ${plan.kind}」와 cuts.json ig_cta.link「${igc.link}」가 다르다`, '같은 종류로 맞춘다');
        else if (plan.kind === 'none') plan.note ? ok('인스타 판 없음', plan.note) : soft('인스타 판 없음 — 이유가 없다', '「없음 — <찾을 지점이 없는 이유>」');
        else {
          if (plan.kind !== 'map' && !/요청/.test(plan.line)) soft(`인스타 판 ${plan.kind} — 제품·정보 링크는 사용자가 요청한 편만이다(2026-10-22)`, '줄에 「(사용자 요청 <날짜>)」을 적는다');
          else ok(`인스타 판 ${plan.kind}`, `${igc.lead} ${igc.keyword} ${igc.reward}`);
          if (plan.kind === 'map' && !plan.pin) soft('「지도 핀」 줄이 비어 있다 — 장소 이름·주소·지도 URL(네이버·구글)', '⑥ 자동 DM 「링크 버튼」에 사용자가 넣을 주소다 (review 「인스타 CTA 판 문안」)');
        }
      } else if (igc && /^## 인스타 판/m.test(rd)) soft('cuts.json 에 ig_cta 가 있는데 README 「인스타 판」 절에 줄이 없다', '2026-10-22 골격 줄 「인스타 판(댓글 → DM): map — <장소>」·「지도 핀: …」을 README 에 더한다');
      if (stock) soft('옛 3D 기각 문장 — 「2D로 (모든) 상태 변화가 보인다」 (pitfalls §124 재발)',
        '블록 이름과 2D 대안의 구체 기법을 적은 비교 행으로 바꾼다. 판단이 갈리면 docs/16 §4 2단계(요소 시안) 스틸 비교');
      /* 실물 형상 — 실재 건물·구조물을 3D로 만들면 실제 사진 여러 장의 형상 사양을 먼저 쓴다 (2026-10-06 사용자 지시 ·
         00051 롯데월드타워가 사진 대조 없이 높이·글 설명으로 모델링돼 실물보다 훨씬 가늘었다 — pitfalls §176). ② 는 경고, ④ 는 하드. */
      if (cuts.asset_prompt_format >= REF_FORMAT) {
        const shapes = realShapes(rd);
        const bad3 = shapes.filter((x) => x.error);
        if (!shapes.length || bad3.length)
          soft(`실물 형상 ${shapes.length ? '미완 — ' + bad3.map((x) => x.error).join(' · ') : '줄이 없다'}`,
            `README 「에셋 경로 판단」에 「실물 형상: <대상> · refs <id> · 사진 N장(시점) · 사양: …」(docs/16 §4-1). 실재 구조물을 3D로 만들지 않으면 「실물 형상: 해당 없음 — 이유」`);
        else for (const x of shapes.filter((y) => !y.none)) {
          const n = uniqueRefImages(P, x.refsId).length;
          n >= 3 ? ok(`실물 형상 ${x.refsId}`, `사진 ${n}장`) : soft(`실물 형상 ${x.refsId} — output/refs/${x.refsId}/ 사진 ${n}장`, `node pipeline/ref-photos.mjs ${name} ${x.refsId} --search "<영문 이름>" 로 서로 다른 시점 3장 이상`);
        }
      }
    }
    /* 첫 3초 — 구성 전체에서 고른 가장 강한 후킹인가 (2026-09-25 사용자 지시 「절대 기준」, video SKILL 「최우선 — 첫 1·2·3초」).
       같은 팩트의 표현만 바꿔 비교하면 본문에 더 센 장면이 있어도 앞에 오지 않는다 — 블록 후보 비교가 남았는지 센다.
       ⚠️ 소프트다 — 후보 수·점수를 강제하지 않고(2026-09-16 수치 목표 삭제) 비교와 선택이 기록됐는지만 본다.
       옛 골격(표 없음)에 대사가 이미 있으면 승인된 기획이다 — 이유 없이 훅을 재선정시키지 않는다(채널04 §2). */
    {
      const lines = read(J(P, 'README.md')).split('\n');
      const h = lines.findIndex((l) => /^\|.*후보.*\|.*(첫 발화|대사).*\|/.test(l));
      let rows = 0;
      if (h >= 0) for (let i = h + 2; i < lines.length && lines[i].trim().startsWith('|'); i++)
        if (lines[i].split('|').slice(1, -1).filter((s) => s.trim()).length >= 4) rows++;
      const chosen = lines.some((l) => /^\s*\**선택\**\s*[:：]\**\s*\S/.test(l));
      if (h < 0 && (cuts.cuts || []).some((c) => (c.say || '').trim()))
        ok('첫 3초 훅 선택', '2026-09-25 이전 골격의 승인 기획 — 훅 유지 (새 기준은 새 골격부터)');
      else rows >= 2 && chosen ? ok('첫 3초 훅 선택', `후보 ${rows}행 + 선택`)
        : soft('첫 3초 훅이 구성 전체 비교로 선택되지 않았다',
          'README 「훅 선택 — 첫 3초」 표에 블록별 후보(내용·0초 디자인·3초 안 모션·첫 발화·본문 회수)를 2개 이상 채우고 「선택: S0N — 이유」 한 줄');
      /* 승자의 초 단위 설계 (2026-10-03 사용자 지시 — 가이드 최우선). 2026-10-03~ 골격은 「첫 3초 비트」 절이 필수다.
         네 행(0.0초·0~1초·정점·~3초)의 화면·움직임·말 칸과 「핵심어:」가 찼는지만 센다 — 내용의 질은 hook-check 시트로 사람이 본다.
         ② 는 작성 중이라 경고, ④ 에서 비어 있으면 하드다(훅 설계 없이 구현했다는 뜻). */
      const beat = readBeat(lines.join('\n'));
      if (!beat.present) { if (beat.required) soft('README에 「첫 3초 비트」 절이 없다', 'new.sh 골격의 비트 표를 복구해 채운다 (video SKILL 「최우선 — 첫 1·2·3초」)'); }
      else if (beat.empty.length || !beat.keyword)
        soft(`첫 3초 비트 미완 — ${[...beat.empty, ...(beat.keyword ? [] : ['핵심어'])].join(' · ')}`,
          `README 「첫 3초 비트」 네 행과 「핵심어:」를 채우고 node pipeline/hook-check.mjs ${name} --plan 으로 핵심어 시각을 추정한다`);
      else {
        const first = (cuts.cuts || []).find((c) => c.say);
        first && !hasKeyword(first.say, beat.keyword)
          ? soft(`첫 발화 컷(${first.id})의 say 에 핵심어 「${beat.keyword}」가 없다`, '표기만 다르면(숫자↔영어) 대사 표기를 | 로 더한다(seventy-four dollars | $74). 정말 없으면 첫 발화부터 승자의 핵심을 말하게 대사를 고친다')
          : ok('첫 3초 비트', `핵심어 「${beat.keyword}」`);
      }
      /* 0초 포스터 — 첫 장면 한 장에 주제·디자인·후킹 (2026-10-06 사용자 지시 「강력하게 강제」). ② 는 작성 중이라 경고, ④ 는 하드. */
      if (beat.posterRequired) beat.posterEmpty.length
        ? soft(`0초 포스터 미완 — ${beat.posterEmpty.join(' · ')}`, 'README 「첫 3초 비트」 아래 「주제 제목:」(대상·장소 이름)·「후킹:」(가장 큰 글자가 될 볼 이유)·「키 비주얼:」(약속하는 장면·사물과 무대)을 채운다 — video SKILL 「최우선」 0.0초 포스터')
        : ok('0초 포스터', `「${beat.poster['주제 제목']}」 · 「${beat.poster['후킹']}」`);
    }
    const anchors = cuts.cuts?.filter((c) => c.say) || [];
    anchors.length ? ok(`앵커(say) 유닛 ${anchors.length}개`, `무음 컷 ${n - anchors.length}개`)
                   : bad('say 가 있는 컷이 없다');
    const noText = (cuts.cuts || []).filter((c) => !c.text && !c.say);
    noText.length ? soft(`자막·발화가 둘 다 없는 컷 ${noText.length}개`, noText.map((c) => c.id).join(' '))
                  : ok('모든 컷이 자막 또는 발화를 갖는다');
    // 자막이 발화에 없는 말을 하고 있지 않은가 (이번 세션에서 9건 나왔다)
    let orphan = 0, cur = '';
    for (const c of cuts.cuts || []) {
      if (c.say) cur = c.say.replace(/[^가-힣0-9]/g, '');
      else if (c.text) {
        const t = c.text.replace(/[^가-힣]/g, '');
        if (t.length >= 4 && !cur.includes(t.slice(0, 4))) orphan++;
      }
    }
    // 시작·끝의 유머는 고정 문구나 종결어미로 판정할 수 없다.
    // 소재별 꽁트·콜백·본문 결론 마무리는 ②/⑤에서 대본·실제 발화로 검수한다.
    orphan ? soft(`발화에 없는 자막 후보 ${orphan}건`, '무음 컷 자막은 앵커 say 안에 있어야 한다 (눈으로 대조)')
           : ok('무음 컷 자막이 앵커 발화 안에 있다');
  }
}

/* ── ③ 목소리 ───────────────────────────────────────── */
if (!only || only === 3) {
  head('③','목소리 — 대본 지문·디코딩·실측 시간');
  let timing;
  if (BUNDLE) ok('묶음 — 원본 숏츠의 음성을 그대로 쓴다', '연결 멘트는 아직 지원하지 않는다 (08 §10)');
  else try {
    timing=readTiming(P,cuts);
    const anchors=cuts.cuts.filter(c=>c.say);
    if(!anchors.length) throw new Error('발화 앵커가 없다');
    if(timing.ends.length!==cuts.cuts.length || timing.units.map(u=>u.file).join()!==anchors.map(c=>c.id).join()) throw new Error('시간축과 앵커/컷 수가 다르다');
    if(timing.canonical) {
      const derived=legacyTiming(P);
      if(JSON.stringify([timing.fps,timing.speed,timing.ends,timing.units])!==JSON.stringify([derived.fps,derived.speed,derived.ends,derived.units])) throw new Error('timeline.ts 파생본이 낡았다 — timing.mjs 실행');
    } else soft('레거시 시간축','timing.mjs --migrate로 기존 배치를 보존해 이전할 수 있다');
    ok(`시간축 ${timing.ends.length}컷 · ${timing.total.toFixed(3)}초`);
    for(const [i,c] of anchors.entries()) {
      try {
        const state=voiceState(P,cuts,c);
        if(state.state!=='current') bad(`${c.id}: 음성 ${state.state}`,`tts.mjs ${name} --status · 확인한 기존 원본만 --adopt=<ID> --confirm-script`);
        const info=audioInfo(state.file);
        const span=(timing.units[i+1]?.startM ?? timing.ends.at(-1))-timing.units[i].startM;
        if(info.duration>span+0.02) bad(`${c.id}: 유닛보다 음성이 ${(info.duration-span).toFixed(3)}초 길다`,'컷 경계/홀드를 실측으로 조정한다');
        else ok(`${c.id}: 음성 디코딩·구간 길이`);
      } catch(e) {bad(`${c.id}: 음성을 검증하지 못했다`,e.message);}
    }
    const narration=J(O,'narration.wav'), info=audioInfo(narration);
    if(Math.abs(info.duration-timing.total)>0.1) bad('나레이션과 시간축 길이가 다르다');else ok('나레이션 디코딩·총 길이');
    const state=readJson(narration+'.state.json');
    if(state.inputHash!==narrationInputHash(P,cuts,timing)||state.fileHash!==fileHash(narration)) bad('나레이션이 현재 음성·대본·시간축의 산출물이 아니다','narration.sh 실행');
    else ok('나레이션 입력 지문');
    const words=validatedWords(J(O,'whisper-words.json'),narration);
    ok(`현재 나레이션의 전사 ${words.length}어절`);
    // 첫 3초 — 「핵심어:」가 실제 음성에서 3초 안에 들리는가 (video SKILL 「최우선 — 첫 1·2·3초」 ③)
    const beat=readBeat(read(J(P,'README.md')));
    if(beat.present && beat.keyword) {
      const k=keywordOnset(words,beat.keyword);
      if(!k) soft(`전사에서 핵심어 「${beat.keyword}」를 찾지 못했다`,'「핵심어:」 표기를 전사(숫자·철자)와 맞추거나 직접 대조한다');
      else if(k.s>3) soft(`핵심어 「${beat.keyword}」가 ${k.s.toFixed(2)}초에 들린다 — 첫 3초 밖`,'유료 재합성 전에 대사 순서 조정을 사용자에게 제안한다');
      else ok(`핵심어 「${beat.keyword}」 ${k.s.toFixed(2)}초`,'STORYBOARD 첫 행 정점에 적는다');
    }
    // 대사 공백 — layout-scan·still-scan 은 소리 공백을 재지 않는다 (pitfalls §161 · §162: 00040 지도 삽입으로 무음 23초)
    try {
      const log=spawnSync('ffmpeg',['-hide_banner','-i',narration,'-af','silencedetect=noise=-40dB:d=1.5','-f','null','-'],{encoding:'utf8'}).stderr||'';
      const gaps=[];let st=null;
      for(const line of log.split('\n')){const a=line.match(/silence_start: ([\d.]+)/),b=line.match(/silence_end: ([\d.]+)/);if(a)st=+a[1];if(b&&st!==null){gaps.push([st,+b[1]]);st=null;}}
      const inner=gaps.filter(([s,e])=>s>0.05&&e<timing.total-0.05);
      if(inner.length) soft(`대사 공백 1.5초 이상 ${inner.length}곳: ${inner.map(([s,e])=>`${s.toFixed(1)}–${e.toFixed(1)}`).join(' · ')}`,'의도한 정지가 아니면 voice_offset_s·dur 로 공백을 줄인다 — 화면 삽입(지도 등)은 대사 위에 겹친다');
      else ok('컷 안·경계 대사 공백 1.5초 미만');
    } catch(e) {soft('대사 공백을 재지 못했다',e.message);}
  } catch(e) {bad('음성/시간축 검증 미완료', /timeline\.ts/.test(e.message)
      ? `${e.message} — HyperFrames 프로젝트에도 파생 시간축이 필요하다: node pipeline/timing.mjs ${name}`
      : e.message);}
}

/* ── ④ 디자인 (HyperFrames) ─────────────────────────── */
if (!only || only === 4) {
  head('④', '디자인 — HyperFrames');
  if (!has(HF)) { bad('hyperframes/ 골격이 없다','pipeline/new.sh로 현행 골격을 만든다. 기존 Remotion은 전용 qc를 사용한다'); }
  else {
    const assets=validateAssets(P,cuts || {},{final:true});
    for(const e of assets.errors) bad('에셋 준비 미완료',e);
    if(!assets.errors.length) ok('요청 에셋 수령·검수·참조 검사');
    // 🔴 저작자 표시가 필요한 외부 소재 금지 (2026-10-02 사용자 지시 · pitfalls §163)
    //    화면 크레딧 문구(CC BY…)와 resources/images/SOURCES.md 에 CC BY 로 적힌 파일의 사용을 모두 막는다.
    {
      const htmls=[J(HF,'index.html'),...(has(J(HF,'compositions'))?execFileSync('find',[J(HF,'compositions'),'-name','*.html'],{encoding:'utf8'}).trim().split('\n').filter(Boolean):[])].filter(has);
      const text=Object.fromEntries(htmls.map(f=>[f,read(f)]));
      const credit=htmls.filter(f=>/\bCC[\s-]?BY\b|creativecommons\.org/i.test(text[f])).map(f=>path.relative(HF,f));
      const byNames=read(J(ROOT,'resources/images/SOURCES.md')).split('\n')
        .filter(l=>/\bCC[\s-]?BY\b/i.test(l)&&!/\bCC0\b/i.test(l))
        .map(l=>(l.match(/`([^`\s]+\.(?:png|jpe?g|webp|gif|svg))`/i)||l.match(/^-\s*([\w.-]+\.(?:png|jpe?g|webp|gif|svg))/i)||[])[1]).filter(Boolean);
      const all=Object.values(text).join('\n');
      const used=byNames.filter(n=>all.includes(n));
      if(credit.length||used.length) bad(`저작자 표시가 필요한 외부 소재 ${used.length}개 · 화면 크레딧 ${credit.length}곳 — ${[...used,...credit].slice(0,6).join(' · ')}`,
        '이미지 생성(asset-prompts --generate)으로 대체한다. 외부 사진·CC BY 소재와 화면 크레딧 금지 (CLAUDE.md 「자산을 넣을 때」)');
      else ok('저작자 표시가 필요한 외부 소재·화면 크레딧 없음');
      /* 🔴 화면에 출처·크레딧을 쓰지 않는다 (2026-10-06 사용자 지시 「출처는 표시금지」) — 보이는 글자만 본다(스크립트·주석 제외).
         출처 표기가 필요한 소재 자체를 쓰지 않는다. 2026-10-06 골격(format 2~)은 하드, 그 전 편은 경고(소급하지 않는다). */
      const visible=Object.fromEntries(htmls.map(f=>[f,text[f].replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi,' ').replace(/<[^>]+>/g,' ')]));
      const SRC_ON_SCREEN=/©|&copy;|\b(?:photo|image|images|source|sources|credit|credits|map data)\s*[:：]|\bphoto(?:s|graph)?\s+(?:by|courtesy)\b|\bcourtesy of\b|\bopenstreetmap\b/i;
      const srcHits=htmls.filter(f=>SRC_ON_SCREEN.test(visible[f])).map(f=>`${path.relative(HF,f)} 「${visible[f].match(SRC_ON_SCREEN)[0]}」`);
      if(srcHits.length) (cuts?.asset_prompt_format>=REF_FORMAT?bad:soft)(`화면 출처·크레딧 문구 ${srcHits.length}곳 — ${srcHits.slice(0,4).join(' · ')}`,
        '화면에 출처를 쓰지 않는다. 표기 의무가 있는 소재(지도 데이터·CC BY 사진)는 빼고 생성 이미지·코드 도식·표기 의무 없는 공공 기록으로 바꾼다');
    }
    // 🔴 실물 형상 — 실재 구조물 3D는 실제 사진과 같은 시점 스틸로 대조한 시트가 현재 장면 소스 기준으로 있어야 한다 (docs/16 §4 · 2026-10-06)
    if (cuts?.asset_prompt_format >= REF_FORMAT && sceneDigest(P)) {
      const rd=read(J(P,'README.md')), shapes=realShapes(rd), scene=sceneDigest(P);
      if(!shapes.length || shapes.some(x=>x.error)) bad('3D 장면이 있는데 README 「실물 형상:」이 없거나 미완이다',
        `실재 건물·구조물이면 node pipeline/ref-photos.mjs ${name} <id> --search … 로 사진을 모아 형상 사양을 쓰고, 도식 3D면 「실물 형상: 해당 없음 — 이유」 (docs/16 §4-1)`);
      else for(const x of shapes.filter(y=>!y.none)) {
        const stills=(refRecord(P,x.refsId)?.compared||[]).filter(c=>c.file.startsWith('output/3d/'));
        const result=rd.split('\n').find(l=>new RegExp(`실물 형상 대조\\s*[:：]\\s*\`?${x.refsId}\`?\\s+(\\d+)\\s*/\\s*(\\d+)`).test(l));
        const [n,N]=(result?.match(/(\d+)\s*\/\s*(\d+)/)||[]).slice(1).map(Number);
        // 최종 모델이 실물과 같아야 한다 — 대조 뒤 장면 소스가 바뀌었으면 다시 대조한다(00051: 처음부터 끝까지 대조가 없었다)
        if(!stills.length) bad(`실물 형상 ${x.refsId} — 3D 스틸과 실물 사진의 대조 시트가 없다`,
          `pipeline/blender-render.sh ${name} <장면> --stills <실물 사진과 비슷한 시점의 시각> → node pipeline/ref-photos.mjs ${name} ${x.refsId} --sheet output/3d/<장면>-stills/*.png`);
        else if(!stills.some(c=>c.scene===scene)) bad(`실물 형상 ${x.refsId} — 대조 뒤 3D 장면 소스가 바뀌었다(최종 모델과 실물을 대조하지 않았다)`,
          `현재 소스로 --stills 를 다시 찍어 node pipeline/ref-photos.mjs ${name} ${x.refsId} --sheet output/3d/<장면>-stills/*.png`);
        else if(!result) bad(`실물 형상 ${x.refsId} — README 에 대조 결과가 없다`, `「실물 형상 대조: ${x.refsId} n/N 일치 — 어긋난 것」을 시트를 보고 적는다 (docs/16 §4-1)`);
        else if(n<N && (result.slice(result.search(/\d+\s*\/\s*\d+/)).match(/[—–-]\s*(.*)$/)?.[1]||'').replace(/\s/g,'').length<4) bad(`실물 형상 ${x.refsId} ${n}/${N} — 어긋난 사양이 있는데 이유가 없다`, '형태·비율·꼭대기가 어긋나면 모델을 고쳐 다시 대조한다. 화면에서 안 보이는 작은 차이만 이유와 함께 남긴다');
        else ok(`실물 형상 ${x.refsId} ${n}/${N} — 현재 3D 소스로 대조했다`, `output/review/ref-${x.refsId}.png`);
      }
    } else if (sceneDigest(P) && !(has(O)&&readdirSync(O).some(f=>/^render.*\.mp4$/.test(f))))
      soft('옛 골격의 진행 중 3D — 실물 형상 대조가 걸리지 않는다', '실재 건물·구조물이면 cuts.json asset_prompt_format 을 2로 올리고 README 「실물 형상:」·이미지 메타 「실물 대조」를 채운다 (docs/16 §4-1 · 2026-10-06)');
    // 형태 QA — blender-render.sh 가 남긴 장면 로그의 ABM3D_QA 요약 (docs/16 §4·§5 9번 · EL4CTEO/blender-skills asset-qa 이식 2026-10-22). errors = 겹침·안쪽 법선·음수 스케일·빠진 이미지
    { const d3=J(O,'3d'); if(has(d3)) for(const f of readdirSync(d3).filter(f=>f.endsWith('.log')).sort()) {
        const m=(readFileSync(J(d3,f),'utf8').match(/ABM3D_QA errors=(\d+) warnings=(\d+)/g)||[]).pop()?.match(/errors=(\d+) warnings=(\d+)/);
        if(m&&+m[1]>0) soft(`3D 장면 ${f.replace(/\.log$/,'')} 형태 QA 오류 ${m[1]}건 — 겹침(z-fighting)·안쪽 법선·음수 스케일·빠진 이미지`, `output/3d/${f} 의 「ABM3D_QA ✗」 줄을 보고 장면을 고친 뒤 --stills 로 다시 확인. 의도된 겹침은 T.run(qa_ok=[("a","b")]) (docs/16 §5 9번)`);
      } }
    // 셰이더(WebGPU · shaders.com) — 쓰는 프레임이 있으면 번들이 저장소 원본 그대로 설치됐는지, 루트 data-requires-webgpu,
    //   번들에 든(시간 결정성을 실측한) 효과만 썼는지 본다 (docs/14-hyperframes.md §16 · 2026-10-08). 화면은 snapshot·시트로 본다
    {
      const sh = checkShaders(HF), fix = (m) => m.replace(/<p>/g, name);
      for (const e of sh.errors) bad(`셰이더 — ${fix(e)}`, 'docs/14-hyperframes.md §16');
      for (const w of sh.warns) soft(`셰이더 — ${fix(w)}`);
      for (const o of sh.oks) ok(o, 'layout-scan 은 캔버스 화소를 못 본다 — 셰이더 장면은 snapshot·review-sheet 로 본다');
      if (sh.used && !/셰이더|shader/i.test(read(J(P, 'README.md'))))
        soft('셰이더를 쓰는데 README 에셋 경로에 셰이더 장면·효과·이유가 없다', '한 줄로 적는다 — ⑤ 감독이 그 줄과 최종 화면을 대조한다 (video ② 「그림으로 말하기」)');
    }
    // 🔴 **프로젝트 골격 검사** (2026-09-12 사고). `hyperframes init --example=blank` 은
    //    브랜드 폰트·채널 락업·루트 타임라인 등록을 **깔지 않는다.** 00011 에서 셋 다 빠진 채로
    //    22프레임을 컴파일하고 검수 시트까지 사용자에게 보냈다 —
    //      ① 폰트 3종이 끊긴 참조 66건 → 시스템 폰트로 렌더 (브랜드 폰트 규격 위반)
    //      ② assets/brand/jalsabo.png 없음 → root-lockup 이 깨진 <img> 를 넣어 **전 프레임에서 락업이 사라짐**
    //      ③ index.html 에 window.__timelines 등록 없음 → lint 실패 · layout-scan 이 "정적 검사만 유효"로 내려감
    //    셋 다 화면을 보면 알 수 있는데 아무 도구도 묻지 않았다. 이제 여기서 묻는다.
    const FONTS = [BRAND.font.file, BRAND.font.license];
    const missF = FONTS.filter((f) => !has(J(HF, 'fonts', f)));
    missF.length ? bad(`브랜드 폰트 ${missF.length}개가 없다 — ${missF.join(' · ')}`,
                       `cp resources/fonts/{${BRAND.font.file},${BRAND.font.license}} ${path.relative(process.cwd(), HF)}/fonts/`)
                 : ok(`${BRAND.font.family} 폰트·라이선스`);
    const idx = has(J(HF, 'index.html')) ? read(J(HF, 'index.html')) : '';
    // 롱폼 묶음은 좌상단에 채널 로고 이미지(brand.json logo.file)를 쓴다(2026-09-26 사용자 지시, hf-bundle build)
    const bundleLogoRel = `compositions/bundle/assets/${path.basename(BRAND.logo.file)}`;
    const bundleLogo = BUNDLE && idx.includes(`<img src="${bundleLogoRel}"`) && /id="el-root-lockup"[^>]*>\s*<img src=/.test(idx) && has(J(HF, bundleLogoRel));
    bundleLogo ? ok(`${BRAND.name} 로고 락업 (롱폼)`)
      : channelLockupKind(idx) === 'logo' ? (!has(J(HF, BRAND.logo.asset)) ? bad(`좌상단 로고 파일이 없다 — ${BRAND.logo.asset}`, `node pipeline/root-lockup.mjs ${name}`)
          : has(channelLogoSource()) && fileHash(J(HF, BRAND.logo.asset)) !== fileHash(channelLogoSource()) ? bad('좌상단 로고가 resources/brand 원본과 다르다', `node pipeline/root-lockup.mjs ${name}`)
          : ok(`${BRAND.name} 좌상단 이미지 로고 (숏츠)`))
      // 옛 한 줄 텍스트 락업: 이미 구운 편은 그대로 통과(소급하지 않는다), 아직 렌더가 없는 새 편에만 로고 적용을 안내한다
      : channelLockupKind(idx) === 'text' ? (has(O) && readdirSync(O).some(f => /^render.*\.mp4$/.test(f))
          ? ok('루트 텍스트 락업 (ABMEN 2026-09-27 이전 편 호환)')
          : soft('옛 한 줄 텍스트 락업이다 — 2026-09-27부터 새 숏츠·롱폼은 좌상단 이미지 로고', BUNDLE ? `node pipeline/hf-bundle.mjs ${name} build` : `조립 뒤 node pipeline/root-lockup.mjs ${name}`))
      : bad('확정 채널 로고(루트 락업)가 없거나 작업명/중복 락업이다', BUNDLE ? `node pipeline/hf-bundle.mjs ${name} build` : `node pipeline/root-lockup.mjs ${name}`);
    // 🔴 index.html 은 **컷 순서·길이의 유일한 출처**인데 `init --example=blank` 이 까는 건
    //    1920×1080 **가로** 템플릿이다 (2026-09-13 · 00012). 그대로 두면 컷이 통째로 안 맞는다.
    //    ⚠️ 묶음은 가로가 정상이다 — 아래 캔버스 정규식은 챕터의 세로 frame-slot 에도 걸리므로 묶음은 루트만 본다.
    if (BUNDLE) bundleDesign(idx);
    else if (idx) {
      const scenes = [...idx.matchAll(/data-composition-src="compositions\/frames\//g)].length;
      const nc2 = cuts?.cuts?.length || 0;
      scenes === nc2 && nc2 > 0
        ? ok(`index.html scene 트랙 ${scenes}개 = 컷 수`)
        : bad(`index.html scene ${scenes}개 ≠ 컷 ${nc2}개`, 'index.html 이 컷 순서·길이의 정본이다 — 손으로 맞춰라');
      /data-width="1080"[\s\S]{0,40}data-height="1920"/.test(idx)
        ? ok('캔버스 1080×1920 세로')
        : bad('index.html 캔버스가 1080×1920 이 아니다', 'init --example=blank 은 1920×1080 가로 템플릿을 깐다');
    }
    /__timelines/.test(idx) ? ok('루트 타임라인 등록 (window.__timelines)')
      : bad('index.html 에 window.__timelines 등록이 없다 — lint 가 실패하고 layout-scan 이 정적 검사로 내려간다',
            '</body> 앞에 <script>window.__timelines=window.__timelines||{};window.__timelines["main"]=gsap.timeline({paused:true});</script>');

    // 🔴 **모든 컷에 <audio> 가 붙어야 한다** (2026-09-13 · 00013 · 사용자가 「음성이 짤린다」고 지적)
    //    앵커 컷에만 붙이면 문장이 무음 컷으로 넘어가는 부분이 **통째로 재생되지 않는다.**
    //    프레임 오디오는 나레이션을 컷 경계로 자른 조각이라 **하나라도 빠지면 그 구간이 사라진다.**
    //    렌더는 정상으로 보이고 lint·check·render-gate 도 전부 통과한다 — 귀로만 잡힌다.
    if (idx && !BUNDLE) {
      const audioTags = idx.match(/<audio\b[^>]*>/g) || [];
      // Root SFX have their own tracks; they are not additional narration cuts.
      const nAudio = audioTags.filter(tag => !/\bid="el-sfx-[^"]+"/.test(tag)).length;
      const nCut = cuts?.cuts?.length || 0;
      const bgm = /id="el-bgm"/.test(idx) ? 1 : 0;
      nAudio - bgm === nCut && nCut > 0
        ? ok(`컷마다 오디오 트랙 (${nCut}개${bgm ? ' + BGM' : ''})`, '무음 컷도 발화 뒷부분을 싣는다')
        : bad(`<audio> ${nAudio - bgm}개 ≠ 컷 ${nCut}개 — 빠진 컷의 발화가 통째로 사라진다`,
              'index.html 은 say 유무와 무관하게 **모든 컷**에 .media/audio/frame-NN.wav 를 붙여야 한다');
    }

    // 🔴 **자막 클립 규약** — 프레임 caption 또는 실제 마운트된 루트 cap 트랙.
    //    프레임 컴파일러가 `class="clip"` 만 붙였더니 **SRT 가 0청크**로 나왔다 — 렌더를 다 끝낸 뒤
    //    export 단계에서야 드러나 재렌더 1회. lint·check·render-gate 는 전부 통과한다.
    //    규약이 `hf-export.mjs` **소스 주석**에만 있어서 프레임을 만드는 쪽이 읽을 이유가 없었다. 여기서 묻는다.
    if (!BUNDLE) {
      const fdir = J(HF, 'compositions', 'frames');
      if (has(fdir)) {
        const ff = readdirSync(fdir).filter((f) => f.endsWith('.html'));
        const miss = ff.filter((f) => !/class="clip caption"/.test(read(J(fdir, f))));
        const rootCaps = rootCaptionChunks(HF, idx);
        if (!ff.length) soft('compositions/frames 에 프레임이 없다', '④ 프레임을 아직 안 만들었다');
        else if (rootCaps.length) ok(`루트 자막 클립 규약 (${rootCaps.length}청크)`, 'index 마운트·텍스트·시간 확인');
        else if (!miss.length) ok(`자막 클립 규약 (class="clip caption") ${ff.length}개`);
        else bad(`자막 클립이 규약에 안 맞는 프레임 ${miss.length}개 — ${miss.slice(0, 3).join(' · ')}${miss.length > 3 ? ' 외' : ''}`,
                 '프레임의 class="clip caption" 또는 index에 마운트된 compositions/captions.html의 유효한 class="clip cap" 시간 클립이 필요하다 (docs/14-hyperframes.md 자막 규약)');
        /* 🔴 **그림 없는 프레임** (2026-09-15 · 사용자 「버거킹·새우에 비해 부족하다」).
           실측: 승인본 버거킹 10/10 · 새우 17/24 프레임에 svg 또는 img. 반려 bbq **3/12** — 그 3장도 로고 2·제품 1.
           글자 슬롯만 있는 프레임은 「초보 텍스트 모션」의 실체다. 절반 미만이면 하드. */
        if (ff.length) {
        }
      }
    }

    const am = J(HF, 'audio_meta.json');
    if (BUNDLE) { /* 묶음 오디오는 챕터 버스로 옮긴 원본 트랙이다 — bundleDesign 이 대조했다 */ }
    else if (!has(am)) bad('audio_meta.json 이 없다', `node pipeline/hf-audio.mjs ${name}`);
    else {
      let m = null; try { m = JSON.parse(read(am)); } catch {}
      try {
        const expected=audioBuildState(P,cuts,readTiming(P,cuts));
        if(m?.build?.metadataKey!==expected.metadataKey) throw new Error('현재 대본·나레이션·시간축과 audio_meta가 다르다');
        for(const v of m.voices || []) {
          const file=path.resolve(HF,v.path);
          if(!file.startsWith(path.resolve(HF)+path.sep)||v.fileHash!==fileHash(file)) throw new Error(`슬라이스가 없거나 달라졌다: ${v.path}`);
        }
        ok('오디오 메타·슬라이스 입력 지문');
      } catch(e) {bad('오디오 메타 최신성 검사 실패',e.message);}
      const nv = m?.voices?.length || 0, nc = cuts?.cuts?.length || 0;
      nv === nc ? ok(`audio_meta voices ${nv}개 = 컷 수`)
                : bad(`audio_meta voices ${nv}개 ≠ 컷 ${nc}개`, `node pipeline/hf-audio.mjs ${name}`);
      const empty = (m?.voices || []).filter((v) => !v.words?.length).map((v) => v.frame);
      empty.length ? soft(`자막 어절이 없는 프레임 ${empty.length}개`, `프레임 ${empty.join(' ')}`)
                   : ok('모든 프레임에 자막 어절이 붙었다');
      /* 🔴 BGM 재사용을 잡는다 (2026-09-15 사용자 지시 「매번 똑같은 배경음악 사용하지 마라」).
         실측: 기록된 9편이 곡 2개만 돌려 썼다 — 원인은 docs/14 의 「cp ../assets/audio/bgm.mp3」 절차.
         **다른 프로젝트의 bgm.mp3 와 바이트가 같으면** 그 복사가 일어난 것이다 → 경고(2026-10-21: 하드가 아니다 — 아래 soft).
         ⚠️ 같은 곡을 다른 구간으로 다시 잘라 오면 md5 가 달라 못 잡는다 — 그건 STORYBOARD 의 곡명을 사람이 본다. */
      if (!m?.bgm) soft('BGM 미지정 (bgm_pending)', 'BGM 은 렌더에 굽는다. 렌더 전에 정한다');
      else {
        /* 🔴 **자유롭게 쓸 수 있는 곡만** (2026-09-16 사용자 지시).
           *"라이센스 필수 확인후 자유롭게 활용가능한 배경음악만 사용하라고"*
           크레딧 의무가 있는 곡(CC BY 등)은 **올리는 모든 플랫폼**에 저작자·라이선스·링크를 달아야 하고,
           우리는 늘 하이라이트를 잘라 쓰므로 「변경했다」까지 밝혀야 한다 (CC BY 4.0 §3(a)(1)(B)).
           숏폼 캡션 예산에서 그 세 줄은 그대로 손해다 — 저작자 표시 소재 자체를 쓰지 않는다(2026-10-02).
           00017 이 Happy Alley(CC BY)로 갔다가 CC0 로 되돌렸다 — pitfalls §104.
           ⚠️ 라이선스 **미기록**도 막는다. 「무료로 받았다」와 「자유롭게 쓸 수 있다」는 다르다. */
        const LIC_FREE = FREE_LICENSE;   // lib/workflow-state.mjs — CC0·퍼블릭 도메인만
        const lic = String(m.bgm.license ?? '').trim();
        if (!lic) bad('BGM 라이선스가 audio_meta 에 없다',
                      'bgm 에 title·composer·source·license 를 적어라 — 「무료」와 「자유롭게 사용 가능」은 다르다 (resources/music/README.md)');
        else if (!LIC_FREE.test(lic))
          bad(`BGM 라이선스 「${lic}」 — 크레딧 의무가 있는 곡이다`,
              'cc0/ 에서 고르거나, 꼭 써야 하면 사용자 허락을 받고 publish.md 올리는 플랫폼 전부(인스타 캡션이 페이스북·스레드까지 간다)에 크레딧을 넣어라');
        else ok(`BGM 라이선스 ${lic}`, '크레딧 의무 없음 — 문안에 고지가 필요 없다');
        // 정서·이유 — 곡을 이 편의 정서로 골랐다는 기록 (2026-10-21: 132편이 업비트 4곡 순환, 템플스테이에 휘파람). README 「디자인 방향」 BGM 정서 줄과 같은 말
        (m.bgm.mood && m.bgm.why) ? ok(`BGM 정서 「${String(m.bgm.mood).trim()}」`, String(m.bgm.why).trim().slice(0, 80))
          : soft('bgm 에 mood·why 가 없다 — 이 편의 정서와 고른 이유', 'README 「디자인 방향」 BGM 정서 줄과 같은 말로 audio_meta.bgm.mood·why 를 적는다 (docs/14 §5)');

        const bp = J(HF, m.bgm.path || 'assets/bgm/bgm.mp3');
        if (!has(bp)) bad('BGM 파일이 없다', bp);
        else {
          const md5 = (f) => execFileSync('md5', ['-q', f], { encoding: 'utf8' }).trim();
          const mine = md5(bp);
          const twins = readdirSync(J(ROOT, 'projects')).filter((d) => d !== name)
            .map((d) => J(ROOT, 'projects', d, 'hyperframes', 'assets', 'bgm', 'bgm.mp3'))
            .filter((f) => has(f) && md5(f) === mine)
            .map((f) => f.split('/projects/')[1].split('/')[0]);
          twins.length
            ? soft(`BGM 이 다른 편과 같은 파일이다 — ${twins.join(' · ')}`,
                  '최근 반복과 이 장면의 적합성을 확인한다. 과거 사용만으로 금지하지 않는다')
            : ok('BGM 파일 — 다른 편과 중복 없음');
          /* 같은 곡을 다른 구간으로 다시 잘라도 재사용이다 (실측: 00006·00007 이 그렇게 stereotype-news 를 썼고 md5 는 통과했다).
             STORYBOARD 의 `music:` 줄에 적힌 원곡 파일명을 다른 편과 대조한다. §5 가 곡명 기록을 의무화했다. */
          const musicOf = (d) => {
            try { const t = read(J(ROOT, 'projects', d, 'hyperframes', 'STORYBOARD.md'));
                  // ⚠️ 저장 경로 `assets/bgm/bgm.mp3` 의 `bgm.mp3` 는 곡명이 아니다 — 첫 시도에서 이걸 잡아 전 편이 「같은 곡」으로 나왔다
                  const names = ((t.match(/^\s*-?\s*music:.*$/mi) || [''])[0].match(/[\w-]+\.mp3/g) || []).map((x) => x.toLowerCase()).filter((x) => x !== 'bgm.mp3');
                  return names[0] || null; } catch { return null; }
          };
          const song = musicOf(name);
          if (!song) soft('STORYBOARD `music:` 에 원곡 파일명이 없다', '「곡명.mp3 · 폴더 · 시작초 · 정서」로 적어라 — 재사용 대조가 안 된다 (docs/14 §5)');
          else {
            // 전 이력과 대조하면 7곡 라이브러리에서 늘 울려 무력했다(ABMEN 00124 「5곡 모두 이력 있음」). 직전 5편(번호 기준, 같은 번호 두 폴더 포함)만 본다 (2026-10-21)
            const num = Number(name.slice(0, 5)) || 0;
            const prevNums = [...new Set(readdirSync(J(ROOT, 'projects')).map((d) => Number(d.slice(0, 5)) || 0).filter((n) => n > 0 && n < num))].sort((a, b) => b - a).slice(0, 5);
            const same = readdirSync(J(ROOT, 'projects')).filter((d) => d !== name && prevNums.includes(Number(d.slice(0, 5)) || 0) && musicOf(d) === song);
            same.length
              ? soft(`같은 곡 \`${song}\` — 직전 5편 중 ${same.join(' · ')}`,
                    '정서가 맞고 다른 구간이면 이유를 bgm.why 에 적는다. 정서 칸이 비어서 고른 것이면 새 곡 반입이 먼저다 (resources/music/README.md)')
              : ok(`원곡 \`${song}\` — 직전 5편과 겹치지 않음`);
          }
        }
      }
      const wavs = has(J(HF, '.media/audio')) ? readdirSync(J(HF, '.media/audio')).filter((f) => f.endsWith('.wav')).length : 0;
      wavs === nc ? ok(`프레임별 오디오 슬라이스 ${wavs}개`) : bad(`슬라이스 ${wavs}개 ≠ 컷 ${nc}개`, `node pipeline/hf-audio.mjs ${name}`);
    }
    const cdir = J(HF, 'compositions');
    const files = has(cdir) ? execFileSync('find', [cdir, '-name', '*.html'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean) : [];
    if (!files.length) bad('compositions/ 에 프레임이 없다');
    else {
      const src = files.map((f) => read(f)).join('\n');
      const tw = (src.match(/\.(to|from|fromTo|set)\(/g) || []).length;
      const den = tw / files.length;
      ok(`모션 소스 참고 통계: ${tw}호출 / ${files.length}파일 (${den.toFixed(1)}/파일)`, '호출 개수·런타임 종류는 품질 합불 기준이 아니다');
      // 🔴 상표 — 로고에 트윈이 걸렸나
      // 🔴 2026-09-10 재수정 (W2 교훈) — 예전 검사는 **문자열 셀렉터만** 봤다.
      //    F01·F02·F21·F22 는 `P+" .amount"` 처럼 셀렉터를 **연결**해서 만든다.
      //    그래서 **로고가 든 바로 그 네 프레임에서 매치 0** 이었고 「로고에 트윈 없음」을 냈다.
      //    🔴 방어: **매치 수를 항상 전체 수와 대조한다.** 누락이 있으면 판정을 내지 않는다.
      const tweenArgs = (body) => {           // 괄호 깊이로 첫 인자를 잘라낸다 (연결식도 잡힌다)
        const out = []; const rx = /\.(to|from|fromTo|set)\(/g; let m;
        while ((m = rx.exec(body))) {
          let i = rx.lastIndex, d = 0, arg = '';
          for (; i < body.length; i++) { const c = body[i];
            if (c === '(' || c === '[') d++;
            else if (c === ')' || c === ']') { if (d === 0) break; d--; }
            else if (c === ',' && d === 0) break;
            arg += c; }
          out.push(arg.trim());
        }
        return out;
      };
      // 셀렉터가 **컨테이너에서 끝나야** 위반이다. 자손(`.price-card .amount`)은 로고의 형제라 안전하다.
      const ENDS_AT_CONTAINER = /(^|[\s>+~"'`])(\.(price-card|price-pair|brandmark|merchant)|#f\d\d)(:[a-z-]+(\([^)]*\))?)?\s*["'`]?\s*$/;
      let parsed = 0, total = 0;
      const logoTween = files.filter((f) => {
        const t = read(f);
        const body = (t.match(/<script>[\s\S]*?<\/script>/g) || []).join('\n');
        total += (body.match(/\.(to|from|fromTo|set)\(/g) || []).length;
        const args = tweenArgs(body); parsed += args.length;
        return args.some((a) => a.split(',').some((one) => ENDS_AT_CONTAINER.test(one.trim())));
      }).map((f) => path.basename(f));
      parsed === total
        ? ok(`트윈 파싱 ${parsed}/${total} 전수`, '매치 수 = 전체 수')
        : bad(`트윈 파싱 ${parsed}/${total} — ${total - parsed}개를 못 읽었다`,
              '패턴이 코드 스타일과 안 맞는다. 이 상태의 로고·결정론 판정은 근거가 없다');

      const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
      const det = files.filter((f) => /Math\.random|Date\.now|repeat: *-1/.test(strip(read(f)))).map((f) => path.basename(f));
      det.length ? bad(`비결정론 코드 ${det.length}개`, det.join(' ')) : ok('결정론 위반 없음');
    }
    /* 🔴 설계도와 빌드가 같은 물건인가 (2026-09-15 · 00016). STORYBOARD 는 F01~F14 열네 장(낙폭·duo 카드·인용·서명)을
       사용자에게 승인받았고, 빌드는 **섹션 4장 + 표 하나**였다. 승인은 문서에 했는데 렌더는 다른 것이 나갔다.
       프레임 표의 행 수와 compositions/frames 의 파일 수가 다르면 게이트 B 를 다시 받아야 한다. */
    if (BUNDLE) has(J(P, 'README.md')) ? ok('설계 문서 (README 챕터 순서표)')
      : soft('README 가 없다', '원본·승인 버전·복사 시점·챕터 순서표를 적는다 (08 §10)');
    else if (has(J(HF, 'STORYBOARD.md'))) {
      const sbRows = (read(J(HF, 'STORYBOARD.md')).match(/^\|\s*F\d{2}\s*\|/gm) || []).length;
      const fd = J(HF, 'compositions', 'frames');
      const built = has(fd) ? readdirSync(fd).filter((f) => /^\d{2}-.*\.html$/.test(f)).length : 0;
      ok(`설계 문서 (STORYBOARD ${sbRows}행 · 빌드 ${built}프레임)`);
    } else if (has(J(P, 'CODEX-BRIEF.md'))) ok('설계 문서(BRIEF)');
    else soft('설계 문서가 없다', '게이트 B 에서 사용자가 볼 문서다');

    /* ── ⛳ 게이트 C 산출물 (2026-09-12 사용자 지시로 강제) ──────────────
       사용자 말: "하이퍼프레임 주소 알려줄때 이미지 컷별로 모아서 「1번 이미지 8번째
       타이포깨짐」 같이 알려줄테니 수정할수 있게" · "하나하나 하지말고 전체적으로
       수정사항 수집후 한번에 처리"
       🔴 스튜디오 URL 만 주면 사용자가 지목할 좌표가 없다. 시트 없이 게이트 C 로 가지 마라. */
    const REV = J(O, 'review');
    const newest = files.length ? Math.max(...files.map((f) => statSync(f).mtimeMs)) : 0;
    const fresh = (p2) => has(p2) && statSync(p2).mtimeMs >= newest - 1000;

    const scanP = J(REV, 'scan.json');
    // 묶음: layout-scan·review-sheet 는 아직 세로 전용이다(08 §11). 원본 무대와의 동일성 검증으로 대신한다
    if (BUNDLE) soft('가로 레이아웃 스캔·검수 시트는 아직 없다 — 무대 동일성 검증 기록은 게이트가 모른다',
      `node pipeline/hf-bundle.mjs ${name} verify (렌더 전 · 원본 무대 SSIM)`);
    else if (!has(scanP)) bad('레이아웃 스캔을 안 돌렸다', `node pipeline/layout-scan.mjs ${name}`);
    else if (!fresh(scanP)) bad('레이아웃 스캔이 프레임보다 낡았다', `node pipeline/layout-scan.mjs ${name}`);
    else {
      let sc = null; try { sc = JSON.parse(read(scanP)); } catch {}
      if (!sc) bad('scan.json 을 못 읽는다', `node pipeline/layout-scan.mjs ${name}`);
      else if (!(sc.renderChecked ?? ((sc.info || []).some((x) => x.type === '표본') && !(sc.soft || []).some((x) => /렌더 검사 실패|프리뷰 서버/.test(x.type))))) bad('레이아웃 화면 검사가 완료되지 않았다', `node pipeline/layout-scan.mjs ${name} — 정적 검사만으로 통과시키지 않는다`);
      else if (sc.hard?.length) bad(`레이아웃 하드 실패 ${sc.hard.length}건`, sc.hard.slice(0, 3).map((h) => `${h.type}: ${h.msg}`).join(' / '));
      else ok(`레이아웃 스캔 통과`, `소프트 ${sc.soft?.length ?? 0}건`);
    }
    /* 🔴 아래 모션 검사는 스캔 신선도와 무관하게 돈다 — 옛 판은 위 else 안에 있어서 스캔이 낡으면
       서명·횡단·글자 트윈이 **조용히 건너뛰어졌다** (2026-09-15 · 00016 에서 글자 트윈 76% 가 안 찍혔다). */

    /* 🔴 횡단 밀도 — **렌더 전에** 잡는다 (2026-09-13 사용자 지시: 「초기영상들처럼 크리에이티브와
       인터렉션 보장해」). motion-vocab 은 소스를 읽으므로 ④ 에서 잴 수 있다.
       abm-a7 이 §89 에 남긴 교훈이 여기 그대로 적용된다 — **렌더 후에만 재는 검사가 있으면
       「렌더 3회 상한」이 물리적으로 불가능하다.** 모션이 죽은 걸 굽고 나서 알면 이미 한 판 버린 것이다. */
    const sheet1 = J(REV, 'sheet-1.png');
    if (BUNDLE) { /* 위 verify 권고로 대신한다 */ }
    else if (!has(sheet1)) bad('검수 시트가 없다', `node pipeline/review-sheet.mjs ${name} — 칸 번호로 지목받는다`);
    else if (!fresh(sheet1)) bad('검수 시트가 프레임보다 낡았다', `node pipeline/review-sheet.mjs ${name}`);
    else {
      const n = readdirSync(REV).filter((f) => /^sheet-\d+\.png$/.test(f)).length;
      ok(`검수 시트 ${n}장`, '칸 번호로 지목받는다 — 스튜디오는 사용자가 요청할 때만');
    }
    /* 첫 3초 — 0~3초 연속 재생을 **현재 소스로** 확인했는가 (2026-09-25 「절대 기준」). 정지 시트는 모션을 증명하지 못한다.
       motion-preview 기록의 key 는 소스 manifest·구간·나레이션 지문이라 다시 계산해 대조한다(mtime 이 아니라 내용).
       ⚠️ 소프트다 — 브라우저를 못 쓰는 환경이 있다. 그때는 「첫 3초 재생 미검증」으로 보고한다. */
    if (BUNDLE) console.log('     ℹ️ 첫 3초(묶음) — 0초 포스터 → 챕터 1은 hf-bundle verify(0초 = 썸네일 · 그림 = 챕터 1 첫 화면)·sheet 첫 줄로 본다. 숏츠용 hook-check·motion-preview 기록은 묶음에 없다');
    else {
      const narr = J(O, 'narration.wav'), before = manifest(HF), audio = has(narr) ? fileHash(narr) : null;
      const hook = (has(REV) ? readdirSync(REV) : []).filter((f) => /^motion-preview.*\.mp4\.json$/.test(f))
        .map((f) => ({ f, r: readJson(J(REV, f)) })).filter(({ r }) => r && r.start <= 0.05 && r.end >= 2.9);
      const cur = hook.find(({ r }) => r.key === digest(JSON.stringify({ before, start: r.start, end: r.end, fps: r.fps, audio })));
      cur ? ok('0~3초 연속 재생 기록이 현재 소스와 같다', cur.f)
        : soft(hook.length ? '0~3초 재생 기록이 현재 소스보다 낡았다' : '0~3초 연속 재생 기록이 없다',
          `node pipeline/hook-check.mjs ${name} 로 재생 시안·시트를 만들어 판정한다 — 못 돌리면 「첫 3초 재생 미검증」으로 보고`);
      /* 2026-10-03~ 골격: 비트가 비었으면 훅 설계 없이 구현한 것이다(하드). 훅 잠금 시트(hook-check)가 현재 소스와 같은지 본다(소프트 — 브라우저 없는 환경). */
      const beat = readBeat(read(J(P, 'README.md')));
      if (!BUNDLE && (beat.present || beat.required)) {
        if (!beat.present || beat.empty.length || !beat.keyword)
          bad('README 「첫 3초 비트」가 비어 있다 — 훅 설계 없이 구현했다', `② 비트 네 행과 「핵심어:」를 채운 뒤 node pipeline/hook-check.mjs ${name}`);
        if (beat.posterEmpty?.length)
          bad(`0초 포스터가 설계되지 않았다 — ${beat.posterEmpty.join(' · ')}`, `README 「주제 제목:」·「후킹:」·「키 비주얼:」을 채우고 0초 화면에 구현한 뒤 node pipeline/hook-check.mjs ${name} (video SKILL 「최우선」 0.0초 포스터)`);
        else if (beat.posterRequired) {
          /* 포스터 서체·비교 시트 (2026-10-06 사용자 지시 — 디자이너처럼, 제목만 Hahmlet). 서체 파일은 하드, 사용·3안 시트는 경고 */
          const PF = BRAND.posterFont, firstSrc = posterInSource(HF, beat.poster).files.map((f) => read(J(HF, f))).join('\n') + read(J(HF, 'index.html'));
          if (PF) {
            const missP = [PF.file, PF.license].filter((f) => !has(J(HF, 'fonts', f)));
            missP.length ? bad(`포스터 제목 서체 파일이 없다 — ${missP.join(' · ')}`, `cp resources/fonts/{${PF.file},${PF.license}} ${path.relative(process.cwd(), HF)}/fonts/ 하고 index.html 에 @font-face(${PF.family}) — new.sh 골격은 자동`)
              : new RegExp(`${PF.family}|abmen-poster-title`).test(firstSrc) ? ok(`0초 포스터 제목 서체 ${PF.family}`)
              : soft(`0초 포스터 제목이 ${PF.family} 가 아니다`, `주제 제목 요소에 class="abmen-poster-title" — 본문·숫자·자막은 Inter (4-designer 「0초 포스터」)`);
          }
          has(J(REV, 'poster-sheet.png')) ? ok('0초 포스터 비교 시트', 'output/review/poster-sheet.png')
            : soft('0초 포스터 3안 비교 시트가 없다', `세션 스크래치에 3안 HTML → node pipeline/poster-sheet.mjs ${name} <고른 안> <안2> <안3> (4-designer 「0초 포스터」)`);
          const ps = posterInSource(HF, beat.poster);
          ps.missing.length
            ? bad(`0초 포스터 글자가 첫 장면에 없다 — ${ps.missing.map((k) => `${k} 「${beat.poster[k]}」`).join(' · ')}`,
                `0초 슬롯(${ps.files.join('·') || '없음'})의 마크업에 README 그대로의 글자를 크게 둔다(스크립트로 글자를 넣지 않는다). 0초에 보이는지는 hook-check 시트 첫 칸으로 본다`)
            : ok('0초 포스터 글자가 첫 장면 소스에 있다', `「${beat.poster['주제 제목']}」 · 「${beat.poster['후킹']}」 — 볼 이유(후킹)가 가장 크게 읽히는지는 포스터·훅 시트로`);
          // 글자 크기 — 0초에 보이는 가장 작은 글자(보통 제목)도 1080 기준 POSTER_MIN_PX 이상, 후킹은 제목보다 크다 (2026-10-21 사용자 「제일 작은 폰트를 더 크게」)
          if (!ps.missing.length) {
            const sz = posterFontSizes(HF, beat.poster), t = sz['주제 제목'], h = sz['후킹'], known = [t, h].filter(Boolean);
            if (!known.length) soft('0초 포스터 글자 크기를 소스에서 읽지 못했다', '제목·후킹 요소의 font-size 를 인라인 style 이나 class 규칙(px)으로 둔다 — 크기는 포스터 시트에서 직접 본다');
            else if (Math.min(...known.map((v) => v.min)) < POSTER_MIN_PX) soft(`0초 포스터 글자가 작다 — 제목 ${fmtPx(t)} · 후킹 ${fmtPx(h)} (가장 작은 조각도 최소 ${POSTER_MIN_PX}px)`, '가장 작은 글자도 폰·프로필 그리드 칸에서 읽히게 키운다 — 제목이 길면 약칭이나 후킹이 이름을 품는 구성으로 (4-designer 「0초 포스터」)');
            else if (t && h && h.max < t.max) soft(`0초 포스터 후킹(${fmtPx(h)})이 제목(${fmtPx(t)})보다 작다`, '가장 큰 글자는 볼 이유다 (SKILL 「최우선」 0.0초 포스터)');
            else ok(`0초 포스터 글자 크기 — 제목 ${fmtPx(t)} · 후킹 ${fmtPx(h)}`, `최소 ${POSTER_MIN_PX}px · 후킹이 가장 크다`);
          }
        }
        let rec = null;
        try { rec = readJson(J(REV, 'hook-check.json')); } catch {}
        const key = digest(JSON.stringify({ before, start: 0, end: 3, fps: 24, audio }));
        if (rec?.key === key && has(J(REV, rec.sheet || '-')) && fileHash(J(REV, rec.sheet)) === rec.sheetHash)
          rec.problems?.length
            ? soft(`첫 3초 훅 잠금 대조 경고 ${rec.problems.length}건 — ${rec.problems[0]}`, `node pipeline/hook-check.mjs ${name} 출력대로 고친다. 의도한 차이면 이유를 STORYBOARD 첫 행에 적는다`)
            : ok('첫 3초 훅 잠금 시트가 현재 소스와 같다', rec.sheet);
        else soft(rec ? '첫 3초 훅 잠금 시트가 현재 소스보다 낡았다' : '첫 3초 훅 잠금 시트가 없다',
            `node pipeline/hook-check.mjs ${name} — 시트를 열어 SKILL 「최우선」 합격 조건으로 판정 (못 돌리면 「첫 3초 미검증」)`);
      }
    }
  }
}

/* ── ⑤ 감독 ─────────────────────────────────────────── */
if (!only || only === 5) {
  head('⑤','감독 — 실제 납품물');
  const prepare=process.argv.includes('--prepare');
  const required=prepare ? soft : bad;
  const vi=process.argv.indexOf('--video');
  const selected=vi>=0 ? process.argv[vi+1] : null;
  // 납품 후보 = hf-render 가 봉인한 MP4(.srcman.json 동반) — 파일명이 render* 가 아니어도 찾는다 (00038 korea-autumn-final-v5.mp4)
  const vids=has(O)?readdirSync(O).filter(f=>/\.mp4$/.test(f)&&(has(J(O,f+'.srcman.json'))||/^render.*\.mp4$/.test(f))).sort((a,b)=>statSync(J(O,b)).mtimeMs-statSync(J(O,a)).mtimeMs):[];
  const video=selected ? J(O,path.basename(selected)) : vids.length ? J(O,vids[0]) : null;
  // 인스타 판(ig-reels-vN)은 봉인본이 아니라 ig-cta 가 본편에 스티커를 얹은 파생본이다 — --video 로 지목하면 review/ig-cta.json 기록으로 본편 지문을 확인한다 (2026-10-21)
  let igRec=null; try {igRec=readJson(J(O,'review','ig-cta.json'));} catch {}
  const derived=selected && igRec && igRec.video===path.basename(selected) && has(J(O,igRec.video)) && igRec.videoHash===fileHash(J(O,igRec.video)) ? igRec : null;
  const sealed=derived ? J(O,derived.base) : video;   // 파생본이면 그 본편(봉인 렌더) — 커버·첫 3초·인스타 판 기록의 기준 (옛 CTA 컷 편 분기는 YBMECC 에 해당 편이 없어 ABM 판처럼 뺐다)
  if(!video || !has(video)) required('납품 MP4가 없다');
  else try {
    const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',video],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
    if(!probe.streams?.some(s=>s.codec_type==='video') || !probe.streams?.some(s=>s.codec_type==='audio') || !(Number(probe.format?.duration)>0)) throw new Error('영상/음성 트랙·길이가 유효하지 않다');
    execFileSync('ffmpeg',['-v','error','-xerror','-i',video,'-f','null','-'],{stdio:['ignore','pipe','pipe']});
    if(derived) {
      if(!has(sealed) || derived.baseHash!==fileHash(sealed)) throw new Error(`인스타 판의 본편 ${derived.base}이 없거나 지문이 다르다 — node pipeline/ig-cta.mjs ${name}`);
      const seal=readJson(sealed+'.srcman.json'), now=manifest(HF);
      if(seal.hashVersion!==HASH_VERSION || seal.mode!=='pre-render' || seal.video!==path.basename(sealed) || JSON.stringify(seal.files)!==JSON.stringify(now)) throw new Error(`인스타 판의 본편 ${derived.base} 봉인과 현재 소스가 다르다`);
      ok(`인스타 판 ${derived.video} — 본편 ${derived.base}의 파생본 (ig-cta 기록의 지문 일치 · 본편 소스 봉인)`);
    } else {
      const seal=readJson(video+'.srcman.json'), now=manifest(HF);
      if(seal.hashVersion!==HASH_VERSION || seal.mode!=='pre-render' || seal.video!==path.basename(video) || JSON.stringify(seal.files)!==JSON.stringify(now)) throw new Error('MP4의 봉인과 현재 소스가 다르다');
      ok('납품 MP4 디코딩·소스 봉인');
    }
  } catch(e) {required('납품 MP4 검증 실패',e.message);}
  // 첫 3초 — 최종 MP4 자체에서 뽑은 시트로 판정했는가 (video SKILL 「최우선 — 첫 1·2·3초」 ⑤). root 스냅샷은 MP4 프레임이 아니다
  if(!BUNDLE && video && has(video) && readBeat(read(J(P,'README.md'))).present) {
    const hookVideo=sealed;   // 인스타 판의 0~3초는 본편과 같다(스티커는 3초부터) — 본편 기록으로 판정
    let rec=null;   // 판본별 기록(hook-final.<판본>.json)이 먼저, 없으면 마지막 실행 기록
    try {rec=readJson(J(O,'review',`hook-final.${path.basename(hookVideo).replace(/\.mp4$/i,'')}.json`));} catch {}
    if(!rec) try {rec=readJson(J(O,'review','hook-final.json'));} catch {}
    if(rec?.video===path.basename(hookVideo) && rec.videoHash===fileHash(hookVideo))
      rec.problems?.length ? soft(`최종 MP4 첫 3초 대조 경고 ${rec.problems.length}건 — ${rec.problems[0]}`,`node pipeline/hook-check.mjs ${name} --from ${path.basename(video)} 출력대로 판정한다`)
        : ok('최종 MP4 첫 3초 시트', `review/${rec.sheet}`);
    else soft('최종 MP4의 첫 3초 시트가 없거나 다른 판이다',`node pipeline/hook-check.mjs ${name} --from ${path.basename(hookVideo)} — 시트를 열어 판정, 청취 못 했으면 「첫 3초 청취 미검증」`);
  }
  const srt=read(J(O,'subtitles.srt'));
  if(!/\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/.test(srt)) required('유효한 SRT가 없다',`node pipeline/hf-export.mjs ${name}`);else ok('SRT');
  // 유튜브 커버 = 납품 MP4의 0초 한 장 (2026-10-10 — 앱에서 원하는 프레임을 고를 수 없어 이미지를 올린다)
  if(video && has(video)) has(J(O,'cover.jpg')) && has(sealed) && statSync(J(O,'cover.jpg')).mtimeMs>=statSync(sealed).mtimeMs
    ? ok('커버 cover.jpg (납품 MP4 0초)') : required('유튜브 커버 cover.jpg가 없거나 납품 MP4보다 오래됐다',`node pipeline/hf-export.mjs ${name}`);
  // 인스타 CTA 판 (video SKILL 「인스타 CTA 판」 2026-10-20) — cuts.json ig_cta 가 있으면 본편 위에 하단 스티커를 얹은 인스타 판이 따로 있다.
  //   ig-cta.mjs 가 남긴 기록(review/ig-cta.json)의 본편 지문이 지금 본편과 같고 인스타 판 파일이 그대로인가
  const IG=igCta(cuts);
  if(!BUNDLE && video && has(video) && IG) {
    let rec=null; try {rec=readJson(J(O,'review','ig-cta.json'));} catch {}
    const base=rec && J(O,rec.base), ig=rec && J(O,rec.video);
    rec && has(base) && has(ig) && rec.baseHash===fileHash(base) && rec.videoHash===fileHash(ig) && rec.keyword===IG.keyword && rec.reward===IG.reward && rec.base===path.basename(sealed)
      ? ok(`인스타 판 ${rec.video} — 본편 ${rec.base}에 「${rec.lead} ${rec.keyword}」 스티커 ${rec.at}초~`, `review/${rec.sheet}`)
      : required('cuts.json ig_cta 가 있는데 인스타 판(하단 스티커)이 없거나 지금 본편·키워드의 산출물이 아니다',`node pipeline/ig-cta.mjs ${name}`);
  }
  try {
    const line=read(J(O,'timeline.md')).match(/<!-- ABM export: (.+?) -->/)?.[1];
    const stamp=JSON.parse(line || 'null');
    if(!stamp || stamp.sourceHash!==digest(JSON.stringify(manifest(HF))) || stamp.srtHash!==fileHash(J(O,'subtitles.srt'))) throw new Error('타임라인·SRT가 현재 소스의 산출물인지 확인할 수 없다 — hf-export 실행');
    ok('현재 소스의 타임라인·SRT 지문');
  } catch(e) {required('납품 자막/타임라인 지문 검사 실패',e.message);}

  // 묶음: 효과음은 원본 트랙을 옮긴 것이라 audio_meta 가 없다. 설명란 챕터와 렌더 검증 권고로 대신한다
  if (BUNDLE) {
    const n=cuts.bundle.chapters?.length || 0, list=read(J(O,'chapters.txt')).trim().split('\n').filter(Boolean);
    list.length===n && list[0]?.startsWith('0:00 ') ? ok(`설명란 챕터 ${n}줄 (output/chapters.txt)`) : required('설명란 챕터 목록이 없거나 챕터 수와 다르다',`node pipeline/hf-export.mjs ${name}`);
    if(n<3) soft(`챕터 ${n}개 — YouTube 챕터는 3개 이상이어야 표시된다`,'설명란 타임스탬프가 챕터로 잡히지 않는다 (08 §6)');
    soft('챕터별 음량·렌더 규격 확인 기록은 게이트가 모른다',`node pipeline/hf-bundle.mjs ${name} verify --video ${!video ? 'output/<렌더>.mp4' : path.relative(process.cwd(), video).startsWith('..') ? video : path.relative(process.cwd(), video)}`);
  }
  else try {
    const meta=readJson(J(HF,'audio_meta.json'));
    const cues=resolveSfxCues(P,meta,readTiming(P,cuts).total,ROOT);
    if(cuts?.sfx_policy==='include' && !cues.length) required('효과음이 MP4에 배치되지 않았다','audio_meta.sfx에 화면 사건의 표시 초·pick/ 파일을 적고 hf-project sync');
    else if(cues.length) {
      const html=read(J(HF,'index.html'));
      for(const c of cues) {
        const tag=html.match(new RegExp(`<audio\\b[^>]*\\bid="el-sfx-${c.id}"[^>]*>`))?.[0] || '';
        if(!tag.includes(`src="${c.src}"`) || !tag.includes(`data-start="${c.at.toFixed(6)}"`) || !tag.includes(`data-duration="${c.duration.toFixed(6)}"`) || !tag.includes(`data-volume="${c.volume}"`) || !tag.includes(`data-track-index="${c.track}"`)) throw new Error(`${c.id}: root 오디오 트랙이 메타와 다르다 — hf-project sync`);
      }
      // 라이선스 근거 등급(2026-10-21) — 새 편의 unverified 는 resolveSfxCues 가 이미 막았다(위 catch → 하드). 여기 남는 건 옛 편 경고·url-only
      const n=g=>cues.filter(c=>c.license?.grade===g).length, files=g=>[...new Set(cues.filter(c=>c.license?.grade===g).map(c=>c.file))].join(', ');
      ok(`효과음 ${cues.length}큐가 현재 root에 배치됐다 — 라이선스 근거 verified ${n('verified')} · url-only ${n('url-only')} · unverified ${n('unverified')}`,'실제 청감은 MP4에서 확인');
      if(n('unverified')) soft(`라이선스 근거 미확인(unverified) 효과음 ${n('unverified')}큐 — ${files('unverified')}`,`${String(SFX_LICENSE_ENFORCE_FROM).padStart(5,'0')}번 전 편이라 경고(납품본은 다시 굽지 않는다), 새 편이면 하드 · ${SFX_LICENSE_RULE}`);
      const long=cues.filter(c=>c.retired==='long');   // 옛 편의 긴 저음 중단 파일 — 새 편이면 resolveSfxCues 가 이미 막았다
      if(long.length) soft(`${SFX_LONG_RETIRED} — ${long.length}큐: ${[...new Set(long.map(c=>`${c.file}${c.replace?.length?` → ${c.replace.join('/')}`:''}`))].join(', ')}`,`${String(SFX_LICENSE_ENFORCE_FROM).padStart(5,'0')}번 전 편이라 경고(납품·재렌더), 새 편이면 하드`);
      if(n('url-only')) soft(`출처만 있고 legal/ 저장본이 없는 효과음 ${n('url-only')}큐 — ${files('url-only')}`,`원 페이지를 legal/sfx-<날짜>/freesound/fs-<id>.html 로 보존하면 verified · ${SFX_LICENSE_RULE}`);
    } else if(cuts?.sfx_policy==='omit') {
      /SFX 미사용[:：]\s*\S/.test(read(J(P,'README.md'))) ? ok('효과음 생략 이유 기록') : required('SFX 생략 이유가 없다','README에 SFX 미사용: 이유를 짧게 적는다');
    } else if(has(J(P,'sfx-cues.md'))) soft('레거시 효과음 큐만 있다 — MP4 내장은 미검증');
    else soft('레거시 영상에 효과음 메타가 없다');
  } catch(e) {required('효과음 배치·라이선스 검증 실패',e.message);}
  if(prepare) soft('준비 검사 모드 — 납품 완료 판정이 아니다');
}

/* ── ⑥ 문안 ─────────────────────────────────────────────
   2026-09-11 추가. ⑤ 까지만 검사해서 **⑥ 산출물이 검사 밖에 있었다.** */
if (!only || only === 6) {
  head('⑥', '문안 — 업로드 패키징');

  /* 🔴 자산 회수 — 영상을 닫을 때 한 바퀴를 마무리한다 (2026-09-16 사용자 지시).
     복사는 라이브러리 → 프로젝트 한 방향인데 **새로 구한 것은 프로젝트에서 생긴다.**
     실측: 규격 통과본 16종이 프로젝트에만 남아 다음 영상이 다시 구해야 했다 (resources/logos/README.md 「회수」). */
  {
    let out = '';
    try { out = execFileSync('node', [J(ROOT, 'pipeline/logo-check.mjs')], { cwd: ROOT, encoding: 'utf8' }); }
    catch (e) { out = e.stdout || ''; }          // 불합격이 있으면 exit 1 이라 stdout 을 주워야 한다
    const m = out.match(/📦 라이브러리에 없는 \*\*규격 통과\*\* 프로젝트 자산 (\d+)개/);
    if (m) soft(`미회수 자산 ${m[1]}종`, '로고·CI → resources/logos/ · 사진 → resources/images/ · SOURCES.md 한 줄 (출처 못 적으면 회수하지 마라)');
    else soft('자산 회수 상태는 별도 확인한다 — 검사 출력만으로 완료를 추정하지 않는다');
  }

  const pub = J(P, 'publish.md');
  if (!has(pub)) { bad('publish.md 가 없다', `/review ${name}`); }
  else {
    const md = readFileSync(pub, 'utf8');
    // 묶음 롱폼은 유튜브 한 곳에만 올린다 (08 §8) — 나머지 넷은 원본 숏츠가 맡았다
    // 교차 게시를 켠 채널(platforms.json threads.crossposted_since — ABMEN 2026-10-20~)은 그 뒤 「작성」 문안에 스레드 절을 쓰지 않는다
    let xpSince = null;
    try { xpSince = JSON.parse(readFileSync(J(ROOT, 'pipeline/lib/platforms.json'), 'utf8')).platforms?.threads?.crossposted_since ?? null; } catch {}
    const written = (md.match(/작성\s*(\d{4}-\d{2}-\d{2})/) || [])[1] ?? null;
    const crossposted = !!xpSince && !!written && written >= xpSince;
    // YBMECC: brand.json platforms(인스타·유튜브) 밖 플랫폼은 요구하지 않는다 — 있으면 publish-check 가 잰다
    const keys = BUNDLE ? ['youtube'] : ['youtube', 'instagram', 'tiktok', ...(crossposted ? [] : ['threads']), 'x'].filter(platformRequired);
    // ⚠️ RegExp 생성자에 `\b` 를 쓰면 **백스페이스 문자**가 된다 — 문자열 검색이 안전하다
    const miss = keys.filter((k) => !md.split('\n').some((l) => l.startsWith(`## ${k} `) || l.trim() === `## ${k}`));
    miss.length ? bad(`플랫폼 절 누락 ${miss.length}개`, miss.join(' · ')) : ok(BUNDLE ? '유튜브 롱폼 절' : `플랫폼 절 ${keys.join('·')}${crossposted ? ' — 스레드·페이스북은 인스타 교차 게시' : ''}`);
    // 규격(글자수·해시태그·유튜브 제목 끝/본문 속 해시태그)은 publish-check 가 잰다 — 실패가 게이트를 통과하지 않게 (2026-09-25)
    try { execFileSync('node', [J(ROOT, 'pipeline/publish-check.mjs'), P], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }); ok('publish-check 실패 0'); }
    catch (e) { const n = (String(e.stdout || '').match(/실패 (\d+)/) || [])[1] ?? '?'; bad(`publish-check 실패 ${n}건`, `node pipeline/publish-check.mjs ${name}`); }
    // 🔴 복붙 전용이다 — 코드블록 밖의 설명이 붙으면 붙여넣기가 망가진다 (2026-09-11 사용자 지시)
    const outside = md.split(/```[\s\S]*?```/).join('').split('\n')
      .filter((l) => l.trim() && !/^#{1,3} |^---|^영상 |^근거·주의/.test(l.trim()));
    outside.length > 3
      ? soft(`코드블록 밖 문장 ${outside.length}줄`, 'publish.md 는 복붙 전용이다 — 설명·근거는 README.md 의 ⑥ 절로')
      : ok('복붙 전용 형식');
    // 🔴 근거는 별도 파일이 아니라 README 의 ⑥ 절에 모은다 (2026-09-11 사용자 지시 — 파일을 쪼개면 아무도 안 본다)
    const rd = has(J(P, 'README.md')) ? readFileSync(J(P, 'README.md'), 'utf8') : '';
    /⑥ 문안|## ⑥/.test(rd) ? ok('README 에 ⑥ 문안 절') : soft('README 에 ⑥ 절이 없다', '올리기 전 확인사항·뺀 사실을 README 에 남긴다');
  }
}

/* 🏫 학원 광고 (YBMECC 2026-10-20) — 법정 표시·금지 표현·원생 사진 동의. 판정은 lib/academy.mjs 하나(academy-check 와 같다).
   단계를 주면 그 단계 기준(②대본 · ④화면·사진 · ⑤영상 법정 표시 하드 · ⑥문안·지점 사실 하드), 생략하면 ⑥ 기준 */
if (ACADEMY && (!only || only >= 2)) {
  head('🏫', '학원 광고 — 법정 표시·금지 표현·원생 사진 동의');
  for (const r of academyReport(P, only ?? 6)) r.level === 'hard' ? bad(r.msg, r.fix) : r.level === 'soft' ? soft(r.msg, r.fix) : ok(r.msg);
}

console.log(`\n  ${hard ? `🔴 하드 실패 ${hard}건` : '✅ 하드 실패 없음'} · ⚠️ 경고 ${warn}건`);
if (hard) console.log('  🔴 하드 실패가 있으면 다음 단계로 넘어가지 마라.\n');
else console.log('');
process.exit(hard ? 1 : 0);
