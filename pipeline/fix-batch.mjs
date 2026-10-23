#!/usr/bin/env node
// fix-batch.mjs — 수정 요청을 **모아서 한 번에** 처리하도록 코드가 강제한다. (2026-09-13 사용자 지시로 신설)
//
//   > "수정할때 하나하나 하고 확인하지 말고 할때마다 전체 집계후 한번에 하도록 강제해
//   >  이건 필수 요건이야"
//
// 왜 도구인가: 이 규칙은 2026-09-12 에 이미 `stages/4-designer.md` 에 **글로** 들어갔다.
//   그런데 글은 건너뛰어도 아무도 모른다 — 이 저장소가 게이트를 코드로 옮긴 이유와 같다
//   (CLAUDE.md 「절차를 글로만 적어 두면 건너뛰어도 아무도 모른다」).
//   그래서 **장부**를 만든다. 장부가 열려 있으면 렌더도, 검수 시트 재발행도, 단계 게이트도 막힌다.
//   한 건 고치고 사용자에게 확인받는 흐름이 **물리적으로 불가능**해진다.
//
// 사용:
//   node pipeline/fix-batch.mjs open  <p> "3-2 새우 위치" "1-4 타이포 깨짐" …   # 지적 전부를 한 번에
//   node pipeline/fix-batch.mjs open  <p> --stdin                              # 줄 단위로 받는다
//   node pipeline/fix-batch.mjs type  <p> <번호> "<유형>" <전수검사 적중수>       # 🔴 항목마다 필수
//   node pipeline/fix-batch.mjs status <p>
//   node pipeline/fix-batch.mjs close <p>          # 전부 유형화됐을 때만 닫힌다
//   node pipeline/fix-batch.mjs abort <p> "<사유>"  # 사용자가 취소했을 때만
//   node pipeline/fix-batch.mjs guard <p>          # 다른 도구가 부른다 — 열려 있으면 exit 3
//
// 장부 위치: output/<p>/review/fix-batch.json  (재생성 가능 구역. 프로젝트 트리를 더럽히지 않는다)

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveProject } from "./lib/project.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const [cmd, projArg, ...rest] = process.argv.slice(2);

const USAGE = `사용: node pipeline/fix-batch.mjs <open|type|status|close|abort|guard> <프로젝트> [...]`;
if (!cmd || !projArg) { console.error(USAGE); process.exit(1); }

const { dir, name } = resolveProject(projArg);
const DIR = join(dir, "output", "review");
const LEDGER = join(DIR, "fix-batch.json");

const load = () => (existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : { project: name, rounds: [] });
const save = (d) => { mkdirSync(DIR, { recursive: true }); writeFileSync(LEDGER, JSON.stringify(d, null, 2) + "\n"); };
const openRound = (d) => d.rounds.find((r) => r.state === "open") || null;
const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");

/* ─────────────────────────────────────────────────────────────────────────
   🔴 왕복 상한 — 3회째는 「내가 못 고친다」가 아니라 「검사기가 그 유형을 못 본다」는 뜻이다.
      00009 에서 사용자가 같은 종류를 세 번 짚었고, 세 번째에야 전수 검사를 돌려
      같은 결함이 여러 컷에 있다는 걸 알았다. 그 전까지는 짚힌 한 칸만 고쳤다.
   ───────────────────────────────────────────────────────────────────────── */
const ROUND_LIMIT = 2;

function fmtItem(it, i) {
  const mark = it.type ? "✅" : "🔴";
  const tail = it.type ? `  → 유형 「${it.type}」 · 전수 ${it.sweep}건` : "  → 🔴 유형 미기재 (전수 검사 안 했다)";
  return `     ${mark} ${String(i + 1).padStart(2)}. ${it.text}\n${tail}`;
}

