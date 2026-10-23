// cuts.json → output/<p>/PROMPTS.md (개요 + 승인 격자) + output/<p>/prompts/<컷id>.md (긁어 쓰는 프롬프트)
// 사용: node pipeline/prompts.mjs <프로젝트>     (AI 실사 경로 — 레거시)
//
// 번호는 docs/06-workflow.md 의 전역 단계를 따른다 (③배경 ④보정 ⑤영상).
// status.sh 가 같은 번호로 진행 단계를 판정하므로 여기서 임의로 바꾸지 말 것.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { resolveProject } from './lib/project.mjs';

const { dir: DIR, out: OUT, name: NAME } = resolveProject(process.argv[2], { usage: '사용: node pipeline/prompts.mjs <프로젝트>' });
const J = JSON.parse(readFileSync(path.join(DIR, 'cuts.json'), 'utf8'));
const cuts = J.cuts || [], S = J.style || {}, A = J.aspect || {}, SZ = J.safezone;

// ── 스키마 가드 — 조용히 빈 프롬프트를 내지 않는다 ──
// 폐기된 스키마(image_prompt/video_prompt 문자열)로 돌리면 프롬프트가 전부 비는데
// ✔ 가 찍혀서 알아채기 어렵다. 실제로 겪은 사고다 (2026-09-03).
const legacy = cuts.filter(c => c.image_prompt || c.video_prompt);
if (legacy.length) {
  console.error(`✘ 폐기된 스키마입니다 — ${legacy.length}개 컷이 image_prompt/video_prompt 를 씁니다.`);
  console.error(`  현재 스키마는 image:{ko:{scene,subject,detail,framing}} · video:{ko:{camera,action,light}} · overlay:[]`);
  console.error(`  templates/cuts.json 을 보고 고치세요.`);
  process.exit(1);
}
const noImage = cuts.filter(c => !(c.image?.ko?.scene || c.image?.en?.scene));
if (noImage.length)
  console.error(`⚠️ image.{ko|en}.scene 이 없는 컷 ${noImage.length}개: ${noImage.map(c => c.id).join(', ')} — 프롬프트가 비어서 나갑니다`);
const total = cuts.reduce((a, c) => a + (c.dur || 2), 0);

// 컷 내용 + 공통 스타일 → 완성 프롬프트
// ⚠️ 공통 구도(s.framing = 데드존 규칙)를 반드시 넣는다. 빠뜨리면 UI 에 가리는 화면이 나온다.
const build = (c, lang) => {
  const i = (c.image || {})[lang] || {}, s = S[lang] || {};
  const L = lang === 'ko'
    ? ['출력', '장면', '피사체', '디테일', '화면 문자', '구도', '안전영역', '조명', '색', '매체', '분위기', '제외']
    : ['Output', 'Scene', 'Subject', 'Details', 'On-screen text', 'Framing', 'Safe area', 'Lighting', 'Color', 'Medium', 'Mood', 'Exclude'];
  // 배경과 텍스트를 한 번에 생성한다. 공식 가이드대로 리터럴 문자열을 따옴표로 지정.
  const ov = c.overlay || [];
  const txt = ov.length
    ? (lang === 'ko'
        ? '다음 문자를 정확히 이대로 표시할 것 —\n' +
          ov.map(o => `    · "${o.text}"  →  ${o.where}, ${o.style}`).join('\n')
        : 'Render exactly these characters —\n' +
          ov.map(o => `    · "${o.text}"  →  ${o.where_en || o.where}, ${o.style_en || o.style}`).join('\n'))
    : null;
  const V = [s.output, i.scene, i.subject, i.detail, txt, i.framing, s.framing,
             s.lighting, s.color, s.medium, s.mood, s.constraints];
  return L.map((k, n) => V[n] ? `${k}: ${V[n]}` : '').filter(Boolean).join('\n');
};

// 영상 프롬프트 — 클링/Veo 권장 구조. image-to-video 는 이미지를 재서술하지 않고
// 카메라·동작·빛변화만 준다. 60~100단어가 최적이고 네거티브는 별도 필드에 넣는다.
const buildVideo = (c, lang) => {
  const v = (c.video || {})[lang] || {}, s = (J.video_style || {})[lang] || {};
  const L = lang === 'ko'
    ? ['카메라', '동작', '빛 변화', '모션 강도', '오디오', '길이']
    : ['Camera', 'Action', 'Light', 'Motion', 'Audio', 'Length'];
  const V = [v.camera, v.action, v.light, s.intensity, s.audio, s.length];
  return L.map((k, n) => V[n] ? `${k}: ${V[n]}` : '').filter(Boolean).join('\n');
};

