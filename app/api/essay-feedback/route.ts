import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { gradeEssay } from "@/lib/gradeEssay";
import { computeEssayTotal } from "@/lib/subQuestionFlow";
import { getSubmissionsByEmail } from "@/lib/sheets";
import { hashEssayInputs, rememberEssayFeedback } from "@/lib/essayFeedbackCache";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json();
  const { mainQuestionTimestamp, mainQuestion, subQuestions, intro, body: bodyText, conclusion } = body || {};

  if (!mainQuestion || !mainQuestionTimestamp) {
    return NextResponse.json({ error: "메인 질문 정보가 필요합니다." }, { status: 400 });
  }

  // unit은 클라이언트를 신뢰하지 않고 원본 채점 기록에서 가져온다(app/api/inquiry-writing과
  // 같은 패턴) - 단원 관련성 판정에 쓸 읽기자료를 정확히 찾아야 해서 필요하다.
  const rows = await getSubmissionsByEmail(session.user.email);
  const mainRow = rows.find((r) => r.timestamp === mainQuestionTimestamp);
  if (!mainRow) {
    return NextResponse.json(
      { error: "해당 메인 질문 제출 기록을 찾을 수 없습니다." },
      { status: 400 }
    );
  }

  const subQuestionsArr = Array.isArray(subQuestions) ? subQuestions : [];
  try {
    const result = await gradeEssay(
      mainRow.unit,
      mainQuestion,
      subQuestionsArr,
      intro || "",
      bodyText || "",
      conclusion || ""
    );
    // 제출 시점에 글이 하나도 안 바뀌었으면 이 결과를 그대로 재사용한다 (app/api/inquiry-writing 참고).
    const hash = hashEssayInputs(mainQuestion, subQuestionsArr, intro || "", bodyText || "", conclusion || "");
    rememberEssayFeedback(`${session.user.email}:${mainQuestionTimestamp}`, hash, result);
    return NextResponse.json({ ...result, totalScore: computeEssayTotal(result) });
  } catch (err) {
    const message = (err as Error).message;
    return NextResponse.json(
      { error: `피드백을 받아오는 중 오류가 발생했습니다: ${message}` },
      { status: 502 }
    );
  }
}
