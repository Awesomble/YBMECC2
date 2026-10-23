#!/usr/bin/env node
/* 에셋 이미지 — README 「## 에셋 생성 요청」의 영문 고정 형식 프롬프트를 검사하고, Codex 내장 image_gen 으로 생성한다
 *   (2026-09-16 신설 · 2026-09-27 형식 고정 · 2026-10-02 생성 자동화: 사용자 ChatGPT 구독으로 로그인된 Codex CLI
 *    · 2026-10-06 실물 대조: "리서치해서 실제 이미지 찾아서 재생성해 너무 사실성없고 실제이미지와 너무 달라서 현실감이 없어")
 *
 *   node pipeline/asset-prompts.mjs <p> --lint                   형식 검사만 (한글·라벨 순서·비율·픽셀 수·메타 줄·실물 대조)
 *   node pipeline/asset-prompts.mjs <p> --generate [--only=a,b] [--force]
 *        형식 검사 → 실물 사진 확인 → 생성(새 이미지 병렬) → 편집(참조 첨부 에셋을 붙여) → 제목의 경로로 복사 → cuts.json status received
 *   node pipeline/asset-prompts.mjs <p> --check                  에셋 상태·경로·크기·승인 지문 검사
 *   node pipeline/asset-prompts.mjs <p> --accept=<id> --confirm-visual   실물 대조 시트·실제 화면 검수 후 승인 지문 기록
 *
 * 실물 대조(asset_prompt_format 2~, lib/refs.mjs): 실재 대상을 그리는 에셋은 ref-photos.mjs 로 실제 사진 3장 이상을 먼저 보고
 * 식별 특징을 프롬프트에 옮긴다. 생성 뒤 ref-photos --sheet 로 실물과 나란히 대조해야 승인된다.
 * 🔴 실물 사진은 생성기에 첨부하지 않는다 — 「참조 첨부」는 우리가 만든 에셋·공식 원본만이다.
 *
 * 형식의 정본은 .claude/skills/video/stages/2-architect.md 「이미지 생성 요청」이다.
 * 실측 함정(pitfalls §164): codex exec 은 표준입력이 열려 있으면 "Reading additional input from stdin..."에서
 * 영원히 기다린다 → stdin 을 닫는다. `-i <파일> "프롬프트"` 는 -i 가 가변 인자라 프롬프트를 파일로 먹는다 → --image=<파일>.
 * 결과 파일은 $CODEX_HOME/generated_images/<session id>/ 에 생기고 출력의 `session id:` 줄로 찾는다.
 * --ephemeral: 한 장마다 ~/.codex/sessions 5~7MB·thread_history 약 2.5MB가 쌓이던 것을 남기지 않는다(세션 id·PNG는 그대로, dm/bot/linkbot.mjs와 같음 · 2026-10-18).
 * 모델은 ~/.codex/config.toml 기본값(대화용)을 따르지 않고 gpt-6.1-sol · xhigh 로 고정한다 (2026-10-08 사용자 지시 「sol + xhigh」 · ABM과 동일).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveProject } from './lib/project.mjs';
import {assetFiles,assetDimensions,validateAssets} from './lib/asset-state.mjs';
import {fileHash} from './lib/workflow-state.mjs';
import {REF_FORMAT, REF_MIN, parseReal, uniqueRefImages, refRecord} from './lib/refs.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const { dir: DIR, name: NAME } = resolveProject(argv.find((a) => !a.startsWith('--')),
  { usage: '사용: node pipeline/asset-prompts.mjs <프로젝트> [--lint | --generate [--only=a,b] [--force] | --check | --accept=<id> --confirm-visual]' });

if (['--lint','--generate','--check'].filter((f) => argv.includes(f)).length > 1) {
  console.error('✗ --lint·--generate·--check는 각각 실행한다.');
  process.exit(1);
}
if (argv.includes('--from-readme')) {
  console.error('✗ --from-readme(사용자에게 넘길 주문서 내보내기)는 2026-10-02 폐기됐다 — 형식 검사는 --lint, 생성은 --generate.');
  process.exit(1);
}

const accept=argv.find(a=>a.startsWith('--accept='))?.split('=')[1];
if(accept || argv.includes('--check')) {
  const projectFile=path.join(DIR,'cuts.json'), project=JSON.parse(readFileSync(projectFile,'utf8'));
  if(accept) {
    if(!argv.includes('--confirm-visual')) {console.error('✗ 실제 이미지를 열어 소재·구도·화풍·합성을 확인한 뒤 --confirm-visual로 기록한다');process.exit(1);}
    const a=project.assets?.find(a=>a.id===accept);
    if(!a) {console.error('✗ cuts.json assets에 에셋 ID가 없다');process.exit(1);}
    const files=assetFiles(DIR,a);
    if(!existsSync(files.render)) {console.error(`✗ ${accept}: 렌더 경로에 파일이 없다 — hyperframes/${a.render_file} 로 복사한 뒤 승인한다`);process.exit(1);}
    assetDimensions(files.render);
    // 🔴 실물 대조 — 실재 대상을 그린 에셋은 실제 사진과 나란히 본 대조 시트가 지금 파일로 있어야 승인한다 (2026-10-06)
    if(project.asset_prompt_format>=REF_FORMAT) {
      const req=parseRequests(), r=req.assets?.find(x=>x.id===accept)?.real;
      if(req.errors?.length) {console.error(req.errors.map(e=>'✗ '+e).join('\n'));process.exit(1);}
      if(r && !r.none) {
        const rec=refRecord(DIR,r.refsId), hash=existsSync(files.source)?fileHash(files.source):null;
        if(!rec?.compared?.some(c=>c.hash===hash)) {
          console.error(`✗ ${accept}: 실물 대조 시트에 지금 파일이 없다 — node pipeline/ref-photos.mjs ${NAME} ${r.refsId} --sheet ${a.file}\n  시트를 열어 README 식별 특징을 한 줄씩 대조하고 「### 수령 검수」에 「${accept}: 식별 특징 n/N 일치 — 어긋난 것」을 적은 뒤 다시 승인한다`);
          process.exit(1);
        }
        // 대조 결과가 README 에 남아야 한다 — 다 맞지 않으면 남긴 이유가 있어야 한다(형태·비율이 어긋나면 다시 만든다)
        const line=readFileSync(path.join(DIR,'README.md'),'utf8').split('\n').find(l=>new RegExp(`^\\s*[-*]?\\s*\`?${accept}\`?\\s*[:：].*식별 특징\\s*\\d+\\s*/\\s*\\d+`).test(l));
        const [n,N]=(line?.match(/식별 특징\s*(\d+)\s*\/\s*(\d+)/)||[]).slice(1).map(Number);
        if(!line) {console.error(`✗ ${accept}: README 「### 수령 검수」에 「${accept}: 식별 특징 n/N 일치 — 어긋난 것」 줄이 없다 — 대조 시트를 보고 적는다`);process.exit(1);}
        if(n<N && (line.slice(line.search(/식별 특징/)).match(/[—–-]\s*(.*)$/)?.[1]||'').replace(/\s/g,'').length<4) {console.error(`✗ ${accept}: 식별 특징 ${n}/${N} — 어긋난 특징과 남기는 이유를 적거나(휴대폰 크기에서 안 보이는 작은 차이만) 다시 만든다`);process.exit(1);}
      }
    }
    const previous={...a};
    Object.assign(a,{status:'approved',sourceHash:fileHash(files.source),renderHash:fileHash(files.render)});
    const check=validateAssets(DIR,{...project,assets:[a]});
    if(check.errors.length) {Object.assign(a,previous);console.error(check.errors.join('\n'));process.exit(1);}
    writeFileSync(projectFile,JSON.stringify(project,null,2)+'\n');
    console.log(`✔ 에셋 검수 지문 등록: ${accept}`);
  }
  const check=validateAssets(DIR,project,{final:argv.includes('--final')});
  for(const e of check.errors)console.error('✗ '+e);
  if(check.pending.length)console.log('대기 에셋: '+check.pending.join(', '));
  console.log(`에셋 ${project.assets?.length || 0}개 · 오류 ${check.errors.length}개`);
  process.exit(check.errors.length ? 1 : 0);
}

