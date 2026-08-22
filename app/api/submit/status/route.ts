import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSubmissionsByEmail } from "@/lib/sheets";
import type { GradingResult } from "@/lib/types";

// 큐(app/api/process-submit)가 뒤에서 채점을 마칠 때까지 화면이 몇 초마다 물어보는
// 폴링용 엔드포인트. QStash 미설정(폴백 경로)일 때는 애초에 즉시 결과가 와서 이걸
// 쓸 일이 없지만, 큐 모드에서 이 라우트가 "대기중/완료/오류" 상태를 알려준다.
//
// ts를 안 주면 "이 학생의 가장 최근 제출"을 찾는다 - sessionStorage가 없는 상태로
// (탭을 닫았다 열거나 다른 기기로) /submit 페이지에 들어왔을 때, 아직 채점 대기
// 중인 제출이 있으면 폼을 다시 채워서 이어볼 수 있게 하기 위함. 단, 이미 채점이
// 끝난 오래된 제출까지 매번 다시 띄우면 "새 질문 제출하려 왔는데 지난 질문이
// 떠 있다"가 되므로, ts 없는 조회는 "대기중"일 때만 의미 있는 응답을 준다.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const ts = new URL(request.url).searchParams.get("ts");
  const rows = await getSubmissionsByEmail(session.user.email);
  const row = ts ? rows.find((r) => r.timestamp === ts) : rows[0];

  if (!row) {
    if (!ts) return NextResponse.json({ status: "없음" });
    return NextResponse.json({ error: "해당 제출을 찾을 수 없습니다." }, { status: 404 });
  }

  if (row.status === "대기중") {
    return NextResponse.json({
      status: "대기중",
      timestamp: row.timestamp,
      question: row.question,
      unit: row.unit,
      selfLevel: row.selfLevel,
      textbookLink: row.textbookLink,
    });
  }

  // ts 없이 조회했는데 이미 끝난 제출이면 "복구할 대기중 건 없음"으로 취급 - 오래된
  // 완료 결과를 새 제출 화면에 불쑥 띄우지 않는다.
  if (!ts) {
    return NextResponse.json({ status: "없음" });
  }

  if (row.status?.startsWith("오류")) {
    return NextResponse.json({ status: "오류", error: row.status });
  }

  const result: GradingResult = {
    level: row.aiLevel,
    track: row.levelTrack,
    band: row.levelBand,
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
