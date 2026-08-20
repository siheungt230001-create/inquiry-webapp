import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { callGeminiGeneric } from "@/lib/gemini";
import {
  buildEssayFeedbackPrompt,
  ESSAY_RESPONSE_SCHEMA,
  computeEssayTotal,
  type EssayFeedbackResult,
} from "@/lib/subQuestionFlow";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json();
  const { mainQuestion, subQuestions, intro, body: bodyText, conclusion } = body || {};

  if (!mainQuestion) {
    return NextResponse.json({ error: "메인 질문이 필요합니다." }, { status: 400 });
  }

  try {
    const prompt = buildEssayFeedbackPrompt(
      mainQuestion,
      Array.isArray(subQuestions) ? subQuestions : [],
      intro || "",
      bodyText || "",
      conclusion || ""
    );
    const result = await callGeminiGeneric<EssayFeedbackResult>(prompt, ESSAY_RESPONSE_SCHEMA);
    return NextResponse.json({ ...result, totalScore: computeEssayTotal(result) });
  } catch (err) {
    const message = (err as Error).message;
    return NextResponse.json(
      { error: `피드백을 받아오는 중 오류가 발생했습니다: ${message}` },
      { status: 502 }
    );
  }
}
