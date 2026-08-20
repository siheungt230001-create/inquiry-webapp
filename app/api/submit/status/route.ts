import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSubmissionsByEmail } from "@/lib/sheets";
import type { GradingResult } from "@/lib/types";

// 큐(app/api/process-submit)가 뒤에서 채점을 마칠 때까지 화면이 몇 초마다 물어보는
// 폴링용 엔드포인트. QStash 미설정(폴백 경로)일 때는 애초에 즉시 결과가 와서 이걸
// 쓸 일이 없지만, 큐 모드에서 이 라우트가 "대기중/완료/오류" 상태를 알려준다.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const ts = new URL(request.url).searchParams.get("ts");
  if (!ts) {
    return NextResponse.json({ error: "ts가 필요합니다." }, { status: 400 });
  }

  const rows = await getSubmissionsByEmail(session.user.email);
  const row = rows.find((r) => r.timestamp === ts);
  if (!row) {
    return NextResponse.json({ error: "해당 제출을 찾을 수 없습니다." }, { status: 404 });
  }

  if (row.status === "대기중") {
    return NextResponse.json({ status: "대기중" });
  }
  if (row.status?.startsWith("오류")) {
    return NextResponse.json({ status: "오류", error: row.status });
  }

  const result: GradingResult = {
    level: row.aiLevel,
    score: row.aiScore === "" ? 0 : row.aiScore,
    criteria_scores: {
      fact_accuracy: row.fact === "" ? 0 : row.fact,
      causal_depth: row.causal === "" ? 0 : row.causal,
      comparison_clarity: row.compare === "" ? 0 : row.compare,
      sentence_clarity: row.sentence === "" ? 0 : row.sentence,
      integration_depth: row.integration === "" ? 0 : row.integration,
    },
    approval: row.approval as GradingResult["approval"],
    self_assessment_mismatch: row.mismatch,
    feedback_text: row.feedback,
  };
  return NextResponse.json({ status: "완료", result });
}
