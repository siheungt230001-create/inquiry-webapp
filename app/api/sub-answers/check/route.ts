import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { callGeminiGeneric } from "@/lib/gemini";
import { getGroundingTextForUnit } from "@/lib/sheets";
import {
  buildSubAnswerCheckPrompt,
  SUB_ANSWER_RESPONSE_SCHEMA,
  type SubAnswerCheckResult,
} from "@/lib/subQuestionFlow";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json();
  const { unit, mainQuestion, items } = body || {};

  if (!unit || !mainQuestion || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "단원, 메인 질문과 보조질문·답변 목록이 필요합니다." },
      { status: 400 }
    );
  }

  try {
    const groundingText = await getGroundingTextForUnit(unit);
    const prompt = buildSubAnswerCheckPrompt(groundingText, mainQuestion, items);
    const { results, answerSufficiencyFeedback } = await callGeminiGeneric<{
      results: SubAnswerCheckResult[];
      answerSufficiencyFeedback: string;
    }>(prompt, SUB_ANSWER_RESPONSE_SCHEMA);
    return NextResponse.json({ results, answerSufficiencyFeedback });
  } catch (err) {
    const message = (err as Error).message;
    return NextResponse.json(
      { error: `코멘트를 받아오는 중 오류가 발생했습니다: ${message}` },
      { status: 502 }
    );
  }
}