// ④ 보정 — image2 이미지 편집 프롬프트.
// 공식 가이드의 편집 원칙: "change only X" + "keep everything else the same",
// 보존 목록을 매번 다시 적어 드리프트를 막는다.
const buildOverlay = (c, lang) => {
  if (!c.overlay || !c.overlay.length) return null;
  const items = c.overlay.map(o => `· "${o.text}"  —  ${o.where}, ${o.style}`).join('\n');
  if (lang === 'ko') {
    return [
      '이 이미지를 편집합니다. 아래 문자만 추가하고 나머지는 전혀 바꾸지 마세요.',
      '',
      items,
      '',
      '구도·프레이밍·조명·색·기존 요소를 모두 그대로 보존할 것.',
      '아무것도 이동·확대·축소·재배치하지 말 것. 위에 적지 않은 글자나 그래픽을 추가하지 말 것.',
    ].join('\n');
  }
  const en = c.overlay.map(o => `· "${o.text}"  —  ${o.where_en || o.where}, ${o.style_en || o.style}`).join('\n');
  return [
    'Edit this image. Add only the text below — change nothing else.',
    '',
    en,
    '',
    'Preserve the exact composition, framing, lighting, colors, and every existing element.',
    'Do not move, resize, or restyle anything. Do not add any other text or graphics.',
  ].join('\n');
};

const stamp = `컷 ${cuts.length}개 · 총 ${total.toFixed(1)}초 · ${A.target || '9:16'} · 말 속도 ${J.voice?.speed ?? 1.5}배`;

// ── 컷별 파일 ──
const PDIR = path.join(OUT, 'prompts');
rmSync(PDIR, { recursive: true, force: true });
mkdirSync(PDIR, { recursive: true });

let ready = 0, half = 0;
for (const [n, c] of cuts.entries()) {
  const bg = existsSync(path.join(DIR, 'assets/images', c.id + '.png'));
  const needOv = !!(c.overlay && c.overlay.length);
  const fin = needOv ? existsSync(path.join(DIR, 'assets/images', c.id + '.final.png')) : bg;
  const clip = existsSync(path.join(DIR, 'assets/clips', c.id + '.mp4'));
  if (clip) ready++; else if (fin) half++;

  const F = [];
  F.push(`# ${n + 1}. ${c.id} · ${(c.dur || 2).toFixed(1)}초`);
  F.push('');
  if (c.concept) { F.push(`> ${c.concept}`); F.push(''); }
  const meta = [];
  if (c.headline) meta.push(`**헤드라인** ${c.headline}`);
  if (c.say) meta.push(`**나레이션** "${c.say}"`);
  if (c.text) meta.push(`**자막** ${c.text}`);
  if (c.big) meta.push(`**수치** ${c.big} ${c.unit || ''}`);
  if (meta.length) { F.push(meta.join(' · ')); F.push(''); }
  if (c.note) { F.push(`⚠️ ${c.note}`); F.push(''); }
  F.push(`상태 — ③ 배경 ${bg ? '✅' : '⬜'} · ⑤ 영상 ${clip ? '✅' : '⬜'}`);
  F.push('');
  F.push('---');
  F.push('');

  F.push(`## ③ 배경 → \`assets/images/${c.id}.png\``);
  F.push('');
  F.push(needOv ? '*배경과 텍스트를 **한 번에** 생성합니다.*' : '*텍스트가 없는 컷입니다.*');
  F.push('');
  F.push('**한글**');
  F.push('```');
  F.push(build(c, 'ko'));
  F.push('```');
  F.push('');
  F.push('**English**');
  F.push('```');
  F.push(build(c, 'en'));
  F.push('```');
  F.push('');

  const ovKo = buildOverlay(c, 'ko');
  if (ovKo) {
    F.push(`## ④ 보정 — 글자가 틀렸을 때만`);
    F.push('');
    F.push('*③에서 글자가 틀렸거나 빠졌으면, 그 이미지를 image2 에 넣고 아래로 고칩니다.*');
    F.push(`*고친 결과는 \`${c.id}.final.png\` 로 저장하면 ⑤에서 그걸 씁니다.*`);
    F.push('');
    F.push('**한글**');
    F.push('```');
    F.push(ovKo);
    F.push('```');
    F.push('');
    F.push('**English**');
    F.push('```');
    F.push(buildOverlay(c, 'en'));
    F.push('```');
    F.push('');
  }

  F.push(`## ⑤ 영상 → \`assets/clips/${c.id}.mp4\` (선택)`);
  F.push('');
  F.push(`*③ 배경(보정했으면 \`.final.png\`)을 넣습니다. 모델이 텍스트를 보존합니다.*`);
  F.push('');
  F.push('**한글**');
  F.push('```');
  F.push(buildVideo(c, 'ko'));
  F.push('```');
  F.push('');
  F.push('**English**');
  F.push('```');
  F.push(buildVideo(c, 'en'));
  F.push('```');
  F.push('');
  if (J.video_style?.en?.negative) {
    F.push('**네거티브** — 클링의 별도 입력란에 (Veo 는 프롬프트 끝에 `Avoid:` 로)');
    F.push('```');
    F.push(J.video_style.en.negative);
    F.push('```');
    F.push('');
  }
  writeFileSync(path.join(PDIR, `${c.id}.md`), F.join('\n'));
}

