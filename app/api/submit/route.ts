import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildPrompt } from "@/lib/rubric";
import { callGemini } from "@/lib/gemini";
import {
  getGroundingTextForUnit,
  appendSubmission,
  checkAbuseFlag,
} from "@/lib/sheets";
import type { SubmissionRow } from "@/lib/types";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json();
  const {
    ban = "",
    no = "",
    name = "",
    unit,
    round = "",
    question,
    selfLevel,
    textbookLink = "",
    doubt = "",
  } = body || {};

  if (!unit || !question || !selfLevel || !String(textbookLink).trim()) {
    return NextResponse.json(
      { error: "단원, 질문, 예상 레벨, 교과서 연결 내용은 필수입니다." },
      { status: 400 }
    );
  }
  if (String(question).trim().length < 5) {
    return NextResponse.json(
      { error: "질문을 조금 더 구체적으로 적어주세요." },
      { status: 400 }
    );
  }

  const email = session.user.email;
  const timestamp = new Date().toISOString();

  const abuseFlag = await checkAbuseFlag(email, unit);
  if (abuseFlag) {
    return NextResponse.json(
      { error: `같은 단원에 너무 빨리 다시 제출했어요. 잠시 후 다시 시도해 주세요. (${abuseFlag})` },
      { status: 429 }
    );
  }

  let row: SubmissionRow;

  try {
    const groundingText = await getGroundingTextForUnit(unit);
    const prompt = buildPrompt(unit, groundingText, question, selfLevel);
    const result = await callGemini(prompt);

    row = {
      timestamp,
      email,
      ban,
      no,
      name: name || session.user.name || "",
      unit,
      round,
      question,
      selfLevel,
      textbookLink,
      doubt,
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
      abuseFlag: "",
    };

    await appendSubmission(row);
    return NextResponse.json({ result });
  } catch (err) {
    // 채점 실패해도 제출 자체는 기록해서 나중에 재처리할 수 있게 남겨둡니다.
    const message = (err as Error).message;
    row = {
      timestamp,
      email,
      ban,
      no,
      name: name || session.user.name || "",
      unit,
      round,
      question,
      selfLevel,
      textbookLink,
      doubt,
      status: `오류: ${message}`,
      aiLevel: "",
      aiScore: "",
      fact: "",
      causal: "",
      compare: "",
      sentence: "",
      integration: "",
      approval: "",
      mismatch: "",
      feedback: "",
      processedAt: "",
      abuseFlag: "",
    };
    await appendSubmission(row).catch(() => {});
    return NextResponse.json(
      { error: `채점 중 오류가 발생했습니다: ${message}` },
      { status: 502 }
    );
  }
}
