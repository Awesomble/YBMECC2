#!/usr/bin/env node
// ① 분석 — **교차검증 게이트.** 메인이 확정한 팩트를 **메인과 분리된 검증 에이전트**가 1차 출처로 다시 확인하고,
// 그 답을 코드가 대조해 기록한다. stage-gate 1 은 이 기록(.cross-verify/result.json)만 믿는다.
//
//   node pipeline/cross-verify.mjs <p>            유효한 통과 기록이 있으면 재사용, 없으면 검증 패킷을 낸다 (exit 3 = 검증 대기)
//   node pipeline/cross-verify.mjs <p> --refresh  통과 기록이 있어도 새 패킷을 낸다
//   node pipeline/cross-verify.mjs <p> --record   검증 에이전트가 쓴 .cross-verify/raw.txt 를 대조·기록 (검증 에이전트가 직접 실행)
//
// 검증자: Claude 는 video-verify 에이전트, Codex 메인은 세션의 별도 검증 에이전트(같은 모델의 독립 실행임을 README 에 밝힌다).
// 메인은 패킷·raw.txt·result.json 을 쓰거나 고치지 않고 --record 출력(판정표)만 읽는다.
//
// 2026-10-02 사용자 지시: Codex 를 리서치(교차검증)에 쓰는 경로를 폐기했다 — 여기서 codex exec 을 부르지 않는다.
// 남긴 것: 팩트·refs 지문(factsHash), 24시간 유효기간, 전 항목 포함·근거·overall 일관성 검사(lib/workflow-state.mjs).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { resolveProject } from './lib/project.mjs';
import {factsHash, factItems, verificationErrors, factBlock as extractFacts} from './lib/workflow-state.mjs';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const { dir, name } = resolveProject(argv.find((a) => !a.startsWith('--')), {
  usage: '사용: node pipeline/cross-verify.mjs <프로젝트> [--refresh | --record] [--json]',
});

const README = path.join(dir, 'README.md');
if (!existsSync(README)) { console.error(`✗ ${README} 없음 — ① 분석이 먼저다`); process.exit(1); }
const readme = readFileSync(README, 'utf8');
const factBlock = extractFacts(readme);
if (!factBlock) { console.error('✗ README.md 에 "## 확정 팩트" 절이 없다 — ① 분석이 먼저다'); process.exit(1); }
const inputHash = factsHash(dir);
const expectedItems = factItems(readme);

const OUT = path.join(dir, '.cross-verify');
mkdirSync(OUT, { recursive: true });
const RESULT = path.join(OUT, 'result.json'), PROMPT = path.join(OUT, 'prompt.txt'), RAW = path.join(OUT, 'raw.txt');
const invalidate = (overall, extra = {}) =>
  writeFileSync(RESULT, JSON.stringify({ inputHash, verifiedAt: new Date().toISOString(), overall, claims: [], ...extra }, null, 2) + '\n');

const schema = {
  claims: [{ item: '확정 팩트 표 각 행의 첫 칸 값 그대로(첫 열이 「#」 번호 열이면 F1 같은 번호)', our_value: '표의 값', verdict: '일치|불일치|확인불가',
    found_value: '네가 실제로 찾은 값', source_url: 'URL 또는 refs 파일 절대경로(여러 개는 ; 로)', grade: '1차|2차|3차|없음', note: '' }],
  missing_conditions: ['…'], risky_phrasings: ['…'], overall: '통과|보류|정지',
};