// ── 개요 ──
const O = [];
O.push(`# ${J.title || path.basename(DIR)}`);
O.push('');
O.push(stamp);
O.push('');
O.push('**컷별 프롬프트는 `prompts/` 폴더에 하나씩 있습니다.**');
O.push('');
O.push('> ⚠️ **화면 문자는 영문·숫자만.** image2 의 한글 렌더링은 검증되지 않았습니다.');
O.push('> 한글 설명과 "원" 표기는 자막이 담당합니다.');
O.push('');
O.push('## 만드는 순서');
O.push('');
O.push('```');
O.push('②-2 격자  9칸 한 장으로 전체 룩 승인          → 통과해야 ③으로 간다');
O.push('③ 배경    배경과 화면 문자를 한 번에 생성      → <컷id>.png');
O.push('④ 보정    글자가 틀렸을 때만 편집으로 수정     → <컷id>.final.png  (선택)');
O.push('⑤ 영상    이미지로 image-to-video           → <컷id>.mp4        (선택)');
O.push('```');
O.push('');
O.push('**컷당 호출은 기본 1회면 됩니다.** ④는 글자가 틀렸거나 빠졌을 때만 쓰는 보정 수단입니다.');
O.push('③에서 얹은 텍스트는 **image-to-video 가 보존**하므로 영상 안에서 그대로 살아 움직입니다.');
O.push('');
O.push('⑤는 **움직임이 필요한 컷만** 만들면 됩니다. 끝나면 `node tts.mjs` → `node export.mjs`.');
O.push('');
O.push('---');
O.push('');

