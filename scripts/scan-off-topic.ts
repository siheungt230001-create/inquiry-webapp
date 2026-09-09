// 이미 채점된 메인 질문들을 단원 읽기자료와 다시 대조해서, "단원 확인 필요"로
// 걸러졌어야 하는데 놓친 건(승인/제출완료로 잘못 확정된 것)을 찾는 관리자용 스캔 도구.
// 2026-09-09 함지우 학생 건(최씨무신정권 질문이 III-3 원 간섭기 단원에서 정상 채점된
// 버그)을 계기로 만들었다 - lib/rubric.ts의 [0. 단원 관련성 확인]을 강화한 뒤, 그
// 전에 이미 잘못 통과된 과거 기록이 더 있는지 전체 단원에 걸쳐 훑어보는 용도다.
//
// 실행(기본값 = 보고만, 시트에 아무것도 안 씀):
//   npx tsx --env-file=.env.local scripts/scan-off-topic.ts
//
// 실제로 고칠 때는 위 보고 내용을 사람이 직접 검토해서 진짜 오탐(false positive.
// 예: "원 간섭기" 자체를 다루는 가정형/인과형 질문이 배치 프롬프트에서 과도하게
// 걸리는 경우가 있었다)을 걸러낸 다음, 확정된 (email:timestamp) 목록만 --apply로
// 넘긴다 - 절대 이 스캔 결과를 검토 없이 통째로 --apply하지 않는다:
//   npx tsx --env-file=.env.local scripts/scan-off-topic.ts --apply "이메일:타임스탬프,이메일:타임스탬프"
//
// --apply는 approval이 "승인" 또는 "제출완료(미승인)"인 행에만 동작한다(이미
// "재제출"인 행은 학생이 어차피 다시 써야 하므로 건드릴 필요가 없다).
import { getAllSubmissions, getGroundingTextForUnit, updateSubmissionResult } from "../lib/sheets";
import { callGeminiGeneric } from "../lib/gemini";
import { buildOffTopicResult } from "../lib/rubric";
import { gradingResultToSubmissionFields } from "../lib/gradeSubmission";
import type { SubmissionRow } from "../lib/types";

const BATCH_SIZE = 60;
// 배치 사이 텀 - lib/gemini.ts의 GEMINI_RATE_LIMIT_PER_MINUTE(분당 15회)를 넘기지 않기 위함.
const BATCH_DELAY_MS = 4500;

function buildBatchPrompt(unitTitle: string, readingText: string, items: { i: number; q: string }[]): string {
  const itemsText = items.map((it) => `${it.i}. "${it.q.replace(/\n/g, " ").trim()}"`).join("\n");
  return `[역할]
당신은 중학교 역사 수업에서 학생들이 제출한 탐구 질문들이 아래 [읽기자료]와
실제로 관련이 있는지 감사(audit)하는 역할입니다.

[읽기자료 - 이 단원(${unitTitle})이 다루는 내용]
${readingText}

[판단 기준]
"같은 나라"나 "같은 왕조"처럼 큰 범주만 맞으면 관련 있다고 보지 않는다. 질문의
핵심 소재(인물/사건/정책/기구명)가 [읽기자료] 본문에 실제로 등장하거나, 본문에
등장하는 사건과 시기적·인과적으로 직접 이어지는지 구체적으로 대조한다.
- 같은 나라·왕조라도 [읽기자료]가 다루는 시기·사건과 전혀 다른 별개의
  시기·사건을 묻는 질문은 관련 없음(off_topic=true)으로 판정한다.
- [읽기자료]에 나온 인물·사건·정책을 다른 시대·국가와 "비교"하는 질문,
  자료의 일부만 다루는 질문, 오늘날 관점에서 묻는 질문, [읽기자료]에 실제로
  언급된 사실(예: 특정 사건이 일어났다는 서술)을 근거로 "왜/만약"을 묻는
  질문은 관련 있음(off_topic=false)으로 판정한다.
- 표현이 서툴거나 모호해도 소재 자체가 자료 범위 안이면 관련 있음이다.
- 확신이 서지 않으면 관련 있음(off_topic=false)으로 판정한다(과잉 플래깅 방지).

[학생 질문 목록]
${itemsText}

[출력]
flagged: 위 목록 중 off_topic=true로 판정한 항목만 골라서, 각 항목의 원래
번호(i)와 왜 관련 없다고 판단했는지 15자 이내 짧은 이유(reason)를 배열로
반환한다. 전부 관련 있으면 빈 배열을 반환한다.

요청한 JSON 스키마에 맞춰서만 응답하세요.`;
}

const BATCH_SCHEMA = {
  type: "OBJECT",
  properties: {
    flagged: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          i: { type: "NUMBER" },
          reason: { type: "STRING" },
        },
        required: ["i", "reason"],
      },
    },
  },
  required: ["flagged"],
} as const;

interface FlaggedItem {
  unit: string;
  question: string;
  reason: string;
  rows: SubmissionRow[];
}

