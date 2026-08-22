import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isTeacherEmail } from "@/lib/teacher-auth";
import { updateTeacherComment } from "@/lib/sheets";

// 교사가 학생 질문 카드(components/TeacherCommentBox.tsx)에 남긴 메모를 저장한다 -
// 교사 계정만 호출 가능, 학생에게는 노출 안 함.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email || !isTeacherEmail(session.user.email)) {
    return NextResponse.json({ error: "교사만 사용할 수 있어요." }, { status: 403 });
  }

  const { email, timestamp, comment } = (await request.json()) || {};
  if (!email || !timestamp) {
    return NextResponse.json({ error: "email과 timestamp가 필요합니다." }, { status: 400 });
  }

  const ok = await updateTeacherComment(email, timestamp, comment ?? "");
  if (!ok) {
    return NextResponse.json({ error: "해당 제출 기록을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
