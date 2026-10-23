#!/usr/bin/env node
// 학원 광고 검사 (YBMECC 2026-10-20) — 법정 표시·금지 표현·원생 사진 동의를 한 번에 잰다.
//   node pipeline/academy-check.mjs <프로젝트> [단계 2-6]     단계 생략 = 6(가장 엄함)
//
//   지점 사실   brand.json academy 의 상호·등록번호·교습과정·교습비가 원장 확인을 받았나(⑥에서 하드)
//   대본        cuts.json 헤드라인·대사·자막의 선행학습 유발·유치원 명칭·결과 보장(하드) / 최상급·실적·후기·긴급성(경고)
//   사진        README 「## 사진 동의」에 모든 원생 사진이 ✅ 로 있나(사진이 있으면 늘 하드)
//   화면        hyperframes·cards 글자의 같은 표현 + 영상 화면의 상호·등록번호·교습과정(⑤부터 하드)
//   문안        publish.md 인스타·유튜브·카드 본문의 법정 표시(교습비 5항목 포함)와 표현(⑥)
// stage-gate.mjs 가 같은 판정(lib/academy.mjs academyReport)을 단계마다 싣는다 — 이 명령은 고치는 동안 빨리 다시 재려고 둔다.
import {resolveProject} from './lib/project.mjs';
import {academyReport, ACADEMY} from './lib/academy.mjs';

const {dir, name} = resolveProject(process.argv[2], {usage: '사용: node pipeline/academy-check.mjs <프로젝트> [2-6]'});
const stage = process.argv[3] ? Number(process.argv[3]) : 6;
if (!ACADEMY) { console.log('  brand.json 에 academy 블록이 없다 — 학원 광고 검사를 하지 않는다'); process.exit(0); }
const R = academyReport(dir, stage);
console.log(`\n  학원 광고 검사 — ${name} (단계 ${stage})\n`);
const icon = {ok: '✅', soft: '⚠️', hard: '🔴'};
for (const r of R) { console.log(`     ${icon[r.level]} ${r.msg}`); if (r.fix && r.level !== 'ok') console.log(`        → ${r.fix}`); }
const hard = R.filter((r) => r.level === 'hard').length, soft = R.filter((r) => r.level === 'soft').length;
console.log(`\n  ${hard ? `🔴 하드 ${hard}건` : '✅ 하드 없음'} · ⚠️ 경고 ${soft}건\n`);
process.exit(hard ? 1 : 0);