// ── README 「## 에셋 생성 요청」 파싱·형식 검사 — 정본: stages/2-architect.md 「이미지 생성 요청」 ──
// 2026-09-27 이후 프로젝트(cuts.json asset_prompt_format: 1, new.sh 템플릿)에만 형식을 강제한다. 기존 프로젝트는 소급하지 않는다.
// format 2(2026-10-06~ 골격)부터 메타 「실물 대조」가 필수다 — 1 인 프로젝트(00042~00055)는 네 줄 그대로 통과한다.
function parseRequests() {
  const source = path.join(DIR, 'README.md');
  if (!existsSync(source)) return { errors: ['README.md에 선택한 에셋과 완성 프롬프트를 먼저 작성한다.'], warns: [], assets: [] };
  const lines = readFileSync(source, 'utf8').split(/\r?\n/);
  const headings = [];
  let fence = null;
  // 프롬프트 안의 Markdown 제목은 README의 절 경계가 아니다.
  for (const [i, line] of lines.entries()) {
    const mark = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (mark) {
      if (!fence) fence = mark[1];
      else if (mark[1][0] === fence[0] && mark[1].length >= fence.length && !mark[2].trim()) fence = null;
      continue;
    }
    if (fence) continue;
    const h = line.match(/^ {0,3}(#{1,2})\s+(.+?)\s*#*\s*$/);
    if (h) headings.push({ i, level: h[1].length, title: h[2] });
  }
  if (fence) return { errors: ['README.md의 닫히지 않은 코드블록을 고친다.'], warns: [], assets: [] };
  const selected = headings.filter((h) => h.level === 2 && h.title === '에셋 생성 요청');
  if (selected.length !== 1) return { errors: ['README.md에 「## 에셋 생성 요청」 절을 하나 작성한다(필요 없으면 「없음 — 이유」 한 줄).'], warns: [], assets: [] };
  const start = selected[0].i;
  const end = headings.find((h) => h.i > start)?.i ?? lines.length;
  const body = lines.slice(start + 1, end).join('\n').trim();
  let project = {};
  try { project = JSON.parse(readFileSync(path.join(DIR, 'cuts.json'), 'utf8')); } catch {}
  const FORMAT = +project.asset_prompt_format || 0;
  if (FORMAT < 1) return { legacy: true, errors: [], warns: ['옛 형식 프로젝트(cuts.json asset_prompt_format 없음) — 형식 검사·생성을 하지 않는다'], assets: [] };
  if (/^없음(?:\s|$)/.test(body) && !/^ {0,3}(?:`{3,}|~{3,})/m.test(body)) return { none: body.split('\n')[0].replace(/[.。]\s*$/, ''), errors: [], warns: [], assets: [] };

  const GEN = ['Use', 'Scene', 'Subject', 'Details', 'Composition', 'Lighting', 'Color', 'Style', 'Output', 'Constraints'];
  const EDIT = ['Edit', 'Keep unchanged', 'Output', 'Constraints'];
  const META = FORMAT >= REF_FORMAT ? ['사용', '생성 이유', '실물 대조', '참조 첨부', '수령 예상'] : ['사용', '생성 이유', '참조 첨부', '수령 예상'];
  const META_ALL = ['사용', '생성 이유', '실물 대조', '참조 첨부', '수령 예상'];
  const LABEL = new RegExp(`^(${[...new Set([...GEN, ...EDIT])].join('|')}):\\s*(.*)$`);
  const HANGUL = /\p{Script=Hangul}/u;
  const PIXELS = /\b\d{3,5}\s*(?:x|×|by)\s*\d{3,5}\b|\b\d{3,5}\s*px\b/i;
  const errors = [], warns = [], assets = [];
  let head = [], cur = null, block = null;
  for (const line of lines.slice(start + 1, end)) {
    if (block) {
      const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === block.fence[0] && close[1].length >= block.fence.length) { (cur ? cur.blocks : head).push(block.lines); block = null; }
      else block.lines.push(line);
      continue;
    }
    const open = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (open) { block = { fence: open[1], lines: [] }; continue; }
    const h3 = line.match(/^ {0,3}###\s+(.+?)\s*$/);
    if (h3) { cur = { title: h3[1], id: h3[1].split(/[\s·]/)[0], path: h3[1].match(/`([^`]+\.(?:png|jpe?g|webp))`/i)?.[1], meta: new Map(), blocks: [] }; assets.push(cur); continue; }
    const m = line.match(/^\s*[-*]\s*([^:]+?)\s*:\s*(.*)$/);
    if (cur && m && META_ALL.includes(m[1])) cur.meta.set(m[1], m[2].trim());
    if (!cur) head.push(line);
  }
  // 경로도 코드블록도 없는 제목(예: ### 수령 검수)은 기록이지 에셋이 아니다.
  assets.splice(0, assets.length, ...assets.filter((x) => x.blocks.length || x.path));
  const commonStyle = head.join('\n').match(/^공통 Style:\s*`?(.+?)`?\s*$/m)?.[1];
  if (!commonStyle) warns.push('절 머리에 「공통 Style:」 줄이 없다');
  if (!assets.length) errors.push('「### <asset-id> · <이름> — `경로`」 에셋 제목이 없다');
  const ids = new Set((project.assets || []).map((a) => a.id));
  const styles = new Map();
  for (const a of assets) {
    const miss = META.filter((k) => !a.meta.has(k));
    if (miss.length) errors.push(`${a.id}: 메타 줄 누락 — ${miss.map((k) => `「- ${k}:」`).join(' ')}`);
    if (FORMAT >= REF_FORMAT && a.meta.has('실물 대조')) {
      a.real = parseReal(a.meta.get('실물 대조'), a.id);
      if (a.real.error) errors.push(`${a.id}: 「- 실물 대조:」 ${a.real.error} — 실재 대상이 아니면 「해당 없음 — 이유」 (정본: 2-architect 「실물 대조」)`);
    }
    if (!ids.has(a.id)) warns.push(`${a.id}: cuts.json assets 에 같은 id 가 없다`);
    else if (a.path && project.assets.find((x) => x.id === a.id).file !== a.path) warns.push(`${a.id}: README 제목 경로(${a.path})와 cuts.json assets.file(${project.assets.find((x) => x.id === a.id).file})이 다르다 — 생성은 cuts.json 경로에 저장한다`);
    if (!a.path) errors.push(`${a.id}: 제목에 저장 경로가 없다 — ### <asset-id> · <이름> — \`assets/...png\``);
    if (a.blocks.length !== 1) errors.push(`${a.id}: 영문 프롬프트 코드블록은 에셋마다 하나다 (현재 ${a.blocks.length}개)`);
    for (const [n, b] of a.blocks.entries()) {
      const where = `${a.id}${a.blocks.length > 1 ? ` 블록${n + 1}` : ''}`;
      if (b.some((l) => HANGUL.test(l))) errors.push(`${where}: 프롬프트에 한글이 있다 — 프롬프트는 영문, 설명은 메타 줄에`);
      if (b.some((l) => PIXELS.test(l))) errors.push(`${where}: 픽셀 수가 있다 — 생성기는 비율만 따르고 약 157만 화소로 준다. Output 에 비율만 쓴다`);
      if (b.some((l) => /<[^<>\n]{1,40}>/.test(l))) errors.push(`${where}: 채우지 않은 <자리표시자>가 있다`);
      const found = [];
      for (const l of b) {
        const m = l.match(LABEL);
        if (!m) continue;
        found.push(m[1]);
        const v = m[2].trim();
        if (!v || /^(…|\.\.\.)$/.test(v)) errors.push(`${where}: 「${m[1]}:」 값이 비었다 — 해당이 없으면 none`);
        if (m[1] === 'Output') {
          const ratio = v.match(/\b\d{1,2}:\d{1,2}\b/)?.[0];
          if (!ratio && !/same aspect ratio/i.test(v)) errors.push(`${where}: Output 에 비율(9:16·2:3·1:1·4:3·3:2·2:1)이 없다`);
          a.ratio = ratio;
        }
        if (m[1] === 'Style') styles.set(where, v);
      }
      a.edit = found[0] === 'Edit';
      const want = a.edit ? EDIT : GEN;
      if (found.join('|') !== want.join('|')) errors.push(`${where}: 라벨 순서 — 기대 ${want.join(' / ')} · 실제 ${found.join(' / ') || '없음'}`);
      a.prompt = b.join('\n').trim();
    }
    if (a.edit) {
      const ref = assets.find((x) => x !== a && new RegExp(`(^|[^\\w-])${x.id}([^\\w-]|$)`).test(a.meta.get('참조 첨부') || ''));
      if (!ref) errors.push(`${a.id}: 편집 프롬프트는 「- 참조 첨부:」에 원본 에셋 id를 적는다`);
      a.ref = ref;
    }
  }
  const distinct = new Set(styles.values());
  if (distinct.size > 1 || (commonStyle && distinct.size && !distinct.has(commonStyle)))
    warns.push(`Style 이 공통 Style 과 다르다 — 의도한 룩 차이면 메타의 생성 이유에 적는다:\n     ${[...styles].map(([k, v]) => `${k}: ${v}`).join('\n     ')}`);
  return { errors, warns, assets };
}

const req = parseRequests();
// 「해당 없음」은 실재 대상이 아니라는 선언이다 — 게이트 A 에서 사용자에게 이 목록을 보인다(우회로가 되지 않게 매번 드러낸다)
for (const a of req.assets || []) {
  if (!a.real || a.real.error) continue;
  const style = a.prompt?.match(/^Style:\s*(.*)$/m)?.[1] || '';
  if (a.real.none) {
    console.log(`· 실물 대조 해당 없음 — ${a.id}: ${a.real.reason}`);
    if (/photo|realistic/i.test(style) && !a.edit) req.warns.push(`${a.id}: 사진풍 Style 인데 실물 대조가 「해당 없음」이다 — 실재 장소·사물을 그리면 실제 사진부터 본다`);
  } else {
    if (!/photo|realistic/i.test(style) && !a.edit) req.warns.push(`${a.id}: 실재 대상인데 Style 이 사진풍이 아니다 — 실재 대상은 Photorealistic (2-architect 공통 Style)`);
    // 생성까지 했으면 게이트 A 전에 실물과 나란히 본다 (승인 --accept 는 ④에서 이 시트를 요구한다)
    const file = (() => { try { return path.join(DIR, JSON.parse(readFileSync(path.join(DIR, 'cuts.json'), 'utf8')).assets?.find((x) => x.id === a.id)?.file || a.path || ''); } catch { return ''; } })();
    if (file && existsSync(file) && !refRecord(DIR, a.real.refsId)?.compared?.some((c) => c.hash === fileHash(file)))
      req.warns.push(`${a.id}: 생성됐지만 실물 대조 시트가 없다 — node pipeline/ref-photos.mjs ${NAME} ${a.real.refsId} --sheet ${path.relative(DIR, file)} (게이트 A 전에)`);
  }
}
for (const w of req.warns) console.log(`⚠️ ${w}`);
if (req.errors.length) {
  for (const e of req.errors) console.error(`✗ ${e}`);
  console.error(`\n✗ 형식 오류 ${req.errors.length}건. 정본: .claude/skills/video/stages/2-architect.md 「이미지 생성 요청」`);
  process.exit(1);
}
if (req.none) { console.log(`✔ ${req.none} — 생성할 이미지가 없다`); process.exit(0); }
if (argv.includes('--lint')) {
  if (!req.legacy) console.log(`✔ 형식 통과 · 에셋 ${req.assets.length}개 (${req.assets.map((a) => a.id).join(', ')})`);
  process.exit(0);
}

if (argv.includes('--generate')) {
  if (req.legacy) process.exit(1);
  const CODEX = [path.join(os.homedir(), '.npm-global/bin/codex'), '/opt/homebrew/bin/codex', '/usr/local/bin/codex'].find((p) => existsSync(p)) || 'codex';
  const MODEL = 'gpt-6.1-sol', EFFORT = 'xhigh'; // 2026-10-08 사용자 지시 — 이미지 생성 전용. config.toml 기본값과 별개 · bundle-widen.mjs도 같은 값(함께 고친다)
  const FALLBACK = '같은 README 프롬프트 블록을 사용자에게 넘겨 ChatGPT에서 생성받고, 그동안 코드 베이스라인으로 진행한다';
  const st = spawnSync(CODEX, ['login', 'status'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const login = `${st.stdout || ''}${st.stderr || ''}`; // 상태 문구는 stderr 로 나온다
  if (!/ChatGPT/i.test(login)) { console.error(`✗ Codex CLI가 ChatGPT 구독으로 로그인되어 있지 않다 (${login.trim() || CODEX}). ${FALLBACK}.`); process.exit(2); }
  const only = argv.find((a) => a.startsWith('--only='))?.slice(7).split(',').filter(Boolean);
  const force = argv.includes('--force');
  const projectFile = path.join(DIR, 'cuts.json');
  const IMAGES = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'generated_images');
  const LOGS = path.join(DIR, 'output', 'image-gen');
  mkdirSync(LOGS, { recursive: true });
  const ledger = JSON.parse(readFileSync(projectFile, 'utf8'));
  for (const a of req.assets) { const f = ledger.assets?.find((x) => x.id === a.id)?.file; if (f) a.path = f; } // 장부(cuts.json) 경로가 정본
  const todo = req.assets.filter((a) => (!only || only.includes(a.id)));
  if (only) for (const id of only) if (!req.assets.some((a) => a.id === id)) { console.error(`✗ README 에셋 생성 요청에 없는 id: ${id}`); process.exit(1); }
  const skip = todo.filter((a) => existsSync(path.join(DIR, a.path)) && !force);
  for (const a of skip) console.log(`· ${a.id}: ${a.path} 이 이미 있다 — 건너뜀 (다시 만들려면 --only=${a.id} --force)`);
  const jobs = todo.filter((a) => !skip.includes(a));
  if (!jobs.length) { console.log('✔ 새로 생성할 이미지가 없다'); process.exit(0); }
  // 🔴 실물 대조 — 실제 사진을 보지 않고 실재 대상을 생성하지 않는다 (2026-10-06 · lib/refs.mjs). 같은 파일은 한 장으로 센다
  const unresearched = jobs.filter((a) => a.real && !a.real.none && uniqueRefImages(DIR, a.real.refsId).length < REF_MIN);
  if (unresearched.length) {
    for (const a of unresearched) console.error(`✗ ${a.id}: output/refs/${a.real.refsId}/ 의 실물 사진이 ${uniqueRefImages(DIR, a.real.refsId).length}장 — 먼저 node pipeline/ref-photos.mjs ${NAME} ${a.real.refsId} --search "<영문 이름>" (또는 --url) 로 서로 다른 시점 ${REF_MIN}장 이상을 보고 식별 특징을 프롬프트에 옮긴다`);
    process.exit(1);
  }

  const instruction = (a) => (a.edit
    ? `The attached image is Image 1 (${a.ref.id}). Use the built-in image_gen tool exactly once to EDIT the attached image as described below, used verbatim. Keep the aspect ratio of Image 1.`
    : `Use the built-in image_gen tool exactly once to generate ONE new image (not an edit) from the prompt below, used verbatim. Aspect ratio ${a.ratio}.`)
    + ` Do not run any shell commands and do not create or edit any files. When the image is generated, reply only with the word DONE.\n\nPROMPT:\n${a.prompt}`;
  const run = (a) => new Promise((resolve) => {
    const args = ['exec', '--ephemeral', '-m', MODEL, '-c', `model_reasoning_effort="${EFFORT}"`, '--sandbox', 'read-only', '--skip-git-repo-check', '--color', 'never'];
    if (a.edit) args.push(`--image=${path.join(DIR, a.ref.path)}`);
    args.push(instruction(a));
    // stdin 을 닫지 않으면 codex exec 이 "Reading additional input from stdin..."에서 멈춘다 (pitfalls §164).
    const child = spawn(CODEX, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => { out += '\n[image-gen] 15분 초과 — 중단'; child.kill('SIGTERM'); }, 15 * 60 * 1000);
    child.on('close', (code) => {
      clearTimeout(timer);
      writeFileSync(path.join(LOGS, `${a.id}.log`), out);
      const sid = out.match(/session id:\s*([0-9a-f-]{16,})/i)?.[1];
      const folder = sid && path.join(IMAGES, sid);
      const png = folder && existsSync(folder) ? readdirSync(folder).filter((f) => /\.png$/i.test(f)).map((f) => path.join(folder, f)).sort((x, y) => statSync(y).mtimeMs - statSync(x).mtimeMs)[0] : null;
      if (code !== 0 || !png) { resolve({ a, error: `codex exit ${code}${png ? '' : ' · 생성 파일 없음'} — 로그 ${path.relative(ROOT, path.join(LOGS, `${a.id}.log`))}` }); return; }
      const dest = path.join(DIR, a.path);
      mkdirSync(path.dirname(dest), { recursive: true });
      copyFileSync(png, dest);
      resolve({ a, png, dest });
    });
  });
  const pool = async (list, limit) => {
    const results = [], queue = [...list];
    await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => { while (queue.length) results.push(await run(queue.shift())); }));
    return results;
  };
  const gen = jobs.filter((a) => !a.edit), edits = jobs.filter((a) => a.edit);
  console.log(`  이미지 생성 — Codex 내장 image_gen (ChatGPT 구독 · ${MODEL} · ${EFFORT}) · 새 이미지 ${gen.length} · 편집 ${edits.length}`);
  const results = await pool(gen, 4);
  const ready = edits.filter((a) => existsSync(path.join(DIR, a.ref.path)));
  for (const a of edits.filter((x) => !ready.includes(x))) results.push({ a, error: `참조 원본 ${a.ref.id} 파일이 없다 — 원본부터 생성한다` });
  results.push(...await pool(ready, 4));

  const project = JSON.parse(readFileSync(projectFile, 'utf8'));
  for (const r of results) {
    if (r.error) { console.error(`✗ ${r.a.id}: ${r.error}`); continue; }
    let size = '';
    try { const d = assetDimensions(r.dest); size = ` · ${d.width}×${d.height}`; } catch {}
    const asset = project.assets?.find((x) => x.id === r.a.id);
    if (asset) { asset.status = 'received'; delete asset.sourceHash; delete asset.renderHash; }
    console.log(`✔ ${r.a.id}: ${path.relative(ROOT, r.dest)}${size}`);
  }
  writeFileSync(projectFile, JSON.stringify(project, null, 2) + '\n');
  const failed = results.filter((r) => r.error).length;
  console.log(failed ? `\n✗ 실패 ${failed}건 — 로그 원인을 고쳐 --only 로 다시 생성한다. 반복 실패면 ${FALLBACK}.`
    : `\n✔ 생성 완료. 실재 대상은 node pipeline/ref-photos.mjs ${NAME} <refs-id> --sheet <이미지> 로 실물과 나란히 놓고 식별 특징을 한 줄씩 대조한다.\n  어긋난 것만 편집 형식(Edit · Keep unchanged)이나 프롬프트 수정으로 --only=<id> --force 다시 만든다. 승인은 ④ --accept.`);
  process.exit(failed ? 1 : 0);
}

console.error('✗ --lint · --generate · --check 중 하나를 지정한다.');
process.exit(1);