// ── ⓪ 승인 격자 ──────────────────────────────────────────────
// 컷을 하나씩 뽑기 전에 9칸 한 장으로 전체 레이아웃을 본다. 어긋난 컷을 여기서 발견하면
// 이미지 한 장 값으로 끝나고, ⑤까지 간 뒤에 발견하면 i2v 크레딧까지 같이 날린다.
// ⚠️ 칸당 340~680px 이라 승인용 증거지 자산이 아니다. 실제 컷은 반드시 개별 생성한다.
const boards = [];
for (let i = 0; i < cuts.length; i += 9) boards.push(cuts.slice(i, i + 9));
O.push('## ②-2 승인 격자 — 개별 생성 **전에** 한 장으로 확인');
O.push('');
O.push(`**컷 ${cuts.length}개를 9칸씩 ${boards.length}장으로 먼저 봅니다.** 구도·색·룩이 어긋난 컷을`);
O.push('여기서 잡으면 이미지 한 장 값으로 끝납니다. ⑤까지 간 뒤에 발견하면 i2v 크레딧까지 날립니다.');
O.push('');
O.push('> ⚠️ **격자는 승인용이지 자산이 아닙니다.** 칸당 340~680px 이라 그대로 쓰면 뭉개집니다.');
O.push('> 통과한 뒤 컷마다 ③을 다시 돌리세요.');
O.push('');
for (const [bi, g] of boards.entries()) {
  const lines = g.map((c, n) => {
    const i = (c.image || {}).ko || {};
    const what = [i.scene, i.subject].filter(Boolean).join(' / ') || c.text || c.say || '';
    return `  ${n + 1}. [${c.id}] ${what}`;
  }).join('\n');
  O.push(`**격자 ${bi + 1}/${boards.length}** — ${g[0].id} ~ ${g[g.length - 1].id}`);
  O.push('```');
  O.push([
    `출력: 3×3 격자 한 장. 각 칸은 9:16 세로 비율. 칸 사이에 얇은 흰 구분선.`,
    `용도: 영상 컷 승인용 콘티. 칸마다 좌상단에 작은 번호만 표기.`,
    '',
    '각 칸의 내용 —',
    lines,
    '',
    `공통 스타일: ${[S.ko?.medium, S.ko?.lighting, S.ko?.color, S.ko?.mood].filter(Boolean).join(' · ')}`,
    '',
    '⚠️ 칸 안에 화면 문자를 넣지 말 것. 구도·색·피사체 배치만 본다.',
    '⚠️ 아홉 칸의 룩이 한 영상처럼 통일돼야 한다. 튀는 칸이 있으면 안 된다.',
  ].join('\n'));
  O.push('```');
  O.push('');
}
O.push('**보는 순서** — 아홉 칸의 룩이 한 영상인가 · 훅(첫 칸)이 결과를 보여주나');
O.push('마지막 칸이 첫 칸과 같은 구도인가 · 문자가 들어갈 자리가 비어 있나');
O.push('');
O.push('---');
O.push('');
if (J.headline) {
  O.push('## ⭐ 헤드라인 — 조립 단계에서 얹습니다');
  O.push('');
  O.push('**첫 프레임에 헤드라인이 있으면 3초 리텐션이 50% 올라갑니다.** 지금까지 빠져 있던 요소입니다.');
  O.push('');
  O.push('```');
  O.push('y    0~220   플랫폼 UI');
  O.push('y  220~600   ⭐ 헤드라인 (48pt 이상, 고대비 + 외곽선, 5~8단어)');
  O.push('y  600~1450  이미지 콘텐츠');
  O.push('y 1450~1920  자막 + 플랫폼 UI');
  O.push('```');
  O.push('');
  O.push('**헤드라인과 자막은 내용이 달라야 합니다.** 헤드라인은 그 구간의 핵심 한 마디,');
  O.push('자막은 지금 말하는 내용입니다. 컷별 헤드라인은 아래 목록에 있습니다.');
  O.push('');
  O.push('한글이라 **이미지에 넣지 않습니다** — 폰트를 직접 고를 수 있어야 하고 수정도 쉽습니다.');
  O.push('배경 프롬프트에는 **상단 30%를 비우라**고 지시해 자리를 확보해 뒀습니다.');
}
O.push('');
if (A.note_ko) { O.push(`> ⚠️ **종횡비.** ${A.note_ko}`); O.push(''); }
if (SZ) {
  O.push(`> ⚠️ **데드존.** 플랫폼 UI 가 **상단 ${SZ.worst_case.top}px · 하단 ${SZ.worst_case.bottom}px · ` +
    `우측 ${SZ.worst_case.right}px** 를 덮습니다. 안전 영역 **x ${SZ.safe.x[0]}~${SZ.safe.x[1]} · ` +
    `y ${SZ.safe.y[0]}~${SZ.safe.y[1]}**. 각 배경 프롬프트의 \`안전영역\` 줄에 들어 있습니다.`);
  O.push('');
}
O.push('---');
O.push('');
O.push('## 컷 목록');
O.push('');
O.push('| # | 파일 | 길이 | 헤드라인 | 나레이션 | ③배경 | ⑤영상 |');
O.push('|---|---|---|---|---|---|---|');
for (const [n, c] of cuts.entries()) {
  const bg = existsSync(path.join(DIR, 'assets/images', c.id + '.png'));
  const needOv = !!(c.overlay && c.overlay.length);
  const fin = needOv ? existsSync(path.join(DIR, 'assets/images', c.id + '.final.png')) : bg;
  const clip = existsSync(path.join(DIR, 'assets/clips', c.id + '.mp4'));
  O.push(`| ${n + 1} | [\`${c.id}\`](prompts/${c.id}.md) | ${(c.dur || 2).toFixed(1)}s | ${(c.headline || '').replace(/\|/g, '\\|')} | ${(c.say || '').replace(/\|/g, '\\|')} | ${bg ? '✅' : '⬜'} | ${clip ? '✅' : '⬜'} |`);
}
O.push('');
O.push('---');
O.push('');
O.push('## 공통 컨셉 — 모든 배경에 적용 (각 프롬프트에 이미 합쳐져 있음)');
O.push('');
const CK = [['매체', 'medium'], ['조명', 'lighting'], ['색', 'color'], ['분위기', 'mood'],
            ['안전영역·구도', 'framing'], ['제외', 'constraints']];
O.push('| | 한글 | English |');
O.push('|---|---|---|');
for (const [label, key] of CK)
  O.push(`| **${label}** | ${(S.ko?.[key] || '').replace(/\|/g, '\\|')} | ${(S.en?.[key] || '').replace(/\|/g, '\\|')} |`);
O.push('');
O.push('**한 컷이라도 룩이 튀면 전체가 싸구려로 보입니다.** 먼저 2~3컷만 뽑아 룩을 확정하세요.');
O.push('생성된 이미지를 스타일 레퍼런스로 함께 넣으면 일관성이 올라갑니다.');
O.push('');
writeFileSync(path.join(OUT, 'PROMPTS.md'), O.join('\n'));

console.log(`✔ ${NAME} → projects/${NAME}/output/`);
console.log(`  PROMPTS.md (개요) · prompts/<컷id>.md × ${cuts.length}`);
console.log(`  컷 ${cuts.length}개 / ${total.toFixed(1)}초`);
console.log(`  클립 ${ready} · 이미지만 ${half} · 미생성 ${cuts.length - ready - half}`);