switch (cmd) {
  /* ── open ─────────────────────────────────────────────────────────── */
  case "open": {
    const d = load();
    if (openRound(d)) {
      console.error(`🔴 이미 열린 묶음이 있다 (${openRound(d).items.length}건). 먼저 닫아라 — close`);
      console.error(`   🔴 **여기서 새 묶음을 열지 마라.** 지적이 추가로 왔으면 열린 묶음에 합쳐야 한다`);
      console.error(`      (지금 판에서는 abort 하고 전부 다시 open 하는 것이 맞다).`);
      process.exit(1);
    }
    let items = rest.filter((a) => a !== "--stdin");
    if (rest.includes("--stdin")) {
      const raw = readFileSync(0, "utf8");
      items = raw.split("\n").map((l) => l.replace(/^\s*[-*\d.)\]]+\s*/, "").trim()).filter(Boolean);
    }
    if (!items.length) { console.error("🔴 지적 항목이 없다. 사용자 메시지의 지적을 **전부** 넣어라"); process.exit(1); }

    const round = { n: d.rounds.length + 1, state: "open", opened: now(),
                    items: items.map((t) => ({ text: t, type: null, sweep: null })) };
    d.rounds.push(round);
    save(d);

    console.log(`\n  ══ 수정 묶음 ${round.n} 열림 — ${name} · ${items.length}건 ══\n`);
    round.items.forEach((it, i) => console.log(`     ${String(i + 1).padStart(2)}. ${it.text}`));
    console.log(`\n  🔴 닫을 때까지 **렌더·검수 시트 재발행·단계 게이트가 전부 막힌다.**`);
    console.log(`     한 건 고치고 사용자에게 확인받는 흐름을 코드가 차단한다.\n`);
    console.log(`  다음: 항목마다 **유형으로 일반화**하고 전수 검사한 뒤 기록해라`);
    console.log(`     node pipeline/fix-batch.mjs type ${projArg} 1 "글자 ✕ 도형" 4`);
    if (round.n > ROUND_LIMIT) {
      console.log(`\n  ⚠️  왕복 ${round.n}회째다 (상한 ${ROUND_LIMIT}). 3회째는 보통 **검사기가 그 유형을 못 보고 있다**는 뜻이다.`);
      console.log(`     고치기 전에 「왜 layout-scan 이 이걸 못 잡았나」를 먼저 사용자에게 보고해라.`);
    }
    break;
  }

  /* ── type ─────────────────────────────────────────────────────────── */
  case "type": {
    const d = load(); const r = openRound(d);
    if (!r) { console.error("🔴 열린 묶음이 없다 — 먼저 open"); process.exit(1); }
    const [nStr, type, sweepStr] = rest;
    const i = Number(nStr) - 1;
    if (!Number.isInteger(i) || i < 0 || i >= r.items.length) { console.error(`🔴 항목 번호가 1~${r.items.length} 범위를 벗어났다`); process.exit(1); }
    if (!type) { console.error('🔴 유형을 적어라 — 「이 한 칸」이 아니라 「이 종류」다. 예: "글자 ✕ 도형"'); process.exit(1); }
    const sweep = Number(sweepStr);
    if (!Number.isFinite(sweep) || sweep < 1) {
      console.error("🔴 전수 검사 적중 수를 적어라 (최소 1 — 지적된 그 건). layout-scan 이나 grep 으로 **그 유형 전체**를 센 값이다");
      console.error("   0 이 나왔다면 유형을 잘못 잡은 것이다 — 지적된 건 자신도 안 잡혔다는 뜻이다");
      process.exit(1);
    }
    r.items[i].type = type; r.items[i].sweep = sweep;
    save(d);
    console.log(`  ✅ ${i + 1}. ${r.items[i].text}  → 「${type}」 전수 ${sweep}건`);
    if (sweep > 1) console.log(`     ⭐ 지적은 1건인데 같은 종류가 ${sweep}건이다. **${sweep}건 전부** 고쳐라 — 이게 이 도구의 존재 이유다`);
    const left = r.items.filter((x) => !x.type).length;
    console.log(left ? `  남은 항목 ${left}건` : `  ✅ 전부 유형화됐다 — 고친 뒤 close`);
    break;
  }

  /* ── status ───────────────────────────────────────────────────────── */
  case "status": {
    const d = load(); const r = openRound(d);
    console.log(`\n  ══ 수정 묶음 — ${name} ══`);
    if (!d.rounds.length) { console.log(`     장부가 비었다 (지금까지 수정 묶음 0회)\n`); break; }
    for (const x of d.rounds) console.log(`     묶음 ${x.n}  ${x.state === "open" ? "🔴 열림" : "✅ 닫힘"}  ${x.items.length}건  ${x.opened}${x.closed ? ` → ${x.closed}` : ""}`);
    if (r) {
      console.log(`\n  열린 묶음 ${r.n}:`);
      r.items.forEach((it, i) => console.log(fmtItem(it, i)));
      console.log(`\n  🔴 렌더·시트 재발행·단계 게이트가 막혀 있다.`);
    }
    console.log();
    break;
  }

  /* ── close ────────────────────────────────────────────────────────── */
  case "close": {
    const d = load(); const r = openRound(d);
    if (!r) { console.error("🔴 열린 묶음이 없다"); process.exit(1); }
    const bad = r.items.map((it, i) => [it, i]).filter(([it]) => !it.type);
    if (bad.length) {
      console.error(`\n🔴 유형을 안 적은 항목이 ${bad.length}건 있다 — 닫을 수 없다.\n`);
      bad.forEach(([it, i]) => console.error(`     ${i + 1}. ${it.text}`));
      console.error(`\n   「이 한 칸」이 아니라 「이 종류가 몇 컷에 있나」를 세라. 한 칸만 고치면`);
      console.error(`   사용자가 다음 한 칸을 또 찾아야 한다 — 그게 사용자를 지치게 한 실제 원인이다.\n`);
      process.exit(1);
    }
    r.state = "closed"; r.closed = now();
    save(d);
    /* 🔴 **묶음을 제대로 닫으면 렌더 예산을 돌려준다** (2026-09-13).
       상한(3회)을 그냥 영구 누적으로 두면 오래 가는 프로젝트가 막히고, 그러면 사람은
       `rm .render-count` 로 우회하는 것을 배운다 — 우회를 가르치는 장치는 장치가 아니다.
       그래서 **모아서 고친 사람에게는 예산이 복구**되고, 묶음 없이 한 건씩 찔러 보는
       굽기만 예산을 깎는다. 규율이 곧 이득이 되게 한다. */
    const counter = join(dir, "output", ".render-count");
    if (existsSync(counter)) { rmSync(counter); console.log(`  ↻ 렌더 예산 복구 (묶음으로 고쳤다)`); }
    const total = r.items.reduce((a, x) => a + x.sweep, 0);
    console.log(`\n  ✅ 수정 묶음 ${r.n} 닫힘 — 지적 ${r.items.length}건 → 실제 수정 대상 ${total}건`);
    if (total > r.items.length) console.log(`     ⭐ 전수 검사로 ${total - r.items.length}건을 더 찾았다. 그만큼 왕복이 줄었다`);
    console.log(`  렌더·시트 재발행이 풀렸다. 결과는 **한 메시지로** 회신해라.\n`);
    break;
  }

  /* ── abort ────────────────────────────────────────────────────────── */
  case "abort": {
    const d = load(); const r = openRound(d);
    if (!r) { console.error("🔴 열린 묶음이 없다"); process.exit(1); }
    if (!rest[0]) { console.error("🔴 사유를 적어라 — abort 는 사용자가 취소했을 때만 쓴다"); process.exit(1); }
    r.state = "aborted"; r.closed = now(); r.abortReason = rest[0];
    save(d);
    console.log(`  ⚠️  수정 묶음 ${r.n} 취소 — ${rest[0]}`);
    break;
  }

  /* ── guard ── 다른 도구가 부른다. 열려 있으면 exit 3 ─────────────────── */
  case "guard": {
    const r = openRound(load());
    if (!r) process.exit(0);
    const left = r.items.filter((x) => !x.type).length;
    console.error(`\n  🔴 수정 묶음 ${r.n} 이 열려 있다 — ${r.items.length}건 중 ${left}건이 아직 유형 미기재.`);
    console.error(`     **한 건씩 고치고 확인받는 흐름을 막는 장치다** (2026-09-13 사용자 필수 요건).`);
    console.error(`     지적 전부를 유형별로 전수 수정한 뒤 닫아라:`);
    console.error(`        node pipeline/fix-batch.mjs status ${projArg}`);
    console.error(`        node pipeline/fix-batch.mjs close  ${projArg}\n`);
    process.exit(3);
  }

  default:
    console.error(USAGE); process.exit(1);
}
