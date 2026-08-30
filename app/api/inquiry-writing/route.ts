import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAllInquiryRecords, getInquiryRecord, getSubmissionsByEmail, upsertInquiryRecord } from "@/lib/sheets";
import { isTeacherEmail } from "@/lib/teacher-auth";
import { callGeminiGeneric } from "@/lib/gemini";
import {
  buildEssayFeedbackPrompt,
  ESSAY_RESPONSE_SCHEMA,
  computeEssayTotal,
  type EssayFeedbackResult,
} from "@/lib/subQuestionFlow";
import { hashEssayInputs, recallEssayFeedback, rememberEssayFeedback } from "@/lib/essayFeedbackCache";
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

  // 학생 본인 기록은 그대로 조회하고, 교사 계정이면(print 페이지와 같은 규칙) 소유자가
  // 아니어도 조회를 허용한다 - 대시보드에서 학생 ts를 열어 진행 상황을 확인하는 용도.
  const record = isTeacherEmail(session.user.email)
    ? (await getAllInquiryRecords()).find((r) => r.mainQuestionTimestamp === ts) ?? null
    : await getInquiryRecord(session.user.email, ts);
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
      comment: record.comment,
      factScore: record.factScore,
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
  // (lib/aggregate.ts의 inquiryStageOf).
  if (draft) {
    const existing = await getInquiryRecord(email, mainQuestionTimestamp);

    // 이미 채점 완료된(totalScore 있음) 기록이면 draft 저장을 아예 안 한다 - SubAnswersForm/
    // AnswerForm의 자동 저장(debounce)은 화면을 열기만 해도 mount 시 한 번 발동하는데, 두
    // 컴포넌트 다 자기 화면에 없는 필드(SubAnswersForm은 intro/body/conclusion, AnswerForm은
    // subQuestion의 source)를 페이로드에 안 담는다. draft 분기가 행 전체를 덮어쓰는 구조라
    // 안 보낸 필드가 그대로 빈 문자열로 박혀서, 완료된 기록의 텍스트 칸이 통째로 날아가는
    // 사고가 있었다(점수는 f53bb45가 지켰지만 텍스트 칸은 지켜지지 않았음). 완료 후 텍스트를
    // 다시 고치고 싶으면 "제출하기"(draft:false)로 재채점하는 경로만 행을 갱신한다.
    if (existing && existing.totalScore !== "") {
      return NextResponse.json({ ok: true, skipped: true });
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
      introScore: existing?.introScore ?? "",
      bodyScore: existing?.bodyScore ?? "",
      conclusionScore: existing?.conclusionScore ?? "",
      totalScore: existing?.totalScore ?? "",
      comment: existing?.comment ?? "",
      factScore: existing?.factScore ?? "",
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

  // "AI 피드백 받기"(app/api/essay-feedback) 이후 글을 하나도 안 고치고 그대로 제출하면
  // 그때 채점 결과를 그대로 쓴다 - 매번 다시 Gemini를 부르면 중복 호출(비용/분당 호출
  // 한도)일 뿐 아니라 온도(temperature) 때문에 같은 글에 다른 점수가 나올 수도 있었다.
  // 점수는 여전히 클라이언트를 안 믿는다 - 캐시는 서버가 계산한 해시가 일치할 때만 맞고,
  // 캐시에 든 값도 실제로 Gemini가 채점한 결과 그대로다.
  const inputHash = hashEssayInputs(mainRow.question, formattedSubQuestions, intro, bodyText, conclusion);
  const cacheKey = `${email}:${mainQuestionTimestamp}`;
  let scoreResult = recallEssayFeedback(cacheKey, inputHash);
  if (!scoreResult) {
    try {
      const scorePrompt = buildEssayFeedbackPrompt(
        mainRow.question,
        formattedSubQuestions,
        intro,
        bodyText,
        conclusion
      );
      scoreResult = await callGeminiGeneric<EssayFeedbackResult>(scorePrompt, ESSAY_RESPONSE_SCHEMA);
      rememberEssayFeedback(cacheKey, inputHash, scoreResult);
    } catch (err) {
      const message = (err as Error).message;
      return NextResponse.json(
        { error: `채점 중 오류가 발생했습니다: ${message}` },
        { status: 502 }
      );
    }
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
    comment: scoreResult.comment,
    factScore: scoreResult.factScore,
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
