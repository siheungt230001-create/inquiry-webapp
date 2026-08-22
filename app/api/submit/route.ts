import { NextResponse } from "next/server";
import { Client as QStashClient } from "@upstash/qstash";
import { auth } from "@/auth";
import { gradeSubmission } from "@/lib/gradeSubmission";
import { GEMINI_RATE_LIMIT_PER_MINUTE } from "@/lib/gemini";
import { appendSubmission, checkAbuseFlag, getSubmissionsByEmail } from "@/lib/sheets";
import { formatRound } from "@/lib/constants";
import type { SubmissionRow } from "@/lib/types";

// QSTASH_TOKEN이 설정돼 있으면(Upstash QStash 계정 연결됨) 채점을 큐에 태워서
// Gemini 무료 티어 분당 한도를 안 넘기게 한다. 없으면 지금까지처럼 그 자리에서
// 바로 채점한다(lib/sheets.ts의 DEMO_MODE와 같은 자동 폴백 패턴).
const QUEUE_MODE = Boolean(process.env.QSTASH_TOKEN);

function getAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json();
  const {
    grade = "",
    ban = "",
    no = "",
    name = "",
    unit,
    question,
    selfLevel,
    textbookLink = "",
  } = body || {};

  if (!grade || !unit || !question || !selfLevel || !String(textbookLink).trim()) {
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
  const timestamp = new Date().toISOString();
  const studentName = name || session.user.name || "";

  // 같은 이메일의 제출 이력은 여기서 한 번만 읽어서 어뷰징 체크·회차 계산 둘 다에 쓴다
  // (예전엔 두 번 따로 읽어서, 학생이 몰릴 때 시트 읽기 요청이 불필요하게 배로 나갔다).
  const priorSubmissions = await getSubmissionsByEmail(email);
  const abuseFlag = checkAbuseFlag(priorSubmissions, unit);
  if (abuseFlag) {
    return NextResponse.json(
      { error: `같은 단원에 너무 빨리 다시 제출했어요. 잠시 후 다시 시도해 주세요. (${abuseFlag})` },
      { status: 429 }
    );
  }

  const round = formatRound(priorSubmissions.filter((r) => r.unit === unit).length + 1);

  const baseRow: SubmissionRow = {
    timestamp,
    email,
    grade,
    ban,
    no,
    name: studentName,
    unit,
    round,
    question,
    selfLevel,
    textbookLink,
    doubt: "", // 의심스러운 점 입력란 폐지 - Sheets 컬럼 구조 유지를 위해 항상 빈 값만 기록
    status: "완료",
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
    processedAt: "",
    abuseFlag: "",
    teacherComment: "",
  };

  if (QUEUE_MODE) {
    // 채점 전에 "대기중" 행부터 먼저 남긴다 - QStash 워커(app/api/process-submit)가
    // 나중에 email+timestamp로 이 행을 찾아서 실제 결과로 채운다.
    await appendSubmission({ ...baseRow, status: "대기중" });

    const qstash = new QStashClient({ token: process.env.QSTASH_TOKEN! });
    await qstash.publishJSON({
      url: `${getAppUrl()}/api/process-submit`,
      body: { email, timestamp, unit, question, selfLevel },
      flowControl: { key: "gemini-submit", rate: GEMINI_RATE_LIMIT_PER_MINUTE, period: 60 },
    });

    return NextResponse.json({ queued: true, timestamp });
  }

  try {
    const result = await gradeSubmission(unit, question, selfLevel);

    const row: SubmissionRow = {
      ...baseRow,
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
    };

    await appendSubmission(row);
    return NextResponse.json({ result, timestamp });
  } catch (err) {
    // 채점 실패해도 제출 자체는 기록해서 나중에 재처리할 수 있게 남겨둡니다.
    const message = (err as Error).message;
    const row: SubmissionRow = { ...baseRow, status: `오류: ${message}` };
    await appendSubmission(row).catch(() => {});
    return NextResponse.json(
      { error: `채점 중 오류가 발생했습니다: ${message}` },
      { status: 502 }
    );
  }
}
