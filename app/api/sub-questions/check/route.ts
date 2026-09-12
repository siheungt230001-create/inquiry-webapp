import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { callGeminiGeneric } from "@/lib/gemini";
import { getGroundingTextForUnit } from "@/lib/sheets";
import {
  buildSubQuestionCheckPrompt,
  sanitizeProperNounFeedback,
  ensureNonEmpty,
  SUB_QUESTION_COMMENT_FALLBACK,
  DESIGN_FEEDBACK_FALLBACK,
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
    const { results, designFeedback, properNounFeedback, typeFitFeedback } = await callGeminiGeneric<{
      results: SubQuestionCheckResult[];
      designFeedback: string;
      properNounFeedback: string;
      typeFitFeedback: string;
    }>(prompt, SUB_QUESTION_RESPONSE_SCHEMA);
    return NextResponse.json({
      results: results.map((r) => ({
        ...r,
        comment: ensureNonEmpty(r.comment, SUB_QUESTION_COMMENT_FALLBACK),
      })),
      designFeedback: ensureNonEmpty(designFeedback, DESIGN_FEEDBACK_FALLBACK),
      properNounFeedback: sanitizeProperNounFeedback(properNounFeedback),
      // typeFitFeedback은 properNounFeedback과 같은 성격(문제 없으면 빈 문자열이
      // 정상)이라 comment/designFeedback과 달리 빈 값을 강제로 채우지 않는다.
      typeFitFeedback: typeFitFeedback || "",
    });
  } catch (err) {
    return NextResponse.json(
      { error: toUserErrorMessage(err, "sub-questions/check") },
      { status: 502 }
    );
  }
}