async function scan(): Promise<FlaggedItem[]> {
  const subs = await getAllSubmissions();
  const graded = subs.filter((s) => s.approval && s.approval !== "단원 확인 필요" && s.aiScore !== "");
  console.log("graded rows to scan:", graded.length);

  const byUnit = new Map<string, SubmissionRow[]>();
  for (const s of graded) {
    const list = byUnit.get(s.unit) || [];
    list.push(s);
    byUnit.set(s.unit, list);
  }

  const flaggedResults: FlaggedItem[] = [];

  for (const [unit, rows] of byUnit) {
    console.log(`\n=== unit: ${unit} (${rows.length} rows) ===`);
    const readingText = await getGroundingTextForUnit(unit);
    if (!readingText.trim()) {
      console.log("  읽기자료 없음 - 건너뜀");
      continue;
    }

    const uniqueMap = new Map<string, SubmissionRow[]>();
    for (const r of rows) {
      const key = r.question.trim();
      const list = uniqueMap.get(key) || [];
      list.push(r);
      uniqueMap.set(key, list);
    }
    const uniqueQuestions = [...uniqueMap.keys()];
    console.log(`unique questions: ${uniqueQuestions.length}`);

    for (let start = 0; start < uniqueQuestions.length; start += BATCH_SIZE) {
      const batch = uniqueQuestions.slice(start, start + BATCH_SIZE);
      const items = batch.map((q, idx) => ({ i: start + idx, q }));
      const prompt = buildBatchPrompt(unit, readingText, items);
      try {
        const { flagged } = await callGeminiGeneric<{ flagged: { i: number; reason: string }[] }>(
          prompt,
          BATCH_SCHEMA
        );
        console.log(`  batch ${start}-${start + batch.length}: flagged ${flagged.length}`);
        for (const f of flagged) {
          const q = items.find((it) => it.i === f.i)?.q;
          if (!q) continue;
          flaggedResults.push({ unit, question: q, reason: f.reason, rows: uniqueMap.get(q) || [] });
        }
      } catch (e) {
        console.error(`  batch ${start} failed:`, (e as Error).message);
      }
      if (start + BATCH_SIZE < uniqueQuestions.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }
  }

  return flaggedResults;
}

function printReport(flaggedResults: FlaggedItem[]) {
  console.log("\n\n===== FLAGGED (off-topic candidates) =====");
  console.log("total flagged unique questions:", flaggedResults.length);
  for (const f of flaggedResults) {
    console.log("---");
    console.log("unit:", f.unit);
    console.log("question:", f.question);
    console.log("reason:", f.reason);
    for (const r of f.rows) {
      const actionable = r.approval === "승인" || r.approval === "제출완료(미승인)";
      console.log(
        `  ${actionable ? "[ACTIONABLE]" : "[이미 재제출 상태 - 조치 불필요]"} email=${r.email} ts=${r.timestamp} name=${r.name} ban=${r.ban} no=${r.no} aiLevel=${r.aiLevel} aiScore=${r.aiScore} approval=${r.approval}`
      );
    }
  }
  console.log(`\n사람이 위 [ACTIONABLE] 행 중 진짜 단원 무관 질문만 골라서(오탐 있을 수 있음),`);
  console.log(`--apply "이메일:타임스탬프,이메일:타임스탬프" 로 다시 실행하세요.`);
}

async function apply(pairs: { email: string; timestamp: string }[]) {
  const subs = await getAllSubmissions();
  for (const { email, timestamp } of pairs) {
    const row = subs.find((s) => s.email === email && s.timestamp === timestamp);
    if (!row) {
      console.log(`SKIP: 행을 찾을 수 없음 (${email} / ${timestamp})`);
      continue;
    }
    if (row.approval !== "승인" && row.approval !== "제출완료(미승인)") {
      console.log(`SKIP: approval이 "${row.approval}"이라 조치 불필요 (${email} / ${timestamp})`);
      continue;
    }
    console.log(`\n--- ${row.name} (${email} / ${timestamp}) ---`);
    console.log("BEFORE: question=", row.question.trim(), "approval=", row.approval, "aiScore=", row.aiScore);
    const patch = gradingResultToSubmissionFields(buildOffTopicResult(row.unit));
    const ok = await updateSubmissionResult(email, timestamp, patch);
    console.log("update ok:", ok);
  }
}

function parseApplyArg(raw: string): { email: string; timestamp: string }[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf(":");
      if (idx === -1) throw new Error(`--apply 형식이 잘못됨(이메일:타임스탬프): "${pair}"`);
      return { email: pair.slice(0, idx), timestamp: pair.slice(idx + 1) };
    });
}

async function main() {
  const applyIdx = process.argv.indexOf("--apply");
  if (applyIdx !== -1) {
    const raw = process.argv[applyIdx + 1];
    if (!raw) throw new Error('--apply 뒤에 "이메일:타임스탬프,..." 목록이 필요합니다.');
    await apply(parseApplyArg(raw));
    return;
  }

  const flagged = await scan();
  printReport(flagged);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