if (!has('--record')) {
  if (!has('--refresh') && existsSync(RESULT)) {
    try {
      const old = JSON.parse(readFileSync(RESULT, 'utf8'));
      if (!verificationErrors(old, inputHash, { expectedItems, projectDir: dir }).length && old.overall === '통과') {
        console.log(has('--json') ? JSON.stringify(old, null, 2) : '✔ 동일 팩트·원본의 유효한 교차검증 재사용 (24시간, 새 검증: --refresh)');
        process.exit(0);
      }
    } catch {}
  }
  const refsDir = path.join(dir, 'assets', 'refs');
  const refs = existsSync(refsDir) ? readdirSync(refsDir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.join(refsDir, e.name)) : [];
  const rel = path.relative(process.cwd(), dir) || '.';
  const packet = `<!-- ABM inputHash: ${inputHash}; packetAt: ${new Date().toISOString()} -->
너는 **독립 검증자**다. 메인이 정리한 사실을 그대로 믿지 말고 **1차 출처에서 다시 확인**하라.
README·대본·소스 파일을 수정하지 마라. 쓰는 파일은 아래 4번의 raw.txt 하나뿐이다.

## 검증 대상 — 프로젝트 ${name}

${factBlock}

${refs.length ? `## 원본 자료 (직접 열어라)\n${refs.map((f) => `- ${f}`).join('\n')}\n` : ''}
## 하라

1. **줄마다 판정하라.** claims 의 item 에는 확정 팩트 표 각 행의 **첫 칸 값**을 그대로 쓰고(첫 열이 「#」 번호 열이면 「F1」 같은 번호, 「항목」 열이면 항목 이름) 모든 행을 포함하라.
   1차 출처(공식 공지·보도자료·법령)로 확인되면 \`일치\`, 다른 값이 나오면 \`불일치\`, 출처를 못 찾으면 \`확인불가\`.
   **추측으로 '일치'를 주지 마라.** found_value 에 실제로 찾은 값, source_url 에 그 출처를 적는다.
   제공된 원본 파일을 근거로 삼으면 그 파일의 절대경로를 적는다. 여러 출처는 세미콜론으로 구분한다.
   grade 는 출처 등급이다 (1차=공식 · 2차=언론·기관의 인용 · 3차=블로그·커뮤니티 · 없음).
2. **missing_conditions** — 표의 주장이나 영상이 안내하는 행동을 **거짓 또는 실질적으로 오해하게 만드는 빠진 조건**.
   대상 제한·한도·중복 불가·조기 종료·필수 절차·전제·예외를 확인한다. 표 아래에 이미 적힌 조건, 영상이 다루지 않는
   별도 주제의 세부는 넣지 않는다. 그 예외가 실제 발화·화면의 약속을 뒤집을 때만 누락으로 적고 연결을 설명한다.
3. **risky_phrasings** — 사실이지만 **조건을 빼면 오해를 부르는 표현**.
4. **overall** — 불일치가 하나라도 있으면 \`정지\`, 확인불가나 누락 조건이 있으면 \`보류\`, 전부 확인되면 \`통과\`.
   오늘 날짜 기준으로 기간이 지났는지도 본다. 한국어로 쓴다.

## 끝내는 법 (검증자가 직접)

아래 형식의 JSON 하나만 \`${RAW}\` 에 쓰고, 저장소 루트에서 \`node pipeline/cross-verify.mjs ${rel} --record\` 를 실행하라.
그 출력(판정표)을 그대로 메인에 돌려준다. 형식 오류로 거부되면 raw.txt 를 고쳐 다시 --record 한다. 검색 덤프는 넘기지 않는다.

\`\`\`json
${JSON.stringify(schema, null, 2)}
\`\`\`
`;
  writeFileSync(PROMPT, packet);
  invalidate('검증대기');
  console.log(packet);
  console.log(`⏳ 검증 대기 — 이 패킷을 메인과 분리된 검증 에이전트에 맡긴다 (Claude: video-verify). 패킷: ${path.relative(process.cwd(), PROMPT)}`);
  process.exit(3);
}

// ── --record: 검증 에이전트의 답을 대조·기록 ──
const stamp = existsSync(PROMPT) ? readFileSync(PROMPT, 'utf8').match(/ABM inputHash: ([a-f0-9]+);/) : null;
if (!stamp || stamp[1] !== inputHash) {
  invalidate('지문불일치');
  console.error('✗ 패킷을 낸 뒤 확정 팩트·refs 가 바뀌었다(또는 패킷이 없다). 검증하지 않은 팩트는 기록하지 않는다 — cross-verify.mjs 로 새 패킷을 내고 다시 검증한다.');
  process.exit(2);
}
const raw = existsSync(RAW) ? readFileSync(RAW, 'utf8') : '';
// 탐욕적 정규식은 앞쪽의 다른 중괄호부터 물어 파싱이 깨진다 (2026-09-08 실측) — 뒤에서부터 훑는다.
const parseLast = (t) => {
  const ends = [...t.matchAll(/\}/g)].map((m) => m.index).reverse();
  const starts = [...t.matchAll(/^\s*\{/gm)].map((m) => m.index).reverse();
  for (const s0 of starts) for (const e0 of ends) {
    if (e0 <= s0) continue;
    try { const o = JSON.parse(t.slice(s0, e0 + 1)); if (o && o.overall) return o; } catch {}
  }
  return null;
};
const res = parseLast(raw);
if (!res) { invalidate('응답없음'); console.error(`✗ ${path.relative(process.cwd(), RAW)} 에 형식에 맞는 JSON 이 없다. 통과로 처리하지 않는다.`); process.exit(2); }
Object.assign(res, { inputHash, verifiedAt: new Date().toISOString() });
const errors = verificationErrors(res, inputHash, { expectedItems, projectDir: dir });
if (errors.length) { invalidate('형식오류', { errors }); console.error('✗ ' + errors.join(' · ')); process.exit(2); }
writeFileSync(RESULT, JSON.stringify(res, null, 2) + '\n');
if (has('--json')) { console.log(JSON.stringify(res, null, 2)); process.exit(res.overall === '통과' ? 0 : 1); }

const icon = { 일치: '✅', 불일치: '❌', 확인불가: '⚠️' };
const W = Math.max(10, ...res.claims.map((c) => [...c.item].length));
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - [...String(s)].length));
console.log(`\n  교차검증 — ${name}\n\n  항목별 판정 — **우리 값이 아니라 검증자가 찾은 값**이 근거다\n`);
for (const c of res.claims) {
  console.log(`  ${icon[c.verdict] || '·'} ${pad(c.item, W)}  우리: ${c.our_value}`);
  if (c.verdict !== '일치') console.log(`     ${' '.repeat(W)}   검증자: ${c.found_value}  [${c.grade}] ${c.source_url}`);
  if (c.note) console.log(`     ${' '.repeat(W)}   ${c.note}`);
}
if (res.missing_conditions?.length) {
  console.log(`\n  🔴 빠진 조건 ${res.missing_conditions.length}개 — 이게 이 검증의 값어치다`);
  for (const x of res.missing_conditions) console.log(`     · ${x}`);
}
if (res.risky_phrasings?.length) {
  console.log(`\n  ⚠️ 조건을 빼면 오해를 부르는 표현 ${res.risky_phrasings.length}개`);
  for (const x of res.risky_phrasings) console.log(`     · ${x}`);
}
const bad = res.claims.filter((c) => c.verdict === '불일치').length;
const unk = res.claims.filter((c) => c.verdict === '확인불가').length;
console.log(`\n  판정: ${res.overall}   (불일치 ${bad} · 확인불가 ${unk} · 일치 ${res.claims.length - bad - unk})`);
console.log(`  기록: ${path.relative(process.cwd(), RESULT)}`);
if (res.overall === '정지') console.log('\n  🔴 게이트 A 를 통과시키지 마라. 누가 맞는지 1차 출처로 확정하고 README 확정 팩트를 고친 뒤 새 패킷으로 다시 검증한다.\n');
else if (res.overall === '보류') console.log('\n  ⚠️ 확인 못 한 항목·빠진 조건이 있다. 대본에서 빼거나 조건을 보강한다. 추측으로 넘기지 마라.\n');
else console.log('');
process.exit(res.overall === '통과' ? 0 : 1);
