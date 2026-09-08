import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { callGeminiGeneric } from "@/lib/gemini";
import { getGroundingTextForUnit } from "@/lib/sheets";
import {
  buildSubQuestionCheckPrompt,
  SUB_QUESTION_RESPONSE_SCHEMA,
  type SubQuestionCheckResult,
} from "@/lib/subQuestionFlow";
import { toUserErrorMessage } from "@/lib/errorMessage";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json();
  const { unit, mainQuestion, items } = body || {};

  if (!unit || !mainQuestion || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "단원, 메인 질문과 보조질문 목록이 필요합니다." },
      { status: 400 }
    );
  }

  try {
    const groundingText = await getGroundingTextForUnit(unit);
    const prompt = buildSubQuestionCheckPrompt(groundingText, mainQuestion, items);
    const { results, designFeedback } = await callGeminiGeneric<{
      results: SubQuestionCheckResult[];
      designFeedback: string;
    }>(prompt, SUB_QUESTION_RESPONSE_SCHEMA);
    return NextResponse.json({ results, designFeedback });
  } catch (err) {
    return NextResponse.json(
      { error: toUserErrorMessage(err, "sub-questions/check") },
      { status: 502 }
    );
  }
}
