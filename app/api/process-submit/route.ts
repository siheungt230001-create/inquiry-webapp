import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { gradeSubmission } from "@/lib/gradeSubmission";
import { updateSubmissionResult } from "@/lib/sheets";

// 브라우저가 아니라 QStash가 서버 대 서버로 호출하는 엔드포인트다 - 로그인 세션이
// 없으므로 auth() 대신 QStash 서명을 검증해서 진짜 QStash가 보낸 요청인지 확인한다
// (안 그러면 아무나 이 주소를 두드려서 공짜로 Gemini를 호출시킬 수 있다).
export async function POST(request: Request) {
  const signature = request.headers.get("upstash-signature");
  const bodyText = await request.text();

  if (!signature || !process.env.QSTASH_CURRENT_SIGNING_KEY) {
    return NextResponse.json({ error: "서명이 없습니다." }, { status: 401 });
  }

  const receiver = new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || "",
  });

  let valid = false;
  try {
    valid = await receiver.verify({ signature, body: bodyText });
  } catch {
    valid = false;
  }
  if (!valid) {
    return NextResponse.json({ error: "서명 검증 실패." }, { status: 401 });
  }

  const { email, timestamp, unit, question, selfLevel } = JSON.parse(bodyText);

  try {
    const result = await gradeSubmission(unit, question, selfLevel);
    await updateSubmissionResult(email, timestamp, {
      status: "완료",
      aiLevel: result.level,
      aiScore: result.score,
      fact: result.criteria_scores.fact_accuracy,
      causal: result.criteria_scores.causal_depth,
      compare: result.criteria_scores.comparison_clarity,
      sentence: result.criteria_scores.sentence_clarity,
      integration: result.criteria_scores.integration_depth,
      approval: result.approval,
      mismatch: result.self_assessment_mismatch || "",
      feedback: result.feedback_text,
      processedAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = (err as Error).message;
    await updateSubmissionResult(email, timestamp, { status: `오류: ${message}` }).catch(() => {});
    // 200이 아니면 QStash가 자체 재시도 정책으로 다시 호출해준다 - 일부러 실패로 응답한다.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
