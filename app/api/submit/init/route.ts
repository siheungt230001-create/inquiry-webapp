import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSubmitInitData } from "@/lib/sheets";
import { toUserErrorMessage } from "@/lib/errorMessage";

// /submit 페이지 마운트 시 필요한 단원 목록 + 프로필 + 채점 대기중 제출 여부를 한 번에
// 내려준다 - 원래 /api/units, /api/profile, /api/submit/status 세 요청으로 나뉘어 있던 것을
// 합쳐서, 학생 여러 명이 동시에 이 페이지를 열 때 Google Sheets 읽기 호출 수가 3배로
// 불어나지 않게 한다.
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const { units, profile, pendingSubmission } = await getSubmitInitData(session.user.email);

    return NextResponse.json({
      units: units.map((u) => u.title),
      profile: profile
        ? { grade: profile.grade, ban: profile.ban, no: profile.no, name: profile.name }
        : null,
      pending: pendingSubmission
        ? {
            status: "대기중" as const,
            timestamp: pendingSubmission.timestamp,
            question: pendingSubmission.question,
            unit: pendingSubmission.unit,
            selfLevel: pendingSubmission.selfLevel,
            textbookLink: pendingSubmission.textbookLink,
          }
        : null,
    });
  } catch (err) {
    return NextResponse.json({ error: toUserErrorMessage(err, "submit/init") }, { status: 502 });
  }
}
