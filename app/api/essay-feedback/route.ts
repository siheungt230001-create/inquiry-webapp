import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { callGeminiGeneric } from "@/lib/gemini";
import {
  buildEssayFeedbackPrompt,
  ESSAY_RESPONSE_SCHEMA,
  computeEssayTotal,
  type EssayFeedbackResult,
} from "@/lib/subQuestionFlow";
import { hashEssayInputs, rememberEssayFeedback } from "@/lib/essayFeedbackCache";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json();
  const { mainQuestionTimestamp, mainQuestion, subQuestions, intro, body: bodyText, conclusion } = body || {};

  if (!mainQuestion) {
    return NextResponse.json({ error: "메인 질문이 필요합니다." }, { status: 400 });
  }

  const subQuestionsArr = Array.isArray(subQuestions) ? subQuestions : [];
  try {
    const prompt = buildEssayFeedbackPrompt(
      mainQuestion,
      subQuestionsArr,
      intro || "",
      bodyText || "",
      conclusion || ""
    );
    const result = await callGeminiGeneric<EssayFeedbackResult>(prompt, ESSAY_RESPONSE_SCHEMA);
    // 제출 시점에 글이 하나도 안 바뀌었으면 이 결과를 그대로 재사용한다 (app/api/inquiry-writing
    // 참고) - mainQuestionTimestamp가 없으면(옛 클라이언트) 그냥 캐시를 건너뛴다.
    if (mainQuestionTimestamp) {
      const hash = hashEssayInputs(mainQuestion, subQuestionsArr, intro || "", bodyText || "", conclusion || "");
      rememberEssayFeedback(`${session.user.email}:${mainQuestionTimestamp}`, hash, result);
    }
    return NextResponse.json({ ...result, totalScore: computeEssayTotal(result) });
  } catch (err) {
    const message = (err as Error).message;
    return NextResponse.json(
      { error: `피드백을 받아오는 중 오류가 발생했습니다: ${message}` },
      { status: 502 }
    );
  }
}
