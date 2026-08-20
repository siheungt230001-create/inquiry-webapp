import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { callGeminiGeneric } from "@/lib/gemini";
import {
  buildSubQuestionCheckPrompt,
  SUB_QUESTION_RESPONSE_SCHEMA,
  type SubQuestionCheckResult,
} from "@/lib/subQuestionFlow";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json();
  const { mainQuestion, items } = body || {};

  if (!mainQuestion || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "메인 질문과 보조질문 목록이 필요합니다." },
      { status: 400 }
    );
  }

  try {
    const prompt = buildSubQuestionCheckPrompt(mainQuestion, items);
    const { results } = await callGeminiGeneric<{ results: SubQuestionCheckResult[] }>(
      prompt,
      SUB_QUESTION_RESPONSE_SCHEMA
    );
    return NextResponse.json({ results });
  } catch (err) {
    const message = (err as Error).message;
    return NextResponse.json(
      { error: `코멘트를 받아오는 중 오류가 발생했습니다: ${message}` },
      { status: 502 }
    );
  }
}
