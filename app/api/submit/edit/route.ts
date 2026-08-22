import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { gradeSubmission } from "@/lib/gradeSubmission";
import { getSubmissionsByEmail, updateSubmissionResult, upsertStudentProfile } from "@/lib/sheets";

// 이미 제출한 메인 질문을 고치는 화면(components/EditQuestionForm.tsx)용 - 같은
// 행(email+timestamp)을 그대로 덮어쓴다. 새 행으로 취급하면 이미 진행 중인 보조질문/
// 종합 글쓰기(InquiryRecord.mainQuestionTimestamp가 이 timestamp를 가리킴)가 전부
// 고아가 되므로, 반드시 같은 timestamp를 유지해야 한다.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const ts = new URL(request.url).searchParams.get("ts");
  if (!ts) {
    return NextResponse.json({ error: "ts가 필요합니다." }, { status: 400 });
  }
  const rows = await getSubmissionsByEmail(session.user.email);
  const row = rows.find((r) => r.timestamp === ts);
  if (!row) {
    return NextResponse.json({ error: "해당 제출을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({
    grade: row.grade,
    ban: row.ban,
    no: row.no,
    name: row.name,
    unit: row.unit,
    question: row.question,
    selfLevel: row.selfLevel,
    textbookLink: row.textbookLink,
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json();
  const {
    timestamp,
    grade = "",
    ban = "",
    no = "",
    name = "",
    unit,
    question,
    selfLevel,
    textbookLink = "",
  } = body || {};

  if (!timestamp || !grade || !unit || !question || !selfLevel || !String(textbookLink).trim()) {
    return NextResponse.json(
      { error: "학년, 단원, 질문, 예상 레벨, 교과서 연결 내용은 필수입니다." },
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
  const rows = await getSubmissionsByEmail(email);
  const existing = rows.find((r) => r.timestamp === timestamp);
  if (!existing) {
    return NextResponse.json({ error: "해당 제출을 찾을 수 없습니다." }, { status: 404 });
  }

  // 여기서 고친 학년/반/번호/이름도 프로필에 그대로 반영한다 - "질문 만들기" 화면의
  // 최초 제출과 이 수정 화면 둘 다 같은 프로필을 갱신하게 맞춘 것.
  await upsertStudentProfile({ email, grade, ban, no, name }).catch(() => {});

  // 채점 결과에 영향을 주는 값(질문/단원/예상 레벨) 중 하나라도 바뀌었으면 옛 채점은
  // 더 이상 유효하지 않으니 다시 채점한다 - 학년/반/번호/이름만 고친 경우는 그대로 둔다.
  const needsRegrade =
    existing.question !== question || existing.unit !== unit || existing.selfLevel !== selfLevel;

  if (!needsRegrade) {
    const ok = await updateSubmissionResult(email, timestamp, {
      grade,
      ban,
      no,
      name,
      unit,
      question,
      selfLevel,
      textbookLink,
    });
    if (!ok) {
      return NextResponse.json({ error: "수정에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, regraded: false });
  }

  try {
    const result = await gradeSubmission(unit, question, selfLevel);
    const ok = await updateSubmissionResult(email, timestamp, {
      grade,
      ban,
      no,
      name,
      unit,
      question,
      selfLevel,
      textbookLink,
      status: "완료",
      aiLevel: result.level,
      levelTrack: result.track,
      levelBand: result.band,
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
    });
    if (!ok) {
      return NextResponse.json({ error: "수정에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, regraded: true, result });
  } catch (err) {
    // 재채점 자체가 실패하면 옛 채점 결과를 그대로 남겨두지 않는다 - 질문은 이미
    // 바뀌었는데 판정만 예전 것이 남아있으면 잘못된 정보가 되므로, 판정 필드를 전부
    // 비워 "채점 대기중"으로 되돌리고 프로필/질문 변경분만 저장한다.
    const message = (err as Error).message;
    await updateSubmissionResult(email, timestamp, {
      grade,
      ban,
      no,
      name,
      unit,
      question,
      selfLevel,
      textbookLink,
      status: `오류: ${message}`,
      aiLevel: "",
      levelTrack: "",
      levelBand: "",
      aiScore: "",
      fact: "",
      causal: "",
      compare: "",
      sentence: "",
      integration: "",
      approval: "",
      mismatch: "",
      feedback: "",
    }).catch(() => {});
    return NextResponse.json(
      { error: `재채점 중 오류가 발생했습니다: ${message}` },
      { status: 502 }
    );
  }
}
