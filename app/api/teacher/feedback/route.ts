import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isTeacherEmail } from "@/lib/teacher-auth";
import { getAllSubmissions, upsertTeacherFeedback } from "@/lib/sheets";
import { toUserErrorMessage } from "@/lib/errorMessage";

// 교사가 학생의 제출 건 하나(email+timestamp로 특정)에 피드백을 남긴다. AI가 자동으로
// 매기는 InquiryRecord.comment(글쓰기 총평)와는 별개 필드(teacherFeedback)에 저장된다.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email || !isTeacherEmail(session.user.email)) {
    return NextResponse.json({ error: "교사 계정만 사용할 수 있습니다." }, { status: 403 });
  }

  const { email, timestamp, teacherFeedback } = (await request.json()) || {};
  if (!email || !timestamp || typeof teacherFeedback !== "string") {
    return NextResponse.json(
      { error: "email, timestamp, teacherFeedback가 필요합니다." },
      { status: 400 }
    );
  }

  const rows = await getAllSubmissions();
  const mainRow = rows.find((r) => r.email === email && r.timestamp === timestamp);
  if (!mainRow) {
    return NextResponse.json({ error: "해당 제출 기록을 찾을 수 없습니다." }, { status: 404 });
  }

  try {
    await upsertTeacherFeedback(mainRow, teacherFeedback);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: toUserErrorMessage(err, "teacher/feedback") }, { status: 502 });
  }
}
