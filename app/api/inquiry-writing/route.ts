import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInquiryRecord, getSubmissionsByEmail, upsertInquiryRecord } from "@/lib/sheets";
import { callGeminiGeneric } from "@/lib/gemini";
import {
  buildEssayFeedbackPrompt,
  ESSAY_RESPONSE_SCHEMA,
  computeEssayTotal,
  type EssayFeedbackResult,
} from "@/lib/subQuestionFlow";
import type { InquiryRecord, InquirySubQuestion } from "@/lib/types";

// 학생이 이 화면(보조질문/보조질문 답/종합 글쓰기)에 다시 들어왔을 때 sessionStorage가
// 비어 있어도(탭을 닫았다 열거나 다른 기기) 서버에 남은 진행 상황을 불러오는 용도.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const ts = new URL(request.url).searchParams.get("ts");
  if (!ts) {
    return NextResponse.json({ error: "ts가 필요합니다." }, { status: 400 });
  }

  const record = await getInquiryRecord(session.user.email, ts);
  if (!record) {
    return NextResponse.json({ record: null });
  }

  let subQuestions: InquirySubQuestion[] = [];
  try {
    subQuestions = JSON.parse(record.subQuestionsJson || "[]");
  } catch {
    subQuestions = [];
  }

  return NextResponse.json({
    record: {
      subQuestions,
      intro: record.intro,
      body: record.body,
      conclusion: record.conclusion,
      introScore: record.introScore,
      bodyScore: record.bodyScore,
      conclusionScore: record.conclusionScore,
      totalScore: record.totalScore,
    },
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json();
  const {
    mainQuestionTimestamp,
    subQuestions,
    intro = "",
    body: bodyText = "",
    conclusion = "",
    draft = false,
  } = body || {};

  if (!mainQuestionTimestamp || !Array.isArray(subQuestions)) {
    return NextResponse.json(
      { error: "mainQuestionTimestamp와 보조질문 목록이 필요합니다." },
      { status: 400 }
    );
  }

  const email = session.user.email;
  // ban/no/name/unit/mainQuestion은 클라이언트를 신뢰하지 않고 원본 채점 기록에서 가져온다
  // (app/api/finalize/route.ts와 같은 패턴).
  const rows = await getSubmissionsByEmail(email);
  const mainRow = rows.find((r) => r.timestamp === mainQuestionTimestamp);
  if (!mainRow) {
    return NextResponse.json(
      { error: "해당 메인 질문 제출 기록을 찾을 수 없습니다." },
      { status: 400 }
    );
  }

  const items = subQuestions as InquirySubQuestion[];

  // 진행중 저장(보조질문 작성/보조질문 답변/종합 글쓰기 초안 전부 여기로 온다) - 아직
  // "제출하기"를 안 눌렀으니 AI 채점 없이 지금까지 쓴 내용만 그대로 남긴다. intro/body/
  // conclusion도 지금 화면에 있는 값을 그대로 저장해야 새로고침·재접속 시 이어 쓸 수 있다
  // (예전엔 여기서 항상 빈 문자열로 덮어써서 종합 글쓰기 초안이 저장 안 됐다).
  // 교사 화면은 totalScore가 ""인 걸로 "진행중"과 "완료"를 구분한다
  // (lib/aggregate.ts의 buildInquiryProgressMap).
  if (draft) {
    const record: InquiryRecord = {
      timestamp: new Date().toISOString(),
      email,
      ban: mainRow.ban,
      no: mainRow.no,
      name: mainRow.name,
      unit: mainRow.unit,
      mainQuestionTimestamp,
      mainQuestion: mainRow.question,
      subQuestionsJson: JSON.stringify(items),
      intro,
      body: bodyText,
      conclusion,
      introScore: "",
      bodyScore: "",
      conclusionScore: "",
      totalScore: "",
    };
    try {
      await upsertInquiryRecord(record);
      return NextResponse.json({ ok: true });
    } catch (err) {
      const message = (err as Error).message;
      return NextResponse.json(
        { error: `저장 중 오류가 발생했습니다: ${message}` },
        { status: 502 }
      );
    }
  }

  // 제출 시점 기준으로 항상 새로 채점한다 - "AI 피드백 받기"를 눌렀을 때와 텍스트가
  // 달라졌을 수 있고, 아예 안 눌렀을 수도 있어서 클라이언트가 보낸 점수는 신뢰하지 않는다.
  const formattedSubQuestions = items.map((s) => (s.answer ? `${s.question} → ${s.answer}` : s.question));

  let scoreResult: EssayFeedbackResult;
  try {
    const scorePrompt = buildEssayFeedbackPrompt(
      mainRow.question,
      formattedSubQuestions,
      intro,
      bodyText,
      conclusion
    );
    scoreResult = await callGeminiGeneric<EssayFeedbackResult>(scorePrompt, ESSAY_RESPONSE_SCHEMA);
  } catch (err) {
    const message = (err as Error).message;
    return NextResponse.json(
      { error: `채점 중 오류가 발생했습니다: ${message}` },
      { status: 502 }
    );
  }

  const record: InquiryRecord = {
    timestamp: new Date().toISOString(),
    email,
    ban: mainRow.ban,
    no: mainRow.no,
    name: mainRow.name,
    unit: mainRow.unit,
    mainQuestionTimestamp,
    mainQuestion: mainRow.question,
    subQuestionsJson: JSON.stringify(items),
    intro,
    body: bodyText,
    conclusion,
    introScore: scoreResult.introScore,
    bodyScore: scoreResult.bodyScore,
    conclusionScore: scoreResult.conclusionScore,
    totalScore: computeEssayTotal(scoreResult),
  };

  try {
    await upsertInquiryRecord(record);
    return NextResponse.json({ ok: true, ...record });
  } catch (err) {
    const message = (err as Error).message;
    return NextResponse.json(
      { error: `제출 중 오류가 발생했습니다: ${message}` },
      { status: 502 }
    );
  }
}
