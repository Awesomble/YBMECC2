#!/usr/bin/env node
// PreToolUse(Agent|Task) 훅 — video-* 역할 에이전트 호출에 model·effort 인자를 막는다.
// 모델·추론 깊이는 .claude/agents/video-*.md 정의 파일이 정본이다(docs/15-cost-cuts.md 「서브에이전트 모델」).
// 호출 인자는 정의보다 우선해 조용히 바뀐다 — 2026-10-03 ABMEN 00049·00050에서 model=sonnet 14회로 Opus 정의가 강등됐다.
let raw = '';
process.stdin.on('data', d => raw += d).on('end', () => {
  let input;
  try { input = JSON.parse(raw); } catch { process.exit(0); }
  const t = input.tool_input ?? {};
  const type = String(t.subagent_type ?? '');
  const set = ['model', 'effort'].filter(k => t[k] !== undefined && t[k] !== null && t[k] !== '');
  if (!/^video-/.test(type) || !set.length) process.exit(0);
  process.stderr.write(`${type} 호출에 ${set.join('·')} 인자를 넘기지 마라 — 정의 파일 .claude/agents/${type}.md의 값이 정본이다(docs/15 「서브에이전트 모델」). 인자를 빼고 다시 호출한다.\n`);
  process.exit(2);
});
